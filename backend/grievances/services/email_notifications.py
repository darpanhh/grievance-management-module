"""
Email notification service.

All transactional email for the grievance lifecycle lives here, kept separate
from the escalation service.  Each function builds a plain-text and an HTML
body (rendered from a Django template in ``templates/emails/``) and sends it
via Django's ``send_mail``.

  - send_submission_email  → notify the department HOD of a new grievance
  - send_response_email    → notify the submitter of an HOD response
  - send_resolution_email  → notify the submitter that their grievance is resolved
  - send_escalation_email  → notify the assigned Campus Admin of an escalation

Recipients come from the grievance's department / user; sending is wrapped in
try/except so a mail failure never breaks the request that triggered it.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from accounts.models import User
from grievances.models import Grievance

logger = logging.getLogger(__name__)


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

    try:
        send_mail(subject, text_message, settings.DEFAULT_FROM_EMAIL,
                  [hod.email], html_message=html_message, fail_silently=False)
        logger.info('Submission email sent to HOD %s (%s) for GMS-%04d',
                    hod.get_full_name(), hod.email, grievance.id)
    except Exception as exc:
        logger.error('Failed to send submission email for GMS-%04d: %s',
                     grievance.id, exc)


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

    try:
        send_mail(subject, text_message, settings.DEFAULT_FROM_EMAIL,
                  [user.email], html_message=html_message, fail_silently=False)
        logger.info('Response email sent to %s (%s) for GMS-%04d',
                    user.get_full_name(), user.email, grievance.id)
    except Exception as exc:
        logger.error('Failed to send response email for GMS-%04d: %s',
                     grievance.id, exc)


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

    try:
        send_mail(subject, text_message, settings.DEFAULT_FROM_EMAIL,
                  [user.email], html_message=html_message, fail_silently=False)
        logger.info('Resolution email sent to %s (%s) for GMS-%04d',
                    user.get_full_name(), user.email, grievance.id)
    except Exception as exc:
        logger.error('Failed to send resolution email for GMS-%04d: %s',
                     grievance.id, exc)


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
        'grievance_url': f'/api/grievances/{grievance.pk}/',
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
        f"Submitted: {grievance.created_at.strftime('%Y-%m-%d %H:%M')}\n"
        f"Last updated: {grievance.updated_at.strftime('%Y-%m-%d %H:%M')}\n\n"
        f"{grievance.description[:500]}\n\n"
        f"Please log in to the Grievance Management System to take action.\n"
        f"View: {settings.BASE_URL or 'http://localhost:8000'}{context['grievance_url']}\n\n"
        f"Regards,\nGrievance Management System"
    )

    html_message = render_to_string(
        'emails/escalation_notification.html',
        context,
    )

    try:
        send_mail(
            subject=subject,
            message=text_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[officer.email],
            html_message=html_message,
            fail_silently=False,
        )
        logger.info(
            'Email sent to %s (%s) for GMS-%04d',
            officer.email, officer.get_full_name(), grievance.id,
        )
    except Exception as exc:
        logger.error(
            'Failed to send escalation email for GMS-%04d to %s: %s',
            grievance.id, officer.email, exc,
        )