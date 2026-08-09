from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Department

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Minimal serialiser used for reading user data (no password exposed)."""
    department_name = serializers.CharField(
        source='department.name', read_only=True, allow_null=True
    )
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'role', 'department', 'department_name', 'contact_number',
        ]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=True)
    first_name = serializers.CharField(required=True)
    last_name = serializers.CharField(required=True)
    role = serializers.ChoiceField(
        choices=[(User.Role.STUDENT, 'Student'), (User.Role.STAFF, 'Staff')],
        required=True,
    )
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(), required=True,
    )
    contact_number = serializers.CharField(required=True)

    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'password2',
            'first_name', 'last_name', 'role', 'department', 'contact_number',
        ]

    def validate_contact_number(self, value):
        """Contact number must be exactly 10 digits."""
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('Contact number is required.')
        if not value.isdigit():
            raise serializers.ValidationError('Contact number must contain only digits (0-9).')
        if len(value) != 10:
            raise serializers.ValidationError('Contact number must be exactly 10 digits.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    # Intentionally no email-existence check — same response is returned
    # regardless so that the endpoint does not leak whether an account exists.


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)
    password2 = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs
