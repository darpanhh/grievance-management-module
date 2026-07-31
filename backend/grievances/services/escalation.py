"""
APScheduler-based escalation service for overdue grievances.

Runs on a periodic schedule (default: every 60 minutes) and:

  1. Finds grievances in UNDER_REVIEW / RESPONDED / REOPENED that haven't
     been updated within ESCALATION_HOURS (default: 72h)
  2. Sets escalation_level = 1, status = ESCALATED
  3. Assigns a Campus Admin (prefers someone other than the current HOD)
  4. Sends an HTML email notification to the assigned officer
  5. Logs StatusHistory entries for audit

Email delivery lives in ``grievances.services.email_notifications``.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.utils import timezone

from accounts.models import User
from grievances.models import Grievance
from grievances.services.email_notifications import send_escalation_email

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Escalation logic
# ---------------------------------------------------------------------------


def get_escalation_hours() -> int:
    """Return the inactivity threshold (hours) from settings."""
    return getattr(settings, 'ESCALATION_HOURS', 72)


def find_next_officer(grievance: Grievance) -> User | None:
    """
    Pick a Campus Admin to assign the escalation to.
    Prefers someone other than the grievance's own HOD.
    Returns ``None`` if no active Campus Admin is found.
    """
    hod_id = grievance.department.users.filter(
        role=User.Role.HOD,
    ).values_list('pk', flat=True).first()

    candidates = User.objects.filter(role=User.Role.CAMPUS_ADMIN, is_active=True)
    if hod_id:
        candidates = candidates.exclude(pk=hod_id)
    return candidates.order_by('?').first()


def find_stale_grievances() -> list[Grievance]:
    """
    Query all grievances that have been inactive for longer than the
    escalation threshold.  Only targets grievances that are not already
    escalated and are in a status that expects action (UNDER_REVIEW,
    RESPONDED, REOPENED).
    """
    hours = get_escalation_hours()
    cutoff = timezone.now() - timezone.timedelta(hours=hours)

    eligible_statuses = [
        Grievance.Status.SUBMITTED,
        Grievance.Status.UNDER_REVIEW,
        Grievance.Status.REOPENED,
    ]

    stale = list(
        Grievance.objects.filter(
            current_status__in=eligible_statuses,
            updated_at__lt=cutoff,
        ).select_related('department', 'user').iterator()
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

    # Set escalation fields and status
    grievance.escalation_level = 1
    grievance.escalated_to = next_officer
    grievance.current_status = Grievance.Status.ESCALATED
    grievance._action_by = None  # system action
    grievance._action_remarks = (
        f"Auto-escalated after {get_escalation_hours()} hours of inactivity. "
        f"Assigned to {admin_name}."
    )
    grievance.save(update_fields=[
        'escalation_level', 'escalated_to',
        'current_status', 'updated_at',
    ])

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
