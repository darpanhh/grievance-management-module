from django.contrib.auth.models import AbstractUser
from django.db import models


class Department(models.Model):
    """
    Represents an academic or administrative department within the college.
    SRS Reference: Section 7.1
    """

    class DepartmentType(models.TextChoices):
        ACADEMIC = 'ACADEMIC', 'Academic'
        ADMINISTRATIVE = 'ADMINISTRATIVE', 'Administrative'

    name = models.CharField(max_length=100, unique=True)
    department_type = models.CharField(
        max_length=15,
        choices=DepartmentType.choices,
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_department_type_display()})"


class User(AbstractUser):
    """
    Custom user model extending Django's AbstractUser.
    A single User entity with a role attribute distinguishes Student, Staff,
    HOD, and Campus Admin — all roles share common attributes.
    SRS Reference: Section 7.1, FR-03
    """

    class Role(models.TextChoices):
        STUDENT = 'STUDENT', 'Student'
        STAFF = 'STAFF', 'Staff'
        HOD = 'HOD', 'Head of Department'
        CAMPUS_ADMIN = 'CAMPUS_ADMIN', 'Campus Admin'

    role = models.CharField(
        max_length=15,
        choices=Role.choices,
        default=Role.STUDENT,
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        help_text='Null for Campus Admin who has system-wide access.',
    )
    contact_number = models.CharField(
        max_length=10,
        blank=True,
        default='',
        help_text='Exactly 10 digits (e.g. 98XXXXXXXX).',
    )

    class Meta:
        ordering = ['username']

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
