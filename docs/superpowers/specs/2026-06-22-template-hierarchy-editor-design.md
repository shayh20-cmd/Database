# Template Page — Track/Stage Hierarchy Editor

## Context

`project_hub.html`'s "ניהול תכנון" view (`NihulTikhnunView`) currently derives
its track tabs from a hardcoded constant:

```jsx
const NT_TRACK_TABS = [
  {id:'ongoing',   label:'ניהול שוטף',  match: s => s.track==null},
  {id:'licensing', label:'מסלול רישוי', match: s => s.track==='licensing'},
];
```

Each "stage" is a regular sheet (`data.sheets[i]`, `type==='list'`) tagged
with `s.track` (`null` or `'licensing'`). There is no persisted, orderable
list of tracks/stages anywhere — the structure only exists as code. The
combined view (`מבט מאוחד`) and the "ניהול תכנון" tab row (already changed
in a prior commit to show only `מבט מאוחד`) both depend on this constant via
`trackLabelOf(s)`.

A separate top-level sidebar page, "מסלול רישוי" (its own `function` further
down the file, around line 10480+), independently filters/creates sheets via
`s.track==='licensing'` (its own `addSheet` hardcodes `track:'licensing'`).
This other page is unrelated to the new editor and **must not be touched** —
it happens to read the same `s.track` field but is a separate feature.

## Goal

Add a new sidebar page ("טמפלייט") with a tab ("סכימת עבודה") that displays
the track→stage hierarchy as an editable nested-box tree, and makes that
hierarchy a real, persisted, editable data structure that "ניהול תכנון" and
`מבט מאוחד` read from — instead of the hardcoded `NT_TRACK_TABS` constant.

## Decisions

### 1. Sidebar entry

A new button appears in the current project's sidebar (where "ספריית לוד"
already lists מבט על / ניהול תכנון / מסלול רישוי / ... — see
`project_hub.html` sidebar list, the same level as those existing buttons),
labeled "טמפלייט". Clicking it opens a new page component with two tabs in
its header: "כללי" and "סכימת עבודה" (default-active tab: סכימת עבודה,
since כללי is an empty placeholder for now). "כללי" renders an empty
placeholder `<div>` — no content, to be designed later.

### 2. Data model — `data.tracks`

A new top-level array, `data.tracks`, becomes the single source of truth for
the "ניהול תכנון" track/stage hierarchy:

```js
data.tracks = [
  {id:'ongoing',   label:'ניהול שוטף',  trackValue:null,        stageOrder:['sheetId1','sheetId2']},
  {id:'licensing', label:'מסלול רישוי', trackValue:'licensing', stageOrder:['sheetId3']},
];
```

- `id`: stable internal id for the track (generated via `uid()` for new
  tracks; the two existing tracks keep `'ongoing'`/`'licensing'` ids).
- `label`: display name, editable inline.
- `trackValue`: the value stored in each member sheet's existing `s.track`
  field (`null` for the default/no-track sheets, `'licensing'` for the
  existing licensing sheets, or a freshly generated string id for any new
  track created in the editor). This field is **never shown to the user**
  and exists purely so existing code that filters sheets by `s.track` keeps
  working unchanged.
- `stageOrder`: ordered array of sheet ids belonging to this track —
  defines display order in both the editor and (where order matters)
  elsewhere.

**Migration:** On load (in `migrateData`, alongside the existing migration
logic around `project_hub.html:1674-1675`), if `data.tracks` is missing,
synthesize it once from the current `NT_TRACK_TABS` definitions and the
current sheet order: for each `NT_TRACK_TABS` entry, collect matching sheets
(`allSheets.filter(s=>s.type==='list' && entry.match(s))`) in their existing
array order to seed `stageOrder`. This makes old saved data forward-compatible
without any user action.

### 3. Wiring "ניהול תכנון" and מבט מאוחד to `data.tracks`

- `NT_TRACK_TABS` (the hardcoded constant) is removed.
- `trackLabelOf(s)` becomes: find the track in `data.tracks` whose
  `trackValue === s.track`, return its `label` (fallback: `s.track` or
  `'ניהול שוטף'`, same fallback behavior as before).
