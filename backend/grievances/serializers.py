from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import (
    AIAnalysis,
    Attachment,
    Category,
    Department,
    Grievance,
    Request,
    Response,
    StatusHistory,
)

User = get_user_model()


class CategorySerializer(serializers.ModelSerializer):
    """Simple read-only serializer for the Category model (reference endpoint)."""

    class Meta:
        model = Category
        fields = ['id', 'name', 'description']


class DepartmentSerializer(serializers.ModelSerializer):
    """Simple read-only serializer for the Department model (reference endpoint)."""

    class Meta:
        model = Department
        fields = ['id', 'name', 'department_type']


class AttachmentSerializer(serializers.ModelSerializer):
    """Serializer for the Attachment model — used in detail views."""

    class Meta:
        model = Attachment
        fields = ['id', 'file_name', 'file_type', 'file', 'uploaded_at']
        read_only_fields = ['id', 'file_name', 'file_type', 'uploaded_at']


class StatusHistorySerializer(serializers.ModelSerializer):
    """Read-only serializer for StatusHistory entries."""

    action_by_name = serializers.SerializerMethodField()

    def get_action_by_name(self, obj):
        if obj.action_by is None:
            return None
        full_name = obj.action_by.get_full_name()
        if full_name:
            return full_name
        if obj.action_by.role == 'CAMPUS_ADMIN':
            return 'Campus Administrator'
        return obj.action_by.username

    class Meta:
        model = StatusHistory
        fields = [
            'id', 'previous_status', 'new_status',
            'action_by', 'action_by_name', 'remarks', 'created_at',
        ]
        read_only_fields = fields


class ResponseSerializer(serializers.ModelSerializer):
    """Serializer for official HOD responses on a grievance."""

    responder_name = serializers.CharField(
        source='responder.get_full_name', read_only=True
    )

    class Meta:
        model = Response
        fields = ['id', 'responder', 'responder_name', 'content', 'created_at']
        read_only_fields = ['id', 'responder', 'responder_name', 'created_at']


class AIAnalysisSerializer(serializers.ModelSerializer):
    """Read-only serializer for AI analysis results."""

    class Meta:
        model = AIAnalysis
        fields = [
            'spam_prediction', 'confidence_score',
            'classification_reason', 'sentiment', 'analysis_timestamp',
        ]


