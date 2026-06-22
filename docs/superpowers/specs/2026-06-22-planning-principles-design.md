# עקרון תכנון (Planning Principles) — Design

## Context

During the project, important decisions come up (e.g. "we decided on X air
conditioning system" or "we decided on Y ceiling construction method") that
need to be tracked somewhere centrally, separate from the task they may have
originated from. Today there is no such registry in `project_hub.html`.

## Goal

A centralized, persisted list of "planning principles" (עקרונות תכנון), each
with a description, a discipline (תחום), a creation date, and an optional
reference back to the task it originated from. Principles can be created
either directly (standalone) or by flagging an existing task. Shown in two
places: a dedicated new sidebar page, and embedded in the existing "מבט על"
page.

## Data model

**Architecture constraint discovered during planning:** task-editing
components (`TaskDetailSidebar`, `ListView`) only ever see the data of the
single sheet they're rendering, not the top-level project `data` — there is
no plumbing today to let a checkbox deep inside a sheet's task detail view
write into a separate top-level array. Restructuring that plumbing is out
of scope for this feature. The data model below works within that
constraint by computing the principles table instead of storing it as one
independent array.

Tasks gain two new fields: `isPrinciple` (boolean, default `false`/absent)
and `principleCreatedAt` (ISO date string, set when `isPrinciple` is set to
`true`, left as-is once set — not cleared if unflagged then reflagged
later, to keep the "creation date" meaningful as "first flagged"). Both
live directly on the task object, alongside `priority`/`discipline`/etc. —
no new top-level array, no migration needed.

A new top-level array, `data.standalonePrinciples`, holds principles added
directly (not from a task):

```js
data.standalonePrinciples = [
  {
    id: uid(),
    description: 'מותקנת מערכת מיזוג אוויר VRF',
    discipline: 'HVAC',      // one of the existing discipline ids (DISCIPLINES)
    createdAt: '2026-06-22', // ISO date, set at creation time
  },
  ...
];
```

The principles **table shown to the user is computed, not stored**: a
shared helper function flattens every sheet's tasks where `isPrinciple`
is `true` (mapping each to a row with `description` = the task's `title`,
`discipline` = the task's `discipline`, `createdAt` = `principleCreatedAt`,
plus `sourceSheetId`/`sourceTaskId` pointing back to it) and concatenates
`data.standalonePrinciples` (mapped to rows with `sourceSheetId`/
`sourceTaskId` both `null`). Because it's computed from the live task data
on every render, a task-sourced row's description/discipline are **always
current** — editing the task's title or discipline later immediately
updates what the principles table shows. This trades the spec's original
"frozen snapshot" idea for live-synced data, which is simpler to implement
given the architecture constraint above and avoids ever showing stale
information.

## Creation flows

1. **From the new "עקרון תכנון" sidebar page**: a "+ הוסף עקרון" button opens
   a small inline form (description text + discipline picker, reusing the
   existing discipline-picker UI pattern already used elsewhere for tasks).
   Saves a new `data.standalonePrinciples` entry.
2. **From a task**: the task detail view (`TaskDetailSidebar`) gains a new
   checkbox, "עקרון תכנון", alongside the existing priority/discipline
   controls. Checking it sets `task.isPrinciple = true` and
   `task.principleCreatedAt = <today, ISO date>` on that task (a normal
   task field update through the existing sheet-scoped save path — no
   cross-component data access needed). The task then immediately appears
   as a row in the computed principles table (see Data model).

## Unlinking / deletion

- **Unchecking the checkbox on a linked task**, or **deleting a task that
  has `isPrinciple===true`**: show a confirmation prompt — "המשימה מקושרת
  לעקרון תכנון — הפעולה תסיר אותה מרשימת העקרונות. להמשיך?" (this task is
  linked to a planning principle — this will remove it from the principles
  list. Continue?).
  - **Yes**: the action proceeds (checkbox unchecked / task deleted). Since
    the principles table is computed from `isPrinciple`/existing tasks,
    the row disappears on its own — no separate record to clean up.
  - **No**: the action is cancelled; the task is left unchanged (still
    checked / not deleted).
- Deleting a standalone principle directly from either table view (an "✕"
  per row, same convention as other deletable list rows in the app)
  removes it from `data.standalonePrinciples` — no confirmation needed,
  since this is already the explicit destructive action and there's no
  linked task to worry about losing.
- Deleting a **task-sourced** row's "✕" from the table requires reaching
  into that task's sheet to set `isPrinciple` back to `false`. Both
  `OverviewPage` and the new principles page already receive the
  top-level `data`/`save` directly from `App()`, so they can do this
  themselves (no prop-drilling problem here — only the *creation* path
  from deep inside `TaskDetailSidebar` was constrained, not this one).

## Reference / navigation

Each computed row carries `sourceSheetId`/`sourceTaskId` (both `null` for
standalone rows, both set for task-sourced rows — see Data model). The
table's "מקור" cell: if `sourceTaskId` is set, render it as a clickable
reference (e.g. the task's title, or a small task icon) that navigates
to/opens that task's detail view. If `sourceTaskId` is `null` (standalone
principle), the cell shows a neutral placeholder (e.g. "—" or "נוסף
ישירות").

Since task-sourced rows are computed fresh from `data.sheets` on every
render, the source task is always found by construction — no "missing
source" case to handle for these rows. (If the sheet itself was deleted via
the טמפלייט hierarchy editor, the task and its `isPrinciple` flag are gone
with it, so the row simply stops appearing — same as any other
unflag/delete.)

## Display

Both locations render the **same full table**, columns: תיאור | תחום |
תאריך יצירה | מקור (+ a delete "✕" per row, + an add-row affordance).

1. **New sidebar page** — a new `PROJ_TRACKS` entry, "עקרון תכנון" (same
   pattern as the "טמפלייט" entry added previously: new icon, new
   `track==='principles'` route in `App()`, new `PrinciplesView` component).
   This page shows only the principles table (plus the "+ הוסף עקרון" add
   form).
2. **"מבט על"** (`OverviewPage`) — the same table is embedded somewhere in
   the existing page layout (exact placement decided during planning, after
   reading the current `OverviewPage` layout — likely a new section
   alongside the existing goals/milestones sections), reusing a shared
   table-rendering piece so both locations can't drift apart in markup.

## Out of scope

- Any integration with meetings (ישיבות) or email — neither exists as real
  data in this app today (ישיבות is a `ComingSoonPage` placeholder, there is
  no email integration at all). Linking a principle to a meeting or an email
  is explicitly deferred to a future, separate design once those features
  exist.
- Editing a standalone principle's description/discipline after creation
  (not requested; can be added later if needed).
- Restructuring `TaskDetailSidebar`/`ListView` to receive top-level project
  data — the computed-table approach in this spec works within the
  existing architecture instead.

## Scope check

Touches: two new task fields (`isPrinciple`, `principleCreatedAt`, no
migration needed — both default to absent/`false`), one new top-level
data array (`data.standalonePrinciples`, defaults to `[]` when absent),
one new sidebar page + route, one new checkbox + confirmation flow inside
the existing task detail view, one shared "compute principles table from
data" helper function, and one shared table-rendering piece reused in two
places (the new page and `OverviewPage`). This is a single cohesive
feature appropriate for one implementation plan.
