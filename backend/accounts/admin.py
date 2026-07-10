from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Department, User


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'department_type')
    list_filter = ('department_type',)
    search_fields = ('name',)


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'role', 'department', 'is_active')
    list_filter = ('role', 'department', 'is_active')
    search_fields = ('username', 'email', 'first_name', 'last_name')

    # Add role and department to the existing fieldsets
    fieldsets = BaseUserAdmin.fieldsets + (
        ('GMS Profile', {
            'fields': ('role', 'department', 'contact_number'),
        }),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('GMS Profile', {
            'fields': ('role', 'department', 'contact_number'),
        }),
    )
