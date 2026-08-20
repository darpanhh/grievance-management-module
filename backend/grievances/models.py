from django.db import models
from django.conf import settings
from accounts.models import Department

class Category(models.Model):
    """
    Standardized categories shared across all academic departments.
    SRS Reference: Section 5 & 7.2
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, default='')

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['name']

    def __str__(self):
        return self.name

class Grievance(models.Model):
    """
    Core Grievance model shared by both anonymous and authenticated submissions.
    SRS Reference: Section 7.3
    """
    class Status(models.TextChoices):
        SUBMITTED = 'SUBMITTED', 'Submitted'
        UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
        IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
        REOPENED = 'REOPENED', 'Reopened'
        ESCALATED = 'ESCALATED', 'Escalated'
        RESOLVED = 'RESOLVED', 'Resolved'
        REJECTED = 'REJECTED', 'Rejected'
        CLOSED = 'CLOSED', 'Closed'

    class SpamReviewStatus(models.TextChoices):
        REVIEW = 'REVIEW', 'Needs Review'
        SPAM = 'SPAM', 'Confirmed Spam'
        NOT_SPAM = 'NOT_SPAM', 'Not Spam'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='grievances',
        help_text="The submitting user (retained internally for audits even if submitted anonymously)."
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        related_name='grievances',
        null=True,
        blank=True,
        help_text="The department responsible for handling this grievance."
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name='grievances',
        help_text="The classification category of the grievance."
    )
    title = models.CharField(max_length=255)
    description = models.TextField(help_text="Description of the grievance (10 to 5000 characters).")
    current_status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SUBMITTED
    )
    is_anonymous = models.BooleanField(default=False)
    is_sensitive = models.BooleanField(
        default=False,
        help_text="Flags that the grievance contains sensitive content that department staff/HOD/Campus Admin must confirm before viewing."
    )
    secret_code = models.CharField(
        max_length=128,
        blank=True,
        null=True,
        help_text="Hashed secret code issued to anonymous submitters for tracking (plain-text shown once at creation)."
    )
    is_reopened = models.BooleanField(
        default=False,
        help_text="Flag distinguishing repeated review cycles from the first pass."
    )
    escalation_level = models.PositiveSmallIntegerField(
        default=0,
        help_text="Current escalation level (0 = normal, 1+, 2+, etc.).",
    )
    escalated_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='escalated_grievances',
        help_text="The officer this grievance was escalated to.",
    )
    spam_status = models.CharField(
        max_length=20,
        choices=SpamReviewStatus.choices,
        null=True,
        blank=True,
        default=None,
        help_text=(
            "Department-side spam classification (null = never flagged by AI). "
            "REVIEW = AI flagged, awaiting department decision; SPAM = confirmed "
            "spam (kept out of the normal workflow); NOT_SPAM = accepted as genuine."
        ),
    )
    spam_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='spam_reviews',
        help_text="Department officer who made the final spam decision.",
    )
    spam_reviewed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the department officer made the final spam decision.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        anonymous_tag = " (Anonymous)" if self.is_anonymous else ""
        return f"GMS-{self.id:04d}: {self.title}{anonymous_tag} [{self.get_current_status_display()}]"

class AIAnalysis(models.Model):
    """
    AI-generated analysis results for a grievance.
    SRS Reference: Section 7.4
    """
    grievance = models.OneToOneField(
        Grievance,
        on_delete=models.CASCADE,
        related_name='ai_analysis'
    )
    spam_prediction = models.BooleanField(default=False, help_text="True if flagged as spam by AI.")
    confidence_score = models.FloatField(help_text="Spam confidence score between 0.0 and 1.0.")
    classification_reason = models.TextField(blank=True, default='')
    sentiment = models.CharField(max_length=50, blank=True, null=True, help_text="Future sentiment analysis output.")
    analysis_timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "AI Analysis"
        verbose_name_plural = "AI Analyses"

    def __str__(self):
        spam_status = "Spam" if self.spam_prediction else "Ham"
        return f"AI Analysis for GMS-{self.grievance.id:04d} ({spam_status}, Confidence: {self.confidence_score:.2f})"

class Response(models.Model):
    """
    Official responses from Heads of Departments (HODs) regarding grievances.
    SRS Reference: Section 7.5
    """
    grievance = models.ForeignKey(
        Grievance,
        on_delete=models.CASCADE,
        related_name='responses'
    )
    responder = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='responses',
        help_text="The HOD who responded to the grievance."
    )
    content = models.TextField(help_text="The body content of the response.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"Response by {self.responder.username} on GMS-{self.grievance.id:04d} at {self.created_at.strftime('%Y-%m-%d %H:%M')}"

class StatusHistory(models.Model):
    """
    Records every status transition of a grievance for history, escalation tracking, and audit.
    SRS Reference: Section 7.6
    """
    grievance = models.ForeignKey(
        Grievance,
        on_delete=models.CASCADE,
        related_name='status_history'
    )
    previous_status = models.CharField(max_length=20, choices=Grievance.Status.choices, null=True, blank=True)
    new_status = models.CharField(max_length=20, choices=Grievance.Status.choices)
    action_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='status_actions',
        help_text="User who triggered this transition (null if triggered by system auto-escalation)."
    )
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Status History"
        verbose_name_plural = "Status Histories"
        ordering = ['created_at']

    def __str__(self):
        return f"GMS-{self.grievance.id:04d}: {self.previous_status} -> {self.new_status} at {self.created_at.strftime('%Y-%m-%d %H:%M')}"

class Attachment(models.Model):
    """
    Uploaded attachments associated with a grievance.
    SRS Reference: Section 7.8
    """
    grievance = models.ForeignKey(
        Grievance,
        on_delete=models.CASCADE,
        related_name='attachments'
    )
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=100)
    file = models.FileField(upload_to='grievance_attachments/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return f"Attachment '{self.file_name}' for GMS-{self.grievance.id:04d}"


class ReopenAttachment(models.Model):
    """
    Uploaded attachments associated with a grievance reopen request.
    Stored separately from original grievance attachments.
    """
    grievance = models.ForeignKey(
        Grievance,
        on_delete=models.CASCADE,
        related_name='reopen_attachments'
    )
    file_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=100)
    file = models.FileField(upload_to='reopen_attachments/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['uploaded_at']

    def __str__(self):
        return f"Reopen Attachment '{self.file_name}' for GMS-{self.grievance.id:04d}"


class StatusComment(models.Model):
    """
    A reminder comment posted by the submitter (student/staff) when a
    grievance stays in UNDER_REVIEW or IN_PROGRESS for a long time.

    One comment per status — enforced by the (grievance, status) unique
    constraint.  The comment nudges the department HOD to act on a stuck
    grievance.
    """
    grievance = models.ForeignKey(
        Grievance,
        on_delete=models.CASCADE,
        related_name='status_comments',
        help_text="The grievance this reminder comment belongs to."
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='status_comments',
        help_text="The submitter who posted the reminder comment."
    )
    status = models.CharField(
        max_length=20,
        choices=Grievance.Status.choices,
        help_text="The grievance status this comment was posted for "
                  "(UNDER_REVIEW or IN_PROGRESS)."
    )
    content = models.TextField(help_text="The reminder comment asking for a status update.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['grievance', 'status'],
                name='unique_status_comment_per_status',
            ),
        ]

    def __str__(self):
        return (
            f"Reminder comment ({self.get_status_display()}) "
            f"on GMS-{self.grievance.id:04d} by {self.user.username}"
        )


class Request(models.Model):
    """
    Unified Request model handling student appeals (rejection, spam),
    reopening requests, and system escalations for Campus Admin review.
    """
    class RequestType(models.TextChoices):
        REOPEN = 'REOPEN', 'Reopen Request'
        REJECTION_APPEAL = 'REJECTION_APPEAL', 'Rejection Appeal'
        SPAM_APPEAL = 'SPAM_APPEAL', 'Spam Appeal'
        ESCALATION = 'ESCALATION', 'Escalation'

    class RequestStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        FORWARDED = 'FORWARDED', 'Forwarded'
        REJECTED = 'REJECTED', 'Rejected'
        RESOLVED = 'RESOLVED', 'Resolved'
        CLOSED = 'CLOSED', 'Closed'

    grievance = models.ForeignKey(
        Grievance,
        on_delete=models.CASCADE,
        related_name='requests',
        help_text="The grievance associated with this request."
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submitted_requests',
        help_text="The student/user submitting the request (null for automated escalations)."
    )
    request_type = models.CharField(
        max_length=30,
        choices=RequestType.choices,
        help_text="Type of request (REOPEN, REJECTION_APPEAL, SPAM_APPEAL, ESCALATION)."
    )
    reason = models.TextField(
        help_text="Mandatory justification provided by student or system."
    )
    attachment = models.FileField(
        upload_to='request_attachments/',
        null=True,
        blank=True,
        help_text="Optional supporting document attached to request."
    )
    status = models.CharField(
        max_length=20,
        choices=RequestStatus.choices,
        default=RequestStatus.PENDING,
        help_text="Current review status of the request."
    )
    original_status = models.CharField(
        max_length=20,
        choices=Grievance.Status.choices,
        null=True,
        blank=True,
        help_text="Grievance status before the request was submitted — restored if the request is rejected."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_by_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_requests',
        help_text="Campus Admin who reviewed this request."
    )
    forwarded_department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='forwarded_requests',
        help_text="Department this request was forwarded to by the admin."
    )
    admin_remark = models.TextField(
        blank=True,
        default='',
        help_text="Remarks/notes added by Campus Admin during review."
    )
    resolved_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when admin resolved (forwarded or rejected) the request."
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_request_type_display()} for GMS-{self.grievance.id:04d} [{self.get_status_display()}]"


class SystemSettings(models.Model):
    """
    Singleton model that stores runtime-configurable system settings.
    Campus Admin can adjust these via the API without touching .env or code.

    Only one row is ever allowed (enforced by save() override).
    Use SystemSettings.get() as the canonical accessor.
    """
    daily_grievance_limit = models.PositiveSmallIntegerField(
        default=3,
        help_text="Maximum number of grievances a user can submit per calendar day.",
    )
    escalation_hours = models.FloatField(
        default=168.0,
        help_text="Hours of inactivity before a grievance is auto-escalated (e.g. 168 = 7 days).",
    )
    escalation_interval_min = models.FloatField(
        default=60.0,
        help_text="How often (in minutes) the escalation checker runs.",
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='settings_updates',
        help_text="Campus Admin who last modified these settings.",
    )

    class Meta:
        verbose_name = "System Settings"
        verbose_name_plural = "System Settings"

    def __str__(self):
        return (
            f"SystemSettings — limit={self.daily_grievance_limit}/day, "
            f"escalation={self.escalation_hours}h every {self.escalation_interval_min}min"
        )

    def save(self, *args, **kwargs):
        """Enforce singleton: always use pk=1."""
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        """Return the singleton, creating it with defaults if it doesn't exist yet."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
