# Template Hierarchy Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "טמפלייט" sidebar page with a "סכימת עבודה" tab that shows the ניהול-תכנון track/stage hierarchy as an editable nested-box tree (rename, add/delete track, add/delete/reorder stage), backed by a new persisted `data.tracks` array that "ניהול תכנון" and `מבט מאוחד` read from instead of the hardcoded `NT_TRACK_TABS` constant.

**Architecture:** Single-file HTML app (`project_hub.html`), React 18 via Babel standalone, no build step, no test framework. One new top-level component (`TemplateView`), one new sidebar entry, one new migration step seeding `data.tracks` from the current hardcoded constant (so old saved data keeps working), and a rewire of `trackLabelOf`/`NihulTikhnunView` to read from `data.tracks`.

**Tech Stack:** Vanilla React 18 (Babel standalone). Verification is manual via the Claude Code browser preview tool (`mcp__Claude_Preview__*`), same pattern used for the prior changes in this file.

**Naming note for the implementer:** this codebase already has an unrelated `task.tracks` concept (per-task process "tracks", used in `migrateTask`, around `project_hub.html:1660-1668`). The new `data.tracks` (top-level, on the whole project's data object) is a completely different, unrelated array — don't confuse the two, and don't touch `migrateTask`'s `tracks` logic.

---

### Task 1: Data model — seed `data.tracks` from the existing hardcoded structure

**Files:**
- Modify: `project_hub.html:1679-1724` (`migrateData`)

- [ ] **Step 1: Confirm current code**

Read `project_hub.html:1671-1724` and confirm it matches:
```js
function stampSheetTracks(sheets) {
  return sheets.map(s => {
    if (s.type !== 'list') return s;
    if (s.name === 'ניהול תכנון') return {...s, name:'משימות שוטפות', track:null};
    return {...s, track: 'track' in s ? s.track : 'licensing'};
  });
}

function migrateData(d) {
  if (!d) return d;
  // Migrate old flat structure (groups/tasks) into sheets
  if (!d.sheets) {
    const sheetId = uid();
    const oldTasks = (d.tasks||[]).map(migrateTask);
    d = {
      ...d,
      sheets:[
        { id:uid(), name:'דאשבורד', type:'dashboard' },
        makeEmptySheet('ניהול תכנון'),
        makeEmptySheet('תיק מידע'),
        { id:sheetId, name:'תנאים מקדימים', type:'list',
          groups:d.groups||[], tasks:oldTasks, fields:d.fields||[], hiddenCols:d.hiddenCols||{}, colOrder:d.colOrder||[] },
        makeEmptySheet('בקרת תכן'),
      ],
    };
    delete d.groups; delete d.tasks; delete d.fields; delete d.hiddenCols; delete d.colOrder;
    return {...d, sheets: stampSheetTracks(d.sheets)};
  }
  // Already has sheets — migrate tasks within each sheet
  if (!d.licensingMilestones) {
    d = {...d, licensingMilestones:[
      {id:uid(),title:'קבלת תיק מידע',date:'2026-02-10',done:true},
      {id:uid(),title:'דיון בוועדה',  date:'2026-08-01',done:false},
    ]};
  }
  if (!d.licensingGoals) {
    d = {...d, licensingGoals:[
      {id:uid(),title:'קבלת תיק מידע',  targetDate:'2026-03-01',done:true},
      {id:uid(),title:'החלטת ועדה',      targetDate:'2026-09-01',done:false},
      {id:uid(),title:'קבלת היתר בנייה',targetDate:'2026-12-01',done:false},
    ]};
  }
  if (!d.staff) { d = {...d, staff: OFFICE_STAFF}; }
  // Migrate existing team members to include staffId
  if (d.team) {
    d = {...d, team: d.team.map(m => m.staffId ? m : {
      ...m,
      staffId: OFFICE_STAFF.find(s=>s.name===m.name)?.id || m.id,
    })};
  }
  return {...d, sheets: stampSheetTracks(d.sheets.map(s =>
    s.type==='list' ? {...s, tasks:(s.tasks||[]).map(migrateTask)} : s
  ))};
}
```
If it differs in content (not just line numbers), STOP and report BLOCKED.

- [ ] **Step 2: Add a `seedTracksIfMissing` helper right after `stampSheetTracks`**

Find:
```js
function stampSheetTracks(sheets) {
  return sheets.map(s => {
    if (s.type !== 'list') return s;
    if (s.name === 'ניהול תכנון') return {...s, name:'משימות שוטפות', track:null};
    return {...s, track: 'track' in s ? s.track : 'licensing'};
  });
}
```
Replace with:
```js
function stampSheetTracks(sheets) {
  return sheets.map(s => {
    if (s.type !== 'list') return s;
    if (s.name === 'ניהול תכנון') return {...s, name:'משימות שוטפות', track:null};
    return {...s, track: 'track' in s ? s.track : 'licensing'};
  });
}

/* data.tracks (ניהול-תכנון track/stage hierarchy editor) — unrelated to the
   per-task `tracks` field used by migrateTask. Seeded once from the legacy
   hardcoded track defs below if not already present, so old saved data
   keeps working without user action. */
const LEGACY_NT_TRACK_DEFS = [
  {id:'ongoing',   label:'ניהול שוטף',  trackValue:null},
  {id:'licensing', label:'מסלול רישוי', trackValue:'licensing'},
];
function seedTracksIfMissing(d) {
  if (d.tracks) return d;
  const sheets = d.sheets||[];
  const tracks = LEGACY_NT_TRACK_DEFS.map(def => ({
    ...def,
    stageOrder: sheets.filter(s => s.type==='list' && s.track===def.trackValue).map(s => s.id),
  }));
  return {...d, tracks};
}
```

- [ ] **Step 3: Apply `seedTracksIfMissing` at both exit points of `migrateData`**

Find:
```js
    delete d.groups; delete d.tasks; delete d.fields; delete d.hiddenCols; delete d.colOrder;
    return {...d, sheets: stampSheetTracks(d.sheets)};
  }
```
Replace with:
```js
    delete d.groups; delete d.tasks; delete d.fields; delete d.hiddenCols; delete d.colOrder;
    return seedTracksIfMissing({...d, sheets: stampSheetTracks(d.sheets)});
  }
```

Find:
```js
  return {...d, sheets: stampSheetTracks(d.sheets.map(s =>
    s.type==='list' ? {...s, tasks:(s.tasks||[]).map(migrateTask)} : s
  ))};
}
```
Replace with:
```js
  return seedTracksIfMissing({...d, sheets: stampSheetTracks(d.sheets.map(s =>
    s.type==='list' ? {...s, tasks:(s.tasks||[]).map(migrateTask)} : s
  ))});
}
```

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "feat: seed data.tracks hierarchy from legacy NT_TRACK_TABS on migration"
```

---

### Task 2: Rewire `trackLabelOf` and `NihulTikhnunView` to read from `data.tracks`

**Files:**
- Modify: `project_hub.html:7348-7438` (`NT_TRACK_TABS`, `trackLabelOf`, `NihulTikhnunView`'s tab state/bar/sheet-filtering)

- [ ] **Step 1: Confirm current code**

Read `project_hub.html:7343-7438` and confirm:
```jsx
/* ══════════════════════════════════════
   Nihul Tikhnun View
══════════════════════════════════════ */
/* Which sheets show under each ניהול-תכנון sub-tab. Extending to a future
   track (e.g. tender/execution) is adding one entry here. */
const NT_TRACK_TABS = [
  {id:'ongoing',   label:'ניהול שוטף',  match: s => s.track==null},
  {id:'licensing', label:'מסלול רישוי', match: s => s.track==='licensing'},
];
const trackLabelOf = s => (NT_TRACK_TABS.find(t => t.match(s)) || {}).label || (s.track || 'ניהול שוטף');

function NihulTikhnunView({data, save}) {
  const priorities  = data.priorities  || PRIORITIES;
  const disciplines = data.disciplines || DISCIPLINES;
  const statuses    = data.statuses    || STATUSES;
  const [editList, setEditList] = useState(null);
  const [activeTrackTab, setActiveTrackTab] = useState('combined');

  const allSheets = data.sheets || [];
  const isCombinedTab = activeTrackTab==='combined';
  const activeTab = NT_TRACK_TABS.find(t => t.id===activeTrackTab) || NT_TRACK_TABS[0];
  const visibleSheets = isCombinedTab ? [] : allSheets.filter(s => s.type==='list' && activeTab.match(s));
```
(Note: `activeTrackTab` was already changed to default `'combined'` and the tab bar already only renders the combined tab — from a prior session change. `trackLabelOf` and `activeTab`/`visibleSheets` still reference `NT_TRACK_TABS` directly — that's what this task changes.)

Also confirm, further down:
```jsx
  const combinedData = isCombinedTab ? {
    ...combinedMeta,
    type:'list',
    __combined:true,
    groups: [...combinedSourceSheets.flatMap(s => s.groups||[]), ...(combinedMeta.groups||[])],
    tasks: combinedSourceSheets.flatMap(s => (s.tasks||[]).map(t => ({...t, __srcSheetId:s.id, __track:trackLabelOf(s), __stage:s.name}))),
  } : null;
```
and:
```jsx
          {[{id:'combined', label:'מבט מאוחד'}].map(t => (
```
If anything differs (beyond what's noted above as already-changed), STOP and report BLOCKED.

- [ ] **Step 2: Replace `NT_TRACK_TABS`/`trackLabelOf` with data-driven lookups**

`trackLabelOf` needs access to `data.tracks`, so it becomes a function that takes the tracks array as a parameter (it's called both from module scope conceptually and from inside `NihulTikhnunView` — making it a plain function taking `(tracks, s)` keeps it pure and simple to test/read).

Find:
```jsx
/* ══════════════════════════════════════
   Nihul Tikhnun View
══════════════════════════════════════ */
/* Which sheets show under each ניהול-תכנון sub-tab. Extending to a future
   track (e.g. tender/execution) is adding one entry here. */
const NT_TRACK_TABS = [
  {id:'ongoing',   label:'ניהול שוטף',  match: s => s.track==null},
  {id:'licensing', label:'מסלול רישוי', match: s => s.track==='licensing'},
];
const trackLabelOf = s => (NT_TRACK_TABS.find(t => t.match(s)) || {}).label || (s.track || 'ניהול שוטף');
```
Replace with:
```jsx
/* ══════════════════════════════════════
   Nihul Tikhnun View
══════════════════════════════════════ */
/* Track/stage hierarchy is data-driven via data.tracks (edited in the
   טמפלייט → סכימת עבודה page) — see seedTracksIfMissing for the legacy
   defaults old saved data is migrated from. */
const trackLabelOf = (tracks, s) => (tracks.find(t => t.trackValue===s.track) || {}).label || (s.track || 'ניהול שוטף');
```

- [ ] **Step 3: Update `NihulTikhnunView` to read `data.tracks` instead of `NT_TRACK_TABS`**

Find:
```jsx
function NihulTikhnunView({data, save}) {
  const priorities  = data.priorities  || PRIORITIES;
  const disciplines = data.disciplines || DISCIPLINES;
  const statuses    = data.statuses    || STATUSES;
  const [editList, setEditList] = useState(null);
  const [activeTrackTab, setActiveTrackTab] = useState('combined');

  const allSheets = data.sheets || [];
  const isCombinedTab = activeTrackTab==='combined';
  const activeTab = NT_TRACK_TABS.find(t => t.id===activeTrackTab) || NT_TRACK_TABS[0];
  const visibleSheets = isCombinedTab ? [] : allSheets.filter(s => s.type==='list' && activeTab.match(s));
```
Replace with:
```jsx
function NihulTikhnunView({data, save}) {
  const priorities  = data.priorities  || PRIORITIES;
  const disciplines = data.disciplines || DISCIPLINES;
  const statuses    = data.statuses    || STATUSES;
  const [editList, setEditList] = useState(null);
  const [activeTrackTab, setActiveTrackTab] = useState('combined');
  const ntTracks = data.tracks || [];

  const allSheets = data.sheets || [];
  const isCombinedTab = activeTrackTab==='combined';
  const activeTrack = ntTracks.find(t => t.id===activeTrackTab) || ntTracks[0];
  const visibleSheets = isCombinedTab || !activeTrack ? [] : allSheets.filter(s => s.type==='list' && s.track===activeTrack.trackValue);
```

- [ ] **Step 4: Update the `trackLabelOf(s)` call site to pass `ntTracks`**

Find:
```jsx
    tasks: combinedSourceSheets.flatMap(s => (s.tasks||[]).map(t => ({...t, __srcSheetId:s.id, __track:trackLabelOf(s), __stage:s.name}))),
```
Replace with:
```jsx
    tasks: combinedSourceSheets.flatMap(s => (s.tasks||[]).map(t => ({...t, __srcSheetId:s.id, __track:trackLabelOf(ntTracks, s), __stage:s.name}))),
```

- [ ] **Step 5: Update the `ongoingSheetId` lookup (it referenced the old `track==null` convention directly, which still works since `trackValue` for the 'ongoing' track is `null` — no change needed there)**

Read `project_hub.html` for the line `const ongoingSheetId = (allSheets.find(s => s.type==='list' && s.track==null) || {}).id;` and confirm it's unchanged/still correct — `s.track==null` still identifies the same sheets as before, since `seedTracksIfMissing` preserves `trackValue:null` for the 'ongoing' track. No edit needed here; just confirm by reading, don't change it.

- [ ] **Step 6: Verify in preview**

Start the `project-hub` preview server (`mcp__Claude_Preview__preview_start`, reuses the existing config), reload, navigate to "ניהול תכנון". Confirm:
- The page still loads with only the "מבט מאוחד" tab showing (unchanged from before this task).
- Inside מבט מאוחד, group by "מסלול" (same steps as previous verification: open קבוצות, pick מסלול) and confirm the track pills still read "מסלול: ניהול שוטף" / "מסלול: מסלול רישוי" exactly as before — proving `trackLabelOf` still resolves the same labels via `data.tracks` as it did via the old hardcoded constant.

- [ ] **Step 7: Commit**

```bash
git add project_hub.html
git commit -m "refactor: read ניהול-תכנון track/stage structure from data.tracks instead of NT_TRACK_TABS"
```

---

### Task 3: Add the טמפלייט sidebar page (shell + כללי placeholder)

**Files:**
- Modify: `project_hub.html:5611-5633` (`ICONS`) — add a `template` icon
- Modify: `project_hub.html:10150-10158` (`PROJ_TRACKS`) — add a `template` entry
- Modify: `project_hub.html:10578-10586` (App's content switch) — route `track==='template'`
- Create (as a new function in the same file, placed just above `App()`, i.e. before `project_hub.html:10393`): `TemplateView` component

- [ ] **Step 1: Add a `template` icon to `ICONS`**

Find:
```js
  menu:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>,
};
```
Replace with:
```js
  menu:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>,
  template:    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="2.5" r="1.5"/><path d="M8 4v3M4 11v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/><circle cx="12" cy="13" r="1.5"/></svg>,
};
```

- [ ] **Step 2: Add a `template` entry to `PROJ_TRACKS`**

Find:
```js
const PROJ_TRACKS = [
  {id:'overview',    label:'מבט על',              icon:'overview',    enabled:true},
  {id:'tasks',       label:'ניהול תכנון',          icon:'tasks',       enabled:true},
  {id:'licensing',   label:'מסלול רישוי',          icon:'licensing',   enabled:true},
  {id:'planning',    label:'מסלול תכנון מפורט',    icon:'planning',    enabled:false},
  {id:'execution',   label:'מסלול ביצוע',          icon:'execution',   enabled:false},
  {id:'meetings',    label:'ישיבות',               icon:'meetings',    enabled:true},
  {id:'supervision', label:'פיקוח',                icon:'supervision', enabled:true},
];
```
Replace with:
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

- [ ] **Step 3: Write the `TemplateView` component**

Insert this new function immediately before `function App() {` (`project_hub.html:10393`), i.e. right after the closing `}` of `UndoRedoBtn`'s containing section / before the App section comment block — place it directly above the `function App() {` line:

```jsx
/* ══════════════════════════════════════
   Template View — track/stage hierarchy editor
══════════════════════════════════════ */
function TemplateView({data, save}) {
  const [activeTab, setActiveTab] = useState('work'); // 'general' | 'work'
  const tracks = data.tracks || [];
  const sheets = data.sheets || [];

  const [editingTrackId, setEditingTrackId] = useState(null);
  const [trackNameDraft, setTrackNameDraft] = useState('');
  const [editingStageId, setEditingStageId] = useState(null);
  const [stageNameDraft, setStageNameDraft] = useState('');
  const [addingTrack, setAddingTrack] = useState(false);
  const [newTrackDraft, setNewTrackDraft] = useState('');
  const [dragStage, setDragStage] = useState(null); // {trackId, sheetId}

  const renameTrack = (trackId, label) => {
    if (!label.trim()) { setEditingTrackId(null); return; }
    save({...data, tracks: tracks.map(t => t.id===trackId ? {...t, label:label.trim()} : t)});
    setEditingTrackId(null);
  };
  const deleteTrack = (track) => {
    if (track.stageOrder.length) return;
    save({...data, tracks: tracks.filter(t => t.id!==track.id)});
  };
  const addTrack = (label) => {
    if (!label.trim()) { setAddingTrack(false); return; }
    const id = uid();
    save({...data, tracks: [...tracks, {id, label:label.trim(), trackValue:id, stageOrder:[]}]});
    setAddingTrack(false); setNewTrackDraft('');
  };
  const addStage = (track) => {
    const ns = {...makeEmptySheet('שלב חדש'), track: track.trackValue};
    save({
      ...data,
      sheets: [...sheets, ns],
      tracks: tracks.map(t => t.id===track.id ? {...t, stageOrder:[...t.stageOrder, ns.id]} : t),
    });
  };
  const deleteStage = (track, sheetId) => {
    const sheet = sheets.find(s => s.id===sheetId);
    if (!window.confirm(`למחוק את השלב "${sheet?.name||''}"? כל המשימות בו יימחקו לצמיתות.`)) return;
    save({
      ...data,
      sheets: sheets.filter(s => s.id!==sheetId),
      tracks: tracks.map(t => t.id===track.id ? {...t, stageOrder:t.stageOrder.filter(id=>id!==sheetId)} : t),
    });
  };
  const renameStage = (sheetId, name) => {
    if (!name.trim()) { setEditingStageId(null); return; }
    save({...data, sheets: sheets.map(s => s.id===sheetId ? {...s, name:name.trim()} : s)});
    setEditingStageId(null);
  };
  const reorderStage = (track, srcId, tgtId) => {
    if (srcId===tgtId) return;
    const order = [...track.stageOrder];
    const si = order.indexOf(srcId), ti = order.indexOf(tgtId);
    if (si===-1 || ti===-1) return;
    order.splice(si,1); order.splice(ti,0,srcId);
    save({...data, tracks: tracks.map(t => t.id===track.id ? {...t, stageOrder:order} : t)});
  };

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
      <div style={{display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0}}>
        {[{id:'general', label:'כללי'}, {id:'work', label:'סכימת עבודה'}].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{padding:'9px 16px', fontSize:12, fontFamily:'inherit', border:'none', cursor:'pointer',
              background:'none', borderBottom:'2px solid',
              borderBottomColor: activeTab===t.id ? 'var(--accent)' : 'transparent',
              fontWeight: activeTab===t.id ? 700 : 400,
              color: activeTab===t.id ? 'var(--text)' : 'var(--text-2)'}}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{flex:1, overflow:'auto', background:'var(--bg)'}}>
        {activeTab==='general' && <div style={{padding:24, color:'var(--text-3)', fontSize:13}}>—</div>}
        {activeTab==='work' && (
          <div style={{padding:'32px 24px', display:'flex', flexDirection:'column', alignItems:'center', gap:0}}>
            <div style={{background:'var(--accent)', color:'#fff', padding:'7px 16px', borderRadius:8, fontSize:12.5, fontWeight:700}}>
              ניהול תכנון
            </div>
            <div style={{width:1, height:14, background:'var(--border-strong)'}}/>
            <div style={{display:'flex', gap:16, flexWrap:'wrap', justifyContent:'center'}}>
              {tracks.map(track => (
                <div key={track.id} style={{background:'#eef2ff', border:'1.5px solid #c7d2fe', borderRadius:10, padding:10,
                  display:'flex', flexDirection:'column', gap:6, minWidth:160}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:6}}>
                    {editingTrackId===track.id
                      ? <input autoFocus value={trackNameDraft}
                          onChange={e=>setTrackNameDraft(e.target.value)}
                          onBlur={()=>renameTrack(track.id, trackNameDraft)}
                          onKeyDown={e=>{if(e.key==='Enter')e.target.blur();if(e.key==='Escape')setEditingTrackId(null);}}
                          style={{fontWeight:700, fontSize:12.5, border:'none', borderBottom:'1.5px solid var(--accent)',
                            outline:'none', background:'transparent', fontFamily:'inherit', color:'#1e3a8a', flex:1, minWidth:60}}/>
                      : <span onClick={()=>{setTrackNameDraft(track.label);setEditingTrackId(track.id);}}
                          style={{fontWeight:700, fontSize:12.5, color:'#1e3a8a', cursor:'text'}}>
                          {track.label}
                        </span>}
                    <button onClick={()=>deleteTrack(track)} disabled={track.stageOrder.length>0}
                      title={track.stageOrder.length>0 ? 'יש להעביר או למחוק את השלבים לפני מחיקת המסלול' : 'מחק מסלול'}
                      style={{background:'none', border:'none', cursor:track.stageOrder.length>0?'default':'pointer',
                        color: track.stageOrder.length>0 ? 'var(--border-strong)' : '#94a3b8', fontSize:13, padding:0}}>
                      ✕
                    </button>
                  </div>
                  {track.stageOrder.map(sheetId => {
                    const sheet = sheets.find(s => s.id===sheetId);
                    if (!sheet) return null;
                    return (
                      <div key={sheetId} draggable
                        onDragStart={()=>setDragStage({trackId:track.id, sheetId})}
                        onDragOver={e=>{if(dragStage && dragStage.trackId===track.id) e.preventDefault();}}
                        onDrop={e=>{e.preventDefault(); if(dragStage && dragStage.trackId===track.id) reorderStage(track, dragStage.sheetId, sheetId); setDragStage(null);}}
                        onDragEnd={()=>setDragStage(null)}
                        style={{background:'#fff', border:'1px solid #dbe3f5', borderRadius:6, padding:'5px 8px',
                          fontSize:10.5, display:'flex', justifyContent:'space-between', alignItems:'center', gap:6, cursor:'grab'}}>
                        {editingStageId===sheetId
                          ? <input autoFocus value={stageNameDraft}
                              onChange={e=>setStageNameDraft(e.target.value)}
                              onBlur={()=>renameStage(sheetId, stageNameDraft)}
                              onKeyDown={e=>{if(e.key==='Enter')e.target.blur();if(e.key==='Escape')setEditingStageId(null);}}
                              style={{fontSize:10.5, border:'none', borderBottom:'1.5px solid var(--accent)',
                                outline:'none', background:'transparent', fontFamily:'inherit', flex:1, minWidth:50}}/>
                          : <span onClick={()=>{setStageNameDraft(sheet.name);setEditingStageId(sheetId);}} style={{cursor:'text'}}>
                              {sheet.name}
                            </span>}
                        <button onClick={()=>deleteStage(track, sheetId)}
                          style={{background:'none', border:'none', cursor:'pointer', color:'#cbd5e1', fontSize:11, padding:0}}>
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  <div onClick={()=>addStage(track)} style={{color:'#6b85c4', fontSize:10, padding:3, cursor:'pointer'}}>
                    + הוסף שלב
                  </div>
                </div>
              ))}
              {addingTrack
                ? <input autoFocus value={newTrackDraft}
                    onChange={e=>setNewTrackDraft(e.target.value)}
                    onBlur={()=>addTrack(newTrackDraft)}
                    onKeyDown={e=>{if(e.key==='Enter')e.target.blur();if(e.key==='Escape'){setAddingTrack(false);setNewTrackDraft('');}}}
                    placeholder="שם המסלול"
                    style={{minWidth:90, border:'1.5px dashed #c7d2fe', borderRadius:10, padding:'10px 12px',
                      fontSize:12, fontFamily:'inherit', outline:'none', background:'#fff'}}/>
                : <div onClick={()=>setAddingTrack(true)}
                    style={{minWidth:90, border:'1.5px dashed #c7d2fe', borderRadius:10, display:'flex',
                      alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:11, cursor:'pointer'}}>
                    + מסלול
                  </div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Route `track==='template'` to `TemplateView` in `App()`**

Find:
```jsx
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
      </div>
```
Replace with:
```jsx
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
        {track==='template'    && <TemplateView data={data} save={save}/>}
      </div>
```

- [ ] **Step 5: Verify in preview**

Reload the `project-hub` preview, click "טמפלייט" in the sidebar (under "ספריית לוד", alongside "מבט על"/"ניהול תכנון"/etc.). Confirm:
- The page opens with two tabs, "כללי" and "סכימת עבודה", with "סכימת עבודה" active by default.
- "כללי" shows an empty placeholder when clicked.
- "סכימת עבודה" shows the "ניהול תכנון" root node connected to two track boxes ("ניהול שוטף", "מסלול רישוי" — seeded from migration), each containing their stage rows (sheet names), plus a "+ מסלול" dashed box.
- Click a track's label text → it becomes an editable input; type a new name and click elsewhere (blur) → the box now shows the new name. Reload the page (`window.location.reload()` via `preview_eval`) and confirm the rename persisted.
- Click a stage's name text → same inline-rename behavior; confirm it persists after reload.
- Click "+ הוסף שלב" inside a track → a new "שלב חדש" row appears in that track's box.
- Click "+ מסלול", type a name, blur → a new track box appears with no stages, and a working "✕" (since it has 0 stages, the button should be enabled).
- Try the "✕" on a track that still has stages → confirm it's disabled (greyed, cursor default) and does nothing when clicked.
- Drag-reorder two stages within the same track box (via `preview_eval` dispatching dragstart/dragover/drop DOM events, or `preview_click`-based manual verification if drag simulation isn't practical in this environment — at minimum confirm the resulting DOM order after a successful drag matches the new `stageOrder`).
- Navigate back to "ניהול תכנון" → "מבט מאוחד", confirm the renamed track/stage labels (from the steps above) now show up correctly in the track pills / stage groupings — proving the template editor's changes flow through `data.tracks`/`data.sheets` into the existing views.

- [ ] **Step 6: Commit**

```bash
git add project_hub.html
git commit -m "feat: add טמפלייט sidebar page with editable track/stage hierarchy tree"
```
