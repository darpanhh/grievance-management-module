"""
Tests for Phase 7 — Dashboards, Search & Export

Tests student/department/admin dashboards, search/filter on the grievance
list view, ordering, CSV export with filters, and anonymous identity
exclusion from export output.

Usage:
    cd backend
    python test/7-dashboards--search--export/test.py
"""

import csv
import io
import os
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('USE_SQLITE', 'True')

import django
django.setup()

from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework import status
from accounts.models import Department, User
from grievances.models import Category, Grievance


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_COUNTER = 0


def _next():
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


def setup_db():
    """Ensure all database tables exist (safe to call multiple times)."""
    call_command('migrate', verbosity=0, interactive=False, run_syncdb=True)


def _create_dept(name=None):
    return Department.objects.create(
        name=name or f'Dept {_next()}',
        department_type='ACADEMIC',
    )


def _create_category():
    return Category.objects.create(name=f'Cat {_next()}', description='Test category')


def _create_user(username, role='STUDENT', department=None, password='testpass123'):
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


_DESC = (
    "I am writing to bring to your attention an issue with the examination "
    "results for the subject of Data Structures. The grade displayed in the "
    "system does not match the marks I received in my answer sheet. I have "
    "attached a copy of my answer sheet for reference. Please look into this "
    "matter and update the records accordingly. Thank you for your time and "
    "consideration."
)


def _create_grievance(user, dept, cat, status=Grievance.Status.UNDER_REVIEW,
                      title='Test grievance'):
    """Create a grievance directly (bypasses submission pipeline)."""
    return Grievance.objects.create(
        user=user,
        department=dept,
        category=cat,
        title=title,
        description=_DESC,
        current_status=status,
    )


# ---------------------------------------------------------------------------
# Tests: Dashboards
# ---------------------------------------------------------------------------


def test_student_dashboard():
    """Student dashboard returns own grievances with counts."""
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('stu_dsh', role='STUDENT', department=dept)

    g1 = _create_grievance(student, dept, cat, Grievance.Status.UNDER_REVIEW,
                           title='Dashboard test 1')
    g2 = _create_grievance(student, dept, cat, Grievance.Status.RESOLVED,
                           title='Dashboard test 2')

    client = _auth_client(student)
    resp = client.get('/api/dashboard/student/', format='json')

    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"
    assert resp.data['counts']['total'] >= 2, \
        f"Expected total >= 2, got {resp.data['counts']['total']}"
    assert resp.data['counts']['resolved'] >= 1, \
        f"Expected resolved >= 1, got {resp.data['counts']['resolved']}"
    assert 'grievances' in resp.data, \
        "Expected 'grievances' key in response"
    assert 'pending' in resp.data['counts'], \
        "Expected 'pending' in counts"

    g1.delete()
    g2.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS student dashboard")


def test_department_dashboard():
    """HOD sees department grievances with tab counts."""
    dept = _create_dept()
    cat = _create_category()
    hod = _create_user('hod_dsh', role='HOD', department=dept)
    student = _create_user('stu_dsh2', role='STUDENT', department=dept)

    g1 = _create_grievance(student, dept, cat, Grievance.Status.UNDER_REVIEW,
                           title='Dept dash open')
    g2 = _create_grievance(student, dept, cat, Grievance.Status.RESOLVED,
                           title='Dept dash resolved')

    client = _auth_client(hod)
    resp = client.get('/api/dashboard/department/', format='json')

    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"
    assert resp.data['counts']['total'] >= 2, \
        f"Expected total >= 2, got {resp.data['counts']['total']}"
    assert resp.data['counts']['open'] >= 1, \
        f"Expected open >= 1, got {resp.data['counts']['open']}"
    assert resp.data['counts']['resolved'] >= 1, \
        f"Expected resolved >= 1, got {resp.data['counts']['resolved']}"

    g1.delete()
    g2.delete()
    student.delete()
    hod.delete()
    cat.delete()
    dept.delete()
    print("  PASS department dashboard")