- The track tab bar inside `NihulTikhnunView` and `visibleSheets` filtering
  read from `data.tracks` (matching `s.track === track.trackValue`) instead
  of `NT_TRACK_TABS`. Per the prior change, only the `מבט מאוחד` tab is
  shown in that row regardless — this spec doesn't change that, it only
  changes where the underlying track *data* comes from.
- `combinedSourceSheets`/`combinedData` in `NihulTikhnunView` continue to
  flatten across **all** sheets exactly as today; `__track`/`__stage`
  tagging now resolves track labels via the updated `trackLabelOf`.
- Sheet display order within a track (wherever it's iterated, e.g. building
  `visibleSheets`) follows `track.stageOrder` when available, falling back
  to natural array order for any sheet not yet listed in `stageOrder` (e.g.
  a sheet added by some other code path).

### 4. Hierarchy tree visualization (סכימת עבודה tab)

Per the approved mockup: one root node at the top ("ניהול תכנון", static
label, not editable — it's the page/view name, not a track) connected by a
single vertical line to a row of track boxes. Each track box is a container
(rounded rect, light-blue background) holding:
- The track label (clickable text → inline rename, same inline-edit pattern
  used elsewhere in the app, e.g. group rename in `ListView`).
- A "✕" delete-track button.
- A list of its stages, each rendered as a small card row inside the
  container: stage name (clickable → inline rename, renames the underlying
  sheet's `s.name` since `__stage` is derived from `s.name`), a "✕"
  delete-stage button, and a drag handle.
- An "+ הוסף שלב" row at the bottom of the container, which creates a new
  empty sheet (same shape as the existing `addSheet` at
  `project_hub.html:10483-10484`, but with `track: trackValue` of *this*
  track) and appends its id to `stageOrder`.
- Stages can be reordered by drag-and-drop within their track's container
  (mutates `stageOrder` for that track only — no cross-track drag in this
  version).

To the right of the track boxes, a dashed "+ מסלול" box adds a new track:
prompts for a label (reusing the same inline-rename input pattern, opened
immediately in "naming" state for the new box), generates a fresh `id` and
`trackValue`, and appends `{id, label, trackValue, stageOrder:[]}` to
`data.tracks`.

**Deleting a track** is only allowed when it has zero stages (`stageOrder`
empty) — if it still has stages, the "✕" is disabled with a tooltip
("יש להעביר או למחוק את השלבים לפני מחיקת המסלול"). This avoids ambiguous
behavior around orphaned sheets.

**Deleting a stage** removes the sheet from `data.sheets` entirely (its
tasks are deleted, this is real data loss) and removes its id from
`stageOrder`. Requires a confirmation prompt (`window.confirm`-style, or the
app's existing confirm-dialog pattern if one exists) before proceeding,
since this destroys task data — same caution as any other sheet deletion
elsewhere in the app.

## Out of scope

- The unrelated "מסלול רישוי" top-level sidebar page and its own
  `addSheet`/sheet-tabs — untouched.
- Renaming "שלב" to any other term anywhere in the app (explicitly decided
  against — stays "שלב" everywhere, including this new editor).
- The "כללי" tab's actual content (placeholder only).
- Cross-track drag-and-drop of stages (moving a stage from one track to
  another) — stages can only be reordered within their own track for now.
- Any change to the top-level sidebar items that are NOT tracks today
  (מבט על, ישיבות, פיקוח, מסלול תכנון מפורט, מסלול ביצוע) — this spec only
  covers the "ניהול תכנון" track/stage hierarchy.

## Scope check

This touches: one new top-level page component + sidebar entry, one new
data array (`data.tracks`) with a one-time migration, and updates to
`trackLabelOf`/`NihulTikhnunView`'s tab-bar and sheet-filtering logic to read
from it instead of the hardcoded constant. It's a single cohesive feature
(the hierarchy editor and the data it edits can't be meaningfully split into
independent specs) appropriate for one implementation plan.
