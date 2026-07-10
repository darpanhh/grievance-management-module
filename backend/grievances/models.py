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
        SPAM = 'SPAM', 'Spam'
        UNDER_REVIEW = 'UNDER_REVIEW', 'Under Review'
        RESPONDED = 'RESPONDED', 'Responded'
        REOPENED = 'REOPENED', 'Reopened'
        ESCALATED = 'ESCALATED', 'Escalated'
        RESOLVED = 'RESOLVED', 'Resolved'
        CLOSED = 'CLOSED', 'Closed'

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
    secret_code = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Unique secret code issued to anonymous submitters for tracking."
    )
    is_reopened = models.BooleanField(
        default=False,
        help_text="Flag distinguishing repeated review cycles from the first pass."
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
    previous_status = models.CharField(max_length=20, choices=Grievance.Status.choices)
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
