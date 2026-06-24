# Sidebar Flat Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nested "ניהול תכנון (expandable) + רוחבי" sidebar with a flat, 6-item list (ניהול תכנון, the 4 tracks, טמפלייט), splitting the single `NihulTikhnunView` component into a dedicated 6-tab "ניהול תכנון" hub page and a per-track page that each track routes to directly.

**Architecture:** `NihulTikhnunView` currently owns two internal tab rows (track-tabs and cross-cutting-tabs) gated by `track==='tasks'`. This plan splits it into `NihulHubView` (the 6 cross-cutting tabs: מבט על/עקרון תכנון/אבני דרך/יעדים/פיקוח/ישיבות, with local tab state) and `TrackView` (the existing stage-tab-bar/dashboard/combined-view logic, now addressed directly via `track===<trackId>` instead of through a shared tab row). `Sidebar` and `App` are updated to route to these directly per-track instead of through the old nested structure.

**Tech Stack:** Single-file React 18 (in-browser Babel, no build step), `project_hub.html`. No test runner exists — verification is via the already-running preview server, exercised with `mcp__Claude_Preview__preview_eval`/`preview_click`/`preview_screenshot`, the same approach used for the prior sidebar-hierarchy plan.

**Reference spec:** `docs/superpowers/specs/2026-06-24-sidebar-flat-restructure-design.md`

---

## Before You Start

The dev server is configured in `.claude/launch.json` as `"project-hub-worktree"` (port 3402) for work done in a worktree under `.claude/worktrees/`, and `"project-hub"` (port 3401) for the main checkout. If you're executing this plan in a fresh worktree, check whether a `project-hub-worktree`-style entry already points at your worktree's path; if not, add one (copy the `project-hub` entry and change the path/port) before starting `mcp__Claude_Preview__preview_start`.

---

### Task 1: Add the "מבט על" entry to `CROSS_CUTTING_ITEMS`

**Files:**
- Modify: `project_hub.html` (the `const CROSS_CUTTING_ITEMS = [...]` array, currently 5 entries)

- [ ] **Step 1: Prepend the overview entry**

