---
name: gms-frontend-coder
description: >
  Grievance Management System (GMS) — React + Vite frontend.
  Use this skill whenever you're asked to build, modify, or style React
  components, pages, or frontend infrastructure in this project. The skill
  knows the full component tree, route map, your existing API client pattern
  (Axios), AuthContext setup, theme/design guidelines, and the complete
  frontend implementation plan (Phase 8). Always consult this skill when
  the task touches frontend/ or any .jsx/.js/.css file under frontend/src/.
  Make sure to use this skill whenever the user asks for UI work — new pages,
  components, dashboards, forms, or styling. Even if they just say "make me
  a login page" or "build the student dashboard", this skill will guide you.
---

# GMS Frontend Coder

You are implementing the frontend for the **Grievance Management System** — a React + Vite single-page application for a college-level grievance portal. Every component you build must follow the established project conventions and match the route map, component tree, and design guidelines below.

---

## Project Setup

```
frontend/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── Navbar.jsx
│   │   ├── ProtectedRoute.jsx
│   │   ├── GrievanceForm.jsx
│   │   ├── GrievanceCard.jsx
│   │   ├── StatusBadge.jsx
│   │   ├── ResponseView.jsx
│   │   ├── FileUpload.jsx
│   │   ├── SpamAppeal.jsx
│   │   └── SearchFilter.jsx
│   ├── pages/             # Route-level page components
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── PasswordReset.jsx
│   │   ├── SubmitGrievance.jsx
│   │   ├── TrackGrievance.jsx
│   │   ├── StudentDashboard.jsx
│   │   ├── DepartmentDashboard.jsx
│   │   ├── AdminDashboard.jsx
│   │   └── GrievanceDetail.jsx
│   ├── services/
│   │   └── api.js         # Axios API client
│   ├── contexts/
│   │   └── AuthContext.jsx # Auth state management
│   ├── App.jsx            # Root with routing (exists)
│   └── main.jsx           # Entry point (exists)
├── index.html
├── package.json
└── vite.config.js
```

### Existing Code
- **App.jsx** currently renders a system-launchpad/status-check page. When you add routing, keep the launchpad as the `/` route and add all new pages under their respective routes.
- **main.jsx** and **vite.config.js** are standard — no special config needed beyond what's already there.
- No CSS framework is installed yet. Choose one of:
  - Plain CSS/ CSS modules (existing pattern in App.css)
  - Tailwind CSS (if user agrees to install it)
  - A lightweight component library

---

## Route Map

Implement these routes in `App.jsx` using `react-router-dom`:

```
/                          → App.jsx (launchpad — exists, keep it)
/login                     → Login page
/register                  → Registration page
/password-reset            → Password reset
/grievances/new            → SubmitGrievance (authenticated)
/grievances/track          → TrackGrievance (public)
/grievances/:id            → GrievanceDetail (authenticated, role-scoped)
/dashboard/student         → StudentDashboard
/dashboard/department      → DepartmentDashboard (HOD/Staff)
/dashboard/admin           → AdminDashboard
/admin/spam-queue          → Spam queue management (Campus Admin)
/reports                   → Export reports (Campus Admin)
```

---

## API Client Pattern (`services/api.js`)

