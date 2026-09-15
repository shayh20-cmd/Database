# Database Schema — Design

**Branch:** `db-schema` (cut from `master`)
**Date:** 2026-09-07
**Status:** superseded by [2026-09-15-hub-on-kkarcdb-schema-design.md](2026-09-15-hub-on-kkarcdb-schema-design.md) — the findings below still apply; the table map does not.

## Problem

There is no database. All four dashboards are standalone React apps whose entire
state is one JSON blob in `localStorage`. `project_hub.html` writes everything —
tasks, subtasks, events, meetings, staff, consultants, saved views, column widths,
and base64 file attachments — into a single key, `pm_asana_v9`.

This has three consequences that now block the office:

1. **No sharing.** Each person's browser holds a different, private copy. There is
   no mechanism by which two people can see the same project.
2. **No durability.** `project_hub.html` has no export. Clearing site data, resetting
   a browser profile, or moving to a new machine destroys the project. The only
   "export" is `window.print()` to PDF.
3. **No integrity.** Every mutation rewrites the whole document. Two open tabs
   already clobber each other at whole-document granularity — there is no `storage`
   listener and no `BroadcastChannel` anywhere in the codebase.

The goal is Postgres (via Supabase), with multiple named users reading and writing
concurrently.

## Decisions taken

| Decision | Choice | Consequence |
|---|---|---|
| Tenancy | Many projects, one shared database | Project-scoped tables carry `project_id`; RLS scopes per project |
| Users | Office staff now, external consultants planned | Role model designed for external access; only staff logins enabled initially |
| Subtask ownership | Subtask belongs to the **task**; the lane is an attribute | Matches 8 of 9 existing read sites; ETL keeps the legacy copy, drops the duplicate |

## What the code review found

The findings below come from executing the app's data layer in isolation (16 of its
144 top-level declarations) and inferring the schema from the resulting object graph,
rather than from reading the source.

### Finding 1 — subtasks and events are stored twice (blocking)

`migrateTask()` derives `task.tracks[]` from legacy `processEvents`/`subtasks` and
copies subtasks into a lane **without removing them from `task.subtasks`**. Both
copies persist, with identical IDs.

| | Tasks with data in both places | Identical ID sets | Genuinely different |
|---|---|---|---|
| Subtasks | 50 | 50 | 0 |
| Events | 31 | 31 | 0 |

This is a half-finished v4 migration: `TrackSection` reads the new shape, the rest of
the UI still reads the legacy one. They stay consistent only because nobody has yet
edited through the divergent path.

**Resolution:** `subtasks.task_id` is the foreign key. A nullable `lane_id` records
which lane a subtask belongs to. `TrackSection` filters by lane instead of owning its
own list. The ETL takes `task.subtasks` / `task.events` as canonical and discards
`task.tracks[].subtasks` / `.events`.

### Finding 2 — per-user UI state is stored as shared data

| Field | Today | Once shared |
|---|---|---|
| `groups[].collapsed` | shared row | one person collapses a group for everyone |
| `sheets[].hiddenCols` | shared row | one person hides a column for everyone |
| `sheets[].colOrder`, `colWidths` | shared row | one person's resize changes everyone's layout |
| `sheets[].views[]` | shared row | personal saved views stored globally |
| expanded task IDs, `ovHeights` | separate `localStorage` key | already correct |

Expand/collapse of tasks was already given per-user treatment; the rest was not.
These move to `user_view_preferences (user_id, sheet_id, prefs jsonb)`. Storing them
on shared rows produces the most confusing class of multi-user bug: the UI changing
under you because a colleague clicked something.

### Finding 3 — display labels used as identity

65 places use a Hebrew display string as an identifier — `id: "היתר"`,
`"תכנון ראשוני"`, `"מכרז"`, `"ביצוע"` (64 in `PORTFOLIO_DATA`, one meeting category).
Renaming a phase breaks every reference to it.

**Resolution:** stable `code` column (`permit`, `initial_design`, `tender`,
`execution`) plus a separate translatable `label`. This is also the change that makes
the translation spec tractable — see that spec's `code` vs `label` split.

### Finding 4 — inconsistent ID generation

