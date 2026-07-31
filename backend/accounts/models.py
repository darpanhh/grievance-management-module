from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    """Custom manager that maps Django superusers to the SYSTEM_ADMIN role.

    Django's built-in ``createsuperuser`` only sets ``is_staff`` /
    ``is_superuser`` and knows nothing about the custom ``role`` field, so
    without this override a superuser would silently default to STUDENT.
    """

    use_in_migrations = True

    def create_user(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(username, email, password, **extra_fields)

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'SYSTEM_ADMIN')

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self._create_user(username, email, password, **extra_fields)

    def _create_user(self, username, email, password, **extra_fields):
        if not username:
            raise ValueError('The given username must be set')
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user


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
        SYSTEM_ADMIN = 'SYSTEM_ADMIN', 'System Admin'

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
        max_length=15,
        blank=True,
        default='',
    )

    objects = UserManager()

    class Meta:
        ordering = ['username']

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_role_display()})"
