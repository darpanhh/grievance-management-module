from django.core.management.base import BaseCommand
from accounts.models import Department
from grievances.models import Category

class Command(BaseCommand):
    help = 'Seeds departments and categories into the database'

    def handle(self, *args, **options):
        # 1. Seed Departments
        departments_data = [
            # Academic
            {"name": "Department of Electronics and Computer Engineering", "type": Department.DepartmentType.ACADEMIC},
            {"name": "Department of Electrical Engineering", "type": Department.DepartmentType.ACADEMIC},
            {"name": "Department of Mechanical and Aerospace Engineering", "type": Department.DepartmentType.ACADEMIC},
            {"name": "Department of Civil Engineering", "type": Department.DepartmentType.ACADEMIC},
            {'name':'Department of Architecture','type':Department.DepartmentType.ACADEMIC},
            {'name':'Department of Applied Science and Chemical Engineering','type':Department.DepartmentType.ACADEMIC},    
            

            # Administrative
            {"name": "Administrative Department", "type": Department.DepartmentType.ADMINISTRATIVE},
        ]

        self.stdout.write("Seeding departments...")
        for dept in departments_data:
            obj, created = Department.objects.get_or_create(
                name=dept["name"],
                defaults={"department_type": dept["type"]}
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created department: {obj}"))
            else:
                self.stdout.write(self.style.WARNING(f"Department already exists: {obj}"))

        # 2. Seed Categories
        categories_data = [
            {"name": "Examination", "desc": "Issues related to exams, grading, or evaluation procedures"},
            {"name": "Attendance", "desc": "Issues related to attendance records or attendance policies"},
            {"name": "Laboratory", "desc": "Issues related to lab sessions, equipment, or lab staff"},
            {"name": "Faculty", "desc": "Concerns about faculty conduct or teaching-related issues"},
            {"name": "Classroom", "desc": "Issues related to classroom facilities or scheduling"},
            {"name": "Infrastructure", "desc": "Problems with campus facilities, equipment, or maintenance"},
            {"name": "Harassment", "desc": "Reports of bullying, discrimination, or inappropriate behavior"},
            {"name": "Administrative Services", "desc": "Issues with fees, documentation, registration, or admin processes"},
            {"name": "Others", "desc": "Anything that does not clearly fit the above categories"},
        ]

        self.stdout.write("\nSeeding categories...")
        for cat in categories_data:
            obj, created = Category.objects.get_or_create(
                name=cat["name"],
                defaults={"description": cat["desc"]}
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f"Created category: {obj.name}"))
            else:
                self.stdout.write(self.style.WARNING(f"Category already exists: {obj.name}"))

        self.stdout.write(self.style.SUCCESS("\nSeeding finished successfully!"))
