---
name: gms-backend-coder
description: >
  Grievance Management System (GMS) — Django REST Framework backend.
  Use this skill whenever you're asked to implement or modify backend code in this project:
  models, serializers, views, URLs, permissions, services, management commands,
  settings, or any Python/Django file under backend/. The skill knows the full
  implementation plan (10 phases), the project conventions, the existing model
  definitions, the RBAC system, status transition rules, and the complete
  API endpoint reference. Always consult this skill when the task touches
  backend/, grievances/, accounts/, or config/ directories.
---

# GMS Backend Coder

You are implementing backend code for the **Grievance Management System** — a Django REST Framework API for a college-level grievance portal. This skill gives you the project's full context so every file you create or modify follows the established conventions.

---

## Project Layout

```
backend/
├── config/               # Django project settings
│   ├── settings.py       # DRF, JWT, CORS, DB, throttling
│   ├── urls.py           # Root URL dispatcher
│   ├── views.py          # Health check endpoint
│   ├── wsgi.py
│   └── asgi.py
├── accounts/             # Custom User model + auth
│   ├── models.py         # User (AbstractUser), Department
│   ├── views.py          # Register, Profile, PasswordReset
│   ├── serializers.py    # UserSerializer, RegisterSerializer, PasswordReset*
│   ├── urls.py           # All /api/auth/* routes
│   ├── permissions.py    # RBAC permission classes
│   ├── admin.py
│   ├── apps.py
│   └── tests.py
├── grievances/           # Core grievance management app
│   ├── models.py         # Grievance, Category, AIAnalysis, Response, StatusHistory, Attachment
│   ├── admin.py          # Admin registrations with inlines
│   ├── views.py          # Currently empty — implement views here
│   ├── serializers.py    # Create grievance serializers here
│   ├── permissions.py    # Create grievance-specific permissions here
│   ├── urls.py           # Create app URLs here
│   ├── tests.py
│   ├── services/         # Business logic layer
│   │   ├── spam_detector.py   # AI spam detection (Strategy pattern)
│   │   └── routing.py         # Automatic department routing
│   └── management/
│       └── commands/
│           └── escalate.py    # Auto-escalation cron job
├── manage.py
├── requirements.txt
└── .env
```

---

## Conventions & Style

### 1. Code Style
- **Docstrings:** Every class and method gets a docstring. Reference the SRS section when applicable (e.g. `SRS Reference: §3.3 (FR-07–FR-13)`).
- **Import order:** 1) Django/stdlib, 2) DRF/third-party, 3) local apps (accounts, grievances).
- **Type hints:** Use on service-layer functions, optional on views.
- **Formatting:** PEP 8 convention.

### 2. Views
- Prefer **generic class-based views** from DRF (`generics.CreateAPIView`, `generics.ListAPIView`, `generics.RetrieveAPIView`, etc.).
- Use `@api_view(['POST'])` decorator only for simple endpoints (password reset, track, etc.).
- Always set `permission_classes` explicitly. Default DRF setting is `AllowAny`.
- Use `serializer.is_valid(raise_exception=True)` pattern.
- Return explicit `status.HTTP_*` codes.

### 3. Serializers
- ModelSerializer for model-backed endpoints.
- Use `write_only=True` for passwords, `read_only=True` for auto-set fields.
- Use `source='relation.field'` for nested read-only fields (e.g. `department_name = CharField(source='department.name', read_only=True)`).
- Password fields: validate both match in `validate()` and call `user.set_password()` in `create()`.
- Never expose `user` field when `grievance.is_anonymous=True`.

### 4. URLs
- Named routes with `name=` for reverse lookups.
- App URLs are included under `/api/` in `config/urls.py`.
- Accounts routes are already wired at `api/auth/`. Add `api/grievances/` and `api/admin/` and `api/dashboard/`.

### 5. Permissions
- **File location:** `accounts/permissions.py` for role checks, or `grievances/permissions.py` for object-level checks.
- Define a class per role (e.g. `IsHOD`, `IsCampusAdmin`, `IsStudent`).
- Object-level permissions check `request.user == obj.user` or `request.user.department == obj.department`.
- The role hierarchy is: `Student` < `Staff` < `HOD` < `CampusAdmin`.

### 6. Status Transitions
The grievance state machine is **strictly enforced**. This table governs all transitions:

| From         | Allowed To                         | Who triggers         |
|-------------|-----------------------------------|----------------------|
| Submitted   | Under_Review, Spam                | System (routing), AI |
| Spam        | Submitted, Closed                 | Campus Admin         |
| Under_Review| Responded, Escalated              | HOD, System (cron)   |
| Responded   | Resolved, Reopened, Escalated     | Submitter, System    |
| Reopened    | Responded, Escalated              | HOD, System (cron)   |
| Escalated   | Resolved                          | Campus Admin         |
| Resolved    | Closed                            | System (or auto)     |
| Closed      | *(terminal — no transitions)*     | —                    |

### 7. StatusHistory Auto-Logging
Every status transition MUST create a `StatusHistory` entry. Use a **Django signal** (`@receiver(pre_save, sender=Grievance)`) to:
1. Compare `current_status` before and after save
2. If changed, create `StatusHistory(grievance=instance, previous_status=old, new_status=instance.current_status, action_by=user, remarks=...)`
3. Pass the triggering user through a thread-local or request attribute, or via a `_action_by` instance attribute set before save.

### 8. Error Responses
Use consistent error format:
```json
{"error": "Human-readable message", "detail": {"field": ["Specific error"]}}
```
Throttle violations (429):
```json
{"error": "You have reached the daily limit of 3 submissions. Please try again after midnight."}
```

---

## Key Implementation Details

### Submitting a Grievance (Phase 3)
Processing pipeline:
```
Authenticate → Rate limit check (3/day/user) → Validate input
  → Create Grievance(status=SUBMITTED, user=request.user)
  → If anonymous: generate 8-char alphanumeric secret_code, hash before storing
  → Handle attachments (max 3, 5MB each, validate file types)
  → Create StatusHistory(SUBMITTED)
  → Return grievance_id (+ secret_code if anonymous)
  → Phase 4 integration: run spam detection after submission
```

### Rate Limiting
- Custom DRF throttle `DailyGrievanceThrottle` (not built-in rate strings).
- Count `Grievance.objects.filter(user=request.user, created_at__date=today)`.
- Returns 429 with the error message above.

### Anonymous Submissions
- `user_id` is stored internally (audit trail) but **never exposed** in any API response.
- `secret_code`: random 8 chars (uppercase letters + digits), hashed with Django's `make_password()` before storage.
- The plaintext secret_code is returned **only once** at creation.
- Anonymous tracking endpoint: `POST /api/grievances/track/` accepts `grievance_id` + `secret_code`, no auth required.

### File Attachments
- Accepted types: PDF, DOC, DOCX, PNG, JPG, JPEG, XLS, XLSX.
- Max 3 files, max 5MB each.
- Stored at `MEDIA_ROOT/grievances/{grievance_id}/`.
- Use DRF's `MultiPartParser` / `FormParser` for the submission view.

### Spam Detection (Phase 4)
Strategy pattern with interface:
```python
class SpamDetectorInterface:
    def analyze(self, text: str) -> dict:
        """Return {spam_prediction: bool, confidence_score: float, reason: str}"""
```

`KeywordSpamDetector` uses keyword heuristics (common spam triggers, length checks, etc.).
Integration: called **synchronously** after grievance creation, before response.

### Routing (Phase 5)
- Department is selected by submitter at creation time (or defaults to their own department).
- Category is classification-only — **never** used for routing.
- After routing: `current_status` → `UNDER_REVIEW`.

### Auto-Escalation (Phase 6)
Management command `escalate.py`:
- Finds grievances with `current_status IN ('UNDER_REVIEW', 'RESPONDED', 'REOPENED')` and `updated_at < now - 7 days`.
- Sets status to `ESCALATED`, logs StatusHistory.
- Scheduled to run daily at 2 AM via system cron.

### Dashboard Endpoints (Phase 7)
- **Student** (`/api/dashboard/student/`): return user's own grievances with extra computed field `days_since_update`.
- **Department** (`/api/dashboard/department/`): all grievances for the HOD/Staff's department, with `days_open` and escalation status.
- **Admin** (`/api/dashboard/admin/`): system-wide counts by status, escalated queue summary, spam queue count, recent activity.

