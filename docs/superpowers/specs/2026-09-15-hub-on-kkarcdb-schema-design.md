# Dashboards on KkarcDB — Table Design

**Branch:** `supabase-schema` (cut from `English-translate`)
**Date:** 2026-09-15
**Status:** design — supersedes the table map in
[2026-09-07-database-schema-design.md](2026-09-07-database-schema-design.md).
That document's code-review findings (duplicate subtasks, per-user state stored as
shared data, labels used as identity, weak IDs, base64 attachments, unsanitised
HTML) still stand and are not repeated here.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Database | **The existing KkarcDB Supabase project**, migrations `008+` | Same firm, same maintainer, same people and projects. Two registers of the same staff and consultants would drift. |
| Scope | `project_hub`, `planning_dashboard`, `home_dashboard` | `protein_explorer` is a proteomics CSV viewer with no persistent state. |
| API | **Extend `KKarcDB.Api`** with `/api/hub/*` endpoints | Browser never holds the database password; rules live in one tested C# project. No Supabase auto-REST, no RLS — the API is the gate, exactly as KkarcDB already does. |
| Hosting | The three HTML pages are served from `KKarcDB.Api`'s `wwwroot` on the existing Azure App Service | One origin, one deploy script (`Deploy-Azure.ps1`), no CORS. |
| Sign-in | KkarcDB's: Supabase Auth with Entra behind it, `person_identity` decides who is in | Already built and enrolled. |
| Naming | New tables are prefixed `hub_`; KkarcDB's tables are reused unprefixed | Keeps the dashboards' tables identifiable inside the shared `public` schema, and makes "this is a KkarcDB identity row" visible in every foreign key. |
| Identity | `project`, `person`, `firm`, `discipline`, `stage` are **KkarcDB rows** | The dashboards stop keeping their own staff, consultant and discipline lists. |
| Labels | `name_he` / `name_en` columns, KkarcDB's convention | Finishes the code/label split the translation spec needs. |

## What the front end actually stores

| App | Store | Shape |
|---|---|---|
| `project_hub` | `localStorage['pm_asana_v9']` | One project: `sheets[] → groups[], tasks[] → subtasks[] (nested ×3), events[], lanes[]`, `tracks[]`, `meetings[] → participants[], items[]`, `licensingGoals[]`, `licensingMilestones[]`, `standalonePrinciples[]`, `team[]`, `consultants[] → contacts[]`, `fields[]`, `views[]`, `ganttViews[]`, `builtinConfig`, `hiddenCols`, `colOrder`, `colWidths`; plus a hard-coded `PORTFOLIO_DATA[]` with `phases[]`, `hours{disc:{budget,actual}}`, `blockers[]` |
| `planning_dashboard` | `localStorage['planning_dashboard_data_v4']` | `buildings[]`, `consultants[]`, `docTypes[]`, `cells{"b|c|d": {events[]}}`, `kpis[]`, `view` |
| `home_dashboard` | none — constants | `PROJECTS[]`, `URGENT_TASKS[]`, `ACTIVITY[]`, `GANTT_ROWS[]` — all derivable from the above once stored |
| all | `localStorage['appLang']`, `pm_gantt_label_w` | per-user preferences |

Both `project_hub` events and `planning_dashboard` cells use the **same status
machine** (`missing → progress → sent → response → comments → progress(round+1) …
approved`, with `sent` and `comments` auto-creating a follower). That is one vocabulary
table and one event table, not two.

## Table map

### Reused from KkarcDB (no change unless noted)

