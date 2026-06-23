# Planning Principles (עקרון תכנון) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user flag any task as a "planning principle" (checkbox in task detail) or add a standalone principle directly, and see all of them in one table (description/discipline/created date/source) both on a new "עקרון תכנון" sidebar page and embedded in "מבט על".

**Architecture:** The principles table is **computed**, not stored as an independent list — a shared `computePrinciples(data)` helper flattens every sheet's tasks where `isPrinciple===true` plus a new top-level `data.standalonePrinciples` array, and a shared `PrinciplesTable` component renders the result. This sidesteps the fact that `TaskDetailSidebar`/`ListView` only ever see one sheet's data, not the full project `data` — the checkbox just sets two plain fields on the task through the existing sheet-scoped save path, with no need to write into a separate top-level array from deep inside a sheet view.

**Tech Stack:** Single-file HTML app (`project_hub.html`), React 18 via Babel standalone, no build step, no test framework. Verification via the Claude Code browser preview tool (`mcp__Claude_Preview__*`), same pattern as prior changes in this file.

**Scope note for the implementer:** the design spec (`docs/superpowers/specs/2026-06-22-planning-principles-design.md`) describes the "מקור" (source) cell as something that "navigates to/opens" the source task. This plan implements a deliberately scoped-down version of that: clicking it switches the sidebar to "ניהול תכנון" (where the task is visible in מבט מאוחד), it does **not** auto-open that specific task's detail popup — building that deep-link would require new state plumbing through `App()`/`NihulTikhnunView`/`ListView` that's out of scope here. If a tighter deep-link is wanted later, that's a follow-up.

---

### Task 1: Task-level `isPrinciple` flag — checkbox + delete/uncheck confirmation

**Files:**
- Modify: `project_hub.html` inside `TaskDetailSidebar` (search for `const propRow`, ~line 4341, and the "Properties" block right after it, ~line 4399-4406)
- Modify: `project_hub.html` inside `ListView`'s `deleteTask` (search for `const deleteTask=`, ~line 6394)

- [ ] **Step 1: Confirm current code**

Read `project_hub.html` and confirm these two snippets are present (search by the quoted text if line numbers have drifted):

```jsx
  const propRow = (label, content) => (
    <div className="tds-prop-row" key={label}>
      <span className="tds-prop-lbl">{label}</span>
      <div className="tds-prop-val">{content}</div>
    </div>
  );
```

and, further down in the same function:

```jsx
{/* Properties */}
<div style={{marginBottom:18,borderRadius:8,border:'1px solid var(--border)',overflow:'hidden'}}>
  {propRow('עדיפות', <PriorityCell priority={task.priority} onChange={v=>onUpdate({...task,priority:v})}/>)}
  {propRow('תחום',   <DisciplineCell discipline={task.discipline} onChange={v=>onUpdate({...task,discipline:v})}/>)}
  {propRow('תאריכים',
    <DateRangeCell startDate={task.startDate} dueDate={task.dueDate} isParent={true}
      onChange={(f,v)=>onUpdate({...task,[f]:v})}/>)}
</div>
```

And, in `ListView`:
```js
  const deleteTask=id=>savePartial({tasks:tasks.filter(t=>t.id!==id)});
```

If any of these differ in content (not just line numbers), STOP and report BLOCKED.

- [ ] **Step 2: Add the "עקרון תכנון" checkbox row**

Find:
```jsx
  {propRow('תאריכים',
    <DateRangeCell startDate={task.startDate} dueDate={task.dueDate} isParent={true}
      onChange={(f,v)=>onUpdate({...task,[f]:v})}/>)}
</div>
```
Replace with:
```jsx
  {propRow('תאריכים',
    <DateRangeCell startDate={task.startDate} dueDate={task.dueDate} isParent={true}
      onChange={(f,v)=>onUpdate({...task,[f]:v})}/>)}
  {propRow('עקרון תכנון',
    <input type="checkbox" checked={!!task.isPrinciple}
      onChange={e=>{
        const next=e.target.checked;
        if(!next && task.isPrinciple && !window.confirm('המשימה מקושרת לעקרון תכנון — הפעולה תסיר אותה מרשימת העקרונות. להמשיך?')) return;
        onUpdate({...task, isPrinciple:next, principleCreatedAt: next ? (task.principleCreatedAt || new Date().toISOString().slice(0,10)) : task.principleCreatedAt});
      }}
      style={{cursor:'pointer'}}/>)}
</div>
```

