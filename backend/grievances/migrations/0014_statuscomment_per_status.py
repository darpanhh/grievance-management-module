from django.db import migrations, models
import django.db.models.deletion


def backfill_comment_status(apps, schema_editor):
    """
    Existing StatusComment rows (posted before the `status` field existed)
    get the status that was active on their grievance at the moment the
    comment was posted, derived from StatusHistory timestamps.
    """
    StatusComment = apps.get_model('grievances', 'StatusComment')
    StatusHistory = apps.get_model('grievances', 'StatusHistory')
    Grievance = apps.get_model('grievances', 'Grievance')

    for comment in StatusComment.objects.all().iterator():
        entries = list(
            StatusHistory.objects
            .filter(grievance_id=comment.grievance_id)
            .order_by('-created_at', '-id')
        )
        status_at_time = None
        for entry in entries:
            if entry.created_at <= comment.created_at:
                status_at_time = entry.new_status
                break
        if status_at_time is None and entries:
            status_at_time = entries[-1].new_status
        if not status_at_time:
            grievance = Grievance.objects.filter(pk=comment.grievance_id).first()
            status_at_time = grievance.current_status if grievance else 'UNDER_REVIEW'
        comment.status = status_at_time
        comment.save(update_fields=['status'])


class Migration(migrations.Migration):

    dependencies = [
        ('grievances', '0013_statuscomment'),
    ]

    operations = [
        # OneToOne -> ForeignKey: keeps the column and existing rows, drops
        # the per-grievance UNIQUE index created by the OneToOne relation.
        migrations.AlterField(
            model_name='statuscomment',
            name='grievance',
            field=models.ForeignKey(
                help_text='The grievance this reminder comment belongs to.',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='status_comments',
                to='grievances.grievance',
            ),
        ),
        # Add `status` (temporary default backfills existing rows; removed below).
        migrations.AddField(
            model_name='statuscomment',
            name='status',
            field=models.CharField(
                choices=[
                    ('SUBMITTED', 'Submitted'),
                    ('UNDER_REVIEW', 'Under Review'),
                    ('IN_PROGRESS', 'In Progress'),
                    ('REOPENED', 'Reopened'),
                    ('ESCALATED', 'Escalated'),
                    ('RESOLVED', 'Resolved'),
                    ('REJECTED', 'Rejected'),
                    ('CLOSED', 'Closed'),
                ],
                default='UNDER_REVIEW',
                help_text='The grievance status this comment was posted for (UNDER_REVIEW or IN_PROGRESS).',
                max_length=20,
            ),
            preserve_default=False,
        ),
        migrations.RunPython(
            backfill_comment_status,
            migrations.RunPython.noop,
        ),
        # One comment per status per grievance.
        migrations.AddConstraint(
            model_name='statuscomment',
            constraint=models.UniqueConstraint(
                fields=('grievance', 'status'),
                name='unique_status_comment_per_status',
            ),
        ),
    ]
