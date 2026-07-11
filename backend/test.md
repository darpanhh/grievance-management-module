# Testing Guide — Django REST Framework Browsable API

Start the server:
```
backend\.venv\Scripts\python backend\manage.py runserver
```

## Open in browser

| Endpoint | URL | What you see |
|----------|-----|-------------|
| Register | http://localhost:8000/api/auth/register/ | Form with fields — fill & click POST |
| Login | http://localhost:8000/api/auth/login/ | Username + password form |
| Me | http://localhost:8000/api/auth/me/ | Your profile (needs Bearer token) |
| Admin | http://localhost:8000/admin/ | Django admin (login with superuser) |


For authenticated endpoints like `/api/auth/me/`, you need to pass the Bearer token. In the DRF browsable UI, scroll to the bottom and you'll see a "Raw data" / "Form" toggle. You can also install a browser extension like **ModHeader** to set the `Authorization: Bearer <token>` header.

The Django Admin at `/admin/` is the easiest way to see/manage data visually — you can browse users, departments, grievances, etc. .
