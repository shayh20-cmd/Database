# Sidebar Tracks Accordion — Design

## Context

Today, inside the expanded "ספריית לוד" project row, `Sidebar`
(`project_hub.html`, ~offset 1182) renders a flat list of `sb-sub-item`
buttons: "מבט על", "ניהול תכנון", then one item per dynamic track from
`tracks.filter(t=>t.id!=='ongoing')` (currently מסלול רישוי, מסלול מכרז,
מסלول ביצוע), then "טמפלייט". As more tracks get added to `data.tracks`,
this flat list grows unbounded and clutters the sidebar.

## Goal

Group only the dynamic track items under a single collapsible "מסלולים"
header, so the sidebar stays compact regardless of how many tracks a
project has. "מבט על", "ניהול תכנון", and "טמפלייט" are unaffected — they
stay exactly where and how they are today.

## Sidebar Changes

In the expanded-project block (inside `isExpanded && ...`), replace:

```jsx
tracks.filter(t=>t.id!=='ongoing').map(t => <button className="sb-sub-item" .../>)
```

with a new local component/block that renders:

1. A header row, same visual weight as the existing `sb-sub-item` entries
   (reuses the `sb-sub-item` class), containing:
   - the same dot/icon slot pattern as other sub-items (or a static "list"
     icon — no specific track to represent)
   - label text "מסלולים"
   - a trailing chevron reusing the existing `DownIcon` component (already
     used for the project-row expand/collapse), rotated per open/closed
     state
   - `onClick` toggles local state only — **does not** call `setTrack`,
     does not navigate
2. When expanded, the existing per-track buttons render indented beneath
   it, unchanged in every respect (same `sb-sub-item` class, same active
   styling via `track===t.id`, same `onClick={()=>setTrack(t.id)}`).

**New state:** `const [tracksExpanded, setTracksExpanded] = React.useState(true)`
inside `Sidebar`, alongside the existing `sidebarOpen`/`expandedProj` state.
Not persisted — resets to expanded on every reload/remount, matching how
`expandedProj` already behaves.

**Active-when-collapsed indicator:** if `tracksExpanded` is `false` and the
current `track` matches one of the dynamic tracks (`tracks.some(t=>t.id===track)`
excluding `'ongoing'`), the "מסלولים" header row itself gets the `active`
class (same styling `sb-sub-item.active` already provides via `var(--accent)`
color), so the user can tell a track is selected even while the group is
collapsed.

## Non-Goals

- No change to `track` state values, routing, or any per-track page/view.
- No change to `data.tracks`, migration, or the "ongoing" special-case
  filtering.
- No change to "מבט על", "ניהול תכנון", "טמפלייט" — they remain flat,
  ungrouped `sb-sub-item` entries in their current positions.
- No persistence of the expand/collapse state across reloads.
