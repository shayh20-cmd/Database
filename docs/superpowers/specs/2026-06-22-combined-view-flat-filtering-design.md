# מבט מאוחד — Flat Filtering, Decoupled From Grouping

## Context

`project_hub.html` has a combined cross-track/stage task view (`מבט מאוחד`,
`data.__combined===true`). Today, an effect
(`project_hub.html:6326-6334`) auto-switches `groupByState` whenever the
user picks a track or stage filter:

```jsx
useEffect(()=>{
  if(!data.__combined) return;
  if(filterState?.stage?.length)       setGroupByState([{field:'__stage'}]);
  else if(filterState?.track?.length)  setGroupByState([{field:'__track'}]);
  else                                   setGroupByState([{field:'section'}]);
},[JSON.stringify(filterState?.track||[]),JSON.stringify(filterState?.stage||[]),data.__combined]);
```

This conflates two independent operations: filtering (narrowing which tasks
are visible) and grouping (how visible tasks are visually divided). The
default grouping (`[{field:'section'}]`) also means the combined view is
never truly flat — it always shows *some* division, even with no filter
and no explicit grouping choice.

## Goal

In מבט מאוחד only:
1. Default state (no filter, no explicit grouping) = one flat list of all
   tasks across all tracks/stages, no headers at all.
2. Applying any filter (track, stage, or any combination, e.g. track
   "מסלול רישוי" + stage "תנאים מקדימים") only narrows the flat list —
   it never introduces grouping headers.
3. Grouping headers appear **only** when the user explicitly adds a
   grouping criterion via the existing "קבוצות" toolbar control (already
   supports `section`/`__track`/`__stage`/priority/discipline/status,
   including multi-level — unchanged).

Regular (non-combined) sheets are completely unaffected — they keep
defaulting to section-based grouping exactly as today.

## Decision

### 1. Initial state (`project_hub.html:6325`)

```jsx
const [groupByState,setGroupByState]=useState(()=>data.__combined?[]:[{field:'section'}]);
```

### 2. Remove the auto-switch effect entirely

Delete `project_hub.html:6326-6334` (the comment and the `useEffect` shown
above). `filterState` continues to drive the existing `display` (filtered
task list) computation independently — that logic is untouched and already
decoupled from `groupByState`.

### 3. New flat render path

Add a third rendering mode alongside the two that exist today
(virtual-groups for explicit multi-field/non-section grouping, and the
real-groups/`section` default). Define:

```jsx
const isFlatMode = groupByState.length===0;
const isDefaultGrouping = !isFlatMode && groupByState.length===1 && groupByState[0].field==='section';
const virtualGroups = (!isFlatMode && !isDefaultGrouping) ? buildVirtualGroups() : null;
```

When `isFlatMode` is true, render `display` (the already-filtered task
list) as a single sequence of `TaskRow`s with no header row at all —
reusing the existing active/done split + collapsible "הושלמו" sub-section
pattern already used inside `renderVgTaskRows` (`project_hub.html:6798-6817`),
and an "add task" row at the bottom (same pattern as `addTaskForVg`, using
`groups[0]?.id` as the target group for new tasks). The `!virtualGroups`
real-groups branch (`project_hub.html:6906+`) gets an added `&&!isFlatMode`
guard so it doesn't also render when flat mode is active.

### 4. Toolbar consistency (`project_hub.html` `Toolbar` component)

Pass a new boolean prop `isCombinedView={!!data.__combined}` from `ListView`
to `Toolbar`. Inside `Toolbar`:

- Redefine `isDefaultGroup`:
  ```jsx
  const isDefaultGroup = isCombinedView
    ? groupList.length===0
    : (groupList.length===1 && groupList[0].field==='section');
  ```
  (Controls whether the "✕ אפס קבוצה" option is shown/hidden and the
  group-count badge.)
- "✕ אפס קבוצה" handler (`project_hub.html:5523`): reset target becomes
  `isCombinedView?[]:[{field:'section'}]`.
- Last-criterion delete handler (`project_hub.html:5512`): fallback becomes
  `a.length?a:(isCombinedView?[]:[{field:'section'}])`.

### 5. `clearAll` (`project_hub.html:6542`)

The toolbar's "clear everything" action's grouping reset becomes
`data.__combined?[]:[{field:'section'}]` instead of always
`[{field:'section'}]`.

## Out of scope

- Saved-view loading fallbacks (`project_hub.html:6558,6584,6591`) that
  default a *missing* `groupByState` on an old saved view to
  `[{field:'section'}]` — left as-is; not part of this request.
- Any change to non-combined sheet views, `buildVirtualGroups()` internals,
  `sub-sec-row` nested rendering, or the track-pill styling delivered in
  the prior change (`docs/superpowers/specs/2026-06-22-track-grouping-pill-design.md`).

## Scope

Touches only `ListView` and `Toolbar` inside `project_hub.html`: one
`useState` initializer, deletion of one `useEffect`, three small
conditional tweaks in `Toolbar`, one new flat-render branch in `ListView`'s
table body. No data model changes, no changes to filtering logic itself.
