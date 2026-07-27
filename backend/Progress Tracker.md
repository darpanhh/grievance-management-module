# Grievance Management System — Progress Tracker

---

## ✅ Completed

### Phase 1: Data Models & Database

| Component | Status |
|-----------|--------|
| Department model (Academic / Administrative) | ✅ Done |
| User model (custom AbstractUser — Student, Staff, HOD, Campus Admin) | ✅ Done |
| Category model (9 categories) | ✅ Done |
| Grievance model (8 statuses, anonymous support, secret code) | ✅ Done |
| AIAnalysis model (spam prediction, confidence score) | ✅ Done |
| Response model (linked to grievance + HOD) | ✅ Done |
| StatusHistory model (audit log for transitions) | ✅ Done |
| Attachment model (file upload support) | ✅ Done |
| Admin registrations with inlines (all models in Django Admin) | ✅ Done |
| Seed data command — 10 Departments + 9 Categories | ✅ Done |
| Migrations applied to local PostgreSQL 18 | ✅ Done |

### Phase 2: Authentication & RBAC (Backend only)

| Component | Status |
|-----------|--------|
| djangorestframework-simplejwt installed & configured | ✅ Done |
| DRF settings (JWT auth classes, throttling) | ✅ Done |
| `POST /api/auth/register/` | ✅ Done |
| `POST /api/auth/login/` | ✅ Done |
| `POST /api/auth/token/refresh/` | ✅ Done |
| `GET /api/auth/me/` (profile) | ✅ Done |
| `PATCH /api/auth/me/` (update profile) | ✅ Done |
| `POST /api/auth/password-reset/` (token-based) | ✅ Done |
| `POST /api/auth/password-reset/confirm/` | ✅ Done |
| RBAC Permission Classes (IsStudent, IsHOD, IsCampusAdmin, etc.) | ✅ Done |
| URLs wired at `/api/auth/` | ✅ Done |

### Phase 3: Grievance Submission & Rate Limiting (Backend)

| Component | Status |
|-----------|--------|
| `grievances/serializers.py` — All serializers (List, Create, Detail, Track, ref data) | ✅ Done |
| `grievances/throttles.py` — DailyGrievanceThrottle (3/user/day, 429 at midnight) | ✅ Done |
| `grievances/urls.py` — All route definitions | ✅ Done |
| `grievances/views.py` — GrievanceListCreateView (role-scoped GET, rate-limited POST) | ✅ Done |
| `grievances/views.py` — GrievanceDetailView (full nested data with role-scoping) | ✅ Done |
| `POST /api/grievances/` — Submit with MultiPartParser + file validation | ✅ Done |
| Daily rate limiting — max 3 per user per calendar day (DB-backed) | ✅ Done |
| File attachment handling — max 3 files, max 5MB, allowed types validated | ✅ Done |
| Anonymous submission — 8-char alphanumeric code, hashed with make_password() | ✅ Done |
| `GET /api/categories/` — Public reference endpoint (no auth) | ✅ Done |
| `GET /api/departments/` — Public reference endpoint (no auth) | ✅ Done |
| `POST /api/grievances/track/` — Anonymous tracking by ID + secret code | ✅ Done |
| `config/urls.py` — Wired api/ + media file serving in DEBUG | ✅ Done |
| StatusHistory created on submission | ✅ Done |

### Infrastructure

| Component | Status |
|-----------|--------|
| `docker-compose.yml` (PostgreSQL container) | ✅ Done |
| `backend/.env` (environment configuration) | ✅ Done |
| `backend/test.md` (testing guide for DRF UI) | ✅ Done |
| `implementation-plan.md` (updated with backend-first approach) | ✅ Done |

---

## ✅ Completed

### Phase 4: AI Spam Filtering (Backend)

| Component | Status |
|-----------|--------|
| `grievances/services/spam_detector.py` | ✅ Done |
| MLSpamDetector (model training and implementation) | ✅ Done |
| Spam detection integrated into submission pipeline | ✅ Done |
| `GET /api/admin/spam-queue/` | ✅ Done |
| `POST /api/admin/spam-queue/{id}/reinstate/` | ✅ Done |
| `POST /api/grievances/{id}/appeal-spam/` | ✅ Done |

