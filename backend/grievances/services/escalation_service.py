"""
APScheduler-based escalation service for overdue grievances.

Runs on a periodic schedule (default: every 60 minutes) and:

  1. Finds grievances in SUBMITTED / UNDER_REVIEW / REOPENED that haven't
     been updated within ESCALATION_HOURS (default: 168h / 7 days)
  2. Sets escalation_level = 1, status = ESCALATED
  3. Assigns an active Campus Admin
  4. Sends an HTML email notification to the assigned officer
  5. Logs StatusHistory entries for audit

Statuses intentionally excluded from auto-escalation:
  - RESPONDED:  Department has acted; student decides to accept or reopen.
  - ESCALATED:  Already escalated — must not be re-queued.
  - RESOLVED, CLOSED, REJECTED, SPAM:  Terminal / no further action needed.
"""

from __future__ import annotations

import logging
import threading

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Exists, OuterRef
from django.template.loader import render_to_string
from django.utils import timezone

from accounts.models import User
from grievances.models import Grievance, Request

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Escalation logic
# ---------------------------------------------------------------------------


def get_escalation_hours() -> int:
    """Return the inactivity threshold (hours) from settings."""
    return getattr(settings, 'ESCALATION_HOURS', 168)


def format_inactivity_window() -> str:
    """Human-readable inactivity window (e.g. '7 days' or '36 hours')."""
    hours = get_escalation_hours()
    if hours % 24 == 0:
        days = int(hours // 24)
        return f"{days} day{'s' if days != 1 else ''}"
    return f"{hours:g} hour{'s' if hours != 1 else ''}"


def find_next_officer(grievance: Grievance) -> User | None:  # noqa: ARG001
    """
    Pick a Campus Admin to assign the escalation to.

    HODs and Campus Admins are mutually exclusive roles, so no exclusion
    filter is required — any active Campus Admin is a valid assignee.
    Returns ``None`` if no active Campus Admin is found.
    """
    return (
        User.objects.filter(role=User.Role.CAMPUS_ADMIN, is_active=True)
        .order_by('?')
        .first()
    )


def find_stale_grievances() -> list[Grievance]:
    """
    Query all grievances that have been inactive for longer than the
    escalation threshold and are awaiting action.

    Eligible statuses:
      - SUBMITTED:   Grievance filed but no HOD action taken yet.
      - UNDER_REVIEW: Assigned HOD has not responded within the window.
      - REOPENED:    Student reopened the grievance; no follow-up taken.

    Intentionally excluded:
      - RESPONDED:  Department acted; student must accept or reopen — not
                    the department's responsibility to act further.
      - ESCALATED:  Already escalated — must not be selected again.
      - RESOLVED, CLOSED, REJECTED, SPAM: Terminal statuses.
      - Recently rejected escalations: if a Campus Admin has already
        rejected an escalation and there has been no new activity since,
        the grievance is not re-escalated (prevents a reject -> re-escalate
        loop). New activity (e.g. an HOD response) re-enables escalation.
    """
    hours = get_escalation_hours()
    cutoff = timezone.now() - timezone.timedelta(hours=hours)

    eligible_statuses = [
        Grievance.Status.SUBMITTED,
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.REOPENED,
    ]

    rejected_recently = Request.objects.filter(
        grievance_id=OuterRef('pk'),
        request_type=Request.RequestType.ESCALATION,
        status=Request.RequestStatus.REJECTED,
        resolved_at__gt=OuterRef('updated_at'),
    )

    stale = list(
        Grievance.objects.filter(
            current_status__in=eligible_statuses,
            updated_at__lt=cutoff,
        )
        # Spam-handled grievances (awaiting review or confirmed spam) never
        # run an escalation timer — they stay out of the normal workflow
        # until the department officer decides on the AI flag.
        .exclude(
            spam_status__in=[
                Grievance.SpamReviewStatus.REVIEW,
                Grievance.SpamReviewStatus.SPAM,
            ]
        )
        .exclude(Exists(rejected_recently))
        .select_related('department', 'user')
        .iterator()
    )
    return stale


def escalate(grievance: Grievance) -> bool:
    """
    Escalate *grievance* to a Campus Admin.

    Returns ``True`` on success, ``False`` if no officer was available.
    """
    next_officer = find_next_officer(grievance)
    if next_officer is None:
        logger.warning(
            'GMS-%04d: no Campus Admin found for escalation',
            grievance.id,
        )
        return False

    admin_name = next_officer.get_full_name() or next_officer.username
    previous_status = grievance.current_status

    # Set escalation fields and status — the pre_save signal auto-logs the
    # StatusHistory entry with `_action_by=None` (System).
    grievance.escalation_level = 1
    grievance.escalated_to = next_officer
    grievance.current_status = Grievance.Status.ESCALATED
    grievance._action_by = None  # system action
    grievance._action_remarks = (
        f"Auto-escalated after {format_inactivity_window()} of inactivity. "
        f"Assigned to {admin_name}."
    )
    grievance.save(update_fields=[
        'escalation_level', 'escalated_to',
        'current_status', 'updated_at',
    ])

    # Create unified Request record for Campus Admin queue. The pre-escalation
    # status is stored in `original_status` so that rejecting the escalation
    # can restore the grievance to its previous workflow state.
    Request.objects.create(
        grievance=grievance,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason=f"System auto-escalated after {format_inactivity_window()} of inactivity without resolution.",
        status=Request.RequestStatus.PENDING,
        original_status=previous_status,
    )

    # Send email
    send_escalation_email(grievance, next_officer)

    logger.info(
        'GMS-%04d escalated → %s (%s)',
        grievance.id, admin_name, next_officer.email,
    )
    return True


def run_escalation_cycle() -> dict:
    """
    Full escalation cycle — called by APScheduler every interval.

    Returns ``{"checked": int, "escalated": int, "failed": int}``.
    """
    stale = find_stale_grievances()
    if not stale:
        logger.info('Escalation cycle: no stale grievances found.')
        return {'checked': 0, 'escalated': 0, 'failed': 0}

    escalated = failed = 0
    for grievance in stale:
        try:
            if escalate(grievance):
                escalated += 1
            else:
                failed += 1
        except Exception as exc:
            logger.exception('GMS-%04d: escalation failed: %s', grievance.id, exc)
            failed += 1

    logger.info(
        'Escalation cycle: %d stale, %d escalated, %d failed',
        len(stale), escalated, failed,
    )
    return {'checked': len(stale), 'escalated': escalated, 'failed': failed}


# ---------------------------------------------------------------------------
# Email notifications (submission, response, resolution)
# ---------------------------------------------------------------------------


def send_email_async(subject: str, message: str, recipient_list: list[str],
                     html_message: str | None = None,
                     from_email: str | None = None) -> None:
    """
    Send an email on a background thread so the HTTP request never blocks
    on SMTP.  Failures are logged, never raised — the caller's response
    does not depend on email delivery.
    """
    from_email = from_email or settings.DEFAULT_FROM_EMAIL

    def _send() -> None:
        try:
            send_mail(
                subject,
                message,
                from_email,
                recipient_list,
                html_message=html_message,
                fail_silently=False,
            )
        except Exception as exc:
            logger.error('Background email to %s failed: %s', recipient_list, exc)

    threading.Thread(
        target=_send,
        name='gms-email',
        daemon=True,
    ).start()


def send_submission_email(grievance: Grievance) -> None:
    """
    Notify the HOD of the grievance's department when a new grievance is
    submitted and routed to them.
    """
    if not grievance.department:
        return

    hod = grievance.department.users.filter(role=User.Role.HOD).first()
    if not hod or not hod.email:
        logger.info(
            'GMS-%04d: no HOD email found for department %s',
            grievance.id, grievance.department.name,
        )
        return

    submitter = (
        grievance.user.get_full_name() or grievance.user.username
        if not grievance.is_anonymous else 'Anonymous'
    )

    subject = (
        f"[GMS] New Grievance — GMS-{grievance.id:04d}: {grievance.title}"
    )
    text_message = (
        f"Dear {hod.get_full_name() or hod.username},\n\n"
        f"A new grievance has been submitted to your department.\n\n"
        f"Grievance: GMS-{grievance.id:04d}\n"
        f"Title: {grievance.title}\n"
        f"Category: {grievance.category.name if grievance.category else 'N/A'}\n"
        f"Submitted by: {submitter}\n"
        f"Description:\n{grievance.description[:500]}\n\n"
        f"Please log in to respond.\n\n"
        f"Regards,\nGrievance Management System"
    )

    html_message = render_to_string(
        'emails/submission_notification.html',
        {
            'grievance': grievance,
            'hod': hod,
            'submitter': submitter,
            'site_name': 'Grievance Management System',
        },
    )

    send_email_async(
        subject,
        text_message,
        [hod.email],
        html_message=html_message,
    )
    logger.info('Submission email queued for HOD %s (%s) for GMS-%04d',
                hod.get_full_name(), hod.email, grievance.id)


def send_response_email(grievance: Grievance) -> None:
    """
    Notify the submitter when their grievance receives a response from the HOD.
    """
    user = grievance.user
    if not user or not user.email:
        logger.info('GMS-%04d: no submitter email', grievance.id)
        return

    hod = grievance.department.users.filter(role=User.Role.HOD).first()
    hod_name = hod.get_full_name() or hod.username if hod else 'HOD'

    subject = (
        f"[GMS] Response Received — GMS-{grievance.id:04d}: {grievance.title}"
    )
    text_message = (
        f"Dear {user.get_full_name() or user.username},\n\n"
        f"Your grievance has received a response from {hod_name}.\n\n"
        f"Grievance: GMS-{grievance.id:04d}\n"
        f"Title: {grievance.title}\n"
        f"Status: {grievance.get_current_status_display()}\n\n"
        f"Please log in to view the response. "
        f"If satisfied, you can resolve the grievance. "
        f"Otherwise, you may request further review.\n\n"
        f"Regards,\nGrievance Management System"
    )

    html_message = render_to_string(
        'emails/response_notification.html',
        {'grievance': grievance, 'user': user, 'hod_name': hod_name,
         'site_name': 'Grievance Management System'},
    )

    send_email_async(
        subject,
        text_message,
        [user.email],
        html_message=html_message,
    )
    logger.info('Response email queued for %s (%s) for GMS-%04d',
                user.get_full_name(), user.email, grievance.id)


def send_resolution_email(grievance: Grievance) -> None:
    """
    Notify the submitter that their grievance has been resolved.
    """
    user = grievance.user
    if not user or not user.email:
        logger.info('GMS-%04d: no submitter email for resolution notice',
                    grievance.id)
        return

    subject = (
        f"[GMS] Grievance Resolved — GMS-{grievance.id:04d}: {grievance.title}"
    )
    text_message = (
        f"Dear {user.get_full_name() or user.username},\n\n"
        f"Your grievance has been marked as resolved.\n\n"
        f"Grievance: GMS-{grievance.id:04d}\n"
        f"Title: {grievance.title}\n"
        f"Status: {grievance.get_current_status_display()}\n\n"
        f"Thank you for using the Grievance Management System.\n\n"
        f"Regards,\nGrievance Management System"
    )

    html_message = render_to_string(
        'emails/resolution_notification.html',
        {'grievance': grievance, 'user': user,
         'site_name': 'Grievance Management System'},
    )

    send_email_async(
        subject,
        text_message,
        [user.email],
        html_message=html_message,
    )
    logger.info('Resolution email queued for %s (%s) for GMS-%04d',
                user.get_full_name(), user.email, grievance.id)


# ---------------------------------------------------------------------------
# Escalation email
# ---------------------------------------------------------------------------


def send_escalation_email(grievance: Grievance, officer: User) -> None:
    """
    Send an HTML email to *officer* notifying them about the escalated
    grievance.
    """
    subject = (
        f"[GMS] Escalated — GMS-{grievance.id:04d}: {grievance.title}"
    )

    context = {
        'grievance': grievance,
        'officer': officer,
        'status_display': grievance.get_current_status_display(),
        'submitter': (
            grievance.user.get_full_name() or grievance.user.username
            if not grievance.is_anonymous else 'Anonymous'
        ),
        'department': grievance.department.name if grievance.department else 'N/A',
        'category': grievance.category.name if grievance.category else 'N/A',
        'description': grievance.description,
        'created_at': grievance.created_at,
        'updated_at': grievance.updated_at,
        'grievance_url': (
            f"{settings.BASE_URL or 'http://localhost:8000'}"
            f"/api/grievances/{grievance.pk}/"
        ),
        'site_name': 'Grievance Management System',
    }

    text_message = (
        f"Dear {officer.get_full_name() or officer.username},\n\n"
        f"A grievance has been escalated and requires your attention.\n\n"
        f"Grievance: GMS-{grievance.id:04d}\n"
        f"Title: {grievance.title}\n"
        f"Category: {context['category']}\n"
        f"Department: {context['department']}\n"
        f"Submitted by: {context['submitter']}\n"
        f"Current status: {context['status_display']}\n"
        f"Submitted: {timezone.localtime(grievance.created_at).strftime('%Y-%m-%d %H:%M')}\n"
        f"Last updated: {timezone.localtime(grievance.updated_at).strftime('%Y-%m-%d %H:%M')}\n\n"
        f"{grievance.description[:500]}\n\n"
        f"Please log in to the Grievance Management System to take action.\n"
        f"View: {context['grievance_url']}\n\n"
        f"Regards,\nGrievance Management System"
    )

    html_message = render_to_string(
        'emails/escalation_notification.html',
        context,
    )

    send_email_async(
        subject,
        text_message,
        [officer.email],
        html_message=html_message,
    )
    logger.info(
        'Escalation email queued for %s (%s) for GMS-%04d',
        officer.email, officer.get_full_name(), grievance.id,
    )


def send_request_notification_email(
    grievance: Grievance,
    request_type: str,
    reason: str = '',
) -> None:
    """
    Notify the reviewer when a submitter files a request that needs review.
    Escalation and reopen requests are reviewed by Campus Admin.
    """
    recipients = [
        admin.email
        for admin in User.objects.filter(
            role=User.Role.CAMPUS_ADMIN,
            is_active=True,
        )
        if admin.email
    ]
    recipient_label = 'Campus Admin'
    if not recipients:
        logger.info(
            'GMS-%04d: no %s email found for request notification',
            grievance.id,
            recipient_label,
        )
        return

    type_labels = {
        Request.RequestType.SPAM_APPEAL: 'Spam Appeal',
        Request.RequestType.REOPEN: 'Reopen Request',
        Request.RequestType.ESCALATION: 'Escalation',
    }
    type_label = type_labels.get(
        request_type,
        request_type.replace('_', ' ').title(),
    )

    submitter = (
        grievance.user.get_full_name() or grievance.user.username
        if not grievance.is_anonymous else 'Anonymous'
    )
    grievance_url = (
        f"{settings.BASE_URL or 'http://localhost:8000'}"
        f"/api/grievances/{grievance.pk}/"
    )

    subject = (
        f"[GMS] {type_label} — GMS-{grievance.id:04d}: {grievance.title}"
    )
    text_message = (
        f"Dear {recipient_label},\n\n"
        f"A student has submitted a {type_label} that requires your review.\n\n"
        f"Grievance: GMS-{grievance.id:04d}\n"
        f"Title: {grievance.title}\n"
        f"Category: {grievance.category.name if grievance.category else 'N/A'}\n"
        f"Department: {grievance.department.name if grievance.department else 'N/A'}\n"
        f"Submitted by: {submitter}\n"
        f"Status: {grievance.get_current_status_display()}\n"
        f"Reason: {reason or 'N/A'}\n\n"
        f"Please log in to the Grievance Management System to review this request.\n"
        f"View: {grievance_url}\n\n"
        f"Regards,\nGrievance Management System"
    )

    html_message = render_to_string(
        'emails/request_notification.html',
        {
            'grievance': grievance,
            'request_type_label': type_label,
            'submitter': submitter,
            'reason': reason,
            'grievance_url': grievance_url,
            'site_name': 'Grievance Management System',
        },
    )

    send_email_async(
        subject,
        text_message,
        recipients,
        html_message=html_message,
    )
    logger.info(
        'Request notification email queued for %s %s for GMS-%04d',
        recipient_label, recipients, grievance.id,
    )


def send_comment_notification_email(
    grievance: Grievance,
    comment_content: str,
) -> None:
    """
    Notify the department HOD when the submitter posts a status-reminder
    comment on a grievance stuck in UNDER_REVIEW or IN_PROGRESS.
    """
    recipients: list[str] = []
    if grievance.department is not None:
        hod = User.objects.filter(
            role=User.Role.HOD,
            department=grievance.department,
            is_active=True,
        ).first()
        if hod and hod.email:
            recipients = [hod.email]
    if not recipients:
        logger.info(
            'GMS-%04d: no HOD email found for comment notification',
            grievance.id,
        )
        return

    submitter = (
        grievance.user.get_full_name() or grievance.user.username
        if not grievance.is_anonymous else 'Anonymous'
    )
    grievance_url = (
        f"{settings.BASE_URL or 'http://localhost:8000'}"
        f"/api/grievances/{grievance.pk}/"
    )

    subject = (
        f"[GMS] Reminder Comment — GMS-{grievance.id:04d}: {grievance.title}"
    )
    text_message = (
        f"Dear HOD,\n\n"
        f"The submitter has posted a reminder comment asking for a status "
        f"update on a grievance in your department.\n\n"
        f"Grievance: GMS-{grievance.id:04d}\n"
        f"Title: {grievance.title}\n"
        f"Current Status: {grievance.get_current_status_display()}\n"
        f"Submitted by: {submitter}\n"
        f"Comment: {comment_content}\n\n"
        f"Please log in to the Grievance Management System to respond.\n"
        f"View: {grievance_url}\n\n"
        f"Regards,\nGrievance Management System"
    )

    html_message = render_to_string(
        'emails/comment_notification.html',
        {
            'grievance': grievance,
            'submitter': submitter,
            'comment_content': comment_content,
            'grievance_url': grievance_url,
            'site_name': 'Grievance Management System',
        },
    )

    send_email_async(
        subject,
        text_message,
        recipients,
        html_message=html_message,
    )
    logger.info(
        'Comment notification email queued for HOD %s for GMS-%04d',
        recipients, grievance.id,
    )
