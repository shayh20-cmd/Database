# Sidebar Hierarchy Restructure — Design

## Context

`project_hub.html` ("ספריית לוד" PROJECT HUB) navigates today via a single
flat list, `PROJ_TRACKS` (around line 10397):

```js
const PROJ_TRACKS = [
  {id:'overview',    label:'מבט על',           ...},
  {id:'tasks',        label:'ניהול תכנון',      ...},
  {id:'licensing',    label:'מסלול רישוי',      ...},
  {id:'planning',     label:'מסלול תכנון מפורט', enabled:false},
  {id:'execution',    label:'מסלול ביצוע',      enabled:false},
  {id:'meetings',     label:'ישיבות',           ...},
  {id:'supervision',  label:'פיקוח',            ...},
  {id:'template',     label:'טמפלייט',          ...},
  {id:'principles',   label:'עקרון תכנון',      ...},
];
```

Separately, `data.tracks` (an unrelated, already-built track/stage hierarchy
— seeded by `seedTracksIfMissing`, edited via `TemplateView`) drives a tab
system *inside* `NihulTikhnunView` (the `track==='tasks'` page): one tab per
track plus a "מבט מאוחד" (combined) tab that already merges tasks from every
track/stage into one cross-cutting list, tagged with `__track`/`__stage`.

This creates duplication: `licensing` in `PROJ_TRACKS` renders sheets
directly via `DashboardView`/`ListViewWithCtx` (sheet tabs: דאשבורד / תיק
מידע / תנאים מקדימים / בקרת תכן), while the *same* sheets are also reachable
as a tab inside `NihulTikhnunView` through `data.tracks`. `planning` and
`execution` exist only as disabled `PROJ_TRACKS` entries with no
`data.tracks` counterpart at all.

## Goal

Restructure the sidebar so "ניהול תכנון" is the single home for all
track/stage navigation (matching the `data.tracks` model that already
exists), with a separate "רוחבי" (cross-cutting) group for items that apply
across the whole project, and so the sidebar can jump straight into a
specific track tab instead of landing on a neutral page first.