### Phase 5: Grievance Routing (Backend)

| Component | Status |
|-----------|--------|
| `grievances/services/routing.py` | ✅ Done |
| `route_grievance()` — automatic routing service | ✅ Done |
| Department-scoped grievance list views | ✅ Done |
| `GET /api/grievances/{id}/` (detail view) | ✅ Done |
| Migration for nullable department field | ✅ Done |
| Tests: routing, scoping, history, category independence (7/7 pass) | ✅ Done |

### Phase 6: Response & Escalation Workflow (Backend)

| Component | Status |
|-----------|--------|
| `VALID_TRANSITIONS` dict — transition validation engine | ✅ Done |
| StatusHistory auto-logging (`signals.py` via `@receiver(pre_save)`) | ✅ Done |
| `POST /api/grievances/{id}/respond/` (HOD response) | ✅ Done |
| `POST /api/grievances/{id}/resolve/` (submitter) | ✅ Done |
| `POST /api/grievances/{id}/reopen/` (submitter, sets `is_reopened=True`) | ✅ Done |
| `POST /api/admin/escalated/{id}/resolve/` (Campus Admin, with auto-close) | ✅ Done |
| Escalation model fields (`escalation_level`, `escalated_to`) | ✅ Done |
| `grievances/services/escalation_service.py` — APScheduler engine | ✅ Done |
| APScheduler auto-escalation (hourly, 72h threshold, configurable) | ✅ Done |
| `python manage.py escalate` — manual trigger with `--dry-run` | ✅ Done |
| Email: submission notification to HOD | ✅ Done |
| Email: response notification to submitter | ✅ Done |
| Email: resolution notification to submitter | ✅ Done |
| Email: escalation notification to assigned Campus Admin | ✅ Done |
| Gmail SMTP configured (console fallback for dev) | ✅ Done |
| Tests: workflow endpoints, escalation, signal, transitions (16/16 pass) | ✅ Done |

### Phase 7: Dashboards, Search & Export (Backend)

| Component | Status |
|-----------|--------|
| `GET /api/dashboard/student/` | ✅ Done |
| `GET /api/dashboard/department/` | ✅ Done |
| `GET /api/dashboard/admin/` | ✅ Done |
| Search & filter on grievance list | ✅ Done |
| `GET /api/reports/export/` (CSV/PDF) | ✅ Done |

### Phase 8: Frontend (All UI — deferred to last)

| Component | Status |
|-----------|--------|
| Auth context + protected routing | ❌ Not started |
| Login, Register, Password Reset pages | ❌ Not started |
| Grievance submission form (file upload + anonymous) | ❌ Not started |
| Anonymous tracking page | ❌ Not started |
| Student dashboard | ❌ Not started |
| Department dashboard (HOD/Staff) | ❌ Not started |
| Campus Admin dashboard | ❌ Not started |
| Grievance detail page | ❌ Not started |
| Status badges, search/filter, error/loading states | ❌ Not started |

### Phase 9-10: Production Readiness

| Component | Status |
|-----------|--------|
| Security hardening (CSP, password hashers, HTTPS) | ❌ Not started |
| Performance (indexes, pagination) | ❌ Not started |
| Logging configuration | ❌ Not started |
| CI/CD (GitHub Actions) | ❌ Not started |
| Docker Compose for full stack | ❌ Not started |
| Backup scripts | ❌ Not started |
| API testing | ❌ Not started |
| Deployment guide | ❌ Not started |

---

## Next Step

**Phase 8 — Frontend (Complete UI)**

Build the entire frontend application after all backend phases are complete.

| Component | Priority |
|-----------|----------|
| Auth context + protected routing | Foundation |
| Login, Register, Password Reset pages | Auth |
| Grievance submission form (file upload + anonymous) | Core |
| Anonymous tracking page | Core |
| Student dashboard | Dashboard |
| Department dashboard (HOD/Staff) | Dashboard |
| Campus Admin dashboard | Dashboard |
| Grievance detail page | Detail |
| Status badges, search/filter, error/loading states | Shared |

