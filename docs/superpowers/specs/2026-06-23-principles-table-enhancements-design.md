# עקרון תכנון Table Enhancements — Design

## Context

The "עקרון תכנון" table (shared `PrinciplesTable` component, shown on its own sidebar page and embedded in "מבט על") currently has columns: תיאור | תחום | תאריך יצירה | מקור | ✕. Rows are computed live from flagged tasks/subtasks plus standalone entries (`computePrinciples`, see `docs/superpowers/specs/2026-06-22-planning-principles-design.md` and its extension spec).

## Goal

1. Add a column showing which track/stage a task-or-subtask-sourced row came from.
2. Make standalone (manually-added) rows' תיאור/תחום/תאריך יצירה editable inline.
3. Render תחום as the same colored pill used everywhere else in the app, instead of plain text.

## Decisions

### 1. New "מסלול/שלב" column

Inserted between "תאריך יצירה" and "מקור". For task/subtask-sourced rows, `computePrinciples` gains two more fields per row:

```js
trackLabel: trackLabelOf(data.tracks||[], sheet),  // reuses the existing helper
stageLabel: sheet.name,
```

(`trackLabelOf` already exists, used by `NihulTikhnunView` — see `docs/superpowers/specs/2026-06-22-template-hierarchy-editor-design.md`.) Standalone rows get `trackLabel: null, stageLabel: null`.

Display: `מסלול: {trackLabel} / שלב: {stageLabel}` when `trackLabel` is set; otherwise `—`.

### 2. Discipline as a colored pill

The תחום cell renders the same way the rest of the app already renders a discipline value — look up the matching entry in `DISCIPLINES` and render `<span className="pill" style={{color:'#fff',background:disc.color}}>{disc.label}</span>` (this exact pattern is already used in ~10 other places in the file, e.g. around `project_hub.html:1910,1976,2468`). Falls back to "—" when no discipline is set, matching the table's existing convention for empty cells.

### 3. Inline editing — standalone rows only

Task/subtask-sourced rows' תיאור/תחום/תאריך יצירה stay read-only in this table — editing those means editing the task itself (clicking the row's "מקור" link already takes the user there). This was explicit in the request ("אם זה נוצר ידני אז צריך אפשרות לערוך").

For standalone rows (`sourceTaskId` and `sourceSubtaskId` both absent/null):
- **תיאור**: click the text → becomes a text input, same commit-on-blur/Enter, cancel-on-Escape pattern already used throughout this file (e.g. `TemplateView`'s track/stage rename, `PrinciplesView`'s existing add-form).
- **תחום**: click the pill (or the "—" placeholder when empty) → opens the existing `DisciplineCell` picker (the same component already used in `PrinciplesView`'s add-form) to pick a new value.
- **תאריך יצירה**: click the date text → becomes a native `<input type="date">`, defaulting to its current value (which itself defaulted to the creation day, per existing `addStandalonePrinciple` behavior) — committing on blur/change.

All three edits call a new helper `updateStandalonePrinciple(data, save, id, patch)` that merges `patch` into the matching `data.standalonePrinciples` entry — mirroring `deleteStandalonePrinciple`'s existing shape.

`PrinciplesTable` needs a way to know editing is even possible for a given row and to call back into this helper — it gains a new prop, `onEditStandalone(id, patch)`, wired up by both `PrinciplesView` and `OverviewPage` (alongside the `onDeleteRow`/`onOpenSource` props they already pass) to `principlesUpdateHandler(data, save)` (a small factory mirroring the existing `principlesDeleteHandler`, calling `updateStandalonePrinciple`). `PrinciplesTable` only renders the edit affordance when a row has no `sourceTaskId`/`sourceSubtaskId` — task/subtask rows ignore `onEditStandalone` entirely.

## Out of scope

- Editing task/subtask-sourced rows' fields from this table (must go through the task itself).
- Editing/showing track/stage for standalone rows (they have none).
- Any change to `computePrinciples`'s task/subtask scanning logic itself, beyond adding the two new label fields.

## Scope check

Touches: `computePrinciples` (2 new fields per task/subtask row), one new helper (`updateStandalonePrinciple`) + one new handler factory (`principlesUpdateHandler`), `PrinciplesTable` (one new column, pill rendering, inline-edit affordances gated by row source), and both its two call sites (`PrinciplesView`, `OverviewPage`) wiring the new prop through. Single cohesive UI/data enhancement to an existing feature, appropriate for one implementation plan.
