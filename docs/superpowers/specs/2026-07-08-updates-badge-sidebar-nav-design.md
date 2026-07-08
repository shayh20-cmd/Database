# Updates badge/+ opens Task Detail Sidebar on the Updates tab

## Problem

In `project_hub_01.html`, the top-level task row (`TaskRow`) shows two small
controls in its "עדכונים" badge slot when the task has process events:

- the `⊡ N` badge (`.sub-badge`, title "רצף עדכונים")
- the `+` button (`.add-ev-inline`, title "הוסף עדכון") shown when the task
  has no events yet

Both currently call `setPanelSubId('__task__')`, which opens a small floating
popover (`ProcessTaskPanel`) anchored to the row. This is a second, narrower
UI for viewing/adding updates that duplicates what the full Task Detail
Sidebar's "עדכונים" tab already does (see the `tds-panel` opened via the
"☰ פרטי משימה" row-menu item), and it's inconsistent with the sidebar-based
flow used elsewhere.

## Goal

Clicking the `⊡ N` badge or the `+` button on a task row opens the Task
Detail Sidebar for that task, landing directly on the "עדכונים" tab.

## Scope

- **In scope:** the `⊡ N` badge and `+` button inside `TaskRow` (main task
  rows only — the ones in the row's `badge-slot`, matching the elements the
  user pointed at).
- **Out of scope:**
  - The row's "⋮ → הוספת עדכון" context-menu item — keeps opening the inline
    `ProcessTaskPanel` popover as today.
  - `SubtaskRow`'s equivalent badge/`+` (subtasks have no detail sidebar to
    open; they keep using `ProcessTaskPanel`).
  - Auto-starting a new update card inside the sidebar when opened via `+`.
    Both the badge and `+` behave identically: open the sidebar on the
    updates tab. Adding a new update from there is a manual click on the
    sidebar's own "+ הוסף עדכון" button, same as opening via any other path.

## Design

**`TaskDetailSidebar` gets tab-open control from outside.**

Today `TaskDetailSidebar` owns `activeTab` purely internally
(`useState('desc')`), so every open lands on the description tab regardless
of how it was triggered. We add a way for a caller to request a specific
starting tab without otherwise touching the component's tab state:

- New prop `openTab` — the App root passes a value only when a caller
  explicitly requested a tab; otherwise `null`.
- Inside `TaskDetailSidebar`: `useEffect(() => { if (openTab) setActiveTab(openTab); }, [openTab])`.
  Because the App root always passes a **new object** on every explicit
  request (e.g. `{tab: 'events'}`), the effect fires on every request even
  if the requested tab name repeats, without needing a manual token/counter.

**Threading the request through `App`.**

- New state in `App`: `const [detailOpenTab, setDetailOpenTab] = useState(null)`.
- `TaskDetailSidebar`'s `onClose` handler resets both `detailTaskId` and
  `detailOpenTab` to `null`, so a stale tab request can never leak into a
  later open that didn't ask for one (e.g. via "☰ פרטי משימה").
- `onShowDetail` (currently `setDetailTaskId` directly) becomes a small
  wrapper: `(id, tab) => { setDetailTaskId(id); setDetailOpenTab(tab ? {tab} : null); }`.
- `onShowDetail` callers:
  - "☰ פרטי משימה" menu item: unchanged call, `onShowDetail?.(task.id)` — no
    tab requested, sidebar opens on its default ("desc").
  - `TaskRow`'s `⊡ N` badge and `+` button: change from
    `setPanelSubId('__task__')` to `onShowDetail?.(task.id, 'events')`.
    (Requires `TaskRow` to receive `onShowDetail` — it already does.)

## Testing

Manual verification in the browser preview (no automated test harness for
this file):
1. Task row with existing updates: click `⊡ N` → sidebar opens on "עדכונים"
   tab showing the task's update timeline.
2. Task row with no updates yet: click `+` → sidebar opens on "עדכונים" tab
   (empty state / just the "+ הוסף עדכון" affordance).
3. "☰ פרטי משימה" still opens on the description tab as before.
4. Open sidebar via badge (lands on עדכונים), manually switch to תיאור
   משימה tab, close, reopen via badge again → lands on עדכונים again (no
   stale-tab leak).
5. Confirm the row's "⋮ → הוספת עדכון" menu item still opens the inline
   `ProcessTaskPanel` popover, unchanged.