`tasks`, `subtasks`, `events` use `uid()` — `Math.random().toString(36).slice(2,9)`,
7 base36 characters. Birthday collision becomes material around 10^5 rows, and it is
not safe for IDs minted concurrently on multiple clients. `staff`, `consultants`, and
`tracks` use semantic keys instead.

**Resolution:** all primary keys become UUIDs. Rows that had semantic keys keep them
as a separate `code` column.

### Finding 5 — naming collision

`data.tracks` = project-level lanes (`licensing`, `tender`, `execution`).
`task.tracks` = per-discipline lanes inside a single task. Two unrelated concepts
sharing a name, becoming two tables. Renamed here to `project_tracks` and `task_lanes`.

### Finding 6 — content that cannot go in a column

- **Attachments** are base64 data URLs inside the same blob (`readAsDataURL` →
  `task.attachments[].data`). A 3 MB PDF becomes ~4.3 MB of characters rewritten on
  every save. These move to Supabase Storage; the table keeps metadata plus an object key.
- **Task descriptions** are raw `contenteditable` HTML, assigned via
  `descRef.current.innerHTML = task.description` with no sanitisation. Harmless in a
  single-user local app; **stored XSS the moment two people share a database.**
  Sanitise on write and on render.
- **Dates** are all strings (`'2026-07-30'`). They become real `date` columns, which
  turns "what is overdue" into a query rather than a client-side scan.

## Table map

**Org-level** — shared across projects, which is the payoff of the multi-project decision:

`staff`, `disciplines`, `statuses`, `priorities`, `field_types`

Today `planning_dashboard.html` and `project_hub.html` each keep their own duplicated
consultant and discipline lists. Consolidating them here removes an existing source
of drift.

**Project-level:**

`projects`, `project_info`, `project_tracks`, `sheets`, `groups`, `tasks`,
`task_lanes`, `subtasks`, `events`, `meetings`, `meeting_items`, `milestones`,
`goals`, `principles`, `consultants`, `consultant_contacts`, `external_contacts`,
`attachments`

`subtasks` is self-referencing via `parent_id` — nesting reaches three levels in the
seed data (task → subtask → subtask).

**Deliberately `jsonb`, not normalised:**

`tasks.field_values` (EAV; normalising buys nothing and costs every read),
`projects.builtin_config`, saved view definitions in `user_view_preferences`.

## Access model

RLS on every project-scoped table. Roles are designed now for external consultants
even though only staff logins are enabled initially:

- `project_members (project_id, user_id, role)` where role ∈ `owner | editor | viewer`
- Consultant access, when enabled, is scoped by discipline through
  `project_members.discipline_id` rather than by adding a parallel mechanism later.

Designing the role table now costs little; retrofitting external access onto a
permissive staff-only model is expensive.

## Migration path

The hardest part is not the schema — it is that **production data lives in individual
browsers and there is no way to get it out.**

1. **Export first, and ship it before anything else.** Add JSON export to
   `project_hub.html`, matching what `planning_dashboard.html` already has. Until this
   exists, no migration is possible and the data is one cleared cache from gone.
2. **ETL script** consuming an exported blob: run the existing `migrateData()` ladder
   to normalise legacy shapes, then map to tables, minting UUIDs and building an
   old-ID → UUID map. Discard the duplicate lane copies (Finding 1). Split per-user UI
   state out to `user_view_preferences` (Finding 2). Upload attachments to Storage and
   replace data URLs with object keys.
3. **Verify** row counts and spot-check a full project against the source blob.

The existing `migrateData()` ladder becomes a one-time ETL input and then stops being
shipped code — schema evolution moves to SQL migrations.

## Out of scope

- The translation spec (separate document; depends on the `code`/`label` split here)
- The `project_hub` JSX restructure (separate document; independent)
- Migrating `planning_dashboard`, `home_dashboard`, `protein_explorer`
- Realtime collaboration semantics beyond last-write-wins per row
- Any UI work beyond what the schema forces

## Open questions

- Does an office-wide `staff` list belong to the organisation or to a tenant above it?
  Assumed organisation-level here; revisit if the office ever hosts more than one entity.
- Retention/audit: no history table is proposed. Postgres PITR covers disaster
  recovery, but per-row change history (who changed a status, when) is a product
  question that has not been asked yet.