This follows the existing checkbox convention used elsewhere in the file (e.g. `<input type="checkbox" checked={showMilestones} onChange={e=>setShowMilestones(e.target.checked)}.../>`). `principleCreatedAt` is set once (first time checked) and left untouched if unchecked/rechecked later, per the design spec.

- [ ] **Step 3: Confirm before deleting a flagged task**

Find:
```js
  const deleteTask=id=>savePartial({tasks:tasks.filter(t=>t.id!==id)});
```
Replace with:
```js
  const deleteTask=id=>{
    const t=tasks.find(x=>x.id===id);
    if(t?.isPrinciple && !window.confirm('המשימה מקושרת לעקרון תכנון — הפעולה תסיר אותה מרשימת העקרונות. להמשיך?')) return;
    savePartial({tasks:tasks.filter(x=>x.id!==id)});
  };
```

This is the single `deleteTask` definition used by every delete call site in `ListView` (task row menu, etc.) — centralizing the check here covers all of them without touching each call site.

- [ ] **Step 4: Verify in preview**

Start/reload the `project-hub` preview server. Open any sheet (e.g. ניהול תכנון → a track sheet, or directly a sheet under מסלול רישוי), open a task's detail (click a task row to open `TaskDetailSidebar`), confirm a new "עקרון תכנון" row with a checkbox appears below "תאריכים". Check it, confirm no error. Uncheck it — confirm a `window.confirm` dialog appears with the expected Hebrew text (note: `window.confirm` in the Claude Code preview browser may need to be handled via `preview_eval` reading `window.confirm` calls, or simply verify by checking the task's `isPrinciple` field via `preview_eval` before/after, since native dialogs can't always be driven from automation — if the dialog blocks automation, verify the underlying logic by toggling `task.isPrinciple` via `preview_eval` directly and confirming `deleteTask`'s confirm gate triggers on a flagged task).

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "feat: add isPrinciple task flag with checkbox and delete/uncheck confirmation"
```

---

### Task 2: `computePrinciples` helper, standalone-principle CRUD helpers, and `PrinciplesTable` component

**Files:**
- Modify: `project_hub.html` — insert new top-level functions immediately before `function OverviewPage({data, save}) {` (search for that exact text, ~line 5969)

- [ ] **Step 1: Confirm current code**

Read `project_hub.html` and confirm `function OverviewPage({data, save}) {` is present (search if line number drifted). Also confirm, by searching the whole file, that `function DisciplineCell({discipline, onChange})` exists (used by the new add-form in Task 3) and note its line number.

- [ ] **Step 2: Insert the helper functions and shared table component**

Insert this block immediately before `function OverviewPage({data, save}) {`:

```jsx
/* ══════════════════════════════════════
   Planning Principles — computed table + shared helpers
   (see docs/superpowers/specs/2026-06-22-planning-principles-design.md)
══════════════════════════════════════ */
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

function deleteStandalonePrinciple(data, save, id) {
  save({...data, standalonePrinciples: (data.standalonePrinciples||[]).filter(p => p.id!==id)});
}

function addStandalonePrinciple(data, save, description, discipline) {
  save({...data, standalonePrinciples: [
    ...(data.standalonePrinciples||[]),
    {id:uid(), description, discipline, createdAt:new Date().toISOString().slice(0,10)},
  ]});
}

function PrinciplesTable({principles, onDeleteRow, onOpenSource}) {
  return (
    <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
      <thead>
        <tr style={{borderBottom:'1px solid var(--border)', textAlign:'right'}}>
          <th style={{padding:'6px 8px'}}>תיאור</th>
          <th style={{padding:'6px 8px'}}>תחום</th>
          <th style={{padding:'6px 8px'}}>תאריך יצירה</th>
          <th style={{padding:'6px 8px'}}>מקור</th>
          <th style={{padding:'6px 8px', width:24}}></th>
        </tr>
      </thead>
      <tbody>
        {principles.length===0 && (
          <tr><td colSpan={5} style={{padding:'14px 8px', color:'var(--text-3)', textAlign:'center'}}>אין עקרונות תכנון עדיין</td></tr>
        )}
        {principles.map(p => (
          <tr key={p.id} style={{borderBottom:'1px solid var(--border)'}}>
            <td style={{padding:'6px 8px'}}>{p.description}</td>
            <td style={{padding:'6px 8px'}}>{p.discipline || '—'}</td>
            <td style={{padding:'6px 8px'}}>{p.createdAt || '—'}</td>
            <td style={{padding:'6px 8px'}}>
              {p.sourceTaskId
                ? <button onClick={()=>onOpenSource&&onOpenSource()}
                    style={{background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:12, padding:0, textDecoration:'underline'}}>
                    משימה ↗
                  </button>
                : <span style={{color:'var(--text-3)'}}>נוסף ישירות</span>}
            </td>
            <td style={{padding:'6px 8px'}}>
              <button onClick={()=>onDeleteRow(p)}
                style={{background:'none', border:'none', color:'#cbd5e1', cursor:'pointer', fontSize:12}}>
                ✕
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "feat: add computePrinciples helper and shared PrinciplesTable component"
```

---

### Task 3: New "עקרון תכנון" sidebar page

**Files:**
- Modify: `project_hub.html` `ICONS` constant (search for `const ICONS = {`, last entry currently `template:`)
- Modify: `project_hub.html` `PROJ_TRACKS` constant (search for `const PROJ_TRACKS`)
- Modify: `project_hub.html` App's content switch (search for `track==='template'`)
- Create (new function, inserted immediately before `function App() {`): `PrinciplesView`

- [ ] **Step 1: Confirm current code**

Confirm these three snippets (search by quoted text if line numbers drifted):

```js
  menu:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>,
  template:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="2.5" r="1.5"/><path d="M8 4v3M4 11v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/><circle cx="12" cy="13" r="1.5"/></svg>,
};
```

```js
const PROJ_TRACKS = [
  {id:'overview',    label:'מבט על',              icon:'overview',    enabled:true},
  {id:'tasks',       label:'ניהול תכנון',          icon:'tasks',       enabled:true},
  {id:'licensing',   label:'מסלול רישוי',          icon:'licensing',   enabled:true},
  {id:'planning',    label:'מסלול תכנון מפורט',    icon:'planning',    enabled:false},
  {id:'execution',   label:'מסלול ביצוע',          icon:'execution',   enabled:false},
  {id:'meetings',    label:'ישיבות',               icon:'meetings',    enabled:true},
  {id:'supervision', label:'פיקוח',                icon:'supervision', enabled:true},
  {id:'template',    label:'טמפלייט',              icon:'template',    enabled:true},
];
```

```jsx
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
        {track==='template'    && <TemplateView data={data} save={save}/>}
      </div>
```

Also search for `{track==='overview'` in the same content-switch block and quote the full line — you'll need it for Step 5.

If anything differs in content, STOP and report BLOCKED.

- [ ] **Step 2: Add a `principles` icon to `ICONS`**

Find:
```js
  menu:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>,
  template:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="2.5" r="1.5"/><path d="M8 4v3M4 11v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/><circle cx="12" cy="13" r="1.5"/></svg>,
};
```
Replace with:
```js
  menu:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>,
  template:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="2.5" r="1.5"/><path d="M8 4v3M4 11v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/><circle cx="12" cy="13" r="1.5"/></svg>,
  principles:  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M9 2v3h3"/><path d="M5 9l1.5 1.5L9 8"/></svg>,
};
```

- [ ] **Step 3: Add a `principles` entry to `PROJ_TRACKS`**

Find:
```js
  {id:'template',    label:'טמפלייט',              icon:'template',    enabled:true},
];
```
Replace with:
```js
  {id:'template',    label:'טמפלייט',              icon:'template',    enabled:true},
  {id:'principles',  label:'עקרון תכנון',          icon:'principles',  enabled:true},
];
```

- [ ] **Step 4: Write the `PrinciplesView` component**

Insert this new function immediately before `function App() {`:

```jsx
/* ══════════════════════════════════════
   Principles View — עקרון תכנון sidebar page
══════════════════════════════════════ */
function PrinciplesView({data, save, onNavigateToTasks}) {
  const [adding, setAdding] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [discDraft, setDiscDraft] = useState('');
  const principles = computePrinciples(data);

  const submitAdd = () => {
    if (!descDraft.trim()) { setAdding(false); return; }
    addStandalonePrinciple(data, save, descDraft.trim(), discDraft);
    setAdding(false); setDescDraft(''); setDiscDraft('');
  };
  const onDeleteRow = p => {
    if (p.sourceTaskId) unflagPrincipleTask(data, save, p.sourceSheetId, p.sourceTaskId);
    else deleteStandalonePrinciple(data, save, p.id);
  };

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'auto', padding:24, gap:16}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2 style={{fontSize:15, fontWeight:700, margin:0}}>עקרון תכנון</h2>
        <button onClick={()=>setAdding(true)}
          style={{background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontSize:12, cursor:'pointer', fontFamily:'inherit'}}>
          + הוסף עקרון
        </button>
      </div>
      {adding && (
        <div style={{display:'flex', gap:8, alignItems:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:10}}>
          <input autoFocus value={descDraft} onChange={e=>setDescDraft(e.target.value)}
            placeholder="תיאור העיקרון"
            style={{flex:1, border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', fontSize:12, fontFamily:'inherit'}}/>
          <DisciplineCell discipline={discDraft} onChange={setDiscDraft}/>
          <button onClick={submitAdd}
            style={{background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, padding:'5px 12px', fontSize:12, cursor:'pointer', fontFamily:'inherit'}}>
            שמור
          </button>
          <button onClick={()=>{setAdding(false);setDescDraft('');setDiscDraft('');}}
            style={{background:'none', border:'none', color:'var(--text-3)', fontSize:12, cursor:'pointer', fontFamily:'inherit'}}>
            ביטול
          </button>
        </div>
      )}
      <PrinciplesTable principles={principles} onDeleteRow={onDeleteRow} onOpenSource={onNavigateToTasks}/>
    </div>
  );
}
```

- [ ] **Step 5: Route `track==='principles'` to `PrinciplesView`, and wire `onNavigateToTasks` for both this and the overview route**

Find:
```jsx
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
        {track==='template'    && <TemplateView data={data} save={save}/>}
      </div>
```
Replace with:
```jsx
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
        {track==='template'    && <TemplateView data={data} save={save}/>}
        {track==='principles'  && <PrinciplesView data={data} save={save} onNavigateToTasks={()=>setTrack('tasks')}/>}
      </div>
```

Then find the `{track==='overview' && <OverviewPage .../>}` line you quoted in Step 1 and add an `onNavigateToTasks={()=>setTrack('tasks')}` prop to it the same way (exact replacement depends on its current exact text — apply the same pattern: add `onNavigateToTasks={()=>setTrack('tasks')}` as a new prop on the `<OverviewPage .../>` element).

- [ ] **Step 6: Verify in preview**

Reload the `project-hub` preview. Confirm a new "עקרון תכנון" sidebar entry appears (under "ספריית לוד", alongside "טמפלייט"). Click it:
- Confirm the page shows "עקרון תכנון" heading, "+ הוסף עקרון" button, and an empty-state table row ("אין עקרונות תכנון עדיין") if no principles exist yet.
- Click "+ הוסף עקרון", type a description, pick a discipline, click "שמור" — confirm a new row appears in the table with that description/discipline and today's date, "מקור" showing "נוסף ישירות".
- Go flag a task as a principle (per Task 1's checkbox), come back to this page, confirm that task now also appears as a row with "מקור" showing a clickable "משימה ↗" link. Click it — confirm the sidebar switches to "ניהול תכנון".
- Click "✕" on the standalone row — confirm it disappears. Click "✕" on the task-sourced row — confirm it disappears, then go check that task's detail — confirm its "עקרון תכנון" checkbox is now unchecked.

- [ ] **Step 7: Commit**

```bash
git add project_hub.html
git commit -m "feat: add עקרון תכנון sidebar page"
```

---

### Task 4: Embed the principles table in "מבט על"

**Files:**
- Modify: `project_hub.html` `OverviewPage` function (search for `ov-stats-row`)

- [ ] **Step 1: Confirm current code**

Read `project_hub.html` and confirm the stats-row block:
```jsx
      {/* ── 2. Stats row ── */}
      <div className="ov-stats-row">
        {[
          {num:total,      label:'סה"כ משימות',    color:'var(--text)'},
          {num:inProg,     label:'בעבודה',          color:'#2563EB'},
          {num:waiting,    label:'ממתין / בסקירה',  color:'#D97706'},
          {num:done,       label:'הושלמו',          color:'#059669'},
          {num:total-done, label:'פתוחות',          color:'#6B7280'},
        ].map((c,i)=>(
          <div key={i} className="ov-stat-card">
            <div className="ov-stat-num" style={{color:c.color}}>{c.num}</div>
            <div className="ov-stat-label">{c.label}</div>
          </div>
        ))}
      </div>
```
And confirm `OverviewPage`'s signature includes the props you need: `function OverviewPage({data, save})` — note it does NOT currently take `onNavigateToTasks`; this task adds that prop. If the stats-row content differs, STOP and report BLOCKED.

- [ ] **Step 2: Add `onNavigateToTasks` to the function signature**

Find:
```js
function OverviewPage({data, save}) {
```
Replace with:
```js
function OverviewPage({data, save, onNavigateToTasks}) {
```

- [ ] **Step 3: Add a principles section right after the stats row**

Find:
```jsx
      {/* ── 2. Stats row ── */}
      <div className="ov-stats-row">
        {[
          {num:total,      label:'סה"כ משימות',    color:'var(--text)'},
          {num:inProg,     label:'בעבודה',          color:'#2563EB'},
          {num:waiting,    label:'ממתין / בסקירה',  color:'#D97706'},
          {num:done,       label:'הושלמו',          color:'#059669'},
          {num:total-done, label:'פתוחות',          color:'#6B7280'},
        ].map((c,i)=>(
          <div key={i} className="ov-stat-card">
            <div className="ov-stat-num" style={{color:c.color}}>{c.num}</div>
            <div className="ov-stat-label">{c.label}</div>
          </div>
        ))}
      </div>
```
Replace with:
```jsx
      {/* ── 2. Stats row ── */}
      <div className="ov-stats-row">
        {[
          {num:total,      label:'סה"כ משימות',    color:'var(--text)'},
          {num:inProg,     label:'בעבודה',          color:'#2563EB'},
          {num:waiting,    label:'ממתין / בסקירה',  color:'#D97706'},
          {num:done,       label:'הושלמו',          color:'#059669'},
          {num:total-done, label:'פתוחות',          color:'#6B7280'},
        ].map((c,i)=>(
          <div key={i} className="ov-stat-card">
            <div className="ov-stat-num" style={{color:c.color}}>{c.num}</div>
            <div className="ov-stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── 2b. Planning principles ── */}
      <div className="ov-section" style={{marginTop:16}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
          <h3 style={{fontSize:13, fontWeight:700, margin:0}}>עקרון תכנון</h3>
        </div>
        <PrinciplesTable principles={computePrinciples(data)}
          onDeleteRow={p => p.sourceTaskId
            ? unflagPrincipleTask(data, save, p.sourceSheetId, p.sourceTaskId)
            : deleteStandalonePrinciple(data, save, p.id)}
          onOpenSource={onNavigateToTasks}/>
      </div>
```

(`className="ov-section"` reuses the existing section styling already applied to the Team/Goals/Milestones blocks elsewhere in this same component, for visual consistency — if that class doesn't produce a reasonable boxed-section look here because it expects to be a grid child, wrap the content in a plain `<div style={{border:'1px solid var(--border)', borderRadius:8, padding:14}}>` instead and drop the `className`.)

- [ ] **Step 4: Verify in preview**

Reload the preview, navigate to "מבט על". Confirm a new "עקרון תכנון" section appears below the stats row, showing the same principles (standalone + task-flagged) as the dedicated page from Task 3. Add/delete a principle from one location, switch to the other, confirm it's reflected there too (since both read the same computed data).

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "feat: embed עקרון תכנון table in מבט על"
```