| Table | Used as | Change in `008` |
|---|---|---|
| `project` | The project. `project_hub` becomes multi-project by `project_id`; the home page lists these rows | — |
| `person` | Staff (`team[]`) **and** consultant/client contacts (`consultants[].contacts[]`) | add `discipline_code` (staff discipline, nullable). `mobile`, `fax` and `address` already exist, added by `007_consultant_contacts.sql` |
| `firm` | Consultant firms (`kind = 'consultant'`), clients, authorities | — |
| `discipline` | `ARCH`, `STRC`, `ELEC` … | add `color text` and `legacy_code text`. **No new disciplines:** `797e7cb` loaded 158 consultant spreadsheets and took this table from 15 codes to 51, so every trade the dashboards name already has a row |
| `project_participant` | A consultant firm on a project, per discipline (`consultants[]`) | add `lead_person_id` (the `isLead` contact) |
| `project_assignment` | Staff on a project with a role (`team[].projectRole`) | — |
| `stage` / `stage_template` | `PORTFOLIO_DATA[].phases[]` (`תכנון ראשוני`, `היתר`, `מכרז`, `ביצוע` → `preliminary`, `permit`, `tender`, `construction`) | — (`plannedMonths` becomes `planned_start`/`planned_end`; `blocker` moves to `hub_project_blocker`) |
| `person_identity`, `person.app_role` | Who may sign in and what they may do | — |

### Vocabularies (org-wide, seeded, `code` is the key)

| Table | Columns beyond `code, name_he, name_en, sort_order` | Seeds |
|---|---|---|
| `hub_task_status` | `color` | `not_started (N)`, `in_progress (I)`, `awaiting_response (R)`, `stuck (S)`, `done (C)` |
| `hub_priority` | `color` | `high`, `medium`, `low` |
| `hub_event_status` | `symbol`, `color`, `is_period boolean`, `auto_follow_code`, `auto_follow_round_delta int` | `missing`, `progress`, `sent`, `response`, `comments`, `update`, `approved` |
| `hub_meeting_item_type` | — | `task`, `subtask`, `update`, `decision`, `info` |

`STATUSES`, `PRIORITIES`, `DISCIPLINES` are user-editable lists in the UI today
(`ListsCtx`). They stay editable: the API exposes CRUD on these tables to
`app_role = 'admin'`.

### Project-level

