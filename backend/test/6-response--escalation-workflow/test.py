"""
Tests for Phase 6 — Response & Escalation Workflow

Tests HOD response, submitter resolve/reopen, admin escalation review
(via POST .../review/ + respond), CampUS Admin role handling,
APScheduler-based escalation service, and invalid transition blocking.

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
# Use an isolated database so tests never touch the development db.sqlite3.
os.environ.setdefault('SQLITE_NAME', 'test_db.sqlite3')

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

_COUNTER = 0


def _next():
    global _COUNTER
    _COUNTER += 1
    return _COUNTER


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
        "Expected at least one response"

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
        f"Expected 403, got {resp.status_code}"

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


def test_submitter_close():
    """Submitter can close a RESOLVED grievance (e.g. after admin escalation)."""
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('clos_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.RESOLVED)

    client = _auth_client(student)
    resp = client.post(f'/api/grievances/{grievance.pk}/resolve/', format='json')
    assert resp.status_code == status.HTTP_200_OK, \
        f"Expected 200, got {resp.status_code}: {resp.data}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.CLOSED, \
        f"Expected CLOSED, got {grievance.current_status}"

    grievance.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS submitter close")


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
        f"Expected 403, got {resp.status_code}"

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


def test_submitter_reopen_from_resolved():
    """Submitter can reopen from RESOLVED (after admin escalation)."""
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('rerp_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.RESOLVED)

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
    print("  PASS submitter reopen from RESOLVED")


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
        f"Expected RESOLVED, got {resp.data['current_status']}"

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
    assert grievance.is_reopened is False

    client = _auth_client(student)
    resp = client.post(f'/api/grievances/{grievance.pk}/reopen/', format='json')
    assert resp.status_code == status.HTTP_200_OK
    assert resp.data['is_reopened'] is True

    grievance.refresh_from_db()
    assert grievance.is_reopened is True

    grievance.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS reopen sets is_reopened flag")


# ---------------------------------------------------------------------------
# Tests: Admin escalation review (new flow)
# ---------------------------------------------------------------------------


def test_admin_review_escalated():
    """
    Campus Admin reviews an ESCALATED grievance via POST .../review/,
    then responds via POST .../respond/.  The submitter then decides
    to close or reopen.
    """
    dept = _create_dept()
    cat = _create_category()
    admin = _create_user('adm_rev', role='CAMPUS_ADMIN')
    student = _create_user('esc_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.ESCALATED)

    # Admin reviews the escalated grievance → UNDER_REVIEW
    client = _auth_client(admin)
    review_resp = client.post(f'/api/grievances/{grievance.pk}/review/')
    assert review_resp.status_code == status.HTTP_200_OK, \
        f"Review failed: {review_resp.status_code}: {review_resp.data}"
    assert review_resp.data['current_status'] == 'UNDER_REVIEW', \
        f"Expected UNDER_REVIEW, got {review_resp.data['current_status']}"

    # Admin responds → RESPONDED
    respond_resp = client.post(
        f'/api/grievances/{grievance.pk}/respond/',
        {'content': 'Admin has reviewed and resolved this matter.'},
        format='json',
    )
    assert respond_resp.status_code == status.HTTP_200_OK, \
        f"Respond failed: {respond_resp.status_code}: {respond_resp.data}"
    assert respond_resp.data['current_status'] == 'RESPONDED', \
        f"Expected RESPONDED, got {respond_resp.data['current_status']}"

    # Submitter resolves (RESPONDED → RESOLVED), then closes (RESOLVED → CLOSED)
    sub_client = _auth_client(student)
    resolve_resp = sub_client.post(f'/api/grievances/{grievance.pk}/resolve/', format='json')
    assert resolve_resp.status_code == status.HTTP_200_OK
    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.RESOLVED, \
        f"Expected RESOLVED after first resolve, got {grievance.current_status}"

    close_resp = sub_client.post(f'/api/grievances/{grievance.pk}/resolve/', format='json')
    assert close_resp.status_code == status.HTTP_200_OK
    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.CLOSED, \
        f"Expected CLOSED, got {grievance.current_status}"

    # StatusHistory should have all transitions
    transitions = list(StatusHistory.objects.filter(
        grievance=grievance
    ).values_list('previous_status', 'new_status'))
    assert any(
        prev == 'ESCALATED' and nxt == 'UNDER_REVIEW'
        for prev, nxt in transitions
    ), "Missing StatusHistory for ESCALATED → UNDER_REVIEW"

    grievance.delete()
    student.delete()
    admin.delete()
    cat.delete()
    dept.delete()
    print("  PASS admin review escalated (review → respond → close)")


# ---------------------------------------------------------------------------
# Tests: Escalation service (single-level)
# ---------------------------------------------------------------------------


def test_escalation_finds_stale():
    from grievances.services.escalation import run_escalation_cycle

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
    assert grievance.escalated_to is not None

    grievance.delete()
    admin.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS escalation service finds stale grievances")


def test_escalation_sets_level_one():
    from grievances.services.escalation import escalate

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
    assert result is True

    grievance.refresh_from_db()
    assert grievance.escalation_level == 1
    assert grievance.current_status == Grievance.Status.ESCALATED
    assert grievance.escalated_to is not None

    grievance.delete()
    admin.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS escalation sets level 1")


def test_escalation_assigns_officer():
    from grievances.services.escalation import escalate

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
    assert grievance.escalated_to is not None
    assert grievance.escalated_to.role == 'CAMPUS_ADMIN'

    history_entry = StatusHistory.objects.filter(
        grievance=grievance,
        new_status=Grievance.Status.ESCALATED,
    ).order_by('-created_at').first()
    assert history_entry is not None
    assert history_entry.remarks != ''

    grievance.delete()
    admin.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS escalation assigns Campus Admin officer")


def test_escalation_history_has_remarks():
    from grievances.services.escalation import escalate

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

    assert entry is not None
    assert 'assigned to' in entry.remarks.lower(), \
        f"Remarks should mention assignment, got: {entry.remarks}"

    grievance.delete()
    admin.delete()
    student.delete()
    cat.delete()
    dept.delete()
    print("  PASS escalation history has remarks")


# ---------------------------------------------------------------------------
# Tests: Signal logging
# ---------------------------------------------------------------------------


def test_status_history_logged_on_transition():
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
    assert count_after > count_before

    latest = StatusHistory.objects.filter(grievance=grievance).latest('created_at')
    assert latest.previous_status == Grievance.Status.UNDER_REVIEW
    assert latest.new_status == Grievance.Status.RESPONDED
    assert latest.action_by == hod

    grievance.delete()
    student.delete()
    hod.delete()
    cat.delete()
    dept.delete()
    print("  PASS status history logged on transition")


def test_invalid_transition_blocked():
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('inv_stu', role='STUDENT', department=dept)
    grievance = _create_grievance(student, dept, cat,
                                  Grievance.Status.SUBMITTED)

    client = _auth_client(student)
    resp = client.post(f'/api/grievances/{grievance.pk}/resolve/', format='json')
    assert resp.status_code == status.HTTP_400_BAD_REQUEST, \
        f"Expected 400, got {resp.status_code}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.SUBMITTED

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
    call_command('flush', verbosity=0, interactive=False)

    tests = [
        ("HOD respond UNDER_REVIEW",              test_hod_respond_under_review),
        ("HOD respond REOPENED",                   test_hod_respond_reopened),
        ("Respond changes status to RESPONDED",    test_respond_changes_status_to_responded),
        ("Non-HOD cannot respond",                 test_non_hod_cannot_respond),
        ("Submitter resolve",                      test_submitter_resolve),
        ("Submitter close (RESOLVED→CLOSED)",       test_submitter_close),
        ("Non-submitter cannot resolve",           test_non_submitter_cannot_resolve),
        ("Submitter reopen",                       test_submitter_reopen),
        ("Submitter reopen from RESOLVED",         test_submitter_reopen_from_resolved),
        ("Resolve changes status",                 test_resolve_changes_status),
        ("Reopen sets is_reopened flag",           test_reopen_sets_is_reopened_flag),
        ("Admin review escalated (review→respond→close)", test_admin_review_escalated),
        ("Escalation service finds stale",         test_escalation_finds_stale),
        ("Escalation sets level 1",                test_escalation_sets_level_one),
        ("Escalation assigns officer",             test_escalation_assigns_officer),
        ("Escalation history has remarks",         test_escalation_history_has_remarks),
        ("StatusHistory logged on transition",     test_status_history_logged_on_transition),
        ("Invalid transition blocked",             test_invalid_transition_blocked),
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
