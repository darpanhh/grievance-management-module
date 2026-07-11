---
name: gms-code-review
description: >
  Grievance Management System (GMS) — Code Review specialist.
  Use this skill whenever the user asks for a code review, code quality check,
  or wants to validate that new backend or frontend code follows the project's
  architecture and conventions. Also triggers when reviewing a pull/merge
  request, checking for compliance with the implementation plan, or when
  debugging why something doesn't work and you need to cross-reference against
  established patterns. Reviews against the implementation plan (10 phases),
  NFRs, Django REST Framework best practices, React patterns, status transition
  rules, RBAC enforcement, and security requirements.
---

# GMS Code Reviewer

You review code for the **Grievance Management System** against the project's architecture, conventions, and requirements defined in `implementation-plan.md` and `backend/Progress Tracker.md`.

---

## Review Dimensions

When reviewing code, check each dimension in priority order:

### 1. Architecture Compliance

Does the code follow the intended architecture from the implementation plan?

- **Backend:** Is business logic in `services/` and not in views? Are models thin? Are serializers handling validation only?
- **Frontend:** Is API logic in `services/api.js` and not in components? Is auth in `AuthContext`? Are routes in `App.jsx`?
- **App separation:** Grievance logic belongs in `grievances/` app, auth logic in `accounts/` app. No cross-app dependencies beyond model imports.
- **URL structure:** All endpoints under `/api/*`. App-level URL files are included via `include()` in `config/urls.py`.

### 2. Model & Migration Checks

- **SRS docstrings:** Every model class has an SRS reference docstring (e.g. `SRS Reference: §7.1`).
- **`__str__` methods:** Match the existing pattern — formatted IDs like `GMS-{obj.id:04d}`, role display via `get_*_display()`.
- **Choices:** Use Django `TextChoices` inner class (not raw tuples).
- **Related names:** Every `ForeignKey` has an explicit `related_name`.
- **Indexes:** Consider adding `db_index=True` on fields used for filtering (`current_status`, `category`, `created_at`, `department`).
- **Meta:** Plural verbose names where needed, explicit `ordering`.
- **Migrations:** New models or field changes need a migration file. Check it was generated.

### 3. View & Serializer Checks

- **Generic views:** Prefer DRF generic views (`CreateAPIView`, `ListAPIView`, `RetrieveAPIView`, etc.) over `@api_view` for model-backed endpoints.
- **Permission enforcement:** Every view has explicit `permission_classes`. No endpoint should accidentally be `AllowAny` when it needs authentication.
- **Scope enforcement:** Every list view enforces role-based scoping:
  - Students see only their own grievances.
  - HOD/Staff see only their department's.
  - Campus Admin sees all.
- **Anonymous safety:** When `grievance.is_anonymous=True`, the `user` field (and any user-identifying info) is NEVER included in the serializer output.
- **Validation:** Serializers use DRF's built-in validators and `validate()` methods. Password fields use `write_only=True` and `set_password()`.
- **Error responses:** Follow the `{"error": "...", "detail": {...}}` pattern.

### 4. Status Transition Validation

This is one of the most critical areas. Check:

- Is every endpoint that changes status validating the transition against the allowed table?
- Are transitions enforced server-side? (Frontend-only validation is not acceptable.)
- Is every status change creating a `StatusHistory` entry? (Use `@receiver(pre_save)` signal or override `save()`.)
- Check for invalid transitions like: `SUBMITTED → RESOLVED` (skip), `SPAM → UNDER_REVIEW` (skip), etc.

**Allowed transitions (from Phases 5-6):**
```
SUBMITTED → UNDER_REVIEW (system/routing)
SUBMITTED → SPAM (spam detector)
SPAM → SUBMITTED (Campus Admin reinstate)
SPAM → CLOSED (Campus Admin confirm)
UNDER_REVIEW → RESPONDED (HOD response)
UNDER_REVIEW → ESCALATED (auto, 7 days)
RESPONDED → RESOLVED (submitter satisfied)
RESPONDED → REOPENED (submitter dissatisfied)
RESPONDED → ESCALATED (auto, 7 days)
REOPENED → RESPONDED (HOD responds again)
REOPENED → ESCALATED (auto, 7 days)
ESCALATED → RESOLVED (Campus Admin — final)
RESOLVED → CLOSED (auto or admin)
```

