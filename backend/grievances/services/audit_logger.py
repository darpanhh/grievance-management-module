"""
Structured audit logging for the Grievance Management System.

Logs every meaningful user action so the system is fully traceable:

  Who did what, to which record, when, and what happened?

Usage:

    from .audit_logger import audit_log

    audit_log(
        request=request,
        action='RESPOND_TO_GRIEVANCE',
        grievance_id=42,
        details='HOD responded to grievance',
        old_status='UNDER_REVIEW',
        new_status='RESPONDED',
        result='SUCCESS',
    )
"""

from __future__ import annotations

import logging
from typing import Any

audit_logger = logging.getLogger('gms.audit')


def audit_log(
    *,
    request,
    action: str,
    grievance_id: int | None = None,
    details: str = '',
    old_status: str | None = None,
    new_status: str | None = None,
    result: str = 'SUCCESS',
    error: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """
    Emit a structured log record that answers:

      Who did what, to which record, when, and what happened?
    """
    user = request.user if hasattr(request, 'user') and request.user.is_authenticated else None

    record = {
        'user': user.username if user else 'anonymous',
        'role': user.role if user else 'ANONYMOUS',
        'grievance': f'GMS-{grievance_id:04d}' if grievance_id else None,
        'action': action,
        'result': result,
        'ip': request.META.get('REMOTE_ADDR', ''),
        'method': request.method,
        'path': request.path,
    }

    if old_status:
        record['old_status'] = old_status
    if new_status:
        record['new_status'] = new_status
    if error:
        record['error'] = error
    if extra:
        record.update(extra)

    if result == 'SUCCESS':
        audit_logger.info(details, extra={'audit': record})
    else:
        audit_logger.error(details, extra={'audit': record})
