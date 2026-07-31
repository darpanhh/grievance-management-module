import os

from django.apps import AppConfig
from django.conf import settings


class GrievancesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'grievances'

    def ready(self):
        # ------------------------------------------------------------------
        # Wire up the post_save signal for automatic StatusHistory logging
        # ------------------------------------------------------------------
        # pylint: disable=unused-import,import-outside-toplevel
        import grievances.services.audit.status_history  # noqa: F401

        # ------------------------------------------------------------------
        # Start APScheduler for auto-escalation (only in the main process)
        # ------------------------------------------------------------------
        # Guard against:
        #   1. Django's autoreloader calling ready() twice
        #   2. Management commands (migrate, shell, etc.)
        #   3. pytest / test runner
        _run_scheduler = (
            os.environ.get('RUN_MAIN') == 'true'
            and os.environ.get('DJANGO_AUTORELOAD') != 'true'
            and not os.environ.get('DJANGO_SETTINGS_MODULE', '').endswith('.test')
        )

        if _run_scheduler or os.environ.get('GMS_START_SCHEDULER') == '1':
            self._start_scheduler()

    @staticmethod
    def _start_scheduler():
        """Boot the APScheduler background scheduler for escalation cycles."""
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
            from apscheduler.triggers.interval import IntervalTrigger

            from grievances.services.escalation import run_escalation_cycle

            interval = getattr(settings, 'ESCALATION_INTERVAL_MINUTES', 60)
            scheduler = BackgroundScheduler(daemon=True)
            scheduler.add_job(
                run_escalation_cycle,
                trigger=IntervalTrigger(minutes=interval),
                id='escalation_cycle',
                name=f'Escalation cycle (every {interval} min)',
                replace_existing=True,
                next_run_time=None,  # Don't run immediately on startup
            )
            scheduler.start()

            import logging
            logger = logging.getLogger(__name__)
            logger.info(
                'APScheduler started: escalation cycle every %d minutes',
                interval,
            )
        except Exception as exc:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                'APScheduler not started (non-critical): %s', exc,
            )