def test_admin_dashboard():
    """Campus Admin sees system-wide stats."""
    dept = _create_dept()
    cat = _create_category()
    admin = _create_user('adm_dsh', role='CAMPUS_ADMIN')
    student = _create_user('stu_dsh3', role='STUDENT', department=dept)

    g1 = _create_grievance(student, dept, cat, Grievance.Status.RESOLVED,
                           title='Admin dash item')
    g2 = _create_grievance(student, dept, cat, Grievance.Status.ESCALATED,
                           title='Escalated item')

    client = _auth_client(admin)
    resp = client.get('/api/dashboard/admin/', format='json')

    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"
    assert resp.data['counts']['total'] >= 2, \
        f"Expected total >= 2, got {resp.data['counts']['total']}"
    assert 'status_breakdown' in resp.data['counts'], \
        "Expected status_breakdown in counts"
    assert resp.data['counts']['escalated'] >= 1, \
        f"Expected escalated >= 1, got {resp.data['counts']['escalated']}"
    assert 'recent' in resp.data, \
        "Expected 'recent' list in response"

    g1.delete()
    g2.delete()
    student.delete()
    admin.delete()
    cat.delete()
    dept.delete()
    print("  PASS admin dashboard")


# ---------------------------------------------------------------------------
# Tests: Search & Filter
# ---------------------------------------------------------------------------


def test_search_by_title():
    """Search query filters grievances by title."""
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('stu_sch', role='STUDENT', department=dept)

    g1 = _create_grievance(student, dept, cat, Grievance.Status.UNDER_REVIEW,
                           title='UniqueSearchPhrase grievance')
    g2 = _create_grievance(student, dept, cat, Grievance.Status.UNDER_REVIEW,
                           title='Another grievance entirely')

    client = _auth_client(student)
    resp = client.get('/api/grievances/?search=UniqueSearchPhrase', format='json')

    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}"
    results = resp.data['results'] if 'results' in resp.data else resp.data
    titles = [item['title'] for item in results]
    assert any('UniqueSearchPhrase' in t for t in titles), \
        f"Expected search to find 'UniqueSearchPhrase', got titles: {titles}"

    g1.delete()
    g2.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS search by title")


def test_filter_by_status():
    """Status query param filters correctly."""
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('stu_flt', role='STUDENT', department=dept)

    g1 = _create_grievance(student, dept, cat, Grievance.Status.UNDER_REVIEW,
                           title='Under review item')
    g2 = _create_grievance(student, dept, cat, Grievance.Status.RESOLVED,
                           title='Resolved item')

    client = _auth_client(student)
    resp = client.get(f'/api/grievances/?status={Grievance.Status.RESOLVED}', format='json')

    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}"
    results = resp.data['results'] if 'results' in resp.data else resp.data
    for item in results:
        assert item['current_status'] == Grievance.Status.RESOLVED, \
            f"Expected {Grievance.Status.RESOLVED}, got {item['current_status']}"

    g1.delete()
    g2.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS filter by status")


def test_filter_by_category():
    """Category query param filters correctly."""
    dept = _create_dept()
    cat1 = _create_category()
    cat2 = _create_category()
    student = _create_user('stu_cat', role='STUDENT', department=dept)

    g1 = _create_grievance(student, dept, cat1, Grievance.Status.UNDER_REVIEW,
                           title='Cat1 grievance')
    g2 = _create_grievance(student, dept, cat2, Grievance.Status.UNDER_REVIEW,
                           title='Cat2 grievance')

    client = _auth_client(student)
    resp = client.get(f'/api/grievances/?category={cat1.id}', format='json')

    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}"
    results = resp.data['results'] if 'results' in resp.data else resp.data
    for item in results:
        assert item['category'] == cat1.id, \
            f"Expected category {cat1.id}, got {item['category']}"

    g1.delete()
    g2.delete()
    student.delete()
    cat1.delete()
    cat2.delete()
    dept.delete()
    print("  PASS filter by category")


