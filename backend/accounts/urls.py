from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

urlpatterns = [
    # JWT endpoints (simplejwt built-in)
    path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Custom auth views
    path('register/', views.RegisterView.as_view(), name='register'),
    path('me/', views.UserProfileView.as_view(), name='user_profile'),

    # Password reset (placeholder — no real email backend yet)
    path('password-reset/', views.password_reset_request, name='password_reset'),
    path('password-reset/confirm/', views.password_reset_confirm, name='password_reset_confirm'),
]
