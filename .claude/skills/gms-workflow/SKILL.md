---
name: gms-workflow
description: >
  Grievance Management System (GMS) — Build phases from the implementation plan.
  THIS IS THE ONLY SKILL YOU NEED. Trigger on ANY request to build features:
  "start/build/implement Phase N", "build X", "implement Y", "create Z",
  "start working on", "begin Phase N", "do Phase N".
  Also triggers on: "commit and push", "wrap up", "I'm done", "finish",
  "update progress", "what's next", "what's done".
  When triggered, handles EVERYTHING: git branch → write ALL code for that
  phase → commit → push → update progress tracker.
---

# GMS Workflow — Phase-by-Phase Builder

You build the Grievance Management System **one phase at a time** following `implementation-plan.md`. The build order is **backend-first**:

```
Phases 1-2: ✅ Already done (Data Models + Auth/RBAC)
                    ↓
Phase 3:  Backend — Grievance Submission & Rate Limiting
Phase 4:  Backend — AI Spam Filtering
Phase 5:  Backend — Grievance Routing
Phase 6:  Backend — Response & Escalation Workflow
Phase 7:  Backend — Dashboards, Search & Export
                    ↓
Phase 8:  FRONTEND — ALL UI (after backend is complete)
                    ↓
Phases 9-10: Production Readiness
```

When the user says "start Phase 3" (or any phase), execute the **full lifecycle**:

```
STEP 1 — Git Setup: pull main → create feat/3-xxx branch → switch
STEP 2 — Write ALL code for that phase (implementation + tests)
STEP 3 — Run all tests and verify they pass
STEP 4 — Commit & Push: git add → commit (show user message) → push
STEP 5 — Update Progress Tracker → tell user what's next
```

---

## STEP 1 — Git Setup

```bash
git status --porcelain                          # check for dirty files
git checkout main && git pull origin main       # pull latest
git checkout -b feat/<phase>-<description>      # create branch
```

If dirty files exist: ask "Stash or commit first?"

---

## STEP 2 — Build Each Phase

For each phase below, read `implementation-plan.md` for the full specs. Write **all** files listed, using the project's existing code as reference for patterns and conventions. Never hardcode — write proper, production-quality code.

### Project Conventions to Follow

**Backend (Django REST Framework):**
- Use DRF generic class-based views (`CreateAPIView`, `ListAPIView`, `ListCreateAPIView`, `RetrieveAPIView`) for model-backed endpoints. Use `@api_view` decorator only for simple action endpoints.
- ModelSerializers with explicit `read_only_fields` and `write_only=True` where appropriate.
- Every view has explicit `permission_classes`. Role hierarchy: Student < Staff < HOD < CampusAdmin.
- Scoping: Students see their own data, HOD/Staff see their department's, CampusAdmin sees all.
- Every status change creates a `StatusHistory` entry. Use a Django `@receiver(pre_save)` signal.
- When `is_anonymous=True`, never expose user info in responses.
- Error responses follow: `{"error": "human message", "detail": {...}}`.
- Pagination: 20 per page on all list views. Use `select_related`/`prefetch_related`.
- Every class and method has a docstring.
- Reference the implementation plan spec sections while building.