def test_filter_by_date_range():
    """date_from / date_to filters correctly."""
    from datetime import timedelta
    from django.utils import timezone

    dept = _create_dept()
    cat = _create_category()
    student = _create_user('stu_dt', role='STUDENT', department=dept)

    grievance = _create_grievance(student, dept, cat, Grievance.Status.UNDER_REVIEW,
                                  title='Date range test')
    # Set created_at to yesterday to make filtering deterministic
    yesterday = timezone.now() - timedelta(days=1)
    Grievance.objects.filter(pk=grievance.pk).update(created_at=yesterday)
    grievance.refresh_from_db()

    date_str = yesterday.strftime('%Y-%m-%d')

    client = _auth_client(student)

    # Filter with date_from = yesterday
    resp = client.get(f'/api/grievances/?date_from={date_str}', format='json')
    assert resp.status_code == status.HTTP_200_OK
    results = resp.data['results'] if 'results' in resp.data else resp.data
    ids_found = [item['id'] for item in results]
    assert grievance.id in ids_found, \
        f"Expected grievance in date_from filter results, not found in {ids_found}"

    # Filter with date_from = tomorrow (should exclude)
    tomorrow_str = (timezone.now() + timedelta(days=1)).strftime('%Y-%m-%d')
    resp2 = client.get(f'/api/grievances/?date_from={tomorrow_str}', format='json')
    assert resp2.status_code == status.HTTP_200_OK
    results2 = resp2.data['results'] if 'results' in resp2.data else resp2.data
    ids2 = [item['id'] for item in results2]
    assert grievance.id not in ids2, \
        "Expected grievance excluded when date_from is in the future"

    grievance.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS filter by date range")


def test_ordering():
    """Ordering param sorts results."""
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('stu_ord', role='STUDENT', department=dept)

    g1 = _create_grievance(student, dept, cat, Grievance.Status.UNDER_REVIEW,
                           title='A title')
    g2 = _create_grievance(student, dept, cat, Grievance.Status.UNDER_REVIEW,
                           title='B title')

    client = _auth_client(student)

    # Ascending by title
    resp = client.get('/api/grievances/?ordering=title', format='json')
    assert resp.status_code == status.HTTP_200_OK
    results = resp.data['results'] if 'results' in resp.data else resp.data
    titles = [item['title'] for item in results]
    assert titles == sorted(titles), \
        f"Expected ascending order, got {titles}"

    # Descending by title
    resp2 = client.get('/api/grievances/?ordering=-title', format='json')
    assert resp2.status_code == status.HTTP_200_OK
    results2 = resp2.data['results'] if 'results' in resp2.data else resp2.data
    titles2 = [item['title'] for item in results2]
    assert titles2 == sorted(titles2, reverse=True), \
        f"Expected descending order, got {titles2}"

    g1.delete()
    g2.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS ordering")


# ---------------------------------------------------------------------------
# Tests: Export
# ---------------------------------------------------------------------------


def test_export_csv():
    """CSV export returns correct headers and data."""
    dept = _create_dept()
    cat = _create_category()
    admin = _create_user('exp_adm', role='CAMPUS_ADMIN')
    student = _create_user('exp_stu', role='STUDENT', department=dept)

    grievance = _create_grievance(student, dept, cat, Grievance.Status.RESOLVED,
                                  title='Export test grievance')

    client = _auth_client(admin)
    resp = client.get('/api/reports/export/')

    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}"
    assert resp['Content-Type'] == 'text/csv', \
        f"Expected text/csv, got {resp['Content-Type']}"
    assert 'attachment; filename=' in resp['Content-Disposition'], \
        "Expected Content-Disposition with filename"

    # Parse CSV
    reader = csv.reader(io.StringIO(resp.content.decode('utf-8')))
    rows = list(reader)
    assert len(rows) >= 2, \
        f"Expected at least 2 rows (header + data), got {len(rows)}"
    assert 'ID' in rows[0], \
        f"Expected 'ID' header, got {rows[0]}"
    assert 'Title' in rows[0], \
        f"Expected 'Title' header, got {rows[0]}"

    grievance.delete()
    student.delete()
    admin.delete()
    cat.delete()
    dept.delete()
    print("  PASS export CSV")


