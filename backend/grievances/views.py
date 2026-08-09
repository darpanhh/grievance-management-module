"""
Views for the Grievance application.

Phase 4: AI Spam Filtering
  - Spam detection integrated into submission pipeline
  - Spam queue management for Campus Admin
  - Appeal mechanism for submitters

Phase 5: Grievance Routing
  - Automatic routing to selected (or submitter's) department after submission
  - Submission pipeline transitions SUBMITTED -> UNDER_REVIEW (when not spam)
"""

import logging
from datetime import date

from django.contrib.auth.hashers import check_password
from django.db.models import Count, OuterRef, Subquery
from django.db.models.functions import TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, Throttled
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

logger = logging.getLogger(__name__)

from accounts.models import Department
from .models import AIAnalysis, Attachment, Category, Grievance, Request, StatusComment, StatusHistory
from .permissions import IsCampusAdmin
from .serializers import (
    AIAnalysisSerializer,
    CategorySerializer,
    DepartmentSerializer,
    GrievanceCreateSerializer,
    GrievanceDetailSerializer,
    GrievanceListSerializer,
    GrievanceTrackSerializer,
    RequestSerializer,
    StatusCommentSerializer,
)
from .services.spam_detector import get_spam_detector
from .services.routing import route_grievance
from .services.escalation_service import (
    send_comment_notification_email,
    send_email_async,
    send_submission_email,
    send_response_email,
    send_resolution_email,
    send_request_notification_email,
)


# ---------------------------------------------------------------------------
# Reference endpoints (public)
# ---------------------------------------------------------------------------


def _with_attachment_count(qs):
    """
    Annotate *qs* with ``_attachment_count`` (number of attachments per
    grievance) via a single subquery, avoiding one COUNT query per row
    in list views.  The list serializer reads the annotation when present.
    """
    attachment_counts = Attachment.objects.filter(
        grievance_id=OuterRef('pk'),
    ).values('grievance_id').annotate(
        count=Count('id'),
    ).values('count')
    return qs.annotate(_attachment_count=Subquery(attachment_counts))


class CategoryListView(generics.ListAPIView):
    """
    GET /api/categories/
    Returns all grievance categories — no authentication required.
    Used to populate dropdowns on the submission form.
    """

    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = (permissions.AllowAny,)
    pagination_class = None


class DepartmentListView(generics.ListAPIView):
    """
    GET /api/departments/
    Returns all departments — no authentication required.
    Used to populate dropdowns on the submission form.
    """

    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = (permissions.AllowAny,)
    pagination_class = None


# ---------------------------------------------------------------------------
# Grievance CRUD
# ---------------------------------------------------------------------------

class GrievanceListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/grievances/      — List grievances (scoped by user role)
    POST /api/grievances/      — Submit a new grievance

    Role-based scoping for list queries:
      - STUDENT/STAFF:     Own grievances only
      - HOD:   Grievances in the user's department
      - CAMPUS_ADMIN: All grievances

    Rate limiting (POST only):
      - Maximum 3 submissions per user per calendar day (UTC)
      - Returns 429 with a clear message when the limit is exceeded
    """

    parser_classes = (JSONParser, MultiPartParser, FormParser)
    permission_classes = (permissions.IsAuthenticated,)
    filter_backends = (SearchFilter, OrderingFilter)
    search_fields = ('title', 'description')
    ordering_fields = ('created_at', 'updated_at', 'title', 'current_status')
    ordering = ('-created_at',)

    def get_serializer_class(self):
        """Return a lightweight serializer for list and a full one for create."""
        if self.request.method == 'GET':
            return GrievanceListSerializer
        return GrievanceCreateSerializer

    def get_queryset(self):
        """
        Return a queryset scoped to the authenticated user's role.

        Uses select_related to minimise queries for category, department,
        and user foreign keys.  Attachment counts are annotated via a
        subquery to avoid N+1 on list views.
        """
        user = self.request.user
        qs = Grievance.objects.select_related(
            'category', 'department', 'user'
        )

        if user.role == 'STUDENT' or user.role == 'STAFF':
            qs = qs.filter(user=user)
        elif user.role == 'HOD':
            qs = qs.filter(department=user.department)
        # CAMPUS_ADMIN sees everything — no additional filter

        return _with_attachment_count(qs).order_by('-created_at')

    def filter_queryset(self, queryset):
        """
        Apply DRF's SearchFilter + OrderingFilter, then apply custom
        filters for *category*, *status*, *date_from*, and *date_to*
        query parameters.
        """
        # Run DRF built-in filters first (search + ordering)
        queryset = super().filter_queryset(queryset)

        # Custom query-param filters
        params = self.request.query_params

        category = params.get('category')
        if category:
            queryset = queryset.filter(category=category)

        status_val = params.get('status')
        if status_val:
            queryset = queryset.filter(current_status=status_val.upper())

        status_group = params.get('status_group')
        if status_group == 'PENDING':
            queryset = queryset.filter(current_status__in=[
                Grievance.Status.SUBMITTED,
            ])
        elif status_group == 'IN_PROGRESS':
            queryset = queryset.filter(current_status=Grievance.Status.UNDER_REVIEW)
        elif status_group == 'RESOLVED':
            queryset = queryset.filter(current_status__in=[
                Grievance.Status.RESOLVED,
                Grievance.Status.CLOSED,
            ])

        date_from = params.get('date_from')
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        date_to = params.get('date_to')
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        return queryset

    def check_throttles(self, request):
        """
        Apply the daily submission limit (max 3 per user) on POST requests.

        The limit is checked here by counting existing records in the
        database for the current calendar day, rather than using DRF's
        cache-based throttle, so it is accurate regardless of cache backend.
        """
        if request.method != 'POST':
            return

        today = timezone.now().date()
        count = Grievance.objects.filter(
            user=request.user,
            created_at__date=today,
        ).count()

        if count >= 3:
            raise Throttled(
                detail=(
                    'You have reached the daily limit of 3 grievances. '
                    'Please try again tomorrow.'
                )
            )

    def perform_create(self, serializer):
        """Attach the authenticated user and save."""
        serializer.save()

    def create(self, request, *args, **kwargs):
        """
        POST handler with custom response that includes the plain-text
        secret code when the grievance was submitted anonymously.

        After creating the grievance, runs automatic spam detection
        (Phase 4).  If the grievance is classified as spam, its status is
        updated to SPAM and the spammer is notified via the response.

        For non-spam grievances the pipeline then continues to automatic
        routing (Phase 5): the grievance is assigned to the submitter's
        selected department (or their own department as a fallback) and
        its status transitions from SUBMITTED to UNDER_REVIEW.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.check_throttles(request)
        grievance = serializer.save()

        # ------------------------------------------------------------------
        # Phase 4 — AI Spam Detection
        # ------------------------------------------------------------------
        detector = get_spam_detector()
        result = detector.analyze(grievance.description)

        # Persist the AI analysis record
        AIAnalysis.objects.create(
            grievance=grievance,
            spam_prediction=result['spam_prediction'],
            confidence_score=result['confidence_score'],
            classification_reason=result['classification_reason'],
        )

        # Phase 5 — Automatic Routing
        route_grievance(
            grievance,
            action_by=request.user,
        )

        # Build response data
        data = GrievanceDetailSerializer(grievance, context={'request': request}).data

        # Spam grievances go to UNDER_REVIEW so HOD can review them
        if result['spam_prediction']:
            grievance.current_status = Grievance.Status.UNDER_REVIEW
            grievance.save(update_fields=['current_status'])
            data = GrievanceDetailSerializer(grievance, context={'request': request}).data
        else:
            send_submission_email(grievance)

        # If anonymous, include the plain-text secret code (only returned once)
        raw_code = getattr(serializer, '_raw_secret_code', None)
        if raw_code:
            data['secret_code'] = raw_code

        return Response(data, status=status.HTTP_201_CREATED)


