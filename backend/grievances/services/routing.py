"""
Automatic routing service for newly-submitted grievances.

SRS Reference: §3.5 (FR-23–FR-27), §5 (Category vs. Routing)

Routing is **always** based on the department:
  1. If the submitter selected a department at submission time, use that.
  2. Otherwise, fall back to the submitter's own department.
  3. Assigns the department only — status stays SUBMITTED.
  4. The HOD manually moves it to UNDER_REVIEW via POST .../review/.

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

    The department is determined by (in order of priority):
      1. A department the submitter explicitly selected at submission time.
      2. The submitter's own department (fallback).

    The grievance **stays in SUBMITTED** status — the HOD will manually
    move it to UNDER_REVIEW via the review endpoint. Only department
    assignment (and an audit-log remark) happen here.

    Parameters
    ----------
    grievance:
        The Grievance instance to route. Expected to currently be in
        SUBMITTED status (i.e. not flagged as spam).
    action_by:
        User responsible for the routing action (usually the submitter).
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
    grievance that already has a department is a no-op.  Spam grievances
    are also routed so the HOD can see them in a separate tab
    (like Gmail's spam folder) and act if needed.

    The StatusHistory audit entry is created automatically by the
    ``post_save`` signal on ``Grievance`` — this function only needs to
    set ``_action_by`` / ``_action_remarks`` before saving.
    """
    # ------------------------------------------------------------------
    # Defensive guards
    # ------------------------------------------------------------------
    if grievance.department is not None:
        return grievance

    # ------------------------------------------------------------------
    # Determine target department
    # ------------------------------------------------------------------
    target_department: Optional[Department] = grievance.department
    if target_department is None and grievance.user is not None:
        target_department = getattr(grievance.user, "department", None)

    if target_department is None:
        return grievance

    # ------------------------------------------------------------------
    # Assign department only — status stays SUBMITTED
    # ------------------------------------------------------------------
    grievance.department = target_department
    grievance._action_by = action_by if action_by is not None else grievance.user
    grievance._action_remarks = remarks or (
        f"Routed to department '{target_department.name}'."
    )
    grievance.save(update_fields=["department"])

    return grievance
