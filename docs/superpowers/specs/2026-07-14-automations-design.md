# Automations (אוטומציות) — Design

## Context

`project_hub_01.html` (single-file React 18, Babel standalone, Hebrew RTL)
manages tasks across tracks/stages/sheets. Every data mutation flows through
`App`'s central `save(nd)` callback (~line 1246), which stamps `_ts`, pushes
undo history, and persists. The user wants Asana-style rule automations:
"when X happens → check that Y holds → do Z", built visually and actually
executing against live data.

Reference: Asana's rule builder — three connected cards (When / Check if /
Do this) with a searchable picker sidebar per card.

## Goal

1. A new "אוטומציות" tab in `TemplateView` (fourth tab after כללי / סכימת
   עבודה / שדות) listing all saved automations with create/edit/delete/toggle.
2. A visual rule builder: three linked cards — **כאשר… → תבדוק ש… →
   תעשה…** — each opening a searchable options panel, RTL-mirrored from the
   Asana reference.
3. A real execution engine: rules run when task data changes (and on app
   load for time-based triggers).
4. Per-rule scope (whole project or selected sheets), plus an "אוטומציות"
   button in the task-list toolbar showing/toggling the rules that apply to
   the current sheet.

## Data Model

New root keys (defaulted in `migrateData` like `data.fields` was):

```js
data.automations = [{
  id, name,                 // display name
  enabled: true,
  scope: 'all' | [sheetId], // sheets this rule applies to
  trigger:   {type, params},        // exactly one
  condition: {type, params} | null, // optional, single (linear rule)
  actions:   [{type, params}]       // one or more, run in order
}]
data.automationLog = [{ id, ruleId, taskId, at, dedupeKey }]
```

`automationLog` serves two purposes: an execution record, and dedupe for
time-based triggers — e.g. "due date approaching" fires once per
(ruleId, taskId, dueDate value); if the due date changes, it may fire again.
Log is capped (most recent ~200 entries).

## Catalog

All option ids/params resolve against existing app constants: `STATUSES`,
`PRIORITIES`, `DISCIPLINES`, staff (`data.staff`/`OFFICE_STAFF`), sheet
groups, and project custom fields (`data.fields`).

**Triggers (כאשר):**
| id | label | params |
|---|---|---|
| task-added | משימה נוספה | — |
| task-moved | משימה הועברה לקבוצה | groupName (optional: any) |
| status-changed | סטטוס השתנה | toStatusId (optional: any) |
| task-completed | משימה הושלמה | — |
| priority-changed | עדיפות השתנתה | toPriority (optional) |
| discipline-changed | תחום השתנה | toDiscipline (optional) |
| assignee-changed | אחראי השתנה | toStaffId (optional) |
| duedate-changed | תאריך יעד השתנה | — |
| duedate-approaching | תאריך יעד מתקרב | days (N before due) |
| task-overdue | משימה באיחור | — |
| field-changed | שדה מותאם השתנה | fieldId, toValue (optional) |
| subtasks-completed | כל תתי-המשימות הושלמו | — |

**Conditions (תבדוק ש):**
| id | label | params |
|---|---|---|
| in-group | נמצאת בקבוצה | groupName |
| status-is | סטטוס הוא | statusId |
| priority-is | עדיפות היא | priority |
| discipline-is | תחום הוא | discipline |
| assignee-is | אחראי הוא | staffId |
| duedate-is | תאריך יעד | before/after + date, or empty |
| field-is | ערך שדה הוא | fieldId, value |
| tasktype-is | סוג משימה | simple/process |

**Actions (תעשה):**
| id | label | params |
|---|---|---|
| move-to-group | העבר לקבוצה | groupName |
| set-status | שנה סטטוס ל | statusId |
| complete-task | סמן כהושלמה | — |
| set-priority | שנה עדיפות ל | priority |
| set-discipline | שנה תחום ל | discipline |
| set-assignee | שנה אחראי ל | staffId |
| set-duedate | קבע תאריך יעד | absolute date, or +N days from today |
| set-field | קבע ערך שדה | fieldId, value |
| add-update | הוסף עדכון למשימה | note text (appended as an event on the task's timeline, today's date) |
| add-subtask | צור תת-משימה | title |

`task-moved`/`in-group`/`move-to-group` match groups **by name** (not id),
since group ids differ per sheet and a project-scoped rule must work across
sheets; the builder offers the union of group names across the rule's scope.

## Execution Engine

Wraps the central save path in `App`: a pure function
`runAutomations(prevData, nextData)` is called inside `save` before
persisting. It:

1. Indexes tasks by id in prev/next; for each task that was added or whose
   watched fields differ, matches enabled rules whose scope includes that
   task's sheet and whose trigger fits the change.
2. Evaluates the rule's condition (if any) against the task's **new** state.
3. Applies actions immutably to `nextData`, appends log entries, and returns
   the final data — a **single pass**: rule actions never trigger other
   rules (no chaining/loops by design).
4. `save` persists the returned data; the undo entry covers the user's
   change plus automation effects as one step.

Time-based triggers (duedate-approaching, task-overdue) are additionally
evaluated once on app load (after `migrateData`), using `automationLog`
dedupe keys so a rule fires once per task per due-date value.

## UI

**TemplateView "אוטומציות" tab** — rule list: each row shows enabled
toggle, name, human-readable summary (כאשר X ← בדוק Y ← עשה Z), scope
label, edit (opens builder), delete (with confirm). "+ אוטומציה חדשה"
button opens an empty builder.

**Builder** — replaces the tab's content area (full-width). Top bar: name
input, scope picker (כל הפרויקט / multi-select of list sheets), שמירה /
ביטול buttons (save disabled until trigger + ≥1 action are set). Canvas:
three cards right-to-left — כאשר… / תבדוק ש… (optional; removable via ✕
like the reference) / תעשה… — connected by lines. Clicking a card opens a
picker panel on the **left** (RTL mirror of the reference): search box +
categorized option list; picking an option that needs params shows its
param controls (selects/date/number/text drawing on the existing constants)
inside the card. The condition card shows "+ הוסף תנאי" when empty.

**Task-list toolbar** — an "אוטומציות" button (next to הגדרות) opens a
small panel listing rules whose scope covers the current sheet, each with
its enabled toggle and an edit shortcut that navigates to the Template tab
builder for that rule.

## Non-Goals / Deferred

- No condition/action **branches** (Asana's "Add branch") — linear rules
  only; parallel logic = create another rule with the same trigger.
- No rule chaining (actions triggering other rules).
- No scheduled-time trigger ("every Monday…"), external triggers, or AI
  options from the reference screenshots.
- No notifications/email — actions only mutate project data.
- Subtask-level triggers/actions beyond `subtasks-completed`/`add-subtask`.
