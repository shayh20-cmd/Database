# עקרון תכנון — Extension: Subtask Support, Menu Action, Row Icon

## Context

The base "planning principles" feature (`docs/superpowers/specs/2026-06-22-planning-principles-design.md`) lets a user flag a top-level task as a principle via a checkbox inside `TaskDetailSidebar`. This extension adds three things, all to the same feature:

1. The same flag/unflag capability on **subtasks**, not just top-level tasks.
2. A **quicker entry point**: a context-menu action (alongside "מחק משימה"/"מחק תת-משימה" etc.) to toggle the flag, instead of requiring the user to open the task detail panel.
3. A **visual indicator**: a small icon next to the title in the row itself, so flagged tasks/subtasks are recognizable at a glance without opening anything.

## Decisions

### 1. Subtask data model

Subtasks gain the same two fields tasks already have: `isPrinciple` (boolean) and `principleCreatedAt` (ISO date, set once on first flag, same semantics as tasks — see the base spec's Data model section).

### 2. Toggling via context menu (tasks and subtasks)

`TaskRow`'s `MENU_ITEMS` (`project_hub.html:4006-4013`) and `SubtaskRow`'s `SUB_ITEMS` (`project_hub.html:2847-2853`) each gain one new item, inserted before the `null` divider that precedes the destructive "מחק" item:

- Label toggles based on current state: `task.isPrinciple ? 'הסר מעקרון תכנון' : 'סמן כעקרון תכנון'` (same pattern for subtasks).
- Turning **on**: no confirmation, same as the existing checkbox.
- Turning **off** (currently flagged): same confirmation prompt already used elsewhere in this feature — "המשימה מקושרת לעקרון תכנון — הפעולה תסיר אותה מרשימת העקרונות. להמשיך?" (worded for "תת-המשימה" when acting on a subtask). Cancelling leaves the flag untouched.
- The existing checkbox inside `TaskDetailSidebar` is unaffected by this change — both entry points (checkbox and menu item) toggle the same `isPrinciple` field, so they always stay in sync; this is not a second independent flag.

### 3. Row icon (visual indicator)

When `task.isPrinciple` (or `subtask.isPrinciple`) is true, render the existing `principles` icon (already defined in `ICONS`, used for the sidebar nav entry) inline, immediately before the title text, in both:
- `TaskRow`'s title span (`project_hub.html:3868-3872`)
- `SubtaskRow`'s title span (`project_hub.html:2792-2795`)

Small size (e.g. 11px), muted color (`var(--text-3)` or the accent color used elsewhere for similar small badges), no click behavior of its own (purely informational — toggling still happens via the menu item or the detail checkbox).

### 4. `computePrinciples` extended to scan subtasks

`computePrinciples(data)` (`project_hub.html:5974+`) gains a second pass: for every task, also flatMap over `task.subtasks||[]`, filter for `isPrinciple`, and produce rows shaped like:

```js
{
  id: subtask.id,
  description: subtask.title || '',
  discipline: subtask.discipline || '',
  createdAt: subtask.principleCreatedAt || '',
  sourceSheetId: sheet.id,
  sourceTaskId: task.id,        // the PARENT task — for navigation/reference
  sourceSubtaskId: subtask.id,  // distinguishes "this row is a subtask" from a task-level row
}
```

Task-level rows keep `sourceSubtaskId: undefined`/absent (no change to their existing shape). The "מקור" column's existing logic (clickable when `sourceTaskId` is set) continues to work unchanged for subtask rows too, since it already only checks `sourceTaskId` — clicking it still does the same scoped-down navigation (switch to "ניהול תכנון") already implemented for task-level rows, not a deep link to the specific subtask.

### 5. Unflagging from the principles table

`unflagPrincipleTask` (the existing helper used when deleting a row from the principles table) needs a subtask-aware counterpart, since clearing the flag on a subtask requires reaching one level deeper into the task's `subtasks` array than the existing helper does. A new `unflagPrincipleSubtask(data, save, sheetId, taskId, subtaskId)` helper is added alongside it, and `principlesDeleteHandler`'s branching gains a third case: if `p.sourceSubtaskId` is set, call the new subtask-aware helper; else if `p.sourceTaskId` is set (and no `sourceSubtaskId`), call the existing task-level helper; else it's a standalone principle.

### 6. Deleting a flagged subtask

`deleteSubtask` (`project_hub.html:3841`, inside `TaskRow`) gains the same confirmation guard `deleteTask` already has: look up the subtask by id, and if it's flagged, confirm before removing it (same message, "תת-המשימה" instead of "המשימה" if a wording distinction is wanted — using the same exact wording as tasks is also acceptable and simpler; final call deferred to the plan/implementation, not a meaningful design decision either way).

## Out of scope

- Nested subtasks (a subtask's own `subtasks` array, used for "process" tracking — see `migrateTask`/`nestedSubs` elsewhere in the file) — not included in this round. Only direct (first-level) subtasks of a task.
- Any change to the base feature's standalone-principle creation flow, the dedicated "עקרון תכנון" page, or the "מבט על" embed — those continue to work as already built, just now also showing subtask-sourced rows once `computePrinciples` is extended.

## Scope check

This is a direct extension of the already-implemented base feature, touching: 2 new fields (on a different object shape — subtask, not task), 2 new context-menu items, 2 new icon renders, 1 extended computation function, 1 new helper function, 1 extended branching function, and 1 new confirmation guard. Single cohesive unit of work, appropriate for one implementation plan.
