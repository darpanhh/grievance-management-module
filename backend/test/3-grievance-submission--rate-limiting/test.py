"""
Tests for Phase 3 -- Grievance Submission & Rate Limiting

Tests grievance CRUD endpoints, rate limiting, file attachment validation,
anonymous submission with secret code, and anonymous tracking.

Usage:
    cd backend
    python test/3-grievance-submission--rate-limiting/test.py
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('USE_SQLITE', 'True')
# Use an isolated database so tests never touch the development db.sqlite3.
os.environ.setdefault('SQLITE_NAME', 'test_db.sqlite3')

import django
django.setup()

from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework import status
from accounts.models import Department, User
from grievances.models import Category, Grievance, StatusHistory


def setup_db():
    """Ensure all database tables exist (safe to call multiple times)."""
    call_command('migrate', verbosity=0, interactive=False, run_syncdb=True)


import uuid

def _create_dept(name=None):
    if name is None:
        name = f'Test Dept {uuid.uuid4().hex[:8]}'
    return Department.objects.create(name=name, department_type='ACADEMIC')


def _create_category(name=None):
    if name is None:
        name = f'Category {uuid.uuid4().hex[:8]}'
    return Category.objects.create(name=name, description='Test category')


def _auth_client(user, password='testpass123'):
    client = APIClient()
    resp = client.post('/api/auth/login/', {
        'username': user.username, 'password': password,
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {resp.data["access"]}')
    return client


# ---------------------------------------------------------------------------
# Reference endpoints
# ---------------------------------------------------------------------------

def test_list_categories():
    """GET /api/categories/ returns all categories (public)."""
    cat = _create_category()
    client = APIClient()
    resp = client.get('/api/categories/')
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.data) >= 1
    cat.delete()
    print("  PASS list categories (public)")


def test_list_departments():
    """GET /api/departments/ returns all departments (public)."""
    dept = _create_dept()
    client = APIClient()
    resp = client.get('/api/departments/')
    assert resp.status_code == status.HTTP_200_OK
    assert len(resp.data) >= 1
    dept.delete()
    print("  PASS list departments (public)")


# ---------------------------------------------------------------------------
# Grievance CRUD
# ---------------------------------------------------------------------------

# Long realistic description so the AI spam detector classifies as legitimate
_DESC = (
    "I am writing to bring to your attention an issue with the examination "
    "results for the subject of Data Structures. The grade displayed in the "
    "system does not match the marks I received in my answer sheet. I have "
    "attached a copy of my answer sheet for reference. Please look into this "
    "matter and update the records accordingly. Thank you for your time and "
    "consideration."
)


def test_submit_grievance():
    """POST /api/grievances/ creates a grievance."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='submitter', password='testpass123', role='STUDENT', department=dept)
    client = _auth_client(user)

    resp = client.post('/api/grievances/', {
        'title': 'Test grievance',
        'description': _DESC,
        'category': cat.pk,
        'department': dept.pk,
        'is_anonymous': False,
    }, format='json')

    assert resp.status_code == status.HTTP_201_CREATED, f"Got {resp.status_code}: {resp.data}"
    assert resp.data['title'] == 'Test grievance'
    assert resp.data['current_status'] == 'SUBMITTED'

    Grievance.objects.filter(id=resp.data['id']).delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS submit grievance")


