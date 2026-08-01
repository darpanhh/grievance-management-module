"""
Tests for Phase 6 — Response & Escalation Workflow

Tests HOD response, submitter resolve/reopen, admin escalated resolve
(with auto-close), APScheduler-based escalation service, officer
assignment, and invalid transition blocking.

Usage:
    cd backend
    python test/6-response--escalation-workflow/test.py
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

from datetime import timedelta

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from accounts.models import Department, User
from grievances.models import Category, Grievance, StatusHistory


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

import uuid

def _next():
    return uuid.uuid4().hex[:8]


def setup_db():
    """Ensure all database tables exist (safe to call multiple times)."""
    call_command('migrate', verbosity=0, interactive=False, run_syncdb=True)


def _create_dept():
    return Department.objects.create(name=f'Dept {_next()}', department_type='ACADEMIC')


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
# Tests: Workflow endpoints
# ---------------------------------------------------------------------------


def test_hod_respond_under_review():
    dept = _create_dept()
    cat = _create_category()
    hod = _create_user('hod_rur', role='HOD', department=dept)
    student = _create_user('stu_rur', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.UNDER_REVIEW)

    client = _auth_client(hod)
    resp = client.post(
        f'/api/grievances/{grievance.pk}/respond/',
        {'content': 'Thank you for your feedback. We are looking into this.'},
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.RESPONDED, \
        f"Expected RESPONDED, got {grievance.current_status}"

    grievance.delete()
    student.delete()
    hod.delete()
    cat.delete()
    dept.delete()
    print("  PASS HOD respond UNDER_REVIEW")


def test_hod_respond_reopened():
    dept = _create_dept()
    cat = _create_category()
    hod = _create_user('hod_rre', role='HOD', department=dept)
    student = _create_user('stu_rre', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.REOPENED)

    client = _auth_client(hod)
    resp = client.post(
        f'/api/grievances/{grievance.pk}/respond/',
        {'content': 'We have reviewed your appeal and will take action.'},
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.RESPONDED, \
        f"Expected RESPONDED, got {grievance.current_status}"

    grievance.delete()
    student.delete()
    hod.delete()
    cat.delete()
    dept.delete()
    print("  PASS HOD respond REOPENED")


def test_respond_changes_status_to_responded():
    dept = _create_dept()
    cat = _create_category()
    hod = _create_user('hod_rcs', role='HOD', department=dept)
    student = _create_user('stu_rcs', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.UNDER_REVIEW)

    client = _auth_client(hod)
    resp = client.post(
        f'/api/grievances/{grievance.pk}/respond/',
        {'content': 'Status check response.'},
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['current_status'] == Grievance.Status.RESPONDED, \
        f"Expected RESPONDED in response, got {resp.data['current_status']}"
    assert len(resp.data['responses']) >= 1, \
        "Expected at least one response in the detail payload"

    grievance.delete()
    student.delete()
    hod.delete()
    cat.delete()
    dept.delete()
    print("  PASS respond changes status to RESPONDED")


def test_non_hod_cannot_respond():
    dept = _create_dept()
    cat = _create_category()
    staff = _create_user('staff_r', role='STAFF', department=dept)
    student = _create_user('nonhod_s', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.UNDER_REVIEW)

    client = _auth_client(staff)
    resp = client.post(
        f'/api/grievances/{grievance.pk}/respond/',
        {'content': 'Trying to respond as staff.'},
        format='json',
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN, \
        f"Expected 403 for Staff, got {resp.status_code}"

    grievance.delete()
    student.delete()
    staff.delete()
    cat.delete()
    dept.delete()
    print("  PASS non-HOD cannot respond")


def test_submitter_resolve():
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('solv_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.RESPONDED)

    client = _auth_client(student)
    resp = client.post(f'/api/grievances/{grievance.pk}/resolve/', format='json')
    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.RESOLVED, \
        f"Expected RESOLVED, got {grievance.current_status}"

    grievance.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS submitter resolve")


def test_non_submitter_cannot_resolve():
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('orig_stu', role='STUDENT', department=dept)
    other = _create_user('other_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.RESPONDED)

    client = _auth_client(other)
    resp = client.post(f'/api/grievances/{grievance.pk}/resolve/', format='json')
    assert resp.status_code == status.HTTP_403_FORBIDDEN, \
        f"Expected 403 for non-submitter, got {resp.status_code}"

    grievance.delete()
    other.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS non-submitter cannot resolve")


def test_submitter_reopen():
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('reop_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.RESPONDED)

    client = _auth_client(student)
    resp = client.post(f'/api/grievances/{grievance.pk}/reopen/', format='json')
    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.REOPENED, \
        f"Expected REOPENED, got {grievance.current_status}"

    grievance.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS submitter reopen")


def test_resolve_changes_status():
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('res_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.RESPONDED)

    client = _auth_client(student)
    resp = client.post(f'/api/grievances/{grievance.pk}/resolve/', format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['current_status'] == Grievance.Status.RESOLVED, \
        f"Expected RESOLVED in response, got {resp.data['current_status']}"

    grievance.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS resolve changes status")


def test_reopen_sets_is_reopened_flag():
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('flag_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.RESPONDED)
    assert grievance.is_reopened is False, \
        "Initially is_reopened should be False"

    client = _auth_client(student)
    resp = client.post(f'/api/grievances/{grievance.pk}/reopen/', format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['is_reopened'] is True, \
        "Expected is_reopened=True after reopen"

    grievance.refresh_from_db()
    assert grievance.is_reopened is True

    grievance.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS reopen sets is_reopened flag")


# ---------------------------------------------------------------------------
# Tests: Escalation service (single-level)
# ---------------------------------------------------------------------------


def test_escalation_service_finds_stale():
    """
    run_escalation_cycle() finds grievances in UNDER_REVIEW/RESPONDED/REOPENED
    that are older than the configured threshold and escalates them.
    """
    from grievances.services.escalation_service import run_escalation_cycle

    dept = _create_dept()
    cat = _create_category()
    student = _create_user('esc_svc', role='STUDENT', department=dept)
    admin = _create_user('esc_adm', role='CAMPUS_ADMIN')

    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.UNDER_REVIEW,
                                  title='Stale grievance')
    Grievance.objects.filter(pk=grievance.pk).update(
        updated_at=timezone.now() - timedelta(hours=80)
    )

    result = run_escalation_cycle()

    assert result['checked'] >= 1, \
        f"Expected at least 1 checked, got {result['checked']}"
    assert result['escalated'] >= 1, \
        f"Expected at least 1 escalated, got {result['escalated']}"

    grievance.refresh_from_db()
    assert grievance.escalation_level == 1, \
        f"Expected escalation_level=1, got {grievance.escalation_level}"
    assert grievance.current_status == Grievance.Status.ESCALATED, \
        f"Expected ESCALATED, got {grievance.current_status}"
    assert grievance.escalated_to is not None, \
        "Expected escalated_to to be assigned"

    grievance.delete()
    admin.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS escalation service finds stale grievances")


def test_escalation_sets_level_one():
    """
    Escalating a grievance sets escalation_level to 1 (single-level).
    It does NOT increment beyond 1.
    """
    from grievances.services.escalation_service import escalate

    dept = _create_dept()
    cat = _create_category()
    student = _create_user('lev_stu', role='STUDENT', department=dept)
    admin = _create_user('lev_adm', role='CAMPUS_ADMIN')
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.UNDER_REVIEW)

    Grievance.objects.filter(pk=grievance.pk).update(
        updated_at=timezone.now() - timedelta(hours=80)
    )
    grievance.refresh_from_db()

    result = escalate(grievance)
    assert result is True, "Escalation should succeed"

    grievance.refresh_from_db()
    assert grievance.escalation_level == 1, \
        f"Expected level 1, got {grievance.escalation_level}"
    assert grievance.current_status == Grievance.Status.ESCALATED, \
        f"Expected ESCALATED, got {grievance.current_status}"
    assert grievance.escalated_to is not None, \
        "Expected escalated_to to be assigned"

    grievance.delete()
    admin.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS escalation sets level 1")


def test_escalation_assigns_officer():
    """
    After escalation, escalated_to is set to a Campus Admin.
    """
    from grievances.services.escalation_service import escalate

    dept = _create_dept()
    cat = _create_category()
    student = _create_user('off_stu', role='STUDENT', department=dept)
    admin = _create_user('off_adm', role='CAMPUS_ADMIN')
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.UNDER_REVIEW)

    Grievance.objects.filter(pk=grievance.pk).update(
        updated_at=timezone.now() - timedelta(hours=80)
    )
    grievance.refresh_from_db()

    assert escalate(grievance) is True

    grievance.refresh_from_db()
    assert grievance.escalated_to is not None, \
        "escalated_to should be assigned"
    assert grievance.escalated_to.role == 'CAMPUS_ADMIN', \
        f"Expected CAMPUS_ADMIN, got {grievance.escalated_to.role}"

    history_entry = StatusHistory.objects.filter(
        grievance=grievance,
        new_status=Grievance.Status.ESCALATED,
    ).order_by('-created_at').first()
    assert history_entry is not None, \
        "Missing StatusHistory for escalation"
    assert history_entry.remarks != '', \
        "StatusHistory remarks should not be empty"

    grievance.delete()
    admin.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS escalation assigns Campus Admin officer")


def test_escalation_history_has_remarks():
    """
    StatusHistory entries from escalation include meaningful remarks.
    """
    from grievances.services.escalation_service import escalate

    dept = _create_dept()
    cat = _create_category()
    student = _create_user('rem_stu', role='STUDENT', department=dept)
    admin = _create_user('rem_adm', role='CAMPUS_ADMIN')
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.UNDER_REVIEW)

    Grievance.objects.filter(pk=grievance.pk).update(
        updated_at=timezone.now() - timedelta(hours=80)
    )
    grievance.refresh_from_db()

    escalate(grievance)
    grievance.refresh_from_db()

    entry = StatusHistory.objects.filter(
        grievance=grievance,
        new_status=Grievance.Status.ESCALATED,
    ).order_by('-created_at').first()

    assert entry is not None, "Missing StatusHistory entry"
    assert 'Escalated' in entry.remarks or 'assigned to' in entry.remarks.lower(), \
        f"Remarks should mention escalation, got: {entry.remarks}"

    grievance.delete()
    admin.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS escalation history has remarks")


# ---------------------------------------------------------------------------
# Tests: Admin resolve escalated (with auto-close)
# ---------------------------------------------------------------------------


def test_admin_resolve_escalated():
    """
    Campus Admin can resolve an ESCALATED grievance.

    Per the implementation plan (§7.4): Creates a Response record,
    transitions ESCALATED → RESOLVED → CLOSED (auto-close, final).
    """
    dept = _create_dept()
    cat = _create_category()
    admin = _create_user('admin_re', role='CAMPUS_ADMIN')
    student = _create_user('esc_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.ESCALATED)

    client = _auth_client(admin)
    resp = client.post(
        f'/api/admin/escalated/{grievance.pk}/resolve/',
        {'content': 'Resolved by the administration. The matter has been addressed.'},
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"

    # Final status should be CLOSED (auto-close after admin resolve)
    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.CLOSED, \
        f"Expected CLOSED (auto-close), got {grievance.current_status}"

    # A Response record should have been created from the admin
    assert len(resp.data['responses']) >= 1, \
        "Expected at least one Response record from admin resolution"

    # Both transitions should be logged in StatusHistory
    transitions = list(StatusHistory.objects.filter(
        grievance=grievance
    ).values_list('previous_status', 'new_status'))

    assert any(
        prev == Grievance.Status.ESCALATED and nxt == Grievance.Status.RESOLVED
        for prev, nxt in transitions
    ), "Missing StatusHistory for ESCALATED → RESOLVED"
    assert any(
        prev == Grievance.Status.RESOLVED and nxt == Grievance.Status.CLOSED
        for prev, nxt in transitions
    ), "Missing StatusHistory for RESOLVED → CLOSED (auto-close)"

    grievance.delete()
    student.delete()
    admin.delete()
    cat.delete()
    dept.delete()
    print("  PASS admin resolve escalated (with auto-close)")


# ---------------------------------------------------------------------------
# Tests: Signal logging
# ---------------------------------------------------------------------------


def test_status_history_logged_on_transition():
    """
    The pre_save signal creates StatusHistory on every status transition.
    """
    dept = _create_dept()
    cat = _create_category()
    hod = _create_user('sig_hod', role='HOD', department=dept)
    student = _create_user('sig_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.UNDER_REVIEW)

    count_before = StatusHistory.objects.filter(grievance=grievance).count()

    client = _auth_client(hod)
    resp = client.post(
        f'/api/grievances/{grievance.pk}/respond/',
        {'content': 'Signal test response.'},
        format='json',
    )
    assert resp.status_code == status.HTTP_200_OK

    count_after = StatusHistory.objects.filter(grievance=grievance).count()
    assert count_after > count_before, \
        "Expected StatusHistory count to increase after transition"

    latest = StatusHistory.objects.filter(
        grievance=grievance
    ).latest('created_at')
    assert latest.previous_status == Grievance.Status.UNDER_REVIEW, \
        f"Expected previous UNDER_REVIEW, got {latest.previous_status}"
    assert latest.new_status == Grievance.Status.RESPONDED, \
        f"Expected new RESPONDED, got {latest.new_status}"
    assert latest.action_by == hod, \
        "Expected action_by to be the HOD who responded"

    grievance.delete()
    student.delete()
    hod.delete()
    cat.delete()
    dept.delete()
    print("  PASS status history logged on transition")


def test_invalid_transition_blocked():
    """
    Invalid transitions (e.g. resolving a SUBMITTED grievance) are rejected.
    """
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('inv_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.SUBMITTED)

    client = _auth_client(student)
    resp = client.post(f'/api/grievances/{grievance.pk}/resolve/', format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST, \
        f"Expected 400 for invalid transition, got {resp.status_code}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.SUBMITTED, \
        "Status should not have changed after invalid transition"

    grievance.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS invalid transition blocked")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run():
    setup_db()

    tests = [
        ("HOD respond UNDER_REVIEW",            test_hod_respond_under_review),
        ("HOD respond REOPENED",                 test_hod_respond_reopened),
        ("Respond changes status to RESPONDED",  test_respond_changes_status_to_responded),
        ("Non-HOD cannot respond",               test_non_hod_cannot_respond),
        ("Submitter resolve",                    test_submitter_resolve),
        ("Non-submitter cannot resolve",         test_non_submitter_cannot_resolve),
        ("Submitter reopen",                     test_submitter_reopen),
        ("Resolve changes status",               test_resolve_changes_status),
        ("Reopen sets is_reopened flag",         test_reopen_sets_is_reopened_flag),
        ("Escalation service finds stale",       test_escalation_service_finds_stale),
        ("Escalation sets level 1",              test_escalation_sets_level_one),
        ("Escalation assigns officer",           test_escalation_assigns_officer),
        ("Escalation history has remarks",       test_escalation_history_has_remarks),
        ("Admin resolve escalated (auto-close)", test_admin_resolve_escalated),
        ("StatusHistory logged on transition",   test_status_history_logged_on_transition),
        ("Invalid transition blocked",           test_invalid_transition_blocked),
    ]

    passed = 0
    failed = 0
    print(f"\n{'='*60}")
    print("  Phase 6 - Response & Escalation Workflow")
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
