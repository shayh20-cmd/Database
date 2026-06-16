# Unified Process Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the explicit `taskType`/`isProcess` type-selection from Project Hub tasks and subtasks. Every task/subtask gets a first-class `events` array; whether it "looks like a process" (icon, badge, derived owner/status columns) is computed from `events.length`, never stored. Add a hover-only "+ עדכון" button that creates the first event.

**Architecture:** `project_hub.html` is a single-file React 18 (Babel standalone) app with no build step and no test framework — verification is manual (open the file in a browser, exercise the UI, inspect `localStorage`). This plan touches: the migration pipeline (`migrateTask`/`migrateData`), three small derived-state helper functions, two row components (`TaskRow`, `SubtaskRow`) and their cell components (`ResponsibleCell`, `DaysInStatusCell`, `StatusOwnerCell`, `SubtaskOwnerCell`), task/subtask creation call sites, and one CSS hover rule. The existing `ProcessTaskPanel` (events timeline UI) and `add-ev-inline` button are reused as-is — they already operate generically on any `node` with an `events` array; the plan only changes what is allowed to count as that node and how the gate is computed. `tracks` (an additive, currently-unrendered field computed by `migrateTask`) is out of scope — left untouched per YAGNI.

**Tech Stack:** React 18 (Babel standalone, in-browser JSX transform), vanilla CSS, `localStorage` (`pm_asana_v9`). No npm, no bundler, no test runner.

---

## Important ground rules for every task below