def test_submit_grievance_anonymous():
    """Anonymous submission returns a secret_code."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='anon_submit', password='testpass123', role='STUDENT', department=dept)
    client = _auth_client(user)

    resp = client.post('/api/grievances/', {
        'title': 'Anonymous grievance',
        'description': _DESC,
        'category': cat.pk,
        'department': dept.pk,
        'is_anonymous': True,
    }, format='json')

    assert resp.status_code == status.HTTP_201_CREATED, f"Got {resp.status_code}: {resp.data}"
    assert 'secret_code' in resp.data, "Anonymous grievance should return secret_code"
    assert resp.data['is_anonymous'] is True

    grievance = Grievance.objects.get(id=resp.data['id'])
    assert grievance.is_anonymous is True
    assert grievance.secret_code is not None, "Secret code should be hashed and stored"

    grievance.delete()
    user.delete()
    cat.delete()
    dept.delete()
    print("  PASS submit grievance (anonymous)")


def _results(data):
    """Extract the results list from a paginated DRF response."""
    return data['results'] if isinstance(data, dict) and 'results' in data else data


def test_list_grievances_student():
    """Student sees only their own grievances in the list."""
    dept = _create_dept()
    cat = _create_category()
    user1 = User.objects.create_user(username='list_stu1', password='testpass123', role='STUDENT', department=dept)
    user2 = User.objects.create_user(username='list_stu2', password='testpass123', role='STUDENT', department=dept)

    Grievance.objects.create(user=user1, department=dept, category=cat, title='User1 grievance', description='Test')
    Grievance.objects.create(user=user2, department=dept, category=cat, title='User2 grievance', description='Test')

    client = _auth_client(user1)
    resp = client.get('/api/grievances/')
    assert resp.status_code == status.HTTP_200_OK
    titles = [g['title'] for g in _results(resp.data)]
    assert 'User1 grievance' in titles, "Student should see own grievance"
    assert 'User2 grievance' not in titles, "Student should NOT see other's grievance"

    Grievance.objects.all().delete()
    user1.delete(); user2.delete(); cat.delete(); dept.delete()
    print("  PASS list grievances (student scoped)")


def test_list_grievances_campus_admin():
    """Campus Admin only sees ESCALATED grievances."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='list_ca', password='testpass123', role='STUDENT', department=dept)
    admin = User.objects.create_user(username='campus_admin', password='admin123', role='CAMPUS_ADMIN')

    # Create an ESCALATED grievance (CAMPUS_ADMIN only sees ESCALATED)
    Grievance.objects.create(user=user, department=dept, category=cat,
                              title='Escalated grievance', description='Test',
                              current_status='ESCALATED')
    # Also create a non-escalated one (should NOT appear)
    Grievance.objects.create(user=user, department=dept, category=cat,
                              title='Non-escalated grievance', description='Test')

    client = _auth_client(admin, 'admin123')
    resp = client.get('/api/grievances/')
    assert resp.status_code == status.HTTP_200_OK
    titles = [g['title'] for g in _results(resp.data)]
    assert 'Escalated grievance' in titles, "CAMPUS_ADMIN should see ESCALATED grievances"
    assert 'Non-escalated grievance' not in titles, \
        "CAMPUS_ADMIN should NOT see non-escalated grievances"

    Grievance.objects.all().delete()
    admin.delete(); user.delete(); cat.delete(); dept.delete()
    print("  PASS list grievances (CAMPUS_ADMIN only ESCALATED)")


def test_grievance_detail():
    """GET /api/grievances/{id}/ returns full detail with nested data."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='detail_test', password='testpass123', role='STUDENT', department=dept)
    grievance = Grievance.objects.create(
        user=user, department=dept, category=cat,
        title='Detail test', description='Testing detail endpoint',
    )
    StatusHistory.objects.create(
        grievance=grievance, previous_status=None,
        new_status='SUBMITTED', action_by=user, remarks='Created.',
    )

    client = _auth_client(user)
    resp = client.get(f'/api/grievances/{grievance.pk}/')
    assert resp.status_code == status.HTTP_200_OK, f"Got {resp.status_code}"
    assert resp.data['title'] == 'Detail test'
    assert 'status_history' in resp.data
    assert len(resp.data['status_history']) >= 1

    grievance.delete(); user.delete(); cat.delete(); dept.delete()
    print("  PASS grievance detail")


def test_rate_limit_blocks_after_3():
    """After 3 submissions, the 4th is blocked with 429."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='ratelimit', password='testpass123', role='STUDENT', department=dept)
    client = _auth_client(user)

    # Submit 3 grievances
    for i in range(3):
        resp = client.post('/api/grievances/', {
            'title': f'Rate limit test {i}',
            'description': f'Testing rate limiting submission {i}.',
            'category': cat.pk,
            'department': dept.pk,
            'is_anonymous': False,
        }, format='json')
        assert resp.status_code == status.HTTP_201_CREATED, f"Submission {i} failed: {resp.data}"

    # 4th should be blocked
    resp = client.post('/api/grievances/', {
        'title': 'Should be blocked',
        'description': 'This submission should be rate limited.',
        'category': cat.pk,
        'department': dept.pk,
        'is_anonymous': False,
    }, format='json')
    assert resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS, \
        f"Expected 429, got {resp.status_code}: {resp.data}"

    Grievance.objects.filter(user=user).delete()
    user.delete(); cat.delete(); dept.delete()
    print("  PASS rate limit blocks after 3")


