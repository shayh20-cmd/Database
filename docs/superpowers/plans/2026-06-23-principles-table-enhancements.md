# Principles Table Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "מסלול/שלב" source column to the עקרון תכנון table, render תחום as a colored pill (matching the rest of the app), and make standalone (manually-added) rows' תיאור/תחום/תאריך יצירה editable inline.

**Architecture:** `computePrinciples` gains two more computed fields per task/subtask row (`trackLabel`/`stageLabel`, via the existing `trackLabelOf` helper). `PrinciplesTable` gains a new column and inline-edit affordances gated to rows with no `sourceTaskId`/`sourceSubtaskId`. A new `updateStandalonePrinciple` helper + `principlesUpdateHandler` factory mirror the existing delete helper/factory pair, and get threaded through `PrinciplesTable`'s two existing call sites the same way `onDeleteRow` already is.

**Tech Stack:** Single-file HTML app (`project_hub.html`), React 18 via Babel standalone, no build step, no test framework. Verification via the Claude Code browser preview tool (`mcp__Claude_Preview__*`).

---

### Task 1: `computePrinciples` — add track/stage labels

**Files:**
- Modify: `project_hub.html` `computePrinciples` (search for `function computePrinciples`, currently ~line 5999)

- [ ] **Step 1: Confirm current code**

Read `project_hub.html` and confirm this exact snippet (search by quoted text if line numbers have drifted):

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

Also confirm `const trackLabelOf = (tracks, s) => (tracks.find(t => t.trackValue===s.track) || {}).label || (s.track || 'ניהול שוטף');` exists somewhere in the file (search for `const trackLabelOf`). It's defined later in the file than `computePrinciples`, but that's fine — `computePrinciples` only references it inside a function body that runs later (when actually called during render), by which point the whole script has finished loading and `trackLabelOf` is defined. Do not move either declaration.

If anything differs in content, STOP and report BLOCKED.

- [ ] **Step 2: Add `trackLabel`/`stageLabel` to both task and subtask rows**

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
Replace with:
```js
function computePrinciples(data) {
  const sheets = data.sheets || [];
  const tracks = data.tracks || [];
  const fromTasks = sheets.flatMap(s => (s.tasks||[]).filter(t=>t.isPrinciple).map(t => ({
    id: t.id,
    description: t.title || '',
    discipline: t.discipline || '',
    createdAt: t.principleCreatedAt || '',
    sourceSheetId: s.id,
    sourceTaskId: t.id,
    trackLabel: trackLabelOf(tracks, s),
    stageLabel: s.name,
  })));
  const fromSubtasks = sheets.flatMap(s => (s.tasks||[]).flatMap(t => (t.subtasks||[]).filter(st=>st.isPrinciple).map(st => ({
    id: st.id,
    description: st.title || '',
    discipline: st.discipline || '',
    createdAt: st.principleCreatedAt || '',
    sourceSheetId: s.id,
    sourceTaskId: t.id,
    sourceSubtaskId: st.id,
    trackLabel: trackLabelOf(tracks, s),
    stageLabel: s.name,
  }))));
  const standalone = (data.standalonePrinciples||[]).map(p => ({
    ...p, sourceSheetId: null, sourceTaskId: null, trackLabel: null, stageLabel: null,
  }));
  return [...fromTasks, ...fromSubtasks, ...standalone];
}
```

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "feat: compute track/stage labels for task-sourced principle rows"
```

---

### Task 2: Standalone-principle edit helper

**Files:**
- Modify: `project_hub.html` — insert `updateStandalonePrinciple` right after `deleteStandalonePrinciple` (search for `function deleteStandalonePrinciple`, currently ~line 6038)
- Modify: `project_hub.html` — insert `principlesUpdateHandler` right after `principlesDeleteHandler` (search for `function principlesDeleteHandler`, currently ~line 6049)

- [ ] **Step 1: Confirm current code**

Confirm these two exact snippets:

```js
function deleteStandalonePrinciple(data, save, id) {
  save({...data, standalonePrinciples: (data.standalonePrinciples||[]).filter(p => p.id!==id)});
}
```

```js
function principlesDeleteHandler(data, save) {
  return p => {
    if (p.sourceSubtaskId) unflagPrincipleSubtask(data, save, p.sourceSheetId, p.sourceTaskId, p.sourceSubtaskId);
    else if (p.sourceTaskId) unflagPrincipleTask(data, save, p.sourceSheetId, p.sourceTaskId);
    else deleteStandalonePrinciple(data, save, p.id);
  };
}
```

If anything differs, STOP and report BLOCKED.

- [ ] **Step 2: Add `updateStandalonePrinciple`**

Find:
```js
function deleteStandalonePrinciple(data, save, id) {
  save({...data, standalonePrinciples: (data.standalonePrinciples||[]).filter(p => p.id!==id)});
}
```
Replace with:
```js
function deleteStandalonePrinciple(data, save, id) {
  save({...data, standalonePrinciples: (data.standalonePrinciples||[]).filter(p => p.id!==id)});
}

