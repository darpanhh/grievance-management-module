"""
Tests for Phase 8 — Unified Request & Admin Review Workflow

Tests student appeal submission (mandatory reason enforcement), Request routing
(Student -> Campus Admin -> Dept/HOD), unified Request model operations, Campus Admin
request listing/filtering, forwarding requests to departments, rejecting requests,
and Campus Admin action-oriented dashboard metrics.
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
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIClient
from rest_framework import status
from accounts.models import Department, User
from grievances.models import Category, Grievance, Request, StatusHistory

_COUNTER = 0

def _next():
    global _COUNTER
    _COUNTER += 1
    return _COUNTER

def setup_db():
    call_command('migrate', verbosity=0, interactive=False)
    # Wipe test-created data from previous runs so the suite is re-runnable
    from django.db.models import Q
    from grievances.models import Grievance
    from accounts.models import User as AccountUser
    test_depts = Department.objects.filter(name__regex=r'^Dept \d+$')
    test_cats = Category.objects.filter(name__regex=r'^Cat \d+$')
    test_users = AccountUser.objects.filter(username__regex=r'^[a-z0-9]+_\d+$')
    Grievance.objects.filter(
        Q(department__in=test_depts) | Q(category__in=test_cats) | Q(user__in=test_users)
    ).delete()
    test_users.delete()
    test_depts.delete()
    test_cats.delete()

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

def test_unified_request_workflow():
    setup_db()
    print("\n============================================================")
    print("  Phase 8 - Unified Request Workflow Tests")
    print("============================================================\n")

    dept = _create_dept()
    cat = _create_category()
    student = _create_user('student1', role='STUDENT', department=dept)
    hod = _create_user('hod1', role='HOD', department=dept)
    admin = _create_user('admin1', role='CAMPUS_ADMIN')

    client_student = _auth_client(student)
    client_admin = _auth_client(admin)

    # 1. Test Rejection Appeal Workflow
    rejected_g = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Rejected Grievance Test', description='Test description for rejection',
        current_status=Grievance.Status.REJECTED
    )

    # Missing reason validation
    res = client_student.post(f'/api/grievances/{rejected_g.id}/request/', {
        'request_type': 'REJECTION_APPEAL',
        'reason': '',
    })
    assert res.status_code == status.HTTP_400_BAD_REQUEST, "Should block empty reason"
    print("  PASS Empty reason validation blocked")

    # Valid Rejection Appeal
    res = client_student.post(f'/api/grievances/{rejected_g.id}/request/', {
        'request_type': 'REJECTION_APPEAL',
        'reason': 'The rejection ignored the attached grade records.',
    })
    assert res.status_code == status.HTTP_201_CREATED, f"Expected 201 created, got {res.status_code}"
    req_id = res.data['id']
    print("  PASS Student submitted Rejection Appeal with mandatory reason")

    # Verify Request model entry
    req_obj = Request.objects.get(pk=req_id)
    assert req_obj.status == Request.RequestStatus.PENDING
    assert req_obj.request_type == Request.RequestType.REJECTION_APPEAL
    assert req_obj.grievance == rejected_g
    assert req_obj.original_status == Grievance.Status.REJECTED
    print("  PASS Unified Request record verified in database")

    # Grievance status must reflect the pending appeal
    rejected_g.refresh_from_db()
    assert rejected_g.current_status == Grievance.Status.APPEAL_PENDING, \
        f"Expected APPEAL_PENDING, got {rejected_g.current_status}"
    print("  PASS Grievance status changed to APPEAL_PENDING on appeal submission")

    # Exactly one StatusHistory entry for the appeal transition (no duplicates)
    appeal_entries = rejected_g.status_history.filter(
        previous_status=Grievance.Status.REJECTED,
        new_status=Grievance.Status.APPEAL_PENDING,
    )
    assert appeal_entries.count() == 1, \
        f"Expected 1 appeal history entry, got {appeal_entries.count()}"
    print("  PASS Appeal transition logged exactly once in status history")

    # 2. Test Admin Request Listing
    res = client_admin.get('/api/admin/requests/?request_type=REJECTION_APPEAL')
    assert res.status_code == status.HTTP_200_OK
    assert len(res.data) >= 1
    print("  PASS Campus Admin listed pending requests with filter")

    # 3. Test Admin Forwarding Request to Department
    history_before = rejected_g.status_history.count()
    res = client_admin.post(f'/api/admin/requests/{req_id}/forward/', {
        'department_id': dept.id,
        'admin_remark': 'Reviewed appeal. Neutral review agrees this merits department investigation.',
    })
    assert res.status_code == status.HTTP_200_OK
    
    # Check grievance status updated to SUBMITTED (re-enters workflow;
    # same as the spam-appeal forward path)
    rejected_g.refresh_from_db()
    assert rejected_g.current_status == Grievance.Status.SUBMITTED
    assert rejected_g.is_reopened is True
    print("  PASS Campus Admin forwarded appeal to department; grievance status set to SUBMITTED")

    # Forward must log exactly ONE history entry (APPEAL_PENDING -> SUBMITTED)
    assert rejected_g.status_history.count() == history_before + 1, \
        f"Expected exactly 1 new history entry on forward, got {rejected_g.status_history.count() - history_before}"
    print("  PASS Forward logged exactly one status history entry (no duplicates)")

    # 4. Test Spam Appeal Workflow
    spam_g = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Spam Grievance Test', description='Legitimate issue falsely flagged as spam',
        current_status=Grievance.Status.SPAM
    )

    res = client_student.post(f'/api/grievances/{spam_g.id}/request/', {
        'request_type': 'SPAM_APPEAL',
        'reason': 'This is a genuine academic query regarding course registration.',
    })
    assert res.status_code == status.HTTP_201_CREATED
    spam_req_id = res.data['id']
    print("  PASS Student submitted Spam Appeal request")

    # Grievance moves to APPEAL_PENDING while the appeal awaits admin review
    spam_g.refresh_from_db()
    assert spam_g.current_status == Grievance.Status.APPEAL_PENDING, \
        f"Expected APPEAL_PENDING, got {spam_g.current_status}"
    print("  PASS Grievance status changed to APPEAL_PENDING on spam appeal submission")

    # Admin Forwarding Spam Appeal
    res = client_admin.post(f'/api/admin/requests/{spam_req_id}/forward/', {
        'department_id': dept.id,
        'admin_remark': 'Spam classification reversed. Forwarding to department.',
    })
    assert res.status_code == status.HTTP_200_OK
    spam_g.refresh_from_db()
    assert spam_g.current_status == Grievance.Status.SUBMITTED
    print("  PASS Admin approved Spam Appeal; grievance restored from SPAM to SUBMITTED and assigned to department")

    # 5. Test Action-Oriented Admin Dashboard Endpoint
    res = client_admin.get('/api/dashboard/admin/')
    assert res.status_code == status.HTTP_200_OK
    counts = res.data['counts']
    assert 'pending_requests' in counts
    assert 'pending_requests_breakdown' in counts
    assert 'spam_review' in counts
    assert 'closed_resolved' in counts
    print("  PASS Campus Admin action-oriented dashboard metrics verified")

    # 6. Test Rejecting a Request Restores the Grievance Status
    rejected_g2 = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Rejected Again Test', description='Another rejection to appeal',
        current_status=Grievance.Status.REJECTED
    )
    res = client_student.post(f'/api/grievances/{rejected_g2.id}/request/', {
        'request_type': 'REJECTION_APPEAL',
        'reason': 'Evidence was submitted, please review.',
    })
    assert res.status_code == status.HTTP_201_CREATED
    reject_req_id = res.data['id']
    rejected_g2.refresh_from_db()
    assert rejected_g2.current_status == Grievance.Status.APPEAL_PENDING

    history_before = rejected_g2.status_history.count()
    res = client_admin.post(f'/api/admin/requests/{reject_req_id}/reject/', {
        'admin_remark': 'Appeal lacks new evidence.',
    })
    assert res.status_code == status.HTTP_200_OK

    rejected_g2.refresh_from_db()
    assert rejected_g2.current_status == Grievance.Status.REJECTED, \
        f"Expected restore to REJECTED, got {rejected_g2.current_status}"
    assert rejected_g2.status_history.count() == history_before + 1, \
        "Restore must log exactly one history entry"
    print("  PASS Rejected appeal restores grievance to REJECTED status with single history entry")

    print("\n  ALL PHASE 8 UNIFIED REQUEST TESTS PASSED SUCCESSFULLY!\n")

def test_escalation_request_original_submitter():
    setup_db()
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('escstudent', role='STUDENT', department=dept)
    admin = _create_user('escadmin', role='CAMPUS_ADMIN')
    client_admin = _auth_client(admin)

    # System auto-escalation creates the Request with student=None,
    # but the serializer must still report the original submitter
    grievance = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Escalation Display Test', description='Grievance that was auto-escalated',
        current_status=Grievance.Status.ESCALATED,
        escalation_level=1,
    )
    esc_req = Request.objects.create(
        grievance=grievance,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated after 72 hours of inactivity without resolution.',
        status=Request.RequestStatus.PENDING,
    )

    res = client_admin.get('/api/admin/requests/')
    assert res.status_code == status.HTTP_200_OK, f"Expected 200, got {res.status_code}"
    item = next(r for r in res.data if r['id'] == esc_req.id)
    expected_name = student.get_full_name() or student.username
    assert item['student_name'] == expected_name, \
        f"Expected submitter '{expected_name}', got '{item['student_name']}'"
    assert item['grievance_created_at'] is not None, "grievance_created_at must be present"
    assert parse_datetime(item['grievance_created_at']) == grievance.created_at, \
        "grievance_created_at must equal the original grievance submission date"
    print("  PASS Escalation request shows original submitter and original grievance date")

    # Anonymous grievance must never reveal the submitter's identity
    anon = _create_user('anonesc', role='STUDENT', department=dept)
    anon_grievance = Grievance.objects.create(
        user=anon, department=dept, category=cat,
        title='Anonymous Escalation Test', description='Anonymous auto-escalated grievance',
        current_status=Grievance.Status.ESCALATED,
        escalation_level=1, is_anonymous=True,
    )
    Request.objects.create(
        grievance=anon_grievance,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated after 72 hours of inactivity without resolution.',
        status=Request.RequestStatus.PENDING,
    )
    res = client_admin.get('/api/admin/requests/')
    anon_item = next(r for r in res.data if r['grievance'] == anon_grievance.id)
    assert anon_item['student_name'] == 'Anonymous', \
        f"Anonymous submitter must not be revealed, got '{anon_item['student_name']}'"
    print("  PASS Anonymous escalation request hides submitter identity")

def test_escalation_rejection_restores_status():
    setup_db()
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('escrejstudent', role='STUDENT', department=dept)
    admin = _create_user('escrejadmin', role='CAMPUS_ADMIN')
    client_admin = _auth_client(admin)

    # Grievance under review gets auto-escalated; pre-escalation status recorded
    grievance = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Escalation Rejection Test', description='Auto-escalated then rejected',
        current_status=Grievance.Status.UNDER_REVIEW,
    )
    grievance.escalation_level = 1
    grievance.current_status = Grievance.Status.ESCALATED
    grievance.save(update_fields=['escalation_level', 'current_status', 'updated_at'])
    esc_req = Request.objects.create(
        grievance=grievance,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated after 72 hours of inactivity without resolution.',
        status=Request.RequestStatus.PENDING,
        original_status=Grievance.Status.UNDER_REVIEW,
    )

    history_before = grievance.status_history.count()
    res = client_admin.post(f'/api/admin/requests/{esc_req.id}/reject/', {
        'admin_remark': 'Insufficient evidence.',
    }, format='json')
    assert res.status_code == status.HTTP_200_OK, f"Expected 200, got {res.status_code}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.REJECTED, \
        f"Expected REJECTED after escalation rejection, got {grievance.current_status}"
    assert grievance.escalation_level == 0, \
        f"Escalation level must reset to 0, got {grievance.escalation_level}"
    assert grievance.escalated_to is None, "escalated_to must be cleared"

    # Status history must log a real transition, not ESCALATED -> ESCALATED
    entry = grievance.status_history.order_by('-id').first()
    assert entry.previous_status == Grievance.Status.ESCALATED, \
        f"Expected previous ESCALATED, got {entry.previous_status}"
    assert entry.new_status == Grievance.Status.REJECTED, \
        f"Expected new REJECTED, got {entry.new_status}"
    assert entry.action_by == admin, "Rejection must be attributed to the Campus Admin"
    assert grievance.status_history.count() == history_before + 1, \
        "Exactly one history entry must be logged on rejection"
    print("  PASS Escalation rejection moves grievance to REJECTED with real transition in history")

    # Legacy escalation records (no original_status) also end up REJECTED
    legacy = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Legacy Escalation Rejection Test', description='Old record without original_status',
        current_status=Grievance.Status.ESCALATED,
        escalation_level=1,
    )
    legacy_req = Request.objects.create(
        grievance=legacy,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated without recorded pre-status.',
        status=Request.RequestStatus.PENDING,
    )
    res = client_admin.post(f'/api/admin/requests/{legacy_req.id}/reject/', {
        'admin_remark': 'Rejected.',
    }, format='json')
    assert res.status_code == status.HTTP_200_OK, f"Expected 200, got {res.status_code}"
    legacy.refresh_from_db()
    assert legacy.current_status == Grievance.Status.REJECTED, \
        f"Legacy escalation rejection must mark grievance REJECTED, got {legacy.current_status}"
    assert legacy.escalation_level == 0
    print("  PASS Legacy escalation rejection marks grievance REJECTED")

def test_no_re_escalation_after_rejection():
    setup_db()
    from grievances.services.escalation_service import find_stale_grievances

    dept = _create_dept()
    cat = _create_category()
    student = _create_user('norescal', role='STUDENT', department=dept)
    admin = _create_user('norescaladmin', role='CAMPUS_ADMIN')

    from datetime import timedelta
    from django.utils import timezone as tz

    # Grievance is stale and eligible, but its last escalation was rejected
    # by the admin AFTER the grievance was last updated -> must not be found
    g = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='No Re-escalation Test', description='Rejected escalation should not re-escalate',
        current_status=Grievance.Status.UNDER_REVIEW,
        updated_at=tz.now() - timedelta(days=30),
    )
    Request.objects.create(
        grievance=g,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated.',
        status=Request.RequestStatus.REJECTED,
        original_status=Grievance.Status.UNDER_REVIEW,
        resolved_at=tz.now() - timedelta(days=10),
    )
    stale_ids = [x.id for x in find_stale_grievances()]
    assert g.id not in stale_ids, \
        "Grievance with a recently rejected escalation must not be re-escalated"
    print("  PASS Rejected escalation blocks re-escalation until new activity")

    # New activity after the rejection re-enables escalation
    # (QuerySet.update bypasses auto_now so a mid-window timestamp works)
    Grievance.objects.filter(pk=g.pk).update(updated_at=tz.now() - timedelta(days=8))
    stale_ids = [x.id for x in find_stale_grievances()]
    assert g.id in stale_ids, \
        "Grievance with activity after the rejection must be eligible again"
    print("  PASS New activity after rejection re-enables escalation")

def test_escalation_admin_resolve_request():
    setup_db()
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('resolvestudent', role='STUDENT', department=dept)
    admin = _create_user('resolveadmin', role='CAMPUS_ADMIN')
    client_admin = _auth_client(admin)

    grievance = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Escalation Resolve Test', description='Auto-escalated then resolved by admin',
        current_status=Grievance.Status.ESCALATED,
        escalation_level=1,
    )
    esc_req = Request.objects.create(
        grievance=grievance,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated after 72 hours of inactivity without resolution.',
        status=Request.RequestStatus.PENDING,
        original_status=Grievance.Status.UNDER_REVIEW,
    )

    res = client_admin.post(f'/api/admin/requests/{esc_req.id}/resolve/', {
        'admin_remark': 'Fixed by replacing the projector.',
        'content': 'The projector has been replaced and tested.',
    }, format='json')
    assert res.status_code == status.HTTP_200_OK, f"Expected 200, got {res.status_code}"

    esc_req.refresh_from_db()
    assert esc_req.status == Request.RequestStatus.RESOLVED, \
        f"Request must be RESOLVED, got {esc_req.status}"
    assert esc_req.reviewed_by_admin == admin

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.CLOSED, \
        f"Expected CLOSED (auto-close after resolve), got {grievance.current_status}"
    assert grievance.escalation_level == 0, "Escalation level must reset to 0"
    assert grievance.escalated_to is None, "escalated_to must be cleared"

    assert grievance.responses.count() == 1, "Resolve must create a Response record"
    assert grievance.responses.first().content == 'The projector has been replaced and tested.'
    print("  PASS Admin resolve escalation marks request RESOLVED and grievance CLOSED")

def test_escalation_admin_close_request():
    setup_db()
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('closestudent', role='STUDENT', department=dept)
    admin = _create_user('closeadmin', role='CAMPUS_ADMIN')
    client_admin = _auth_client(admin)

    grievance = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Escalation Close Test', description='Auto-escalated then closed by admin',
        current_status=Grievance.Status.ESCALATED,
        escalation_level=1,
    )
    esc_req = Request.objects.create(
        grievance=grievance,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated after 72 hours of inactivity without resolution.',
        status=Request.RequestStatus.PENDING,
        original_status=Grievance.Status.UNDER_REVIEW,
    )

    res = client_admin.post(f'/api/admin/requests/{esc_req.id}/close/', {
        'admin_remark': 'Closed: department merged, grievance archived.',
    }, format='json')
    assert res.status_code == status.HTTP_200_OK, f"Expected 200, got {res.status_code}"

    esc_req.refresh_from_db()
    assert esc_req.status == Request.RequestStatus.CLOSED, \
        f"Request must be CLOSED, got {esc_req.status}"

    grievance.refresh_from_db()
    assert grievance.current_status == Grievance.Status.CLOSED, \
        f"Expected CLOSED, got {grievance.current_status}"
    assert grievance.escalation_level == 0, "Escalation level must reset to 0"
    assert grievance.escalated_to is None, "escalated_to must be cleared"
    assert grievance.responses.count() == 0, "Close must not create a Response record"
    print("  PASS Admin close escalation marks request and grievance CLOSED")

def test_escalation_resolve_close_guards():
    setup_db()
    dept = _create_dept()
    cat = _create_category()
    student = _create_user('guardstudent', role='STUDENT', department=dept)
    admin = _create_user('guardadmin', role='CAMPUS_ADMIN')
    client_admin = _auth_client(admin)

    # Non-escalation requests cannot be resolved/closed
    reopened_g = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Guard Reopen Test', description='Reopen request must not be resolvable',
        current_status=Grievance.Status.RESPONDED,
    )
    reopen_req = Request.objects.create(
        grievance=reopened_g,
        student=student,
        request_type=Request.RequestType.REOPEN,
        reason='Student wants to reopen.',
        status=Request.RequestStatus.PENDING,
    )
    res = client_admin.post(f'/api/admin/requests/{reopen_req.id}/resolve/', {}, format='json')
    assert res.status_code == status.HTTP_400_BAD_REQUEST, \
        f"Non-escalation resolve must be blocked, got {res.status_code}"
    res = client_admin.post(f'/api/admin/requests/{reopen_req.id}/close/', {}, format='json')
    assert res.status_code == status.HTTP_400_BAD_REQUEST, \
        f"Non-escalation close must be blocked, got {res.status_code}"
    print("  PASS Non-escalation requests cannot be resolved or closed")

    # Already-processed requests cannot be resolved/closed again
    esc_g = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Guard Escalation Test', description='Already processed escalation',
        current_status=Grievance.Status.ESCALATED,
        escalation_level=1,
    )
    esc_req = Request.objects.create(
        grievance=esc_g,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated.',
        status=Request.RequestStatus.FORWARDED,
    )
    res = client_admin.post(f'/api/admin/requests/{esc_req.id}/resolve/', {}, format='json')
    assert res.status_code == status.HTTP_400_BAD_REQUEST, \
        f"Processed request resolve must be blocked, got {res.status_code}"
    res = client_admin.post(f'/api/admin/requests/{esc_req.id}/close/', {}, format='json')
    assert res.status_code == status.HTTP_400_BAD_REQUEST, \
        f"Processed request close must be blocked, got {res.status_code}"

    # Non-admin cannot resolve/close
    student_client = _auth_client(student)
    esc_g2 = Grievance.objects.create(
        user=student, department=dept, category=cat,
        title='Guard Permissions Test', description='Escalation for permission check',
        current_status=Grievance.Status.ESCALATED,
        escalation_level=1,
    )
    esc_req2 = Request.objects.create(
        grievance=esc_g2,
        student=None,
        request_type=Request.RequestType.ESCALATION,
        reason='System auto-escalated.',
        status=Request.RequestStatus.PENDING,
    )
    res = student_client.post(f'/api/admin/requests/{esc_req2.id}/resolve/', {}, format='json')
    assert res.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED), \
        f"Non-admin resolve must be forbidden, got {res.status_code}"
    res = student_client.post(f'/api/admin/requests/{esc_req2.id}/close/', {}, format='json')
    assert res.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_401_UNAUTHORIZED), \
        f"Non-admin close must be forbidden, got {res.status_code}"
    print("  PASS Resolve/close guards enforce status and permission rules")

if __name__ == '__main__':
    test_unified_request_workflow()
    test_escalation_request_original_submitter()
    test_escalation_rejection_restores_status()
    test_no_re_escalation_after_rejection()
    test_escalation_admin_resolve_request()
    test_escalation_admin_close_request()
    test_escalation_resolve_close_guards()
