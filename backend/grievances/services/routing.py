"""
Automatic routing service for newly-submitted grievances.

SRS Reference: §3.5 (FR-23–FR-27), §5 (Category vs. Routing)

Routing is **always** based on the department:
  1. If the submitter selected a department at submission time, use that.
  2. Otherwise, fall back to the submitter's own department.
  3. Transition the grievance from SUBMITTED -> UNDER_REVIEW.
  4. Log a StatusHistory entry for the transition.

The category field is **classification only** — it must never affect routing.
"""

from __future__ import annotations

from typing import Optional

from accounts.models import Department
from grievances.models import Grievance, StatusHistory


def route_grievance(
    grievance: Grievance,
    action_by=None,
    remarks: Optional[str] = None,
) -> Grievance:
    """
    Route a freshly-submitted grievance to its target department and
    transition it from SUBMITTED to UNDER_REVIEW.

    Parameters
    ----------
    grievance:
        The Grievance instance to route. Expected to currently be in
        SUBMITTED status (i.e. not flagged as spam).
    action_by:
        User responsible for the routing action. For the normal submission
        pipeline this is the submitter themselves; when called by admin
        tools (e.g. reinstate) it can be the admin user.
    remarks:
        Optional human-readable note stored on the StatusHistory entry.
        Defaults to a standard message describing the routing.

    Returns
    -------
    Grievance
        The same instance, refreshed after ``save()``.

    Notes
    -----
    The function is idempotent in the sense that calling it on a
    grievance that is already UNDER_REVIEW is a no-op (it does not
    create a duplicate StatusHistory entry).  Calling it on a SPAM
    grievance is intentionally a no-op — spam must be reviewed by an
    admin before routing.
    """
    # ------------------------------------------------------------------
    # Defensive guards
    # ------------------------------------------------------------------
    if grievance.current_status == Grievance.Status.SPAM:
        # Spam classifications are pending admin review; do not auto-route.
        return grievance

    if grievance.current_status != Grievance.Status.SUBMITTED:
        # Only freshly-submitted grievances should be routed.
        return grievance

    # ------------------------------------------------------------------
    # Determine target department
    # ------------------------------------------------------------------
    # If the submitter already selected a department at submission time,
    # the serializer has populated ``grievance.department``.  Otherwise,
    # fall back to the submitter's own department.
    target_department: Optional[Department] = grievance.department
    if target_department is None and grievance.user is not None:
        target_department = getattr(grievance.user, "department", None)

    if target_department is None:
        # Without a target department we cannot route — leave the
        # grievance in SUBMITTED so the admin can intervene manually.
        return grievance

    previous_status = grievance.current_status

    # ------------------------------------------------------------------
    # Apply routing
    # ------------------------------------------------------------------
    grievance.department = target_department
    grievance.current_status = Grievance.Status.UNDER_REVIEW
    # ``update_fields`` avoids a second ``save()`` cycle and keeps the
    # signal-free path narrow — StatusHistory is created explicitly below.
    grievance.save(update_fields=["department", "current_status"])

    # ------------------------------------------------------------------
    # Audit log
    # ------------------------------------------------------------------
    StatusHistory.objects.create(
        grievance=grievance,
        previous_status=previous_status,
        new_status=Grievance.Status.UNDER_REVIEW,
        action_by=action_by if action_by is not None else grievance.user,
        remarks=remarks
        or (
            f"Routed to department '{target_department.name}' and "
            f"moved to Under Review."
        ),
    )

    return grievance