| Table | Key columns | Notes |
|---|---|---|
| `hub_project_profile` | `project_id PK`, `type`, `area_m2`, `budget_text`, `priority_code`, `icon`, `color`, `builtin_config jsonb`, `updated_at` | One-to-one extension of `project` with the fields only the dashboards care about. `builtin_config` holds `{__owner_status:{delayThreshold}}`. |
| `hub_discipline_hours` | `project_id`, `discipline_code`, `budget_hours`, `actual_hours`; unique pair | `PORTFOLIO_DATA[].hours`. The only home-dashboard data that exists nowhere else. |
| `hub_project_blocker` | `project_id`, `stage_id null`, `text`, `raised_at`, `resolved_at null` | `blockers[]` and `phases[].blocker` |
| `hub_project_track` | `project_id`, `code` (`licensing`, `tender`, `execution`, …), `name_he/en`, `discipline_code null`, `categories text[]`, `sort_order`; unique `(project_id, code)` | `data.tracks` — the project's lanes. Renamed from the blob's `tracks` to avoid the collision with per-task lanes. |
| `hub_sheet` | `project_id`, `track_id null`, `name`, `kind` (`list`), `sort_order` | `sheets[]`. `track_id` + `sort_order` replace `track.stageOrder`. |
| `hub_field` | `sheet_id`, `code`, `name_he/en`, `type` (`text|number|date|select|checkbox|person`), `options jsonb`, `sort_order` | Custom columns (`fields[]`). Built-in columns (`__name`, `__status`, …) are code, not rows. |
| `hub_group` | `sheet_id`, `name`, `sort_order` | `groups[]`. `collapsed` moves to `hub_user_pref`. |
| `hub_task` | `sheet_id`, `group_id`, `title`, `status_code`, `priority_code`, `discipline_code`, `assignee_person_id null`, `start_date`, `due_date`, `comment`, `description_html` (sanitised), `done`, `field_values jsonb`, `is_principle`, `principle_created_at`, `source_meeting_item_id null`, `sort_order` | `responsible` in the blob is a discipline code, not a person — it maps to `discipline_code`. |
| `hub_task_lane` | `task_id`, `discipline_code`, `name`, `sort_order` | `task.tracks[]` — a consultant's own lane inside a task. |
| `hub_subtask` | `task_id`, `parent_subtask_id null`, `lane_id null`, `title`, `done`, `discipline_code`, `status_code`, `priority_code`, `start_date`, `due_date`, `is_principle`, `principle_created_at`, `from_event_id null`, `sort_order` | Self-referencing; seed data nests three deep. Cycle and cross-task-parent triggers copy KkarcDB's `stage` pattern. |
| `hub_event` | exactly one of `task_id`, `subtask_id`, `plan_cell_id`; `status_code`, `event_date`, `end_date null`, `round int null`, `assignee_discipline_code null`, `title`, `note`, `depends_on_event_id null`, `created_at`, `created_by_person_id` | The shared status-machine log. "Current status" is *derived*: the latest event by `(event_date, created_at)`. `round` and `depends_on` are used by the planning board only. |
| `hub_attachment` | `task_id`, `filename`, `mime_type`, `size_bytes`, `storage_key`, `uploaded_by_person_id`, `uploaded_at` | Bytes go to a Supabase Storage bucket `hub-attachments`; the row keeps the object key. This is the one Supabase feature beyond Postgres and Auth that the design adopts. |
| `hub_meeting` | `project_id`, `track_id null`, `title`, `meeting_date`, `recorded_by`, `distribution`, `created_at` | |
| `hub_meeting_participant` | `meeting_id`, `person_id null`, `display_name`, `role_text`, `sort_order` | `person_id` null for the free-text "custom" participants. |
| `hub_meeting_item` | `meeting_id`, `number` (`"2.1.3"`), `topic`, `assignee_discipline_code null`, `for_information boolean`, `start_date`, `due_date`, `item_type_code null`, `linked_kind` (`task|subtask|goal|milestone|principle`) + `linked_id null`, `created_task_lane_id null`, `sort_order` | The blob's `assignee: 'לידיעה'` sentinel becomes `for_information = true`. |
| `hub_licensing_goal` | `project_id`, `title`, `target_date`, `done`, `source_meeting_item_id null`, `sort_order` | |
| `hub_licensing_milestone` | `project_id`, `stage_id null`, `title`, `milestone_date`, `start_date`, `status`, `done`, `source_meeting_item_id null`, `sort_order` | |
| `hub_principle` | `project_id`, `description`, `discipline_code`, `created_at`, `source_meeting_item_id null` | **Standalone** principles only. Task- and subtask-linked principles are the `is_principle` flag on those rows; a view `hub_principle_all` unions the three. |
| `hub_activity` | `project_id`, `actor_person_id`, `entity_kind`, `entity_id`, `verb`, `summary_he`, `summary_en`, `created_at` | Append-only, written by the API on every mutation. Feeds the home page's activity feed and answers the earlier spec's open question about "who changed what, when". |

### Planning board (`planning_dashboard`)

| Table | Key columns | Notes |
|---|---|---|
| `hub_plan_board` | `project_id`, `name`, `view_rows`, `view_cols`, `updated_at` | One board per project is the norm; the FK allows more. |
| `hub_plan_building` | `board_id`, `name`, `sort_order` | rows |
| `hub_plan_doc_type` | `board_id`, `name`, `sort_order` | columns |
| `hub_plan_consultant` | `board_id`, `project_participant_id`, `sort_order` | A column group is a consultant firm on this project — the KkarcDB participant, not a free-text `company`. |
| `hub_plan_cell` | `board_id`, `building_id`, `consultant_id`, `doc_type_id`; unique triple | Replaces the `"b|c|d"` string key. Status is derived from its `hub_event` rows. |
| `hub_plan_kpi` | `board_id`, `name`, `filter_status_codes text[]`, `filter_doc_type_ids uuid[]`, `sort_order` | |

### Per-user

| Table | Key columns | Notes |
|---|---|---|
| `hub_user_pref` | `person_id`, `scope_kind` (`global|project|sheet|board`), `scope_id null`, `prefs jsonb`, `updated_at`; unique triple | `appLang`, `hiddenCols`, `colOrder`, `colWidths`, collapsed groups, expanded tasks, `ovHeights`, Gantt label width. Everything the earlier spec's Finding 2 identified. |
| `hub_saved_view` | `project_id`, `sheet_id null`, `kind` (`list|gantt|combined`), `name`, `owner_person_id`, `is_shared`, `definition jsonb` | `views[]`, `ganttViews[]`, `combinedView`. Personal by default; `is_shared` lets one be published to the project. |