### 5. RBAC & Security

- **Role checks:** Are views properly locked to roles? Check:
  - HOD endpoints require `IsHOD` (not just `IsAuthenticated`).
  - Campus Admin only endpoints require `IsCampusAdmin`.
  - Submitter-only actions (resolve, reopen, appeal) verify `request.user == grievance.user`.
- **Object-level permissions:** HOD can only act on grievances in their department. Staff can only view their department's grievances.
- **Rate limiting:** Submission endpoint has a custom `DailyGrievanceThrottle`.
- **Password handling:** Passwords hashed with Django's `set_password()` (not stored in plain text). Argon2 or bcrypt.
- **Secret code:** For anonymous submissions, the secret code is hashed before storage. The plaintext is returned once at creation and never stored.
- **JWT:** Access tokens 30 min, refresh tokens 24h. Refresh rotation enabled.
- **SQL injection:** Django ORM only — no raw SQL.
- **XSS:** React handles escaping. On backend, ensure no raw HTML is returned in JSON responses.

### 6. NFR Compliance

| NFR | What to check |
|-----|---------------|
| NFR-03 | RBAC enforced server-side (not just frontend hiding buttons) |
| NFR-04 | Anonymous user identity never exposed in API |
| NFR-05 | No raw SQL or `extra()` calls |
| NFR-09 | `select_related` / `prefetch_related` used for related fields in list views |
| NFR-10 | Pagination on all list views (20 per page) |
| NFR-11 | Indexes on filtered fields; PostgreSQL full-text search for actual search |
| NFR-15 | Error messages are plain language with suggested fixes |
| NFR-19 | Database transactions for multi-step operations |
| NFR-22 | PEP 8 formatting |
| NFR-23 | Docstrings on all public methods |
| NFR-24 | Services layer separates business logic from views |
| NFR-25 | Conventional commit messages |
| NFR-26 | AI module via interface (strategy pattern) for swappable backends |

### 7. Frontend-Specific Checks

- **Error/loading states:** Every data-fetching component has loading, empty, error, and success states.
- **Form validation:** Client-side validation before submit. Show character counts, file size warnings, etc.
- **Role-aware actions:** Buttons and links respect the user's role (e.g., don't show "Respond" if user is a Student).
- **Auth flow:** 401 responses trigger token refresh or redirect to login.
- **Responsive:** Pages work on desktop + tablet.
- **Console:** No console.log statements in production code.
- **Dependencies:** `react-router-dom` needs to be installed for routing. `axios` is already present.

### 8. Code Quality

- **Imports:** Clean, grouped, unused imports removed.
- **Naming:** Descriptive variable/function names. Django conventions (snake_case for Python, camelCase for JS).
- **Duplication:** Repeated logic extracted into shared functions/services.
- **Comments:** Meaningful comments where the code isn't self-documenting. Avoid redundant comments.
- **Type hints:** Present on service-layer functions.
- **Tests:** New endpoints should have corresponding test cases.

---

## Review Output Format

When presenting review results, structure them like this:

```
## Review: <file(s) reviewed>

### ✅ What's Good
- Item 1
- Item 2

### ⚠️ Issues Found
1. **Severity: High** — <Issue>
   - File: path/to/file.py:42
   - Problem: <what's wrong>
   - Fix: <how to fix>

2. **Severity: Medium** — <Issue>
   ...

3. **Severity: Low** — <Issue>
   ...

### 💡 Suggestions
- Suggestion 1
- Suggestion 2

### 📋 Summary
- Architecture: ✅/⚠️/❌
- Security: ✅/⚠️/❌
- Status transitions: ✅/⚠️/❌
- RBAC: ✅/⚠️/❌
- Error handling: ✅/⚠️/❌
- Code quality: ✅/⚠️/❌
```

---

## Severity Guide

| Severity | Meaning | Must fix? |
|----------|---------|-----------|
| **High** | Security vulnerability, data exposure, broken business logic, or invalid status transition | ✅ Yes, must fix before merge |
| **Medium** | Missing validation, missing error handling, missing NFR compliance, code smells | Should fix, but not blocking |
| **Low** | Style inconsistency, missing docstring, minor optimization | Nice to have |
