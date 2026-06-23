# Planning Principles Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing "עקרון תכנון" feature so subtasks can be flagged too, add a quick toggle in the task/subtask context menus (instead of only the detail-panel checkbox), and show a small icon on flagged rows.

**Architecture:** Same computed-table architecture as the base feature — no new top-level data array. `subtask.isPrinciple`/`subtask.principleCreatedAt` mirror the existing task fields. `computePrinciples` gains a second source (subtasks across all tasks). A new `unflagPrincipleSubtask` helper mirrors `unflagPrincipleTask` one level deeper. `principlesDeleteHandler` gains a third branch.

**Tech Stack:** Single-file HTML app (`project_hub.html`), React 18 via Babel standalone, no build step, no test framework. Verification via the Claude Code browser preview tool (`mcp__Claude_Preview__*`).

---

### Task 1: Context-menu toggle + delete confirmation, on both tasks and subtasks

**Files:**
- Modify: `project_hub.html` `TaskRow`'s `MENU_ITEMS` (search for `מחק משימה`, ~line 4006-4013) and `deleteTask` is NOT touched here (already done in the base feature) — this task only touches the menu array.
- Modify: `project_hub.html` `SubtaskRow`'s `SUB_ITEMS` (search for `מחק תת-משימה`, ~line 2847-2853)
- Modify: `project_hub.html` `TaskRow`'s `deleteSubtask` (search for `const deleteSubtask=`, ~line 3841)

- [ ] **Step 1: Confirm current code**

Read `project_hub.html` and confirm these three snippets (search by quoted text if line numbers have drifted):

```js
const MENU_ITEMS=[
  {icon:'⧉', label:'שכפול משימה',    action:()=>{onDuplicate?.(task);setTaskMenuPos(null);}},
  {icon:'+', label:'הוספת תת-משימה', action:()=>{addSubtask();setTaskMenuPos(null);}},
  {icon:'⊡', label:'הוספת עדכון',    action:()=>{setPanelSubId('__task__');setTaskMenuPos(null);}},
  {icon:'☰', label:'פרטי משימה',     action:()=>{onShowDetail?.(task.id);setTaskMenuPos(null);}},
  null,
  {icon:'×', label:'מחק משימה',      danger:true, action:()=>{onDelete();setTaskMenuPos(null);}},
];
```

```js
const SUB_ITEMS=[
  {icon:'⧉', label:'שכפול תת-משימה', action:()=>{onDuplicateSub?.(subtask);setSubMenuPos(null);}},
  {icon:'⊡', label:'הוספת עדכון',     action:()=>{onOpenProcess?.();setSubMenuPos(null);}},
  {icon:'☰', label:'פרטי תת-משימה',  action:()=>{onOpenProcess?.();setSubMenuPos(null);}},
  null,
  {icon:'×', label:'מחק תת-משימה',   danger:true, action:()=>{onDelete();setSubMenuPos(null);}},
];
```

```js
const deleteSubtask=id=>onUpdate({...task,subtasks:subtasks.filter(s=>s.id!==id)});
```

If any of these differ in content (not just line numbers), STOP and report BLOCKED.

- [ ] **Step 2: Add the toggle item to `TaskRow`'s `MENU_ITEMS`**