def test_export_filters():
    """Export respects department/status/date filters."""
    from datetime import timedelta
    from django.utils import timezone

    dept1 = _create_dept('Export Dept 1')
    dept2 = _create_dept('Export Dept 2')
    cat = _create_category()
    admin = _create_user('expflt_adm', role='CAMPUS_ADMIN')
    student = _create_user('expflt_stu', role='STUDENT', department=dept1)

    g1 = _create_grievance(student, dept1, cat, Grievance.Status.UNDER_REVIEW,
                           title='Dept1 grievance')
    g2 = _create_grievance(student, dept2, cat, Grievance.Status.RESOLVED,
                           title='Dept2 grievance')

    client = _auth_client(admin)

    # Filter by department
    resp = client.get('/api/reports/export/', {'department': dept1.id})
    assert resp.status_code == status.HTTP_200_OK
    reader = csv.reader(io.StringIO(resp.content.decode('utf-8')))
    rows = list(reader)
    data_rows = rows[1:]  # skip header
    for row in data_rows:
        assert dept1.name in row or str(g1.id) == row[0], \
            f"Expected only department 1 data, got {row}"

    g1.delete()
    g2.delete()
    student.delete()
    admin.delete()
    cat.delete()
    dept1.delete()
    dept2.delete()
    print("  PASS export filters")


def test_export_excludes_anonymous_identity():
    """Anonymous submitter name excluded from export."""
    dept = _create_dept()
    cat = _create_category()
    admin = _create_user('expanon_adm', role='CAMPUS_ADMIN')
    student = _create_user('expanon_stu', role='STUDENT', department=dept)

    grievance = Grievance.objects.create(
        user=student,
        department=dept,
        category=cat,
        title='Anonymous export',
        description=_DESC,
        current_status=Grievance.Status.SUBMITTED,
        is_anonymous=True,
    )

    client = _auth_client(admin)
    resp = client.get('/api/reports/export/')

    assert resp.status_code == status.HTTP_200_OK
    reader = csv.reader(io.StringIO(resp.content.decode('utf-8')))
    rows = list(reader)
    data_rows = rows[1:]  # skip header

    matched = [r for r in data_rows if r[0] == str(grievance.id)]
    assert len(matched) == 1, \
        f"Expected 1 row for anonymous grievance, got {len(matched)}"
    row = matched[0]
    # Column 5 (index 5) is 'Submitter Name'
    assert row[5] == '' or row[5] == 'None', \
        f"Expected empty submitter name for anonymous, got '{row[5]}'"

    grievance.delete()
    student.delete()
    admin.delete()
    cat.delete()
    dept.delete()
    print("  PASS export excludes anonymous identity")


def test_non_admin_cannot_export():
    """Only Campus Admin can access export."""
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('expna_stu', role='STUDENT', department=dept)

    client = _auth_client(student)
    resp = client.get('/api/reports/export/')

    assert resp.status_code in (status.HTTP_403_FORBIDDEN,), \
        f"Expected 403 for non-admin, got {resp.status_code}"

    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS non-admin cannot export")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run():
    setup_db()

    # Flush all tables to prevent stale data conflicts from prior runs
    call_command('flush', verbosity=0, interactive=False)

    tests = [
        ("Student dashboard",                    test_student_dashboard),
        ("Department dashboard",                 test_department_dashboard),
        ("Admin dashboard",                      test_admin_dashboard),
        ("Search by title",                      test_search_by_title),
        ("Filter by status",                     test_filter_by_status),
        ("Filter by category",                   test_filter_by_category),
        ("Filter by date range",                 test_filter_by_date_range),
        ("Ordering",                             test_ordering),
        ("Export CSV",                           test_export_csv),
        ("Export filters",                       test_export_filters),
        ("Export excludes anonymous identity",   test_export_excludes_anonymous_identity),
        ("Non-admin cannot export",              test_non_admin_cannot_export),
    ]

    passed = 0
    failed = 0
    print(f"\n{'='*60}")
    print("  Phase 7 — Dashboards, Search & Export")
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