function updateStandalonePrinciple(data, save, id, patch) {
  save({...data, standalonePrinciples: (data.standalonePrinciples||[]).map(p => p.id===id ? {...p, ...patch} : p)});
}
```

- [ ] **Step 3: Add `principlesUpdateHandler`**

Find:
```js
function principlesDeleteHandler(data, save) {
  return p => {
    if (p.sourceSubtaskId) unflagPrincipleSubtask(data, save, p.sourceSheetId, p.sourceTaskId, p.sourceSubtaskId);
    else if (p.sourceTaskId) unflagPrincipleTask(data, save, p.sourceSheetId, p.sourceTaskId);
    else deleteStandalonePrinciple(data, save, p.id);
  };
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

function principlesUpdateHandler(data, save) {
  return (id, patch) => updateStandalonePrinciple(data, save, id, patch);
}
```

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "feat: add updateStandalonePrinciple helper for inline editing"
```

---

### Task 3: `PrinciplesTable` — new column, pill rendering, inline edit

**Files:**
- Modify: `project_hub.html` `PrinciplesTable` (search for `function PrinciplesTable`, currently ~line 6057)
- Modify: `project_hub.html` both call sites (search for `<PrinciplesTable`)

- [ ] **Step 1: Confirm current code**

Confirm the exact current `PrinciplesTable` body:

```jsx
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

Also confirm `function DisciplineCell({discipline, onChange})` exists (search for it) and `const ListsCtx = React.createContext({...disciplines: DISCIPLINES...})` exists (search for `const ListsCtx`) — `PrinciplesTable` will call `useContext(ListsCtx)` to get `disciplines` for the pill lookup, same pattern `DisciplineCell` itself already uses. If anything differs, STOP and report BLOCKED.

- [ ] **Step 2: Replace `PrinciplesTable` with the enhanced version**

Find the entire block quoted in Step 1 and replace it with:

```jsx
function PrinciplesTable({principles, onDeleteRow, onOpenSource, onEditStandalone}) {
  const {disciplines} = useContext(ListsCtx);
  const [editingField, setEditingField] = useState(null); // {id, field} | null
  const [draft, setDraft] = useState('');

  const isEditable = p => !p.sourceTaskId && !p.sourceSubtaskId;
  const startEdit = (p, field, initial) => { setEditingField({id:p.id, field}); setDraft(initial); };
  const commitEdit = p => {
    if (editingField?.field==='description') onEditStandalone(p.id, {description: draft});
    if (editingField?.field==='createdAt') onEditStandalone(p.id, {createdAt: draft});
    setEditingField(null);
  };

  const renderDiscipline = p => {
    const disc = disciplines.find(d => d.id===p.discipline);
    const pill = disc
      ? <span className="pill" style={{color:'#fff', background:disc.color}}>{disc.label}</span>
      : <span style={{color:'var(--text-3)'}}>—</span>;
    if (!isEditable(p)) return pill;
    return (
      <div style={{position:'relative', display:'inline-block'}}>
        <div onClick={()=>setEditingField(editingField?.id===p.id && editingField.field==='discipline' ? null : {id:p.id, field:'discipline'})}
          style={{cursor:'pointer'}}>
          {pill}
        </div>
        {editingField?.id===p.id && editingField.field==='discipline' && (
          <div style={{position:'absolute', zIndex:10, top:'100%', right:0}}>
            <DisciplineCell discipline={p.discipline} onChange={v=>{onEditStandalone(p.id, {discipline:v}); setEditingField(null);}}/>
          </div>
        )}
      </div>
    );
  };

  return (
    <table style={{width:'100%', borderCollapse:'collapse', fontSize:12}}>
      <thead>
        <tr style={{borderBottom:'1px solid var(--border)', textAlign:'right'}}>
          <th style={{padding:'6px 8px'}}>תיאור</th>
          <th style={{padding:'6px 8px'}}>תחום</th>
          <th style={{padding:'6px 8px'}}>תאריך יצירה</th>
          <th style={{padding:'6px 8px'}}>מסלול/שלב</th>
          <th style={{padding:'6px 8px'}}>מקור</th>
          <th style={{padding:'6px 8px', width:24}}></th>
        </tr>
      </thead>
      <tbody>
        {principles.length===0 && (
          <tr><td colSpan={6} style={{padding:'14px 8px', color:'var(--text-3)', textAlign:'center'}}>אין עקרונות תכנון עדיין</td></tr>
        )}
        {principles.map(p => (
          <tr key={p.id} style={{borderBottom:'1px solid var(--border)'}}>
            <td style={{padding:'6px 8px'}}>
              {isEditable(p) && editingField?.id===p.id && editingField.field==='description'
                ? <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)}
                    onBlur={()=>commitEdit(p)}
                    onKeyDown={e=>{if(e.key==='Enter')commitEdit(p);if(e.key==='Escape')setEditingField(null);}}
                    style={{fontSize:12, fontFamily:'inherit', border:'1px solid var(--accent)', borderRadius:4, padding:'2px 6px', width:'100%'}}/>
                : <span style={{cursor:isEditable(p)?'text':'default'}}
                    onClick={()=>isEditable(p)&&startEdit(p,'description',p.description)}>
                    {p.description}
                  </span>}
            </td>
            <td style={{padding:'6px 8px'}}>{renderDiscipline(p)}</td>
            <td style={{padding:'6px 8px'}}>
              {isEditable(p) && editingField?.id===p.id && editingField.field==='createdAt'
                ? <input autoFocus type="date" value={draft} onChange={e=>setDraft(e.target.value)}
                    onBlur={()=>commitEdit(p)}
                    onKeyDown={e=>{if(e.key==='Enter')commitEdit(p);if(e.key==='Escape')setEditingField(null);}}
                    style={{fontSize:12, fontFamily:'inherit', border:'1px solid var(--accent)', borderRadius:4, padding:'2px 6px'}}/>
                : <span style={{cursor:isEditable(p)?'text':'default'}}
                    onClick={()=>isEditable(p)&&startEdit(p,'createdAt',p.createdAt||todayISO())}>
                    {p.createdAt || '—'}
                  </span>}
            </td>
            <td style={{padding:'6px 8px'}}>
              {p.trackLabel ? `מסלול: ${p.trackLabel} / שלב: ${p.stageLabel}` : '—'}
            </td>
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

Note: `useContext`, `useState`, `todayISO`, `DisciplineCell`, `ListsCtx` are all pre-existing — reuse them, don't redefine.

- [ ] **Step 3: Wire `onEditStandalone` at both call sites**

Find (in `OverviewPage`, search for `<PrinciplesTable principles={computePrinciples(data)}`):
```jsx
        <PrinciplesTable principles={computePrinciples(data)}
          onDeleteRow={principlesDeleteHandler(data, save)}
          onOpenSource={onNavigateToTasks}/>
```
Replace with:
```jsx
        <PrinciplesTable principles={computePrinciples(data)}
          onDeleteRow={principlesDeleteHandler(data, save)}
          onOpenSource={onNavigateToTasks}
          onEditStandalone={principlesUpdateHandler(data, save)}/>
```

Find (in `PrinciplesView`, search for `<PrinciplesTable principles={principles} onDeleteRow={onDeleteRow}`):
```jsx
      <PrinciplesTable principles={principles} onDeleteRow={onDeleteRow} onOpenSource={onNavigateToTasks}/>
```
Replace with:
```jsx
      <PrinciplesTable principles={principles} onDeleteRow={onDeleteRow} onOpenSource={onNavigateToTasks}
        onEditStandalone={principlesUpdateHandler(data, save)}/>
```

- [ ] **Step 4: Verify in preview**

Reload the `project-hub` preview. Navigate to "עקרון תכנון":
- Confirm the table now has 6 columns including "מסלול/שלב", and the empty-state row spans 6 columns correctly.
- Add a standalone principle (the existing "+ הוסף עקרון" flow). Confirm its "מסלול/שלב" cell shows "—" and "תחום" cell shows "—" (no discipline picked in the add-form by default) or a pill if one was picked.
- Click the standalone row's description text → confirm it becomes an input; type a new value, press Enter → confirm it commits and displays as text again.
- Click the standalone row's תאריך יצירה → confirm a date picker appears, change it, confirm it commits.
- Click the standalone row's תחום cell → confirm the `DisciplineCell` picker dropdown opens; pick a value → confirm it now renders as a colored pill.
- Flag a task as a principle (existing flow). Confirm its row shows the colored pill for תחום (not editable — clicking it should do nothing, since `isEditable` is false for task-sourced rows), and "מסלול/שלב" shows `מסלול: ... / שלב: ...` matching that task's actual track/stage (cross-check against the "ניהול תכנון" sidebar page's hierarchy or the track pill shown in מבט מאוחד).
- Confirm clicking a task-sourced row's description/date does nothing (no edit affordance) — only standalone rows are editable.
- Check "מבט על" shows the identical enhanced table (same columns, same behavior), since both call the same `PrinciplesTable`.
- Clean up any test principles/flags created during verification.

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "feat: add מסלול/שלב column, pill discipline display, and inline edit for standalone principles"
```