Find:
```js
const MENU_ITEMS=[
  {icon:'⧉', label:'שכפול משימה',    action:()=>{onDuplicate?.(task);setTaskMenuPos(null);}},
  {icon:'+', label:'הוספת תת-משימה', action:()=>{addSubtask();setTaskMenuPos(null);}},
  {icon:'⊡', label:'הוספת עדכון',    action:()=>{setPanelSubId('__task__');setTaskMenuPos(null);}},
  {icon:'☰', label:'פרטי משימה',     action:()=>{onShowDetail?.(task.id);setTaskMenuPos(null);}},
  null,
  {icon:'×', label:'מחק משימה',      danger:true, action:()=>{onDelete();setTaskMenuPos(null);}},
];
```
Replace with:
```js
const MENU_ITEMS=[
  {icon:'⧉', label:'שכפול משימה',    action:()=>{onDuplicate?.(task);setTaskMenuPos(null);}},
  {icon:'+', label:'הוספת תת-משימה', action:()=>{addSubtask();setTaskMenuPos(null);}},
  {icon:'⊡', label:'הוספת עדכון',    action:()=>{setPanelSubId('__task__');setTaskMenuPos(null);}},
  {icon:'☰', label:'פרטי משימה',     action:()=>{onShowDetail?.(task.id);setTaskMenuPos(null);}},
  {icon:'◆', label:task.isPrinciple?'הסר מעקרון תכנון':'סמן כעקרון תכנון', action:()=>{
    if(task.isPrinciple && !window.confirm('המשימה מקושרת לעקרון תכנון — הפעולה תסיר אותה מרשימת העקרונות. להמשיך?')){setTaskMenuPos(null);return;}
    const next=!task.isPrinciple;
    onUpdate({...task, isPrinciple:next, principleCreatedAt: next ? (task.principleCreatedAt || todayISO()) : task.principleCreatedAt});
    setTaskMenuPos(null);
  }},
  null,
  {icon:'×', label:'מחק משימה',      danger:true, action:()=>{onDelete();setTaskMenuPos(null);}},
];
```

- [ ] **Step 3: Add the toggle item to `SubtaskRow`'s `SUB_ITEMS`**

Find:
```js
const SUB_ITEMS=[
  {icon:'⧉', label:'שכפול תת-משימה', action:()=>{onDuplicateSub?.(subtask);setSubMenuPos(null);}},
  {icon:'⊡', label:'הוספת עדכון',     action:()=>{onOpenProcess?.();setSubMenuPos(null);}},
  {icon:'☰', label:'פרטי תת-משימה',  action:()=>{onOpenProcess?.();setSubMenuPos(null);}},
  null,
  {icon:'×', label:'מחק תת-משימה',   danger:true, action:()=>{onDelete();setSubMenuPos(null);}},
];
```
Replace with:
```js
const SUB_ITEMS=[
  {icon:'⧉', label:'שכפול תת-משימה', action:()=>{onDuplicateSub?.(subtask);setSubMenuPos(null);}},
  {icon:'⊡', label:'הוספת עדכון',     action:()=>{onOpenProcess?.();setSubMenuPos(null);}},
  {icon:'☰', label:'פרטי תת-משימה',  action:()=>{onOpenProcess?.();setSubMenuPos(null);}},
  {icon:'◆', label:subtask.isPrinciple?'הסר מעקרון תכנון':'סמן כעקרון תכנון', action:()=>{
    if(subtask.isPrinciple && !window.confirm('תת-המשימה מקושרת לעקרון תכנון — הפעולה תסיר אותה מרשימת העקרונות. להמשיך?')){setSubMenuPos(null);return;}
    const next=!subtask.isPrinciple;
    onUpdate({...subtask, isPrinciple:next, principleCreatedAt: next ? (subtask.principleCreatedAt || todayISO()) : subtask.principleCreatedAt});
    setSubMenuPos(null);
  }},
  null,
  {icon:'×', label:'מחק תת-משימה',   danger:true, action:()=>{onDelete();setSubMenuPos(null);}},
];
```

Note: `onUpdate` here is `SubtaskRow`'s own `onUpdate` prop, which (per its call site inside `TaskRow`'s `updateSubtask`) takes the full updated subtask object and merges it into the parent task's `subtasks` array — same pattern already used by the subtask title-edit code in this same component, so this is not a new wiring pattern.

- [ ] **Step 4: Confirm before deleting a flagged subtask**