def test_description_validation():
    """Description must be 10-5000 characters."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='valid_desc', password='testpass123', role='STUDENT', department=dept)
    client = _auth_client(user)

    # Too short
    resp = client.post('/api/grievances/', {
        'title': 'Validation test',
        'description': 'Short',
        'category': cat.pk,
        'department': dept.pk,
    }, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST, \
        f"Short description should fail, got {resp.status_code}"

    user.delete(); cat.delete(); dept.delete()
    print("  PASS description validation")


def test_secret_code_generated_for_anonymous():
    """Anonymous submission generates an 8-char alphanumeric secret code."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='secret_test', password='testpass123', role='STUDENT', department=dept)
    client = _auth_client(user)

    resp = client.post('/api/grievances/', {
        'title': 'Secret code test',
        'description': 'Testing secret code generation for anonymous grievances.',
        'category': cat.pk,
        'department': dept.pk,
        'is_anonymous': True,
    }, format='json')

    assert resp.status_code == status.HTTP_201_CREATED
    secret = resp.data.get('secret_code')
    assert secret is not None, "Secret code should be returned"
    assert len(secret) == 8, f"Secret code should be 8 chars, got {len(secret)}: {secret}"
    assert secret.isalnum(), "Secret code should be alphanumeric"

    Grievance.objects.filter(id=resp.data['id']).delete()
    user.delete(); cat.delete(); dept.delete()
    print("  PASS secret code generated for anonymous")


def test_anonymous_tracking():
    """POST /api/grievances/track/ with correct ID + code returns grievance detail."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='track_test', password='testpass123', role='STUDENT', department=dept)
    client = _auth_client(user)

    resp = client.post('/api/grievances/', {
        'title': 'Trackable grievance',
        'description': 'This grievance will be tracked anonymously.',
        'category': cat.pk,
        'department': dept.pk,
        'is_anonymous': True,
    }, format='json')
    grievance_id = resp.data['id']
    secret_code = resp.data['secret_code']

    # Track using public endpoint (no auth)
    track_client = APIClient()
    track_resp = track_client.post('/api/grievances/track/', {
        'id': grievance_id,
        'secret_code': secret_code,
    }, format='json')
    assert track_resp.status_code == status.HTTP_200_OK, \
        f"Tracking failed: {track_resp.status_code}: {track_resp.data}"
    assert track_resp.data['title'] == 'Trackable grievance'
    assert track_resp.data['is_anonymous'] is True

    Grievance.objects.filter(id=grievance_id).delete()
    user.delete(); cat.delete(); dept.delete()
    print("  PASS anonymous tracking")


def test_anonymous_tracking_invalid_code():
    """Tracking with wrong code returns 401."""
    dept = _create_dept()
    cat = _create_category()
    user = User.objects.create_user(username='track_bad', password='testpass123', role='STUDENT', department=dept)
    client = _auth_client(user)

    resp = client.post('/api/grievances/', {
        'title': 'Bad code test',
        'description': 'Testing invalid tracking code.',
        'category': cat.pk,
        'department': dept.pk,
        'is_anonymous': True,
    }, format='json')
    grievance_id = resp.data['id']

    track_client = APIClient()
    track_resp = track_client.post('/api/grievances/track/', {
        'id': grievance_id,
        'secret_code': 'WRONG123',
    }, format='json')
    assert track_resp.status_code == status.HTTP_401_UNAUTHORIZED, \
        f"Expected 401, got {track_resp.status_code}"

    Grievance.objects.filter(id=grievance_id).delete()
    user.delete(); cat.delete(); dept.delete()
    print("  PASS anonymous tracking (invalid code)")


def run():
    setup_db()
    call_command('flush', verbosity=0, interactive=False)

    tests = [
        ("List categories (public)",               test_list_categories),
        ("List departments (public)",              test_list_departments),
        ("Submit grievance",                       test_submit_grievance),
        ("Submit grievance (anonymous)",           test_submit_grievance_anonymous),
        ("List grievances (student scoped)",       test_list_grievances_student),
        ("List grievances (CAMPUS_ADMIN only ESCALATED)", test_list_grievances_campus_admin),
        ("Grievance detail",                       test_grievance_detail),
        ("Rate limit blocks after 3",              test_rate_limit_blocks_after_3),
        ("Description validation",                 test_description_validation),
        ("Secret code for anonymous",              test_secret_code_generated_for_anonymous),
        ("Anonymous tracking",                     test_anonymous_tracking),
        ("Anonymous tracking (invalid code)",      test_anonymous_tracking_invalid_code),
    ]

    passed = 0
    failed = 0
    print(f"\n{'='*60}")
    print("  Phase 3 - Grievance Submission & Rate Limiting")
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
            import traceback; traceback.print_exc()
            failed += 1
    print(f"\n{'='*60}")
    print(f"  Results: {passed} passed, {failed} failed, {passed + failed} total")
    print(f"{'='*60}\n")
    return failed == 0


if __name__ == '__main__':
    success = run()
    sys.exit(0 if success else 1)