Use Axios with a base URL pointing to the Django backend:

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(...);
```

- Export `api` as the default. All pages/components import and use this instance.
- For file uploads, override `Content-Type` to `multipart/form-data` per-request.

---

## AuthContext Pattern (`contexts/AuthContext.jsx`)

```javascript
const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: check localStorage for tokens, fetch /api/auth/me/
  const login = async (username, password) => { /* POST /api/auth/login/, store tokens, fetch user */ };
  const logout = () => { /* clear tokens + user, navigate to /login */ };
  const register = async (data) => { /* POST /api/auth/register/ */ };

  return <AuthContext.Provider value={{ user, loading, login, logout, register }}>...</AuthContext.Provider>;
}
```

---

## Shared Components

### ProtectedRoute
- Wraps `<Navigate>` or `<Outlet>` depending on auth state.
- Accepts `allowedRoles` prop — if user's role isn't in the list, redirect to their appropriate dashboard or show "Access Denied".
- If `loading` is true from AuthContext, show a spinner/skeleton.
- If not authenticated, redirect to `/login`.

### Navbar
- Role-aware navigation links:
  - **Student:** Dashboard, Submit Grievance, Track Grievance
  - **HOD/Staff:** Dashboard, Grievances Inbox
  - **Campus Admin:** Dashboard, Spam Queue, Reports
- Shows current user name + role badge + logout button.
- Mobile-responsive (hamburger menu on small screens).

### StatusBadge
- Color-coded span showing the current status:
  - `SUBMITTED` → Blue `#3B82F6`
  - `SPAM` → Red `#EF4444`
  - `UNDER_REVIEW` → Amber `#F59E0B`
  - `RESPONDED` → Green (informational) `#10B981`  *(distinct from Resolved)*
  - `REOPENED` → Purple `#8B5CF6`
  - `ESCALATED` → Orange with urgency indicator `#F97316`
  - `RESOLVED` → Green `#22C55E`
  - `CLOSED` → Gray `#6B7280`
- Labels match the model's display value: `get_current_status_display()`.
- Badge should be compact, rounded, with white text.

### GrievanceCard
- Summary card used across all dashboards.
- Shows: ID (GMS-XXXX), title, submitter name (unless anonymous), department, category, status badge, created date, days since update.
- Clickable — navigates to `/grievances/:id`.
- Shows escalated indicator if status is `ESCALATED`.

### FileUpload
- Drag-and-drop zone + click-to-browse.
- File list with remove button per file.
- Combined size indicator.
- Validates: max 3 files, max 5MB each, allowed types only.
- Shows progress bar during upload.

### SearchFilter
- Debounced text search input (300ms).
- Dropdown selects for: category, status, department.
- Date range picker (date_from, date_to).
- Sort order selector.
- "Clear Filters" button.
- Renders above list/dashboard views.

### ResponseView
- Thread of responses with timestamps and responder name.
- Each response shows: responder name + role, date/time, content body.
- Newest first or chronological toggle.

### SpamAppeal
- Shown on grievance detail when status = SPAM and user is the submitter.
- Shows explanation: "This grievance was flagged as spam."
- Text area for appeal reason.
- Submit button → POST `/api/grievances/{id}/appeal-spam/`.
- After submission shows "Appeal submitted — awaiting admin review."

---

## Pages Implementation Guide

### Login (`pages/Login.jsx`)
- Username + password form.
- "Remember me" (persist JWT in localStorage vs. sessionStorage).
- Link to Register and Password Reset.
- On success: redirect to user's role-based dashboard.
- Error state: "Invalid credentials" message.

### Register (`pages/Register.jsx`)
- Fields: username, email, first_name, last_name, password, confirm password, department (dropdown from API).
- Role is always STUDENT on registration (enforced by backend).
- Password strength indicator.
- On success: auto-login or redirect to login with success message.

### PasswordReset (`pages/PasswordReset.jsx`)
- Step 1: email form → submit → "Check your email for reset link".
- Step 2: token + new password + confirm password.
- Clean separation between steps.