### Search & Filter
Applied to all list/dashboard endpoints via query parameters:
`search=text&category=1&status=UNDER_REVIEW&date_from=2026-01-01&date_to=2026-12-31&ordering=-created_at`
Use `django-filter` or DRF's `SearchFilter` + `OrderingFilter` backends.

### Export (Phase 7)
- `GET /api/reports/export/?format=csv|pdf`
- Campus Admin only.
- Filterable by date range, department, category, status.
- CSV: standard file response with all grievance fields (excluding anonymous identity).
- PDF: formatted report with summary stats + grievance list (use `reportlab` or `weasyprint`).

---

## API Endpoint Reference

### Auth (accounts app — mostly done)
| Method | Endpoint                     | Auth | Role         | Status |
|--------|------------------------------|------|--------------|--------|
| POST   | `/api/auth/register/`        | No   | —            | ✅ Done |
| POST   | `/api/auth/login/`           | No   | —            | ✅ Done |
| POST   | `/api/auth/token/refresh/`   | No   | —            | ✅ Done |
| GET    | `/api/auth/me/`              | Yes  | Any          | ✅ Done |
| PATCH  | `/api/auth/me/`              | Yes  | Any          | ✅ Done |
| POST   | `/api/auth/password-reset/`  | No   | —            | ✅ Done |
| POST   | `/api/auth/password-reset/confirm/` | No | —          | ✅ Done |

### Grievances
| Method | Endpoint                              | Auth | Role         | Phase |
|--------|---------------------------------------|------|--------------|-------|
| GET    | `/api/grievances/`                    | Yes  | Any (scoped) | 5     |
| POST   | `/api/grievances/`                    | Yes  | Student/Staff| 3     |
| GET    | `/api/grievances/{id}/`               | Yes  | Any (scoped) | 5     |
| POST   | `/api/grievances/track/`              | No   | —            | 3     |
| POST   | `/api/grievances/{id}/respond/`       | Yes  | HOD          | 6     |
| POST   | `/api/grievances/{id}/resolve/`       | Yes  | Submitter    | 6     |
| POST   | `/api/grievances/{id}/reopen/`        | Yes  | Submitter    | 6     |
| POST   | `/api/grievances/{id}/appeal-spam/`   | Yes  | Submitter    | 4     |

### Admin
| Method | Endpoint                                      | Auth | Role         | Phase |
|--------|-----------------------------------------------|------|--------------|-------|
| GET    | `/api/admin/spam-queue/`                      | Yes  | Campus Admin | 4     |
| POST   | `/api/admin/spam-queue/{id}/reinstate/`       | Yes  | Campus Admin | 4     |
| POST   | `/api/admin/escalated/{id}/resolve/`          | Yes  | Campus Admin | 6     |

### Dashboards & Reference
| Method | Endpoint                          | Auth | Role           | Phase |
|--------|-----------------------------------|------|----------------|-------|
| GET    | `/api/dashboard/student/`         | Yes  | Student        | 7     |
| GET    | `/api/dashboard/department/`      | Yes  | HOD, Staff     | 7     |
| GET    | `/api/dashboard/admin/`           | Yes  | Campus Admin   | 7     |
| GET    | `/api/categories/`                | Yes  | Any            | 3     |
| GET    | `/api/departments/`               | Yes  | Any            | 3     |
| GET    | `/api/reports/export/`            | Yes  | Campus Admin   | 7     |
| GET    | `/api/status/`                    | No   | —              | Done  |

---

## Implementation Phases (Backend Only)

| Phase | What to build                                                              |
|-------|----------------------------------------------------------------------------|
| 3     | Grievance submission, rate limiting, file attachments, anonymous tracking  |
| 4     | AI spam detection service (keyword), spam queue, reinstate, appeal        |
| 5     | Automatic routing, department-scoped list/detail views                    |
| 6     | HOD respond, submitter resolve/reopen, escalation cron, admin resolution  |
| 7     | Student/dept/admin dashboards, search/filter, CSV/PDF export              |

---

## External Guidance

When implementing a specific phase or endpoint:
1. Read the relevant section in `implementation-plan.md` for detailed specifications
2. Check `backend/Progress Tracker.md` for what's already completed
3. Look at the `accounts/` app for reference — it's the existing pattern for views, serializers, and URLs
4. For models reference, read `backend/grievances/models.py` for field names, choices, and relationships
