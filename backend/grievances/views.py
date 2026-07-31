"""
Views for the Grievance application.

Phase 4: AI Spam Filtering
  - Spam detection integrated into submission pipeline
  - Spam queue management for Campus Admin
  - Appeal mechanism for submitters

Phase 5: Grievance Routing
  - Department assignment via routing (status stays SUBMITTED)
  - HOD manually starts review via POST .../review/
"""

import csv

from django.contrib.auth.hashers import check_password
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, Throttled
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Department
from .models import AIAnalysis, Category, Grievance, StatusHistory
from .serializers import (
    AIAnalysisSerializer,
    CategorySerializer,
    DepartmentSerializer,
    GrievanceCreateSerializer,
    GrievanceDetailSerializer,
    GrievanceListSerializer,
    GrievanceTrackSerializer,
    StatusHistorySerializer,
)
from .permissions import IsSystemAdmin
from .services.spam_detector import MLSpamDetector
from .services.routing import route_grievance
from .services.audit.audit_logger import audit_log
from .services.escalation import (
    send_submission_email,
    send_response_email,
    send_resolution_email,
)


# ---------------------------------------------------------------------------
# Reference endpoints (public)
# ---------------------------------------------------------------------------

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

        if user.role in ('STUDENT', 'STAFF'):
            # Submitters see their own grievances — including any flagged as
            # SPAM — so they can appeal the classification or see the outcome.
            qs = qs.filter(user=user)
        elif user.role == 'HOD':
            # Department inbox — SPAM lives in its own tab (like Gmail).
            qs = qs.filter(department=user.department).exclude(
                current_status=Grievance.Status.SPAM,
            )
        elif user.role == 'CAMPUS_ADMIN':
            # Escalations currently open OR assigned to this admin (an admin
            # keeps access after picking a grievance up via review). SPAM is
            # never part of the escalation queue.
            qs = qs.filter(
                Q(current_status=Grievance.Status.ESCALATED)
                | Q(escalated_to=user),
            ).exclude(current_status=Grievance.Status.SPAM)
        elif user.role == 'SYSTEM_ADMIN':
            # System Admin monitors everything, including spam.
            pass

        return qs.order_by('-created_at')

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
                    'You have reached the maximum limit of grievances '
                    'per day. Please try again after midnight.'
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
        detector = MLSpamDetector()
        result = detector.analyze(grievance.description)

        # Persist the AI analysis record
        AIAnalysis.objects.create(
            grievance=grievance,
            spam_prediction=result['spam_prediction'],
            confidence_score=result['confidence_score'],
            classification_reason=result['classification_reason'],
        )

        # Assign department via routing (runs for both spam and non-spam)
        route_grievance(
            grievance,
            action_by=request.user,
        )

        if result['spam_prediction']:
            # Mark as spam — the signal auto-logs StatusHistory
            grievance._action_by = request.user
            grievance._action_remarks = (
                f"Flagged as spam by AI detector "
                f"(confidence: {result['confidence_score']:.2f}). "
                f"{result['classification_reason']}"
            )
            grievance.current_status = Grievance.Status.SPAM
            grievance.save(update_fields=['current_status'])

        # Build response data
        data = GrievanceDetailSerializer(grievance, context={'request': request}).data

        # Notify the HOD about the new grievance
        if not result['spam_prediction']:
            send_submission_email(grievance)

        # If anonymous, include the plain-text secret code (only returned once)
        raw_code = getattr(serializer, '_raw_secret_code', None)
        if raw_code:
            data['secret_code'] = raw_code

        audit_log(
            request=request,
            action='SUBMIT_GRIEVANCE',
            grievance_id=grievance.id,
            details=f'Grievance submitted ({"anonymous" if grievance.is_anonymous else "authenticated"})',
            result='SUCCESS',
        )

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
      - STAFF / HOD:  Only grievances in the user's department
      - CAMPUS_ADMIN: Any grievance
    """

    serializer_class = GrievanceDetailSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        """
        Return the base queryset with all nested relations prefetched,
        scoped by role.
        """
        user = self.request.user
        qs = Grievance.objects.select_related(
            'category', 'department', 'user', 'ai_analysis',
        ).prefetch_related(
            'responses__responder',
            'status_history__action_by',
            'attachments',
        )

        if user.role in ('STUDENT', 'STAFF'):
            # STAFF is a submitter (same flow as students), not a department
            # handler — they can only open their own grievances.
            qs = qs.filter(user=user)
        elif user.role == 'HOD':
            qs = qs.filter(department=user.department)
        elif user.role == 'CAMPUS_ADMIN':
            # Escalations currently open OR assigned to this admin — the same
            # scoping as the list so the escalation workflow stays open.
            qs = qs.filter(
                Q(current_status=Grievance.Status.ESCALATED)
                | Q(escalated_to=user),
            )
        elif user.role == 'SYSTEM_ADMIN':
            # System Admin can open any grievance (read-only).
            pass

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
# Phase 4 — AI Spam Filtering: Spam Tab & Appeal
# ---------------------------------------------------------------------------


class SpamQueueView(generics.ListAPIView):
    """
    GET /api/spam/

    Lists spam grievances for the HOD's own department (like Gmail's
    spam tab).  The HOD can review and accept spam directly by calling
    ``POST /api/grievances/{pk}/review/`` (which accepts SPAM →
    UNDER_REVIEW).

    Role-based scoping:
      - STUDENT:      Own grievances only
      - HOD / STAFF:  Only spam in the user's department
    """

    serializer_class = GrievanceListSerializer
    permission_classes = (permissions.IsAuthenticated,)
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        qs = Grievance.objects.filter(
            current_status=Grievance.Status.SPAM,
        ).select_related(
            'category', 'department', 'user',
        ).order_by('-updated_at')

        if user.role == 'STUDENT':
            qs = qs.filter(user=user)
        elif user.role in ('HOD', 'STAFF'):
            qs = qs.filter(department=user.department)

        return qs


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def reinstate_spam(request, pk):
    """
    POST /api/grievances/{pk}/reinstate-spam/

    HOD (or Staff) can reinstate a spam grievance in their own department.
    Transitions SPAM → SUBMITTED so it enters the normal review flow.
    """
    if request.user.role not in ('HOD', 'STAFF'):
        raise PermissionDenied('Only HODs or Staff can reinstate grievances.')

    grievance = get_object_or_404(
        Grievance.objects.select_related('ai_analysis'),
        pk=pk,
        current_status=Grievance.Status.SPAM,
    )

    # Scoping — only own department
    if grievance.department != request.user.department:
        raise PermissionDenied(
            'You can only reinstate grievances in your own department.'
        )

    # Update the AI analysis record to reflect the override
    try:
        ai = grievance.ai_analysis
        ai.spam_prediction = False
        ai.classification_reason = (
            f"Overridden by {request.user.get_full_name() or request.user.username}. "
            f"Original result: {ai.classification_reason}"
        )
        ai.save(update_fields=['spam_prediction', 'classification_reason'])
    except AIAnalysis.DoesNotExist:
        pass

    # Transition status — the signal auto-logs StatusHistory
    grievance._action_by = request.user
    grievance._action_remarks = (
        f"Grievance reinstated from spam by "
        f"{request.user.get_full_name() or request.user.username}."
    )
    grievance.current_status = Grievance.Status.SUBMITTED
    grievance.save(update_fields=['current_status'])

    audit_log(
        request=request,
        action='REINSTATE_SPAM',
        grievance_id=grievance.id,
        details=f'{request.user.role} reinstated grievance from spam',
        old_status='SPAM',
        new_status='SUBMITTED',
        result='SUCCESS',
    )

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def appeal_spam(request, pk):
    """
    POST /api/grievances/{pk}/appeal-spam/

    Allows the submitter to appeal a spam classification.  Logs a
    StatusHistory entry recording the appeal — the grievance stays in
    SPAM status until a Campus Admin reviews and reinstates it.

    Only the original submitter can appeal.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    # Only the submitter can appeal their own grievance
    if grievance.user != request.user:
        raise PermissionDenied('You can only appeal your own grievance.')

    if grievance.current_status != Grievance.Status.SPAM:
        return Response(
            {'error': 'Only grievances classified as SPAM can be appealed.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    StatusHistory.objects.create(
        grievance=grievance,
        previous_status=Grievance.Status.SPAM,
        new_status=Grievance.Status.SPAM,  # stays SPAM pending admin review
        action_by=request.user,
        remarks='Submitter has appealed the spam classification — pending admin review.',
    )

    audit_log(
        request=request,
        action='APPEAL_SPAM',
        grievance_id=grievance.id,
        details='Submitter appealed spam classification — pending admin review',
        old_status='SPAM',
        result='SUCCESS',
    )

    return Response(
        {
            'detail': (
                'Your appeal has been submitted. A Campus Administrator '
                'will review your grievance and reinstate it if appropriate.'
            ),
        },
        status=status.HTTP_200_OK,
    )


# ---------------------------------------------------------------------------
# Manual Review — Move SUBMITTED → UNDER_REVIEW
# ---------------------------------------------------------------------------


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def start_review(request, pk):
    """
    POST /api/grievances/{pk}/review/

    Moves a grievance to UNDER_REVIEW:

      - HOD / STAFF:     SUBMITTED → UNDER_REVIEW
      - CAMPUS_ADMIN:    ESCALATED → UNDER_REVIEW (picks up escalated grievance)
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    if request.user.role not in ('HOD', 'STAFF', 'CAMPUS_ADMIN'):
        raise PermissionDenied(
            'Only HODs, Staff, or Campus Admins can start a review.'
        )

    if request.user.role == 'CAMPUS_ADMIN':
        if grievance.current_status != Grievance.Status.ESCALATED:
            return Response(
                {'error': 'Admins can only review escalated grievances.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        # HOD / STAFF — only SUBMITTED or SPAM grievances in their department
        if grievance.current_status not in (
            Grievance.Status.SUBMITTED,
            Grievance.Status.SPAM,
        ):
            return Response(
                {'error': 'Grievance must be in SUBMITTED or SPAM status to start review.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if grievance.department != request.user.department:
            raise PermissionDenied(
                'You can only review grievances in your own department.'
            )

    grievance._action_by = request.user
    grievance._action_remarks = (
        f"Review started by {request.user.get_full_name() or request.user.username}."
    )
    grievance.current_status = Grievance.Status.UNDER_REVIEW
    grievance.save(update_fields=['current_status'])

    audit_log(
        request=request,
        action='START_REVIEW',
        grievance_id=grievance.id,
        details=f'{request.user.role} started review of grievance',
        old_status='SUBMITTED',
        new_status='UNDER_REVIEW',
        result='SUCCESS',
    )

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Phase 6 — Response & Escalation Workflow
# ---------------------------------------------------------------------------

VALID_TRANSITIONS = {
    Grievance.Status.SUBMITTED: {
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.SPAM,
    },
    Grievance.Status.SPAM: {
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.SUBMITTED,
        Grievance.Status.CLOSED,
    },
    Grievance.Status.UNDER_REVIEW: {
        Grievance.Status.RESPONDED,
        Grievance.Status.ESCALATED,
    },
    Grievance.Status.RESPONDED: {
        Grievance.Status.RESOLVED,
        Grievance.Status.REOPENED,
        Grievance.Status.ESCALATED,
    },
    Grievance.Status.REOPENED: {
        Grievance.Status.RESPONDED,
        Grievance.Status.ESCALATED,
    },
    Grievance.Status.ESCALATED: {
        Grievance.Status.UNDER_REVIEW,
    },
    Grievance.Status.RESOLVED: {
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

    Allows an HOD or Campus Admin to respond to a grievance that is
    UNDER_REVIEW or REOPENED.

      - HOD:           Must belong to the grievance's department
      - CAMPUS_ADMIN:  Can respond to any grievance (e.g. after picking
                       up an escalation via review)

    Creates a ``Response`` record and transitions the status to RESPONDED.
    """
    if request.user.role not in ('HOD', 'CAMPUS_ADMIN'):
        raise PermissionDenied('Only HODs or Campus Admins can respond to grievances.')

    grievance = get_object_or_404(
        Grievance.objects.select_related('department'),
        pk=pk,
    )

    # HOD must belong to the grievance's department
    if request.user.role == 'HOD':
        if grievance.department != request.user.department:
            raise PermissionDenied(
                'You can only respond to grievances in your own department.'
            )

    if grievance.current_status not in (
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.REOPENED,
    ):
        return Response(
            {
                'error': (
                    'Grievance must be UNDER_REVIEW or REOPENED '
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

    # Capture previous status before transitioning
    previous_status = grievance.current_status

    # Create the Response record
    from .models import Response as GrievanceResponse
    GrievanceResponse.objects.create(
        grievance=grievance,
        responder=request.user,
        content=content,
    )

    # Transition status (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    grievance._action_remarks = (
        f"Responded by HOD {request.user.get_full_name() or request.user.username}."
    )
    grievance.current_status = Grievance.Status.RESPONDED
    grievance.save(update_fields=['current_status'])

    # Notify the submitter about the response
    send_response_email(grievance)

    audit_log(
        request=request,
        action='RESPOND_TO_GRIEVANCE',
        grievance_id=grievance.id,
        details=f'HOD responded to grievance',
        old_status=previous_status,
        new_status='RESPONDED',
        result='SUCCESS',
    )

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def resolve_grievance(request, pk):
    """
    POST /api/grievances/{pk}/resolve/

    Allows the original submitter to progress their grievance:

      - RESPONDED → RESOLVED  (satisfied with HOD's response)
      - RESOLVED  → CLOSED    (satisfied with admin's escalation resolution)
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    if grievance.user != request.user:
        raise PermissionDenied('You can only resolve your own grievance.')

    previous_status = grievance.current_status

    if previous_status == Grievance.Status.RESPONDED:
        grievance._action_by = request.user
        grievance._action_remarks = 'Resolved by the submitter.'
        grievance.current_status = Grievance.Status.RESOLVED
        grievance.save(update_fields=['current_status'])
        send_resolution_email(grievance)

    elif previous_status == Grievance.Status.RESOLVED:
        grievance._action_by = request.user
        grievance._action_remarks = 'Closed by the submitter.'
        grievance.current_status = Grievance.Status.CLOSED
        grievance.save(update_fields=['current_status'])

    else:
        return Response(
            {'error': 'Grievance must be in RESPONDED or RESOLVED status to resolve/close.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    audit_log(
        request=request,
        action='RESOLVE_GRIEVANCE',
        grievance_id=grievance.id,
        details='Submitter resolved grievance',
        old_status=previous_status,
        new_status='RESOLVED',
        result='SUCCESS',
    )

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def reopen_grievance(request, pk):
    """
    POST /api/grievances/{pk}/reopen/

    Allows the original submitter to reopen their grievance:

      - RESPONDED → REOPENED  (not satisfied with HOD's response)
      - RESOLVED  → REOPENED  (not satisfied with admin's escalation resolution)

    Sets ``is_reopened=True`` for audit purposes.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    if grievance.user != request.user:
        raise PermissionDenied('You can only reopen your own grievance.')

    if grievance.current_status not in (
        Grievance.Status.RESPONDED,
        Grievance.Status.RESOLVED,
    ):
        return Response(
            {'error': 'Grievance must be in RESPONDED or RESOLVED status to reopen.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    previous_status = grievance.current_status

    # Optional comment from the submitter — stored in the StatusHistory
    # remark so it shows up in the audit trail (mirrors the respond flow).
    comment = request.data.get('comment', '').strip()

    # Transition status (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    grievance._action_remarks = 'Reopened by the submitter for further review.'
    if comment:
        grievance._action_remarks += f' Reason: {comment}'
    grievance.is_reopened = True
    grievance.current_status = Grievance.Status.REOPENED
    grievance.save(update_fields=['is_reopened', 'current_status'])

    audit_log(
        request=request,
        action='REOPEN_GRIEVANCE',
        grievance_id=grievance.id,
        details='Submitter reopened grievance for further review',
        old_status=previous_status,
        new_status='REOPENED',
        result='SUCCESS',
    )

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Status History — Audit Trail
# ---------------------------------------------------------------------------


class StatusHistoryListView(generics.ListAPIView):
    """
    GET /api/status-history/

    Returns the full audit trail of grievance status transitions.
    Supports the following query-parameter filters:

      - grievance (int)  — filter by grievance ID
      - status (str)     — filter by ``new_status`` value (e.g. RESOLVED)
      - date_from (str)  — filter by created_at >= date (YYYY-MM-DD)
      - date_to (str)    — filter by created_at <= date (YYYY-MM-DD)

    Role-based scoping:
      - STUDENT:       Only transitions for the user's own grievances
      - STAFF / HOD:   Only transitions for grievances in the user's department
      - CAMPUS_ADMIN:  All transitions
    """

    serializer_class = StatusHistorySerializer
    permission_classes = (permissions.IsAuthenticated,)
    filterset_fields = ['new_status', 'previous_status', 'grievance']

    def get_queryset(self):
        user = self.request.user

        qs = StatusHistory.objects.select_related(
            'grievance', 'action_by',
        ).order_by('-created_at')

        if user.role == 'STUDENT':
            qs = qs.filter(grievance__user=user)
        elif user.role in ('STAFF', 'HOD'):
            dept = user.department
            if dept:
                qs = qs.filter(grievance__department=dept)
            else:
                qs = qs.none()
        # CAMPUS_ADMIN — no filter, sees everything

        # Apply query-parameter filters
        params = self.request.query_params

        grievance_id = params.get('grievance')
        if grievance_id:
            qs = qs.filter(grievance_id=grievance_id)

        status_val = params.get('status')
        if status_val:
            qs = qs.filter(new_status=status_val.upper())

        date_from = params.get('date_from')
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)

        date_to = params.get('date_to')
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        return qs


# ---------------------------------------------------------------------------
# Phase 7 — Dashboards, Search & Export
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
        grievances_qs = Grievance.objects.filter(
            user=user,
        ).select_related(
            'category', 'department',
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

        grievances_qs = Grievance.objects.filter(
            department=dept,
        ).select_related(
            'category', 'department', 'user',
        ).order_by('-created_at')

        total = grievances_qs.count()
        open_count = grievances_qs.filter(
            current_status__in=(
                Grievance.Status.UNDER_REVIEW,
                Grievance.Status.RESPONDED,
                Grievance.Status.REOPENED,
            ),
        ).count()
        resolved = grievances_qs.filter(
            current_status=Grievance.Status.RESOLVED,
        ).count()
        escalated = grievances_qs.filter(
            current_status=Grievance.Status.ESCALATED,
        ).count()

        grievances = grievances_qs[:50]
        data = GrievanceListSerializer(
            grievances, many=True, context={'request': request},
        ).data

        return Response({
            'counts': {
                'total': total,
                'open': open_count,
                'resolved': resolved,
                'escalated': escalated,
            },
            'grievances': data,
        })


class AdminDashboardView(generics.GenericAPIView):
    """
    GET /api/dashboard/admin/

    System-wide health report for System Admin (read-only):
      - Aggregate counts by status
      - Escalated and spam counts
      - Per-department breakdown (the "is the system working" view)
      - The 10 most recently updated grievances
    """

    permission_classes = (permissions.IsAuthenticated, IsSystemAdmin)

    def get(self, request, *args, **kwargs):
        qs = Grievance.objects.all()

        # Counts by individual status
        status_counts = {}
        for status_choice in Grievance.Status.values:
            status_counts[status_choice] = qs.filter(
                current_status=status_choice,
            ).count()

        # Aggregate counts
        escalated_count = qs.filter(
            current_status=Grievance.Status.ESCALATED,
        ).count()
        spam_count = qs.filter(
            current_status=Grievance.Status.SPAM,
        ).count()
        total = qs.count()

        # Per-department breakdown
        departments = []
        for dept in Department.objects.order_by('name'):
            dept_qs = Grievance.objects.filter(department=dept)
            dept_status = {}
            for status_choice in Grievance.Status.values:
                dept_status[status_choice] = dept_qs.filter(
                    current_status=status_choice,
                ).count()
            oldest_open = dept_qs.exclude(
                current_status__in=[
                    Grievance.Status.RESOLVED,
                    Grievance.Status.CLOSED,
                    Grievance.Status.SPAM,
                ],
            ).order_by('created_at').values_list('created_at', flat=True).first()
            departments.append({
                'id': dept.id,
                'name': dept.name,
                'total': dept_qs.count(),
                'status_breakdown': dept_status,
                'escalated': dept_qs.filter(
                    current_status=Grievance.Status.ESCALATED,
                ).count(),
                'spam': dept_qs.filter(
                    current_status=Grievance.Status.SPAM,
                ).count(),
                'oldest_open': oldest_open,
            })

        # 10 most recently updated grievances
        recent = qs.select_related(
            'category', 'department', 'user',
        ).order_by('-updated_at')[:10]

        recent_data = GrievanceListSerializer(
            recent, many=True, context={'request': request},
        ).data

        return Response({
            'counts': {
                'total': total,
                'status_breakdown': status_counts,
                'escalated': escalated_count,
                'spam': spam_count,
            },
            'departments': departments,
            'recent': recent_data,
        })


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated, IsSystemAdmin])
def export_grievances(request):
    """
    GET /api/reports/export/

    Exports grievances as a CSV file.  Django system admin only.
    Always returns CSV — do NOT pass ?format=csv (DRF has no CSV renderer,
    so that query param causes a 404 before this view runs).

    Supports optional query-parameter filters:
      - department (int)  — filter by department ID
      - status (str)      — filter by current_status
      - date_from (str)   — filter by created_at >= date
      - date_to (str)     — filter by created_at <= date

    The export excludes the submitter's identity for anonymous grievances.
    """
    qs = Grievance.objects.select_related(
        'category', 'department', 'user',
    ).order_by('-created_at')

    # Apply filters
    params = request.query_params

    dept = params.get('department')
    if dept:
        qs = qs.filter(department=dept)

    status_val = params.get('status')
    if status_val:
        qs = qs.filter(current_status=status_val.upper())

    date_from = params.get('date_from')
    if date_from:
        qs = qs.filter(created_at__date__gte=date_from)

    date_to = params.get('date_to')
    if date_to:
        qs = qs.filter(created_at__date__lte=date_to)

    # Build CSV response
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = (
        f'attachment; filename="grievances_export_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
    )

    writer = csv.writer(response)
    writer.writerow([
        'ID', 'Title', 'Status', 'Category', 'Department',
        'Submitter Name', 'Is Anonymous', 'Is Reopened',
        'Escalation Level', 'Created At', 'Updated At',
    ])

    for g in qs.iterator(chunk_size=200):
        submitter_name = (
            None if g.is_anonymous
            else (g.user.get_full_name() or g.user.username)
        )
        writer.writerow([
            g.id, g.title, g.current_status,
            g.category.name if g.category else '',
            g.department.name if g.department else '',
            submitter_name,
            g.is_anonymous, g.is_reopened,
            g.escalation_level,
            g.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            g.updated_at.strftime('%Y-%m-%d %H:%M:%S'),
        ])

    return response