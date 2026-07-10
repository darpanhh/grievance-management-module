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
13. [Task Breakdown for 4-Person Team](#13-task-breakdown-for-4-person-team)
14. [Appendix — Status Transition Rules](#14-appendix--status-transition-rules)

---

## 1. Project Structure

```
grievance-management-module/
├── backend/                          # Django REST API project
│   ├── config/                       # Django project settings
│   │   ├── __init__.py
│   │   ├── settings.py               # Project settings (exists)
│   │   ├── urls.py                   # Root URL config
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── grievance/                    # Core app — will contain models, views, serializers
│   │   ├── management/
│   │   │   └── commands/
│   │   │       └── escalate.py       # Auto-escalation cron command
│   │   ├── migrations/
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── spam_detector.py      # AI spam detection interface
│   │   │   └── routing.py            # Automatic routing logic
│   │   ├── __init__.py
│   │   ├── admin.py
│   │   ├── apps.py
│   │   ├── models.py                 # All data models
│   │   ├── serializers.py            # DRF serializers
│   │   ├── permissions.py            # Custom RBAC permissions
│   │   ├── views.py                  # All API views
│   │   ├── urls.py                   # App-level URL routing
│   │   └── utils.py                  # Helper functions
│   ├── media/                        # Uploaded files (gitignored)
│   ├── manage.py                     # Django management entrypoint (exists)
│   ├── requirements.txt              # Python dependencies (exists)
│   └── .env                          # Environment variables
│
├── frontend/                         # React + Vite SPA (exists)
│   ├── src/
│   │   ├── components/               # Reusable UI components
│   │   │   ├── Navbar.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   ├── GrievanceForm.jsx
│   │   │   ├── GrievanceCard.jsx
│   │   │   ├── StatusBadge.jsx
│   │   │   ├── ResponseView.jsx
│   │   │   ├── FileUpload.jsx
│   │   │   ├── SpamAppeal.jsx
│   │   │   └── SearchFilter.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── PasswordReset.jsx
│   │   │   ├── SubmitGrievance.jsx
│   │   │   ├── TrackGrievance.jsx
│   │   │   ├── StudentDashboard.jsx
│   │   │   ├── DepartmentDashboard.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   └── GrievanceDetail.jsx
│   │   ├── services/
│   │   │   └── api.js                # Axios API client
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx        # Auth state management
│   │   ├── App.jsx                   # Root component (exists)
│   │   └── main.jsx                  # Entry point (exists)
│   ├── index.html                    # Vite entry HTML (exists)
│   ├── package.json                  # Node dependencies (exists)
│   └── vite.config.js                # Vite configuration (exists)
│
├── docker-compose.yml                # PostgreSQL + app services
├── implementation-plan.md            # This file
└── README.md
```

---

## 2. Phase 1 — Data Models & Database

**SRS Reference:** §7.1–§7.9, §9.1

### 2.1 Create the `grievance` Django app

```bash
cd backend
python manage.py startapp grievance
```

### 2.2 Register app in `config/settings.py`

Add to `INSTALLED_APPS`:
- `'grievance'`
- `'rest_framework.authtoken'` (or install `djangorestframework-simplejwt` for JWT)

Configure `AUTH_USER_MODEL`:
```python
AUTH_USER_MODEL = 'grievance.User'
```

### 2.3 Define Models (in `grievance/models.py`)

#### 2.3.1 Department

| Field     | Type        | Notes                        |
|-----------|-------------|------------------------------|
| id        | AutoField   | PK                           |
| name      | CharField   | e.g. "Computer Engineering"  |
| type      | CharField   | `Academic` or `Administrative` |

Seed data: Departments from SRS §7.1 (Computer Eng., Electrical Eng., Mechanical Eng., Civil Eng., Electronics Eng., Library, Security Office, Accounts Office, IT Support).

#### 2.3.2 Category

| Field       | Type        | Notes                           |
|-------------|-------------|----------------------------------|
| id          | AutoField   | PK                               |
| name        | CharField   | e.g. "Examination"               |
| description | TextField   | Optional description of category |

Seed data: All 9 categories from SRS §5.

#### 2.3.3 User (Custom, extends AbstractUser)

| Field        | Type         | Notes                                    |
|--------------|--------------|------------------------------------------|
| id           | AutoField    | PK                                       |
| username     | CharField    | College email / username                 |
| email        | EmailField   | College email                            |
| password     | CharField    | Hashed (bcrypt or Argon2)                |
| role         | CharField    | `Student`, `Staff`, `HOD`, `CampusAdmin` |
| department   | FK → Department | Nullable; `CampusAdmin` has none       |
| first_name   | CharField    |                                          |
| last_name    | CharField    |                                          |
| is_active    | BooleanField |                                          |
| date_joined  | DateTimeField|                                          |

#### 2.3.4 Grievance

| Field          | Type              | Notes                                               |
|----------------|-------------------|------------------------------------------------------|
| grievance_id   | UUIDField (PK)    | Unique identifier (shown to submitters)              |
| user           | FK → User         | Always stored, even for anonymous (not exposed)      |
| department     | FK → Department   | Routing target department (FR-23)                    |
| category       | FK → Category     | Classification only (not routing)                    |
| title          | CharField(200)    | Short summary                                         |
| description    | TextField         | 10–5000 chars (FR-09)                                |
| current_status | CharField         | See status transition table below                    |
| is_anonymous   | BooleanField      | Whether submitted anonymously                        |
| secret_code    | CharField         | For anonymous tracking (hashed)                      |
| is_second_time | BooleanField      | True if reopened at least once                       |
| created_at     | DateTimeField     | Auto-set                                              |
| updated_at     | DateTimeField     | Auto-set                                              |

Valid statuses: `Submitted`, `Spam`, `Under Review`, `Responded`, `Reopened`, `Escalated`, `Resolved`, `Closed`.

#### 2.3.5 AIAnalysis

| Field               | Type                | Notes                                 |
|---------------------|---------------------|---------------------------------------|
| id                  | AutoField           | PK                                    |
| grievance           | OneToOne → Grievance|                                       |
| spam_prediction     | BooleanField        | True = spam detected                  |
| confidence_score    | FloatField          | 0.0 – 1.0 (FR-18)                    |
| classification_reason| TextField          | Reason for classification (FR-18)     |
| sentiment           | JSONField (future)  | Reserved for future enhancement       |
| analysis_timestamp  | DateTimeField       | Auto-set                               |

#### 2.3.6 Response

| Field       | Type              | Notes                                    |
|-------------|-------------------|------------------------------------------|
| id          | AutoField         | PK                                       |
| grievance   | FK → Grievance    | Many responses per grievance             |
| responder   | FK → User         | Must be HOD of the routed department     |
| content     | TextField         | Response body                            |
| timestamp   | DateTimeField     | Auto-set                                 |

#### 2.3.7 StatusHistory

| Field         | Type              | Notes                        |
|---------------|-------------------|------------------------------|
| id            | AutoField         | PK                           |
| grievance     | FK → Grievance    |                              |
| previous_status| CharField        | Status before transition     |
| new_status    | CharField         | Status after transition      |
| timestamp     | DateTimeField     | Auto-set                     |
| action_by     | FK → User         | Who triggered the transition |
| remarks       | TextField         | Optional notes               |

#### 2.3.8 Attachment

| Field           | Type              | Notes                                |
|-----------------|-------------------|--------------------------------------|
| id              | AutoField         | PK                                   |
| grievance       | FK → Grievance    |                                      |
| file_name       | CharField         | Original filename                    |
| file_type       | CharField         | MIME type or extension               |
| file_path       | FileField/URLField| Storage location                     |
| upload_timestamp| DateTimeField     | Auto-set                              |

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
python manage.py makemigrations grievance
python manage.py migrate
python manage.py loaddata seed_data   # optional: seed departments & categories
```

---

## 3. Phase 2 — Authentication & RBAC

**SRS Reference:** §3.1 (FR-01–FR-06), §3.2 (Anonymity)

### 3.1 Backend

**Files affected:** `grievance/views.py`, `grievance/serializers.py`, `grievance/permissions.py`, `config/urls.py`, `config/settings.py`

#### 3.1.1 Install JWT auth

Add `djangorestframework-simplejwt` to `requirements.txt`. Configure in settings:

```python
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_THROTTLE_CLASSES': [...],
    'DEFAULT_THROTTLE_RATES': {...},
}
```

#### 3.1.2 Registration Endpoint

**`POST /api/auth/register/`**

- Accepts: `email`, `password`, `password2`, `first_name`, `last_name`, `role`, `department_id`
- Validates college-issued credentials (FR-01)
- Creates User with hashed password
- Returns JWT tokens

**FR-05 (Anonymous Tracking ID):** Not register-time — generated at grievance submission.

#### 3.1.3 Login Endpoint

**`POST /api/auth/login/`**

- Accepts: `email`, `password`
- Returns: `access_token`, `refresh_token`, `user` (id, role, name, department)

#### 3.1.4 Password Reset

**`POST /api/auth/password-reset/`** — sends email with reset link (FR-06)
**`POST /api/auth/password-reset/confirm/`** — accepts token + new password

#### 3.1.5 RBAC Permission Classes

Create `grievance/permissions.py`:

| Permission Class          | Allows                                  |
|---------------------------|-----------------------------------------|
| `IsStudent`               | Student role only                       |
| `IsStaff`                 | Staff role only                         |
| `IsHOD`                   | HOD role only                           |
| `IsCampusAdmin`           | Campus Admin role only                  |
| `IsHODOrAdmin`            | HOD or Campus Admin                     |
| `IsSubmitter`             | The user who created the grievance (object-level) |
| `IsAssignedDepartment`    | HOD/Staff whose department matches the grievance (object-level) |

### 3.2 Frontend

**Files:** `frontend/src/contexts/AuthContext.jsx`, `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/components/ProtectedRoute.jsx`

| Component       | Purpose                                              |
|-----------------|------------------------------------------------------|
| `AuthContext`   | Stores JWT in memory/localStorage, provides login/logout/signup methods |
| `ProtectedRoute`| Wraps routes; redirects to login if unauthenticated; checks role for RBAC |
| `Login`         | Email + password form; stores tokens on success       |
| `Register`      | Registration form with role/department select         |

### 3.3 Anonymous Submission Mechanism (FR-05)

- When `is_anonymous=True` on grievance creation:
  - `user_id` is stored internally (for audit trail) — never exposed through API
  - A random 8-character alphanumeric **secret code** is generated
  - The response returns `grievance_id` + `secret_code` as the tracking mechanism
  - Secret code is hashed before storage (bcrypt); only the plaintext is returned once at creation

---

## 4. Phase 3 — Grievance Submission & Rate Limiting

**SRS Reference:** §3.3 (FR-07–FR-13)

### 4.1 Backend

#### 4.1.1 Submit Grievance

**`POST /api/grievances/`**

Processing order per SRS §3.3:

```
Request → Authenticate → Rate Limit Check → Create Grievance (status=Submitted)
  → (if non-anonymous) Grievance created with user_id
  → (if anonymous) Grievance created with user_id + generated secret_code
  → Return grievance_id (+ secret_code if anonymous)
```

Fields accepted: `category_id`, `department_id`, `title`, `description`, `is_anonymous`, `attachments[]`

#### 4.1.2 Rate Limiting (FR-11, FR-12)

Implement as DRF custom throttle or middleware:

```python
class DailyGrievanceThrottle(BaseThrottle):
    def allow_request(self, request, view):
        today = timezone.now().date()
        count = Grievance.objects.filter(
            user=request.user,
            created_at__date=today
        ).count()
        if count >= 3:
            self.wait_time = ...  # time until midnight
            return False
        return True
```

Returns **429 Too Many Requests** with message: *"You have reached the daily limit of 3 submissions. Please try again after midnight."*

#### 4.1.3 File Attachments (FR-10)

- Upload via multipart form with the grievance creation
- Validate: max 3 files, max 5MB each
- Allowed types: PDF, DOC, DOCX, PNG, JPG, JPEG, XLS, XLSX (as appropriate for a college setting)
- Files stored in `MEDIA_ROOT/grievances/{grievance_id}/`

#### 4.1.4 Confirmation Response

Returns: `{ "grievance_id": "...", "secret_code": "...", "message": "Your grievance has been submitted." }`

### 4.2 Frontend

**`POST /api/categories/`** and **`GET /api/departments/`** endpoints to populate dropdowns.

**`SubmitGrievance.jsx`:**
- Category dropdown (required, from API)
- Department selector (pre-filled with user's department, but HOD/Staff can override)
- Title field
- Description textarea with character count (10–5000)
- Anonymous toggle checkbox
- File upload component (max 3, with progress bars)
- Submit button → confirmation screen with grievance ID and secret code

---

## 5. Phase 4 — AI Spam Filtering

**SRS Reference:** §3.4 (FR-14–FR-18), §4.6 NFR-26

### 5.1 Backend

#### 5.1.1 Spam Detection Service

Create `grievance/services/spam_detector.py` with a swappable interface:

```python
class SpamDetectorInterface:
    """Abstract interface for spam detection (NFR-26 swappability)."""
    def analyze(self, text: str) -> dict:
        """Return {spam_prediction: bool, confidence_score: float, reason: str}"""
        raise NotImplementedError

class KeywordSpamDetector(SpamDetectorInterface):
    """Initial implementation using keyword heuristics."""
    SPAM_KEYWORDS = ["buy now", "click here", "free money", ...]
    MIN_LENGTH = 10
    MAX_LENGTH = 5000

class MLSpamDetector(SpamDetectorInterface):
    """Future ML-based implementation using scikit-learn or HuggingFace."""
    # Load pre-trained model and tokenizer
```

The interface is dependency-injected so it can be swapped via settings without touching business logic (NFR-26).

#### 5.1.2 Integration into Submission Pipeline

After the grievance is created and rate-limit passes (before returning to user):

```
Grievance Created (status=Submitted)
  → AIAnalysis record created
  → SpamDetector.analyze(grievance.description)
  → if spam_prediction == True:
        grievance.current_status = "Spam"
        grievance.save()
        Create StatusHistory entry (Submitted → Spam)
  → if spam_prediction == False:
        Proceed to routing (Phase 5)
```

This happens **synchronously** for the initial keyword-based detector. For ML-based, consider async/celery.

#### 5.1.3 Spam Queue (FR-15, FR-16)

**`GET /api/admin/spam-queue/`** — Campus Admin only.
- Lists all grievances with `current_status = "Spam"`
- Shows: grievance ID, title, confidence score, reason, submission date

**`POST /api/admin/spam-queue/{id}/reinstate/`** — Campus Admin only.
- Sets status back to `Submitted`, updates AIAnalysis
- Logs StatusHistory: `Spam → Submitted`

#### 5.1.4 Appeal Mechanism (FR-17)

**`POST /api/grievances/{id}/appeal-spam/`** — Submitter only.
- Submitter can flag their spam-classified grievance for review
- Creates StatusHistory entry
- Campus Admin reviews and can reinstate

#### 5.1.5 Confidence Score (FR-18)

Returned as part of grievance detail response:
```json
{
  "grievance": {...},
  "ai_analysis": {
    "spam_prediction": true,
    "confidence_score": 0.87,
    "classification_reason": "Contains commercial advertisement language"
  }
}
```

---

## 6. Phase 5 — Grievance Routing

**SRS Reference:** §3.5 (FR-23–FR-27)

### 6.1 Backend

#### 6.1.1 Automatic Routing Service

Create `grievance/services/routing.py`:

```python
def route_grievance(grievance: Grievance):
    """
    1. If submitter selects a department during submission → use that
    2. Otherwise → use the submitter's own department
    3. Set grievance.department = selected_department
    4. Set grievance.current_status = 'Under Review'
    5. Log StatusHistory
    """
```

Per SRS §5 (Category vs. Routing): The category is for classification only. Routing is ALWAYS based on department, never on category.

#### 6.1.2 Department-Scoped Views

**`GET /api/grievances/`** — List grievances:
- **Student:** sees only their own grievances
- **HOD/Staff:** sees only grievances where `department_id = user.department_id`
- **Campus Admin:** sees all grievances

#### 6.1.3 Grievance Detail (FR-25)

**`GET /api/grievances/{id}/`** — Returns full details:
- Title, description, category, department, status, timestamps
- Attachments (list)
- Responses (list with timestamps + responder name)
- Status history (list with timestamps + previous/current status)
- AI Analysis (if exists)
- **For anonymous grievances:** submitter info is excluded from response

#### 6.1.4 Response Submission (FR-26, FR-27)

**`POST /api/grievances/{id}/respond/`** — HOD only.
- Validates requester is HOD of the grievance's department
- Creates `Response` record
- Changes status from `Under Review` → `Responded`
- Logs StatusHistory

---

## 7. Phase 6 — Response & Escalation Workflow

**SRS Reference:** §3.6 (FR-28–FR-32), §3.7 (FR-33–FR-38), §6 (Status Transitions)

### 7.1 Status Transition Enforcement

Implement a validator that enforces the status transition table (SRS §6):

| From         | Allowed To                             |
|--------------|----------------------------------------|
| Submitted    | Under Review, Spam                     |
| Spam         | Submitted (if reinstated), Closed      |
| Under Review | Responded, Escalated                   |
| Responded    | Resolved, Reopened, Escalated          |
| Reopened     | Responded, Escalated                   |
| Escalated    | Resolved                               |
| Resolved     | Closed                                 |
| Closed       | (none — terminal)                      |

### 7.2 Workflow Endpoints

| Endpoint (all `POST`)                           | From Status    | To Status   | Who             |
|--------------------------------------------------|----------------|-------------|-----------------|
| `/api/grievances/{id}/respond/`                  | Under Review, Reopened | Responded | HOD    |
| `/api/grievances/{id}/resolve/`                  | Responded      | Resolved    | Submitter       |
| `/api/grievances/{id}/reopen/`                   | Responded      | Reopened    | Submitter       |
| `/api/admin/escalated/{id}/resolve/`              | Escalated      | Resolved    | Campus Admin    |
| System auto (cron)                                | Under Review (≥7d) | Escalated | System        |
| System auto (cron)                                | Responded (≥7d)    | Escalated | System        |
| System auto (cron)                                | Reopened (≥7d)     | Escalated | System        |

### 7.3 Auto-Escalation Cron Job

`grievance/management/commands/escalate.py`:

- Runs every 24 hours (NFR-13)
- Finds grievances with:
  - `current_status IN ('Under Review', 'Responded', 'Reopened')`
  - `updated_at < now - timedelta(days=7)`
  - Not already escalated (checked by status not being "Escalated")
- For each: set `current_status = 'Escalated'`, log StatusHistory

Scheduled via system cron (or Celery beat if Celery is added later):

```bash
# Run daily at 2 AM
0 2 * * * cd /path/to/backend && python manage.py escalate
```

### 7.4 Campus Admin Resolution (SRS §3.6 special rule)

> *"Unlike the normal HOD-response path, the escalated path does not pass back through a submitter-satisfaction check before moving to Resolved and then Closed — Campus Admin resolution is treated as final."*

**`POST /api/admin/escalated/{id}/resolve/`:**
- Only Campus Admin can call this
- Creates a Response record (from Campus Admin)
- Sets status: `Escalated → Resolved → Closed` (auto-close, no submitter check)

### 7.5 Request Further Review (FR-37)

**`POST /api/grievances/{id}/reopen/`:**
- Submitter can only call when status is `Responded`
- Captures `remarks` (reason for dissatisfaction)
- Sets `is_second_time = True`
- Sets status `Responded → Reopened`
- Restarts 7-day timer
- HOD must submit another Response (`Reopened → Responded`)

---

## 8. Phase 7 — Dashboards, Search & Export

**SRS Reference:** §3.8 (FR-39–FR-43)

### 8.1 Dashboard Endpoints

| Endpoint                        | Role         | Data Returned                                              |
|---------------------------------|--------------|------------------------------------------------------------|
| `GET /api/dashboard/student/`   | Student      | User's own grievances: ID, title, status, category, created_at, days since last update |
| `GET /api/dashboard/department/`| HOD, Staff   | All department grievances: ID, title, status, submitter (unless anonymous), category, days open, escalation status |
| `GET /api/dashboard/admin/`     | Campus Admin | System-wide: counts by status, escalated queue summary, spam queue count, recent activity |

### 8.2 Search and Filter (FR-42)

Applied to all list/dashboard endpoints via query parameters:

```
GET /api/grievances/?search=exam&category=1&status=Under Review&date_from=2026-01-01&date_to=2026-12-31&ordering=-created_at
```

### 8.3 Export (FR-43)

**`GET /api/reports/export/?format=csv`** or **`format=pdf`**

- Campus Admin only
- Can be filtered by date range, department, category, status
- CSV: standard CSV with all grievance fields (excluding anonymous submitter identity)
- PDF: formatted report with summary statistics + grievance list

---

## 9. Phase 8 — Frontend Implementation

**SRS Reference:** §3.8, §4.3

### 9.1 Route Map

```
/                          → Public home / landing
/login                     → Login page
/register                  → Registration page
/password-reset            → Password reset
/grievances/new            → Submit grievance (authenticated)
/grievances/track          → Track (anonymous: ID + secret code)
/grievances/:id            → Grievance detail + responses
/dashboard/student         → Student dashboard
/dashboard/department      → Department dashboard (HOD/Staff)
/dashboard/admin           → Campus Admin dashboard
/admin/spam-queue          → Spam queue management
/reports                   → Export reports (Campus Admin)
```

### 9.2 Component Tree

```
App
├── AuthContext (Provider)
├── Navbar (role-based links)
├── Routes
│   ├── ProtectedRoute(role='Student')
│   │   ├── StudentDashboard
│   │   └── SubmitGrievance
│   ├── ProtectedRoute(role=['HOD', 'Staff'])
│   │   ├── DepartmentDashboard
│   │   └── GrievanceDetail (with ResponseForm modal)
│   ├── ProtectedRoute(role='CampusAdmin')
│   │   ├── AdminDashboard
│   │   ├── SpamQueueManager
│   │   └── ExportReports
│   └── Public
│       ├── Login
│       ├── Register
│       ├── PasswordReset
│       └── TrackGrievance
└── Shared Components
    ├── StatusBadge (color-coded: Submitted=blue, Spam=red, Responded=green, etc.)
    ├── GrievanceCard (summary card used across dashboards)
    ├── SearchFilter (search input + filters)
    ├── FileUpload (drag-and-drop, max 3, 5MB limit)
    ├── ResponseView (thread of responses with timestamps)
    └── SpamAppeal (appeal form for wrongfully flagged)
```

### 9.3 Theme / Visual Design

- Clean, accessible design consistent with a college/university web app
- Status badges with clear color coding:
  - `Submitted` → Blue
  - `Spam` → Red
  - `Under Review` → Amber
  - `Responded` → Green (informational)
  - `Reopened` → Purple
  - `Escalated` → Orange (with urgency indicator)
  - `Resolved` → Green
  - `Closed` → Gray
- Responsive layout (works on desktop + tablet)
- Contextual help text on key pages (FR-16)

### 9.4 Key Implementation Details

| Feature | Implementation Notes |
|---------|---------------------|
| Anonymous tracking | Separate page with 2-field form (grievance ID + secret code); no login required |
| Rate limit UX | Show remaining submissions today on the submit page; toast error on 429 |
| File uploads | Show file list with remove button; show combined size; validate client-side before upload |
| Response flow | HOD sees "Respond" button on Under Review grievances; modal with text area |
| Reopen flow | Submitter sees "Further Review" button on Responded grievances; modal for reason |
| Spam appeal | If grievance is Spam, submitter sees "Appeal" button with explanation text |
| Search/filter | Debounced search input; dropdowns for category/status; date range picker |
| Export | "Export CSV" / "Export PDF" buttons on admin dashboard; filtered by current view |

---

## 10. Phase 9 — Non-Functional Requirements

**SRS Reference:** §4.1–§4.6

### 10.1 Security (NFR-01 to NFR-08)

| NFR | Requirement | Implementation |
|-----|-------------|----------------|
| NFR-01 | Password hashing | Set `PASSWORD_HASHERS` to use Argon2 or bcrypt |
| NFR-02 | HTTPS | Enforce in production (SECURE_SSL_REDIRECT, HSTS) |
| NFR-03 | RBAC server-side | DRF permission classes — never rely on frontend-only checks |
| NFR-04 | Anonymous data privacy | Exclude `user_id` from serializers when `is_anonymous=True` |
| NFR-05 | SQL injection prevention | Django ORM (parameterized queries by default) |
| NFR-06 | XSS protection | Django template auto-escaping; React's JSX escaping; CSP headers |
| NFR-07 | CSRF protection | DRF enforces CSRF for session auth; JWT is stateless (no CSRF needed) |
| NFR-08 | Session timeout | JWT access token: 30 min expiry; refresh token: 24h |

### 10.2 Performance (NFR-09 to NFR-13)

| NFR | Target | Approach |
|-----|--------|----------|
| NFR-09 | Submission < 3s | Optimize with `select_related`; async spam check via Celery if needed |
| NFR-10 | Dashboard < 2s | Indexed queries; pagination (20 per page) |
| NFR-11 | Search < 3s | Database indexes on `current_status`, `category`, `created_at`; full-text search with PostgreSQL |
| NFR-12 | 500 concurrent users | Connection pooling (PgBouncer); static files via CDN; gunicorn with multiple workers |
| NFR-13 | Escalation every 24h | Cron job or Celery Beat scheduled task |

### 10.3 Usability (NFR-14 to NFR-17)

- NFR-14: Follow university web app conventions — familiar layout, clear call-to-action buttons
- NFR-15: Error messages in plain language with suggested fixes (e.g., "Description must be at least 10 characters")
- NFR-16: Help text on submission form, FAQ page, tooltips on status badges
- NFR-17: Single design system (consistent colors, spacing, typography, button styles)

### 10.4 Reliability (NFR-18 to NFR-21)

| NFR | Requirement | Implementation |
|-----|-------------|----------------|
| NFR-18 | 99% uptime (8 AM–6 PM weekdays) | Health check endpoint; process monitoring (supervisor/systemd) |
| NFR-19 | No data loss on errors | Database transactions; grievance creation wrapped in `atomic()` |
| NFR-20 | Daily backups | `pg_dump` via cron; stored securely with 4h RTO |
| NFR-21 | Error logging | Structured logging (JSON) to file; log rotation; enough context to reproduce |

### 10.5 Maintainability (NFR-22 to NFR-25)

- NFR-22: Python — PEP 8 (Black formatter); JS — ESLint with Prettier
- NFR-23: Docstrings on all models, views, services; README for onboarding
- NFR-24: Modular architecture — services layer separates business logic from views; AI interface for swappable backends
- NFR-25: Git with conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`)

