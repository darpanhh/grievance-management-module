"""
Views for the Grievance application.

Phase 3: Grievance Submission & Rate Limiting
Phase 4+: To be extended with spam, routing, escalation, and dashboard views.
"""

from django.contrib.auth.hashers import check_password
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import Throttled
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Department
from .models import Category, Grievance, StatusHistory
from .serializers import (
    CategorySerializer,
    DepartmentSerializer,
    GrievanceCreateSerializer,
    GrievanceDetailSerializer,
    GrievanceListSerializer,
    GrievanceTrackSerializer,
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
      - STUDENT:     Own grievances only
      - STAFF/HOD:   Grievances in the user's department
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

        if user.role == 'STUDENT':
            qs = qs.filter(user=user)
        elif user.role in ('STAFF', 'HOD'):
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
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.check_throttles(request)
        grievance = serializer.save()

        # Build response data
        data = GrievanceDetailSerializer(grievance, context={'request': request}).data

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
