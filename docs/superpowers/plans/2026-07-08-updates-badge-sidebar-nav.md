# Updates Badge/+ Opens Task Detail Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the `⊡ N` updates badge or the `+` button on a top-level task row opens the Task Detail Sidebar directly on its "עדכונים" (updates) tab, instead of opening the small inline `ProcessTaskPanel` popover.

**Architecture:** Add a one-shot "open on this tab" request that flows from `App`'s `onShowDetail` callback down into `TaskDetailSidebar` via a new `openTab` prop, applied with a `useEffect`. Rewire only the `TaskRow` badge/`+` click handlers to go through this path; everything else (row `⋮` menu, `SubtaskRow`) is untouched.

**Tech Stack:** Single-file React 18 app (Babel standalone, no build step) — `project_hub_01.html`. No test framework for this file; verification is manual, via the browser preview tooling.

**Spec:** `docs/superpowers/specs/2026-07-08-updates-badge-sidebar-nav-design.md`

---

### Task 1: Add `detailOpenTab` state and a `handleShowDetail` wrapper in `App`

**Files:**
- Modify: `project_hub_01.html` (single `App` function body — the `detailTaskId` state declaration)

- [ ] **Step 1: Locate and update the `detailTaskId` state declaration**

Find this exact text in `project_hub_01.html` (it's part of one long minified line inside the `App` component, right after the "expand/collapse" `Set` state logic):

```js
const[detailTaskId,setDetailTaskId]=useState(null);const detailTask=detailTaskId?tasks.find(t=>t.id===detailTaskId):null;
```

Replace it with:

```js
const[detailTaskId,setDetailTaskId]=useState(null);const[detailOpenTab,setDetailOpenTab]=useState(null);const handleShowDetail=(id,tab)=>{setDetailTaskId(id);setDetailOpenTab(tab?{tab}:null);};const detailTask=detailTaskId?tasks.find(t=>t.id===detailTaskId):null;
```

This adds:
- `detailOpenTab` — `null` normally, or `{tab: 'events'}` when a caller explicitly requested a tab. It's a **new object literal every time it's set**, so a downstream `useEffect` keyed on it will fire on every explicit request even if the same tab is requested twice in a row.
- `handleShowDetail(id, tab)` — the single place that opens the sidebar. `tab` is optional; omitting it (or passing a falsy value) leaves `detailOpenTab` as `null`, preserving today's "open to default tab" behavior.

- [ ] **Step 2: Verify the string was replaced exactly once**

Since this file has no line-based structure to `grep -n` usefully, just re-read the modified region to confirm both `detailOpenTab` and `handleShowDetail` appear once each near `detailTaskId`.

- [ ] **Step 3: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(task-detail): add detailOpenTab state and handleShowDetail wrapper"
```

---

### Task 2: Rewire all `onShowDetail` callers to use `handleShowDetail`, and thread `openTab` into the sidebar render

**Files:**
- Modify: `project_hub_01.html` (3 `commonProps`-style object literals that wire up `TaskRow`/`SubtaskRow` callbacks, plus the `TaskDetailSidebar` render call)

- [ ] **Step 1: Replace all 3 occurrences of `onShowDetail:setDetailTaskId`**

There are exactly 3 places in `App` where a props object passed down to `TaskRow` (via list/group rendering) sets `onShowDetail:setDetailTaskId`. Replace **all** occurrences of:

```js
onShowDetail:setDetailTaskId
```

with:

```js
onShowDetail:handleShowDetail
```

Use a find-and-replace-all for this exact string — the 3 occurrences are otherwise-identical fragments of larger prop objects (ending in `...,onShowDetail:setDetailTaskId,expandSignal};` followed by different code in each of the 3 call sites), so there's no need to handle them individually.

- [ ] **Step 2: Verify replacement count**

Confirm `onShowDetail:setDetailTaskId` no longer appears anywhere in the file, and `onShowDetail:handleShowDetail` appears exactly 3 times.

- [ ] **Step 3: Update the `TaskDetailSidebar` render call**

Find this exact text (the sidebar is rendered once, guarded by `detailTask&&`):

```js
detailTask&&/*#__PURE__*/React.createElement(TaskDetailSidebar,{task:detailTask,data:data,onUpdate:t=>{updateTask(t);setDetailTaskId(t.id);},onClose:()=>setDetailTaskId(null),onOpenMeeting:onOpenMeeting,meetings:meetings})
```

Replace it with:

```js
detailTask&&/*#__PURE__*/React.createElement(TaskDetailSidebar,{task:detailTask,data:data,onUpdate:t=>{updateTask(t);setDetailTaskId(t.id);},onClose:()=>{setDetailTaskId(null);setDetailOpenTab(null);},onOpenMeeting:onOpenMeeting,meetings:meetings,openTab:detailOpenTab})
```

This does two things: clears `detailOpenTab` whenever the sidebar closes (so a stale tab request can never leak into a future open that didn't ask for one), and passes the current `detailOpenTab` request down as the new `openTab` prop.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(task-detail): thread openTab request through onShowDetail callers and sidebar render"
```

---

### Task 3: Make `TaskDetailSidebar` honor `openTab`

**Files:**
- Modify: `project_hub_01.html` (`function TaskDetailSidebar(...)` definition)

- [ ] **Step 1: Add `openTab` to the destructured props**

Find:

```js
function TaskDetailSidebar({task,onUpdate,onClose,data,onOpenMeeting,meetings}){
```

