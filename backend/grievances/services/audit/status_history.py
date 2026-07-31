"""
Signal handlers for the Grievance application.

Auto-logs StatusHistory entries whenever a Grievance's ``current_status``
field changes.  Uses ``pre_save`` to capture the *previous* status (the
database still holds the old value at that point) and
``transaction.on_commit`` so the audit row is never written unless the
surrounding transaction actually commits.

Callers can attach ``_action_by`` (User instance) and
``_action_remarks`` (str) to the instance before saving to control who
triggered the transition and what note is recorded.
"""

from django.db import transaction
from django.db.models.signals import pre_save
from django.dispatch import receiver

from grievances.models import Grievance, StatusHistory


@receiver(pre_save, sender=Grievance)
def log_status_change(sender, instance, **kwargs):
    """
    Auto-log a StatusHistory entry when a grievance's ``current_status``
    field changes between the database state and the in-memory state.

    ``pre_save`` fires *before* the UPDATE, so the database still holds
    the previous status — that is what makes old/new comparison correct.
    The actual ``StatusHistory`` insert is deferred with
    ``transaction.on_commit`` so a rolled-back save never leaves an
    orphan audit record.

    The signal does **not** create an entry for new instances
    (``pk is None``) — StatusHistory for the initial SUBMITTED status is
    created by the ``GrievanceCreateSerializer``.

    Callers may set ``instance._action_by`` (User) and
    ``instance._action_remarks`` (str) **before** calling ``save()``
    to supply the user who performed the action and a human-readable
    explanation.  If ``_action_remarks`` is omitted a generic message
    is generated.
    """
    if instance.pk is None:
        return  # New instance — serializer handles the initial StatusHistory

    try:
        old = sender.objects.only('current_status').get(pk=instance.pk)
    except sender.DoesNotExist:
        return

    old_status = old.current_status
    new_status = instance.current_status

    if old_status == new_status:
        return  # No change — nothing to log

    remarks = getattr(instance, '_action_remarks', None)
    if not remarks:
        remarks = (
            f"Status changed from "
            f"{old.get_current_status_display() or old_status} to "
            f"{instance.get_current_status_display() or new_status}."
        )

    action_by = getattr(instance, '_action_by', None)

    # Defer the audit-log insert until the transaction commits so we
    # never record a transition that might roll back.
    transaction.on_commit(lambda: StatusHistory.objects.create(
        grievance=instance,
        previous_status=old_status,
        new_status=new_status,
        action_by=action_by,
        remarks=remarks,
    ))
