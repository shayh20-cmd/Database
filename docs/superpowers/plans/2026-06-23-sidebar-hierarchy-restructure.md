# Sidebar Hierarchy Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "ניהול תכנון" the single home for all track/stage navigation in `project_hub.html`, with tracks (תכנון/רישוי/מכרז/ביצוע) as dynamic sidebar sub-items that jump straight into the matching tab, and a "רוחבי" group (ישיבות/עקרונות/פיקוח/אבני דרך/יעדים) reachable both from the sidebar and as tabs on the same page.

**Architecture:** `data.tracks` already models the track/stage hierarchy and already drives a (currently single-button) tab row inside `NihulTikhnunView`. We extend that existing mechanism — add real per-track tab buttons, lift the "which tab is active" state up to `App` so the sidebar can set it directly, add a second "רוחبי" tab row reusing existing page content (`PrinciplesView`, `ComingSoonPage`, and a newly-extracted `GoalsMilestonesPanel`), and shrink `PROJ_TRACKS`/`Sidebar` so `licensing`/`planning`/`execution` stop being separate top-level routes.

**Tech Stack:** Single-file React 18 (in-browser Babel, no build step), `project_hub.html`. No test runner exists in this project — verification is done by loading the file in the already-running preview server and exercising it via `mcp__Claude_Preview__preview_eval` / `preview_screenshot` (the same approach used for prior changes to this file, per `docs/superpowers/specs/2026-06-23-sidebar-hierarchy-restructure-design.md`).

**Reference spec:** `docs/superpowers/specs/2026-06-23-sidebar-hierarchy-restructure-design.md`

---

## Before You Start

The dev server is already configured in `.claude/launch.json` as `"project-hub"` (serves `C:\Users\Omega\Database` on port 3401). Start/reuse it with `mcp__Claude_Preview__preview_start({name: "project-hub"})`, then navigate with `mcp__Claude_Preview__preview_eval` (`window.location.href = '/project_hub.html'`) before each verification step. Get the `serverId` from the start/list call and reuse it for every later step.

---

### Task 1: Fix the pre-existing `activeTab` reference bug in `NihulTikhnunView`

**Files:**
- Modify: `project_hub.html:7703`

This bug is currently dormant because no UI lets a user reach a track with more than one stage through `NihulTikhnunView`. Task 4 makes multi-stage tracks reachable, which would hit this `ReferenceError` (`activeTab` is not defined in this scope — `activeTrack` is) immediately. Fix it first so later manual verification isn't blocked by an unrelated crash.

- [ ] **Step 1: Read the surrounding code to confirm the bug**

Run: open `project_hub.html` around line 7703. The line reads:

```jsx
<span style={{fontSize:10, fontWeight:600, color:'var(--text-3)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px'}}>{activeTab.label}</span>
```

`NihulTikhnunView` (starting line 7600) defines `activeTrack` (line 7610), never `activeTab`.

- [ ] **Step 2: Fix the reference**

