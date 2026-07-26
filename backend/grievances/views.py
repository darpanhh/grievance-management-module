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

from django.contrib.auth.hashers import check_password
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, Throttled
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Department
from .models import AIAnalysis, Category, Grievance, StatusHistory
from .permissions import IsCampusAdmin
from .serializers import (
    AIAnalysisSerializer,
    CategorySerializer,
    DepartmentSerializer,
    GrievanceCreateSerializer,
    GrievanceDetailSerializer,
    GrievanceListSerializer,
    GrievanceTrackSerializer,
)
from .services.spam_detector import MLSpamDetector
from .services.routing import route_grievance
from .services.escalation_service import (
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

        return qs.order_by('-created_at')

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
                    'You have reached the maximum limit of 3 grievances '
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

        if result['spam_prediction']:
            # Mark as spam and log the transition
            grievance.current_status = Grievance.Status.SPAM
            grievance.save(update_fields=['current_status'])

            StatusHistory.objects.create(
                grievance=grievance,
                previous_status=Grievance.Status.SUBMITTED,
                new_status=Grievance.Status.SPAM,
                action_by=request.user,
                remarks=(
                    f"Flagged as spam by AI detector "
                    f"(confidence: {result['confidence_score']:.2f}). "
                    f"{result['classification_reason']}"
                ),
            )
        else:
            # --------------------------------------------------------------
            # Phase 5 — Automatic Routing
            # --------------------------------------------------------------
            # Only route non-spam grievances.  The routing service is
            # responsible for setting the target department (selected or
            # fallback) and transitioning the status to UNDER_REVIEW.
            route_grievance(
                grievance,
                action_by=request.user,
            )

        # Build response data
        data = GrievanceDetailSerializer(grievance, context={'request': request}).data

        # Notify the HOD about the new grievance
        if not result['spam_prediction']:
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

        if user.role == 'STUDENT':
            qs = qs.filter(user=user)
        elif user.role in ('STAFF', 'HOD'):
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
# Phase 4 — AI Spam Filtering: Admin Queue & Appeal
# ---------------------------------------------------------------------------


class SpamQueueView(generics.ListAPIView):
    """
    GET /api/admin/spam-queue/

    Lists all grievances currently classified as SPAM.  Campus Admin only.

    Returns a paginated list with the spam confidence score and reason
    so the admin can decide whether to reinstate or confirm the spam
    classification.
    """

    serializer_class = GrievanceListSerializer
    permission_classes = (permissions.IsAuthenticated, IsCampusAdmin)
    pagination_class = None  # Spam queue is typically small

    def get_queryset(self):
        return Grievance.objects.filter(
            current_status=Grievance.Status.SPAM,
        ).select_related(
            'category', 'department', 'user',
        ).order_by('-updated_at')


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def reinstate_spam(request, pk):
    """
    POST /api/admin/spam-queue/{pk}/reinstate/

    Campus Admin only.  Reverses the spam classification — transitions the
    grievance from SPAM back to SUBMITTED so it can enter the normal
    routing workflow.

    Logs a StatusHistory entry for the transition.
    """
    if request.user.role != 'CAMPUS_ADMIN':
        raise PermissionDenied('Only Campus Admins can reinstate grievances.')

    grievance = get_object_or_404(
        Grievance.objects.select_related('ai_analysis'),
        pk=pk,
        current_status=Grievance.Status.SPAM,
    )

    # Update the AI analysis record to reflect the override
    try:
        ai = grievance.ai_analysis
        ai.spam_prediction = False
        ai.classification_reason = (
            f"Overridden by admin ({request.user.get_full_name() or request.user.username}). "
            f"Original result: {ai.classification_reason}"
        )
        ai.save(update_fields=['spam_prediction', 'classification_reason'])
    except AIAnalysis.DoesNotExist:
        pass

    # Transition status
    previous = grievance.current_status
    grievance.current_status = Grievance.Status.SUBMITTED
    grievance.save(update_fields=['current_status'])

    StatusHistory.objects.create(
        grievance=grievance,
        previous_status=previous,
        new_status=Grievance.Status.SUBMITTED,
        action_by=request.user,
        remarks='Grievance reinstated by Campus Admin — spam classification overridden.',
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
# Phase 6 — Response & Escalation Workflow
# ---------------------------------------------------------------------------

VALID_TRANSITIONS = {
    Grievance.Status.SUBMITTED: {
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.SPAM,
    },
    Grievance.Status.SPAM: {
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
        Grievance.Status.RESOLVED,
    },
    Grievance.Status.RESOLVED: {
        Grievance.Status.CLOSED,
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

    Allows an HOD to respond to a grievance that is UNDER_REVIEW or
    REOPENED.  The HOD must belong to the grievance's assigned department.

    Creates a ``Response`` record and transitions the grievance status
    to RESPONDED.
    """
    if request.user.role != 'HOD':
        raise PermissionDenied('Only HODs can respond to grievances.')

    grievance = get_object_or_404(
        Grievance.objects.select_related('department'),
        pk=pk,
    )

    # HOD must belong to the grievance's department
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

    detail = GrievanceDetailSerializer(grievance, context={'request': request}).data
    return Response(detail, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
def resolve_grievance(request, pk):
    """
    POST /api/grievances/{pk}/resolve/

    Allows the original submitter to resolve their own grievance when
    the status is RESPONDED.  Transitions to RESOLVED.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    if grievance.user != request.user:
        raise PermissionDenied('You can only resolve your own grievance.')

    if grievance.current_status != Grievance.Status.RESPONDED:
        return Response(
            {'error': 'Grievance must be in RESPONDED status to resolve.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Transition status (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    grievance._action_remarks = 'Resolved by the submitter.'
    grievance.current_status = Grievance.Status.RESOLVED
    grievance.save(update_fields=['current_status'])

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
    status is RESPONDED.  Sets ``is_reopened=True`` and transitions
    to REOPENED.
    """
    grievance = get_object_or_404(Grievance, pk=pk)

    if grievance.user != request.user:
        raise PermissionDenied('You can only reopen your own grievance.')

    if grievance.current_status != Grievance.Status.RESPONDED:
        return Response(
            {'error': 'Grievance must be in RESPONDED status to reopen.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Transition status (signal auto-logs StatusHistory)
    grievance._action_by = request.user
    grievance._action_remarks = 'Reopened by the submitter for further review.'
    grievance.is_reopened = True
    grievance.current_status = Grievance.Status.REOPENED
    grievance.save(update_fields=['is_reopened', 'current_status'])

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
