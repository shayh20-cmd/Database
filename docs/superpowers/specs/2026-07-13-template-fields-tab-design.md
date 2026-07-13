# Template "שדות" (Fields) Tab — Design Spec

## Goal

Add a "שדות" (Fields) tab to `TemplateView` where custom fields for the project can be created (pick a type → configure), and where every existing field is listed with an indicator of how many stages/sheets show it — matching the general shape of the attached reference image (type-picker grid + field list with usage), scoped down to fit this app's actual data model (see Decisions below).

## Current behavior

- `TemplateView({data,save})` (project_hub_01.html, ~line 1233) renders two tabs via `activeTab` state: `general` (`'כללי'`, currently just a placeholder `"—"`) and `work` (`'סכימת עבודה'`, the track/stage/category management UI). `data` here is the **whole app data object** (has `.tracks`, `.sheets`).
- Custom fields currently live **per sheet**: `sheet.fields` (array of `{id,title,type,options?,...}`), initialized to `[]` by `makeEmptySheet` and in every sheet in `makeDefaultData`. Verified in the live data file (`data/project_hub_01.json`): all 6 sheets currently have empty `fields` arrays — no real data to migrate.
- `FIELD_TYPES` (already defined): `single-select`, `multi-select`, `date`, `people`, `number`, `text`, `timeline` — each with a `label`/`icon`.
- `SettingsPanel({data,save,onClose})` is opened from inside a single sheet's list view (`data` there = that one sheet, not the whole app). Its `'fields'` sub-view lists `BUILTIN_FIELDS` (fixed, unaffected by this spec) plus `fields` (`sheet.fields`), with add/edit/delete wired to `AddFieldModal` / `EditFieldModal`, and a `toggleCol(id)` that flips `sheet.hiddenCols[id]`.
- `AddFieldModal({onSave,onClose,fieldToEdit})` and `EditFieldModal({field,isBuiltin,onSave,onDelete,onClose})` already implement the "pick a type → panel with type-specific options (e.g. option list for select types)" behavior the reference image shows. This spec reuses them as-is, just repointing what they save into.
- **Column visibility mechanics** (important, discovered during investigation): a sheet's visible custom-field columns are computed as `fields.filter(f=>!hiddenCols[f.id])` — i.e. **every field in `fields` is visible on that sheet by default**, unless explicitly hidden via `hiddenCols`. There is no separate "add this field to this sheet" step today. `colOrder` only governs ordering/visibility of **built-in** columns (merged against `COL_ORDER_DEFAULT`); it does not gate custom fields.

## Decisions (confirmed during brainstorming)

1. **No cross-project library.** This app is one project per data file; "library" = all fields already defined in *this* project, not shared across other `project_hub_01.json`-style files.
2. **Fields become project-wide.** Move from `sheet.fields` to `data.fields` (root-level array). A field created once is available to every sheet.
3. **Usage metric = number of sheets showing the column**, not number of tasks with a value set.
4. **Two sections, not three.** Since "used in project" and "library" collapse to the same underlying list once it's project-wide-only, the tab shows: **(a) Create** grid, **(b) Project Fields** list (each row shows its usage count).
5. **Existing field types only** — single-select, multi-select, date, people, number, text, timeline. No formula/percent/currency/ID/timer/reference.
6. **Per-sheet settings panel becomes visibility-only for custom fields.** Its `'fields'` sub-view keeps the built-in fields section unchanged, but for custom fields it no longer offers add/edit/delete — only a toggle (reusing the existing `toggleCol`/`hiddenCols` mechanism) for "show this project field on this sheet". Creating/editing/deleting a field's definition happens only in the new tab.

## New tab structure

Add `{id:'fields',label:'שדות'}` to `TemplateView`'s tab array (`[general, work]` → `[general, work, fields]`), and an `activeTab==='fields'` branch alongside the existing two.

**Create section:** grid of the 7 `FIELD_TYPES` as clickable cards (icon + label, styled like the existing type-menu options in `AddFieldModal`). Clicking a card opens `AddFieldModal` seeded to that type by passing `fieldToEdit={type: clickedTypeId}` (no `id`/`title`) — this needs no change to `AddFieldModal` itself: its `type` state already initializes from `fieldToEdit?.type`, and `handleSave`'s `{...(fieldToEdit||{}), title, type}` spread produces a clean new-field object since there's no stray `id` to leak in. On save, appends to `data.fields` via `save({...data, fields:[...(data.fields||[]), {...f,id:uid()}]})` (mirrors today's `SettingsPanel.addField`, just targeting root `data` instead of the sheet).

**Project Fields list:** one row per `data.fields` entry — icon (from `FIELD_TYPES`), title, and a usage badge computed as:
```js
const usageCount = (data.sheets||[]).filter(s => !(s.hiddenCols||{})[field.id]).length;
```
Clicking a row opens `EditFieldModal` (same component `SettingsPanel` already uses for non-builtin fields: `isBuiltin:false`, `onDelete` wired to remove the field from `data.fields`).

**Note on the usage number:** because visibility defaults to "on" for every sheet unless explicitly hidden, a **brand-new field's usage count will show as "shown in N/N sheets" immediately** — before anyone has actually added a value anywhere. This is a direct, correct consequence of decision #3 combined with the app's existing default-visible column behavior; it is not a bug, just worth knowing going in (a field only shows a *lower* count once someone has actively hidden it from specific sheets).

## Data migration

`migrateData` gains: default `data.fields = data.fields || []` at the root. `makeDefaultData` gets `"fields":[]` added alongside `sheets`. No per-sheet `fields` values need merging (all currently empty) — leftover `sheet.fields` keys can simply become dead/unused (not read from anymore); no need to strip them from existing sheet objects.

## Non-goals

- No change to `BUILTIN_FIELDS`, `COL_ORDER_DEFAULT`, or built-in column behavior.
- No new field types (formula/percent/currency/ID/timer/reference) — out of scope per decision #5.
- No fix to `CustomFieldCell`'s existing limitation where `text`/`people`/`single-select`/`multi-select`/`timeline` all render as plain editable text ("for now" per existing code comment) — pre-existing behavior, unrelated to field *management*, which is this spec's scope.
- No per-task/per-sheet-column "add to this sheet" step — visibility toggle only, matching the existing hide/show mechanism.

## Testing / verification

Manual, via the preview tools (`http://localhost:3403/project_hub_01.html`):
1. Open Template → שדות tab, confirm it appears as a third tab alongside כללי/סכימת עבודה.
2. Click each of the 7 type cards in Create, confirm `AddFieldModal` opens pre-seeded to that type; save a field of each type, confirm it appears in the Project Fields list.
3. Confirm a newly created field's usage badge shows all sheets (e.g. "6/6") given default-visible behavior.
4. Go to an existing sheet's settings (gear icon) → fields; confirm the field appears there as a visibility toggle only (no add/edit/delete for custom fields), toggle it off, return to the שדות tab and confirm the usage count decremented by 1.
5. Edit a field from the שדות tab (rename, add/remove options for select types), confirm changes reflect on any sheet showing that column.
6. Delete a field from the שדות tab, confirm it disappears from the Project Fields list and no longer renders as a column on any sheet.