class GrievanceListSerializer(serializers.ModelSerializer):
    """Compact serializer used in list views (no nested response/history trees)."""

    category_name = serializers.CharField(source='category.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    submitter_name = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()
    days_since_update = serializers.SerializerMethodField()
    escalated_to_name = serializers.CharField(
        source='escalated_to.get_full_name', read_only=True, allow_null=True
    )

    class Meta:
        model = Grievance
        fields = [
            'id', 'title', 'current_status', 'category', 'category_name',
            'department', 'department_name', 'is_anonymous', 'is_reopened',
            'escalation_level', 'escalated_to_name',
            'submitter_name', 'attachment_count', 'days_since_update',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_submitter_name(self, obj):
        """Return the submitter's full name unless the grievance is anonymous."""
        if obj.is_anonymous:
            return None
        return obj.user.get_full_name() or obj.user.username

    def get_attachment_count(self, obj):
        """Return the number of attachments (avoids prefetch overhead in listings)."""
        return getattr(obj, '_attachment_count', None) or obj.attachments.count()

    def get_days_since_update(self, obj):
        """Return the number of days since the last update."""
        from django.utils import timezone
        delta = timezone.now() - obj.updated_at
        return delta.days


class GrievanceCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating a new grievance.

    Handles file attachments through a separate `uploaded_files` field
    that is consumed in the view layer.
    """
    uploaded_files = serializers.ListField(
        child=serializers.FileField(),
        required=False,
        write_only=True,
        max_length=3,
        help_text="Up to 3 file attachments (PDF, DOC, DOCX, PNG, JPG, XLS, XLSX). Max 5 MB each.",
    )

    class Meta:
        model = Grievance
        fields = [
            'title', 'description', 'category', 'department',
            'is_anonymous', 'uploaded_files',
        ]
        extra_kwargs = {
            'department': {'required': False, 'allow_null': True},
        }

    def validate_title(self, value):
        """Title must be between 5 and 255 characters."""
        value = value.strip()
        if len(value) < 5:
            raise serializers.ValidationError('Title must be at least 5 characters.')
        return value

    def validate_description(self, value):
        """Description must be between 10 and 5000 characters."""
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError('Description must be at least 10 characters.')
        if len(value) > 5000:
            raise serializers.ValidationError('Description must not exceed 5000 characters.')
        return value

    def validate_uploaded_files(self, files):
        """Validate each file: type and size constraints."""
        allowed_types = {
            'application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png', 'image/jpeg',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }
        allowed_extensions = {'.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.xls', '.xlsx'}
        max_size = 5 * 1024 * 1024  # 5 MB

        for f in files:
            if f.size > max_size:
                raise serializers.ValidationError(
                    f'File "{f.name}" exceeds the 5 MB limit.'
                )
            # Check MIME type
            if f.content_type not in allowed_types:
                # Also check extension as a fallback
                ext = f.name[f.name.rfind('.'):].lower() if '.' in f.name else ''
                if ext not in allowed_extensions:
                    raise serializers.ValidationError(
                        f'File type "{f.content_type}" is not allowed for "{f.name}".'
                    )
        return files

    def create(self, validated_data):
        """Create the grievance, handling anonymous secret code generation."""
        uploaded_files = validated_data.pop('uploaded_files', [])

        request = self.context.get('request')
        user = request.user if request else None

        grievance = Grievance.objects.create(
            user=user,
            title=validated_data['title'],
            description=validated_data['description'],
            category=validated_data.get('category'),
            department=validated_data.get('department'),
            is_anonymous=validated_data.get('is_anonymous', False),
            current_status=Grievance.Status.SUBMITTED,
        )

        # Generate secret code for anonymous grievances
        if grievance.is_anonymous:
            from django.utils.crypto import get_random_string
            raw_code = get_random_string(8).upper()
            from django.contrib.auth.hashers import make_password
            grievance.secret_code = make_password(raw_code)
            grievance.save(update_fields=['secret_code'])
            # Store the raw code so the view can return it once
            self._raw_secret_code = raw_code

        # Create initial StatusHistory entry
        StatusHistory.objects.create(
            grievance=grievance,
            previous_status=None,
            new_status=Grievance.Status.SUBMITTED,
            action_by=user,
            remarks='Grievance submitted.',
        )

        # Create attachments
        for f in uploaded_files:
            Attachment.objects.create(
                grievance=grievance,
                file_name=f.name,
                file_type=f.content_type or 'application/octet-stream',
                file=f,
            )

        return grievance


class RequestSerializer(serializers.ModelSerializer):
    """
    Serializer for the unified Request model (appeals, reopens, escalations).
    """
    grievance_title = serializers.CharField(source='grievance.title', read_only=True)
    grievance_created_at = serializers.DateTimeField(source='grievance.created_at', read_only=True, allow_null=True)
    student_name = serializers.SerializerMethodField()
    reviewed_by_admin_name = serializers.CharField(source='reviewed_by_admin.get_full_name', read_only=True, allow_null=True)
    forwarded_department_name = serializers.CharField(source='forwarded_department.name', read_only=True, allow_null=True)
    request_type_display = serializers.CharField(source='get_request_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    original_status_display = serializers.CharField(source='get_original_status_display', read_only=True, allow_null=True)

    class Meta:
        model = Request
        fields = [
            'id', 'grievance', 'grievance_title', 'grievance_created_at',
            'student', 'student_name',
            'request_type', 'request_type_display', 'reason', 'attachment',
            'status', 'status_display', 'original_status', 'original_status_display',
            'created_at', 'reviewed_by_admin',
            'reviewed_by_admin_name', 'forwarded_department',
            'forwarded_department_name', 'admin_remark', 'resolved_at',
        ]
        read_only_fields = [
            'id', 'student', 'status', 'original_status', 'created_at', 'reviewed_by_admin',
            'forwarded_department', 'admin_remark', 'resolved_at'
        ]

    def get_student_name(self, obj):
        if obj.student:
            return obj.student.get_full_name() or obj.student.username
        if obj.grievance and obj.grievance.user:
            if obj.grievance.is_anonymous:
                return "Anonymous"
            return obj.grievance.user.get_full_name() or obj.grievance.user.username
        return "System Auto-Escalation"


class GrievanceDetailSerializer(serializers.ModelSerializer):
    """
    Full-detail serializer for a single grievance.

    Includes nested responses, status history, AI analysis, attachments, and requests.
    """

    category_name = serializers.CharField(source='category.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    submitter = serializers.IntegerField(source='user_id', read_only=True)
    submitter_name = serializers.SerializerMethodField()
    escalated_to_name = serializers.CharField(
        source='escalated_to.get_full_name', read_only=True, allow_null=True
    )
    responses = ResponseSerializer(many=True, read_only=True)
    status_history = StatusHistorySerializer(many=True, read_only=True)
    ai_analysis = AIAnalysisSerializer(read_only=True, allow_null=True)
    attachments = AttachmentSerializer(many=True, read_only=True)
    requests = RequestSerializer(many=True, read_only=True)

    class Meta:
        model = Grievance
        fields = [
            'id', 'title', 'description', 'current_status',
            'category', 'category_name', 'department', 'department_name',
            'is_anonymous', 'is_reopened', 'escalation_level',
            'escalated_to_name', 'submitter', 'submitter_name',
            'responses', 'status_history', 'ai_analysis', 'attachments',
            'requests', 'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_submitter_name(self, obj):
        if obj.is_anonymous:
            return None
        return obj.user.get_full_name() or obj.user.username


class GrievanceTrackSerializer(serializers.Serializer):
    """
    Serializer for anonymous grievance tracking.

    Accepts a grievance ID and the plain-text secret code issued at creation.
    """
    id = serializers.IntegerField()
    secret_code = serializers.CharField()