- There is **no automated test suite**. "Verify" steps mean: save the file, hard-refresh the browser tab that has `project_hub.html` open (or open it fresh), and check behavior + `localStorage` by hand. Each task's verify step says exactly what to click and what to look for.
- Make a backup of current `localStorage` before the first manual verification, so you can restore the demo data if something goes wrong:
  - Open the file in a browser, open DevTools console, run `copy(localStorage.getItem('pm_asana_v9'))` — this puts existing data on the clipboard. Paste it into a scratch file if you want a restore point. (Skip if you're fine with `makeDefaultData()` regenerating from scratch — clearing `localStorage.removeItem('pm_asana_v9')` and reloading does that.)
- Commit after every task. This is not a git repo yet at the time of writing this plan — Task 0 initializes one so the rest of the plan's commits are meaningful. If a repo already exists by the time you execute this, skip Task 0's `git init` substep but keep the commit.

---

### Task 0: Initialize git (if not already a repo)

**Files:**
- Create: `.gitignore` (project root, alongside `project_hub.html`)

- [ ] **Step 1: Check if this is already a git repo**

Run: `git -C "C:\Users\Omega\Database" rev-parse --is-inside-work-tree`
Expected: either `true` (skip to Step 4) or an error "not a git repository" (continue to Step 2).

- [ ] **Step 2: Init repo**

Run: `git -C "C:\Users\Omega\Database" init`
Expected: "Initialized empty Git repository..."

- [ ] **Step 3: Add a `.gitignore`**

```
.superpowers/
```

- [ ] **Step 4: Commit current state as baseline**

```bash
git -C "C:\Users\Omega\Database" add -A
git -C "C:\Users\Omega\Database" commit -m "chore: baseline commit before unified process model refactor"
```

Expected: commit succeeds (or "nothing to commit" if already committed — that's fine, move on).

---

### Task 1: Migration — fold `taskType`/`processEvents`/`isProcess` away

**Files:**
- Modify: `project_hub.html:1496-1562` (`hoistEventSubtasks`, `processToSubtask`, `migrateTask`)

This is the highest-risk task: it changes what every task/subtask object looks like in memory and in `localStorage` going forward. Everything downstream (Tasks 2–6) assumes this shape:

```js
task = { ..., events: [...], subtasks: [{ ..., events: [...], subtasks: [...] }] }
// no task.taskType, no task.processEvents, no subtask.isProcess anywhere, at any nesting depth
```

- [ ] **Step 1: Replace `processToSubtask` with a direct fold into `task.events`**

Find (lines 1515-1524):
```js
/* New model: event sequences live on subtasks marked isProcess, not on the
   task itself. Convert any legacy task-level processEvents into a single
   subtask-process so existing data stays visible. Idempotent (clears the
   source list). */
function processToSubtask(task) {
  if (!task || !task.processEvents || !task.processEvents.length) return task;
  const sub = {id:uid(), title: 'תהליך ראשי', done:false, isProcess:true,
               events: task.processEvents, fromEventId:null};
  return {...task, processEvents:[], subtasks:[...(task.subtasks||[]), sub]};
}
```

Replace with:
```js
/* Unified model: every task/subtask has its own `events` array — no more
   "isProcess" flag and no more routing legacy task-level events into a
   synthetic subtask. Fold any legacy task.processEvents directly into
   task.events. Idempotent (drains processEvents on first run). */
function foldLegacyProcessEvents(task) {
  if (!task || !task.processEvents || !task.processEvents.length) return task;
  return {...task, events: [...(task.events||[]), ...task.processEvents], processEvents:[]};
}

/* Strip the old isProcess flag and guarantee `events`/`subtasks` exist, at
   every nesting depth. Idempotent — safe to run on already-migrated data. */
function stripProcessFlags(node) {
  if (!node) return node;
  const {isProcess, ...rest} = node;
  return {
    ...rest,
    events: rest.events || [],
    subtasks: (rest.subtasks || []).map(stripProcessFlags),
  };
}
```

- [ ] **Step 2: Update `migrateTask` to use the new helpers and drop `taskType`**

Find (lines 1526-1562):
```js
function migrateTask(task) {
  task = hoistEventSubtasks(task);
  const legacyEvents = task.processEvents || [];   // capture before processToSubtask drains it
  task = processToSubtask(task);
  if (!task || task.tracks) return task;              // already migrated
  const tracks = [];
  const evs = legacyEvents;
```
(...keep the rest of the function body that builds `tracks` from `evs` and `task.subtasks` unchanged through line 1561...)

```js
  return {...task, tracks, assigneeId: task.assigneeId||''};
}
```

Replace the **top** of the function (everything up to and including the `const evs = legacyEvents;` line) with:
```js
function migrateTask(task) {
  task = hoistEventSubtasks(task);
  const legacyEvents = task.processEvents || [];   // captured for the (unused-but-kept) tracks computation below
  task = foldLegacyProcessEvents(task);
  const {taskType, ...withoutType} = task;
  task = stripProcessFlags(withoutType);
  if (!task || task.tracks) return task;              // already migrated
  const tracks = [];
  const evs = legacyEvents;
```

Leave everything from `// group legacy events by assignee...` through `return {...task, tracks, assigneeId: task.assigneeId||''};` exactly as it is — that block only reads `legacyEvents`/`task.subtasks`/`task.discipline`, none of which changed shape.

- [ ] **Step 3: Verify migration runs without errors on existing demo data**

Open `project_hub.html` in a browser (double-click it, or `start project_hub.html` from the project root). Open DevTools console.
Expected: no red errors in the console. The app renders the dashboard/task list as before.

- [ ] **Step 4: Verify the old fields are actually gone from migrated data**

In DevTools console, run:
```js
JSON.parse(localStorage.getItem('pm_asana_v9')).sheets
  .flatMap(s => s.tasks||[])
  .some(t => 'taskType' in t || 'processEvents' in t || (t.subtasks||[]).some(s => 'isProcess' in s))
```
Expected: `false`. (Note: the app only writes to `localStorage` on data changes via `savePartial`, so if this still shows fields from before the migration ran, click anywhere that triggers a save — e.g. toggle a task's done checkbox and back — then re-run the check.)

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "refactor: fold taskType/processEvents/isProcess into unified events[] during migration"
```

---

### Task 2: Update derived-state helpers to read `events` directly

**Files:**
- Modify: `project_hub.html:701-745` (`getTaskProcessEvents`, `getProcessResponsible`, `getMostRecentEventStatus`)

- [ ] **Step 1: Simplify `getTaskProcessEvents`**

Find (lines 698-705):
```js
/* Effective process events for a task: prefer live task.processEvents, but fall back to
   the migrated subtask-process's events — processToSubtask() moves legacy task-level
   events there on load and clears task.processEvents, so readers must check both. */
function getTaskProcessEvents(task) {
  if (task.processEvents?.length) return task.processEvents;
  const procSub = (task.subtasks||[]).find(s => s.isProcess);
  return procSub?.events || [];
}
```

Replace with:
```js
/* A task's own event timeline. After migration (see migrateTask), every task
   carries its events directly — there is no more legacy fallback to a
   synthetic "process subtask". */
function getTaskProcessEvents(task) {
  return task.events || [];
}
```

- [ ] **Step 2: Update `getMostRecentEventStatus` to drop the `taskType` check**

Find (lines 718-724):
```js
/* Get the most recent event status from a process task, mapped to task statusId.
   Returns the event status if found, otherwise returns the task's own statusId. */
function getMostRecentEventStatus(task) {
  const events = getTaskProcessEvents(task);
  if (task.taskType !== 'process' || !events.length) {
    return task.statusId;
  }
```

Replace with:
```js
/* Get the most recent event status from a task that has timeline events, mapped
   to task statusId. Returns the event status if found, otherwise the task's own
   statusId (covers tasks with zero events, which behave exactly as "simple"). */
function getMostRecentEventStatus(task) {
  const events = getTaskProcessEvents(task);
  if (!events.length) {
    return task.statusId;
  }
```

`getProcessResponsible` (lines 707-716) already only reads `getTaskProcessEvents(task)` — no change needed there.

- [ ] **Step 3: Verify**

Reload the browser tab. Open a task that previously had a timeline (any "process" task in the demo data, e.g. "הכנת לוח זמנים ראשי") and confirm its status chip and days-in-status still show correctly (no `—` where there used to be a value).

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "refactor: derive task event helpers from task.events, drop taskType checks"
```

---

### Task 3: `TaskRow` — dynamic icon, badge, and hover "+ עדכון" button

**Files:**
- Modify: `project_hub.html:3497-3623` (`TaskRow` — `isProcess` derivation, status button, badge)
- Modify: `project_hub.html:3756-3766` (panel wiring — allow the task itself to be the panel's `node`)

- [ ] **Step 1: Replace the `isProcess` derivation**

Find (line 3501):
```js
  const isProcess = task.taskType==='process';
```

Replace with:
```js
  const events = task.events || [];
  const isProcess = events.length > 0;
```

- [ ] **Step 2: Replace the status button block (remove the type-toggle context menu)**

Find (lines 3609-3623):
```js
          {/* Done/type toggle */}
          {isProcess
            ?<button className={`proc-btn${task.done?' is-done':''}`}
                title="משימת תהליך — לחץ לסימון הושלם"
                onContextMenu={e=>{e.preventDefault();onUpdate({...task,taskType:'simple'});}}
                onClick={e=>{e.stopPropagation();onUpdate({...task,done:!task.done});}}>
                {task.done&&'✓'}
              </button>
            :<button className={`done-btn${task.done?' is-done':''}`}
                title="לחץ לסימון הושלם | לחץ ימני → תהליך"
                onContextMenu={e=>{e.preventDefault();onUpdate({...task,taskType:'process',processEvents:task.processEvents||[]});}}
                onClick={e=>{e.stopPropagation();onUpdate({...task,done:!task.done});}}>
                {task.done&&'✓'}
              </button>
          }
```

Replace with:
```js
          {/* Done toggle — shape reflects whether the task has any timeline events */}
          {isProcess
            ?<button className={`proc-btn${task.done?' is-done':''}`}
                title="יש טיימליין עדכונים — לחץ לסימון הושלם"
                onClick={e=>{e.stopPropagation();onUpdate({...task,done:!task.done});}}>
                {task.done&&'✓'}
              </button>
            :<button className={`done-btn${task.done?' is-done':''}`}
                title="לחץ לסימון הושלם"
                onClick={e=>{e.stopPropagation();onUpdate({...task,done:!task.done});}}>
                {task.done&&'✓'}
              </button>
          }
          {/* Add-event button — visible on row hover, opens this task's own timeline panel */}
          <button className="add-ev-inline" title="הוסף עדכון"
            onClick={e=>{e.stopPropagation();setPanelSubId('__task__');}}>+</button>
          {isProcess&&<span className="sub-badge" title="רצף עדכונים"
            onClick={e=>{e.stopPropagation();setPanelSubId('__task__');}}
            style={{cursor:'pointer',color:'var(--accent)',background:'rgba(99,102,241,.10)'}}>⊡ {events.length}</span>}
```

- [ ] **Step 3: Allow the panel to target the task itself**

Find (lines 3755-3766):
```js
    {/* Per-subtask events panel */}
    {panelSubId&&(()=>{
      const node=subtasks.find(s=>s.id===panelSubId);
      if(!node) return null;
      return <ProcessTaskPanel key={panelSubId} parentTitle={task.title} node={node}
        threshold={daysThreshold}
        parentStartDate={task.startDate||''}
        parentDueDate={task.dueDate||''}
        onUpdate={updated=>updateSubtask(updated)}
        onAddToMain={sub=>addSubToMain(sub)}
        onClose={()=>setPanelSubId(null)}/>;
    })()}
```

Replace with:
```js
    {/* Events panel — either the task's own timeline ('__task__') or a subtask's */}
    {panelSubId&&(()=>{
      const isTaskNode = panelSubId==='__task__';
      const node = isTaskNode ? task : subtasks.find(s=>s.id===panelSubId);
      if(!node) return null;
      return <ProcessTaskPanel key={panelSubId} parentTitle={task.title} node={node}
        threshold={daysThreshold}
        parentStartDate={task.startDate||''}
        parentDueDate={task.dueDate||''}
        onUpdate={updated=>isTaskNode ? onUpdate(updated) : updateSubtask(updated)}
        onAddToMain={sub=>addSubToMain(sub)}
        onClose={()=>setPanelSubId(null)}/>;
    })()}
```

- [ ] **Step 4: Verify**

Reload. Pick any task with zero events (e.g. a freshly created one). Confirm:
  - It shows `⭕` (the `done-btn` circle), no badge.
  - Hovering the row reveals a small `+` button next to the circle.
  - Clicking `+` opens the events side panel for that task (title bar should show the task's title), with the "add event" form already open (since `events.length===0` — see `ProcessTaskPanel`'s `showForm` initial state at line 2694).
  - Add one event via the form. Close the panel. The row now shows `◐` (`proc-btn`) and a `⊡ 1` badge.
  - Click the badge — same panel reopens showing that 1 event.
  - Delete the event from inside the panel. Close. Row reverts to `⭕`, badge gone.

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "feat: dynamic process icon/badge on TaskRow, hover add-event button"
```

---

### Task 4: CSS — reveal `add-ev-inline` on task-row hover too

**Files:**
- Modify: `project_hub.html:395`

- [ ] **Step 1: Extend the hover rule**

Find (line 395):
```css
.sub-row:hover .add-ev-inline{opacity:1;}
```

Replace with:
```css
.sub-row:hover .add-ev-inline,.t-row:hover .add-ev-inline{opacity:1;}
```

- [ ] **Step 2: Verify**

Reload. Move the mouse over a task row that is *not* hovered directly over the `+` button — confirm the `+` fades in for the whole row (matches existing subtask-row behavior), and fades out when the mouse leaves the row.

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "style: reveal add-event button on task-row hover, matching subtask rows"
```

---

### Task 5: `SubtaskRow` + `SubtaskOwnerCell` — drop `isProcess`, compute from `events.length`

**Files:**
- Modify: `project_hub.html:2326-2344` (`SubtaskOwnerCell` gate)
- Modify: `project_hub.html:2566-2607` (`SubtaskRow` — `isProc` derivation, circle, context menu, badge)

- [ ] **Step 1: Remove the `isProcess` gate in `SubtaskOwnerCell`**

Find (lines 2341-2344):
```js
  // Owner status is derived from process events — meaningless for non-process subtasks
  if (!subtask.isProcess) {
    return <td style={{padding:'0 8px',verticalAlign:'middle',background:'inherit'}}/>;
  }
```

Replace with:
```js
  // Owner status is derived from the subtask's own events — blank when there are none yet.
  // (The cell already renders a dashed "+" placeholder via `hasChip` below when there's no
  // discipline/status, so removing this early return is enough to expose the add-event
  // affordance on every subtask, not just ones previously flagged isProcess.)
  if (!(subtask.events||[]).length && !subtask.discipline) {
    // still render normally — fall through — but note there is nothing else to special-case here
  }
```

Wait — re-check before writing further code: the existing body below this gate already handles `events=[]` gracefully (`latestEv` becomes `null`, `evSt` becomes `null`, `hasChip = disc || evSt` falls back to the dashed circle, and the `add-ev-inline` button always renders). So no extra logic is needed — **just delete the early-return block entirely**, do not replace it with anything:

Find (lines 2341-2344) again and replace with nothing (delete those 4 lines):
```js
  // (intentionally removed: the cell already degrades gracefully to a
  // dashed "+" placeholder + always-visible add-event button when
  // subtask.events is empty — see `hasChip`/`add-ev-inline` below)
```

- [ ] **Step 2: Replace `isProc` derivation and remove the type-toggle context menu in `SubtaskRow`**

Find (lines 2566-2580):
```js
  const isProc = !!subtask.isProcess;
  const evCount = (subtask.events||[]).length;
  return(
    <tr className="sub-row" style={{opacity:subtask.done?.5:1}}>
      <td className="sticky-td">
        <div className="sub-name-inner">
          <div onClick={()=>onUpdate({...subtask,done:!subtask.done})}
            title={isProc?'תת-תהליך — קליק ימני להחזרה לרגיל':'לחץ לסימון הושלם | קליק ימני → תהליך'}
            onContextMenu={e=>{e.preventDefault();onUpdate({...subtask,isProcess:!isProc,events:subtask.events||[]});}}
            style={{width:13,height:13,borderRadius:'50%',flexShrink:0,cursor:'pointer',
              border:`1.5px solid ${subtask.done?'#059669':'#8E8E8E'}`,
              background:subtask.done?'#059669':(isProc?'#8E8E8E':'transparent'),
              display:'flex',alignItems:'center',justifyContent:'center'}}>
            {subtask.done?'✓':''}
          </div>
```

Replace with:
```js
  const evCount = (subtask.events||[]).length;
  const isProc = evCount > 0;
  return(
    <tr className="sub-row" style={{opacity:subtask.done?.5:1}}>
      <td className="sticky-td">
        <div className="sub-name-inner">
          <div onClick={()=>onUpdate({...subtask,done:!subtask.done})}
            title={isProc?'יש טיימליין עדכונים — לחץ לסימון הושלם':'לחץ לסימון הושלם'}
            style={{width:13,height:13,borderRadius:'50%',flexShrink:0,cursor:'pointer',
              border:`1.5px solid ${subtask.done?'#059669':'#8E8E8E'}`,
              background:subtask.done?'#059669':(isProc?'#8E8E8E':'transparent'),
              display:'flex',alignItems:'center',justifyContent:'center'}}>
            {subtask.done?'✓':''}
          </div>
```

- [ ] **Step 3: Verify the badge/title-placeholder text below still reads correctly**

Open `project_hub.html:2585-2604` and confirm the rest of the render (the `name-text` span using `isProc` for the placeholder label, the nested-subtasks badge, and the `⊡ {evCount}` badge at line 2603) needs **no changes** — they already read `isProc`/`evCount`, which are now both correctly derived from `events.length` after Step 2. (No edit needed here — this step is a read-only sanity check.)

- [ ] **Step 4: Verify in browser**

Reload. Pick a subtask with zero events. Confirm:
  - Circle is hollow (not gray-filled).
  - Hovering the subtask row reveals the `+` button in the owner-status column (already wired via `add-ev-inline`/`.sub-row:hover`, untouched by this task).
  - Clicking `+` opens the "עדכון חדש" mini add-event panel (existing `SubtaskOwnerCell` "add" panel), submit one event.
  - After submitting: circle becomes gray-filled, `⊡ 1` badge appears next to the subtask title, owner-status column shows the discipline/status chip.
  - Right-click the circle: confirm nothing happens now (the old "convert to process" context menu is gone).

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "refactor: derive subtask process state from events.length, drop isProcess toggle"
```

---

### Task 6: Remaining cell components — `ResponsibleCell`, `DaysInStatusCell`, `StatusOwnerCell`

**Files:**
- Modify: `project_hub.html:1786` (`ResponsibleCell`)
- Modify: `project_hub.html:2080` (`DaysInStatusCell`)
- Modify: `project_hub.html:2131` (`StatusOwnerCell`)

All three currently compute `const isProcess = task.taskType === 'process';`. Each needs to instead check whether the task has events.

- [ ] **Step 1: `ResponsibleCell`**

Find (`project_hub.html:1786`):
```js
  const isProcess = task.taskType === 'process';
```
Replace with:
```js
  const isProcess = (task.events||[]).length > 0;
```

- [ ] **Step 2: `DaysInStatusCell`**

Find (`project_hub.html:2080`):
```js
  const isProcess = task.taskType === 'process';
```
Replace with:
```js
  const isProcess = (task.events||[]).length > 0;
```

- [ ] **Step 3: `StatusOwnerCell`**

Find (`project_hub.html:2131`):
```js
  const isProcess = task.taskType === 'process';
```
Replace with:
```js
  const isProcess = (task.events||[]).length > 0;
```

- [ ] **Step 4: Verify**

Reload. For a task with events: confirm the "אחראי" column shows the read-only derived chip (not the editable dropdown), the days-in-status pill shows a number, and the merged owner/status chip in the "עדכונים" column shows both halves. For a task with zero events: confirm "אחראי" is editable, days-in-status shows `—`, and the owner/status column is blank (matching pre-refactor "simple task" behavior exactly).

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "refactor: derive isProcess in ResponsibleCell/DaysInStatusCell/StatusOwnerCell from events.length"
```

---

### Task 7: Task/subtask creation — stop writing `taskType`/`isProcess`, remove the type picker from the toolbar

**Files:**
- Modify: `project_hub.html:4396-4415` (`Toolbar` add-task split-button menu)
- Modify: `project_hub.html:5491-5497` (`addTask`)
- Modify: `project_hub.html:5798-5803` (`addTaskForVg`)
- Modify: `project_hub.html:3577-3580` (`addSubtask`, inside `TaskRow`)

- [ ] **Step 1: Simplify `addTask` — no more type parameter**

Find (`project_hub.html:5491-5497`):
```js
  const addTask=(type='simple', targetGroupId=null)=>{
    const gId=targetGroupId||groups[0]?.id;
    if(!gId)return;
    const id=uid();
    const isProcess=type==='process';
    savePartial({tasks:[...tasks,{id,groupId:gId,title:'',statusId:'N',priority:'',discipline:'',startDate:'',dueDate:'',comment:'',done:false,subtasks:[],fieldValues:{},taskType:isProcess?'process':'simple',processEvents:isProcess?[]:undefined}]});
    setNewTaskId(id);
  };
```

Replace with:
```js
  const addTask=(targetGroupId=null)=>{
    const gId=targetGroupId||groups[0]?.id;
    if(!gId)return;
    const id=uid();
    savePartial({tasks:[...tasks,{id,groupId:gId,title:'',statusId:'N',priority:'',discipline:'',startDate:'',dueDate:'',comment:'',done:false,subtasks:[],fieldValues:{},events:[]}]});
    setNewTaskId(id);
  };
```

- [ ] **Step 2: Update the `Toolbar` to drop the type-picker dropdown**

Find (`project_hub.html:4399-4415` — keep reading a couple more lines past 4415 if your editor shows a closing `</div>` for the dropdown right after; only remove the dropdown markup, keep the wrapping `<div ref={addMenuRef}>`):
```js
      <div ref={addMenuRef} style={{position:'relative'}}>
        <div className="btn-add-wrap">
          <button className="btn-add-main" onClick={()=>onAddTask('simple')}>+ הוסף משימה</button>
          <button className="btn-add-arr" onClick={()=>setShowAddMenu(o=>!o)}>▾</button>
        </div>
        {showAddMenu&&(
          <div className="dp" style={{right:0,left:'auto',minWidth:170,top:'calc(100% + 6px)'}}>
            <div className="dp-title">סוג משימה</div>
            <div className="dp-opt" onClick={()=>{onAddTask('simple');setShowAddMenu(false);}}>
              <span style={{width:14,height:14,borderRadius:'50%',border:'2px solid var(--text-3)',display:'inline-block',flexShrink:0}}/>
              משימה
            </div>
            <div className="dp-opt" onClick={()=>{onAddTask('process');setShowAddMenu(false);}}>
              <span style={{width:14,height:14,borderRadius:2,border:'2px solid var(--text-3)',display:'inline-block',flexShrink:0}}/>
              תהליך
            </div>
```

There is more markup after line 4414 closing this dropdown (a closing `</div>` for the `dp` and the `{showAddMenu&&(...)}` block) — locate it by reading forward from line 4415 in the actual file and remove the **entire** `{showAddMenu&&(...)}` block along with the now-unused arrow button, leaving just:
```js
      <div ref={addMenuRef} style={{position:'relative'}}>
        <button className="btn-add-main" onClick={()=>onAddTask()}>+ הוסף משימה</button>
      </div>
```

(If `showAddMenu`/`setShowAddMenu`/`addMenuRef` state and the outside-click-close `useEffect` tied to them become unused after this removal, delete them too — search for `showAddMenu` and `addMenuRef` within the `Toolbar` function body and remove every reference.)

- [ ] **Step 3: Update `addTaskForVg`**

Find (`project_hub.html:5798-5803`):
```js
              const addTaskForVg=()=>{
                const gId=groups[0]?.id; if(!gId)return;
                const id=uid(); const fieldPatch={[vg.field]:vg.value};
                savePartial({tasks:[...tasks,{id,groupId:gId,title:'',statusId:'N',priority:'',discipline:'',startDate:'',dueDate:'',comment:'',done:false,subtasks:[],fieldValues:{},taskType:'simple',...fieldPatch}]});
                setNewTaskId(id);
              };
```

Replace with:
```js
              const addTaskForVg=()=>{
                const gId=groups[0]?.id; if(!gId)return;
                const id=uid(); const fieldPatch={[vg.field]:vg.value};
                savePartial({tasks:[...tasks,{id,groupId:gId,title:'',statusId:'N',priority:'',discipline:'',startDate:'',dueDate:'',comment:'',done:false,subtasks:[],fieldValues:{},events:[],...fieldPatch}]});
                setNewTaskId(id);
              };
```

- [ ] **Step 4: Update `addSubtask`**

Find (`project_hub.html:3577-3580`):
```js
  const addSubtask=()=>{
    const id=uid();
    onUpdate({...task,subtasks:[...subtasks,{id,title:'',done:false,statusId:'N',priority:'',discipline:''}]});
    setNewSubId(id);setExpanded(true);
  };
```

Replace with:
```js
  const addSubtask=()=>{
    const id=uid();
    onUpdate({...task,subtasks:[...subtasks,{id,title:'',done:false,statusId:'N',priority:'',discipline:'',events:[]}]});
    setNewSubId(id);setExpanded(true);
  };
```

- [ ] **Step 5: Verify**

Reload. Click "+ הוסף משימה" in the toolbar — confirm there's no dropdown arrow/menu anymore, a new blank task row appears directly, starts as `⭕` with no badge. Add a subtask under any task the same way — confirm it starts as a hollow circle, no badge.

- [ ] **Step 6: Commit**

```bash
git add project_hub.html
git commit -m "refactor: drop process/simple type picker from task and subtask creation"
```

---

### Task 8: Full manual verification pass (matches the spec's test list)

**Files:** none — verification only.

- [ ] **Step 1: New task → 0 events**

Create a new task. Confirm: `⭕`, no badge, `+` button appears only on hover.

- [ ] **Step 2: First event → icon flips**

Click the hover `+`, add one event via the panel form. Confirm: icon becomes `◐`, badge reads `⊡ 1`, no manual refresh needed (state update re-renders immediately).

- [ ] **Step 3: More events → count increases**

Add a second event from the same panel. Confirm badge reads `⊡ 2`.

- [ ] **Step 4: Delete all events → icon reverts**

Delete both events from the panel. Close it. Confirm: icon is back to `⭕`, badge is gone.

- [ ] **Step 5: Same flow on a subtask**

Repeat steps 1–4 on a subtask (using the subtask's owner-status column `+` button and mini add-event panel instead of the side panel). Confirm identical icon/badge behavior.

- [ ] **Step 6: Old data migrates cleanly**

In DevTools console, manually inject a legacy-shaped record to simulate an old save, then reload and confirm no console errors and that it renders with the new icon rules:
```js
const d = JSON.parse(localStorage.getItem('pm_asana_v9'));
const sheet = d.sheets.find(s=>s.type==='list' && (s.tasks||[]).length);
sheet.tasks.push({
  id:'legacy-test-1', groupId: sheet.groups[0].id, title:'משימת מיגרציה ישנה',
  statusId:'I', priority:'medium', discipline:'PM', responsible:'', startDate:'', dueDate:'',
  comment:'', done:false, taskType:'process', fieldValues:{}, subtasks:[],
  processEvents:[{id:'ev1', title:'', status:'progress', assignee:'PM', date:'2026-01-01', note:'test'}],
});
localStorage.setItem('pm_asana_v9', JSON.stringify(d));
location.reload();
```
Expected after reload: the new "משימת מיגרציה ישנה" row renders with `◐` and `⊡ 1` (its single legacy event folded into `events`), and `JSON.parse(localStorage.getItem('pm_asana_v9')).sheets.flatMap(s=>s.tasks||[]).find(t=>t.id==='legacy-test-1')` shows `events:[{...}]` and no `taskType`/`processEvents` keys.

- [ ] **Step 7: Idempotent migration**

With the app still open from Step 6, reload two more times in a row. Confirm no console errors and the task from Step 6 still shows exactly `⊡ 1` (not duplicated events).

- [ ] **Step 8: Clean up the test task**

Delete "משימת מיגרציה ישנה" via its row's `✕` button so it doesn't pollute the real project data.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "test: manual verification pass for unified process model"
```
(If there are no file changes from this task, this step is just confirming everything from Tasks 1–7 is already committed — `git status` should be clean.)
