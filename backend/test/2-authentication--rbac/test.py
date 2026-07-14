"""
Tests for Phase 2 -- Authentication & RBAC

Tests JWT authentication (login, register, token refresh, profile, password reset)
and RBAC permission classes (IsStudent, IsHOD, IsCampusAdmin, etc.).

Usage:
    cd backend
    python test/2-authentication--rbac/test.py
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


def setup_db():
    """Ensure all database tables exist (safe to call multiple times)."""
    call_command('migrate', verbosity=0, interactive=False, run_syncdb=True)


def _create_dept(name='Test Dept'):
    return Department.objects.create(name=name, department_type='ACADEMIC')


def _create_user(username, role='STUDENT', dept=None, password='testpass123'):
    return User.objects.create_user(
        username=username,
        email=f'{username}@college.edu',
        password=password,
        first_name=username.capitalize(),
        last_name='User',
        role=role,
        department=dept,
    )


def test_register_creates_user():
    """POST /api/auth/register/ creates a new STUDENT user."""
    dept = _create_dept()
    client = APIClient()
    data = {
        'username': 'newstudent',
        'email': 'newstudent@college.edu',
        'password': 'strongpass123',
        'password2': 'strongpass123',
        'first_name': 'New',
        'last_name': 'Student',
        'department': dept.pk,
    }
    resp = client.post('/api/auth/register/', data, format='json')
    assert resp.status_code == status.HTTP_201_CREATED, f"Got {resp.status_code}: {resp.data}"
    assert resp.data['username'] == 'newstudent'
    assert resp.data['role'] == 'STUDENT'
    assert 'password' not in resp.data
    User.objects.filter(username='newstudent').delete()
    dept.delete()
    print("  PASS register creates user")


def test_register_password_mismatch():
    """Registration fails when passwords do not match."""
    client = APIClient()
    data = {
        'username': 'mismatch',
        'email': 'mismatch@college.edu',
        'password': 'strongpass123',
        'password2': 'differentpass456',
        'first_name': 'Mismatch',
        'last_name': 'User',
    }
    resp = client.post('/api/auth/register/', data, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    print("  PASS register password mismatch")


def test_login_returns_tokens():
    """POST /api/auth/login/ returns JWT access and refresh tokens."""
    dept = _create_dept()
    _create_user('logintest', dept=dept)
    client = APIClient()
    resp = client.post('/api/auth/login/', {
        'username': 'logintest', 'password': 'testpass123',
    }, format='json')
    assert resp.status_code == status.HTTP_200_OK, f"Got {resp.status_code}: {resp.data}"
    assert 'access' in resp.data
    assert 'refresh' in resp.data
    User.objects.filter(username='logintest').delete()
    dept.delete()
    print("  PASS login returns tokens")


def test_login_invalid_credentials():
    """Login fails with wrong password."""
    dept = _create_dept()
    _create_user('badlogin', dept=dept)
    client = APIClient()
    resp = client.post('/api/auth/login/', {
        'username': 'badlogin', 'password': 'wrongpassword',
    }, format='json')
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    User.objects.filter(username='badlogin').delete()
    dept.delete()
    print("  PASS login invalid credentials")


def test_token_refresh():
    """POST /api/auth/token/refresh/ returns a new access token."""
    dept = _create_dept()
    _create_user('refreshtest', dept=dept)
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': 'refreshtest', 'password': 'testpass123',
    }, format='json')
    resp = client.post('/api/auth/token/refresh/', {
        'refresh': login_resp.data['refresh'],
    }, format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert 'access' in resp.data
    User.objects.filter(username='refreshtest').delete()
    dept.delete()
    print("  PASS token refresh")


def test_get_profile_authenticated():
    """GET /api/auth/me/ returns the authenticated user."""
    dept = _create_dept()
    _create_user('profiletest', dept=dept)
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': 'profiletest', 'password': 'testpass123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp.data["access"]}')
    resp = client.get('/api/auth/me/')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['username'] == 'profiletest'
    User.objects.filter(username='profiletest').delete()
    dept.delete()
    print("  PASS get profile (authenticated)")


def test_get_profile_unauthenticated():
    """GET /api/auth/me/ fails without auth."""
    client = APIClient()
    resp = client.get('/api/auth/me/')
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    print("  PASS get profile (unauthenticated)")


def test_patch_profile():
    """PATCH /api/auth/me/ updates profile fields."""
    dept = _create_dept()
    _create_user('patchtest', dept=dept)
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': 'patchtest', 'password': 'testpass123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp.data["access"]}')
    resp = client.patch('/api/auth/me/', {'first_name': 'Patched'}, format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['first_name'] == 'Patched'
    User.objects.filter(username='patchtest').delete()
    dept.delete()
    print("  PASS patch profile")


def test_password_reset_flow():
    """Full password reset flow works (request -> confirm -> login with new password)."""
    dept = _create_dept()
    _create_user('resetuser', dept=dept)
    client = APIClient()

    # Step 1: Request reset
    req_resp = client.post('/api/auth/password-reset/', {
        'email': 'resetuser@college.edu',
    }, format='json')
    assert req_resp.status_code == status.HTTP_200_OK
    assert 'dev_token' in req_resp.data

    # Step 2: Confirm with token
    confirm_resp = client.post('/api/auth/password-reset/confirm/', {
        'email': 'resetuser@college.edu',
        'token': req_resp.data['dev_token'],
        'password': 'newpassword456',
        'password2': 'newpassword456',
    }, format='json')
    assert confirm_resp.status_code == status.HTTP_200_OK

    # Step 3: Login with new password
    login_resp = client.post('/api/auth/login/', {
        'username': 'resetuser', 'password': 'newpassword456',
    }, format='json')
    assert login_resp.status_code == status.HTTP_200_OK

    User.objects.filter(username='resetuser').delete()
    dept.delete()
    print("  PASS password reset flow")


def test_student_denied_admin():
    """Student cannot access admin-level views."""
    dept = _create_dept()
    _create_user('student_admin', dept=dept)
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': 'student_admin', 'password': 'testpass123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp.data["access"]}')
    resp = client.get('/api/admin/spam-queue/')
    assert resp.status_code == status.HTTP_403_FORBIDDEN, \
        f"Student should get 403, got {resp.status_code}"
    User.objects.filter(username='student_admin').delete()
    dept.delete()
    print("  PASS student denied admin access")


def test_admin_can_access_spam_queue():
    """Campus Admin can access the spam queue."""
    admin = _create_user('admin_test', role='CAMPUS_ADMIN', password='adminpass123')
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': 'admin_test', 'password': 'adminpass123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp.data["access"]}')
    resp = client.get('/api/admin/spam-queue/')
    assert resp.status_code == status.HTTP_200_OK, \
        f"Admin should get 200, got {resp.status_code}"
    User.objects.filter(username='admin_test').delete()
    print("  PASS admin can access spam queue")


def run():
    setup_db()

    tests = [
        ("Register creates user",                test_register_creates_user),
        ("Register password mismatch",           test_register_password_mismatch),
        ("Login returns tokens",                 test_login_returns_tokens),
        ("Login invalid credentials",            test_login_invalid_credentials),
        ("Token refresh",                        test_token_refresh),
        ("Get profile (authenticated)",          test_get_profile_authenticated),
        ("Get profile (unauthenticated)",        test_get_profile_unauthenticated),
        ("Patch profile",                        test_patch_profile),
        ("Password reset flow",                  test_password_reset_flow),
        ("Student denied admin access",          test_student_denied_admin),
        ("Admin can access spam queue",          test_admin_can_access_spam_queue),
    ]

    passed = 0
    failed = 0
    print(f"\n{'='*60}")
    print("  Phase 2 - Authentication & RBAC")
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
