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
]