Explicitly out of scope: building a UI for creating new custom cross-cutting
LIST views (item 5 in the original ask — "create different LIST-type views
that give cross-cutting slices"). The combined view already exists; letting
users define *additional*, saved custom slices is a separate future spec.
Also out of scope: any new content/logic for "מסלול מכרז" beyond a named,
empty placeholder track — its stages/fields will be designed later.

## Data Model Changes

`data.tracks` (`{id, label, trackValue, stageOrder}` array, currently seeded
with `ongoing` and `licensing`):

1. Rename the `ongoing` track's `label` from `'ניהול שוטף'` to `'מסלול
   תכנון'`. `id` and `trackValue` (`null`) are unchanged — existing sheets
   that key off `trackValue:null` keep working.
2. Add a new track entry for **מסלול מכרז** (new `id`/`trackValue`,
   `label:'מסלול מכרז'`, `stageOrder:[]`). This replaces the old, disabled
   `planning` (`'מסלול תכנון מפורט'`) entry conceptually — the **מסלול
   תכנון** track (renamed `ongoing`) is what now covers "מהתכנון הראשוני ועד
   התכנון המפורט", so the standalone "תכנון מפורט" track is dropped, not
   carried forward under a new name beyond providing the empty "מכרז" slot.
3. Add a new track entry for **מסלול ביצוע** (new `id`/`trackValue`,
   `label:'מסלול ביצוע'`, `stageOrder:[]`) — today this exists only as a
   disabled, dead `PROJ_TRACKS` row with no `data.tracks` counterpart.

`migrateData` gets one new migration step (runs once per saved document,
guarded so it's a no-op on documents that already have it applied):

- If a track with `id==='ongoing'` has `label==='ניהול שוטף'`, rename it to
  `'מסלול תכנון'`.
- If no track has the placeholder id used for "מכרז", append it.
- If no track has the placeholder id used for "ביצוע", append it.

`PROJ_TRACKS` shrinks to only the items that remain literal sidebar
top-level entries: `overview`, `tasks` (ניהול תכנון — becomes an expandable
parent, see below), `template`. `licensing`, `planning`, `execution` are
removed from `PROJ_TRACKS` entirely (superseded by the dynamic per-track
sub-items described below). `meetings`, `supervision`, `principles` move
into a new "רוחבי" grouping (still flat `PROJ_TRACKS`-style entries, just
rendered under a `sb-section-label` of "רוחבי" instead of mixed in with
everything else), joined by two new entries, `milestones` (אבני דרך) and
`goals` (יעדים), which reuse the existing `GoalsPanel`/`MilestonesPanel`
content currently embedded inside `NihulTikhnunView`.

## Navigation / UI Changes

**Sidebar — "ניהול תכנון" becomes an expandable parent**, rendered the same
way the project row already expands (`expandedProj`/`isExpanded` pattern at
line ~10477). Its children are generated dynamically from `data.tracks`, not
hardcoded:

```
▾ ניהול תכנון
    ↳ מבט מאוחד          (the existing combined tab)
    ↳ מסלול תכנון        (data.tracks: ongoing)
    ↳ מסלול רישוי         (data.tracks: licensing)
    ↳ מסלול מכרז          (data.tracks: new)
    ↳ מסלול ביצוע         (data.tracks: new)
```

Clicking the "ניהול תכנון" header itself navigates to `track:'tasks'` with
the combined tab active (today's default). Clicking a child sets
`track:'tasks'` **and** preselects that track's tab.

**Lifting `activeTrackTab` out of `NihulTikhnunView`.** It's currently local
state inside `NihulTikhnunView`. It becomes a controlled prop, owned by
`App` (alongside the existing `track` state), so the sidebar can set it
directly: `onSelectTrackTab={(tabId) => { setTrack('tasks'); setActiveTrackTab(tabId); }}`.
`NihulTikhnunView` keeps defaulting to `'combined'` only when no tab has
been explicitly selected yet (i.e. `App` initializes the lifted state to
`'combined'`).

**"רוחבי" — second tab row inside `NihulTikhnunView`.** A new top-level tab
row (`activeTopTab`, also lifted to `App` and controlled the same way) is
added inside `NihulTikhnunView`, with five tabs: ישיבות, עקרונות תכנון,
פיקוח, אבני דרך, יעדים. Each tab's body reuses what already exists rather
than building new UI:
- ישיבות / פיקוח → today's `ComingSoonPage` content, unchanged.
- עקרונות תכנון → today's `PrinciplesView`, embedded instead of routed via
  its own top-level `track`.
- אבני דרך / יעדים → today's `MilestonesPanel` / `GoalsPanel`, extracted
  from their current inline position in `NihulTikhnunView` so they can be
  rendered as standalone tab bodies (no data changes — same
  `data.licensingMilestones` / `data.licensingGoals`).

The track-tabs row and the "רוחבי" tabs row are mutually exclusive (only one
is "active" at a time) but both live on the same `NihulTikhnunView` page —
selecting a track tab clears the active top-tab and vice versa, mirroring
how the sidebar can only highlight one selection at a time.

Sidebar "רוחבי" section items map 1:1 to these five tabs: clicking one sets
`track:'tasks'` and `activeTopTab` to the matching id, the same lifting
pattern used for track tabs.

`principles` and `meetings`/`supervision` are removed as standalone
top-level `track` values (`PrinciplesView`/`ComingSoonPage` no longer render
as full-page routes) — they only render as tab bodies inside
`NihulTikhnunView` now. `onNavigateToTasks` callbacks that currently do
`setTrack('tasks')` to jump from `PrinciplesView`/`OverviewPage` into the
task list keep working unchanged (they just land on the combined tab by
default).

## Non-Goals / Deferred

- No UI for users to create/save additional custom cross-cutting LIST views
  beyond the existing "מבט מאוחד". (Future spec.)
- No design for what "מסלול מכרז" actually contains (stages, fields,
  workflow) — it ships as an empty, selectable track only.
- No changes to `ListView`, filtering, grouping, or the combined-view data
  computation itself — only where/how its tab is reached from the sidebar.