Find:
```js
const deleteSubtask=id=>onUpdate({...task,subtasks:subtasks.filter(s=>s.id!==id)});
```
Replace with:
```js
const deleteSubtask=id=>{
  const s=subtasks.find(x=>x.id===id);
  if(s?.isPrinciple && !window.confirm('תת-המשימה מקושרת לעקרון תכנון — הפעולה תסיר אותה מרשימת העקרונות. להמשיך?')) return;
  onUpdate({...task,subtasks:subtasks.filter(x=>x.id!==id)});
};
```

- [ ] **Step 5: Verify in preview**

Reload the `project-hub` preview. Open a task row's context menu (the "⋮"/menu button on a task row), confirm a new "סמן כעקרון תכנון" item appears. Click it, confirm no error and (via `preview_eval` reading the task's `isPrinciple` field from `localStorage`, or reopening the menu and seeing it now reads "הסר מעקרון תכנון") that it toggled on. Click it again to turn off — confirm a `window.confirm` appears (verify via `preview_eval` toggling state directly if the native dialog blocks automation, same approach as used for Task 1 of the base feature). Repeat for a subtask's context menu ("⋮" on a subtask row) — confirm the same toggle item and behavior. Try deleting a flagged subtask via "מחק תת-משימה" — confirm the same confirmation prompt appears.

- [ ] **Step 6: Commit**

```bash
git add project_hub.html
git commit -m "feat: add עקרון תכנון toggle to task/subtask context menus, confirm on flagged subtask delete"
```

---

### Task 2: Row icon for flagged tasks and subtasks

**Files:**
- Modify: `project_hub.html` `TaskRow`'s title span (search for `name-text` near `task.title||<span`, ~line 3868-3872)
- Modify: `project_hub.html` `SubtaskRow`'s title span (search for `name-text` near `subtask.title||(isProc`, ~line 2792-2795)

- [ ] **Step 1: Confirm current code**

Confirm these two snippets:

```jsx
:<span className="name-text"
    style={{textDecoration:task.done?'line-through':'none',color:task.done?'var(--text-3)':'var(--text)',cursor:'text'}}
    onClick={e=>{e.stopPropagation();setTitle(task.title);setEditTitle(true);}}>
    {task.title||<span style={{color:'var(--text-3)'}}>ללא שם</span>}
  </span>
```

```jsx
:<span className="name-text" style={{fontSize:12,textDecoration:subtask.done?'line-through':'none',color:subtask.done?'var(--text-3)':'var(--text)',cursor:'text'}}
      onClick={e=>{e.stopPropagation();setTitle(subtask.title||'');setEditing(true);}}>
      {subtask.title||(isProc?<span style={{color:'var(--text-3)'}}>תהליך ללא שם</span>:<span style={{color:'var(--text-3)'}}>ללא שם</span>)}
    </span>
```

If anything differs in content, STOP and report BLOCKED. Also confirm `Ic` (the icon-rendering component, `function Ic({n, size=14})`) and the `principles` entry in `ICONS` both exist (added in a prior commit) — search for `n:'principles'`-style usage or `ICONS = {` to confirm `principles:` is present.

- [ ] **Step 2: Add the icon to `TaskRow`'s title**

Find:
```jsx
:<span className="name-text"
    style={{textDecoration:task.done?'line-through':'none',color:task.done?'var(--text-3)':'var(--text)',cursor:'text'}}
    onClick={e=>{e.stopPropagation();setTitle(task.title);setEditTitle(true);}}>
    {task.title||<span style={{color:'var(--text-3)'}}>ללא שם</span>}
  </span>
```
Replace with:
```jsx
:<span className="name-text"
    style={{textDecoration:task.done?'line-through':'none',color:task.done?'var(--text-3)':'var(--text)',cursor:'text'}}
    onClick={e=>{e.stopPropagation();setTitle(task.title);setEditTitle(true);}}>
    {task.isPrinciple&&<span title="עקרון תכנון" style={{display:'inline-flex',marginInlineEnd:4,color:'var(--text-3)',verticalAlign:'middle'}}><Ic n="principles" size={11}/></span>}
    {task.title||<span style={{color:'var(--text-3)'}}>ללא שם</span>}
  </span>
```

