"""
URL configuration for the grievances app.

All grievance-related endpoints are served under the /api/ prefix,
wired in the project-level config/urls.py.
"""

from django.urls import path

from . import views

urlpatterns = [
    # Reference data (public — no auth required)
    path('categories/', views.CategoryListView.as_view(), name='category_list'),
    path('departments/', views.DepartmentListView.as_view(), name='department_list'),

    # Anonymous grievance tracking (public — no auth required)
    path('grievances/track/', views.grievance_track, name='grievance_track'),

    # Grievance CRUD (authenticated)
    path('grievances/', views.GrievanceListCreateView.as_view(), name='grievance_list_create'),
    path('grievances/<int:pk>/', views.GrievanceDetailView.as_view(), name='grievance_detail'),


    # ------------------------------------------------------------------
    # Phase 6 — Response & Escalation Workflow
    # ------------------------------------------------------------------
    path(
        'grievances/<int:pk>/respond/',
        views.respond_to_grievance,
        name='respond_to_grievance',
    ),
    path(
        'grievances/<int:pk>/resolve/',
        views.resolve_grievance,
        name='resolve_grievance',
    ),
    path(
        'grievances/<int:pk>/reopen/',
        views.reopen_grievance,
        name='reopen_grievance',
    ),
    path(
        'grievances/<int:pk>/close/',
        views.close_grievance,
        name='close_grievance',
    ),
    path(
        'grievances/<int:pk>/hod-escalate/',
        views.hod_escalate_grievance,
        name='hod_escalate_grievance',
    ),
    path(
        'admin/escalated/<int:pk>/resolve/',
        views.admin_resolve_escalated,
        name='admin_resolve_escalated',
    ),

    # ------------------------------------------------------------------
    # Phase 7 — Dashboards & Search
    # ------------------------------------------------------------------
    path(
        'dashboard/student/',
        views.StudentDashboardView.as_view(),
        name='dashboard_student',
    ),
    path(
        'dashboard/department/',
        views.DepartmentDashboardView.as_view(),
        name='dashboard_department',
    ),
    path(
        'dashboard/admin/',
        views.AdminDashboardView.as_view(),
        name='dashboard_admin',
    ),

    # ------------------------------------------------------------------
    # Phase 8 — Unified Request & Admin Review Workflow
    # ------------------------------------------------------------------
    path(
        'grievances/<int:pk>/request/',
        views.create_grievance_request,
        name='create_grievance_request',
    ),
    path(
        'admin/requests/',
        views.AdminRequestListView.as_view(),
        name='admin_request_list',
    ),
    path(
        'admin/requests/<int:pk>/',
        views.AdminRequestDetailView.as_view(),
        name='admin_request_detail',
    ),
    path(
        'admin/requests/<int:pk>/forward/',
        views.admin_forward_request,
        name='admin_forward_request',
    ),
    path(
        'admin/requests/<int:pk>/reject/',
        views.admin_reject_request,
        name='admin_reject_request',
    ),
    path(
        'admin/requests/<int:pk>/resolve/',
        views.admin_resolve_request,
        name='admin_resolve_request',
    ),
]
