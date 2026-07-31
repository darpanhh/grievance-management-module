"""
``grievances.services.audit`` — Audit infrastructure.

Consolidates all audit/traceability concerns in one place:

* ``status_history.py``  — Django ``post_save`` signal that auto-logs
                           ``StatusHistory`` entries on ``Grievance`` status
                           transitions.
* ``audit_logger.py``     — Structured logging helper (``gms.audit`` logger)
                           for tracing user actions in the application log.
"""
