# Process Status Pill Picker — Design Spec

## Goal

Replace the plain `<select>` used to pick a new process-event status (in `ProcessTaskPanel`'s "add update" form) with a colored pill/tab picker showing all 7 statuses, matching the visual language used elsewhere in the app (e.g. the priority picker's colored `.pill` options).

## Current behavior

`ProcessTaskPanel`'s add-event form renders:
```javascript
React.createElement("select",{value:formStatus,onChange:e=>setFormStatus(e.target.value)},
  EV_ADD_STATUSES.map(s=>React.createElement("option",{key:s,value:s},EV_STATUSES[s].label)))
```
`EV_ADD_STATUSES = ['progress','sent','comments','approved']` — a deliberately curated 4-status subset (per an existing code comment: "missing/response are auto-created" — choosing `sent` auto-appends a `response` follow-up event via `EV_AUTO_FOLLOW`, and `comments` auto-appends `progress`). The 7th status, `update` ("עדכון"), isn't reachable through this form via any path.

`EV_STATUSES` (already defined, unchanged by this spec) has all 7 entries with label/symbol/color/bg/border:
```javascript
{
  missing:  {label:'חסר',        symbol:'—', color:'#6B7280', bg:'#E5E7EB', border:'#9CA3AF'},
  progress: {label:'בעבודה',      symbol:'●', color:'#1D4ED8', bg:'#BFDBFE', border:'#3B82F6'},
  sent:     {label:'נשלח',        symbol:'→', color:'#3730A3', bg:'#C7D2FE', border:'#6366F1'},
  comments: {label:'יש הערות',    symbol:'!', color:'#92400E', bg:'#FDE68A', border:'#F59E0B'},
  response: {label:'בהתייחסות',   symbol:'⤴', color:'#78350F', bg:'#FEF08A', border:'#FCD34D'},
  update:   {label:'עדכון',       symbol:'✎', color:'#5B21B6', bg:'#EDE9FE', border:'#8B5CF6'},
  approved: {label:'מאושר',       symbol:'✓', color:'#065F46', bg:'#A7F3D0', border:'#10B981'}
}
```

## Decision: show all 7 statuses, not just the curated 4

Per explicit user choice, the picker shows all 7 `EV_STATUSES` entries (in `EV_CYCLE` order: missing, progress, sent, response, comments, update, approved) — including `missing` and `response`, which the current code treats as auto-derived-only. This removes the manual/automatic distinction: any status becomes directly, manually pickable. The existing `EV_AUTO_FOLLOW` auto-append behavior (`sent`→`response`, `comments`→`progress`) is unchanged — it still fires after a manual pick of `sent` or `comments`, same as today; the user can also now pick `response` (or any other status) directly without going through that chain if they want to.

## New picker UI

Replace the `<select>` with a `flexWrap` row of clickable pill buttons, one per `EV_STATUSES` entry, reusing the existing `.pill` class (already used for priority pills elsewhere: `padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer`). Each pill:
- Background/text color from that status's `bg`/`color` (matching how priority pills already set `background`/`color` inline per-option).
- The currently-selected status (`formStatus === s.id`) gets a visible ring: `border: 2px solid ${EV_STATUSES[s].border}` (others get a transparent 2px border, so sizes don't shift on selection).
- `onClick` calls `setFormStatus(s.id)` directly — no dropdown open/close step, since all 7 fit on-screen in a wrapped row within the panel's width.
- Each pill shows both the symbol and label (e.g. "● בעבודה") for scannability, matching how symbols are used elsewhere in the app's status displays (e.g. the "עדכונים" column's `PM ● 104 י׳` summary).

## Non-goals

- No change to `EV_AUTO_FOLLOW` behavior, `getNextSuggestedStatus`, or any other process-event logic — purely a picker-UI replacement for one `<select>`.
- No change to how existing events are displayed/edited elsewhere (Gantt bars, table summaries) — those already use `EV_STATUSES` colors correctly.
- `EV_ADD_STATUSES` constant becomes unused after this change and should be removed (dead code) rather than left behind.

## Testing / verification

Manual, via the preview tools:
1. Open a task's process panel for a task with zero events (add-form shows by default), confirm all 7 colored pills render with correct Hebrew labels and colors matching `EV_STATUSES`.
2. Click each pill, confirm the selection ring moves and `formStatus` updates (submit and check the resulting event's `status` matches).
3. Confirm picking `sent` still auto-appends a `response` follow-up event, and `comments` still auto-appends `progress` (existing behavior, unchanged).
4. Confirm this same fix applies wherever `ProcessTaskPanel` is used (it's shared across `project_hub.html` and `project_hub_01.html`, same source pattern in both).
