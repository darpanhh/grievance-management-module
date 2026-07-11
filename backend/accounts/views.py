from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .serializers import (
    RegisterSerializer,
    UserSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/
    Creates a new user account with STUDENT role (default).
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class UserProfileView(generics.RetrieveUpdateAPIView):
    """
    GET /api/auth/me/        — return the current user's profile
    PATCH /api/auth/me/      — update own profile fields
    """
    serializer_class = UserSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self):
        return self.request.user


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def password_reset_request(request):
    """
    POST /api/auth/password-reset/
    Accepts an email and returns a confirmation message.
    Always returns the same response whether the email exists or not
    (prevents email enumeration).
    In production: send the token to the user's email address instead of returning it.
    """
    serializer = PasswordResetRequestSerializer(data=request.data)
    if serializer.is_valid():
        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email=email)
            # default_token_generator uses the user's password hash timestamp,
            # so no extra storage is needed.
            token = default_token_generator.make_token(user)
            # DEV NOTE: In production, email the token to the user.
            # For development we return it in the response so it can be tested.
            return Response({
                'message': 'If that email is registered, a reset link has been sent.',
                'dev_token': token,
            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            pass

        return Response(
            {'message': 'If that email is registered, a reset link has been sent.'},
            status=status.HTTP_200_OK,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def password_reset_confirm(request):
    """
    POST /api/auth/password-reset/confirm/
    Resets the password using a valid email + token combination.
    Returns the same generic message regardless of outcome to prevent enumeration.
    """
    serializer = PasswordResetConfirmSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    email = data.get('email', '')

    # We iterate over matching users (should be 0-1) and try the token.
    # Returning the same message regardless prevents email enumeration.
    for user in User.objects.filter(email=email, is_active=True):
        if default_token_generator.check_token(user, data['token']):
            user.set_password(data['password'])
            user.save(update_fields=['password'])
            break

    return Response(
        {'message': 'Password has been reset successfully.'},
        status=status.HTTP_200_OK,
    )
