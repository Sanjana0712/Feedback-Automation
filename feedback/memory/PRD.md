# Feedback System — PRD

## Problem Statement
Build a Feedback System that auto-fills session details from a Supabase `meetings` table when a user uploads a Zoom poll CSV containing a Meeting/Webinar ID. Admins can sign in and add new instructors which are stored in a Supabase `instructor` table.

## Architecture
- **Frontend**: React + Tailwind, served on port 3000.
  - Direct REST calls to Supabase using the publishable key (RLS disabled per user).
  - Calls backend only for admin login.
- **Backend**: FastAPI on 8001 — exposes `/api/admin/login` that validates against env vars.
- **Storage**: Supabase Postgres (external). MongoDB unused for now.

## External Services & Tables
- Supabase URL: `https://lehiyygnwrwlrvtzyvav.supabase.co`
- Tables:
  - `feedback_system` — columns: `id`, `meeting_id`, `institution`, `category`, `program`, `batch`, `instructor`, `date`. ✅ Verified end-to-end with sample CSV.
  - `instructor` — columns: `id`, `name`. ✅ Verified working.

## Implemented (Feb 2026)
- Three-tab navigation: Upload, Dashboard (placeholder), Negative Feedback (placeholder), Admin.
- Upload page: drag-and-drop CSV parser, reads "Meeting/Webinar ID" column, queries Supabase, auto-fills 7 fields.
- "Confirm" button = UI-only acknowledgement (no save).
- "Edit Instructor" button: enables only the Instructor field; live autocomplete suggests instructors from Supabase as user types.
- Admin login (hardcoded env credentials) — session persisted in localStorage.
- Add instructor form: Title (Prof./None) + First name + Last name with live full-name preview; saved to Supabase `instructor.name`.
- Toasts via `sonner`. Custom pink/cream theme with Fraunces + Manrope fonts.

## Backlog
- P0: User must create the `meetings` table in Supabase with the listed columns and seed test data.
- P1: Build Dashboard with aggregated charts (sessions per program/instructor, ratings over time).
- P1: Build Negative Feedback page to surface low-rated sessions with comments.
- P2: Persist confirmed sessions to a `session_feedback` table (currently UI-only).
- P2: Allow admins to delete/edit existing instructors.
- P2: Bulk-import meetings via CSV in admin panel.

## Next Actions
1. Have user create the `meetings` table in Supabase.
2. Implement Dashboard & Negative Feedback once data is available.