class GrievanceDetailView(generics.RetrieveAPIView):
    """
    GET /api/grievances/{id}/

    Returns full detail for a single grievance, including:
      - Responses (organised as a thread)
      - Status history (audit trail of transitions)
      - AI analysis results (if available)
      - Attachments (file metadata)

    Role-based access control (scoping):
      - STUDENT:      Only own grievances
      - STAFF:        Own grievances (any status) + department grievances (non-spam)
      - HOD:          Only grievances in the user's department (non-spam)
      - CAMPUS_ADMIN: Any grievance
    """

    serializer_class = GrievanceDetailSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        """
        Return the base queryset with all nested relations prefetched,
        scoped by role.
        """
        from django.db.models import Q

        user = self.request.user
        qs = Grievance.objects.select_related(
            'category', 'department', 'user', 'ai_analysis',
        ).prefetch_related(
            'responses__responder',
            'status_history__action_by',
            'attachments',
        )

        if user.role == 'STUDENT':
            qs = qs.filter(user=user)
        elif user.role == 'STAFF':
            # Staff must always see their own submissions (including
            # anonymous ones routed to another department), plus the
            # department's non-spam grievances.
            qs = qs.filter(
                Q(user=user) | Q(department=user.department)
            )
        elif user.role == 'HOD':
            qs = qs.filter(department=user.department)
        # CAMPUS_ADMIN sees everything

        return qs


