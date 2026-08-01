import os

from django.apps import AppConfig
from django.conf import settings


class GrievancesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'grievances'

    def ready(self):
        # ------------------------------------------------------------------
        # Wire up the pre_save signal for automatic StatusHistory logging
        # ------------------------------------------------------------------
        # pylint: disable=unused-import,import-outside-toplevel
        import grievances.signals  # noqa: F401

        # ------------------------------------------------------------------
        # Start APScheduler for auto-escalation (only in the main process)
        # ------------------------------------------------------------------
        # Guards:
        #   1. Django's autoreloader spawns two processes; only the child has
        #      RUN_MAIN=true. On Windows, Django may also use RUN_MAIN=True
        #      (capital T) — check both.
        #   2. Management commands (migrate, shell, etc.) must never start
        #      the scheduler; they don't set RUN_MAIN at all.
        #   3. pytest / test runner — skip via DJANGO_SETTINGS_MODULE suffix.
        run_main = os.environ.get('RUN_MAIN', '').lower()  # 'true' on both platforms
        _run_scheduler = (
            run_main == 'true'
            and os.environ.get('DJANGO_AUTORELOAD', '').lower() != 'true'
            and not os.environ.get('DJANGO_SETTINGS_MODULE', '').endswith('.test')
        )

        if _run_scheduler or os.environ.get('GMS_START_SCHEDULER') == '1':
            self._start_scheduler()

    @staticmethod
    def _start_scheduler():
        """Boot the APScheduler background scheduler for escalation cycles."""
        import os
        import sys
        import logging

        logger = logging.getLogger(__name__)

        # `manage.py runserver` (autoreload) imports the project twice: a
        # parent watcher process and a worker process, and AppConfig.ready()
        # runs in BOTH. Django only sets RUN_MAIN in the worker, so skip the
        # scheduler in the watcher to avoid duplicate escalation jobs and
        # duplicate emails. Single-process environments (`--noreload`,
        # gunicorn, uvicorn, etc.) have no RUN_MAIN and no reloader, so the
        # scheduler still starts there.
        if (
            'runserver' in sys.argv
            and '--noreload' not in sys.argv
            and os.environ.get('RUN_MAIN') is None
        ):
            logger.info(
                'APScheduler skipped in the runserver reloader parent process.'
            )
            return

        try:
            from django.utils import timezone
            from apscheduler.schedulers.background import BackgroundScheduler
            from apscheduler.triggers.interval import IntervalTrigger

            from grievances.services.escalation_service import run_escalation_cycle

            interval = getattr(settings, 'ESCALATION_INTERVAL_MINUTES', 60)
            scheduler = BackgroundScheduler(daemon=True)
            scheduler.add_job(
                run_escalation_cycle,
                trigger=IntervalTrigger(minutes=interval),
                id='escalation_cycle',
                name=f'Escalation cycle (every {interval} min)',
                replace_existing=True,
                # Fire immediately on startup so the first check doesn't wait
                # a full interval. Subsequent runs follow the interval trigger.
                next_run_time=timezone.now(),
            )
            scheduler.start()

            logger.info(
                'APScheduler started: escalation cycle every %.4g minutes '
                '(threshold: %.4g hours). First run: immediate.',
                interval,
                getattr(settings, 'ESCALATION_HOURS', 72),
            )
        except Exception as exc:
            logger.warning(
                'APScheduler not started (non-critical): %s', exc,
            )