**Frontend (React + Vite):**
- Use `react-router-dom` for routing, Axios (already installed) for API calls.
- Auth state in `AuthContext` (login/logout/register, JWT in localStorage with auto-refresh interceptor).
- `ProtectedRoute` component wrapping guarded routes, taking `allowedRoles` prop.
- Every data-fetching page has 4 states: loading, empty, error (with retry), success.
- Status badge colors: SUBMITTED=blue(#3B82F6), SPAM=red(#EF4444), UNDER_REVIEW=amber(#F59E0B), RESPONDED=teal(#10B981), REOPENED=purple(#8B5CF6), ESCALATED=orange(#F97316), RESOLVED=green(#22C55E), CLOSED=gray(#6B7280).
- Anonymous grievance: never show submitter name in UI.
- Role-aware: buttons/actions only shown for permitted roles.

### Testing Conventions

**Every phase must include test files** in `backend/test/<phase-name>/test.py`.

Test file structure:
```python
import sys, os
from pathlib import Path
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
os.environ.setdefault('USE_SQLITE', 'True')
import django
django.setup()

from django.core.management import call_command

def setup_db():
    """Ensure all database tables exist (safe to call multiple times)."""
    call_command('migrate', verbosity=0, interactive=False, run_syncdb=True)
```

Test file conventions:
- Use plain `assert` statements (no unittest.TestCase needed — simpler and self-contained)
- Each test is a standalone function `test_<description>()`
- Call `setup_db()` inside `run()` before any tests execute
- `setup_db()` is NOT needed for pure-Python tests (no DB queries)
- Use `rest_framework.test.APIClient` for API endpoint tests
- Every test prints `  PASS <name>` on success or raises an `AssertionError`
- Tests run via: `cd backend && python test/<phase-name>/test.py`
- Wipe only test-created data in each test (avoid using transactions — SQLite may not support them across raw connections)

Runner template at the bottom of every test file:
```python
def run():
    setup_db()  # omit if pure-Python with no DB
    tests = [("label", test_fn), ...]
    passed = failed = 0
    for label, fn in tests:
        try:
            fn(); passed += 1
        except AssertionError as e:
            print(f"  FAIL {label}: {e}"); failed += 1
        except Exception as e:
            print(f"  ERROR {label}: {e}"); failed += 1
    print(f"Results: {passed} passed, {failed} failed, {passed + failed} total")
    return failed == 0

if __name__ == '__main__':
    success = run()
    sys.exit(0 if success else 1)
```

---

### Phase 3 — Grievance Submission & Rate Limiting

**Files to create:**
- `backend/grievances/serializers.py` — All serializers for grievances app
- `backend/grievances/throttles.py` — Custom `DailyGrievanceThrottle` (max 3/user/day, 429 after midnight message)
- `backend/grievances/views.py` — All grievance views
- `backend/grievances/urls.py` — All grievance routes

**Files to modify:**
- `backend/config/urls.py` — Wire `path('api/', include('grievances.urls'))`

**Endpoints to build:**
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/grievances/` | Yes | List (scoped by role) |
| POST | `/api/grievances/` | Yes | Create with rate limit + file attachments |
| GET | `/api/grievances/{id}/` | Yes | Detail with responses + history + AI analysis |
| POST | `/api/grievances/track/` | No | Anonymous tracking by ID + secret code |
| GET | `/api/categories/` | No | List categories (for dropdown) |
| GET | `/api/departments/` | No | List departments (for dropdown) |

**Key business rules to implement:**
- Rate limit: count `Grievance.objects.filter(user=request.user, created_at__date=today)`. If >= 3, return 429.
- Anonymous: generate 8-char alphanumeric code, hash with Django's `make_password()`, return plaintext ONCE in response. Store hashed.
- File attachments: max 3 files, max 5MB each, allowed types (PDF, DOC, DOCX, PNG, JPG, XLS, XLSX). Use MultiPartParser.
- Description validation: 10-5000 chars.
- Create `StatusHistory` entry on submission.

---

### Phase 4 — AI Spam Filtering

**Files to create:**
- `backend/grievances/services/__init__.py`
- `backend/grievances/services/spam_detector.py`

**Files to modify:**
- `backend/grievances/views.py` — Add spam queue views, integrate detection into submission flow
- `backend/grievances/urls.py` — Add spam routes

**Endpoints to build:**
| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| GET | `/api/admin/spam-queue/` | Yes | Campus Admin | List SPAM grievances |
| POST | `/api/admin/spam-queue/{id}/reinstate/` | Yes | Campus Admin | SPAM → SUBMITTED |
| POST | `/api/grievances/{id}/appeal-spam/` | Yes | Submitter | Flag spam for review |

**Key business rules:**
- Strategy pattern: `SpamDetectorInterface` with `analyze(text) → {spam_prediction, confidence_score, reason}`
- `KeywordSpamDetector`: check for spam keywords, length < 10 or > 5000, score calculation
- Integrate into submission: after grievance created, run detector. If spam → set status=SPAM, log StatusHistory, create AIAnalysis record. If not spam → proceed to routing.
- `reinstate_spam`: validates Campus Admin role, transitions SPAM → SUBMITTED
- `appeal_spam`: validates submitter owns grievance, just logs StatusHistory with remarks (pending admin review)

---

### Phase 5 — Grievance Routing

**Files to create:**
- `backend/grievances/services/routing.py` — `route_grievance()` function

**Files to modify:**
- `backend/grievances/views.py` — Call routing after spam check passes

**Key business rules:**
- Department is selected at submission time (or defaults to submitter's department)
- After spam check passes (or if no spam detection): set status = UNDER_REVIEW, log StatusHistory
- Category is classification-only — never used for routing
- List/detail view scoping is already implemented in Phase 3

**Tests to create** — `backend/test/5-grievance-routing/test.py`:

| # | Test | What it verifies |
|---|------|------------------|
| 1 | `test_route_to_selected_department` | Grievance routed to submitter's selected department |
| 2 | `test_route_defaults_to_user_department` | No selected dept -> defaults to submitter's dept |
| 3 | `test_status_changes_to_under_review` | After routing, status becomes UNDER_REVIEW |
| 4 | `test_status_history_logged_on_routing` | StatusHistory entry created when routed |
| 5 | `test_category_never_affects_routing` | Department routing is independent of category |
| 6 | `test_hod_sees_department_grievances` | HOD sees only their department's grievances |
| 7 | `test_hod_cannot_see_other_department` | HOD cannot access grievances from other depts |

Run via: `cd backend && python test/5-grievance-routing/test.py`

---

### Phase 6 — Response & Escalation Workflow

**Files to create:**
- `backend/grievances/signals.py` — `@receiver(pre_save)` to auto-log StatusHistory
- `backend/grievances/management/commands/escalate.py` — Cron job for auto-escalation

**Files to modify:**
- `backend/grievances/apps.py` — Import signals in `ready()`
- `backend/grievances/views.py` — Add workflow endpoints
- `backend/grievances/urls.py` — Add workflow routes

**Endpoints to build:**
| Method | Endpoint | Auth | Role | Transition |
|--------|----------|------|------|-----------|
| POST | `/api/grievances/{id}/respond/` | Yes | HOD | UNDER_REVIEW/REOPENED → RESPONDED |
| POST | `/api/grievances/{id}/resolve/` | Yes | Submitter | RESPONDED → RESOLVED |
| POST | `/api/grievances/{id}/reopen/` | Yes | Submitter | RESPONDED → REOPENED |
| POST | `/api/admin/escalated/{id}/resolve/` | Yes | Campus Admin | ESCALATED → RESOLVED |

**Key business rules:**
- HOD respond: validates HOD belongs to grievance's department, only for UNDER_REVIEW or REOPENED status. Creates Response record. Sets `_action_by` before save so signal picks it up.
- Resolve: only submitter can resolve their own grievance, only when status is RESPONDED.
- Reopen: only submitter, only RESPONDED, sets `is_reopened=True`.
- Admin resolve escalated: Campus Admin only, ESCALATED → RESOLVED (no submitter check — final).
- Signal: on `pre_save`, compare old vs new status. If changed, create StatusHistory. Track user via `instance._action_by`.
- Escalation cron: find grievances with status in (UNDER_REVIEW, RESPONDED, REOPENED) where `updated_at < now - 7 days`. Set ESCALATED, log history.

**Tests to create** — `backend/test/6-response--escalation-workflow/test.py`:

| # | Test | What it verifies |
|---|------|------------------|
| 1 | `test_hod_respond_under_review` | HOD can respond when status is UNDER_REVIEW |
| 2 | `test_hod_respond_reopened` | HOD can respond when status is REOPENED |
| 3 | `test_respond_changes_status_to_responded` | After response, status becomes RESPONDED |
| 4 | `test_non_hod_cannot_respond` | Staff/Student cannot use respond endpoint |
| 5 | `test_submitter_resolve` | Submitter can resolve when status is RESPONDED |
| 6 | `test_non_submitter_cannot_resolve` | Other users cannot resolve |
| 7 | `test_submitter_reopen` | Submitter can reopen when status is RESPONDED |
| 8 | `test_resolve_changes_status` | After resolve, status becomes RESOLVED |
| 9 | `test_reopen_sets_is_reopened_flag` | Reopen sets is_reopened=True |
| 10 | `test_admin_resolve_escalated` | Campus Admin can resolve ESCALATED grievances |
| 11 | `test_escalate_command_finds_stale` | Cron finds grievances older than 7 days |
| 12 | `test_status_history_logged_on_transition` | Signal creates StatusHistory on every transition |
| 13 | `test_invalid_transition_blocked` | Invalid transition (e.g. SUBMITTED to RESOLVED) is rejected |

Run via: `cd backend && python test/6-response--escalation-workflow/test.py`

### Phase 7 — Dashboards, Search & Export

**Files to modify:**
- `backend/grievances/views.py` — Add dashboard views, search/filter backends, export
- `backend/grievances/urls.py` — Add dashboard routes

**Endpoints to build:**
| Method | Endpoint | Auth | Role | Purpose |
|--------|----------|------|------|---------|
| GET | `/api/dashboard/student/` | Yes | Student | Own grievances with counts |
| GET | `/api/dashboard/department/` | Yes | HOD, Staff | Department grievances with tabs |
| GET | `/api/dashboard/admin/` | Yes | Campus Admin | System-wide stats + recent activity |
| GET | `/api/reports/export/?format=csv\|pdf` | Yes | Campus Admin | Filtered export |

**Key business rules:**
- Student dashboard: filter by user, return count + list with days_since_update
- Department dashboard: filter by user.department, return count + list
- Admin dashboard: aggregate counts by status, escalated count, spam count, recent 10 items
- Search/filter: add DRF's `SearchFilter` and `OrderingFilter` backends to list views. Support query params: `search`, `category`, `status`, `date_from`, `date_to`, `ordering`.
- Export: CSV with all grievance fields (excluding anonymous identity). Filterable by department, status, date range.

**Tests to create** — `backend/test/7-dashboards--search--export/test.py`:

| # | Test | What it verifies |
|---|------|------------------|
| 1 | `test_student_dashboard` | Student dashboard returns own grievances with counts |
| 2 | `test_department_dashboard` | HOD sees department grievances with tabs |
| 3 | `test_admin_dashboard` | Campus Admin sees system-wide stats |
| 4 | `test_search_by_title` | Search query filters grievances by title |
| 5 | `test_filter_by_status` | Status query param filters correctly |
| 6 | `test_filter_by_category` | Category query param filters correctly |
| 7 | `test_filter_by_date_range` | date_from/date_to filters correctly |
| 8 | `test_ordering` | Ordering param sorts results |
| 9 | `test_export_csv` | CSV export returns correct headers and data |
| 10 | `test_export_filters` | Export respects department/status/date filters |
| 11 | `test_export_excludes_anonymous_identity` | Anonymous submitter name excluded from export |
| 12 | `test_non_admin_cannot_export` | Only Campus Admin can access export |

Run via: `cd backend && python test/7-dashboards--search--export/test.py`

---

### Phase 8 — Frontend (Complete UI)

**Build AFTER all backend phases.** Create every frontend file in one go.

**Install:** `cd frontend && npm install react-router-dom`

**Files to create:**

Foundation:
- `frontend/src/services/api.js` — Axios instance with base URL, JWT interceptor, auto-refresh on 401
- `frontend/src/contexts/AuthContext.jsx` — AuthProvider with user state, login/logout/register, localStorage token persistence

Shared components:
- `frontend/src/components/ProtectedRoute.jsx` — Route guard checking auth + allowedRoles
- `frontend/src/components/StatusBadge.jsx` — Color-coded status span
- `frontend/src/components/Navbar.jsx` — Role-aware navigation links
- `frontend/src/components/GrievanceCard.jsx` — Summary card (clickable, links to detail)
- `frontend/src/components/SearchFilter.jsx` — Debounced search + dropdowns + date range
- `frontend/src/components/ResponseView.jsx` — Thread of responses
- `frontend/src/components/SpamAppeal.jsx` — Appeal form for spam-classified grievances
- `frontend/src/components/FileUpload.jsx` — Drag-drop with validation

Pages:
- `frontend/src/pages/Login.jsx` — Username/password, redirect by role
- `frontend/src/pages/Register.jsx` — Multi-field form with department dropdown
- `frontend/src/pages/PasswordReset.jsx` — 2-step: email → token + new password
- `frontend/src/pages/SubmitGrievance.jsx` — Full form with category/dept dropdowns, file upload, anonymous toggle, confirmation with secret code
- `frontend/src/pages/TrackGrievance.jsx` — Public page, ID + secret code form
- `frontend/src/pages/GrievanceDetail.jsx` — Full detail with role-based action buttons (resolve, reopen, respond, reinstate, appeal, resolve escalated)
- `frontend/src/pages/StudentDashboard.jsx` — My grievances list with search/filter
- `frontend/src/pages/DepartmentDashboard.jsx` — Tabbed (Open/Resolved/Escalated/All) grievance list
- `frontend/src/pages/AdminDashboard.jsx` — Stats cards + quick actions
- `frontend/src/pages/SpamQueueManager.jsx` — List spam + reinstate buttons

**Files to modify:**
- `frontend/src/App.jsx` — Replace with BrowserRouter, AuthProvider, Navbar, all Routes

**Route map (App.jsx):**
```
/                        → Landing
/login                   → Login
/register                → Register
/password-reset          → PasswordReset
/grievances/new          → SubmitGrievance (STUDENT, STAFF)
/grievances/track        → TrackGrievance (public)
/grievances/:id          → GrievanceDetail (authenticated)
/dashboard/student       → StudentDashboard (STUDENT)
/dashboard/department    → DepartmentDashboard (HOD, STAFF)
/dashboard/admin         → AdminDashboard (CAMPUS_ADMIN)
/admin/spam-queue        → SpamQueueManager (CAMPUS_ADMIN)
```

Key states every page needs: loading, empty, error (with retry), success.

---

### Phase 9 — Non-Functional Requirements

**Files to modify:**
- `backend/config/settings.py` — Add Argon2 password hashers, logging configuration

**Files to create:**
- `backend/logs/.gitkeep`

**Tasks:**
- Set `PASSWORD_HASHERS` with Argon2 first, then BCrypt, then PBKDF2 fallback
- Add structured logging (ERROR level to file with rotation)
- Add `db_index=True` on `current_status`, `category`, `department`, `created_at` in Grievance model if not already there

---

### Phase 10 — Production Readiness

**Files to create:**
- `docker-compose.yml` (project root) — PostgreSQL + web service
- `.github/workflows/ci.yml` — GitHub Actions: backend lint + test (PostgreSQL service), frontend lint + build

**Tasks:**
- Docker Compose: PostgreSQL 15, web service with env vars from `.env`, volume for pgdata
- CI pipeline: backend flake8 + pytest (with PostgreSQL service), frontend npm ci + lint + build

---

## STEP 3 — Commit & Push

```bash
git add -A
```

Show the user a conventional commit message and ask "OK?" before committing:

```
<type>(<scope>): implement Phase N — <title>

- <what was built>
- <what was built>
```

Types: `feat`, `fix`, `refactor`, `db`, `test`, `docs`, `chore`  
Scopes: `backend`, `frontend`, `api`, `models`, `auth`, `services`, `ci`

```bash
git commit -m "<message>"
git log -1 --format='%B' | sed '/^Co-Authored-By:/d' | git commit --amend --file=-
git push origin <branch-name>
```
git push origin <branch-name>
```

---

## STEP 4 — Update Progress Tracker

Read `backend/Progress Tracker.md`. Update all completed components from ❌ to ✅. Update the "Next Step" section.

Print a summary:
```
📊 Phase N — Done
   Files created: ...
   Endpoints built: ...
   Branch pushed: feat/N-xxx

Next: Phase N+1 — <name>
       Say "Start Phase N+1" to begin!
```
