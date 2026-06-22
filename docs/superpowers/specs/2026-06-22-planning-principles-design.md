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

A new top-level array, `data.principles`:

```js
data.principles = [
  {
    id: uid(),
    description: 'מותקנת מערכת מיזוג אוויר VRF',
    discipline: 'HVAC',           // one of the existing discipline ids (DISCIPLINES)
    createdAt: '2026-06-22',      // ISO date, set at creation time
    sourceSheetId: 'abc123',      // null if added standalone (no source task)
    sourceTaskId: 'def456',       // null if added standalone
  },
  ...
];
```

`description`/`discipline` are a **one-time copy** taken from the task at
the moment it's flagged (or typed directly for a standalone principle) —
**not** live-synced afterward. Editing the task's title/discipline later
does not change the principle record, and editing the principle record
(if editing is ever added) does not change the task. This keeps the model
simple: a principle is its own independent record from the moment it
exists, with `sourceSheetId`/`sourceTaskId` kept purely as a "jump to
origin" reference link, not a live join.

Tasks gain one new field: `isPrincipleId` — `null` normally, or set to the
matching `data.principles[].id` when this task is the one that created a
linked principle record. (Storing the principle's id on the task, rather
than a bare boolean, makes "is this task linked, and to which record" a
single lookup with no separate scan needed.)

## Creation flows

1. **From the new "עקרון תכנון" sidebar page**: a "+ הוסף עקרון" button opens
   a small inline form (description text + discipline picker, reusing the
   existing discipline-picker UI pattern already used elsewhere for tasks).
   Saves a new `data.principles` entry with `sourceSheetId`/`sourceTaskId`
   both `null`.
2. **From a task**: the task detail view (`TaskDetailSidebar`) gains a new
   checkbox, "עקרון תכנון", alongside the existing priority/discipline
   controls. Checking it:
   - Creates a new `data.principles` entry, copying the task's current
     `title` → `description` and `discipline` → `discipline`,
     `sourceSheetId`/`sourceTaskId` pointing back to this task, `createdAt`
     set to today.
   - Sets `task.isPrincipleId` to the new record's id.

## Unlinking / deletion

- **Unchecking the checkbox on a linked task**, or **deleting a task that
  has `isPrincipleId` set**: show a confirmation prompt — "המשימה מקושרת
  לעקרון תכנון — למחוק גם אותו?" (this task is linked to a planning
  principle — delete it too?).
  - **Yes**: the `data.principles` record is deleted.
  - **No**: the task proceeds with its action (unchecked / deleted) but the
    `data.principles` record stays, with `sourceSheetId`/`sourceTaskId` set
    to `null` (the reference is cleared since the source no longer
    exists/is no longer flagged — the record itself is untouched
    otherwise).
- Deleting a principle directly from either table view (an "✕" per row,
  same convention as other deletable list rows in the app) always just
  deletes the `data.principles` record. If that record still has a
  `sourceTaskId`, also clear that task's `isPrincipleId` back to `null` (so
  the task's checkbox correctly shows unchecked afterward) — no
  confirmation needed in this direction, since deleting from the
  principles table is already the explicit destructive action.

## Reference / navigation

Each table row shows a "מקור" cell: if `sourceTaskId` is set, render it as
a clickable reference (e.g. the task's title, or a small task icon) that
navigates to/opens that task's detail view. If `sourceTaskId` is `null`
(standalone principle, or source was cleared per the unlink flow above),
the cell shows a neutral placeholder (e.g. "—" or "נוסף ישירות").

Resolving the click target requires finding the task across whichever
sheet `sourceSheetId` points to — search that sheet's `tasks` array for
`sourceTaskId`. If the sheet or task can no longer be found (e.g. sheet was
deleted via the טמפלייט hierarchy editor), treat it the same as
`sourceTaskId: null` (show the neutral placeholder) rather than erroring.

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
- Live-sync between a task's title/discipline and its linked principle
  record after creation (see Data model section — it's a one-time copy).
- Editing a principle's description/discipline after creation (not
  requested; can be added later if needed).

## Scope check

Touches: one new top-level data array (`data.principles`) with no
migration needed (defaults to `[]` when absent — no old data references
it), one new task field (`isPrincipleId`), one new sidebar page + route,
one new checkbox + confirmation flow inside the existing task detail view,
and one shared table component reused in two places. This is a single
cohesive feature appropriate for one implementation plan.