### Not tables

- **`home_dashboard`** is a set of queries: project cards from `project` + `hub_project_profile` + counts over `hub_task`; urgent tasks from `hub_task` where `due_date` is near and status is not `done`; the Gantt from `stage`; milestones from `hub_licensing_milestone`; activity from `hub_activity`.
- **`USER`** on the home page is `/api/me`.
- **External contacts** (`external_contacts` in the earlier spec) are `person` rows with a `firm_id`.
- **Per-project access roles.** Staff access is `person.app_role`, as in KkarcDB. A `hub_project_access` table for discipline-scoped consultant logins is deliberately *not* created now: the API is the gate, so adding it later is one migration and one policy check, not a retrofit of RLS.

**Count:** 8 reused (3 of them altered), **31 new** (4 vocabularies, 19 project-level, 6 planning, 2 per-user).

## Conventions carried over from KkarcDB

- `uuid` primary keys with `gen_random_uuid()`; stable `code` columns where the front end used semantic keys.
- `created_at`/`updated_at timestamptz` with the existing `set_updated_at()` trigger.
- `ON DELETE CASCADE` down the ownership tree (`project → sheet → task → subtask → event`); `SET NULL` on references that are pointers, not ownership (`source_meeting_item_id`, `stage_id`, `lane_id`).
- Plain SQL migrations, no `BEGIN/COMMIT`, no vendor features, applied by the existing `Migrator`; `app_meta.schema_version` bumps to `008`, `009` … (`007` is `consultant_contacts`)
- Seeds in `db/seed/`, idempotent with `ON CONFLICT DO NOTHING`.
- `db/verify.sql` extended with the new tables.

## Data flow

```
browser (project_hub.html)  ──JWT──▶  KKarcDB.Api  /api/hub/projects/{id}/…  ──Npgsql──▶  Supabase Postgres
                                          │
                                          └─▶ Supabase Storage (attachments), via service key held by the API
```

The front end keeps its current in-memory shape. A thin adapter replaces
`localStorage.getItem/setItem` with `GET /api/hub/projects/{id}/snapshot` on load and
per-entity `PUT`/`POST`/`DELETE` calls on each `save()`. Optimistic UI, last-write-wins
per row, and a `409` when `updated_at` no longer matches what the client last saw.

## Migration path

1. **Export.** Add JSON export to `project_hub.html` (planning_dashboard already has one). Ship it first; until it exists the data is one cleared cache from gone.
2. **Identity match.** For each exported `team[]`, `consultants[]`, `contacts[]`, `PROJECTS[]` entry, find or create the `person`, `firm`, `project`, `project_participant`, `project_assignment` row. This is a manual-review step: the blob has `'קנפו כלימור אדריכלים'` and KkarcDB may have `'קנפו כלמור'`.
3. **ETL.** Run the existing `migrateData()` ladder in Node to normalise the blob, then map to `hub_*` rows minting UUIDs, keeping an old-ID → UUID map for `fromEventId`, `sourceMeetingId`, `linkedRecordId`, `dependsOn`. Drop the duplicate lane copies. Split UI state into `hub_user_pref`. Upload attachments and swap data URLs for storage keys.
4. **Verify.** Row counts per table versus the blob; open the migrated project side by side with the local one.

## Out of scope

- The JSX decompile / restructure of `project_hub.html` (separate spec; should land first so the adapter is reviewable).
- The translation catalog (separate spec; unblocked by the `name_he/name_en` columns here).
- Realtime push, offline mode, and per-row history beyond `hub_activity`.
- `protein_explorer`.

## Open questions

- **Discipline code mapping.** Answered in the plan and stored on `discipline.legacy_code`: 19 of the dashboards' codes map onto disciplines that already exist, and none has to be created. `ENVI` was the one judgement call and is settled as `green`, green building, rather than `environment` — the consultant and the only task using the code both mean green building, whatever the app's label says.
- **Firm-name matching** is answered in the plan, and deliberately does not reuse `tools/consultant-extract/names.py`: that rule merges a landscape architect with an electrical engineer. Every non-exact merge is still reported for a human to read the first time.