Change:
```jsx
<span style={{fontSize:10, fontWeight:600, color:'var(--text-3)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px'}}>{activeTab.label}</span>
```
to:
```jsx
<span style={{fontSize:10, fontWeight:600, color:'var(--text-3)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px'}}>{activeTrack.label}</span>
```

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "fix: stage divider referenced undefined activeTab instead of activeTrack"
```

---

### Task 2: Data model — rename "ניהול שוטף" and add "מסלול מכרז" / "מסלול ביצוע" tracks

**Files:**
- Modify: `project_hub.html:1699-1700` (top of `migrateData`)

`data.tracks` today (after `seedTracksIfMissing`) has two entries: `{id:'ongoing', label:'ניהול שוטף', trackValue:null, stageOrder:[...]}` and `{id:'licensing', label:'מסלול רישוי', trackValue:'licensing', stageOrder:[...]}`. We need this migration to run on **every** load (not just on first-ever seed), so it has to live in `migrateData`, not `seedTracksIfMissing` (which only fires when `d.tracks` is entirely absent).

- [ ] **Step 1: Add the migration step**

In `project_hub.html`, find:
```js
function migrateData(d) {
  if (!d) return d;
```
Replace with:
```js
function migrateData(d) {
  if (!d) return d;
  if (d.tracks) {
    let tracks = d.tracks;
    const renamedOngoing = tracks.some(t => t.id==='ongoing' && t.label==='ניהול שוטף');
    if (renamedOngoing) {
      tracks = tracks.map(t => t.id==='ongoing' ? {...t, label:'מסלול תכנון'} : t);
    }
    if (!tracks.some(t => t.id==='tender')) {
      tracks = [...tracks, {id:'tender', label:'מסלול מכרז', trackValue:'tender', stageOrder:[]}];
    }
    if (!tracks.some(t => t.id==='execution')) {
      tracks = [...tracks, {id:'execution', label:'מסלול ביצוע', trackValue:'execution', stageOrder:[]}];
    }
    if (tracks !== d.tracks) d = {...d, tracks};
  }
```

(The rest of `migrateData` continues unchanged below this block — this only inserts new logic right after the existing `if (!d) return d;` guard, before the `if (!d.sheets)` legacy-migration branch.)

- [ ] **Step 2: Verify in the preview**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
```
Then:
```js
mcp__Claude_Preview__preview_eval({serverId, expression: "JSON.parse(localStorage.getItem('pm_asana_v9')).tracks.map(t=>({id:t.id,label:t.label}))"})
```
Expected: an array including `{id:'ongoing', label:'מסלול תכנון'}`, `{id:'licensing', label:'מסלול רישוי'}`, `{id:'tender', label:'מסلول מכרז'}`, `{id:'execution', label:'מסלול ביצוע'}`. Confirm no console errors via `mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})` (only the pre-existing Babel notices are expected).

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "feat: rename ניהול שוטף to מסלול תכנון, add מכרז and ביצוע tracks"
```

---

### Task 3: Extract `GoalsMilestonesPanel` out of `DashboardView`

**Files:**
- Modify: `project_hub.html:7737-8068` (inside `DashboardView`)

The "יעדים"/"אבני דרך" panels (`GoalsPanel`/`MsPanel`) are currently defined as local closures inside `DashboardView`'s render body (the IIFE at line 7819-8068), closing over `data`, `save`, `today`, `setConfetti`. To reuse them as a standalone "רוחبי" tab in Task 7, they need to become a real top-level component that only depends on `{data, save}`.

- [ ] **Step 1: Read the full IIFE block to copy verbatim**

Run: read `project_hub.html` lines 7819-8068 (already captured above in this session — it's the `{/* ── Goals + Milestones row ── */}` IIFE, containing `STATUS_CFG`, `resolveStatus`, `daysXofY`, `StatusDropdown`, `ColHdr`, `GoalsPanel`, `MsPanel`, ending in `return (<div style={{display:'flex',gap:14,...}}><GoalsPanel/><MsPanel/></div>)`).

- [ ] **Step 2: Add the new top-level component**

Immediately above `function DashboardView({data, save, onSwitchSheet}) {` (line 7737), insert:

```jsx
function GoalsMilestonesPanel({data, save}) {
  const [confetti, setConfetti] = useState(false);
  const today = todayISO();

  /* ── shared status config ── */
  const STATUS_CFG = {
    not_started: {label:'לא התחיל', color:'var(--text-3)',   bg:'var(--bg)',           border:'var(--border)'},
    in_progress: {label:'בעבודה',   color:'var(--accent)',   bg:'rgba(37,99,235,.08)', border:'rgba(37,99,235,.25)'},
    stuck:       {label:'תקוע',     color:'#EF4444',         bg:'rgba(239,68,68,.08)', border:'rgba(239,68,68,.3)'},
    done:        {label:'✓ בוצע',   color:'#059669',         bg:'rgba(5,150,105,.1)',  border:'rgba(5,150,105,.3)'},
  };
  const resolveStatus = (item) => item.status || (item.done ? 'done' : 'not_started');

  const ganttMin = today; /* daysXofY's only fallback use; no Gantt context here */
  const daysXofY = (startDate, endDate) => {
    const sd = startDate || ganttMin;
    if (!sd || !endDate) return null;
    const total   = Math.max(1, daysBetween(sd, endDate));
    const elapsed = Math.max(0, Math.min(total, daysBetween(sd, today)));
    return {elapsed, total};
  };

  const StatusDropdown = ({value, onChange}) => {
    const [open, setOpen] = React.useState(false);
    const cfg = STATUS_CFG[value] || STATUS_CFG.not_started;
    return (
      <div style={{position:'relative',width:82,flexShrink:0}}>
        <div onClick={e=>{e.stopPropagation();setOpen(o=>!o);}}
          style={{textAlign:'center',fontSize:11,fontWeight:700,cursor:'pointer',
            color:cfg.color,background:cfg.bg,border:`1px solid ${cfg.border}`,
            borderRadius:10,padding:'3px 0',userSelect:'none',transition:'all .15s'}}>
          {cfg.label} ▾
        </div>
        {open && (
          <div onClick={e=>e.stopPropagation()}
            style={{position:'absolute',top:'calc(100% + 4px)',left:0,right:0,
              background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,
              boxShadow:'0 4px 16px rgba(0,0,0,.12)',zIndex:999,overflow:'hidden'}}>
            {Object.entries(STATUS_CFG).map(([k,c])=>(
              <div key={k} onClick={()=>{onChange(k);setOpen(false);}}
                style={{padding:'7px 12px',fontSize:12,fontWeight:600,cursor:'pointer',
                  color:c.color,background:value===k?c.bg:'transparent',
                  transition:'background .1s'}}
                onMouseEnter={e=>e.currentTarget.style.background=c.bg}
                onMouseLeave={e=>e.currentTarget.style.background=value===k?c.bg:'transparent'}>
                {c.label}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const ColHdr = ({children, w, align}) => (
    <div style={{width:w,flexShrink:0,fontSize:10,fontWeight:700,color:'var(--text-3)',
      textTransform:'uppercase',letterSpacing:.4,textAlign:align||'right',paddingBottom:6,
      borderBottom:'1px solid var(--border)'}}>
      {children}
    </div>
  );

  const GoalsPanel = () => {
    const goals = data.licensingGoals||[];
    const doneGoals = goals.filter(g=>resolveStatus(g)==='done').length;
    const pct = goals.length ? Math.round(doneGoals/goals.length*100) : 0;

    const saveGoals = upd => save({...data, licensingGoals: upd});
    const addGoal = () => saveGoals([...goals,
      {id:uid(), title:'', targetDate:'', startDate:today, status:'not_started', done:false}]);
    const delGoal = id => saveGoals(goals.filter(g=>g.id!==id));
    const updGoal = (id,patch) => saveGoals(goals.map(g=>g.id===id?{...g,...patch}:g));
    const setGoalStatus = (id, ns) => {
      const willDone = ns==='done';
      updGoal(id,{status:ns, done:ns==='done'});
      if(willDone) setConfetti(true);
    };

    return (
      <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)',
        padding:'18px 20px',flex:'1 1 0%',minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <h2 style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>יעדים</h2>
          <span style={{fontSize:12,color:'var(--text-2)',fontWeight:600}}>{doneGoals}/{goals.length} הושגו</span>
        </div>
        <div style={{height:4,borderRadius:2,background:'var(--border)',marginBottom:14}}>
          <div style={{height:4,borderRadius:2,background:pct===100?'#059669':'var(--accent)',
            width:pct+'%',transition:'width .5s'}}/>
        </div>
        <div style={{display:'flex',alignItems:'flex-end',gap:8,paddingBottom:2}}>
          <ColHdr w="auto">תיאור</ColHdr>
          <div style={{flex:1}}/>
          <ColHdr w={80} align="center">תאריך יעד</ColHdr>
          <ColHdr w={62} align="center">ימים</ColHdr>
          <ColHdr w={82} align="center">סטטוס</ColHdr>
          <div style={{width:20}}/>
        </div>
        {goals.map((g,i)=>{
          const st = resolveStatus(g);
          const xy = daysXofY(g.startDate, g.targetDate);
          const isLate = st!=='done' && g.targetDate && g.targetDate < today;
          return (
            <div key={g.id} style={{display:'flex',alignItems:'center',gap:8,
              padding:'7px 0',borderBottom:i<goals.length-1?'1px solid var(--border)':'none'}}>
              <input value={g.title||''} placeholder="שם יעד…"
                onChange={e=>updGoal(g.id,{title:e.target.value})}
                style={{flex:1,border:'none',outline:'none',fontSize:13,fontWeight:600,
                  background:'transparent',color:st==='done'?'var(--text-2)':'var(--text)',
                  textDecoration:st==='done'?'line-through':'none',fontFamily:'inherit',
                  minWidth:0}}/>
              <input type="date" value={g.targetDate||''}
                onChange={e=>updGoal(g.id,{targetDate:e.target.value})}
                style={{width:80,border:'none',outline:'none',fontSize:11,background:'transparent',
                  color:isLate?'#EF4444':'var(--text-2)',textAlign:'center',
                  cursor:'pointer',fontFamily:'inherit'}}/>
              <div style={{width:62,textAlign:'center',fontSize:11,fontWeight:600,
                color:isLate?'#EF4444':'var(--text-3)',fontFamily:'monospace'}}>
                {xy ? `${xy.elapsed}/${xy.total}` : g.targetDate ? `${daysBetween(today,g.targetDate)}י` : '—'}
              </div>
              <StatusDropdown value={st} onChange={ns=>setGoalStatus(g.id,ns)}/>
              <button onClick={()=>delGoal(g.id)}
                style={{width:20,height:20,border:'none',background:'none',cursor:'pointer',
                  color:'var(--text-3)',fontSize:14,lineHeight:1,borderRadius:4,padding:0,
                  display:'flex',alignItems:'center',justifyContent:'center'}}
                title="מחק">×</button>
            </div>
          );
        })}
        <button onClick={addGoal}
          style={{marginTop:10,width:'100%',border:'1px dashed var(--border)',background:'none',
            borderRadius:8,padding:'6px 0',fontSize:12,color:'var(--text-3)',cursor:'pointer',
            fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)';}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-3)';}}>
          <span style={{fontSize:16,lineHeight:1}}>+</span> הוסף יעד
        </button>
      </div>
    );
  };

  const MsPanel = () => {
    const milestones = data.licensingMilestones||[];
    const saveMss = upd => save({...data, licensingMilestones: upd});
    const addMs  = () => saveMss([...milestones,
      {id:uid(), title:'', date:'', startDate:today, status:'not_started', done:false}]);
    const delMs  = id => saveMss(milestones.filter(m=>m.id!==id));
    const updMs  = (id,patch) => saveMss(milestones.map(m=>m.id===id?{...m,...patch}:m));
    const setMsStatus = (id, ns) => {
      const willDone = ns==='done';
      updMs(id,{status:ns, done:ns==='done'});
      if(willDone) setConfetti(true);
    };

    return (
      <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)',
        padding:'18px 20px',flex:'1 1 0%',minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <h2 style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>אבני דרך</h2>
          <span style={{fontSize:12,color:'var(--text-2)',fontWeight:600}}>
            {milestones.filter(m=>resolveStatus(m)==='done').length}/{milestones.length} הושלמו
          </span>
        </div>
        <div style={{display:'flex',alignItems:'flex-end',gap:8,paddingBottom:2}}>
          <ColHdr w="auto">תיאור</ColHdr>
          <div style={{flex:1}}/>
          <ColHdr w={80} align="center">תאריך</ColHdr>
          <ColHdr w={62} align="center">ימים</ColHdr>
          <ColHdr w={82} align="center">סטטוס</ColHdr>
          <div style={{width:20}}/>
        </div>
        {milestones.map((m,i)=>{
          const st = resolveStatus(m);
          const xy = daysXofY(m.startDate, m.date);
          const isLate = st!=='done' && m.date && m.date < today;
          return (
            <div key={m.id} style={{display:'flex',alignItems:'center',gap:8,
              padding:'7px 0',borderBottom:i<milestones.length-1?'1px solid var(--border)':'none'}}>
              <div style={{width:12,height:12,flexShrink:0,
                background:st==='done'?'#059669':'transparent',
                border:`2px solid ${st==='done'?'#059669':'#8B5CF6'}`,
                borderRadius:2,transform:'rotate(45deg)'}}/>
              <input value={m.title||''} placeholder="שם אבן דרך…"
                onChange={e=>updMs(m.id,{title:e.target.value})}
                style={{flex:1,border:'none',outline:'none',fontSize:13,fontWeight:600,
                  background:'transparent',color:st==='done'?'var(--text-2)':'var(--text)',
                  textDecoration:st==='done'?'line-through':'none',fontFamily:'inherit',
                  minWidth:0}}/>
              <input type="date" value={m.date||''}
                onChange={e=>updMs(m.id,{date:e.target.value})}
                style={{width:80,border:'none',outline:'none',fontSize:11,background:'transparent',
                  color:isLate?'#EF4444':'var(--text-2)',textAlign:'center',
                  cursor:'pointer',fontFamily:'inherit'}}/>
              <div style={{width:62,textAlign:'center',fontSize:11,fontWeight:600,
                color:isLate?'#EF4444':'var(--text-3)',fontFamily:'monospace'}}>
                {xy ? `${xy.elapsed}/${xy.total}` : m.date ? `${daysBetween(today,m.date)}י` : '—'}
              </div>
              <StatusDropdown value={st} onChange={ns=>setMsStatus(m.id,ns)}/>
              <button onClick={()=>delMs(m.id)}
                style={{width:20,height:20,border:'none',background:'none',cursor:'pointer',
                  color:'var(--text-3)',fontSize:14,lineHeight:1,borderRadius:4,padding:0,
                  display:'flex',alignItems:'center',justifyContent:'center'}}
                title="מחק">×</button>
            </div>
          );
        })}
        <button onClick={addMs}
          style={{marginTop:10,width:'100%',border:'1px dashed var(--border)',background:'none',
            borderRadius:8,padding:'6px 0',fontSize:12,color:'var(--text-3)',cursor:'pointer',
            fontFamily:'inherit',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)';}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-3)';}}>
          <span style={{fontSize:16,lineHeight:1}}>+</span> הוסף אבן דרך
        </button>
      </div>
    );
  };

  return (
    <>
      {confetti && <Confetti onDone={()=>setConfetti(false)}/>}
      <div style={{display:'flex',gap:14,alignItems:'stretch'}}>
        <GoalsPanel/>
        <MsPanel/>
      </div>
    </>
  );
}

```

- [ ] **Step 3: Replace the old inline block inside `DashboardView` with a call to the new component**

In `DashboardView`'s render (the IIFE starting `{/* ── Goals + Milestones row ── */}` at line 7819, ending at line 8068 with `})()`), replace the entire IIFE with:

```jsx
        {/* ── Goals + Milestones row ── */}
        <GoalsMilestonesPanel data={data} save={save}/>
```

- [ ] **Step 4: Remove the now-unused `confetti` state from `DashboardView`**

`DashboardView` still declares `const [confetti, setConfetti] = useState(false);` (line 7738) and renders `{confetti&&<Confetti onDone={()=>setConfetti(false)}/>}` (line 7768) for the goals/milestones celebration that now lives inside `GoalsMilestonesPanel`. Confirm nothing else in `DashboardView` sets `confetti` (it shouldn't — `setConfetti` was only ever called from the old `setGoalStatus`/`setMsStatus`, both now removed from this file). Delete both lines.

- [ ] **Step 5: Verify in the preview**

Reload, click into "ניהול תכנון" sidebar item, expand to the licensing track's dashboard stage (this still works the old way until Task 4/9 land — for now just confirm `DashboardView` still renders without errors wherever it's currently reachable):

```js
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: only the pre-existing Babel deopt notices, no new errors. Then take a screenshot (`mcp__Claude_Preview__preview_screenshot`) of the licensing dashboard and confirm the יעדים/אבני דרך cards still render with their existing data ("✓ הכל הושלם" cards etc., same as before this change).

- [ ] **Step 6: Commit**

```bash
git add project_hub.html
git commit -m "refactor: extract GoalsMilestonesPanel out of DashboardView for reuse"
```

---

### Task 4: Replace `NihulTikhnunView`'s single hardcoded tab with real track tabs + a stage-tab bar

**Files:**
- Modify: `project_hub.html:7600-7717` (`NihulTikhnunView`)

Today the tab row is hardcoded to one button (`[{id:'combined', label:'מבט מאוחד'}]`, line 7675), and non-combined stages render as a vertically-stacked list with collapsible dividers (lines 7688-7713) rather than as selectable tabs (the dashboard-type sheet, e.g. "דאשבורד", isn't even included — `visibleSheets` filters to `s.type==='list'` only, line 7611). We need: (a) one tab button per `data.tracks` entry plus "מבט מאוחד", and (b) within a track, a stage **tab bar** that includes the dashboard sheet if present, matching the approved mockup ("שלבי מסلول רישוי: דאשבורד / תיק מידע / תנאים מקדימים / בקרת תכן").

`NihulTikhnunView` also needs `activeTrackTab` to become a controlled prop (Task 5 wires this from `App`); this task changes its *internal* rendering first while keeping it as local state, so each step is independently testable. Task 5 then makes it controlled.

- [ ] **Step 1: Add per-track tab buttons**

Change:
```jsx
        <div style={{display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0}}>
          {[{id:'combined', label:'מבט מאוחד'}].map(t => (
```
to:
```jsx
        <div style={{display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0}}>
          {[{id:'combined', label:'מבט מאוחד'}, ...ntTracks.map(t=>({id:t.id, label:t.label}))].map(t => (
```

- [ ] **Step 2: Add a stage-tab bar for the active track (replacing the stacked dividers) and an `activeStageId` state**

Change:
```jsx
  const [collStage, setCollStage] = useState({});
  const toggleStage = id => setCollStage(c => ({...c, [id]: !c[id]}));
```
to:
```jsx
  const [activeStageId, setActiveStageId] = useState(null);
```

Change:
```jsx
  const visibleSheets = isCombinedTab || !activeTrack ? [] : allSheets.filter(s => s.type==='list' && s.track===activeTrack.trackValue);
```
to:
```jsx
  const visibleStages = isCombinedTab || !activeTrack
    ? []
    : allSheets.filter(s => (s.type==='list' || s.type==='dashboard') && s.track===activeTrack.trackValue);
  const activeStage = visibleStages.find(s => s.id===activeStageId) || visibleStages[0] || null;
```

Change the rendering block:
```jsx
        <div style={{flex:1, overflowY:'auto', background:'var(--bg)'}}>
          {isCombinedTab && <ListView data={combinedData} save={saveCombined}/>}
          {!isCombinedTab && visibleSheets.map(sheet => {
            const collapsed = collStage[sheet.id];
            return (
              <React.Fragment key={sheet.id}>
                {/* ── Stage divider — only needed when there's more than one sheet to tell apart ── */}
                {visibleSheets.length>1 && (
                  <div style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'10px 20px', background:'var(--surface)',
                    borderBottom:'1px solid var(--border)', borderTop:'4px solid var(--bg)',
                    cursor:'pointer', userSelect:'none',
                  }} onClick={() => toggleStage(sheet.id)}>
                    <span style={{fontSize:10, color:'var(--text-3)', display:'inline-block',
                      transform: collapsed ? 'rotate(-90deg)' : '', transition:'transform .15s'}}>▾</span>
                    <span style={{width:11, height:11, borderRadius:3, background:'#2563EB', flexShrink:0, display:'inline-block'}}/>
                    <span style={{fontSize:10, fontWeight:600, color:'var(--text-3)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 6px'}}>{activeTrack.label}</span>
                    <span style={{fontWeight:700, fontSize:13, color:'var(--text)'}}>שלב: {sheet.name}</span>
                    <span style={{fontSize:11, color:'var(--text-3)', marginRight:'auto'}}>{(sheet.tasks||[]).length} משימות</span>
                  </div>
                )}

                {/* ── The exact same list view used in מסלول רישוי ── */}
                {(visibleSheets.length===1 || !collapsed) && <ListView data={sheet} save={patch => saveSheet(sheet.id, patch)}/>}
              </React.Fragment>
            );
          })}
          {!isCombinedTab && visibleSheets.length===0 && (
            <div style={{padding:'24px 20px', fontSize:12, color:'var(--text-3)'}}>אין שלבים במסלול זה</div>
          )}
        </div>
```
to:
```jsx
        {!isCombinedTab && visibleStages.length>1 && (
          <div style={{display:'flex', gap:2, padding:'8px 16px 0', background:'var(--surface)', borderBottom:'1px solid var(--border)', flexShrink:0}}>
            {visibleStages.map(s => (
              <button key={s.id} onClick={()=>setActiveStageId(s.id)}
                style={{padding:'6px 12px', fontSize:12, fontFamily:'inherit', border:'none', cursor:'pointer',
                  borderRadius:'6px 6px 0 0', background: (activeStage&&activeStage.id===s.id) ? 'var(--bg)' : 'transparent',
                  fontWeight: (activeStage&&activeStage.id===s.id) ? 700 : 400,
                  color: (activeStage&&activeStage.id===s.id) ? 'var(--text)' : 'var(--text-2)'}}>
                {s.type==='dashboard' ? <><Ic n="overview"/> </> : ''}{s.name}
              </button>
            ))}
          </div>
        )}
        <div style={{flex:1, overflowY:'auto', background:'var(--bg)'}}>
          {isCombinedTab && <ListView data={combinedData} save={saveCombined}/>}
          {!isCombinedTab && activeStage && activeStage.type==='dashboard' &&
            <DashboardView data={data} save={save} onSwitchSheet={setActiveStageId}/>}
          {!isCombinedTab && activeStage && activeStage.type==='list' &&
            <ListView data={activeStage} save={patch => saveSheet(activeStage.id, patch)}/>}
          {!isCombinedTab && !activeStage && (
            <div style={{padding:'24px 20px', fontSize:12, color:'var(--text-3)'}}>אין שלבים במסלول זה</div>
          )}
        </div>
```

(`DashboardView` itself still hardcodes `s.track==='licensing'` when building its own stage cards (line 7739) — leave that as-is for this plan; it only affects what the dashboard *cards* summarize, not which tab/track you're on, and reworking it to be track-generic is not required by the approved spec.)

- [ ] **Step 3: Reset `activeStageId` when switching tracks**

Add, right after the `activeStage` line from Step 2:
```jsx
  useEffect(() => { setActiveStageId(null); }, [activeTrackTab]);
```

(`useEffect` is already used elsewhere in this file via the global `useEffect` destructure — confirm by checking the top of the file for `const {useState, useEffect, ...} = React;` or equivalent; if `useEffect` isn't already in scope, use `React.useEffect` instead to match the file's existing style for this component.)

- [ ] **Step 4: Verify in the preview**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
```
Navigate to ניהול תכנון, then:
```js
mcp__Claude_Preview__preview_eval({serverId, expression: "[...document.querySelectorAll('div[style*=\"border-bottom: 1px solid\"] button')].map(b=>b.textContent)"})
```
Expected: button labels include `מבט מאוחד`, `מסלול תכנון`, `מסלول רישוי`, `מסلول מכרז`, `מסלول ביצוע`. Click the "מסלول רישוי" button in the browser via `preview_click`, then confirm the stage tab bar shows `דאשבורד`, `תיק מידע`, `תנאים מקדימים`, `בקרת תכן` and that clicking each one swaps the content area without console errors.

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "feat: render real per-track tabs and a stage-tab bar in NihulTikhnunView"
```

---

### Task 5: Lift track-tab and top-tab state from `NihulTikhnunView` up to `App`

**Files:**
- Modify: `project_hub.html:7600-7611` (`NihulTikhnunView` signature/state)
- Modify: `project_hub.html:10949-10957`, `11037`, `11040-11041`, `11045` (`App`)

So the sidebar (Task 9) can set "which tab is open" directly, `activeTrackTab` moves from `NihulTikhnunView`'s local `useState` to a controlled prop, and a new `activeTopTab` (for the רוחبי tabs added in Task 7) is introduced the same way.

- [ ] **Step 1: Make `NihulTikhnunView` accept controlled tab props**

Change:
```jsx
function NihulTikhnunView({data, save}) {
  const priorities  = data.priorities  || PRIORITIES;
  const disciplines = data.disciplines || DISCIPLINES;
  const statuses    = data.statuses    || STATUSES;
  const [editList, setEditList] = useState(null);
  const [activeTrackTab, setActiveTrackTab] = useState('combined');
  const ntTracks = data.tracks || [];
```
to:
```jsx
function NihulTikhnunView({data, save, activeTrackTab, setActiveTrackTab, activeTopTab, setActiveTopTab}) {
  const priorities  = data.priorities  || PRIORITIES;
  const disciplines = data.disciplines || DISCIPLINES;
  const statuses    = data.statuses    || STATUSES;
  const [editList, setEditList] = useState(null);
  const ntTracks = data.tracks || [];
```

- [ ] **Step 2: Add `App`-level state and pass it down**

In `App`, change:
```jsx
  /* top-level track: 'overview' | 'licensing' | future tracks */
  const [track, setTrack] = useState('licensing');

  const setTrackWithSheet = React.useCallback((newTrack) => {
    setTrack(newTrack);
    if(newTrack==='licensing') {
      const dashboard = sheets.find(s=>s.type==='dashboard');
      if(dashboard) setActiveSheetId(dashboard.id);
    }
  }, [sheets]);
```
to:
```jsx
  /* top-level track: 'overview' | 'tasks' | 'template' */
  const [track, setTrack] = useState('tasks');
  const [nihulTrackTab, setNihulTrackTab] = useState('combined');
  const [nihulTopTab, setNihulTopTab] = useState(null);

  const openTrackTab = React.useCallback((trackId) => {
    setTrack('tasks');
    setNihulTrackTab(trackId);
    setNihulTopTab(null);
  }, []);
  const openTopTab = React.useCallback((topTabId) => {
    setTrack('tasks');
    setNihulTopTab(topTabId);
  }, []);

  /* kept as-is for now — still wired to Sidebar's setTrack prop until Task 8
     replaces that call site; Task 8 deletes this once it's no longer called. */
  const setTrackWithSheet = React.useCallback((newTrack) => {
    setTrack(newTrack);
    if(newTrack==='licensing') {
      const dashboard = sheets.find(s=>s.type==='dashboard');
      if(dashboard) setActiveSheetId(dashboard.id);
    }
  }, [sheets]);
```

This step is intentionally a pure addition (old `setTrackWithSheet` block kept verbatim, just placed after the new state) — `Sidebar` still receives `setTrack={setTrackWithSheet}` at this point in the plan, so nothing breaks until Task 8 swaps that call site over to plain `setTrack`. Task 8 is also where `setTrackWithSheet`'s definition finally gets deleted.

- [ ] **Step 3: Update the `NihulTikhnunView` call site and remove the now-dead per-track top-level branches**

Change:
```jsx
        {track==='tasks'    && <NihulTikhnunView data={data} save={save}/>}
```
to:
```jsx
        {track==='tasks'    && <NihulTikhnunView data={data} save={save}
          activeTrackTab={nihulTrackTab} setActiveTrackTab={setNihulTrackTab}
          activeTopTab={nihulTopTab} setActiveTopTab={setNihulTopTab}/>}
```

Leave the `track==='licensing'`, `track==='meetings'`, `track==='supervision'`, `track==='principles'` branches as-is for now — Task 10 removes them once the sidebar no longer links to them.

- [ ] **Step 4: Verify in the preview**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: only Babel deopt notices. The app should default straight into ניהול תכנון's "מבט מאוחד" tab now (since `track` defaults to `'tasks'`) — confirm with a screenshot.

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "refactor: lift NihulTikhnunView's active-tab state up to App"
```

---

### Task 6: Restructure `PROJ_TRACKS` and add the "רוחبי" entry list

**Files:**
- Modify: `project_hub.html:10397-10407`

- [ ] **Step 1: Replace `PROJ_TRACKS`**

Change:
```js
const PROJ_TRACKS = [
  {id:'overview',    label:'מבט על',              icon:'overview',    enabled:true},
  {id:'tasks',       label:'ניהול תכנון',          icon:'tasks',       enabled:true},
  {id:'licensing',   label:'מסלول רישוי',          icon:'licensing',   enabled:true},
  {id:'planning',    label:'מסלول תכנון מפורט',    icon:'planning',    enabled:false},
  {id:'execution',   label:'מסלول ביצוע',          icon:'execution',   enabled:false},
  {id:'meetings',    label:'ישיבות',               icon:'meetings',    enabled:true},
  {id:'supervision', label:'פיקוח',                icon:'supervision', enabled:true},
  {id:'template',    label:'טמפלייט',              icon:'template',    enabled:true},
  {id:'principles',  label:'עקרון תכנון',          icon:'principles',  enabled:true},
];
```
to:
```js
const PROJ_TRACKS = [
  {id:'overview', label:'מבט על',      icon:'overview', enabled:true},
  {id:'tasks',    label:'ניהול תכנון', icon:'tasks',    enabled:true},
  {id:'template', label:'טמפלייט',     icon:'template', enabled:true},
];

const CROSS_CUTTING_ITEMS = [
  {id:'meetings',    label:'ישיבות',         icon:'meetings'},
  {id:'principles',  label:'עקרון תכנון',    icon:'principles'},
  {id:'supervision', label:'פיקוח',          icon:'supervision'},
  {id:'milestones',  label:'אבני דרך',       icon:'milestones'},
  {id:'goals',       label:'יעדים',          icon:'goals'},
];
```

`CROSS_CUTTING_ITEMS` ids (`meetings`/`principles`/`supervision`/`milestones`/`goals`) double as the `activeTopTab` values used in Task 7 and the sidebar wiring in Task 9 — keep them identical between the two.

- [ ] **Step 2: Verify nothing else references the removed `PROJ_TRACKS` entries yet**

Run:
```bash
grep -n "PROJ_TRACKS" project_hub.html
```
Expected at this point: the definition itself, plus the two usages inside `Sidebar` (handled in Task 9) and the breadcrumb label lookup inside `App`'s `sheet-tabs` block (handled in Task 10 — it currently does `PROJ_TRACKS.find(t=>t.id===track)`, which will return `undefined` for `track==='tasks'` if `'tasks'` ever got removed; it hasn't, so this is just to confirm no other stale reference exists before moving on).

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "feat: trim PROJ_TRACKS to overview/tasks/template, add CROSS_CUTTING_ITEMS"
```

---

### Task 7: Add the "רוחبי" tab row to `NihulTikhnunView`

**Files:**
- Modify: `project_hub.html` (`NihulTikhnunView`, the tab-row and content-area JSX touched in Task 4)

- [ ] **Step 1: Render the second tab row, mutually exclusive with the track-tabs row**

Change the tab-row block (as left after Task 4) from:
```jsx
        <div style={{display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0}}>
          {[{id:'combined', label:'מבט מאוחד'}, ...ntTracks.map(t=>({id:t.id, label:t.label}))].map(t => (
            <button key={t.id} onClick={() => setActiveTrackTab(t.id)}
              style={{padding:'9px 16px', fontSize:12, fontFamily:'inherit', border:'none', cursor:'pointer',
                background:'none', borderBottom:'2px solid',
                borderBottomColor: activeTrackTab===t.id ? 'var(--accent)' : 'transparent',
                fontWeight: activeTrackTab===t.id ? 700 : 400,
                color: activeTrackTab===t.id ? 'var(--text)' : 'var(--text-2)'}}>
              {t.label}
            </button>
          ))}
        </div>
```
to:
```jsx
        <div style={{display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0}}>
          {[{id:'combined', label:'מבט מאוחד'}, ...ntTracks.map(t=>({id:t.id, label:t.label}))].map(t => (
            <button key={t.id} onClick={() => { setActiveTrackTab(t.id); setActiveTopTab(null); }}
              style={{padding:'9px 16px', fontSize:12, fontFamily:'inherit', border:'none', cursor:'pointer',
                background:'none', borderBottom:'2px solid',
                borderBottomColor: (!activeTopTab && activeTrackTab===t.id) ? 'var(--accent)' : 'transparent',
                fontWeight: (!activeTopTab && activeTrackTab===t.id) ? 700 : 400,
                color: (!activeTopTab && activeTrackTab===t.id) ? 'var(--text)' : 'var(--text-2)'}}>
              {t.label}
            </button>
          ))}
          <div style={{flex:1}}/>
          {CROSS_CUTTING_ITEMS.map(t => (
            <button key={t.id} onClick={() => setActiveTopTab(t.id)}
              style={{padding:'9px 16px', fontSize:12, fontFamily:'inherit', border:'none', cursor:'pointer',
                background:'none', borderBottom:'2px solid',
                borderBottomColor: activeTopTab===t.id ? 'var(--accent)' : 'transparent',
                fontWeight: activeTopTab===t.id ? 700 : 400,
                color: activeTopTab===t.id ? 'var(--text)' : 'var(--text-2)'}}>
              {t.label}
            </button>
          ))}
        </div>
```

- [ ] **Step 2: Render the right body when a top-tab is active**

Change the content-area block (as left after Task 4) from:
```jsx
        <div style={{flex:1, overflowY:'auto', background:'var(--bg)'}}>
          {isCombinedTab && <ListView data={combinedData} save={saveCombined}/>}
          {!isCombinedTab && activeStage && activeStage.type==='dashboard' &&
            <DashboardView data={data} save={save} onSwitchSheet={setActiveStageId}/>}
          {!isCombinedTab && activeStage && activeStage.type==='list' &&
            <ListView data={activeStage} save={patch => saveSheet(activeStage.id, patch)}/>}
          {!isCombinedTab && !activeStage && (
            <div style={{padding:'24px 20px', fontSize:12, color:'var(--text-3)'}}>אין שלבים במסלول זה</div>
          )}
        </div>
```
to:
```jsx
        <div style={{flex:1, overflowY:'auto', background:'var(--bg)'}}>
          {!activeTopTab && isCombinedTab && <ListView data={combinedData} save={saveCombined}/>}
          {!activeTopTab && !isCombinedTab && activeStage && activeStage.type==='dashboard' &&
            <DashboardView data={data} save={save} onSwitchSheet={setActiveStageId}/>}
          {!activeTopTab && !isCombinedTab && activeStage && activeStage.type==='list' &&
            <ListView data={activeStage} save={patch => saveSheet(activeStage.id, patch)}/>}
          {!activeTopTab && !isCombinedTab && !activeStage && (
            <div style={{padding:'24px 20px', fontSize:12, color:'var(--text-3)'}}>אין שלבים במסלول זה</div>
          )}
          {activeTopTab==='meetings'    && <ComingSoonPage iconName="meetings"    title="ישיבות" desc="ריכוז וניהול סיכומי ישיבות — בפיתוח"/>}
          {activeTopTab==='supervision' && <ComingSoonPage iconName="supervision" title="פיקוח"  desc="ריכוז וניהול דוחות פיקוח מהביצוע — בפיתוח"/>}
          {activeTopTab==='principles'  && <PrinciplesView data={data} save={save} onNavigateToTasks={()=>setActiveTopTab(null)}/>}
          {activeTopTab==='milestones'  && <div style={{padding:'18px 20px'}}><GoalsMilestonesPanel data={data} save={save}/></div>}
          {activeTopTab==='goals'       && <div style={{padding:'18px 20px'}}><GoalsMilestonesPanel data={data} save={save}/></div>}
        </div>
```

(`milestones` and `goals` both render the same combined `GoalsMilestonesPanel` for now, since the underlying panel always shows both side by side and the spec didn't ask for splitting it into two independent halves — this matches "reuses what already exists rather than building new UI" from the spec.)

- [ ] **Step 3: Verify in the preview**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
```
Click each of the five רוחبי tab buttons via `preview_click` and screenshot/console-check after each:
```js
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: ישיבות/פיקוח show the "בפיתוח" placeholder, עקרון תכנון shows the principles table, אבני דרך/יעדים both show the same goals+milestones panel pair, no new console errors.

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "feat: add רוחبי tab row (ישיבות/עקרונות/פיקוח/אבני דרך/יעדים) to NihulTikhnunView"
```

---

### Task 8: Make `Sidebar` accept `data.tracks` and the new navigation callbacks

**Files:**
- Modify: `project_hub.html:10409` (`Sidebar` signature)
- Modify: `project_hub.html:10986` (call site in `App`)

- [ ] **Step 1: Widen `Sidebar`'s props**

Change:
```jsx
function Sidebar({track, setTrack}) {
```
to:
```jsx
function Sidebar({track, setTrack, tracks, activeTrackTab, activeTopTab, onSelectTrackTab, onSelectTopTab}) {
```

- [ ] **Step 2: Pass the new props from `App`**

Change:
```jsx
    <Sidebar track={track} setTrack={setTrackWithSheet}/>
```
to:
```jsx
    <Sidebar track={track} setTrack={setTrack}
      tracks={data.tracks || []}
      activeTrackTab={nihulTrackTab} activeTopTab={nihulTopTab}
      onSelectTrackTab={openTrackTab} onSelectTopTab={openTopTab}/>
```

- [ ] **Step 3: Delete the now-unused `setTrackWithSheet`**

After Step 2, nothing calls `setTrackWithSheet` anymore. Delete its definition (added in Task 5 Step 2):
```jsx
  /* kept as-is for now — still wired to Sidebar's setTrack prop until Task 8
     replaces that call site; Task 8 deletes this once it's no longer called. */
  const setTrackWithSheet = React.useCallback((newTrack) => {
    setTrack(newTrack);
    if(newTrack==='licensing') {
      const dashboard = sheets.find(s=>s.type==='dashboard');
      if(dashboard) setActiveSheetId(dashboard.id);
    }
  }, [sheets]);
```
(`sheets`/`addSheet`/sheet-tab plumbing it referenced stays for now if still used elsewhere — Task 10 does the broader unused-variable sweep.)

- [ ] **Step 4: Verify in the preview**

```js
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: no new errors (the new props are unused by `Sidebar`'s body until Task 9, so this is just confirming the prop-passing compiles cleanly and that removing `setTrackWithSheet` didn't leave a dangling reference).

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "refactor: pass data.tracks and tab-select callbacks into Sidebar"
```

---

### Task 9: Rebuild `Sidebar`'s body — expandable "ניהול תכנון" + "רוחبי" group

**Files:**
- Modify: `project_hub.html:10457-10474` (nav section)

- [ ] **Step 1: Add expand/collapse state for "ניהול תכנון"**

Change:
```jsx
function Sidebar({track, setTrack, tracks, activeTrackTab, activeTopTab, onSelectTrackTab, onSelectTopTab}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [expandedProj, setExpandedProj] = React.useState('lod'); // lod open by default
```
to:
```jsx
function Sidebar({track, setTrack, tracks, activeTrackTab, activeTopTab, onSelectTrackTab, onSelectTopTab}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [expandedProj, setExpandedProj] = React.useState('lod'); // lod open by default
  const [nihulExpanded, setNihulExpanded] = React.useState(true);
```

- [ ] **Step 2: Replace the flat `NAV.map` nav section with the expandable "ניהול תכנון" block + the "רוחبי" group**

Change:
```jsx
        <div className="sb-body">
          <div className="sb-section">
            {NAV.map(item=>{
              const trackMap={home:'overview',mytasks:'mytasks',portfolio:'portfolio'};
              const itemTrack = trackMap[item.id];
              const isActive = itemTrack && track===itemTrack;
              const isEnabled = !!itemTrack;
              return (
                <button key={item.id}
                  className={`sb-item${isActive?' active':isEnabled?'':' disabled'}`}
                  onClick={isEnabled?()=>setTrack(itemTrack):undefined}>
                  <span className="sb-item-icon"><Ic n={item.icon} size={15}/></span>
                  {item.label}
                </button>
              );
            })}
          </div>
```
to:
```jsx
        <div className="sb-body">
          <div className="sb-section">
            {NAV.map(item=>{
              const trackMap={home:'overview',mytasks:'mytasks',portfolio:'portfolio'};
              const itemTrack = trackMap[item.id];
              const isActive = itemTrack && track===itemTrack;
              const isEnabled = !!itemTrack;
              return (
                <button key={item.id}
                  className={`sb-item${isActive?' active':isEnabled?'':' disabled'}`}
                  onClick={isEnabled?()=>setTrack(itemTrack):undefined}>
                  <span className="sb-item-icon"><Ic n={item.icon} size={15}/></span>
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* ── ניהול תכנון (expandable: combined view + one entry per data.tracks track) ── */}
          <div className="sb-section">
            <div className="sb-proj-row">
              <button className={`sb-proj-btn${track==='tasks'?' active':''}`}
                onClick={()=>setTrack('tasks')}>
                <span className="sb-item-icon"><Ic n="tasks" size={15}/></span>
                ניהול תכנון
              </button>
              <button className="sb-proj-chevron" onClick={()=>setNihulExpanded(o=>!o)}>
                <DownIcon open={nihulExpanded}/>
              </button>
            </div>
            {nihulExpanded && (
              <div style={{marginBottom:2}}>
                <button
                  className={`sb-sub-item${track==='tasks' && !activeTopTab && activeTrackTab==='combined' ? ' active':''}`}
                  onClick={()=>onSelectTrackTab('combined')}>
                  <span className="sb-sub-dot" style={{
                    background: (track==='tasks' && !activeTopTab && activeTrackTab==='combined') ? 'var(--accent)' : 'var(--border-strong)'}}/>
                  מבט מאוחד
                </button>
                {tracks.map(t=>(
                  <button key={t.id}
                    className={`sb-sub-item${track==='tasks' && !activeTopTab && activeTrackTab===t.id ? ' active':''}`}
                    onClick={()=>onSelectTrackTab(t.id)}>
                    <span className="sb-sub-dot" style={{
                      background: (track==='tasks' && !activeTopTab && activeTrackTab===t.id) ? 'var(--accent)' : 'var(--border-strong)'}}/>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── רוחبי (cross-cutting shortcuts into NihulTikhnunView's second tab row) ── */}
          <div className="sb-section">
            <div className="sb-section-label">רוחبי</div>
            {CROSS_CUTTING_ITEMS.map(item=>(
              <button key={item.id}
                className={`sb-item${track==='tasks' && activeTopTab===item.id ? ' active':''}`}
                onClick={()=>onSelectTopTab(item.id)}>
                <span className="sb-item-icon"><Ic n={item.icon} size={15}/></span>
                {item.label}
              </button>
            ))}
          </div>
```

- [ ] **Step 3: Verify in the preview**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
```
Screenshot the sidebar — expect "ניהול תכנון" with a chevron, expanded by default showing "מבט מאוחד" + one row per track (מסלول תכנון / מסلול רישוי / מסلول מכרז / מסلول ביצוע), and a "רוחبי" section below with the five cross-cutting buttons. Click each sub-item via `preview_click` and confirm (via `preview_eval` reading `document.title` won't help here — instead check the active tab button's text/style in the main content area) that it lands on the matching tab. Confirm no console errors after each click.

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "feat: rebuild Sidebar with expandable ניהול תכנון and רוחبי groups"
```

---

### Task 10: Remove the dead `licensing`/`meetings`/`supervision`/`principles` top-level routes from `App`

**Files:**
- Modify: `project_hub.html` (`App`, the `sheet-tabs` header block and the content-area `track===...` branches)

With the sidebar no longer linking to `track==='licensing'`/`'meetings'`/`'supervision'`/`'principles'`, these routes are unreachable dead code (and `'licensing'`'s sheet-tab header actively duplicates what Task 4's stage-tab bar now does inside `NihulTikhnunView`). Removing them avoids two parallel UIs for the same sheets.

- [ ] **Step 1: Remove the licensing-only breadcrumb/sheet-tabs block**

Change:
```jsx
        {/* ── track breadcrumb + sheet sub-tabs ── */}
        <div className="sheet-tabs" style={{borderTop:'1px solid var(--border)'}}>
          {/* current track label */}
          <span style={{fontSize:11,fontWeight:600,color:'var(--text-3)',paddingLeft:4,paddingRight:8,
            display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
            <Ic n={PROJ_TRACKS.find(t=>t.id===track)?.icon||'overview'} size={12}/>
            {PROJ_TRACKS.find(t=>t.id===track)?.label||''}
          </span>
          {/* divider + sub-tabs for licensing — dashboard sheet always shown, list sheets filtered by track */}
          {track==='licensing' && <span style={{color:'var(--border-strong)',marginLeft:4,marginRight:4}}>›</span>}
          {track==='licensing' && sheets.filter(s=>s.type==='dashboard' || s.track==='licensing').map(s=><SheetTab key={s.id} s={s}/>)}
          {track==='licensing' && <button className="stab-add" title="הוסף שלב" onClick={addSheet}>+</button>}
          {/* ── Undo / Redo ── */}
          <div style={{marginRight:'auto',display:'flex',alignItems:'center',gap:4,paddingLeft:10,flexShrink:0}}>
            <UndoRedoBtn icon="↩" tooltip="ביטול" items={pastStack} disabled={!pastStack.length}
              onApply={()=>undoTo(1)} onGoTo={undoTo}/>
            <UndoRedoBtn icon="↪" tooltip="שחזור" items={futureStack} disabled={!futureStack.length}
              onApply={()=>redoTo(1)} onGoTo={redoTo}/>
          </div>
        </div>
```
to:
```jsx
        {/* ── track breadcrumb ── */}
        <div className="sheet-tabs" style={{borderTop:'1px solid var(--border)'}}>
          <span style={{fontSize:11,fontWeight:600,color:'var(--text-3)',paddingLeft:4,paddingRight:8,
            display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
            <Ic n={PROJ_TRACKS.find(t=>t.id===track)?.icon||'overview'} size={12}/>
            {PROJ_TRACKS.find(t=>t.id===track)?.label||''}
          </span>
          <div style={{marginRight:'auto',display:'flex',alignItems:'center',gap:4,paddingLeft:10,flexShrink:0}}>
            <UndoRedoBtn icon="↩" tooltip="ביטול" items={pastStack} disabled={!pastStack.length}
              onApply={()=>undoTo(1)} onGoTo={undoTo}/>
            <UndoRedoBtn icon="↪" tooltip="שחזור" items={futureStack} disabled={!futureStack.length}
              onApply={()=>redoTo(1)} onGoTo={redoTo}/>
          </div>
        </div>
```

- [ ] **Step 2: Remove the dead content-area branches**

Change:
```jsx
        {track==='overview' && <OverviewPage data={data} save={save} onNavigateToTasks={()=>setTrack('tasks')}/>}
        {track==='tasks'    && <NihulTikhnunView data={data} save={save}
          activeTrackTab={nihulTrackTab} setActiveTrackTab={setNihulTrackTab}
          activeTopTab={nihulTopTab} setActiveTopTab={setNihulTopTab}/>}
        {track==='licensing' && activeSheet?.type==='dashboard' && <DashboardView data={data} save={save} onSwitchSheet={setActiveSheetId}/>}
        {track==='licensing' && activeSheet?.type==='list' && <ListViewWithCtx data={sheetData} save={saveActiveSheet}/>}
        {track==='meetings'    && <ComingSoonPage iconName="meetings"    title="ישיבות" desc="ריכוז וניהול סיכומי ישיבות — בפיתוח"/>}
        {track==='supervision' && <ComingSoonPage iconName="supervision" title="פיקוח"  desc="ריכוז וניהול דוחות פיקוח מהביצוע — בפיתוח"/>}
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
        {track==='template'    && <TemplateView data={data} save={save}/>}
        {track==='principles'  && <PrinciplesView data={data} save={save} onNavigateToTasks={()=>setTrack('tasks')}/>}
```
to:
```jsx
        {track==='overview' && <OverviewPage data={data} save={save} onNavigateToTasks={()=>setTrack('tasks')}/>}
        {track==='tasks'    && <NihulTikhnunView data={data} save={save}
          activeTrackTab={nihulTrackTab} setActiveTrackTab={setNihulTrackTab}
          activeTopTab={nihulTopTab} setActiveTopTab={setNihulTopTab}/>}
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
        {track==='template'    && <TemplateView data={data} save={save}/>}
```

- [ ] **Step 3: Remove now-unused state/helpers tied only to the deleted `licensing` route**

Search for remaining usages of `activeSheetId`, `setActiveSheetId`, `activeSheet`, `sheetData`, `saveActiveSheet`, `addSheet`, `SheetTab`, `editingSheetId`, `sheetNameDraft`, `commitSheetName` in `project_hub.html`. For each one that is now unused *anywhere else in the file* (i.e. its only remaining reference was inside the block just deleted), delete its declaration too. Do not delete anything still referenced elsewhere (e.g. if `OverviewPage` or another component also reads `activeSheetId`, leave it).

Run after deleting:
```bash
grep -n "activeSheetId\|setActiveSheetId\|sheetData\b\|saveActiveSheet\|SheetTab\b\|editingSheetId\|sheetNameDraft\|commitSheetName" project_hub.html
```
Confirm every remaining hit is a legitimate, still-used reference (not a dangling declaration with zero call sites).

- [ ] **Step 4: Verify in the preview**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: only Babel deopt notices, no `ReferenceError`/`is not defined` errors. Click through every sidebar item (overview, ניהול תכנון + all its sub-items, רוחبי items, טמפלייט, המשימות שלי, פורטפוליו) and confirm each renders without console errors.

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "refactor: remove dead licensing/meetings/supervision/principles top-level routes"
```

---

### Task 11: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Reload fresh and confirm default landing**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
```
Screenshot: should land on ניהול תכנון → מבט מאוחד (combined cross-track list), matching the approved mockup.

- [ ] **Step 2: Walk every sidebar destination once**

For each of: מבט על, ניהול תכנון (header), מבט מאוחד, מסلول תכנון, מסلול רישוי, מסلول מכרז, מסلول ביצוע, ישיבות, עקרון תכנון, פיקוח, אבני דרך, יעדים, טמפלייט, המשימות שלי — click it via `preview_click` and screenshot. Confirm: no console errors, the breadcrumb/active-state highlighting matches what was clicked, and existing data (e.g. tasks under מסلول רישוי's "תנאים מקדימים" stage, the goals/milestones rows) still shows up unchanged.

- [ ] **Step 3: Confirm persistence survives reload**

Add a new goal via the יעדים tab, reload, confirm it's still there (localStorage round-trip, unaffected by this change but worth confirming nothing in the refactor broke the save path):
```js
mcp__Claude_Preview__preview_eval({serverId, expression: "JSON.parse(localStorage.getItem('pm_asana_v9')).licensingGoals.length"})
```

- [ ] **Step 4: Final commit (if any cleanup was needed)**

If Steps 1-3 required any fixes, commit them now with a message describing what regression they fixed. If everything passed cleanly with no further changes, skip this step — Task 10's commit is the last one.