### 10.6 Scalability (NFR-26 to NFR-28)

- NFR-26: AI module via interface (Strategy pattern) — swap implementation without touching views
- NFR-27: Indexed fields: `created_at`, `current_status`, `category_id`, `department_id`, `user_id`; partitioning by date if needed
- NFR-28: Stateless Django app behind load balancer; shared PostgreSQL; read replicas for dashboards/reports

---

## 11. Phase 10 — Production Readiness

**SRS Reference:** §9 (Constraints and Assumptions)

### 11.1 Deployment Checklist

| Item | Details |
|------|---------|
| Web server | gunicorn + nginx (reverse proxy, static files) |
| Database | PostgreSQL 15+ (with PgBouncer for connection pooling) |
| SSL | Let's Encrypt via Certbot; forced HTTPS redirect |
| Environment | `.env` for secrets; `DEBUG=False` in production |
| Docker | `docker-compose.yml` for local dev with PostgreSQL + web app |
| File storage | Local `MEDIA_ROOT` for dev; S3-compatible for production |
| Logging | JSON logs to file; centralized with rotation |
| Monitoring | Health check endpoint (`/api/status/`); uptime monitoring |

### 11.2 Docker Compose Setup

```yaml
services:
  db:
    image: postgres:15
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: gms_db
      POSTGRES_USER: gms_user
      POSTGRES_PASSWORD: gms_password
  web:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [db]
    environment:
      DB_HOST: db
      USE_SQLITE: "False"
    env_file: ./backend/.env
volumes:
  pgdata:
```

