# Track Grouping — Pill Style Design

## Context

`project_hub.html` ("ספריית לוד" PROJECT HUB) has a combined cross-track/stage
task view (`מבט מאוחד`). Task grouping hierarchy is:

```
מסלול (track) → שלב (stage) → משימות (tasks) → תתי משימות (subtasks)
```

Today, when the user filters by stage, an existing auto-switch effect
(`project_hub.html` ~line 6330-6334) sets `groupByState` to
`[{field:'__stage'}]`, making stage the primary virtual-group field. Since
the primary virtual-group row always renders with the `sec-row` class, stage
already visually matches a regular section ("מקטע") tab — no change needed
there.

When the user filters by track instead, `groupByState` becomes
`[{field:'__track'}]`, and track also renders via the same generic `sec-row`
styling as stage/section. This makes track indistinguishable from a
lower-level grouping, even though it's meant to be the topmost hierarchy
level.

## Goal

Give the track-level virtual group row a distinct visual treatment that
reads as "above" a section/stage row, without overhauling the existing
section-row aesthetic (rejected: full hero-band gradient banner — judged
"too strong").

## Decision

When rendering a virtual group row where `vg.field === '__track'`
(in the `ListView` component's virtual-group render block, the `<tr
className="sec-row">` around `project_hub.html:6822`):

- Replace the existing circular dot + plain-text label
  (`<div style="border-radius:50%">` + `<span>{vg.label}</span>`)
  with a single filled pill containing the full label text formatted as
  `מסלול: {vg.label}` (e.g. `מסלול: רישוי`).
- Pill style: background `var(--blue)`, white text, `border-radius: 6px`
  (rounded-rect, not fully circular), padding `~5px 14px`, font-weight 700.
- Everything else on the row is unchanged: the chevron toggle button, the
  task-count text (`{vg.tasks.length} משימות`), collapse/expand behavior
  (`toggleVg`/`collVg`), drag-and-drop task target (`onDrop`/`handleVgTaskDrop`),
  and the `vgRealGroup` rename-on-click logic (which only applies when
  `vg.field==='section'` anyway, so it's unaffected).

No changes to:
- `vg.field === '__stage'` or `vg.field === 'section'` row rendering.
- `sub-sec-row` rendering for nested subGroups (used when grouping by
  track+stage together — stage subgroups still nest inside the track row
  using the existing `sub-sec-row` style).
- `buildVirtualGroups()` logic, the stage/track auto-switch effect, or any
  data model / state.

## Visual Reference

Approved mockup (option "C2" with text changed to include the field label):

```
[▾]  [ מסלול: רישוי ]  24 משימות      <- track row: filled rounded-rect pill
   [▾] ⚫ שלב היתר בנייה   12 משימות   <- stage row: unchanged existing style
```

Pill: white text on solid blue background, border-radius 6px (not a full
circle/pill shape despite the "pill" name used during brainstorming).

## Scope

Single visual change, isolated to one conditional render branch inside the
existing virtual-group `<tr className="sec-row">` block. No new state, no
new data fields, no changes to filtering, grouping computation, or any
other view (regular per-sheet list view, dashboard view, etc. are
unaffected since this only applies to `__combined` virtual grouping by
`__track`).
