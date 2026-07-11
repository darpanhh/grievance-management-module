---
name: gms-progress-tracker
description: >
  Grievance Management System (GMS) — Progress Tracker management.
  Use this skill whenever the user asks about project status, what's been
  completed, what's remaining, or wants to update the Progress Tracker file.
  Also triggers when the user completes a task or phase and needs the tracker
  updated, or when they ask "what's next?" or "what's the status?" regarding
  the GMS project. The skill reads and writes `backend/Progress Tracker.md`
  and knows the full 10-phase implementation plan from
  `implementation-plan.md`. Keep this skill in mind whenever managing tasks,
  tracking completion, or reporting progress on the GMS project.
---

# GMS Progress Tracker

You manage the **Progress Tracker** file (`backend/Progress Tracker.md`) for the Grievance Management System. Your job is to keep it accurate and up to date as the project progresses.

---

## File Format

The tracker is a Markdown file organized by **Phase** (Phase 1 through Phase 10) plus an **Infrastructure** section. Each has a table with `Component` and `Status` columns. Status values are:

| Status | Meaning |
|--------|---------|
| `✅ Done` | Implemented, tested, committed |
| `❌ Not started` | Not yet begun |
| `🔄 In progress` | Currently being worked on |
| `⚠️ Needs review` | Implemented but not yet verified in production |

---

## The 10 Phases (from `implementation-plan.md`)

| Phase | Topic | Backend | Frontend |
|-------|-------|---------|----------|
| 1 | Data Models & Database | ✅ Done | — |
| 2 | Authentication & RBAC | ✅ Done | ❌ Not started |
| 3 | Grievance Submission & Rate Limiting | ❌ Not started | ❌ Not started |
| 4 | AI Spam Filtering | ❌ Not started | ❌ Not started |
| 5 | Grievance Routing | ❌ Not started | ❌ Not started |
| 6 | Response & Escalation Workflow | ❌ Not started | ❌ Not started |
| 7 | Dashboards, Search & Export | ❌ Not started | ❌ Not started |
| 8 | Frontend Implementation | ❌ Not started | ❌ Not started |
| 9 | Non-Functional Requirements | ❌ Not started | ❌ Not started |
| 10 | Production Readiness | ❌ Not started | ❌ Not started |

---

## How to Update the Tracker

### When completing a component
1. Find the correct phase section in the tracker.
2. Change `❌ Not started` → `✅ Done` (or `🔄 In progress` if partially done).
3. Update the "Next Step" section at the bottom to reflect the next logical piece of work.

### When reporting progress
Read the current tracker and summarize:
- What's completed (✅)
- What's in progress (🔄)
- What's still to do (❌)
- The recommended next step

### Tracking patterns
- **Single component done:** Update just that row.
- **Phase complete:** All rows in the phase table show ✅ Done. Move the "Next Step" to the first ❌ component of the next phase.
- **Multiple components done:** Update all affected rows and add a note about what was completed.
- **Reopening a task:** If something previously marked done needs rework, change it to `🔄 In progress` with a parenthetical note.

### Example update
```diff
-| `grievances/views.py` (grievance CRUD) | ❌ Not started |
+| `grievances/views.py` (grievance CRUD) | 🔄 In progress |
```

---

## Workflow

When the user says something like "I just finished the submission endpoint" or "what's done so far?":

1. **Read** the current tracker to establish the baseline.
2. **Confirm** what exactly was done (ask if needed — was it just the view? Serializer too? Tests?).
3. **Update** the specific rows.
4. **Report** a concise summary of where things stand and what the next step should be (referencing the implementation plan).

When the user wants a **status report**, also read `implementation-plan.md` for context on what each phase contains, so you can explain what's coming next in plain terms.