- [ ] **Step 3: Add the icon to `SubtaskRow`'s title**

Find:
```jsx
:<span className="name-text" style={{fontSize:12,textDecoration:subtask.done?'line-through':'none',color:subtask.done?'var(--text-3)':'var(--text)',cursor:'text'}}
      onClick={e=>{e.stopPropagation();setTitle(subtask.title||'');setEditing(true);}}>
      {subtask.title||(isProc?<span style={{color:'var(--text-3)'}}>תהליך ללא שם</span>:<span style={{color:'var(--text-3)'}}>ללא שם</span>)}
    </span>
```
Replace with:
```jsx
:<span className="name-text" style={{fontSize:12,textDecoration:subtask.done?'line-through':'none',color:subtask.done?'var(--text-3)':'var(--text)',cursor:'text'}}
      onClick={e=>{e.stopPropagation();setTitle(subtask.title||'');setEditing(true);}}>
      {subtask.isPrinciple&&<span title="עקרון תכנון" style={{display:'inline-flex',marginInlineEnd:4,color:'var(--text-3)',verticalAlign:'middle'}}><Ic n="principles" size={10}/></span>}
      {subtask.title||(isProc?<span style={{color:'var(--text-3)'}}>תהליך ללא שם</span>:<span style={{color:'var(--text-3)'}}>ללא שם</span>)}
    </span>
```

- [ ] **Step 4: Verify in preview**

Flag a task and a subtask as principles (via the Task 1 menu item or the existing detail-panel checkbox), reload, confirm the small icon now appears right before the title text in both the task row and the subtask row. Unflag, confirm the icon disappears.

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "feat: show עקרון תכנון icon on flagged task/subtask rows"
```

---

### Task 3: Extend `computePrinciples` to include subtasks

**Files:**
- Modify: `project_hub.html` `computePrinciples` (currently at ~line 5979-5993)
- Modify: `project_hub.html` — insert new `unflagPrincipleSubtask` function right after `unflagPrincipleTask` (currently at ~line 5995-5999)
- Modify: `project_hub.html` `principlesDeleteHandler` (currently at ~line 6012-6016)

- [ ] **Step 1: Confirm current code**

Confirm these exact snippets are present (search by quoted text if line numbers have drifted):

```js
function computePrinciples(data) {
  const sheets = data.sheets || [];
  const fromTasks = sheets.flatMap(s => (s.tasks||[]).filter(t=>t.isPrinciple).map(t => ({
    id: t.id,
    description: t.title || '',
    discipline: t.discipline || '',
    createdAt: t.principleCreatedAt || '',
    sourceSheetId: s.id,
    sourceTaskId: t.id,
  })));
  const standalone = (data.standalonePrinciples||[]).map(p => ({
    ...p, sourceSheetId: null, sourceTaskId: null,
  }));
  return [...fromTasks, ...standalone];
}

