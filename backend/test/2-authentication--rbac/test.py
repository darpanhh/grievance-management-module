"""
Tests for Phase 2 -- Authentication & RBAC

Tests JWT authentication (login, register, token refresh, profile, password reset)
and RBAC permission classes (IsStudent, IsHOD, IsCampusAdmin, etc.).

Usage:
    cd backend
    python test/2-authentication--rbac/test.py
"""

import sys
import uuid
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


def _uid(prefix):
    return f'{prefix}_{uuid.uuid4().hex[:6]}'


def _create_dept():
    return Department.objects.create(name=f'Test Dept {uuid.uuid4().hex[:8]}', department_type='ACADEMIC')


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
    uname = _uid('newstudent')
    data = {
        'username': uname,
        'email': f'{uname}@college.edu',
        'password': 'strongpass123',
        'password2': 'strongpass123',
        'first_name': 'New',
        'last_name': 'Student',
        'role': 'STUDENT',
        'contact_number': '9800000000',
        'department': dept.pk,
    }
    resp = client.post('/api/auth/register/', data, format='json')
    assert resp.status_code == status.HTTP_201_CREATED, f"Got {resp.status_code}: {resp.data}"
    assert resp.data['username'] == uname
    assert resp.data['role'] == 'STUDENT'
    assert 'password' not in resp.data
    User.objects.filter(username=uname).delete()
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
        'role': 'STUDENT',
        'contact_number': '9800000000',
        'department': 1,
    }
    resp = client.post('/api/auth/register/', data, format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    print("  PASS register password mismatch")


def test_login_returns_tokens():
    """POST /api/auth/login/ returns JWT access and refresh tokens."""
    dept = _create_dept()
    uname = _uid('logintest')
    _create_user(uname, dept=dept)
    client = APIClient()
    resp = client.post('/api/auth/login/', {
        'username': uname, 'password': 'testpass123',
    }, format='json')
    assert resp.status_code == status.HTTP_200_OK, f"Got {resp.status_code}: {resp.data}"
    assert 'access' in resp.data
    assert 'refresh' in resp.data
    User.objects.filter(username=uname).delete()
    dept.delete()
    print("  PASS login returns tokens")


def test_login_invalid_credentials():
    """Login fails with wrong password."""
    dept = _create_dept()
    uname = _uid('badlogin')
    _create_user(uname, dept=dept)
    client = APIClient()
    resp = client.post('/api/auth/login/', {
        'username': uname, 'password': 'wrongpassword',
    }, format='json')
    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    User.objects.filter(username=uname).delete()
    dept.delete()
    print("  PASS login invalid credentials")


def test_token_refresh():
    """POST /api/auth/token/refresh/ returns a new access token."""
    dept = _create_dept()
    uname = _uid('refreshtest')
    _create_user(uname, dept=dept)
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': uname, 'password': 'testpass123',
    }, format='json')
    resp = client.post('/api/auth/token/refresh/', {
        'refresh': login_resp.data['refresh'],
    }, format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert 'access' in resp.data
    User.objects.filter(username=uname).delete()
    dept.delete()
    print("  PASS token refresh")


def test_get_profile_authenticated():
    """GET /api/auth/me/ returns the authenticated user."""
    dept = _create_dept()
    uname = _uid('profiletest')
    _create_user(uname, dept=dept)
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': uname, 'password': 'testpass123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp.data["access"]}')
    resp = client.get('/api/auth/me/')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['username'] == uname
    User.objects.filter(username=uname).delete()
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
    uname = _uid('patchtest')
    _create_user(uname, dept=dept)
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': uname, 'password': 'testpass123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp.data["access"]}')
    resp = client.patch('/api/auth/me/', {'first_name': 'Patched'}, format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['first_name'] == 'Patched'
    User.objects.filter(username=uname).delete()
    dept.delete()
    print("  PASS patch profile")


def test_password_reset_flow():
    """Full password reset flow works (request -> confirm -> login with new password)."""
    dept = _create_dept()
    uname = _uid('resetuser')
    _create_user(uname, dept=dept)
    client = APIClient()

    # Step 1: Request reset
    req_resp = client.post('/api/auth/password-reset/', {
        'email': f'{uname}@college.edu',
    }, format='json')
    assert req_resp.status_code == status.HTTP_200_OK
    assert 'dev_token' in req_resp.data

    # Step 2: Confirm with token
    confirm_resp = client.post('/api/auth/password-reset/confirm/', {
        'email': f'{uname}@college.edu',
        'token': req_resp.data['dev_token'],
        'password': 'newpassword456',
        'password2': 'newpassword456',
    }, format='json')
    assert confirm_resp.status_code == status.HTTP_200_OK

    # Step 3: Login with new password
    login_resp = client.post('/api/auth/login/', {
        'username': uname, 'password': 'newpassword456',
    }, format='json')
    assert login_resp.status_code == status.HTTP_200_OK

    User.objects.filter(username=uname).delete()
    dept.delete()
    print("  PASS password reset flow")


def test_student_denied_admin():
    """Student cannot access admin-level views."""
    dept = _create_dept()
    uname = _uid('student_admin')
    _create_user(uname, dept=dept)
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': uname, 'password': 'testpass123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp.data["access"]}')

    # Student can access /api/spam/ but only their own (returns 200, not 403)
    resp = client.get('/api/spam/')
    assert resp.status_code == status.HTTP_200_OK, \
        f"Student should get 200 for spam list, got {resp.status_code}"

    # Student cannot access admin dashboard (requires IsAdminUser)
    resp = client.get('/api/dashboard/admin/')
    assert resp.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND), \
        f"Student should be denied admin dashboard, got {resp.status_code}"

    User.objects.filter(username=uname).delete()
    dept.delete()
    print("  PASS student denied admin access")


def test_hod_can_access_spam():
    """HOD can access the spam list for their department."""
    uname = _uid('hod_spam')
    dept = _create_dept()
    _create_user(uname, role='HOD', dept=dept, password='hodpass123')
    client = APIClient()
    login_resp = client.post('/api/auth/login/', {
        'username': uname, 'password': 'hodpass123',
    }, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {login_resp.data["access"]}')
    resp = client.get('/api/spam/')
    assert resp.status_code == status.HTTP_200_OK, \
        f"HOD should get 200, got {resp.status_code}"
    User.objects.filter(username=uname).delete()
    dept.delete()
    print("  PASS HOD can access spam tab")


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
        ("HOD can access spam tab",              test_hod_can_access_spam),
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