### 11.3 Backend `.env` Template

```
SECRET_KEY=your-secret-key-here
DEBUG=True
USE_SQLITE=True
DB_NAME=gms_db
DB_USER=gms_user
DB_PASSWORD=gms_password
DB_HOST=localhost
DB_PORT=5432
EMAIL_HOST=smtp.college.edu.np
EMAIL_PORT=587
EMAIL_HOST_USER=noreply@college.edu.np
EMAIL_HOST_PASSWORD=email-password
```

---

## 12. API Endpoint Reference

### 12.1 Authentication

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/api/auth/register/` | No | — | User registration (FR-01) |
| POST | `/api/auth/login/` | No | — | Login, returns JWT (FR-02) |
| POST | `/api/auth/token/refresh/` | No | — | Refresh JWT |
| POST | `/api/auth/password-reset/` | No | — | Request password reset (FR-06) |
| POST | `/api/auth/password-reset/confirm/` | No | — | Confirm password reset |
| GET  | `/api/auth/me/` | Yes | Any | Current user profile |

### 12.2 Grievances

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET    | `/api/grievances/` | Yes | Any (scoped) | List grievances (FR-24) |
| POST   | `/api/grievances/` | Yes | Student/Staff | Submit grievance (FR-07) |
| GET    | `/api/grievances/{id}/` | Yes | Any (scoped) | Grievance detail (FR-25) |
| POST   | `/api/grievances/{id}/respond/` | Yes | HOD | Submit official response (FR-26) |
| POST   | `/api/grievances/{id}/resolve/` | Yes | Submitter | Mark as resolved (FR-36) |
| POST   | `/api/grievances/{id}/reopen/` | Yes | Submitter | Request further review (FR-37) |
| POST   | `/api/grievances/{id}/appeal-spam/` | Yes | Submitter | Appeal spam decision (FR-17) |

### 12.3 Tracking (Anonymous)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST   | `/api/grievances/track/` | No | Track by grievance_id + secret_code (FR-38) |

### 12.4 Admin

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET    | `/api/admin/spam-queue/` | Yes | Campus Admin | List spam queue (FR-15) |
| POST   | `/api/admin/spam-queue/{id}/reinstate/` | Yes | Campus Admin | Reinstate from spam (FR-16) |
| POST   | `/api/admin/escalated/{id}/resolve/` | Yes | Campus Admin | Resolve escalated (FR-31) |

### 12.5 Dashboards

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET    | `/api/dashboard/student/` | Yes | Student | Student dashboard (FR-39) |
| GET    | `/api/dashboard/department/` | Yes | HOD, Staff | Dept. dashboard (FR-40) |
| GET    | `/api/dashboard/admin/` | Yes | Campus Admin | Admin dashboard (FR-41) |

### 12.6 Reference Data & Reports

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET    | `/api/categories/` | Yes | List grievance categories (FR-08) |
| GET    | `/api/departments/` | Yes | List departments |
| GET    | `/api/reports/export/` | Campus Admin | Export CSV/PDF (FR-43) |
| GET    | `/api/status/` | No | Health check (exists) |

---

## 13. Task Breakdown for 4-Person Team

Based on the SRS authoring team (Group BCT AB: Alex, Darpan, Avinash, Abhishek).

### Recommended Partitioning

**Person A — Backend Core (Models + Auth + Submission)**
- [ ] Set up custom User model with roles
- [ ] Create all 8 models (Department, Category, User, Grievance, AIAnalysis, Response, StatusHistory, Attachment)
- [ ] Run migrations, seed reference data
- [ ] Registration + Login + Password Reset endpoints
- [ ] JWT authentication configuration
- [ ] RBAC permission classes
- [ ] Grievance submission endpoint with rate limiting
- [ ] File upload handling

**Person B — Backend Workflow (Spam + Routing + Response + Escalation)**
- [ ] AI spam detection service (interface + keyword implementation)
- [ ] Spam queue + reinstate endpoints
- [ ] Appeal mechanism
- [ ] Automatic routing service
- [ ] Department-scoped views
- [ ] Response submission (HOD)
- [ ] Resolve / Reopen endpoints
- [ ] Auto-escalation cron job
- [ ] Campus Admin escalation resolution
- [ ] Status transition validation
- [ ] StatusHistory auto-logging (signals or model save override)
- [ ] Dashboard endpoints (student, department, admin)
- [ ] Search + filter
- [ ] Export (CSV/PDF)

**Person C — Frontend (All UI)**
- [ ] Auth context + protected routing
- [ ] Login, Register, Password Reset pages
- [ ] Grievance submission form (with file upload + anonymous toggle)
- [ ] Anonymous tracking page
- [ ] Student dashboard
- [ ] Department dashboard (HOD/Staff views + response modal)
- [ ] Campus Admin dashboard (spam queue + escalated + export)
- [ ] Grievance detail page with full history
- [ ] Status badges, search/filter component
- [ ] Error handling + loading states everywhere

**Person D — Cross-Cutting (Infrastructure + Integration + Testing)**
- [ ] Frontend-backend integration testing (all flows)
- [ ] Docker Compose (PostgreSQL + web)
- [ ] `.env` configuration and secrets management
- [ ] Media file serving configuration
- [ ] Security hardening (CSP headers, HTTPS setup, password hashers)
- [ ] Logging configuration
- [ ] Backup script setup
- [ ] API endpoint testing (DRF test cases or Postman collection)
- [ ] CI/CD pipeline (GitHub Actions for lint + test)
- [ ] Documentation (README, deployment guide, API reference)

### Suggested Build Order (Backend-First)

| Sprint | Duration | Focus |
|--------|----------|-------|
| Sprint 1 | Week 1 | Phase 2 — Auth & RBAC (JWT, register, login, permissions) |
| Sprint 2 | Week 2 | Phase 3 — Grievance submission, rate limiting, file uploads |
| Sprint 3 | Week 3 | Phase 4 — AI spam detection, spam queue, appeal |
| Sprint 4 | Week 4 | Phase 5 — Automatic routing, department-scoped views |
| Sprint 5 | Week 5 | Phase 6 — Response, escalation workflow, cron job |
| Sprint 6 | Week 6 | Phase 7 — Dashboards, search, export (CSV/PDF) |
| Sprint 7 | Week 7 | Phase 8 — All frontend UI (after backend is complete) |
| Sprint 8 | Week 8 | Phase 9–10 — NFRs, production readiness, deployment |

---

## 14. Appendix — Status Transition Rules

### 14.1 Complete Transition Table

```
┌────────────┐     ┌──────────┐
│  Submitted │────▶│ Under    │
│            │     │ Review   │
└─────┬──────┘     └────┬─────┘
      │                 │
      ▼                 ▼
  ┌────────┐      ┌──────────┐
  │  Spam  │      │Escalated │ (auto after 7 days)
  └───┬────┘      └────┬─────┘
      │                 │
      ▼                 ▼
  ┌──────────┐     ┌──────────┐
  │Submitted │     │ Resolved │
  │ (appeal) │     └────┬─────┘
  └──────────┘          │
                        ▼
                   ┌──────────┐
                   │  Closed  │ (terminal)
                   └──────────┘

Under Review ───▶ Responded (HOD responds)
Responded ──────▶ Resolved (submitter satisfied)
Responded ──────▶ Reopened (submitter dissatisfied)
Reopened ───────▶ Responded (HOD responds again)
Reopened ───────▶ Escalated (auto after 7 days again)
Escalated ──────▶ Resolved (Campus Admin resolves — final)
Spam ───────────▶ Submitted (Campus Admin reinstates)
Spam ───────────▶ Closed (Campus Admin confirms spam)
```

### 14.2 Visualization by User Role

**Submitter triggers:**
```
Submit Grievance           → Submitted
Mark as Resolved           → Responded → Resolved
Request Further Review     → Responded → Reopened
Appeal Spam Decision       → Spam → Submitted (pending admin approval)
```

**HOD triggers:**
```
Submit Official Response   → Under Review → Responded
                            → Reopened → Responded
```

**Campus Admin triggers:**
```
Reinstate from Spam        → Spam → Submitted
Confirm Spam               → Spam → Closed
Resolve Escalated           → Escalated → Resolved → Closed (auto)
```

**System triggers (auto):**
```
After 7 days no response   → Under Review → Escalated
                            → Responded → Escalated (if second-time unanswered for 7d)
                            → Reopened → Escalated
```