Replace with:

```js
function TaskDetailSidebar({task,onUpdate,onClose,data,onOpenMeeting,meetings,openTab}){
```

- [ ] **Step 2: Sync `activeTab` to `openTab` requests**

Find (this is right after the `/* Tabs */` comment, before `panelW` state):

```js
const[activeTab,setActiveTab]=useState('desc');const[panelW,setPanelW]=useState(()=>{
```

Replace with:

```js
const[activeTab,setActiveTab]=useState('desc');useEffect(()=>{if(openTab)setActiveTab(openTab.tab);},[openTab]);const[panelW,setPanelW]=useState(()=>{
```

`useEffect` is already used elsewhere in this component (e.g. the description-editor sync a few statements later), so it's already in scope/imported — no new import needed.

- [ ] **Step 3: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(task-detail): apply openTab requests to the sidebar's active tab"
```

---

### Task 4: Make `TaskRow`'s updates badge and `+` button open the sidebar instead of the inline popover

**Files:**
- Modify: `project_hub_01.html` (`function TaskRow(...)` — the `badge-slot` span containing the `⊡ N` badge / `+` button)

- [ ] **Step 1: Replace the badge/+ click handlers**

Find this exact text inside `TaskRow`'s render (it's the second `badge-slot` span, right after the subtasks-count badge span):

```js
isProcess?/*#__PURE__*/React.createElement("span",{className:"sub-badge",title:"רצף עדכונים",onClick:e=>{e.stopPropagation();setPanelSubId('__task__');},style:{cursor:'pointer',color:'var(--accent)',background:'rgba(99,102,241,.10)'}},"⊡ ",events.length):/*#__PURE__*/React.createElement("button",{className:"add-ev-inline",title:"הוסף עדכון",onClick:e=>{e.stopPropagation();setPanelSubId('__task__');}},"+")
```

Replace with:

```js
isProcess?/*#__PURE__*/React.createElement("span",{className:"sub-badge",title:"רצף עדכונים",onClick:e=>{e.stopPropagation();onShowDetail?.(task.id,'events');},style:{cursor:'pointer',color:'var(--accent)',background:'rgba(99,102,241,.10)'}},"⊡ ",events.length):/*#__PURE__*/React.createElement("button",{className:"add-ev-inline",title:"הוסף עדכון",onClick:e=>{e.stopPropagation();onShowDetail?.(task.id,'events');}},"+")
```

Do **not** touch the other two `setPanelSubId('__task__')` call sites in this same function — one is the subtasks-count badge (`setExpanded(true)`, unrelated) and one is the `⊡ הוספת עדכון` item inside the row's `⋮` context menu (`MENU_ITEMS`), which must keep opening the inline `ProcessTaskPanel` per the spec's scope.

`TaskRow` already receives `onShowDetail` as a prop (it's already used by the `☰ פרטי משימה` menu item), so no prop-plumbing changes are needed here.

- [ ] **Step 2: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(task-row): updates badge and + button open sidebar on updates tab"
```

---

### Task 5: Manual verification in the browser preview

**Files:** none (verification only)

- [ ] **Step 1: Start the local server and open the app**

Use the `project-hub` launch config (serves `C:\Users\Omega\Database` on port 3403) and navigate to `/project_hub_01.html`. Open project "PH01 אולם ספורט לוד" → "ניהול תכנון" → "רשימה" view, where top-level tasks with process events (e.g. the `ELEC`/`HVAC` rows) are visible.

- [ ] **Step 2: Verify the `⊡ N` badge opens the sidebar on the updates tab**

Click the `⊡ N` badge on a task row with existing updates (e.g. "תיאום חברת חשמל"). Expected: the Task Detail Sidebar (`tds-panel`) opens on the right, with the "עדכונים" tab active and the existing update timeline visible — the inline `ProcessTaskPanel` popover must NOT appear.

- [ ] **Step 3: Verify the `+` button opens the sidebar on the updates tab**

Find (or temporarily use) a task row with no process events yet, so it shows the `+` button instead of the badge. Click it. Expected: same sidebar opens on "עדכונים" tab (empty state, with the sidebar's own "+ הוסף עדכון" button visible for adding an update).

- [ ] **Step 4: Verify `☰ פרטי משימה` still defaults to the description tab**

Open the row's `⋮` menu → "פרטי משימה". Expected: sidebar opens on "תיאור משימה" (unchanged from current behavior).

- [ ] **Step 5: Verify no stale-tab leak**

With the sidebar open via `⊡ N` (on "עדכונים"), manually click the "תיאור משימה" tab, then close the sidebar (×). Reopen via `⊡ N` on the same task again. Expected: lands on "עדכונים" again (not stuck on "תיאור משימה" from the manual switch, and not leaking into a later `☰ פרטי משימה` open either — repeat step 4 once more after this to confirm it still opens to "תיאור משימה").

- [ ] **Step 6: Verify the `⋮ → הוספת עדכון` menu item is unchanged**

Open the row's `⋮` menu → "הוספת עדכון" (the `⊡` icon item, not "פרטי משימה"). Expected: the small inline `ProcessTaskPanel` popover opens anchored to the row, same as before this change — the sidebar must NOT open.

- [ ] **Step 7: Check the browser console for errors**

Use the preview tooling's console-log check after each of the above interactions; expect no new errors.

No commit for this task — it's verification of the commits from Tasks 1–4. If any check fails, fix the relevant task's code and re-verify before moving on.
