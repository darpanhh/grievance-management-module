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
    # Phase 4 — AI Spam Filtering (like Gmail's spam tab)
    # ------------------------------------------------------------------
    path('spam/', views.SpamQueueView.as_view(), name='spam_queue'),
    path(
        'grievances/<int:pk>/reinstate-spam/',
        views.reinstate_spam,
        name='reinstate_spam',
    ),
    path(
        'grievances/<int:pk>/appeal-spam/',
        views.appeal_spam,
        name='appeal_spam',
    ),

    # ------------------------------------------------------------------
    # Manual Review — Move SUBMITTED → UNDER_REVIEW
    # ------------------------------------------------------------------
    path(
        'grievances/<int:pk>/review/',
        views.start_review,
        name='start_review',
    ),

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
    # ------------------------------------------------------------------
    # Phase 7 — Dashboards, Search & Export
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
    path(
        'reports/export/',
        views.export_grievances,
        name='export_grievances',
    ),

    # Status History — Audit Trail
    path('status-history/', views.StatusHistoryListView.as_view(), name='status_history'),
]