function unflagPrincipleTask(data, save, sheetId, taskId) {
  save({...data, sheets: data.sheets.map(s => s.id===sheetId
    ? {...s, tasks: s.tasks.map(t => t.id===taskId ? {...t, isPrinciple:false} : t)}
    : s)});
}
```

and, further down:
```js
function principlesDeleteHandler(data, save) {
  return p => p.sourceTaskId
    ? unflagPrincipleTask(data, save, p.sourceSheetId, p.sourceTaskId)
    : deleteStandalonePrinciple(data, save, p.id);
}
```

If anything differs in content, STOP and report BLOCKED.

- [ ] **Step 2: Extend `computePrinciples` to also flatten subtasks**

Find:
```js
function computePrinciples(data) {
  const sheets = data.sheets || [];
  const fromTasks = sheets.flatMap(s => (s.tasks||[]).filter(t=>t.isPrinciple).map(t => ({
    id: t.id,
    description: t.title || '',
    discipline: t.discipline || '',
    createdAt: t.principleCreatedAt || '',
    sourceSheetId: s.id,
    sourceTaskId: t.id,
  })));
  const standalone = (data.standalonePrinciples||[]).map(p => ({
    ...p, sourceSheetId: null, sourceTaskId: null,
  }));
  return [...fromTasks, ...standalone];
}
```
Replace with:
```js
function computePrinciples(data) {
  const sheets = data.sheets || [];
  const fromTasks = sheets.flatMap(s => (s.tasks||[]).filter(t=>t.isPrinciple).map(t => ({
    id: t.id,
    description: t.title || '',
    discipline: t.discipline || '',
    createdAt: t.principleCreatedAt || '',
    sourceSheetId: s.id,
    sourceTaskId: t.id,
  })));
  const fromSubtasks = sheets.flatMap(s => (s.tasks||[]).flatMap(t => (t.subtasks||[]).filter(st=>st.isPrinciple).map(st => ({
    id: st.id,
    description: st.title || '',
    discipline: st.discipline || '',
    createdAt: st.principleCreatedAt || '',
    sourceSheetId: s.id,
    sourceTaskId: t.id,
    sourceSubtaskId: st.id,
  }))));
  const standalone = (data.standalonePrinciples||[]).map(p => ({
    ...p, sourceSheetId: null, sourceTaskId: null,
  }));
  return [...fromTasks, ...fromSubtasks, ...standalone];
}
```

- [ ] **Step 3: Add `unflagPrincipleSubtask`**

Find:
```js
function unflagPrincipleTask(data, save, sheetId, taskId) {
  save({...data, sheets: data.sheets.map(s => s.id===sheetId
    ? {...s, tasks: s.tasks.map(t => t.id===taskId ? {...t, isPrinciple:false} : t)}
    : s)});
}
```
Replace with:
```js
function unflagPrincipleTask(data, save, sheetId, taskId) {
  save({...data, sheets: data.sheets.map(s => s.id===sheetId
    ? {...s, tasks: s.tasks.map(t => t.id===taskId ? {...t, isPrinciple:false} : t)}
    : s)});
}

function unflagPrincipleSubtask(data, save, sheetId, taskId, subtaskId) {
  save({...data, sheets: data.sheets.map(s => s.id===sheetId
    ? {...s, tasks: s.tasks.map(t => t.id===taskId
        ? {...t, subtasks: (t.subtasks||[]).map(st => st.id===subtaskId ? {...st, isPrinciple:false} : st)}
        : t)}
    : s)});
}
```

- [ ] **Step 4: Extend `principlesDeleteHandler` with the subtask branch**

Find:
```js
function principlesDeleteHandler(data, save) {
  return p => p.sourceTaskId
    ? unflagPrincipleTask(data, save, p.sourceSheetId, p.sourceTaskId)
    : deleteStandalonePrinciple(data, save, p.id);
}
```
Replace with:
```js
function principlesDeleteHandler(data, save) {
  return p => {
    if (p.sourceSubtaskId) unflagPrincipleSubtask(data, save, p.sourceSheetId, p.sourceTaskId, p.sourceSubtaskId);
    else if (p.sourceTaskId) unflagPrincipleTask(data, save, p.sourceSheetId, p.sourceTaskId);
    else deleteStandalonePrinciple(data, save, p.id);
  };
}
```

- [ ] **Step 5: Verify in preview**

Flag a subtask as a principle (via Task 1's menu item). Navigate to "עקרון תכנון" — confirm a new row appears with the subtask's title/discipline, "מקור" showing the clickable "משימה ↗" link (since `sourceTaskId` is set even for subtask rows). Click "✕" on that row — confirm it disappears, then go back to that subtask and confirm its row icon (from Task 2) and context-menu label are back to the "unflagged" state. Also check "מבט על" shows the same row (since both read `computePrinciples`).

- [ ] **Step 6: Commit**

```bash
git add project_hub.html
git commit -m "feat: include subtasks in computed עקרון תכנון table"
```
