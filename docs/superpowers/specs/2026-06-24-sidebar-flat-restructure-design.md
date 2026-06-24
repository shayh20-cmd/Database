# Sidebar Flat Restructure — Design

## Context

The previous restructure (`docs/superpowers/specs/2026-06-23-sidebar-hierarchy-restructure-design.md`,
implemented and merged) made "ניהול תכנון" an expandable sidebar parent
containing one sub-item per `data.tracks` track, plus a separate "רוחבי"
group, with all of it rendered inside a single `NihulTikhnunView` component
that owned two internal tab rows (a track-tabs row and a cross-cutting-tabs
row).

After using it, the user found this confusing: tracks being *nested inside*
"ניהול תכנון" doesn't match how the team actually thinks about the
hierarchy — each track is its own first-class thing, and "ניהול תכנון"
is really just the home for cross-cutting, non-track-specific content (plus
the project overview). This spec corrects the hierarchy.

## Goal

Six flat, equal-weight sidebar items (no nesting, no expand/collapse) under
"הפרויקטים שלי": ניהול תכנון, מסלול תכנון, מסלול רישוי, מסלול מכרז,
מסלול ביצוע, טמפלייט. Each is its own direct destination. The four track
items are still generated dynamically from `data.tracks` (already seeded in
this exact order — `ongoing`/`licensing`/`tender`/`execution` — by the
migration added in the previous spec), not hardcoded.

## Sidebar Changes

`Sidebar`'s "ניהול תכנון" expandable block and the "רוחבי" section
(both added in the previous restructure) are replaced by a single flat
`<div className="sb-section">` rendering, in order:
1. "ניהול תכנון" — `sb-item`, active when `track==='tasks'`, `onClick={()=>setTrack('tasks')}`.
2. One `sb-item` per `tracks` entry (from `data.tracks`) — active when `track===t.id`, `onClick={()=>setTrack(t.id)}`, label `t.label`.
3. "טמפלייט" — `sb-item`, active when `track==='template'`, `onClick={()=>setTrack('template')}` (this already exists in `PROJ_TRACKS` today; folded into this same flat list for consistency).

No chevrons, no `nihulExpanded` state, no `CROSS_CUTTING_ITEMS`-as-sidebar-section. `onSelectTrackTab`/`onSelectTopTab`/`activeTrackTab`/`activeTopTab` props that `Sidebar` currently receives are no longer needed by `Sidebar` itself (the components they targeted are restructured below) — `Sidebar` goes back to needing only `{track, setTrack, tracks}`.

## "ניהול תכנון" Page

A new component (replacing `NihulTikhnunView`'s former cross-cutting tab row) renders exactly 6 tabs, in this order, with **local tab state** (no longer lifted to `App` — there's no sidebar sub-navigation into a specific one of these 6 anymore, so a plain local `useState` inside this component is sufficient):

1. **מבט על** — reuses `OverviewPage` exactly as-is (`<OverviewPage data={data} save={save} onNavigateToTasks={...}/>`).
2. **עקרון תכנון** — reuses `PrinciplesView` exactly as-is.
3. **אבני דרך** and **4. יעדים** — both reuse `GoalsMilestonesPanel` (already extracted as a standalone component), same as the previous restructure's רוחבי tabs.
5. **פיקוח** and **6. ישיבות** — both reuse `ComingSoonPage` with their existing copy, unchanged.

Default active tab: מבט על (so `track==='tasks'` lands on the overview, per the agreed default-landing behavior).

`CROSS_CUTTING_ITEMS` (data array) gets `{id:'overview', label:'מבט על', icon:'overview'}` prepended, and continues to drive this tab row the same way it drove the previous רוחבי section — just now it's a single in-page tab bar instead of doubling as a sidebar group.

## Per-Track Pages

Each track becomes directly addressable via the top-level `track` state
(`track===t.id` for some `t` in `data.tracks`), replacing the old
`activeTrackTab`-inside-`NihulTikhnunView` mechanism. A new component (let's
call it `TrackView`) takes over the **stage-tab-bar logic already built** in
the previous restructure (dashboard-or-list stage tabs, `activeStageId`
state, `visibleStages` filtering by `s.track===activeTrack.trackValue`) and
renders per track:

- **מסלול תכנון** (`id==='ongoing'`, `trackValue===null`): special-cased to render only the existing global "מבט מאוחד" combined cross-track list (`combinedData`/`saveCombined` logic, unchanged — it keeps aggregating tasks from every track, not just this one, per the explicit confirmation that this stays global). No stage-tab bar for this track; it has exactly one view.
- **מסלול רישוי** (`id==='licensing'`): the existing stage-tab-bar behavior (dashboard "מבט על של רישוי" + list stages תיק מידע/תנאים מקדימים/בקרת תכן), unchanged from the previous restructure's Task 4 implementation, just no longer nested under a shared track-tabs row — `TrackView` owns it directly when `activeTrack.id==='licensing'`.
- **מסלול מכרז / מסלול ביצוע** (`id==='tender'`/`'execution'`): both currently have empty `stageOrder`, so `visibleStages` is empty — render the existing "אין שלבים במסלול זה" empty state (already implemented, already correct for this case) until these tracks get real content in a future spec.

`App`'s render switches on `track` directly:
```jsx
{track==='overview' && <OverviewPage .../>}      {/* "בית" — global landing, scope TBD, unchanged for now */}
{track==='tasks'    && <NihulHubView data={data} save={save}/>}   {/* the 6-tab ניהול תכנון page */}
{tracks.some(t=>t.id===track) && <TrackView data={data} save={save} trackId={track}/>}
{track==='mytasks'  && <MyTasksView .../>}
{track==='portfolio'&& <PortfolioView/>}
{track==='template' && <TemplateView .../>}
```
(`tracks` here is `data.tracks||[]`, already available in `App`'s scope.)

## Data Model

No changes to `data.tracks` itself (already correct from the previous
spec's migration: `ongoing`→"מסלול תכנון", `licensing`→"מסלול רישוי",
`tender`→"מסלול מכרז", `execution`→"מסלול ביצוע", in that order).
`CROSS_CUTTING_ITEMS` gains the prepended `overview` entry described above.
No new persisted fields.

## Default Landing

`App`'s `track` state defaults to `'tasks'` (unchanged from the previous
spec), which now renders the "ניהול תכנון" page defaulting to its מבט על
tab — satisfying "opening the project lands on ניהול תכנון → מבט על."

## Non-Goals / Deferred

- "בית" (the global, cross-project landing page reached from the top nav,
  separate from this project's sidebar) is explicitly out of scope — the
  user will detail its design later. It keeps using `OverviewPage` for now
  exactly as it does today; no change to it in this spec.
- No content/design for what מסלול מכרז or מסלול ביצוע actually contain —
  they remain the existing empty-state placeholder.
- No changes to the underlying combined-view computation, stage-tab-bar
  filtering logic, `GoalsMilestonesPanel`, `PrinciplesView`, or
  `ComingSoonPage` — this spec only changes *which top-level `track` value
  reaches which already-built piece of UI*, not the pieces themselves.
