"""
Tests for Phase 1 -- Data Models & Database

Tests the Department, User, Category, Grievance, AIAnalysis, Response,
StatusHistory, and Attachment models.

Usage:
    cd backend
    python test/1-data-models--database/test.py
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('USE_SQLITE', 'True')

import django
django.setup()

from django.core.management import call_command
from django.db.utils import IntegrityError
from django.contrib.auth.hashers import make_password
from accounts.models import Department, User
from grievances.models import Category, Grievance, AIAnalysis, Response, StatusHistory, Attachment


def setup_db():
    """Ensure all database tables exist (safe to call multiple times)."""
    call_command('migrate', verbosity=0, interactive=False, run_syncdb=True)


def test_department_creation():
    """Department can be created with academic or administrative type."""
    dept = Department.objects.create(
        name='Computer Engineering',
        department_type=Department.DepartmentType.ACADEMIC,
    )
    assert dept.pk is not None, "Department should have a PK after save"
    assert str(dept) == 'Computer Engineering (Academic)', f"Unexpected str: {dept}"
    assert dept.department_type == 'ACADEMIC'
    dept.delete()
    print("  PASS department creation")


def test_department_duplicate_name():
    """Department names must be unique."""
    Department.objects.create(name='Unique Dept', department_type='ACADEMIC')
    try:
        Department.objects.create(name='Unique Dept', department_type='ADMINISTRATIVE')
        assert False, "Should have raised IntegrityError for duplicate name"
    except IntegrityError:
        pass
    Department.objects.filter(name='Unique Dept').delete()
    print("  PASS department unique name")


def test_user_creation_student():
    """A Student user can be created with default role."""
    dept = Department.objects.create(name='Test Dept', department_type='ACADEMIC')
    user = User.objects.create_user(
        username='student1',
        email='student1@college.edu',
        password='testpass123',
        first_name='Test',
        last_name='Student',
        role=User.Role.STUDENT,
        department=dept,
    )
    assert user.role == 'STUDENT'
    assert user.department == dept
    assert user.is_active is True
    user.delete()
    dept.delete()
    print("  PASS student user creation")


def test_user_creation_all_roles():
    """All four roles (Student, Staff, HOD, CampusAdmin) can be created."""
    dept = Department.objects.create(name='Eng Dept', department_type='ACADEMIC')
    roles = [
        (User.Role.STUDENT, 'STUDENT'),
        (User.Role.STAFF, 'STAFF'),
        (User.Role.HOD, 'HOD'),
        (User.Role.CAMPUS_ADMIN, 'CAMPUS_ADMIN'),
    ]
    for role_enum, role_str in roles:
        user = User.objects.create_user(
            username=f'user_{role_str.lower()}',
            email=f'{role_str.lower()}@college.edu',
            password='testpass123',
            role=role_enum,
            department=None if role_enum == User.Role.CAMPUS_ADMIN else dept,
        )
        assert user.role == role_str, f"Expected {role_str}, got {user.role}"
        user.delete()
    dept.delete()
    print("  PASS all role creation")


def test_category_creation():
    """Category can be created with name and description."""
    cat = Category.objects.create(
        name='Examination',
        description='Issues related to exams and grades',
    )
    assert cat.pk is not None
    assert str(cat) == 'Examination'
    assert cat.description == 'Issues related to exams and grades'
    cat.delete()
    print("  PASS category creation")


def test_grievance_creation():
    """A grievance can be created with all required fields."""
    dept = Department.objects.create(name='CS Dept', department_type='ACADEMIC')
    cat = Category.objects.create(name='Lab Issue')
    user = User.objects.create_user(
        username='grievant', password='test123', role=User.Role.STUDENT, department=dept,
    )
    grievance = Grievance.objects.create(
        user=user,
        department=dept,
        category=cat,
        title='Broken lab equipment',
        description='The computer in lab 3 is not working properly.',
        current_status=Grievance.Status.SUBMITTED,
    )
    assert grievance.pk is not None
    assert grievance.title == 'Broken lab equipment'
    assert grievance.current_status == 'SUBMITTED'
    assert grievance.is_anonymous is False
    assert grievance.is_reopened is False
    grievance.delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS grievance creation")


def test_grievance_all_statuses():
    """Grievance supports all 8 status values."""
    dept = Department.objects.create(name='Status Dept', department_type='ACADEMIC')
    cat = Category.objects.create(name='General')
    user = User.objects.create_user(username='status_tester', password='test123', role=User.Role.STUDENT, department=dept)

    statuses = ['SUBMITTED', 'SPAM', 'UNDER_REVIEW', 'RESPONDED', 'REOPENED', 'ESCALATED', 'RESOLVED', 'CLOSED']
    for s in statuses:
        g = Grievance.objects.create(user=user, department=dept, category=cat, title=f'Test {s}', description='Test', current_status=s)
        assert g.current_status == s, f"Expected {s}, got {g.current_status}"
        g.delete()

    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS all grievance statuses")


def test_grievance_anonymous_support():
    """Grievance supports anonymous submission with secret code."""
    dept = Department.objects.create(name='Anon Dept', department_type='ACADEMIC')
    cat = Category.objects.create(name='Anonymous')
    user = User.objects.create_user(username='anon_user', password='test123', role=User.Role.STUDENT, department=dept)

    grievance = Grievance.objects.create(
        user=user, department=dept, category=cat,
        title='Anonymous issue', description='This is anonymous',
        is_anonymous=True,
        secret_code=make_password('SECRET123'),
    )
    assert grievance.is_anonymous is True
    assert grievance.secret_code is not None
    grievance.delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS anonymous grievance with secret code")


def test_ai_analysis_creation():
    """AIAnalysis record can be linked to a grievance."""
    dept = Department.objects.create(name='AI Dept', department_type='ACADEMIC')
    cat = Category.objects.create(name='AI Test')
    user = User.objects.create_user(username='ai_user', password='test123', role=User.Role.STUDENT, department=dept)
    grievance = Grievance.objects.create(user=user, department=dept, category=cat, title='AI test', description='Testing AI')

    analysis = AIAnalysis.objects.create(
        grievance=grievance,
        spam_prediction=True,
        confidence_score=0.87,
        classification_reason='Contains promotional language',
    )
    assert analysis.spam_prediction is True
    assert analysis.confidence_score == 0.87
    analysis.delete()
    grievance.delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS AIAnalysis creation")


def test_response_creation():
    """Response can be linked to a grievance and responder."""
    dept = Department.objects.create(name='Resp Dept', department_type='ACADEMIC')
    cat = Category.objects.create(name='Resp Test')
    student = User.objects.create_user(username='resp_student', password='test123', role=User.Role.STUDENT, department=dept)
    hod = User.objects.create_user(username='resp_hod', password='test123', role=User.Role.HOD, department=dept)
    grievance = Grievance.objects.create(user=student, department=dept, category=cat, title='Response test', description='Testing response')

    response = Response.objects.create(
        grievance=grievance,
        responder=hod,
        content='We have reviewed your grievance and will take action.',
    )
    assert response.responder == hod
    assert response.content == 'We have reviewed your grievance and will take action.'
    response.delete()
    grievance.delete()
    hod.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS Response creation")


def test_status_history_creation():
    """StatusHistory logs transitions correctly."""
    dept = Department.objects.create(name='Hist Dept', department_type='ACADEMIC')
    cat = Category.objects.create(name='Hist Test')
    user = User.objects.create_user(username='hist_user', password='test123', role=User.Role.STUDENT, department=dept)
    grievance = Grievance.objects.create(user=user, department=dept, category=cat, title='History test', description='Testing history')

    history = StatusHistory.objects.create(
        grievance=grievance,
        previous_status=None,
        new_status=Grievance.Status.SUBMITTED,
        action_by=user,
        remarks='Grievance submitted.',
    )
    assert history.previous_status is None
    assert history.new_status == 'SUBMITTED'
    assert history.action_by == user
    history.delete()
    grievance.delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS StatusHistory creation")


def test_attachment_creation():
    """Attachment can be linked to a grievance."""
    dept = Department.objects.create(name='Att Dept', department_type='ACADEMIC')
    cat = Category.objects.create(name='Att Test')
    user = User.objects.create_user(username='att_user', password='test123', role=User.Role.STUDENT, department=dept)
    grievance = Grievance.objects.create(user=user, department=dept, category=cat, title='Attachment test', description='Testing attachment')

    # Create attachment with file path
    attachment = Attachment.objects.create(
        grievance=grievance,
        file_name='evidence.pdf',
        file_type='application/pdf',
        file='grievance_attachments/evidence.pdf',
    )
    assert attachment.file_name == 'evidence.pdf'
    assert attachment.file_type == 'application/pdf'
    attachment.delete()
    grievance.delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS Attachment creation")


def test_model_relationships():
    """All model relationships (FKs, O2O) work correctly."""
    dept = Department.objects.create(name='Rel Dept', department_type='ACADEMIC')
    cat = Category.objects.create(name='Rel Test')
    student = User.objects.create_user(username='rel_student', password='test123', role=User.Role.STUDENT, department=dept)
    hod = User.objects.create_user(username='rel_hod', password='test123', role=User.Role.HOD, department=dept)
    grievance = Grievance.objects.create(user=student, department=dept, category=cat, title='Rel test', description='Testing relationships')

    # OneToOne: AIAnalysis -> Grievance
    AIAnalysis.objects.create(grievance=grievance, spam_prediction=False, confidence_score=0.05, classification_reason='Clean')
    assert hasattr(grievance, 'ai_analysis'), "Grievance should have ai_analysis related object"

    # ForeignKey: Response -> Grievance
    Response.objects.create(grievance=grievance, responder=hod, content='Response 1')
    assert grievance.responses.count() == 1, "Grievance should have 1 response"

    # ForeignKey: StatusHistory -> Grievance
    StatusHistory.objects.create(grievance=grievance, previous_status='SUBMITTED', new_status='UNDER_REVIEW', action_by=hod)
    assert grievance.status_history.count() >= 1, "Grievance should have status history"

    # ForeignKey: Attachment -> Grievance
    Attachment.objects.create(grievance=grievance, file_name='doc.pdf', file_type='application/pdf', file='att/doc.pdf')
    assert grievance.attachments.count() >= 1, "Grievance should have attachments"

    # Reverse relations
    assert student.grievances.count() >= 1, "User should have grievances"
    assert dept.grievances.count() >= 1, "Department should have grievances"

    print("  PASS model relationships")


def run():
    setup_db()

    tests = [
        ("Department creation",            test_department_creation),
        ("Department unique name",         test_department_duplicate_name),
        ("Student user creation",          test_user_creation_student),
        ("All role creation",              test_user_creation_all_roles),
        ("Category creation",              test_category_creation),
        ("Grievance creation",             test_grievance_creation),
        ("All grievance statuses",         test_grievance_all_statuses),
        ("Anonymous with secret code",     test_grievance_anonymous_support),
        ("AIAnalysis creation",            test_ai_analysis_creation),
        ("Response creation",              test_response_creation),
        ("StatusHistory creation",         test_status_history_creation),
        ("Attachment creation",            test_attachment_creation),
        ("Model relationships",            test_model_relationships),
    ]

    passed = 0
    failed = 0

    print(f"\n{'='*60}")
    print("  Phase 1 - Data Models & Database")
    print(f"{'='*60}\n")

    for label, fn in tests:
        try:
            fn()
            passed += 1
        except AssertionError as e:
            print(f"  FAIL {label}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR {label}: {e}")
            failed += 1

    print(f"\n{'='*60}")
    print(f"  Results: {passed} passed, {failed} failed, {passed + failed} total")
    print(f"{'='*60}\n")

    return failed == 0


if __name__ == '__main__':
    success = run()
    sys.exit(0 if success else 1)
