"""
Management command to manually trigger the escalation cycle.

Usage:
    python manage.py escalate
    python manage.py escalate --dry-run     # preview only
    python manage.py escalate --backdate    # force-test: backdate then escalate

For the automatic hourly cycle, APScheduler is started in ``apps.py``.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from grievances.models import Grievance
from grievances.services.escalation import (
    find_stale_grievances,
    escalate,
    get_escalation_hours,
)


class Command(BaseCommand):
    help = 'Manually trigger the grievance escalation cycle.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='List stale grievances without making changes.',
        )
        parser.add_argument(
            '--backdate',
            action='store_true',
            help=(
                'Force-test only: backdate eligible grievances past the '
                'staleness threshold so they escalate immediately.'
            ),
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        if options['backdate']:
            hours = get_escalation_hours()
            count = Grievance.objects.filter(
                current_status__in=[
                    Grievance.Status.SUBMITTED,
                    Grievance.Status.UNDER_REVIEW,
                    Grievance.Status.REOPENED,
                ],
            ).update(
                updated_at=timezone.now() - timedelta(hours=hours + 1),
            )
            self.stdout.write(
                self.style.WARNING(
                    f"Backdated {count} eligible grievance(s) to trigger escalation."
                )
            )

        stale = find_stale_grievances()

        if not stale:
            self.stdout.write(self.style.SUCCESS('No stale grievances found.'))
            return

        hours = get_escalation_hours()
        self.stdout.write(f"Found {len(stale)} stale grievance(s) (threshold: {hours}h):")

        for g in stale:
            self.stdout.write(
                f"  GMS-{g.id:04d}: {g.title} "
                f"[{g.get_current_status_display()}, "
                f"last updated {g.updated_at.date()}]"
            )

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run — no changes made.'))
            return

        escalated = failed = 0
        for g in stale:
            if escalate(g):
                escalated += 1
            else:
                failed += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Escalated: {escalated}, Failed: {failed}, Total: {len(stale)}"
            )
        )
