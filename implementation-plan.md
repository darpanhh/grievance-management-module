# Grievance Management System — Implementation Plan

> Framework: Django REST API (backend) + React + Vite (frontend)

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Phase 1 — Data Models & Database](#2-phase-1--data-models--database)
3. [Phase 2 — Authentication & RBAC](#3-phase-2--authentication--rbac)
4. [Phase 3 — Grievance Submission & Rate Limiting](#4-phase-3--grievance-submission--rate-limiting)
5. [Phase 4 — AI Spam Filtering](#5-phase-4--ai-spam-filtering)
6. [Phase 5 — Grievance Routing](#6-phase-5--grievance-routing)
7. [Phase 6 — Response & Escalation Workflow](#7-phase-6--response--escalation-workflow)
8. [Phase 7 — Dashboards, Search & Export](#8-phase-7--dashboards-search--export)
9. [Phase 8 — Frontend Implementation](#9-phase-8--frontend-implementation)
10. [Phase 9 — Non-Functional Requirements](#10-phase-9--non-functional-requirements)
11. [Phase 10 — Production Readiness](#11-phase-10--production-readiness)
12. [API Endpoint Reference](#12-api-endpoint-reference)
13. [Appendix — Status Transition Rules](#13-appendix--status-transition-rules)

---

## 1. Project Structure

```
grievance-management-module/
├── backend/                          # Django REST API project
│   ├── config/                       # Django project settings
│   │   ├── __init__.py
│   │   ├── settings.py               # Project settings (DRF, JWT, CORS, logging, email, escalation)
│   │   ├── urls.py                   # Root URL config (api/auth/, api/, admin/)
│   │   ├── views.py                  # Health-check endpoint (/api/status/)
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── accounts/                     # Separate app for User model + auth
│   │   ├── migrations/
│   │   ├── __init__.py
│   │   ├── admin.py                  # DepartmentAdmin + UserAdmin (custom AbstractUser)
│   │   ├── apps.py
│   │   ├── models.py                 # Department + User (custom AbstractUser with role/contact_number)
│   │   ├── serializers.py            # RegisterSerializer, UserSerializer, PasswordReset serializers
│   │   ├── tests.py
│   │   └── views.py                  # RegisterView, UserProfileView, password_reset_request/confirm
│   ├── grievances/                   # Core app — models, views, serializers, services
│   │   ├── management/
│   │   │   └── commands/
│   │   │       ├── escalate.py       # Manual escalation trigger (--dry-run support)
│   │   │       └── seed_data.py      # Seed departments & categories
│   │   ├── migrations/
│   │   ├── notebooks/
│   │   │   └── grievance_spam_detection.ipynb  # ML training notebook
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── models/
│   │   │   │   └── grievance_model.pkl         # Trained scikit-learn pipeline
│   │   │   ├── spam_detector.py      # MLSpamDetector with NLTK preprocessing
│   │   │   ├── routing.py            # Automatic routing logic
│   │   │   ├── escalation_service.py # APScheduler engine + email notifications
│   │   │   └── audit_logger.py       # Structured audit logging
│   │   ├── templates/
│   │   │   └── emails/
│   │   │       ├── submission_notification.html
│   │   │       ├── response_notification.html
│   │   │       ├── resolution_notification.html
│   │   │       └── escalation_notification.html
│   │   ├── __init__.py
│   │   ├── admin.py                  # GrievanceAdmin with inlines (AIAnalysis, Response, etc.)
│   │   ├── apps.py                   # GrievancesConfig — wires signals + APScheduler on start
│   │   ├── models.py                 # Category, Grievance, AIAnalysis, Response, StatusHistory, Attachment
│   │   ├── serializers.py            # DRF serializers (List, Create, Detail, Track, ref data)
│   │   ├── permissions.py            # Custom RBAC permission classes
│   │   ├── views.py                  # All API views (CRUD, workflow, dashboards, export, spam)
│   │   ├── urls.py                   # App-level URL routing
│   │   ├── signals.py                # pre_save signal — auto-logs StatusHistory on status change
│   │   ├── throttles.py              # DailyGrievanceThrottle (3/user/day)
│   │   ├── middleware.py             # RequestLogMiddleware (structured request logging)
│   │   └── utils.py
│   ├── logs/                         # Rotating log files (gitignored)
│   │   ├── gms.log
│   │   ├── gms_errors.log
│   │   ├── gms_audit.log
│   │   └── gms_requests.log
│   ├── media/                        # Uploaded files (gitignored)
│   │   └── grievance_attachments/
│   ├── test/                         # Per-phase integration tests
│   │   ├── 1-data-models--database/test.py
│   │   ├── 2-authentication--rbac/test.py
│   │   ├── 3-grievance-submission--rate-limiting/test.py
│   │   ├── 4-ai-spam-filtering/test.py
│   │   ├── 5-grievance-routing/test.py
│   │   ├── 6-response--escalation-workflow/test.py
│   │   └── 7-dashboards--search--export/test.py
│   ├── manage.py                     # Django management entrypoint
│   ├── requirements.txt              # Python dependencies
│   └── .env                          # Environment variables
│
├── frontend/                         # React + Vite SPA
│   ├── public/
│   │   ├── favicon.svg
│   │   ├── icons.svg
│   │   └── logo.png
│   ├── src/
│   │   ├── assets/
│   │   │   └── logo.png
│   │   ├── components/               # Reusable UI components
│   │   │   ├── Navbar.jsx            # Role-aware navigation, user dropdown, responsive
│   │   │   ├── ProtectedRoute.jsx    # Auth check + optional role-based access
│   │   │   ├── GrievanceCard.jsx     # Summary card used across dashboards
│   │   │   ├── StatusBadge.jsx       # Color-coded status with tooltip
│   │   │   ├── SearchFilter.jsx      # Debounced search + status/category dropdowns
│   │   │   └── FileUpload.jsx        # Drag-and-drop, max 3, 5 MB limit, extension validation
│   │   ├── pages/
│   │   │   ├── Landing.jsx           # Role-aware home (authenticated) + public hero
│   │   │   ├── Login.jsx             # Username/password form
│   │   │   ├── Register.jsx          # Registration with role/department/contact fields
│   │   │   ├── PasswordReset.jsx     # Two-step flow (request token → set new password)
│   │   │   ├── SubmitGrievance.jsx   # Full form + file upload + anonymous toggle + confirmation modal
│   │   │   ├── TrackGrievance.jsx    # My Grievances tab + Anonymous tracking form
│   │   │   ├── StudentDashboard.jsx  # Own grievances with summary stats + search/filter
│   │   │   ├── DepartmentDashboard.jsx # Tabbed dept grievances, read-only for STAFF
│   │   │   ├── AdminDashboard.jsx    # System-wide stats, quick actions, recent grievances
│   │   │   ├── GrievanceDetail.jsx   # Full detail: metadata, AI analysis, responses, history
│   │   │   └── Faq.jsx               # FAQ accordion
│   │   ├── services/
│   │   │   └── api.js                # Axios client with JWT token refresh interceptor
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx        # Auth state management (JWT in localStorage)
│   │   ├── App.jsx                   # Root component with routes
│   │   ├── App.css                   # Full application styles
│   │   ├── index.css                 # Base styles + design tokens
│   │   └── main.jsx                  # Entry point
│   ├── index.html                    # Vite entry HTML
│   ├── package.json                  # Node dependencies (axios, react-router-dom, vite)
│   ├── .oxlintrc.json
│   └── vite.config.js                # Vite configuration
│
├── implementation-plan.md            # Original implementation plan
├── implementation-plan-updated.md    # This file (updated per actual implementation)
└── README.md
```

---

## 2. Phase 1 — Data Models & Database

**SRS Reference:** §7.1–§7.9, §9.1

### 2.1 Create the apps

```bash
cd backend
python manage.py startapp accounts
python manage.py startapp grievances
```

**Actual implementation uses two apps:**
- `accounts/` — for Department model + custom User model (extends AbstractUser)
- `grievances/` — for all grievance-related models

### 2.2 Register apps in `config/settings.py`

Add to `INSTALLED_APPS`:
- `'accounts'`
- `'grievances'`
- `'corsheaders'`
- `'rest_framework'`
- `'whitenoise'`

Configure `AUTH_USER_MODEL`:
```python
AUTH_USER_MODEL = 'accounts.User'
```

### 2.3 Define Models

#### 2.3.1 Department (in `accounts/models.py`)

| Field            | Type        | Notes                        |
|------------------|-------------|------------------------------|
| id               | AutoField   | PK                           |
| name             | CharField   | e.g. "Department of Electronics and Computer Engineering" |
| department_type  | CharField   | `ACADEMIC` or `ADMINISTRATIVE` (TextChoices) |

**Seed data:** 10 departments — 6 Academic (Electronics & Computer Eng., Electrical Eng., Mechanical & Aerospace Eng., Civil Eng., Architecture, Applied Science & Chemical Eng.) + 4 Administrative (Library, Security Office, Accounts Office, IT Support).

#### 2.3.2 Category (in `grievances/models.py`)

| Field       | Type        | Notes                           |
|-------------|-------------|----------------------------------|
| id          | AutoField   | PK                               |
| name        | CharField   | e.g. "Examination", unique       |
| description | TextField   | Optional description of category |

**Seed data:** 9 categories — Examination, Attendance, Laboratory, Faculty, Classroom, Infrastructure, Harassment, Administrative Services, Others.

#### 2.3.3 User (in `accounts/models.py`, extends AbstractUser)

| Field          | Type         | Notes                                    |
|----------------|--------------|------------------------------------------|
| id             | AutoField    | PK                                       |
| username       | CharField    | College email / roll number              |
| email          | EmailField   | College email                            |
| password       | CharField    | Hashed (Django's default PBKDF2)         |
| role           | CharField    | `STUDENT`, `STAFF`, `HOD`, `CAMPUS_ADMIN` |
| department     | FK → Department | Nullable; `CampusAdmin` has None       |
| first_name     | CharField    |                                          |
| last_name      | CharField    |                                          |
| contact_number | CharField    | Contact phone number, optional            |
| is_active      | BooleanField |                                          |
| date_joined    | DateTimeField|                                          |

**Note:** Uses Django's `AbstractUser` (not `AbstractBaseUser`). Role defaults to `STUDENT`.

#### 2.3.4 Grievance (in `grievances/models.py`)

| Field            | Type              | Notes                                               |
|------------------|-------------------|------------------------------------------------------|
| id               | AutoField (PK)    | Auto-increment integer (GMS-0001 format in UI/export) |
| user             | FK → User         | Always stored, even for anonymous (not exposed)       |
| department       | FK → Department   | Nullable; set by routing service                      |
| category         | FK → Category     | Classification only (not routing)                     |
| title            | CharField(255)    | Short summary, 5-255 chars                            |
| description      | TextField         | 5-5000 chars                                          |
| current_status   | CharField(20)     | TextChoices with 8 statuses, `db_index=True`          |
| is_anonymous     | BooleanField      | Whether submitted anonymously                         |
| secret_code      | CharField(128)    | For anonymous tracking (hashed via `make_password`)   |
| is_reopened      | BooleanField      | True if reopened at least once (not `is_second_time`) |
| escalation_level | PositiveSmallInt  | Escalation counter (0 = normal, 1+ = escalated)       |
| escalated_to     | FK → User         | The Campus Admin assigned on escalation               |
| created_at       | DateTimeField     | Auto-set, `db_index=True`                             |
| updated_at       | DateTimeField     | Auto-set                                              |

**Valid statuses:** `SUBMITTED`, `SPAM`, `UNDER_REVIEW`, `RESPONDED`, `REOPENED`, `ESCALATED`, `RESOLVED`, `CLOSED`.

#### 2.3.5 AIAnalysis (in `grievances/models.py`)

| Field                | Type                | Notes                                 |
|----------------------|---------------------|---------------------------------------|
| id                   | AutoField           | PK                                    |
| grievance            | OneToOne → Grievance|                                       |
| spam_prediction      | BooleanField        | True = spam detected                  |
| confidence_score     | FloatField          | 0.0 – 1.0                             |
| classification_reason| TextField           | Reason for classification             |
| sentiment            | CharField(50)       | Reserved for future sentiment analysis |
| analysis_timestamp   | DateTimeField       | Auto-set                               |

#### 2.3.6 Response (in `grievances/models.py`)

| Field     | Type              | Notes                                    |
|-----------|-------------------|------------------------------------------|
| id        | AutoField         | PK                                       |
| grievance | FK → Grievance    | Many responses per grievance              |
| responder | FK → User         | Must be HOD of the routed department     |
| content   | TextField         | Response body                            |
| created_at| DateTimeField     | Auto-set                                 |

#### 2.3.7 StatusHistory (in `grievances/models.py`)

| Field          | Type              | Notes                        |
|----------------|-------------------|------------------------------|
| id             | AutoField         | PK                           |
| grievance      | FK → Grievance    |                              |
| previous_status| CharField(20)     | Nullable for initial entry   |
| new_status     | CharField(20)     |                              |
| action_by      | FK → User         | Nullable (null for system)   |
| remarks        | TextField         | Optional notes               |
| created_at     | DateTimeField     | Auto-set                     |

#### 2.3.8 Attachment (in `grievances/models.py`)

| Field      | Type              | Notes                                |
|------------|-------------------|--------------------------------------|
| id         | AutoField         | PK                                   |
| grievance  | FK → Grievance    |                                      |
| file_name  | CharField         | Original filename                    |
| file_type  | CharField         | MIME type or extension               |
| file       | FileField         | Stored in `grievance_attachments/`   |
| uploaded_at| DateTimeField     | Auto-set                             |

### 2.4 Entity Relationships (ERD Summary)

```
Department 1──M User                (each user belongs to one department, except CampusAdmin)
Department 1──M Grievance           (routing target)
User        1──M Grievance           (submitter, always linked even if anonymous)
User        1──M Response            (responder, HOD only)
User        1──M StatusHistory       (who triggered the transition)
Category    1──M Grievance           (classification only, not routing)
Grievance   1──M Response            (many responses possible, including after reopen)
Grievance   1──1 AIAnalysis          (at most one spam analysis record)
Grievance   1──M Attachment          (max 3 enforced by app logic)
Grievance   1──M StatusHistory       (one entry per status transition)
```

### 2.5 Migration commands

```bash
python manage.py makemigrations accounts
python manage.py makemigrations grievances
python manage.py migrate
python manage.py seed_data    # custom management command for departments & categories
```

**Migrations applied (6 for grievances):**
1. `0001_initial.py` — Creates all initial models
2. `0002_fix_status_history_previous_null.py` — Fix previous_status to accept null
3. `0003_fix_secret_code_length.py` — Adjusted secret_code field length
4. `0004_alter_grievance_department.py` — Made department nullable
5. `0005_grievance_escalated_to_grievance_escalation_level.py` — Added escalated_to and escalation_level
6. `0006_alter_grievance_created_at_and_more.py` — Added db_index on created_at and current_status

---

## 3. Phase 2 — Authentication & RBAC

**SRS Reference:** §3.1 (FR-01–FR-06), §3.2 (Anonymity)

### 3.1 Backend

**Files affected:** `accounts/views.py`, `accounts/serializers.py`, `accounts/urls.py`, `grievances/permissions.py`, `config/urls.py`, `config/settings.py`

**Key difference from plan:** Auth is implemented in a separate `accounts` app, not inside the `grievances` app.

#### 3.1.1 Install JWT auth

Add `djangorestframework-simplejwt` to `requirements.txt`. Configure in settings:

```python
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.AllowAny',  # per-view IsAuthenticated used instead
    ),
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}
```

#### 3.1.2 Registration Endpoint

**`POST /api/auth/register/`**

- Accepts: `username`, `email`, `password`, `password2`, `first_name`, `last_name`, `role` (STUDENT or STAFF), `department` (FK required), `contact_number`
- Validates password confirmation match
- Creates User with hashed password
- Only STUDENT and STAFF roles can self-register; HOD and CAMPUS_ADMIN are assigned by admin

#### 3.1.3 Login Endpoint

**`POST /api/auth/login/`** — Uses `rest_framework_simplejwt` built-in `TokenObtainPairView`

- Accepts: `username`, `password`
- Returns: `access` (token), `refresh` (token)

#### 3.1.4 Token Refresh

**`POST /api/auth/token/refresh/`** — Uses `rest_framework_simplejwt` built-in `TokenRefreshView`

#### 3.1.5 Current User Profile

**`GET/PATCH /api/auth/me/`** — `UserProfileView` (RetrieveUpdateAPIView)
- Returns: `id`, `username`, `email`, `first_name`, `last_name`, `role`, `department`, `department_name`, `contact_number`
- PATCH allows updating profile fields

#### 3.1.6 Password Reset

**`POST /api/auth/password-reset/`** — Accepts email, returns dev_token (in dev mode) using `default_token_generator`
**`POST /api/auth/password-reset/confirm/`** — Accepts `email + token + password + password2`

Always returns the same response whether the email exists or not (prevents email enumeration).

#### 3.1.7 RBAC Permission Classes

Create `grievances/permissions.py`:

| Permission Class      | Allows                                  |
|-----------------------|-----------------------------------------|
| `IsStudent`           | Student role only                       |
| `IsStaff`             | Staff role only                         |
| `IsHOD`               | HOD role only                           |
| `IsCampusAdmin`       | Campus Admin role only                  |
| `IsHODOrAdmin`        | HOD or Campus Admin                     |
| `IsSubmitter`         | The user who created the grievance (object-level) |
| `IsAssignedDepartment`| HOD/Staff whose department matches the grievance (object-level) |
| `ReadOnly`            | Read-only access for unauthenticated users |

### 3.2 Frontend

**Files:** `frontend/src/contexts/AuthContext.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/components/ProtectedRoute.jsx`

| Component       | Purpose                                              |
|-----------------|------------------------------------------------------|
| `AuthContext`   | Stores JWT in localStorage, provides login/logout/register/checkAuthStatus methods |
| `ProtectedRoute`| Wraps routes; redirects to login if unauthenticated; checks role for RBAC |
| `Login`         | Username + password form; stores tokens + fetches profile on success |
| `Register`      | Registration form with role/department/contact fields |

Password reset has a separate **two-step flow** (`PasswordReset.jsx`): Step 1 requests a reset token by email, Step 2 accepts token + new password. Shows dev_token notice in development mode.

### 3.3 Anonymous Submission Mechanism (FR-05)

- When `is_anonymous=True` on grievance creation:
  - `user_id` is stored internally (for audit trail) — never exposed through API
  - A random 8-character alphanumeric **secret code** is generated via `get_random_string(8).upper()`
  - The code is hashed with `make_password()` (bcrypt) before storage
  - The response returns `grievance_id` (integer) + `secret_code` (plaintext, returned once at creation)
  - `submitter_name` field in serializers returns `None` for anonymous grievances

---

## 4. Phase 3 — Grievance Submission & Rate Limiting

**SRS Reference:** §3.3 (FR-07–FR-13)

### 4.1 Backend

#### 4.1.1 Submit Grievance

**`POST /api/grievances/`**

Processing order:
```
Request → Authenticate → Rate Limit Check → Create Grievance (status=SUBMITTED)
  → Create StatusHistory entry (null → SUBMITTED)
  → (if anonymous) Generate 8-char secret_code, hash with make_password()
  → (if files) Create Attachment records
  → (Phase 4) Run ML spam detection → create AIAnalysis record
  → (if not spam) Route grievance (Phase 5) → send submission email to HOD
  → Return grievance detail (+ secret_code if anonymous)
```

Fields accepted: `category_id`, `department_id`, `title`, `description`, `is_anonymous`, `uploaded_files[]`

Parsers: `JSONParser`, `MultiPartParser`, `FormParser`

#### 4.1.2 Rate Limiting (FR-11, FR-12)

**Actual implementation:** Custom check in the view's `check_throttles()` method. DB-backed count ensures accuracy regardless of cache backend:

```python
def check_throttles(self, request):
    if request.method != 'POST':
        return
    today = timezone.now().date()
    count = Grievance.objects.filter(
        user=request.user,
        created_at__date=today,
    ).count()
    if count >= 3:
        raise Throttled(detail='You have reached the maximum limit of grievances per day...')
```

Returns **429 Too Many Requests** with message: *"You have reached the maximum limit of grievances per day. Please try again after midnight."*

**Also available:** `DailyGrievanceThrottle` in `throttles.py` (DRF `SimpleRateThrottle`, scope=`'daily_grievance'`, rate=`'3/day'`) — exists but the DB-backed view method is the active enforcement.

#### 4.1.3 File Attachments (FR-10)

- Upload via `MultiPartParser` and `FormParser` with the grievance creation
- `uploaded_files` field in `GrievanceCreateSerializer` accepts up to 3 `FileField` entries
- Validate: max 3 files, max 5 MB each
- Allowed MIME types: `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/png`, `image/jpeg`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Allowed extensions: `.pdf`, `.doc`, `.docx`, `.png`, `.jpg`, `.jpeg`, `.xls`, `.xlsx`
- Files stored in `MEDIA_ROOT/grievance_attachments/` via Django `FileField`
- Creation wrapped in `transaction.atomic()` for data integrity

#### 4.1.4 Confirmation Response

Returns full grievance detail via `GrievanceDetailSerializer`:
```json
{
  "id": 7,
  "title": "...",
  "secret_code": "A8K9M2P1",
  ...
}
```

### 4.2 Frontend

**`GET /api/categories/`** and **`GET /api/departments/`** endpoints to populate dropdowns (no auth required).

**`SubmitGrievance.jsx`:**
- Category dropdown (required, from API)
- Department selector (required)
- Title field (5-255 chars)
- Description textarea with character count (5-5000)
- Anonymous toggle checkbox with explanation text
- File upload component (max 3, with drag-and-drop, remove buttons)
- Client-side validation (description length, file type/size)
- Submit button → confirmation modal with GMS-ID and secret code (if anonymous)
- 429 error handling with clear user-facing message

---

## 5. Phase 4 — AI Spam Filtering

**SRS Reference:** §3.4 (FR-14–FR-18), §4.6 NFR-26

### 5.1 Backend

#### 5.1.1 Spam Detection Service

File: `grievances/services/spam_detector.py`

Implements a swappable spam detection interface (Strategy pattern, NFR-26):

```python
class SpamDetectorInterface(ABC):
    """Abstract interface — swap implementation without touching views."""
    def analyze(self, text: str) -> dict:
        """Return {spam_prediction: bool, confidence_score: float, classification_reason: str}"""

class MLSpamDetector(SpamDetectorInterface):
    """Scikit-learn pipeline (TF-IDF + classifier) trained on grievance data."""
```

**Text preprocessing pipeline** (matches Jupyter Notebook training):
- Expand contractions (`can't` → `cannot`, `n't` → ` not`, etc.)
- Lowercase
- Remove HTML tags
- Replace URLs → `urltoken`, emails → `emailtoken`, phone numbers → `phonetoken`
- Remove `@mentions`, preserve `#hashtag` words
- Convert emojis to text via `emoji.demojize`
- Normalize repeated characters (`hellooo` → `helloo`)
- Remove punctuation, keep numbers
- Tokenize with NLTK `word_tokenize`
- Remove stopwords **except negations** (no, not, nor, never, cannot, without)
- Porter stem via `nltk.stem.porter.PorterStemmer`

**Model file:** `services/models/grievance_model.pkl` — pre-trained scikit-learn Pipeline (vectorizer + classifier).

**Training notebook:** `notebooks/grievance_spam_detection.ipynb`

#### 5.1.2 Integration into Submission Pipeline

After the grievance is created and rate-limit passes (inside `GrievanceListCreateView.create()`):

```
Grievance Created (status=SUBMITTED)
  → MLSpamDetector.analyze(grievance.description)
  → AIAnalysis record created (persisted regardless of result)
  → if spam_prediction == True:
        grievance.current_status = "SPAM"
        grievance.save(update_fields=['current_status'])
        StatusHistory created (SUBMITTED → SPAM) via direct creation (not signal)
  → if spam_prediction == False:
        route_grievance() called (see Phase 5)
        send_submission_email(grievance) sent to HOD
```

This happens **synchronously** — the ML model is lightweight enough for inline inference.

#### 5.1.3 Spam Queue (FR-15, FR-16)

**`GET /api/admin/spam-queue/`** — Campus Admin only.
- Lists all grievances with `current_status = "SPAM"`
- Shows: grievance ID, title, confidence score, reason, submission date
- `SpamQueueView` (ListAPIView) — no pagination (queue is typically small)

**`POST /api/admin/spam-queue/{id}/reinstate/`** — Campus Admin only.
- Sets status back to `SUBMITTED`, updates AIAnalysis record (overrides `spam_prediction=False`)
- Logs StatusHistory: `SPAM → SUBMITTED`
- Returns updated grievance detail

#### 5.1.4 Appeal Mechanism (FR-17)

**`POST /api/grievances/{id}/appeal-spam/`** — Submitter only.
- Submitter can flag their spam-classified grievance for review
- Creates StatusHistory entry (SPAM → SPAM with remarks about appeal)
- Grievance stays in SPAM until Campus Admin reviews
- Returns confirmation message: *"Your appeal has been submitted..."*

#### 5.1.5 Confidence Score (FR-18)

Returned as part of grievance detail response via `AIAnalysisSerializer`:
```json
{
  "grievance": {...},
  "ai_analysis": {
    "spam_prediction": true,
    "confidence_score": 0.87,
    "classification_reason": "Classified as spam by ML model.",
    "sentiment": null,
    "analysis_timestamp": "2026-07-29T12:00:00Z"
  }
}
```

---

## 6. Phase 5 — Grievance Routing

**SRS Reference:** §3.5 (FR-23–FR-27)

### 6.1 Backend

#### 6.1.1 Automatic Routing Service

File: `grievances/services/routing.py`:

```python
def route_grievance(grievance, action_by=None, remarks=None):
    """
    1. If submitter selected a department during submission → use that
    2. Otherwise → fall back to the submitter's own department
    3. Set grievance.department = target_department
    4. Set grievance.current_status = UNDER_REVIEW
    5. Create StatusHistory entry explicitly
    """
```

**Guards:**
- Idempotent — calling on UNDER_REVIEW is a no-op
- Spam grievances are NOT routed (pending admin review)
- Without a target department, grievance stays in SUBMITTED for manual admin intervention
- Only freshly-submitted grievances (SUBMITTED status) are routed

Per SRS §5 (Category vs. Routing): The category is for classification only. Routing is ALWAYS based on department, never on category.

#### 6.1.2 Department-Scoped Views

**`GET /api/grievances/`** — List grievances:
- **Student/Staff:** sees only their own grievances (`user=request.user`)
- **HOD:** sees only grievances where `department_id = user.department_id`
- **Campus Admin:** sees all grievances

Uses `select_related('category', 'department', 'user')` for query optimization.

Custom query-parameter filters available on list: `category`, `status`, `date_from`, `date_to`. DRF `SearchFilter` on `title` and `description`, `OrderingFilter` on `created_at`, `updated_at`, `title`, `current_status`.

#### 6.1.3 Grievance Detail (FR-25)

**`GET /api/grievances/{id}/`** — Returns full details via `GrievanceDetailSerializer`:
- Title, description, category, department, status, timestamps
- Attachments (list with file metadata)
- Responses (list with responder name + timestamps)
- Status history (list with previous/current status, action by, remarks)
- AI Analysis (if exists)
- **For anonymous grievances:** `submitter_name` = `None`
- `escalation_level`, `escalated_to_name`
- Role-scoped: Student sees only own, HOD/Staff sees department, Admin sees all

Uses `select_related('category', 'department', 'user', 'ai_analysis')` + `prefetch_related('responses__responder', 'status_history__action_by', 'attachments')`.

#### 6.1.4 Response Submission (FR-26, FR-27)

**`POST /api/grievances/{id}/respond/`** — HOD only.
- Validates requester is HOD and belongs to the grievance's department
- Validates grievance is UNDER_REVIEW or REOPENED
- Creates `Response` record
- Changes status from UNDER_REVIEW/REOPENED → RESPONDED
- StatusHistory auto-logged via `pre_save` signal

---

## 7. Phase 6 — Response & Escalation Workflow

**SRS Reference:** §3.6 (FR-28–FR-32), §3.7 (FR-33–FR-38), §6 (Status Transitions)

### 7.1 Status Transition Enforcement

`VALID_TRANSITIONS` dict in views.py enforces valid transitions:

| From         | Allowed To                             |
|--------------|----------------------------------------|
| SUBMITTED    | UNDER_REVIEW, SPAM                     |
| SPAM         | SUBMITTED (if reinstated), CLOSED      |
| UNDER_REVIEW | RESPONDED, ESCALATED                   |
| RESPONDED    | RESOLVED, REOPENED, ESCALATED          |
| REOPENED     | RESPONDED, ESCALATED                   |
| ESCALATED    | RESOLVED                               |
| RESOLVED     | CLOSED                                 |
| CLOSED       | (none — terminal)                      |

Function `_is_valid_transition(from_status, to_status)` checks allowed transitions by set membership lookup.

### 7.2 StatusHistory Auto-Logging via Signals

File: `grievances/signals.py`

```python
@receiver(pre_save, sender=Grievance)
def log_status_change(sender, instance, **kwargs):
    """Auto-create StatusHistory entry when current_status changes."""
    # Skips new instances (pk is None) — serializer handles initial entry
    # Compares in-memory status vs DB status
    # Uses instance._action_by and instance._action_remarks if set
```

**Usage pattern:** Callers set `instance._action_by` (User) and `instance._action_remarks` (str) **before** calling `save()` to control the audit trail. If `_action_remarks` is omitted, a generic message is generated.

The signal does NOT fire for new instances — the initial StatusHistory for SUBMITTED is created by `GrievanceCreateSerializer`.

### 7.3 Workflow Endpoints

| Endpoint (all `POST`)                           | From Status       | To Status   | Who             |
|--------------------------------------------------|-------------------|-------------|-----------------|
| `/api/grievances/{id}/respond/`                  | UNDER_REVIEW, REOPENED | RESPONDED | HOD    |
| `/api/grievances/{id}/resolve/`                  | RESPONDED         | RESOLVED    | Submitter       |
| `/api/grievances/{id}/reopen/`                   | RESPONDED         | REOPENED    | Submitter       |
| `/api/admin/escalated/{id}/resolve/`              | ESCALATED         | RESOLVED → CLOSED | Campus Admin |
| System auto (APScheduler)                         | UNDER_REVIEW, RESPONDED, REOPENED (≥72h) | ESCALATED | System |

### 7.4 Auto-Escalation via APScheduler

File: `grievances/services/escalation_service.py` + `grievances/apps.py`

**APScheduler starts automatically** in `GrievancesConfig.ready()` (guarded against autoreloader and management commands):

```python
@staticmethod
def _start_scheduler():
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.interval import IntervalTrigger
    scheduler = BackgroundScheduler(daemon=True)
    scheduler.add_job(
        run_escalation_cycle,
        trigger=IntervalTrigger(minutes=interval),  # default: 60 min
        id='escalation_cycle',
        replace_existing=True,
        next_run_time=None,  # Don't run immediately on startup
    )
    scheduler.start()
```

**Escalation cycle** (`run_escalation_cycle()`):
1. Queries grievances with `current_status IN ('UNDER_REVIEW', 'RESPONDED', 'REOPENED')` AND `updated_at < now - timedelta(hours=72)`
2. Default threshold: 72 hours (configurable via `ESCALATION_HOURS` in .env)
3. For each stale grievance:
   - Assigns a Campus Admin (`find_next_officer()`) — prefers someone other than the current HOD
   - Sets `escalation_level = 1`, `escalated_to = assigned admin`, status = `ESCALATED`
   - Creates StatusHistory entry (action_by = null for system actions)
   - Sends HTML escalation email to the assigned officer

**Manual trigger:** `python manage.py escalate` (supports `--dry-run` flag for preview).

### 7.5 Email Notifications

Four HTML email templates in `grievances/templates/emails/` with inline CSS styling:

| Event | Recipient | Template |
|-------|-----------|----------|
| New grievance submitted | HOD of target department | `submission_notification.html` |
| HOD responds | Grievance submitter | `response_notification.html` |
| Grievance resolved | Grievance submitter | `resolution_notification.html` |
| Grievance escalated | Assigned Campus Admin | `escalation_notification.html` |

Email uses Django SMTP backend. Gmail credentials configured via .env. Console backend is the default fallback for development (`django.core.mail.backends.console.EmailBackend`).

### 7.6 Campus Admin Resolution (SRS §3.6 special rule)

> *"Unlike the normal HOD-response path, the escalated path does not pass back through a submitter-satisfaction check before moving to Resolved and then Closed — Campus Admin resolution is treated as final."*

**`POST /api/admin/escalated/{id}/resolve/`:**
- Only Campus Admin can call this
- Creates a Response record (from Campus Admin) if `content` is provided in request body
- Sets status: `ESCALATED → RESOLVED → CLOSED` (two sequential saves, no submitter check)
- Sends resolution email to the submitter

### 7.7 Request Further Review (FR-37)

**`POST /api/grievances/{id}/reopen/`:**
- Submitter can only call when status is `RESPONDED`
- Sets `is_reopened = True`
- Sets status `RESPONDED → REOPENED`
- Restarts 72-hour escalation timer
- HOD can submit another Response (`REOPENED → RESPONDED`)

---

## 8. Phase 7 — Dashboards, Search & Export

**SRS Reference:** §3.8 (FR-39–FR-43)

### 8.1 Dashboard Endpoints

| Endpoint                        | Role         | Data Returned                                              |
|---------------------------------|--------------|------------------------------------------------------------|
| `GET /api/dashboard/student/`   | Student, Staff | User's own grievances: counts (total, resolved, escalated, pending) + up to 50 recent items |
| `GET /api/dashboard/department/`| HOD, Staff   | Department grievances: counts (total, open, resolved, escalated) + up to 50 recent items |
| `GET /api/dashboard/admin/`     | Campus Admin | System-wide: status breakdown (all 8 statuses), escalated count, spam count, 10 most recently updated |

**`GET /api/dashboard/student/`** — `StudentDashboardView`:
- `counts`: total, resolved, escalated, pending (excludes RESOLVED/CLOSED/ESCALATED)
- `grievances`: up to 50 items, serialized with `GrievanceListSerializer`

**`GET /api/dashboard/department/`** — `DepartmentDashboardView`:
- Requires that the user has a department assigned
- `counts`: total, open (UNDER_REVIEW/RESPONDED/REOPENED), resolved, escalated
- `grievances`: up to 50 items

**`GET /api/dashboard/admin/`** — `AdminDashboardView` (IsCampusAdmin):
- `counts.status_breakdown`: map of each status choice → count
- `counts.escalated`: count of ESCALATED
- `counts.spam`: count of SPAM
- `recent`: 10 most recently updated grievances

### 8.2 Search and Filter (FR-42)

Applied to `GrievanceListCreateView.get_queryset()` via query parameters:

```
GET /api/grievances/?search=exam&category=1&status=UNDER_REVIEW&date_from=2026-01-01&date_to=2026-12-31&ordering=-created_at
```

Uses DRF's `SearchFilter` (basic ILIKE on `title`, `description`) + custom query-param filters for `category`, `status`, `date_from`, `date_to`.

**Frontend:** `SearchFilter` component with debounced search input (300ms delay), status dropdown (all 8 statuses), category dropdown (fetched from API).

### 8.3 Export (FR-43)

**`GET /api/reports/export/?format=csv`** — Campus Admin only.

**CSV export** with columns:
`ID`, `Title`, `Status`, `Category`, `Department`, `Submitter Name`, `Is Anonymous`, `Is Reopened`, `Escalation Level`, `Created At`, `Updated At`

- Anonymous grievance submitter identity is excluded (blank in CSV)
- Optional filters: `department`, `status`, `date_from`, `date_to`
- Uses `HttpResponse` with `Content-Type: text/csv`
- Filename: `grievances_export_YYYYMMDD_HHMMSS.csv`

**Note:** Only CSV export is implemented. PDF export is not implemented (planned for Phase 7 in original plan but not yet built).

---

## 9. Phase 8 — Frontend Implementation

**SRS Reference:** §3.8, §4.3

### 9.1 Route Map

```
/                          → Landing page (role-aware if authenticated, public hero if not)
/login                     → Login page (username + password)
/register                  → Registration page (role/department/contact fields)
/password-reset            → Two-step password reset (request token → set new password)
/grievances/new            → Submit grievance (Student/Staff)
/grievances/track          → Track grievance (My Grievances tab + Anonymous tracking)
/grievances/:id            → Grievance detail + responses + status history
/dashboard                 → Role-based redirect to correct dashboard
/dashboard/student         → Student dashboard (Student/Staff)
/dashboard/department      → Department dashboard (HOD, read-only for Staff)
/dashboard/admin           → Campus Admin dashboard
/faq                       → FAQ accordion page
```

### 9.2 Component Tree

```
App
├── AuthContext (Provider)
├── Navbar (role-aware links, user dropdown, responsive hamburger menu)
├── Routes
│   ├── Public
│   │   ├── Landing
│   │   ├── Login
│   │   ├── Register
│   │   ├── PasswordReset
│   │   ├── TrackGrievance
│   │   └── Faq
│   ├── ProtectedRoute(role='Student', 'Staff')
│   │   ├── StudentDashboard
│   │   └── SubmitGrievance
│   ├── ProtectedRoute(role='HOD')
│   │   ├── DepartmentDashboard (tabs: All / Under Review / Resolved / Escalated)
│   │   └── GrievanceDetail (with action buttons)
│   └── ProtectedRoute(role='CampusAdmin')
│       └── AdminDashboard
│   ├── GrievanceDetail (all roles, scoped by backend)
│   └── DashboardRedirect (automatic /dashboard → role dashboard)
└── Shared Components
    ├── StatusBadge (color-coded: SUBMITTED=blue, SPAM=red, RESPONDED=green, etc.)
    ├── GrievanceCard (summary card used across dashboards)
    ├── SearchFilter (debounced search + status/category dropdowns)
    ├── FileUpload (drag-and-drop, max 3, 5 MB limit)
    ├── Navbar (role-aware, with dropdown menu)
    └── ProtectedRoute (auth + role check)
```

### 9.3 Theme / Visual Design

- Clean, accessible design consistent with a college/university web app
- Design tokens defined in CSS variables (`--primary`, `--danger`, `--success`, etc.)
- Status badges with clear color coding via CSS classes `status-{lowercase_status}`:
  - `SUBMITTED` → Blue
  - `SPAM` → Red
  - `UNDER_REVIEW` → Amber
  - `RESPONDED` → Green (informational)
  - `REOPENED` → Purple
  - `ESCALATED` → Orange (with urgency indicator)
  - `RESOLVED` → Green
  - `CLOSED` → Gray
- Responsive layout (works on desktop + tablet + mobile via hamburger menu)
- Loading states (spinners), empty states (contextual messages), error states (retry buttons)
- Tooltips on status badges explaining what each status means

### 9.4 Key Implementation Details

| Feature | Implementation Notes |
|---------|---------------------|
| JWT token handling | Axios interceptor with silent token refresh; request queuing during refresh; stale tokens trigger `auth:logout` event |
| Anonymous tracking | Dual-panel UI: "My Grievances" (authenticated list with status filter + show more) + "Track Anonymously" (ID + secret code form) |
| Rate limit UX | Server returns 429 with clear message; client shows error alert |
| File uploads | Drag-and-drop zone; file list with remove button; client-side type+size validation before upload |
| Response flow | Detail page shows response list with timestamps; action buttons (Reply/Reopen) disabled "coming soon" |
| Search/filter | Debounced search input (300ms); dropdowns for status/category |
| Export | CSV export via `/api/reports/export/` URL; Admin Dashboard has disabled "coming soon" buttons |
| Landing page | Role-aware authenticated view (Student / Staff / HOD / Campus Admin workspace) + public hero for unauthenticated |
| FAQ | Accordion-style page with 14 questions covering submission, tracking, statuses, spam, file uploads |
| 404 handler | Custom `NotFoundPlaceholder` with link back to home |

### 9.5 Frontend Gap Analysis (Planned but Not Yet Implemented)

| Item | Status |
|------|--------|
| GrievanceDetail action buttons (Respond/Resolve/Reopen/Appeal) | Disabled "coming soon" — backend endpoints exist |
| `/admin/spam-queue` frontend page | Not built — Admin Dashboard has disabled "coming soon" button |
| `/reports` frontend page | Not built — only direct API access available |
| `SpamAppeal.jsx` component | Logic inline in GrievanceDetail, no separate component |
| `ResponseView.jsx` component | Logic inline in GrievanceDetail |
| `GrievanceForm.jsx` component | Logic inline in SubmitGrievance |
| PDF export | Only CSV implemented |
| "Remaining submissions today" UX | Not implemented on submit page |

---

## 10. Phase 9 — Non-Functional Requirements

**SRS Reference:** §4.1–§4.6

### 10.1 Security (NFR-01 to NFR-08)

| NFR | Requirement | Implementation |
|-----|-------------|----------------|
| NFR-01 | Password hashing | Django's default PBKDF2 (Argon2 or bcrypt can be swapped if needed) |
| NFR-02 | HTTPS | `SECURE_SSL_REDIRECT` enabled when `DEBUG=False`. HSTS (1 year, include subdomains, preload). `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` enforced. Proxy SSL header configured for reverse proxy. |
| NFR-03 | RBAC server-side | DRF permission classes — never rely on frontend-only checks |
| NFR-04 | Anonymous data privacy | `submitter_name` returns `None` for anonymous grievances in all serializers |
| NFR-05 | SQL injection prevention | Django ORM (parameterized queries by default) |
| NFR-06 | XSS protection | React's JSX auto-escaping covers all user-rendered content (no `dangerouslySetInnerHTML` used). Backend is a pure JSON API — no Django templates rendered. |
| NFR-07 | CSRF protection | DRF — JWT is stateless (no CSRF needed) |
| NFR-08 | Session timeout | JWT access token: 30 min expiry; refresh token: 24h with rotation (`ROTATE_REFRESH_TOKENS=True`) |

### 10.2 Performance (NFR-09 to NFR-13)

| NFR | Target | Approach |
|-----|--------|----------|
| NFR-09 | Submission < 3s | `select_related` on FK lookups; lightweight synchronous ML inference |
| NFR-10 | Dashboard < 2s | Indexed queries; pagination (20 per page) |
| NFR-11 | Search < 3s | Database indexes on `current_status`, `category_id`, `created_at`; DRF's `SearchFilter` with basic `ILIKE` |
| NFR-12 | 500 concurrent users | Gunicorn + WhiteNoise for static files. Connection pooling (PgBouncer) and nginx/CDN are optional for this internal campus system. |
| NFR-13 | Escalation every 24h | APScheduler running hourly (configurable interval) checks 72-hour inactivity threshold |

### 10.3 Usability (NFR-14 to NFR-17)

- NFR-14: Follow university web app conventions — familiar layout, clear call-to-action buttons
- NFR-15: Error messages in plain language with suggested fixes (e.g., "Description must be at least 10 characters")
- NFR-16: Help text on submission form, FAQ page with 14 questions, tooltips on status badges
- NFR-17: Single design system (CSS variables, consistent colors, spacing, typography, button styles)

### 10.4 Reliability (NFR-18 to NFR-21)

| NFR | Requirement | Implementation |
|-----|-------------|----------------|
| NFR-18 | 99% uptime (8 AM–6 PM weekdays) | Health check endpoint at `/api/status/` (checks DB connectivity) |
| NFR-19 | No data loss on errors | Database transactions; grievance creation wrapped in `atomic()` |
| NFR-20 | Daily backups | Daily database backups — can be configured if needed |
| NFR-21 | Error logging | Structured logging with 4 rotating file handlers; JSON format for error logs |

### 10.5 Maintainability (NFR-22 to NFR-25)

- NFR-22: Python — PEP 8; JS — Oxlint configured in `.oxlintrc.json`
- NFR-23: Docstrings on all models, views, services; README for onboarding
- NFR-24: Modular architecture — services layer separates business logic from views; AI interface for swappable backends
- NFR-25: Git with conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`)

### 10.6 Scalability (NFR-26 to NFR-28)

- NFR-26: AI module via `SpamDetectorInterface` (Strategy pattern) — swap implementation without touching views
- NFR-27: Indexed fields: `created_at`, `current_status`, `category_id`, `department_id`, `user_id`
- NFR-28: Stateless Django app behind load balancer; shared PostgreSQL; read replicas can be added later

---

## 11. Phase 10 — Production Readiness

**SRS Reference:** §9 (Constraints and Assumptions)

### 11.1 Security Hardening

| Item | Details |
|------|---------|
| HTTPS | `SECURE_SSL_REDIRECT` (when `DEBUG=False`), HSTS 1 year with `includeSubdomains` and `preload`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_PROXY_SSL_HEADER` |
| CORS | `CORS_ALLOW_ALL_ORIGINS = True` via `django-cors-headers` |
| Middleware | `WhiteNoiseMiddleware` for static files, custom `RequestLogMiddleware` for structured request logging |
| Logging | 4 rotating file handlers (10 MB each, 5 backups); JSON format for error logs |

### 11.2 Logging Configuration

Comprehensive structured logging with four rotating handlers:

| Log File      | Level   | Content                                         |
|---------------|---------|--------------------------------------------------|
| `gms.log`     | WARNING | General application warnings + errors (JSON)     |
| `gms_errors.log` | ERROR | Error-level events (JSON)                       |
| `gms_audit.log`  | INFO    | Audit trail via `audit_logger.py` service        |
| `gms_requests.log`| INFO   | Every HTTP request via `RequestLogMiddleware`    |

**Audit logging** via `grievances/services/audit_logger.py`:
```python
audit_log(request=request, action='SUBMIT_GRIEVANCE', grievance_id=..., details=...,
          old_status='SUBMITTED', new_status='UNDER_REVIEW', result='SUCCESS')
```
Captures: user, role, grievance, action, old/new status, IP, method, path, result.

### 11.3 Email Configuration

```python
EMAIL_BACKEND = os.getenv('EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = 587
EMAIL_USE_TLS = True
DEFAULT_FROM_EMAIL = 'Grievance Management System <noreply@college.edu.np>'
BASE_URL = os.getenv('BASE_URL', 'http://localhost:8000')
```

### 11.4 Escalation Configuration

```python
ESCALATION_HOURS = int(os.getenv('ESCALATION_HOURS', '72'))            # Inactivity threshold
ESCALATION_INTERVAL_MINUTES = int(os.getenv('ESCALATION_INTERVAL_MINUTES', '60'))  # APScheduler interval
```

### 11.5 Database Configuration

Two modes controlled by `USE_SQLITE` env var:
- `USE_SQLITE=True` → SQLite (development, default)
- `USE_SQLITE=False` → PostgreSQL (production)

### 11.6 Backend `.env` Template

```
SECRET_KEY=
DEBUG=True
USE_SQLITE=True
DB_NAME=gms_db
DB_USER=gms_user
DB_PASSWORD=gms_password
DB_HOST=localhost
DB_PORT=5432
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=True
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DEFAULT_FROM_EMAIL=Grievance Management System <noreply@college.edu.np>
BASE_URL=http://localhost:8000
ESCALATION_HOURS=72
ESCALATION_INTERVAL_MINUTES=60
```

### 11.7 Test Files

Per-phase integration tests in `backend/test/`:

| Directory | Description |
|-----------|-------------|
| `1-data-models--database/test.py` | Model creation, string representations, relationships |
| `2-authentication--rbac/test.py` | Registration, login, JWT, RBAC permission classes |
| `3-grievance-submission--rate-limiting/test.py` | Submission pipeline, rate limiting, file uploads |
| `4-ai-spam-filtering/test.py` | Spam detection integration, queue, appeal |
| `5-grievance-routing/test.py` | Routing logic, department scoping, category independence |
| `6-response--escalation-workflow/test.py` | Workflow endpoints, escalation, signals, transitions |
| `7-dashboards--search--export/test.py` | Dashboard endpoints, search/filter, CSV export |

### 11.8 Migration Files (grievances)

| File | Description |
|------|-------------|
| `0001_initial.py` | Initial schema (Category, Grievance, StatusHistory, Response, Attachment, AIAnalysis) |
| `0002_fix_status_history_previous_null.py` | Allow null previous_status |
| `0003_fix_secret_code_length.py` | Extend secret_code length |
| `0004_alter_grievance_department.py` | Make department nullable |
| `0005_grievance_escalated_to_grievance_escalation_level.py` | Add escalation fields |
| `0006_alter_grievance_created_at_and_more.py` | Add database indexes |

### 11.9 Requirements

```
django>=4.2,<5.0
djangorestframework
django-cors-headers
djangorestframework-simplejwt
psycopg2-binary
python-dotenv
nltk
scikit-learn
emoji
apscheduler
gunicorn
whitenoise
```

### 11.10 Frontend Dependencies

```json
{
  "dependencies": {
    "axios": "^1.18.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-router-dom": "^7.18.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.3",
    "oxlint": "^1.71.0",
    "vite": "^8.1.1"
  }
}
```

---

## 12. API Endpoint Reference

### 12.1 Authentication

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/auth/register/` | No | — | User registration — Students & Staff (FR-01) |
| POST | `/api/auth/login/` | No | — | Login, returns JWT access + refresh tokens (FR-02) |
| POST | `/api/auth/token/refresh/` | No | — | Refresh JWT access token |
| GET  | `/api/auth/me/` | Yes | Any | Current user profile (FR-03) |
| PATCH| `/api/auth/me/` | Yes | Any | Update profile fields |
| POST | `/api/auth/password-reset/` | No | — | Request password reset (FR-06) |
| POST | `/api/auth/password-reset/confirm/` | No | — | Confirm password reset with token |

### 12.2 Grievances

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET    | `/api/grievances/` | Yes | Any (scoped) | List grievances with search/filter/ordering (FR-24) |
| POST   | `/api/grievances/` | Yes | Student, Staff | Submit grievance with optional file attachments (FR-07) |
| GET    | `/api/grievances/{id}/` | Yes | Any (scoped) | Grievance detail (FR-25) |
| POST   | `/api/grievances/{id}/respond/` | Yes | HOD | Submit official response (FR-26) |
| POST   | `/api/grievances/{id}/resolve/` | Yes | Submitter | Mark as resolved (FR-36) |
| POST   | `/api/grievances/{id}/reopen/` | Yes | Submitter | Request further review (FR-37) |
| POST   | `/api/grievances/{id}/appeal-spam/` | Yes | Submitter | Appeal spam decision (FR-17) |

### 12.3 Tracking (Anonymous)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST   | `/api/grievances/track/` | No | Track by grievance ID + secret_code (FR-38) |

### 12.4 Admin

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET    | `/api/admin/spam-queue/` | Yes | Campus Admin | List spam queue (FR-15) |
| POST   | `/api/admin/spam-queue/{id}/reinstate/` | Yes | Campus Admin | Reinstate from spam (FR-16) |
| POST   | `/api/admin/escalated/{id}/resolve/` | Yes | Campus Admin | Resolve escalated grievance (FR-31) |

### 12.5 Dashboards

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET    | `/api/dashboard/student/` | Yes | Student, Staff | Student dashboard with counts + recent (FR-39) |
| GET    | `/api/dashboard/department/` | Yes | HOD, Staff | Dept. dashboard with tabbed counts (FR-40) |
| GET    | `/api/dashboard/admin/` | Yes | Campus Admin | Admin dashboard with status breakdown (FR-41) |

### 12.6 Reference Data & Reports

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET    | `/api/categories/` | No | List all grievance categories (FR-08) |
| GET    | `/api/departments/` | No | List all departments |
| GET    | `/api/reports/export/` | Campus Admin | Export grievances as CSV (FR-43) |
| GET    | `/api/status/` | No | Health check (DB connectivity status) |

---

## 13. Appendix — Status Transition Rules

### 13.1 Complete Transition Table

```
SUBMITTED ──▶ UNDER_REVIEW (routing service)
SUBMITTED ──▶ SPAM (AI detection)

SPAM ────────▶ SUBMITTED (admin reinstates)
SPAM ────────▶ CLOSED (admin confirms spam)

UNDER_REVIEW ──▶ RESPONDED (HOD responds)
UNDER_REVIEW ──▶ ESCALATED (auto, 72h inactivity)

RESPONDED ─────▶ RESOLVED (submitter satisfied)
RESPONDED ─────▶ REOPENED (submitter dissatisfied)
RESPONDED ─────▶ ESCALATED (auto, 72h inactivity)

REOPENED ──────▶ RESPONDED (HOD responds again)
REOPENED ──────▶ ESCALATED (auto, 72h inactivity)

ESCALATED ─────▶ RESOLVED (Campus Admin — final)
RESOLVED ──────▶ CLOSED (terminal)
CLOSED ────────▶ (none — terminal)
```

### 13.2 Visualization by User Role

**Submitter triggers:**
```
Submit Grievance           → SUBMITTED
Mark as Resolved           → RESPONDED → RESOLVED
Request Further Review     → RESPONDED → REOPENED (sets is_reopened=True)
Appeal Spam Decision       → SPAM (stays SPAM pending admin review)
```

**HOD triggers:**
```
Submit Official Response   → UNDER_REVIEW → RESPONDED
                              REOPENED → RESPONDED
```

**Campus Admin triggers:**
```
Reinstate from Spam        → SPAM → SUBMITTED (overrides AIAnalysis)
Confirm Spam               → SPAM → CLOSED
Resolve Escalated           → ESCALATED → RESOLVED → CLOSED (auto-close, no submitter check)
```

**System triggers (auto via APScheduler):**
```
After 72h no response      → UNDER_REVIEW → ESCALATED
                              RESPONDED → ESCALATED
                              REOPENED → ESCALATED
       (sets escalation_level=1, assigns Campus Admin, sends email)
```
