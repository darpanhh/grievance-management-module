from django.db import migrations


def promote_superusers(apps, schema_editor):
    """Give existing Django superusers the SYSTEM_ADMIN role.

    Prior to this change ``createsuperuser`` never set the custom ``role``
    field, so superusers silently defaulted to STUDENT. This ensures every
    superuser is recognized as a top-level SYSTEM_ADMIN going forward.
    """
    User = apps.get_model('accounts', 'User')
    User.objects.filter(is_superuser=True).exclude(
        role='SYSTEM_ADMIN',
    ).update(role='SYSTEM_ADMIN')


def reverse(apps, schema_editor):
    """Reverse is not defined — roles are not automatically demoted."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_alter_user_managers_alter_user_role'),
    ]

    operations = [
        migrations.RunPython(promote_superusers, reverse),
    ]