### SubmitGrievance (`pages/SubmitGrievance.jsx`)
- Category dropdown (required, from `GET /api/categories/`).
- Department selector (pre-filled with user's department, HOD/Staff can override).
- Title input (max 255 chars).
- Description textarea with character count (10–5000).
- Anonymous toggle with explanation text.
- File upload component (max 3).
- Remaining submissions counter ("You have X submissions remaining today").
- Submit → loading state → confirmation screen with grievance ID (+ secret code if anonymous).
- Error states: 429 (rate limit with time remaining), 400 (validation errors).

### TrackGrievance (`pages/TrackGrievance.jsx`)
- Public page (no auth required).
- Two-field form: Grievance ID + Secret Code.
- On success: shows grievance detail in read-only mode.
- Error: "No grievance found with that ID and code."

### StudentDashboard (`pages/StudentDashboard.jsx`)
- Header: "My Grievances" with count.
- Today's remaining submissions indicator.
- List of user's grievances using GrievanceCard.
- SearchFilter bar above the list.
- "New Grievance" button.
- Pagination.
- Empty state: "You haven't submitted any grievances yet."

### DepartmentDashboard (`pages/DepartmentDashboard.jsx`)
- HOD/Staff only.
- Header with department name and role badge.
- Tabbed view: "Open" (Under Review, Responded, Reopened) / "Resolved" / "Escalated" / "All".
- GrievanceCard list with SearchFilter.
- Each card shows escalation urgency for ESCALATED grievances.
- Pagination.

### AdminDashboard (`pages/AdminDashboard.jsx`)
- Campus Admin only.
- Stats summary cards: Total, Submitted, Under Review, Escalated, Spam, Resolved (fetched from `GET /api/dashboard/admin/`).
- Quick-action links: Spam Queue, Escalated Queue, Export Reports.
- Recent activity feed (recently created/recently updated grievances).
- SearchFilter.

### GrievanceDetail (`pages/GrievanceDetail.jsx`)
- Full grievance information: title, description, category, department, status badge, timestamps.
- Attachments list with download links.
- Status history timeline (chronological).
- AI Analysis section (if exists): spam prediction, confidence score, reason.
- **Role-based action buttons:**
  - **Submitter (Student/Staff):** "Mark Resolved" (if RESPONDED), "Request Further Review" (if RESPONDED), "Appeal Spam" (if SPAM).
  - **HOD:** "Respond" (if UNDER_REVIEW or REOPENED) → opens ResponseForm modal.
  - **Campus Admin:** "Reinstate" (if SPAM), "Confirm Spam" (if SPAM), "Resolve Escalated" (if ESCALATED).
- ResponseView component showing all responses.
- Loading skeleton while fetching.
- 404 state: "Grievance not found."

---

## Theme / Visual Design Guidelines
- Clean, accessible design appropriate for a college/university web app.
- Color palette: professional blues and grays for the main UI, with the status badge colors above.
- All interactive elements have hover/focus states.
- All forms show loading spinners during submission and disable inputs.
- All errors are shown inline (not alerts) with clear plain-language messages.
- Responsive: works on desktop and tablet. Mobile is a bonus.
- Consistent spacing, border-radius, and font sizes throughout.
- Contextual help text on complex forms (anonymous toggle, spam appeal).

---

## Implementation Order (by complexity)

| Priority | Page/Component          | Notes                                               |
|----------|------------------------|-----------------------------------------------------|
| 1        | AuthContext             | Foundation — needed before any auth-gated page      |
| 2        | ProtectedRoute         | Foundation — needed before any auth-gated page      |
| 3        | Navbar                 | Shared — needed before any page with navigation     |
| 4        | Login, Register, PasswordReset | Public auth pages                          |
| 5        | StatusBadge            | Shared — needed by GrievanceCard and detail         |
| 6        | api.js                 | Service — needed by all pages                       |
| 7        | SubmitGrievance        | Phase 3 — primary user action                       |
| 8        | TrackGrievance         | Phase 3 — anonymous tracking                        |
| 9        | StudentDashboard       | Phase 7 — student view                              |
| 10       | GrievanceCard          | Shared — used by all dashboards                     |
| 11       | DepartmentDashboard    | Phase 7 — HOD/Staff view                            |
| 12       | AdminDashboard         | Phase 7 — admin view                                |
| 13       | GrievanceDetail        | Phase 5-6 — detail + action buttons                 |
| 14       | ResponseView           | Shared — used in detail page                        |
| 15       | FileUpload             | Shared — used in submission form                    |
| 16       | SearchFilter           | Shared — used in dashboards                         |
| 17       | SpamAppeal             | Phase 4 — spam appeal UI                            |
| 18       | Routes in App.jsx      | Wire everything together                            |