Find:
```js
const CROSS_CUTTING_ITEMS = [
  {id:'meetings',    label:'ישיבות',         icon:'meetings'},
  {id:'principles',  label:'עקרון תכנון',    icon:'principles'},
  {id:'supervision', label:'פיקוח',          icon:'supervision'},
  {id:'milestones',  label:'אבני דרך',       icon:'milestones'},
  {id:'goals',       label:'יעדים',          icon:'goals'},
];
```
Replace with:
```js
const CROSS_CUTTING_ITEMS = [
  {id:'overview',    label:'מבט על',         icon:'overview'},
  {id:'meetings',    label:'ישיבות',         icon:'meetings'},
  {id:'principles',  label:'עקרון תכנון',    icon:'principles'},
  {id:'supervision', label:'פיקוח',          icon:'supervision'},
  {id:'milestones',  label:'אבני דרך',       icon:'milestones'},
  {id:'goals',       label:'יעדים',          icon:'goals'},
];
```
This array is currently only consumed inside `NihulTikhnunView`'s cross-cutting tab row and the sidebar's "רוחבי" section — both of which Tasks 2-4 rewrite, so this change alone has no visible effect yet (it's safe to commit standalone).

- [ ] **Step 2: Verify**

Run:
```bash
grep -n "CROSS_CUTTING_ITEMS" project_hub.html
```
Confirm the only matches are the definition itself and its two existing consumers (inside `NihulTikhnunView` and inside `Sidebar`) — both still compile fine with a 6th array entry since they `.map()` over the whole array generically.

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "feat: add מבט על entry to CROSS_CUTTING_ITEMS"
```

---

### Task 2: Create `NihulHubView` — the new 6-tab "ניהול תכנון" page

**Files:**
- Modify: `project_hub.html` (add a new top-level component, immediately above `function NihulTikhnunView`)

This task only *adds* a new component; it does not yet wire anything to use it (that's Task 5) or remove the old one (that's Task 3). Both can coexist temporarily.

- [ ] **Step 1: Add the new component**

Immediately above `function NihulTikhnunView({data, save, activeTrackTab, setActiveTrackTab, activeTopTab, setActiveTopTab}) {`, insert:

```jsx
function NihulHubView({data, save, onNavigateToOngoing}) {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
      <div style={{display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0}}>
        {CROSS_CUTTING_ITEMS.map(t => (
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
      <div style={{flex:1, overflowY:'auto', background:'var(--bg)'}}>
        {activeTab==='overview'    && <OverviewPage data={data} save={save} onNavigateToTasks={onNavigateToOngoing}/>}
        {activeTab==='meetings'    && <ComingSoonPage iconName="meetings"    title="ישיבות" desc="ריכוז וניהול סיכומי ישיבות — בפיתוח"/>}
        {activeTab==='supervision' && <ComingSoonPage iconName="supervision" title="פיקוח"  desc="ריכוז וניהול דוחות פיקוח מהביצוע — בפיתוח"/>}
        {activeTab==='principles'  && <PrinciplesView data={data} save={save} onNavigateToTasks={()=>setActiveTab('overview')}/>}
        {activeTab==='milestones'  && <div style={{padding:'18px 20px'}}><GoalsMilestonesPanel data={data} save={save}/></div>}
        {activeTab==='goals'       && <div style={{padding:'18px 20px'}}><GoalsMilestonesPanel data={data} save={save}/></div>}
      </div>
    </div>
  );
}

```

`onNavigateToOngoing` is a prop the caller (App, wired in Task 5) provides — it should navigate to the "מסלול תכנון" track (the combined cross-track view), since that's the closest equivalent of "see all tasks" now that this hub page no longer doubles as a track-tabs container itself.

Note: unlike the old `NihulTikhnunView`, this component does **not** wrap itself in `ListsCtx.Provider` and has no `editList`/`EditListModal` — none of its 6 tabs render `ListView` directly (that logic moves to `TrackView` in Task 3), so that context/modal machinery isn't needed here.

- [ ] **Step 2: Verify it compiles (no live route yet, so check via direct console eval)**

A preview server is already configured (`project-hub-worktree`, or `project-hub` for the main checkout — use whichever matches where you're working). Start it, reload, and check for syntax errors:
```js
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: only pre-existing Babel "deoptimised" notices — since `NihulHubView` isn't called anywhere yet, a syntax error inside it would still show up as a Babel parse failure (a much louder, different error), not silently pass. If you see anything beyond the routine deopt notices, stop and fix before committing.

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "feat: add NihulHubView (6-tab ניהול תכנון page)"
```

---

### Task 3: Create `TrackView` and delete the old `NihulTikhnunView`

**Files:**
- Modify: `project_hub.html` (replace `function NihulTikhnunView(...)` entirely with a new `function TrackView(...)`)

- [ ] **Step 1: Replace the whole `NihulTikhnunView` function**

Find the entire function (from `function NihulTikhnunView({data, save, activeTrackTab, setActiveTrackTab, activeTopTab, setActiveTopTab}) {` through its closing `}` — it ends right before `function DashboardView({data, save, onSwitchSheet}) {`... no wait, `GoalsMilestonesPanel` and `DashboardView` come *after* it in the file; the function you're replacing ends with:
```jsx
      {editList&&(
        <EditListModal
          title={listTitle(editList)}
          items={listItems(editList)}
          previewType={editList==='status'?'status':'pill'}
          onSave={items=>{
            if(editList==='priority') savePartial({priorities:items});
            else if(editList==='status') savePartial({statuses:items});
            else savePartial({disciplines:items});
            setEditList(null);
          }}
          onClose={()=>setEditList(null)}
        />
      )}
    </ListsCtx.Provider>
  );
}
```
— replace the **entire function**, from its `function NihulTikhnunView(...)` signature down through that closing `}`, with:

```jsx
function TrackView({data, save, trackId}) {
  const priorities  = data.priorities  || PRIORITIES;
  const disciplines = data.disciplines || DISCIPLINES;
  const statuses    = data.statuses    || STATUSES;
  const [editList, setEditList] = useState(null);
  const ntTracks = data.tracks || [];
  const activeTrack = ntTracks.find(t => t.id===trackId);
  const isOngoing = trackId==='ongoing';

  const allSheets = data.sheets || [];
  const [activeStageId, setActiveStageId] = useState(null);
  const visibleStages = (isOngoing || !activeTrack)
    ? []
    : allSheets.filter(s => (s.type==='list' || s.type==='dashboard') && s.track===activeTrack.trackValue);
  const activeStage = visibleStages.find(s => s.id===activeStageId) || visibleStages[0] || null;
  useEffect(() => { setActiveStageId(null); }, [trackId]);

  /* Persist a single stage sheet's patched data back into data.sheets.
     ListView calls save() with the fully-merged sheet object. */
  const saveSheet = (sheetId, fullSheet) =>
    save({...data, sheets: data.sheets.map(s => s.id===sheetId ? fullSheet : s)});

  /* ── Combined view (only relevant for the "מסלול תכנון" / 'ongoing' track) —
     merges tasks from every stage/track into one ListView, tagged with
     __srcSheetId/__track/__stage so מסלול/שלב become real group-by + filter
     fields. Edits route back to their origin sheet; view/column settings
     live in their own data.combinedView slot. This stays global (every
     track's tasks), per the explicit design decision that "מבט מאוחד"
     does not narrow to only this track's tasks. */
  const combinedSourceSheets = allSheets.filter(s => s.type==='list');
  const combinedMeta = data.combinedView || {id:'__combined__', name:'מבט מאוחד', groups:[], fields:[], hiddenCols:{}, colOrder:[], colWidths:{}, views:[]};
  const ongoingSheetId = (allSheets.find(s => s.type==='list' && s.track==null) || {}).id;
  const realGroupOwner = gId => combinedSourceSheets.find(s => (s.groups||[]).some(g => g.id===gId));
  const combinedData = isOngoing ? {
    ...combinedMeta,
    type:'list',
    __combined:true,
    groups: [...combinedSourceSheets.flatMap(s => s.groups||[]), ...(combinedMeta.groups||[])],
    tasks: combinedSourceSheets.flatMap(s => (s.tasks||[]).map(t => ({...t, __srcSheetId:s.id, __track:trackLabelOf(ntTracks, s), __stage:s.name}))),
  } : null;
  const saveCombined = patch => {
    let metaPatch = {...patch};
    let newSheets = data.sheets;
    if ('tasks' in patch) {
      const bySheet = {};
      patch.tasks.forEach(t => {
        const sid = t.__srcSheetId || ongoingSheetId || combinedSourceSheets[0]?.id;
        const {__srcSheetId, __track, __stage, ...clean} = t;
        (bySheet[sid] = bySheet[sid] || []).push(clean);
      });
      newSheets = data.sheets.map(s => bySheet[s.id] ? {...s, tasks:bySheet[s.id]} : s);
      delete metaPatch.tasks;
    }
    if ('groups' in patch) {
      const byRealSheet = {};
      const virtualGroups = [];
      patch.groups.forEach(g => {
        const owner = realGroupOwner(g.id);
        if (owner) (byRealSheet[owner.id] = byRealSheet[owner.id] || []).push(g);
        else virtualGroups.push(g);
      });
      newSheets = newSheets.map(s => byRealSheet[s.id] ? {...s, groups:byRealSheet[s.id]} : s);
      metaPatch.groups = virtualGroups;
    }
    save({...data, sheets:newSheets, combinedView:{...combinedMeta, ...metaPatch}});
  };

  const listTitle = t => t==='priority'?'עריכת עדיפויות':t==='status'?'עריכת סטטוסים':'עריכת תחומים';
  const listItems = t => t==='priority'?priorities:t==='status'?statuses:disciplines;
  const savePartial = patch => save({...data,...patch});

  return (
    <ListsCtx.Provider value={{
      priorities, disciplines, statuses,
      team: data.team || [],
      onEditList: type => setEditList(type),
    }}>
      <div style={{flex:1, display:'flex', flexDirection:'column', overflow:'hidden'}}>
        {!isOngoing && visibleStages.length>1 && (
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
          {isOngoing && <ListView data={combinedData} save={saveCombined}/>}
          {!isOngoing && activeStage && activeStage.type==='dashboard' &&
            <DashboardView data={data} save={save} onSwitchSheet={setActiveStageId}/>}
          {!isOngoing && activeStage && activeStage.type==='list' &&
            <ListView data={activeStage} save={patch => saveSheet(activeStage.id, patch)}/>}
          {!isOngoing && !activeStage && (
            <div style={{padding:'24px 20px', fontSize:12, color:'var(--text-3)'}}>אין שלבים במסלול זה</div>
          )}
        </div>
      </div>
      {editList&&(
        <EditListModal
          title={listTitle(editList)}
          items={listItems(editList)}
          previewType={editList==='status'?'status':'pill'}
          onSave={items=>{
            if(editList==='priority') savePartial({priorities:items});
            else if(editList==='status') savePartial({statuses:items});
            else savePartial({disciplines:items});
            setEditList(null);
          }}
          onClose={()=>setEditList(null)}
        />
      )}
    </ListsCtx.Provider>
  );
}
```

Differences from the old function, by design (matches the approved spec):
- No more track-tabs row or cross-cutting-tabs row — `TrackView` is reached directly per-track via the `trackId` prop, not through an internal tab switcher.
- `isCombinedTab`/`activeTrackTab` are gone, replaced by `isOngoing = trackId==='ongoing'` (the "מסלול תכנון" track always shows the combined view; every other track shows its own stage-tab-bar).
- `activeTopTab`/`setActiveTopTab` and the 5 cross-cutting `ComingSoonPage`/`PrinciplesView`/`GoalsMilestonesPanel` branches are gone — they moved to `NihulHubView` in Task 2.

- [ ] **Step 2: Verify with the preview**

Note: nothing calls `TrackView` yet (Task 5 wires it up) and the old `<NihulTikhnunView .../>` call site in `App` is now a dangling reference to a deleted function — this WILL produce a real `ReferenceError` until Task 5 fixes the call site. That's expected and fine to leave broken for one commit, since this is a multi-task plan executed in sequence (the same pattern used successfully in the prior sidebar-hierarchy plan). Confirm the error is specifically about `NihulTikhnunView` being undefined (not some other syntax problem) before moving on:
```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: a `ReferenceError: NihulTikhnunView is not defined` (or similar) alongside the routine Babel deopt notices — confirms the file otherwise parses correctly and the only break is the now-intentionally-dangling call site, which Task 5 fixes.

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "refactor: replace NihulTikhnunView with TrackView (per-track page)"
```

---

### Task 4: Simplify `Sidebar` to the flat 6-item list

**Files:**
- Modify: `project_hub.html` (`Sidebar`'s nav section and the "ספריית לוד" project-expand sub-items)

- [ ] **Step 1: Narrow `Sidebar`'s props**

Find:
```jsx
function Sidebar({track, setTrack, tracks, activeTrackTab, activeTopTab, onSelectTrackTab, onSelectTopTab}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [expandedProj, setExpandedProj] = React.useState('lod'); // lod open by default
  const [nihulExpanded, setNihulExpanded] = React.useState(true);
```
Replace with:
```jsx
function Sidebar({track, setTrack, tracks}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [expandedProj, setExpandedProj] = React.useState('lod'); // lod open by default
```

- [ ] **Step 2: Delete the "ניהול תכנון expandable + רוחבי" block**

Find and delete this entire block in its entirety (it sits between the top `NAV.map` section and the `{/* projects */}` section):
```jsx
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

          {/* ── רוחבי (cross-cutting shortcuts into NihulTikhnunView's second tab row) ── */}
          <div className="sb-section">
            <div className="sb-section-label">רוחבי</div>
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
(Leave the `{/* projects */}` comment and everything from there onward untouched for now — Step 3 handles that part.)

- [ ] **Step 3: Replace the "ספריית לוד" project's `PROJ_TRACKS.map` sub-items with the new flat 6-item list**

Find, inside the `{/* projects */}` → `MY_PROJECTS.map` → `{isExpanded && (...)}` block:
```jsx
                  {isExpanded && (
                    <div style={{marginBottom:2}}>
                      {PROJ_TRACKS.map(t=>(
                        <button key={t.id}
                          className={`sb-sub-item${!t.enabled?' disabled':track===t.id?' active':''}`}
                          onClick={t.enabled?()=>setTrack(t.id):undefined}>
                          <span className="sb-sub-dot" style={{
                            background: track===t.id ? 'var(--accent)' : t.enabled?'var(--border-strong)':'var(--border)'
                          }}/>
                          <span className="sb-item-icon" style={{width:13,height:13}}><Ic n={t.icon} size={13}/></span>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
```
Replace with:
```jsx
                  {isExpanded && (
                    <div style={{marginBottom:2}}>
                      <button
                        className={`sb-sub-item${track==='tasks'?' active':''}`}
                        onClick={()=>setTrack('tasks')}>
                        <span className="sb-sub-dot" style={{background: track==='tasks' ? 'var(--accent)' : 'var(--border-strong)'}}/>
                        <span className="sb-item-icon" style={{width:13,height:13}}><Ic n="tasks" size={13}/></span>
                        ניהול תכנון
                      </button>
                      {tracks.map(t=>(
                        <button key={t.id}
                          className={`sb-sub-item${track===t.id?' active':''}`}
                          onClick={()=>setTrack(t.id)}>
                          <span className="sb-sub-dot" style={{background: track===t.id ? 'var(--accent)' : 'var(--border-strong)'}}/>
                          <span className="sb-item-icon" style={{width:13,height:13}}><Ic n="tasks" size={13}/></span>
                          {t.label}
                        </button>
                      ))}
                      <button
                        className={`sb-sub-item${track==='template'?' active':''}`}
                        onClick={()=>setTrack('template')}>
                        <span className="sb-sub-dot" style={{background: track==='template' ? 'var(--accent)' : 'var(--border-strong)'}}/>
                        <span className="sb-item-icon" style={{width:13,height:13}}><Ic n="template" size={13}/></span>
                        טמפלייט
                      </button>
                    </div>
                  )}
```
(`PROJ_TRACKS` itself is left untouched in this task — it's still used elsewhere for the breadcrumb lookup, fixed in Task 5. The `icon="tasks"` used for every track button is a deliberate simplification — `data.tracks` entries don't carry their own icon field, and reusing the generic "tasks" icon for all of them matches the approved design, which didn't call for per-track icons.)

- [ ] **Step 4: Verify with the preview**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: the same `NihulTikhnunView is not defined` error from Task 3 still appears (not fixed until Task 5) — confirm no *additional* new errors were introduced by this Sidebar change. Screenshot the sidebar's "ספריית לוד" expanded project: expect exactly 6 sub-items in order — ניהול תכנון, then the 4 tracks (תכנון/רישוי/מכרז/ביצוע, in `data.tracks`'s order), then טמפלייט — and confirm the old separate "ניהול תכנון"/"רוחבי" sections above it are gone.

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "refactor: simplify Sidebar to flat 6-item project list"
```

---

### Task 5: Wire up `App` — route to `NihulHubView`/`TrackView`, drop old lifted state, fix breadcrumb

**Files:**
- Modify: `project_hub.html` (`App`'s state declarations, `Sidebar` call site, breadcrumb, content-area switch)

- [ ] **Step 1: Remove the now-unused lifted tab state**

Find:
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
```
Replace with:
```jsx
  /* top-level track: 'overview' | 'tasks' | 'template' | one of data.tracks' ids */
  const [track, setTrack] = useState('tasks');
```

- [ ] **Step 2: Update the `Sidebar` call site**

Find:
```jsx
    <Sidebar track={track} setTrack={setTrack}
      tracks={data.tracks || []}
      activeTrackTab={nihulTrackTab} activeTopTab={nihulTopTab}
      onSelectTrackTab={openTrackTab} onSelectTopTab={openTopTab}/>
```
Replace with:
```jsx
    <Sidebar track={track} setTrack={setTrack} tracks={data.tracks || []}/>
```

- [ ] **Step 3: Fix the breadcrumb to also resolve `data.tracks` entries**

Find:
```jsx
        <div className="sheet-tabs" style={{borderTop:'1px solid var(--border)'}}>
          <span style={{fontSize:11,fontWeight:600,color:'var(--text-3)',paddingLeft:4,paddingRight:8,
            display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
            <Ic n={PROJ_TRACKS.find(t=>t.id===track)?.icon||'overview'} size={12}/>
            {PROJ_TRACKS.find(t=>t.id===track)?.label||''}
          </span>
```
Replace with:
```jsx
        <div className="sheet-tabs" style={{borderTop:'1px solid var(--border)'}}>
          {(() => {
            const breadcrumbItem = PROJ_TRACKS.find(t=>t.id===track) || (data.tracks||[]).find(t=>t.id===track);
            return (
              <span style={{fontSize:11,fontWeight:600,color:'var(--text-3)',paddingLeft:4,paddingRight:8,
                display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                <Ic n={breadcrumbItem?.icon||'tasks'} size={12}/>
                {breadcrumbItem?.label||''}
              </span>
            );
          })()}
```
(Falls back to the `'tasks'` icon — rather than `'overview'` — since a `track` value that doesn't match `PROJ_TRACKS` is, by construction, one of the 4 track pages, which conceptually belong under the planning icon, not the project-overview one.)

- [ ] **Step 4: Update the content-area switch**

Find:
```jsx
        {track==='overview' && <OverviewPage data={data} save={save} onNavigateToTasks={()=>setTrack('tasks')}/>}
        {track==='tasks'    && <NihulTikhnunView data={data} save={save}
          activeTrackTab={nihulTrackTab} setActiveTrackTab={setNihulTrackTab}
          activeTopTab={nihulTopTab} setActiveTopTab={setNihulTopTab}/>}
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
        {track==='template'    && <TemplateView data={data} save={save}/>}
```
Replace with:
```jsx
        {track==='overview' && <OverviewPage data={data} save={save} onNavigateToTasks={()=>setTrack('ongoing')}/>}
        {track==='tasks'    && <NihulHubView data={data} save={save} onNavigateToOngoing={()=>setTrack('ongoing')}/>}
        {(data.tracks||[]).some(t=>t.id===track) && <TrackView data={data} save={save} trackId={track}/>}
        {track==='mytasks'     && <MyTasksView data={data} save={save}/>}
        {track==='portfolio'   && <PortfolioView/>}
        {track==='template'    && <TemplateView data={data} save={save}/>}
```
(`setTrack('ongoing')` assumes the "מסלול תכנון" track's id is `'ongoing'` — this is guaranteed by the migration added in the previous sidebar-hierarchy plan (`docs/superpowers/specs/2026-06-23-sidebar-hierarchy-restructure-design.md`), which keeps the legacy `id:'ongoing'` while only renaming its `label`. Confirm this by checking `data.tracks` in the live app if you want extra certainty — `JSON.parse(localStorage.getItem('pm_asana_v9')).tracks.find(t=>t.label.includes('תכנון') && t.id!=='tasks')` should show `id:'ongoing'`.)

- [ ] **Step 5: Verify with the preview**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
mcp__Claude_Preview__preview_console_logs({serverId, level:'error'})
```
Expected: only the routine Babel deopt notices now — the `NihulTikhnunView is not defined` error from Tasks 3-4 should be gone. Screenshot: app should land on "ניהול תכנון" → "מבט על" tab by default (since `track` defaults to `'tasks'`, and `NihulHubView`'s own local `activeTab` state defaults to `'overview'`). Click each of the 6 sidebar items and confirm:
- ניהול תכנון → lands on its מבט על tab, and all 6 internal tabs (מבט על/ישיבות/עקרון תכנון/פיקוח/אבני דרך/יעדים) switch content correctly with no console errors.
- מסלול תכנון → shows the combined cross-track list (same data as before this plan).
- מסלול רישוי → shows the dashboard + stage-tab bar (דאשבורד/תיק מידע/תנאים מקדימים/בקרת תכן).
- מסלול מכרז, מסלול ביצוע → each shows the "אין שלבים במסלול זה" empty state (since both still have empty `stageOrder`).
- טמפלייט → unchanged, shows the track/stage hierarchy editor.

- [ ] **Step 6: Commit**

```bash
git add project_hub.html
git commit -m "refactor: route App to NihulHubView/TrackView, drop lifted tab state"
```

---

### Task 6: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Reload fresh and confirm default landing**

```js
mcp__Claude_Preview__preview_eval({serverId, expression: "window.location.reload(); 'reloading'"})
```
Screenshot: should land on ניהול תכנון → מבט על, matching the agreed default-landing behavior.

- [ ] **Step 2: Walk every sidebar destination once**

For each of the 6 flat items (ניהול תכנון, מסלול תכנון, מסלול רישוי, מסלול מכרז, מסלול ביצוע, טמפלייט) plus the top-nav items (בית, המשימות שלי, פורטפוליו) — click it and screenshot. Confirm: no console errors, the sidebar's active-state highlighting matches what was clicked, the breadcrumb label/icon at the top updates correctly for each, and existing data (tasks under "תנאים מקדימים", goals/milestones, principles) still shows up unchanged.

- [ ] **Step 3: Walk all 6 internal "ניהול תכנון" tabs**

Click into "ניהול תכנון", then click each of its 6 internal tabs (מבט על, ישיבות, עקרון תכנון, פיקוח, אבני דרך, יעדים) and screenshot each. Confirm content matches what each showed in the previous (now-replaced) רוחבי tabs, and that clicking "ניהול תכנון" again in the sidebar (after navigating elsewhere) returns to whichever tab was last active or resets to מבט על — either behavior is acceptable since the spec doesn't require remembering the last-active hub tab across navigations away and back; just confirm it doesn't crash.

- [ ] **Step 4: Confirm persistence survives reload**

Add a new goal via ניהול תכנון → יעדים, reload, confirm it's still there:
```js
mcp__Claude_Preview__preview_eval({serverId, expression: "JSON.parse(localStorage.getItem('pm_asana_v9')).licensingGoals.length"})
```

- [ ] **Step 5: Final commit (if any cleanup was needed)**

If Steps 1-4 required any fixes, commit them now with a message describing what they fixed. If everything passed cleanly, skip this step.