# ---------------------------------------------------------------------------
# Anonymous Tracking
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def grievance_track(request):
    """
    POST /api/grievances/track/

    Anonymous tracking endpoint.  Accepts a grievance ID and the
    plain-text secret code that was issued when the grievance was
    submitted anonymously.

    Returns full grievance details if the code matches, otherwise
    a 401 error with a generic message to prevent enumeration.
    """
    serializer = GrievanceTrackSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data

    try:
        grievance = Grievance.objects.select_related(
            'category', 'department', 'user', 'ai_analysis',
        ).prefetch_related(
            'responses__responder',
            'status_history__action_by',
            'attachments',
        ).get(id=data['id'])
    except Grievance.DoesNotExist:
        return Response(
            {'error': 'Invalid grievance ID or secret code.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # Verify the secret code against the stored hash
    if not grievance.secret_code or not check_password(data['secret_code'], grievance.secret_code):
        return Response(
            {'error': 'Invalid grievance ID or secret code.'},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Phase 4 — AI Analysis
# (Spam filtering removed — spam/responded statuses no longer used)
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Phase 6 — Response & Escalation Workflow
# ---------------------------------------------------------------------------

VALID_TRANSITIONS = {
    Grievance.Status.SUBMITTED: {
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.IN_PROGRESS,
        Grievance.Status.REJECTED,
    },
    Grievance.Status.UNDER_REVIEW: {
        Grievance.Status.IN_PROGRESS,
        Grievance.Status.ESCALATED,
        Grievance.Status.RESOLVED,
        Grievance.Status.REJECTED,
    },
    Grievance.Status.IN_PROGRESS: {
        Grievance.Status.RESOLVED,
        Grievance.Status.REOPENED,
        Grievance.Status.ESCALATED,
        Grievance.Status.REJECTED,
    },
    Grievance.Status.REOPENED: {
        Grievance.Status.IN_PROGRESS,
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.ESCALATED,
        Grievance.Status.RESOLVED,
        Grievance.Status.REJECTED,
    },
    Grievance.Status.ESCALATED: {
        Grievance.Status.RESOLVED,
        Grievance.Status.REJECTED,
        Grievance.Status.SUBMITTED,
    },
    Grievance.Status.RESOLVED: {
        Grievance.Status.CLOSED,
    },
    Grievance.Status.REJECTED: {
        Grievance.Status.CLOSED,
        Grievance.Status.REOPENED,
    },
    Grievance.Status.CLOSED: set(),
}


def _is_valid_transition(from_status: str, to_status: str) -> bool:
    """
    Return ``True`` if a transition from *from_status* to *to_status*
    is recognised by the workflow engine.
    """
    allowed = VALID_TRANSITIONS.get(from_status)
    if allowed is None:
        return False
    return to_status in allowed


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def respond_to_grievance(request, pk):
    """
    POST /api/grievances/{pk}/respond/

    Allows an HOD to respond to a grievance that is SUBMITTED, UNDER_REVIEW,
    IN_PROGRESS, or REOPENED.  The HOD must belong to the grievance's
    assigned department.

    Campus Admin can respond to ESCALATED grievances.

    Creates a ``Response`` record and transitions the grievance status
    to IN_PROGRESS (or another status chosen by the HOD/Campus Admin).
    """
    is_hod = request.user.role == 'HOD'
    is_admin = request.user.role == 'CAMPUS_ADMIN'

    if not (is_hod or is_admin):
        raise PermissionDenied('Only HODs or Campus Admin can respond to grievances.')

    grievance = get_object_or_404(
        Grievance.objects.select_related('department'),
        pk=pk,
    )

    # HOD must belong to the grievance's department (if both are set)
    if is_hod and grievance.department and request.user.department and grievance.department != request.user.department:
        raise PermissionDenied(
            'You can only respond to grievances in your own department.'
        )

    # Auto-assign grievance department if missing
    if not grievance.department and request.user.department:
        grievance.department = request.user.department
        grievance.save(update_fields=['department'])

    # Once a grievance has been forwarded to Campus Admin, the HOD can only
    # view it — respond/update is disabled (Campus Admin takes over).
    has_escalation = Request.objects.filter(
        grievance=grievance,
        request_type=Request.RequestType.ESCALATION,
    ).exists()
    if is_hod and has_escalation:
        raise PermissionDenied(
            'This grievance has been forwarded to Campus Admin and can only be viewed, not updated.'
        )

    # HOD can respond to SUBMITTED, UNDER_REVIEW, IN_PROGRESS, REOPENED
    # Campus Admin can respond to any actionable status, including
    # grievances that have a pending request/appeal awaiting review.
    allowed_statuses = (
        (Grievance.Status.SUBMITTED, Grievance.Status.UNDER_REVIEW,
         Grievance.Status.IN_PROGRESS, Grievance.Status.REOPENED)
        if is_hod else
        (Grievance.Status.SUBMITTED, Grievance.Status.UNDER_REVIEW,
         Grievance.Status.IN_PROGRESS, Grievance.Status.REOPENED,
         Grievance.Status.ESCALATED)
    )

    has_pending_request = Request.objects.filter(
        grievance=grievance,
        status=Request.RequestStatus.PENDING,
    ).exists()

    if grievance.current_status not in allowed_statuses and not (is_admin and has_pending_request):
        return Response(
            {
                'error': (
                    'Grievance must be SUBMITTED, UNDER_REVIEW, IN_PROGRESS, or REOPENED '
                    'before it can be responded to.'
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    content = request.data.get('content', '').strip()
    if not content:
        return Response(
            {'error': 'Response content is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Determine requested status (defaulting to IN_PROGRESS)
    requested_status = request.data.get('status', '').upper()
    valid_statuses = [choice[0] for choice in Grievance.Status.choices]
    if requested_status and requested_status in valid_statuses:
        target_status = requested_status
    else:
        target_status = Grievance.Status.IN_PROGRESS

    # Create the Response record
    from .models import Response as GrievanceResponse
    GrievanceResponse.objects.create(
        grievance=grievance,
        responder=request.user,
        content=content,
    )

    # Transition status (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    role_label = 'Campus Admin' if request.user.role == 'CAMPUS_ADMIN' else 'HOD'
    grievance._action_remarks = f"{role_label} Response: \"{content}\""
    grievance.current_status = target_status
    grievance.save(update_fields=['current_status'])

    # If Campus Admin acts on a pending request (escalation, appeal, reopen),
    # close it out so it leaves the Campus Admin queue.
    if is_admin:
        pending_requests = Request.objects.filter(
            grievance=grievance,
            status=Request.RequestStatus.PENDING,
        )
        if target_status in (Grievance.Status.RESOLVED, Grievance.Status.REJECTED):
            # Final action — mark all pending requests as RESOLVED
            pending_requests.update(
                status=Request.RequestStatus.RESOLVED,
                reviewed_by_admin=request.user,
                admin_remark=content,
                resolved_at=timezone.now(),
            )
        else:
            # Intermediate action (IN_PROGRESS, UNDER_REVIEW) — update Request status to match grievance
            pending_requests.update(
                status=Request.RequestStatus.FORWARDED,
                reviewed_by_admin=request.user,
                admin_remark=content,
            )

    # Notify the submitter about the response
    send_response_email(grievance)

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def hod_escalate_grievance(request, pk):
    """
    POST /api/grievances/{pk}/hod-escalate/

    Allows an HOD to escalate a grievance to Campus Admin when the grievance
    is NOT assigned to the HOD's department. The HOD must provide a reason.
    Transitions status to ESCALATED and creates a Request for Campus Admin review.
    """
    if request.user.role != 'HOD':
        raise PermissionDenied('Only HODs can escalate grievances to Campus Admin.')

    grievance = get_object_or_404(
        Grievance.objects.select_related('department', 'user'),
        pk=pk,
    )

    # Only allowed from actionable statuses
    if grievance.current_status not in (
        Grievance.Status.SUBMITTED,
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.IN_PROGRESS,
        Grievance.Status.REOPENED,
    ):
        return Response(
            {'error': 'Grievance cannot be escalated from its current status.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reason = request.data.get('reason', '').strip()
    if not reason:
        return Response(
            {'error': 'A reason for escalation is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Find a Campus Admin to assign
    from .services.escalation_service import find_next_officer
    next_officer = find_next_officer(grievance)
    if next_officer is None:
        return Response(
            {'error': 'No Campus Admin available to receive this escalation.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    previous_status = grievance.current_status
    hod_name = request.user.get_full_name() or request.user.username

    # Create Request record for Campus Admin queue
    Request.objects.create(
        grievance=grievance,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason=f"HOD {hod_name} escalated: {reason}",
        status=Request.RequestStatus.PENDING,
        original_status=previous_status,
    )

    # Transition status (signal auto-logs StatusHistory)
    grievance.escalation_level = 1
    grievance.escalated_to = next_officer
    grievance._action_by = request.user
    grievance._action_remarks = f"HOD escalated to Campus Admin: {reason}"
    grievance.current_status = Grievance.Status.ESCALATED
    grievance.save(update_fields=[
        'escalation_level', 'escalated_to',
        'current_status', 'updated_at',
    ])

    # Create a Response record so it shows in Official Responses
    from .models import Response as GrievanceResponse
    GrievanceResponse.objects.create(
        grievance=grievance,
        responder=request.user,
        content=reason,
    )

    # Notify submitter
    send_response_email(grievance)

    # Refresh to ensure nested serializer picks up the new Response
    grievance.refresh_from_db()
    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def resolve_grievance(request, pk):
    """
    POST /api/grievances/{pk}/resolve/

    Allows the original submitter, HOD, or Campus Admin to resolve a grievance.
    Campus Admin can only resolve ESCALATED grievances.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    is_submitter = grievance.user == request.user
    is_hod = request.user.role == 'HOD'
    is_admin = request.user.role == 'CAMPUS_ADMIN'

    if not (is_submitter or is_hod or is_admin):
        raise PermissionDenied('You can only resolve your own grievance.')

    # A grievance forwarded to Campus Admin is read-only for the HOD.
    has_escalation = Request.objects.filter(
        grievance=grievance,
        request_type=Request.RequestType.ESCALATION,
    ).exists()
    if is_hod and has_escalation:
        raise PermissionDenied(
            'This grievance has been forwarded to Campus Admin and can only be viewed, not updated.'
        )

    # Campus Admin can resolve ESCALATED, IN_PROGRESS, UNDER_REVIEW,
    # or any grievance with a pending request/appeal awaiting their review
    has_pending_request = Request.objects.filter(
        grievance=grievance,
        status=Request.RequestStatus.PENDING,
    ).exists()
    if is_admin and grievance.current_status not in (
        Grievance.Status.ESCALATED,
        Grievance.Status.IN_PROGRESS,
        Grievance.Status.UNDER_REVIEW,
    ) and not has_pending_request:
        raise PermissionDenied('Campus Admin can only resolve ESCALATED, IN_PROGRESS, or UNDER_REVIEW grievances.')

    if not is_admin and grievance.current_status not in (
        Grievance.Status.IN_PROGRESS,
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.REOPENED,
    ):
        return Response(
            {'error': 'Grievance cannot be resolved in its current status.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_note = request.data.get('content', '').strip() or request.data.get('remarks', '').strip()
    note_text = f" Note: \"{user_note}\"" if user_note else ""

    # Transition status (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    role_label = 'Campus Admin' if is_admin else ('HOD' if is_hod else 'the submitter')
    grievance._action_remarks = f"Resolved by {role_label}.{note_text}"
    grievance.current_status = Grievance.Status.RESOLVED
    grievance.save(update_fields=['current_status'])

    # Close out any pending request/appeal when resolved by Campus Admin
    if is_admin:
        Request.objects.filter(
            grievance=grievance,
            status=Request.RequestStatus.PENDING,
        ).update(
            status=Request.RequestStatus.RESOLVED,
            reviewed_by_admin=request.user,
            admin_remark=user_note or 'Resolved by Campus Admin.',
            resolved_at=timezone.now(),
        )

    # Notify the submitter about the resolution
    send_resolution_email(grievance)

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def reopen_grievance(request, pk):
    """
    POST /api/grievances/{pk}/reopen/

    Allows the original submitter to reopen their grievance when the
    status is IN_PROGRESS or RESOLVED.  Sets ``is_reopened=True`` and
    transitions to REOPENED so it returns to the department HOD queue.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    if grievance.user != request.user:
        raise PermissionDenied('You can only reopen your own grievance.')

    if grievance.current_status not in (
        Grievance.Status.IN_PROGRESS,
        Grievance.Status.RESOLVED,
        Grievance.Status.REJECTED,
    ):
        return Response(
            {'error': 'Grievance must be in IN_PROGRESS, RESOLVED, or REJECTED status to reopen.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if grievance.is_reopened or Request.objects.filter(
        grievance=grievance,
        request_type=Request.RequestType.REOPEN,
    ).exists():
        return Response(
            {'error': 'A grievance can only be reopened once.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_note = request.data.get('content', '').strip() or request.data.get('remarks', '').strip()
    note_text = f" Reason: \"{user_note}\"" if user_note else ""

    previous_status = grievance.current_status

    # Validate uploaded files (max 3, same rules as initial submission)
    uploaded_files = request.FILES.getlist('uploaded_files')
    allowed_types = {
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png', 'image/jpeg',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    allowed_extensions = {'.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.xls', '.xlsx'}
    max_size = 5 * 1024 * 1024  # 5 MB

    if len(uploaded_files) > 3:
        return Response(
            {'error': 'You can attach up to 3 files.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    for f in uploaded_files:
        if f.size > max_size:
            return Response(
                {'error': f'File "{f.name}" exceeds the 5 MB limit.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ext = f.name[f.name.rfind('.'):].lower() if '.' in f.name else ''
        if f.content_type not in allowed_types and ext not in allowed_extensions:
            return Response(
                {'error': f'File type is not allowed for "{f.name}". Accepted: PDF, DOC, DOCX, PNG, JPG, XLS, XLSX.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Transition status to REOPENED (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    grievance._action_remarks = f"Reopened by the submitter for further department review.{note_text}"
    grievance.is_reopened = True
    grievance.current_status = Grievance.Status.REOPENED
    grievance.save(update_fields=['is_reopened', 'current_status'])

    # Create a Request record to store the reopen reason for audit trail
    Request.objects.create(
        grievance=grievance,
        student=request.user,
        request_type=Request.RequestType.REOPEN,
        reason=user_note or '',
        status=Request.RequestStatus.PENDING,
        original_status=previous_status,
    )

    # Store reopen attachments separately
    from .models import ReopenAttachment
    for f in uploaded_files:
        ReopenAttachment.objects.create(
            grievance=grievance,
            file_name=f.name,
            file_type=f.content_type or 'application/octet-stream',
            file=f,
        )

    # Notify the department HOD about the reopen request
    if grievance.department:
        hod = grievance.department.users.filter(role='HOD').first()
        if hod and hod.email:
            submitter = grievance.user.get_full_name() or grievance.user.username if not grievance.is_anonymous else 'Anonymous'
            send_email_async(
                f"[GMS] Grievance Reopened — GMS-{grievance.id:04d}: {grievance.title}",
                f"Dear {hod.get_full_name() or hod.username},\n\n"
                f"A student has reopened a grievance in your department.\n\n"
                f"Grievance: GMS-{grievance.id:04d}\n"
                f"Title: {grievance.title}\n"
                f"Reopened by: {submitter}\n"
                f"Reason: {user_note or 'No reason provided'}\n\n"
                f"Please log in to respond.\n\n"
                f"Regards,\nGrievance Management System",
                [hod.email],
            )

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def post_status_comment(request, pk):
    """
    POST /api/grievances/{pk}/comment/

    Lets the original submitter post a reminder comment when their grievance
    has been stuck in SUBMITTED, UNDER_REVIEW, IN_PROGRESS, or REOPENED for
    a long time.

    The comment nudges the department HOD (email notification) and is limited
    to one comment per status — enforced by the (grievance, status) unique
    constraint.  So a grievance can hold one comment for each of those statuses.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    if grievance.user != request.user:
        raise PermissionDenied('You can only comment on your own grievance.')

    if grievance.current_status not in (
        Grievance.Status.SUBMITTED,
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.IN_PROGRESS,
        Grievance.Status.REOPENED,
    ):
        return Response(
            {'error': 'Comments are only allowed when the status is SUBMITTED, UNDER_REVIEW, IN_PROGRESS, or REOPENED.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if StatusComment.objects.filter(
        grievance=grievance,
        status=grievance.current_status,
    ).exists():
        return Response(
            {'error': 'You have already posted a comment for this status. Only one comment is allowed per status.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    content = (request.data.get('content') or '').strip()
    if not content:
        return Response(
            {'error': 'Comment content is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(content) > 2000:
        return Response(
            {'error': 'Comment must not exceed 2000 characters.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    comment = StatusComment.objects.create(
        grievance=grievance,
        user=request.user,
        status=grievance.current_status,
        content=content,
    )

    # Bump updated_at so the inactivity-escalation clock reflects the activity
    grievance.save(update_fields=['updated_at'])

    # Notify the department HOD (async, non-blocking)
    send_comment_notification_email(grievance, content)

    serializer = StatusCommentSerializer(comment, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def close_grievance(request, pk):
    """
    POST /api/grievances/{pk}/close/

    Allows the submitter or HOD to close a grievance.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    is_submitter = grievance.user == request.user
    is_hod = request.user.role == 'HOD'

    if not (is_submitter or is_hod):
        raise PermissionDenied('Only the submitter or HOD can close this grievance.')

    user_note = request.data.get('content', '').strip() or request.data.get('remarks', '').strip()
    note_text = f" Reason: \"{user_note}\"" if user_note else ""

    grievance._action_by = request.user
    grievance._action_remarks = f"Grievance closed by {'HOD' if is_hod else 'submitter'}.{note_text}"
    grievance.current_status = Grievance.Status.CLOSED
    grievance.save(update_fields=['current_status'])

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def admin_resolve_escalated(request, pk):
    """
    POST /api/admin/escalated/{pk}/resolve/

    Allows a Campus Admin to resolve an escalated grievance.  This is a
    final resolution — no submitter check is needed.

    Per the implementation plan (§7.4):
      1. Creates a Response record (from Campus Admin)
      2. Transitions ESCALATED → RESOLVED
      3. Auto-closes: RESOLVED → CLOSED (final — no submitter check)
    """
    if request.user.role != 'CAMPUS_ADMIN':
        raise PermissionDenied('Only Campus Admins can resolve escalated grievances.')

    grievance = get_object_or_404(Grievance, pk=pk)

    if grievance.current_status != Grievance.Status.ESCALATED:
        return Response(
            {'error': 'Grievance must be in ESCALATED status.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    admin_name = request.user.get_full_name() or request.user.username

    # 1. Create a Response record from the Campus Admin
    content = request.data.get('content', '').strip()
    if content:
        from .models import Response as GrievanceResponse
        GrievanceResponse.objects.create(
            grievance=grievance,
            responder=request.user,
            content=content,
        )

    # 2. Transition ESCALATED → RESOLVED (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    grievance._action_remarks = (
        f"Escalated grievance resolved by Campus Admin {admin_name}."
    )
    grievance.current_status = Grievance.Status.RESOLVED
    grievance.save(update_fields=['current_status'])

    # 3. Auto-close: RESOLVED → CLOSED (no submitter check needed — final)
    grievance._action_by = request.user
    grievance._action_remarks = (
        f"Auto-closed after Campus Admin {admin_name} resolved the escalated grievance."
    )
    grievance.current_status = Grievance.Status.CLOSED
    grievance.save(update_fields=['current_status'])

    # Notify the submitter about the resolution
    send_resolution_email(grievance)

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)

# ---------------------------------------------------------------------------
# Phase 7 — Dashboards & Search
# ---------------------------------------------------------------------------


class StudentDashboardView(generics.GenericAPIView):
    """
    GET /api/dashboard/student/

    Returns the authenticated student's grievances with status counts
    and a list of recent items.  Only accessible by STUDENT and STAFF
    roles.
    """

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = GrievanceListSerializer

    def get(self, request, *args, **kwargs):
        user = request.user
        grievances_qs = _with_attachment_count(
            Grievance.objects.filter(
                user=user,
            ).select_related(
                'category', 'department',
            )
        ).order_by('-created_at')

        total = grievances_qs.count()
        resolved = grievances_qs.filter(
            current_status=Grievance.Status.RESOLVED
        ).count()
        escalated = grievances_qs.filter(
            current_status=Grievance.Status.ESCALATED
        ).count()
        pending = grievances_qs.exclude(
            current_status__in=(
                Grievance.Status.RESOLVED,
                Grievance.Status.CLOSED,
                Grievance.Status.ESCALATED,
            ),
        ).count()

        # Attach days_since_update
        grievances = grievances_qs[:50]
        data = GrievanceListSerializer(
            grievances, many=True, context={'request': request},
        ).data

        return Response({
            'counts': {
                'total': total,
                'resolved': resolved,
                'escalated': escalated,
                'pending': pending,
            },
            'grievances': data,
        })


class DepartmentDashboardView(generics.GenericAPIView):
    """
    GET /api/dashboard/department/

    Returns department grievances with tabbed counts (Open / Resolved /
    Escalated / All).  Accessible by HOD and STAFF roles — scope is the
    user's own department.
    """

    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = GrievanceListSerializer

    def get(self, request, *args, **kwargs):
        user = request.user
        dept = user.department

        if not dept:
            return Response(
                {'error': 'You are not assigned to any department.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grievances_qs = _with_attachment_count(
            Grievance.objects.filter(
                department=dept,
            ).select_related(
                'category', 'department', 'user',
            )
        ).order_by('-created_at')

        total = grievances_qs.count()

        # A grievance that has been escalated (escalation_level > 0) is no
        # longer actionable by the HOD — even if the Campus Admin later
        # changes its status (e.g. UNDER_REVIEW).  Exclude those from the
        # action-required count so the HOD badges stay consistent with the
        # read-only escalation workflow.
        action_required_count = grievances_qs.filter(
            current_status__in=(
                Grievance.Status.SUBMITTED,
                Grievance.Status.UNDER_REVIEW,
                Grievance.Status.IN_PROGRESS,
                Grievance.Status.REOPENED,
            ),
        ).exclude(escalation_level__gt=0).count()
        closed_resolved_count = grievances_qs.filter(
            current_status__in=(
                Grievance.Status.RESOLVED,
                Grievance.Status.CLOSED,
            ),
        ).count()
        escalated_count = grievances_qs.filter(
            escalation_level__gt=0,
        ).count()
        status_breakdown = {
            status_choice: grievances_qs.filter(
                current_status=status_choice,
            ).count()
            for status_choice in Grievance.Status.values
        }

        # Six-month activity trend scoped to the department (months with no
        # records are included).  Ordering by the truncated month (instead of
        # inheriting the base `order_by('-created_at')`) keeps the GROUP BY
        # correct on SQLite — otherwise each month collapses to per-row groups
        # of 1.
        monthly_counts = {
            item['month'].strftime('%Y-%m'): item['count']
            for item in grievances_qs.annotate(
                month=TruncMonth('created_at'),
            ).values('month').annotate(count=Count('id')).order_by('month')
            if item['month']
        }
        today = timezone.localdate()
        monthly_trend = []
        for offset in range(5, -1, -1):
            month_number = today.month - offset
            year = today.year
            if month_number <= 0:
                month_number += 12
                year -= 1
            month = date(year, month_number, 1)
            monthly_trend.append({
                'month': month.strftime('%b'),
                'count': monthly_counts.get(month.strftime('%Y-%m'), 0),
            })

        grievances = grievances_qs[:50]
        data = GrievanceListSerializer(
            grievances, many=True, context={'request': request},
        ).data

        return Response({
            'counts': {
                'total': total,
                'action_required': action_required_count,
                'closed_resolved': closed_resolved_count,
                'escalated': escalated_count,
                'status_breakdown': status_breakdown,
                'monthly_trend': monthly_trend,
            },
            'grievances': data,
        })


class AdminDashboardView(generics.GenericAPIView):
    """
    GET /api/dashboard/admin/

    Returns action-oriented statistics for Campus Admin:
      - Total Grievances
      - Pending Requests count & breakdown
      - Spam Review count
      - Closed/Resolved count
    """

    permission_classes = (permissions.IsAuthenticated, IsCampusAdmin)

    def get(self, request, *args, **kwargs):
        qs = Grievance.objects.all()

        total = qs.count()
        closed_resolved_count = qs.filter(
            current_status__in=[Grievance.Status.RESOLVED, Grievance.Status.CLOSED]
        ).count()

        pending_requests_qs = Request.objects.filter(status=Request.RequestStatus.PENDING)
        pending_requests_count = pending_requests_qs.count()

        breakdown = {
            'REOPEN': pending_requests_qs.filter(request_type=Request.RequestType.REOPEN).count(),
            'REJECTION_APPEAL': pending_requests_qs.filter(request_type=Request.RequestType.REJECTION_APPEAL).count(),
            'ESCALATION': pending_requests_qs.filter(request_type=Request.RequestType.ESCALATION).count(),
        }

        status_counts = {}
        for status_choice in Grievance.Status.values:
            status_counts[status_choice] = qs.filter(current_status=status_choice).count()

        # Keep the analytics payload compact while giving the admin dashboard a
        # meaningful six-month activity trend (including months with no records).
        monthly_counts = {
            item['month'].strftime('%Y-%m'): item['count']
            for item in qs.annotate(month=TruncMonth('created_at')).values('month').annotate(count=Count('id'))
            if item['month']
        }
        today = timezone.localdate()
        monthly_trend = []
        for offset in range(5, -1, -1):
            month_number = today.month - offset
            year = today.year
            if month_number <= 0:
                month_number += 12
                year -= 1
            month = date(year, month_number, 1)
            monthly_trend.append({
                'month': month.strftime('%b'),
                'count': monthly_counts.get(month.strftime('%Y-%m'), 0),
            })

        recent = _with_attachment_count(
            Grievance.objects.select_related('category', 'department', 'user')
        ).order_by('-updated_at')[:10]
        recent_data = GrievanceListSerializer(recent, many=True, context={'request': request}).data

        return Response({
            'counts': {
                'total': total,
                'pending_requests': pending_requests_count,
                'pending_requests_breakdown': breakdown,
                'closed_resolved': closed_resolved_count,
                'status_breakdown': status_counts,
                'escalated': status_counts.get(Grievance.Status.ESCALATED, 0),
                'monthly_trend': monthly_trend,
            },
            'recent': recent_data,
        })


# ---------------------------------------------------------------------------
# Phase 8 — Unified Request Workflow Views (Appeals, Reopen, Spam Appeal, Escalation)
# ---------------------------------------------------------------------------

@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def create_grievance_request(request, pk):
    """
    POST /api/grievances/{pk}/request/

    Allows a student (or submitter) to submit a formal request for:
      - REJECTION_APPEAL (for rejected grievances)
      - SPAM_APPEAL (for grievances marked as spam)
      - REOPEN (for resolved grievances)

    Requires mandatory 'reason' and optional 'attachment'.
    Creates a Request record in PENDING status for Campus Admin review.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    # Submitter authorization check
    if grievance.user != request.user:
        raise PermissionDenied('You can only submit requests for your own grievances.')

    request_type = request.data.get('request_type', '').upper()
    reason = request.data.get('reason', '').strip()
    attachment = request.FILES.get('attachment')

    if not reason:
        return Response(
            {'error': 'A detailed reason is required to submit this request.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    valid_types = [choice[0] for choice in Request.RequestType.choices]
    if request_type not in valid_types:
        return Response(
            {'error': f'Invalid request type "{request_type}". Must be one of {valid_types}.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Status compatibility validation
    if request_type == Request.RequestType.REJECTION_APPEAL and grievance.current_status != Grievance.Status.REJECTED:
        return Response(
            {'error': 'Rejection appeals can only be submitted for REJECTED grievances.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    elif request_type == Request.RequestType.REOPEN and grievance.current_status not in (Grievance.Status.RESOLVED, Grievance.Status.IN_PROGRESS):
        return Response(
            {'error': 'Reopen requests can only be submitted for RESOLVED or IN_PROGRESS grievances.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    elif request_type == Request.RequestType.REOPEN and (grievance.is_reopened or Request.objects.filter(
        grievance=grievance,
        request_type=Request.RequestType.REOPEN,
    ).exists()):
        return Response(
            {'error': 'A grievance can only be reopened once.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Check for existing pending request of same type
    existing_pending = Request.objects.filter(
        grievance=grievance,
        request_type=request_type,
        status=Request.RequestStatus.PENDING,
    ).exists()

    if existing_pending:
        return Response(
            {'error': f'A pending {request_type} request already exists for this grievance.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Create the Request record
    req_obj = Request.objects.create(
        grievance=grievance,
        student=request.user,
        request_type=request_type,
        reason=reason,
        attachment=attachment,
        status=Request.RequestStatus.PENDING,
        original_status=grievance.current_status,
    )

    # Status remains unchanged — the request is pending admin review.
    type_display = req_obj.get_request_type_display()
    grievance._action_by = request.user
    grievance._action_remarks = (
        f"Submitted {type_display} — pending Campus Admin review. "
        f"Reason: {reason[:200]}"
    )
    # No status change — grievance stays in its current status
    # while the admin reviews the request.

    # Notify Campus Admins about the student request
    send_request_notification_email(grievance, request_type, reason)

    serializer = RequestSerializer(req_obj, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


class AdminRequestListView(generics.ListAPIView):
    """
    GET /api/admin/requests/

    Campus Admin only. Lists all requests with optional filters:
      - request_type (REOPEN, REJECTION_APPEAL, SPAM_APPEAL, ESCALATION)
      - status (PENDING, FORWARDED, REJECTED)
      - search (search in reason, grievance title, student username)
    """

    serializer_class = RequestSerializer
    permission_classes = (permissions.IsAuthenticated, IsCampusAdmin)
    pagination_class = None

    def get_queryset(self):
        qs = Request.objects.select_related(
            'grievance', 'student', 'reviewed_by_admin', 'forwarded_department'
        ).order_by('-created_at')

        req_type = self.request.query_params.get('request_type')
        if req_type:
            qs = qs.filter(request_type=req_type.upper())

        req_status = self.request.query_params.get('status')
        if req_status:
            qs = qs.filter(status=req_status.upper())

        search = self.request.query_params.get('search')
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(reason__icontains=search) |
                Q(grievance__title__icontains=search) |
                Q(student__username__icontains=search)
            )

        return qs


class AdminRequestDetailView(generics.RetrieveAPIView):
    """
    GET /api/admin/requests/{pk}/

    Campus Admin only. Retrieves full details of a specific request.
    """

    queryset = Request.objects.select_related(
        'grievance', 'student', 'reviewed_by_admin', 'forwarded_department'
    )
    serializer_class = RequestSerializer
    permission_classes = (permissions.IsAuthenticated, IsCampusAdmin)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsCampusAdmin])
def admin_forward_request(request, pk):
    """
    POST /api/admin/requests/{pk}/forward/

    Campus Admin action to review and forward a request to a department.
    Request status transitions to FORWARDED.
    Underlying grievance is updated and routed to the target department/HOD.
    """
    req_obj = get_object_or_404(
        Request.objects.select_related('grievance', 'student'),
        pk=pk,
    )

    if req_obj.status != Request.RequestStatus.PENDING:
        return Response(
            {'error': f'Request has already been processed (Current status: {req_obj.status}).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    dept_id = request.data.get('department_id')
    admin_remark = request.data.get('admin_remark', '').strip()

    grievance = req_obj.grievance
    target_dept = None
    if dept_id:
        target_dept = get_object_or_404(Department, pk=dept_id)
    else:
        target_dept = grievance.department

    if not target_dept:
        return Response(
            {'error': 'A target department must be assigned to forward this request.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Update Request record
    req_obj.status = Request.RequestStatus.FORWARDED
    req_obj.reviewed_by_admin = request.user
    req_obj.forwarded_department = target_dept
    req_obj.admin_remark = admin_remark
    req_obj.resolved_at = timezone.now()
    req_obj.save()

    # Update underlying Grievance according to Request Type.
    # Every approved-and-forwarded request re-enters the workflow as
    # SUBMITTED (matching the submission/routing behaviour): the
    # assigned department/HOD picks it up from their Action Required list.
    if req_obj.request_type in (Request.RequestType.REOPEN, Request.RequestType.REJECTION_APPEAL):
        grievance.current_status = Grievance.Status.SUBMITTED
        grievance.department = target_dept
        grievance.is_reopened = True
    elif req_obj.request_type == Request.RequestType.ESCALATION:
        grievance.current_status = Grievance.Status.SUBMITTED
        grievance.department = target_dept

    # Save triggers the pre_save signal, which auto-logs the StatusHistory
    # entry with `_action_remarks` — do NOT create a second entry here.
    grievance._action_by = request.user
    grievance._action_remarks = f"Request ({req_obj.get_request_type_display()}) approved & forwarded to {target_dept.name} by Campus Admin. Remarks: {admin_remark}"
    grievance.save(update_fields=['current_status', 'department', 'is_reopened', 'updated_at'])

    serializer = RequestSerializer(req_obj, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsCampusAdmin])
def admin_reject_request(request, pk):
    """
    POST /api/admin/requests/{pk}/reject/

    Campus Admin action to reject a student request.
    Request status transitions to REJECTED.
    If the grievance was moved by the request (or ESCALATED
    by the system), it is restored to its pre-request status so the workflow
    continues from a meaningful state.
    """
    req_obj = get_object_or_404(
        Request.objects.select_related('grievance'),
        pk=pk,
    )

    if req_obj.status != Request.RequestStatus.PENDING:
        return Response(
            {'error': f'Request has already been processed (Current status: {req_obj.status}).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    admin_remark = request.data.get('admin_remark', '').strip()

    req_obj.status = Request.RequestStatus.REJECTED
    req_obj.reviewed_by_admin = request.user
    req_obj.admin_remark = admin_remark
    req_obj.resolved_at = timezone.now()
    req_obj.save()

    # If the grievance was moved by this request, restore
    # it to its pre-request status (the pre_save signal logs the transition).
    # Rejected escalations move the grievance to REJECTED (per the workflow
    # map, ESCALATED -> REJECTED) and clear the escalation fields, so the
    # grievance is no longer in progress.
    grievance = req_obj.grievance
    if (
        req_obj.request_type == Request.RequestType.ESCALATION
        and grievance.current_status == Grievance.Status.ESCALATED
    ):
        grievance._action_by = request.user
        grievance._action_remarks = (
            f"Campus Admin rejected {req_obj.get_request_type_display()} — "
            f"grievance marked as Rejected. "
            f"Admin remark: {admin_remark}"
        )
        grievance.current_status = Grievance.Status.REJECTED
        grievance.escalation_level = 0
        grievance.escalated_to = None
        grievance.save(update_fields=[
            'current_status', 'escalation_level', 'escalated_to', 'updated_at',
        ])
    elif req_obj.original_status:
        grievance._action_by = request.user
        grievance._action_remarks = (
            f"Campus Admin rejected {req_obj.get_request_type_display()} — "
            f"status restored to "
            f"{req_obj.get_original_status_display()}. "
            f"Admin remark: {admin_remark}"
        )
        grievance.current_status = req_obj.original_status
        grievance.save(update_fields=['current_status'])
    else:
        # No status change — log an audit-only StatusHistory entry
        StatusHistory.objects.create(
            grievance=grievance,
            previous_status=grievance.current_status,
            new_status=grievance.current_status,
            action_by=request.user,
            remarks=f"Campus Admin rejected {req_obj.get_request_type_display()}. Admin remark: {admin_remark}",
        )

    serializer = RequestSerializer(req_obj, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated, IsCampusAdmin])
def admin_resolve_request(request, pk):
    """
    POST /api/admin/requests/{pk}/resolve/

    Campus Admin action to resolve a request or appeal directly
    (Rejection Appeal, Reopened Appeal, Spam Appeal, Escalation).

    Request status transitions to RESOLVED. The underlying grievance is
    marked as RESOLVED with Campus Admin remarks.
    """
    req_obj = get_object_or_404(
        Request.objects.select_related('grievance'),
        pk=pk,
    )

    if req_obj.status != Request.RequestStatus.PENDING:
        return Response(
            {'error': f'Request has already been processed (Current status: {req_obj.status}).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    admin_remark = request.data.get('admin_remark', '').strip()
    if not admin_remark:
        return Response(
            {'error': 'Campus Admin remark is required when resolving a request.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    content = request.data.get('content', '').strip()
    grievance = req_obj.grievance
    admin_name = request.user.get_full_name() or request.user.username

    # Update Request record
    req_obj.status = Request.RequestStatus.RESOLVED
    req_obj.reviewed_by_admin = request.user
    req_obj.admin_remark = admin_remark
    req_obj.resolved_at = timezone.now()
    req_obj.save()

    # Record an optional response from the Campus Admin
    if content:
        from .models import Response as GrievanceResponse
        GrievanceResponse.objects.create(
            grievance=grievance,
            responder=request.user,
            content=content,
        )

    # Resolve the grievance (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    grievance._action_remarks = (
        f"Request ({req_obj.get_request_type_display()}) resolved by Campus Admin {admin_name}. "
        f"Admin remark: {admin_remark}"
    )
    grievance.current_status = Grievance.Status.RESOLVED
    grievance.escalation_level = 0
    grievance.escalated_to = None
    grievance.save(update_fields=[
        'current_status', 'escalation_level', 'escalated_to', 'updated_at',
    ])

    send_resolution_email(grievance)

    serializer = RequestSerializer(req_obj, context={'request': request})
    return Response(serializer.data, status=status.HTTP_200_OK)

