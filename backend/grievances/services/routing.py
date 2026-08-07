"""
Automatic routing service for newly-submitted grievances.

SRS Reference: §3.5 (FR-23–FR-27), §5 (Category vs. Routing)

Routing is **always** based on the department:
  1. If the submitter selected a department at submission time, use that.
  2. Otherwise, fall back to the submitter's own department.
  3. The grievance **stays in SUBMITTED** — it only moves to UNDER_REVIEW
     when the HOD actually takes action on it (e.g. responds).

The category field is **classification only** — it must never affect routing.
"""

from __future__ import annotations

from typing import Optional

from accounts.models import Department
from grievances.models import Grievance


def route_grievance(
    grievance: Grievance,
    action_by=None,
    remarks: Optional[str] = None,
) -> Grievance:
    """
    Route a freshly-submitted grievance to its target department.

    Only the department is assigned — the status stays SUBMITTED so the
    submitter sees "Submitted" until the department HOD acts on it.
    No StatusHistory entry is created here because the status does not
    change (history only records actual status transitions).

    Parameters
    ----------
    grievance:
        The Grievance instance to route. Expected to currently be in
        SUBMITTED status.
    action_by:
        Kept for API compatibility (the user responsible for routing).
    remarks:
        Kept for API compatibility.

    Returns
    -------
    Grievance
        The same instance, refreshed after ``save()``.
    """
    # ------------------------------------------------------------------
    # Defensive guards
    # ------------------------------------------------------------------
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

    # ------------------------------------------------------------------
    # Apply routing (department only — status stays SUBMITTED)
    # ------------------------------------------------------------------
    grievance.department = target_department
    grievance.save(update_fields=["department"])

    return grievance
