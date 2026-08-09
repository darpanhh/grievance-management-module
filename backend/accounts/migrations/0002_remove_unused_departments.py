from django.db import migrations

REMOVED_DEPARTMENTS = ["Security Office", "Accounts Office", "IT Support"]


def remove_departments(apps, schema_editor):
    """Remove the retired administrative departments (and orphaned references)."""
    Department = apps.get_model("accounts", "Department")
    Grievance = apps.get_model("grievances", "Grievance")
    User = apps.get_model("accounts", "User")

    # Clear references first — both FKs are nullable, so grievances/users
    # keep existing records with department set to null.
    Grievance.objects.filter(department__name__in=REMOVED_DEPARTMENTS).update(department=None)
    User.objects.filter(department__name__in=REMOVED_DEPARTMENTS).update(department=None)

    Department.objects.filter(name__in=REMOVED_DEPARTMENTS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(remove_departments, migrations.RunPython.noop),
    ]
