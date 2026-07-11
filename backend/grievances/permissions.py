from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsStudent(BasePermission):
    """Allow only Student role."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'STUDENT'


class IsStaff(BasePermission):
    """Allow only Staff role."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'STAFF'


class IsHOD(BasePermission):
    """Allow only HOD (Head of Department) role."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'HOD'


class IsCampusAdmin(BasePermission):
    """Allow only Campus Admin role."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'CAMPUS_ADMIN'


class IsHODOrAdmin(BasePermission):
    """Allow HOD or Campus Admin."""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role in ('HOD', 'CAMPUS_ADMIN')
        )


class IsSubmitter(BasePermission):
    """
    Object-level permission — only the user who created the grievance.
    Must be used with a view that has a `get_object()` returning a Grievance.
    """
    def has_object_permission(self, request, view, obj):
        return obj.user == request.user


class IsAssignedDepartment(BasePermission):
    """
    Object-level permission — only HOD/Staff whose department matches
    the grievance's assigned department.
    """
    def has_object_permission(self, request, view, obj):
        return (
            request.user.department is not None
            and obj.department == request.user.department
        )


class ReadOnly(BasePermission):
    """Allow read-only access for unauthenticated users (e.g. tracking)."""
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS
