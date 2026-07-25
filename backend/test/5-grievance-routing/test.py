"""
Tests for Phase 5 — Grievance Routing

Tests automatic routing of non-spam grievances to the correct department,
status transitions, StatusHistory logging, category independence, and
department-scoped list/detail views for different user roles.

Usage:
    cd backend
    python test/5-grievance-routing/test.py
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
from rest_framework.test import APIClient
from rest_framework import status
from accounts.models import Department, User
from grievances.models import Category, Grievance, StatusHistory


# ---------------------------------------------------------------------------
# Helpers (all use auto-incrementing counters for unique names)
# ---------------------------------------------------------------------------

_COUNTER = 0


def _next():
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def setup_db():
    """Ensure all database tables exist (safe to call multiple times)."""
    call_command('migrate', verbosity=0, interactive=False, run_syncdb=True)


def _create_dept():
    """Create a Department with a unique name."""
    return Department.objects.create(name=f'TestDept {_next()}', department_type='ACADEMIC')


def _create_category():
    """Create a Category with a unique name."""
    return Category.objects.create(name=f'TestCat {_next()}', description='Test category')


def _create_user(username, role='STUDENT', department=None, password='testpass123'):
    """Create a user with a unique username by appending a counter."""
    return User.objects.create_user(
        username=f'{username}_{_next()}', password=password,
        role=role, department=department,
    )


def _auth_client(user, password='testpass123'):
    """Return an APIClient pre-authenticated with JWT tokens."""
    client = APIClient()
    resp = client.post('/api/auth/login/', {
        'username': user.username, 'password': password,
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {resp.data["access"]}')
    return client


_GRIEVANCE_DESCRIPTION = (
    "I am writing to bring to your attention an issue with the examination "
    "results for the subject of Data Structures. The grade displayed in the "
    "system does not match the marks I received in my answer sheet. I have "
    "attached a copy of my answer sheet for reference. Please look into this "
    "matter and update the records accordingly. Thank you for your time and "
    "consideration."
)


def _submit_grievance(client, dept, cat, **overrides):
    """POST a grievance and return the response."""
    payload = {
        'title': overrides.get('title', 'Routing test grievance'),
        'description': overrides.get('description', _GRIEVANCE_DESCRIPTION),
        'category': cat.pk,
        'department': dept.pk,
        'is_anonymous': overrides.get('is_anonymous', False),
    }
    return client.post('/api/grievances/', payload, format='json')


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_route_to_selected_department():
    """
    When a submitter selects a department during submission, the grievance
    is routed to that department, even if it differs from the submitter's
    own department.
    """
    student_dept = _create_dept()
    target_dept = _create_dept()
    cat = _create_category()
    user = _create_user('sel_user', role='STUDENT', department=student_dept)
    client = _auth_client(user)

    resp = _submit_grievance(client, target_dept, cat)
    assert resp.status_code == status.HTTP_201_CREATED, \
        f"Submission failed: {resp.status_code}: {resp.data}"

    assert resp.data['current_status'] == 'UNDER_REVIEW', \
        f"Expected UNDER_REVIEW, got {resp.data['current_status']}"

    grievance = Grievance.objects.get(id=resp.data['id'])
    assert grievance.department.pk == target_dept.pk, \
        f"Expected dept {target_dept.pk}, got {grievance.department.pk}"

    grievance.delete()
    user.delete()
    cat.delete()
    student_dept.delete()
    target_dept.delete()
    print("  PASS route to selected department")


def test_route_defaults_to_user_department():
    """
    When no department is explicitly selected at submission time, the
    routing service falls back to the submitter's own department.
    """
    dept = _create_dept()
    cat = _create_category()
    user = _create_user('def_user', role='STUDENT', department=dept)
    client = _auth_client(user)

    # Submit without specifying a department
    payload = {
        'title': 'Default routing test',
        'description': _GRIEVANCE_DESCRIPTION,
        'category': cat.pk,
        'is_anonymous': False,
    }
    resp = client.post('/api/grievances/', payload, format='json')
    assert resp.status_code == status.HTTP_201_CREATED, \
        f"Submission failed: {resp.status_code}: {resp.data}"

    assert resp.data['current_status'] == 'UNDER_REVIEW', \
        f"Expected UNDER_REVIEW, got {resp.data['current_status']}"
    assert resp.data['department'] == dept.pk, \
        f"Expected department {dept.pk}, got {resp.data['department']}"

    Grievance.objects.filter(id=resp.data['id']).delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS route defaults to user department")


def test_status_changes_to_under_review():
    """
    After the routing service processes a non-spam grievance, its status
    transitions from SUBMITTED to UNDER_REVIEW.
    """
    dept = _create_dept()
    cat = _create_category()
    user = _create_user('status_user', role='STUDENT', department=dept)
    client = _auth_client(user)

    resp = _submit_grievance(client, dept, cat)
    assert resp.status_code == status.HTTP_201_CREATED
    assert resp.data['current_status'] == 'UNDER_REVIEW', \
        f"Expected UNDER_REVIEW, got {resp.data['current_status']}"

    Grievance.objects.filter(id=resp.data['id']).delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS status changes to UNDER_REVIEW")


def test_status_history_logged_on_routing():
    """
    When a grievance is routed, a StatusHistory entry must be created
    documenting the SUBMITTED -> UNDER_REVIEW transition.
    """
    dept = _create_dept()
    cat = _create_category()
    user = _create_user('hist_user', role='STUDENT', department=dept)
    client = _auth_client(user)

    resp = _submit_grievance(client, dept, cat)
    assert resp.status_code == status.HTTP_201_CREATED

    grievance = Grievance.objects.get(id=resp.data['id'])
    history = StatusHistory.objects.filter(grievance=grievance).order_by('created_at')

    # Expected entries: SUBMITTED (from serializer.create) + UNDER_REVIEW (from routing)
    assert history.count() >= 2, \
        f"Expected at least 2 StatusHistory entries, got {history.count()}"

    # Find the routing entry (UNDER_REVIEW)
    routing_entry = history.filter(new_status='UNDER_REVIEW').first()
    assert routing_entry is not None, "No StatusHistory entry for UNDER_REVIEW transition"
    assert routing_entry.previous_status == 'SUBMITTED', \
        f"Expected previous_status=SUBMITTED, got {routing_entry.previous_status}"
    assert 'Routed to department' in routing_entry.remarks, \
        f"Remarks should mention routing, got: {routing_entry.remarks}"

    grievance.delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS status history logged on routing")


def test_category_never_affects_routing():
    """
    The category field is classification-only and must NEVER influence
    which department a grievance is routed to.  Two grievances in different
    categories but submitted to the same department should both be routed
    to that department.
    """
    dept = _create_dept()
    cat_a = _create_category()
    cat_b = _create_category()
    user = _create_user('cat_user', role='STUDENT', department=dept)
    client = _auth_client(user)

    resp_a = _submit_grievance(client, dept, cat_a,
                               title='Category A test',
                               description=_GRIEVANCE_DESCRIPTION + ' Part A.')
    assert resp_a.status_code == status.HTTP_201_CREATED
    grievance_a = Grievance.objects.get(id=resp_a.data['id'])

    resp_b = _submit_grievance(client, dept, cat_b,
                               title='Category B test',
                               description=_GRIEVANCE_DESCRIPTION + ' Part B.')
    assert resp_b.status_code == status.HTTP_201_CREATED
    grievance_b = Grievance.objects.get(id=resp_b.data['id'])

    # Both should be UNDER_REVIEW and assigned to the same department
    assert grievance_a.current_status == 'UNDER_REVIEW'
    assert grievance_b.current_status == 'UNDER_REVIEW'
    assert grievance_a.department.pk == dept.pk
    assert grievance_b.department.pk == dept.pk

    # Category should differ but routing should NOT have changed
    assert grievance_a.category.pk == cat_a.pk
    assert grievance_b.category.pk == cat_b.pk
    assert grievance_a.category.pk != grievance_b.category.pk, \
        "Categories should differ for this test to be meaningful"

    grievance_a.delete()
    grievance_b.delete()
    user.delete()
    cat_a.delete()
    cat_b.delete()
    dept.delete()
    print("  PASS category never affects routing")


def test_hod_sees_department_grievances():
    """
    An HOD user should see only grievances that belong to their own
    department in the list view.
    """
    hod_dept = _create_dept()
    other_dept = _create_dept()
    cat = _create_category()

    hod = _create_user('hod_view', role='HOD', department=hod_dept)
    student = _create_user('hod_stu', role='STUDENT', department=hod_dept)

    grievance = Grievance.objects.create(
        user=student, department=hod_dept, category=cat,
        title='HOD department grievance', description=_GRIEVANCE_DESCRIPTION,
        current_status=Grievance.Status.UNDER_REVIEW,
    )

    other_grievance = Grievance.objects.create(
        user=student, department=other_dept, category=cat,
        title='Other department grievance', description=_GRIEVANCE_DESCRIPTION,
        current_status=Grievance.Status.UNDER_REVIEW,
    )

    client = _auth_client(hod)
    resp = client.get('/api/grievances/')
    assert resp.status_code == status.HTTP_200_OK

    titles = [g['title'] for g in resp.data]
    assert 'HOD department grievance' in titles, \
        "HOD should see grievances from their own department"
    assert 'Other department grievance' not in titles, \
        "HOD should NOT see grievances from other departments"

    other_grievance.delete()
    grievance.delete()
    student.delete()
    hod.delete()
    cat.delete()
    other_dept.delete()
    hod_dept.delete()
    print("  PASS HOD sees department grievances")


def test_hod_cannot_see_other_department():
    """
    An HOD user must NOT be able to access (via detail view) a grievance
    that belongs to a department other than their own.
    """
    hod_dept = _create_dept()
    other_dept = _create_dept()
    cat = _create_category()

    hod = _create_user('hod_denied', role='HOD', department=hod_dept)
    student = _create_user('other_stu', role='STUDENT', department=other_dept)

    grievance = Grievance.objects.create(
        user=student, department=other_dept, category=cat,
        title='Other dept grievance', description=_GRIEVANCE_DESCRIPTION,
        current_status=Grievance.Status.UNDER_REVIEW,
    )

    client = _auth_client(hod)
    resp = client.get(f'/api/grievances/{grievance.pk}/')
    assert resp.status_code == status.HTTP_404_NOT_FOUND, \
        f"Expected 404 for HOD accessing other dept grievance, got {resp.status_code}"

    grievance.delete()
    student.delete()
    hod.delete()
    cat.delete()
    other_dept.delete()
    hod_dept.delete()
    print("  PASS HOD cannot see other department grievances")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run():
    setup_db()

    tests = [
        ("Route to selected department",        test_route_to_selected_department),
        ("Route defaults to user department",   test_route_defaults_to_user_department),
        ("Status changes to UNDER_REVIEW",       test_status_changes_to_under_review),
        ("StatusHistory logged on routing",      test_status_history_logged_on_routing),
        ("Category never affects routing",       test_category_never_affects_routing),
        ("HOD sees department grievances",       test_hod_sees_department_grievances),
        ("HOD cannot see other department",      test_hod_cannot_see_other_department),
    ]

    passed = 0
    failed = 0
    print(f"\n{'='*60}")
    print("  Phase 5 - Grievance Routing")
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
            import traceback
            traceback.print_exc()
            failed += 1
    print(f"\n{'='*60}")
    print(f"  Results: {passed} passed, {failed} failed, {passed + failed} total")
    print(f"{'='*60}\n")
    return failed == 0


if __name__ == '__main__':
    success = run()
    sys.exit(0 if success else 1)
