# ניהול תכנון ↔ מסלול רישוי — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every sheet a `track` tag (`'licensing'|null`) so that מסלול רישוי only ever shows its own stages, the existing empty placeholder sheet becomes the home for ongoing/general tasks ("משימות שוטפות"), and ניהול תכנון exposes both as separate sub-tabs instead of one long stacked list.

**Architecture:** No new per-task field. `sheet.track` drives three things: (1) a migration step that stamps every existing list sheet and renames the unused placeholder, (2) the existing מסלול רישוי sub-tab/dashboard filters (swap name-based exclusion for track-based inclusion), (3) a small tab bar inside `NihulTikhnunView` that filters which sheets render — reusing the existing per-sheet `ListView` rendering untouched.

**Tech Stack:** Single-file React 18 + Babel-standalone app (`project_hub.html`), no build step, state persisted to `localStorage` under `pm_asana_v9`. No automated test framework exists in this project — verification is manual, via the `project-hub` preview server (port 3401, configured in `.claude/launch.json`) and the `mcp__Claude_Preview__*` tools, following the pattern already used in this session's commits (`0882d9f`, `975e3f6`).

**Spec:** `docs/superpowers/specs/2026-06-21-nihul-tikhnun-licensing-track-design.md` (as amended by `f4d930b` — sub-tabs, not stacked sections)

---

## File Structure

All changes are within the single file `C:\Users\Omega\Database\project_hub.html`:

- `migrateData()` (~line 1648) — add a `stampSheetTracks()` helper (new function, placed directly above `migrateData`) and call it from both of `migrateData`'s return paths.
- `addSheet()` inside `App()` (~line 10085) — stamp `track:'licensing'` on sheets created from the licensing track's "+" button.
- `App()` render — sub-tab filter for track==='licensing' (~line 10170), and removal of the now-dead track==='tasks' sub-tab row (~lines 10172-10174) and its dead branch in `setTrackWithSheet` (~lines 10096-10100).
- `DashboardView()` (~line 7094) — restrict its per-stage cards/gantt to licensing-tracked sheets.
- `NihulTikhnunView()` (~lines 7022-7090) — add the `NT_TRACK_TABS` constant and the sub-tab bar; replace the name-based sheet filter with a track-based one.

---

## Task 1: Confirm current state of the live data before touching migration

**Files:** none (read-only verification)

- [ ] **Step 1: Start the preview server and load the app**

Run (if not already running):
```
mcp__Claude_Preview__preview_start { "name": "project-hub" }
```
Then navigate to `http://localhost:3401/project_hub.html` via `mcp__Claude_Preview__preview_eval`:
```js
window.location.href = '/project_hub.html'; 'ok'
```

- [ ] **Step 2: Confirm the placeholder sheet's real shape in localStorage**

Run via `mcp__Claude_Preview__preview_eval`:
```js
JSON.stringify(JSON.parse(localStorage.getItem('pm_asana_v9')).sheets.map(s=>({name:s.name,type:s.type,taskCount:(s.tasks||[]).length})))
```

**Actual result, verified 2026-06-21:**
```json
[{"name":"דאשבורד","type":"dashboard","taskCount":0},
 {"name":"ניהול תכנון","type":"list","taskCount":30},
 {"name":"תיק מידע","type":"list","taskCount":6},
 {"name":"תנאים מקדימים","type":"list","taskCount":18},
 {"name":"בקרת תכן","type":"list","taskCount":0}]
```

The "ניהול תכנון" sheet is **not empty** — it holds 30 tasks seeded by `makeDefaultData()` (קיק-אוף, לוח זמנים ראשי, חלוקת תפקידים, תקציב, חוזי יועצים, etc.). These are general PM/ongoing tasks, not tied to any רישוי stage — exactly the content that belongs under "משימות שוטפות". This is a **good outcome, not a blocker**: Task 2's migration renames the sheet and keeps its 30 tasks untouched (it never touches `tasks`, only `name`/`track`). The design doc has been updated (`docs/superpowers/specs/2026-06-21-nihul-tikhnun-licensing-track-design.md`) to reflect this — proceed to Task 2 as planned.

This step has no code change and no commit — it's a guard before Task 2. (If a future run of this step finds genuinely unrelated/sensitive content instead of recognizable general-PM seed tasks, stop and ask before proceeding — but that is not the case here.)

---

## Task 2: Add `sheet.track` via migration

**Files:**
- Modify: `project_hub.html:1648` (function `migrateData`, add helper directly above it)

- [ ] **Step 1: Add the `stampSheetTracks` helper directly above `migrateData`**

Find:
```js
function migrateData(d) {
  if (!d) return d;
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

function migrateData(d) {
  if (!d) return d;
```

Note the guard `'track' in s ? s.track : 'licensing'` rather than `s.track ?? 'licensing'` — the renamed sheet's `track` is explicitly `null`, and `??` treats `null` as missing, which would flip it back to `'licensing'` on the next migration run. The `in` check is what makes this idempotent.

- [ ] **Step 2: Call the helper from the old flat-structure migration branch**

Find (the `!d.sheets` branch, old-format upgrade path):
```js
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
    return d;
```

Replace the final two lines with:
```js
    delete d.groups; delete d.tasks; delete d.fields; delete d.hiddenCols; delete d.colOrder;
    return {...d, sheets: stampSheetTracks(d.sheets)};
```

- [ ] **Step 3: Call the helper from the main migration return path**

Find:
```js
  return {...d, sheets: d.sheets.map(s =>
    s.type==='list' ? {...s, tasks:(s.tasks||[]).map(migrateTask)} : s
  )};
}
```

Replace with:
```js
  return {...d, sheets: stampSheetTracks(d.sheets.map(s =>
    s.type==='list' ? {...s, tasks:(s.tasks||[]).map(migrateTask)} : s
  ))};
}
```

- [ ] **Step 4: Verify in the browser**

Reload via `mcp__Claude_Preview__preview_eval`:
```js
window.location.reload(); 'ok'
```
Then check the migrated shape:
```js
JSON.stringify(JSON.parse(localStorage.getItem('pm_asana_v9')).sheets.map(s=>({name:s.name,type:s.type,track:s.track})))
```
Expected: the sheet formerly named `"ניהול תכנון"` now reads `"name":"משימות שוטפות","type":"list","track":null`, and every other `type:"list"` sheet reads `"track":"licensing"`. The `type:"dashboard"` sheet has no `track` key at all (untouched, as designed).

- [ ] **Step 5: Verify idempotency**

Run the reload + check from Step 4 a second time. Expected: identical output — `"משימות שוטפות"` stays `track:null`, stage sheets stay `track:"licensing"`. (This is the case the naive `??` version would have broken.)

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Omega\Database"
git add project_hub.html
git commit -m "feat: tag sheets with track, repurpose empty placeholder as ongoing-tasks sheet

migrateData now stamps every list sheet with track:'licensing' (the
historical default) and renames+repurposes the long-unused empty
'ניהול תכנון' placeholder sheet into 'משימות שוטפות' with track:null,
so general/ongoing planning tasks have a real home that isn't tied to
a licensing stage."
```

---

## Task 3: Stamp `track:'licensing'` on sheets created from the licensing track

**Files:**
- Modify: `project_hub.html:10085-10090` (function `addSheet` inside `App()`)

- [ ] **Step 1: Update `addSheet`**

Find:
```js
  const addSheet=()=>{
    const ns=makeEmptySheet('שלב חדש');
    const updatedSheets=[...sheets,ns];
    save({...data,sheets:updatedSheets});
    setActiveSheetId(ns.id);
  };
```

Replace with:
```js
  const addSheet=()=>{
    const ns={...makeEmptySheet('שלב חדש'), track:'licensing'};
    const updatedSheets=[...sheets,ns];
    save({...data,sheets:updatedSheets});
    setActiveSheetId(ns.id);
  };
```

This function is only reachable from the "+" button rendered under `track==='licensing'` (see Task 4), so hardcoding `'licensing'` here is correct — there is no other caller.

- [ ] **Step 2: Verify in the browser**

In the app, with the sidebar on "מסלול רישוי", click the "+" button next to the sheet tabs to add a new stage (e.g. name it "כללי - רישוי" by double-clicking the new tab). Then check via `mcp__Claude_Preview__preview_eval`:
```js
JSON.stringify(JSON.parse(localStorage.getItem('pm_asana_v9')).sheets.find(s=>s.name==='כללי - רישוי'))
```
Expected: an object with `"track":"licensing"`.

- [ ] **Step 3: Commit**

```bash
git add project_hub.html
git commit -m "feat: tag new licensing-track sheets with track:'licensing' on creation"
```

---

## Task 4: Filter מסלול רישוי (sub-tabs + dashboard) by track instead of by name

**Files:**
- Modify: `project_hub.html:10168-10174` (sub-tab row inside `App()`)
- Modify: `project_hub.html:10096-10105` (`setTrackWithSheet`)
- Modify: `project_hub.html:7094` (function `DashboardView`)

- [ ] **Step 1: Replace the licensing sub-tab filter**

Find:
```js
          {/* divider + sub-tabs for licensing — exclude ניהול תכנון sheet */}
          {track==='licensing' && <span style={{color:'var(--border-strong)',marginLeft:4,marginRight:4}}>›</span>}
          {track==='licensing' && sheets.filter(s=>s.name!=='ניהול תכנון').map(s=><SheetTab key={s.id} s={s}/>)}
          {track==='licensing' && <button className="stab-add" title="הוסף שלב" onClick={addSheet}>+</button>}
          {/* sub-tabs for tasks track — only ניהול תכנון sheet */}
          {track==='tasks' && <span style={{color:'var(--border-strong)',marginLeft:4,marginRight:4}}>›</span>}
          {track==='tasks' && sheets.filter(s=>s.name==='ניהול תכנון').map(s=><SheetTab key={s.id} s={s}/>)}
```

Replace with:
```js
          {/* divider + sub-tabs for licensing — dashboard sheet always shown, list sheets filtered by track */}
          {track==='licensing' && <span style={{color:'var(--border-strong)',marginLeft:4,marginRight:4}}>›</span>}
          {track==='licensing' && sheets.filter(s=>s.type==='dashboard' || s.track==='licensing').map(s=><SheetTab key={s.id} s={s}/>)}
          {track==='licensing' && <button className="stab-add" title="הוסף שלב" onClick={addSheet}>+</button>}
```

`NihulTikhnunView` (track==='tasks') no longer reads `activeSheetId` (confirmed in Task 5 below), so that sub-tab row is dead UI and is removed rather than rewritten.

- [ ] **Step 2: Remove the matching dead branch in `setTrackWithSheet`**

Find:
```js
  /* When switching to tasks track — auto-select first list sheet (ניהול תכנון) */
  const setTrackWithSheet = React.useCallback((newTrack) => {
    setTrack(newTrack);
    if(newTrack==='tasks') {
      const firstList = sheets.find(s=>s.type==='list');
      if(firstList) setActiveSheetId(firstList.id);
    } else if(newTrack==='licensing') {
      const dashboard = sheets.find(s=>s.type==='dashboard');
      if(dashboard) setActiveSheetId(dashboard.id);
    }
  }, [sheets]);
```

Replace with:
```js
  const setTrackWithSheet = React.useCallback((newTrack) => {
    setTrack(newTrack);
    if(newTrack==='licensing') {
      const dashboard = sheets.find(s=>s.type==='dashboard');
      if(dashboard) setActiveSheetId(dashboard.id);
    }
  }, [sheets]);
```

- [ ] **Step 3: Restrict `DashboardView`'s per-stage cards/gantt to licensing sheets**

Find:
```js
function DashboardView({data, save, onSwitchSheet}) {
  const [confetti, setConfetti] = useState(false);
  const sheets = (data.sheets||[]).filter(s=>s.type==='list');
```

Replace with:
```js
function DashboardView({data, save, onSwitchSheet}) {
  const [confetti, setConfetti] = useState(false);
  const sheets = (data.sheets||[]).filter(s=>s.type==='list' && s.track==='licensing');
```

- [ ] **Step 4: Verify in the browser**

Reload, switch the sidebar to "מסלול רישוי". Expected via screenshot (`mcp__Claude_Preview__preview_screenshot`): sub-tabs show the dashboard tab plus every licensing stage (תיק מידע, תנאים מקדימים, בקרת תכן, כללי - רישוי if created in Task 3) — "משימות שוטפות" does **not** appear as a sub-tab, and does **not** appear as a card in the dashboard view.

- [ ] **Step 5: Commit**

```bash
git add project_hub.html
git commit -m "fix: filter מסלול רישוי sub-tabs and dashboard by sheet.track, not by name

Remove the now-dead ניהול-תכנון sub-tab row and its setTrackWithSheet
branch (NihulTikhnunView no longer reads activeSheetId)."
```

---

## Task 5: Add sub-tabs to ניהול תכנון

**Files:**
- Modify: `project_hub.html:7022-7090` (function `NihulTikhnunView`)

- [ ] **Step 1: Replace `NihulTikhnunView` with the tabbed version**

Find:
```js
function NihulTikhnunView({data, save}) {
  const priorities  = data.priorities  || PRIORITIES;
  const disciplines = data.disciplines || DISCIPLINES;
  const statuses    = data.statuses    || STATUSES;
  const [editList, setEditList] = useState(null);

  const allSheets  = data.sheets || [];
  const listSheets = allSheets.filter(s => s.type==='list' && s.name!=='ניהול תכנון');

  const [collStage, setCollStage] = useState({});
  const toggleStage = id => setCollStage(c => ({...c, [id]: !c[id]}));

  /* Persist a single stage sheet's patched data back into data.sheets.
     ListView calls save() with the fully-merged sheet object. */
  const saveSheet = (sheetId, fullSheet) =>
    save({...data, sheets: data.sheets.map(s => s.id===sheetId ? fullSheet : s)});

  const listTitle = t => t==='priority'?'עריכת עדיפויות':t==='status'?'עריכת סטטוסים':'עריכת תחומים';
  const listItems = t => t==='priority'?priorities:t==='status'?statuses:disciplines;
  const savePartial = patch => save({...data,...patch});

  return (
    <ListsCtx.Provider value={{
      priorities, disciplines, statuses,
      team: data.team || [],
      onEditList: type => setEditList(type),
    }}>
      <div style={{flex:1, overflowY:'auto', background:'var(--bg)'}}>
        {listSheets.map(sheet => {
          const collapsed = collStage[sheet.id];
          return (
            <React.Fragment key={sheet.id}>
              {/* ── Stage divider — identical visual weight to a group header ── */}
              <div style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 20px', background:'var(--surface)',
                borderBottom:'1px solid var(--border)', borderTop:'4px solid var(--bg)',
                cursor:'pointer', userSelect:'none',
              }} onClick={() => toggleStage(sheet.id)}>
                <span style={{fontSize:10, color:'var(--text-3)', display:'inline-block',
                  transform: collapsed ? 'rotate(-90deg)' : '', transition:'transform .15s'}}>▾</span>
                <span style={{width:11, height:11, borderRadius:3, background:'#2563EB', flexShrink:0, display:'inline-block'}}/>
                <span style={{fontWeight:700, fontSize:13, color:'var(--text)'}}>{sheet.name}</span>
                <span style={{fontSize:11, color:'var(--text-3)', marginRight:'auto'}}>{(sheet.tasks||[]).length} משימות</span>
              </div>

              {/* ── The exact same list view used in מסלול רישוי ── */}
              {!collapsed && <ListView data={sheet} save={patch => saveSheet(sheet.id, patch)}/>}
            </React.Fragment>
          );
        })}
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

Replace with:
```js
/* Which sheets show under each ניהול-תכנון sub-tab. Extending to a future
   track (e.g. tender/execution) is adding one entry here. */
const NT_TRACK_TABS = [
  {id:'ongoing',   label:'ניהול שוטף',  match: s => s.track==null},
  {id:'licensing', label:'מסלול רישוי', match: s => s.track==='licensing'},
];

function NihulTikhnunView({data, save}) {
  const priorities  = data.priorities  || PRIORITIES;
  const disciplines = data.disciplines || DISCIPLINES;
  const statuses    = data.statuses    || STATUSES;
  const [editList, setEditList] = useState(null);
  const [activeTrackTab, setActiveTrackTab] = useState(NT_TRACK_TABS[0].id);

  const allSheets = data.sheets || [];
  const activeTab = NT_TRACK_TABS.find(t => t.id===activeTrackTab) || NT_TRACK_TABS[0];
  const visibleSheets = allSheets.filter(s => s.type==='list' && activeTab.match(s));

  const [collStage, setCollStage] = useState({});
  const toggleStage = id => setCollStage(c => ({...c, [id]: !c[id]}));

  /* Persist a single stage sheet's patched data back into data.sheets.
     ListView calls save() with the fully-merged sheet object. */
  const saveSheet = (sheetId, fullSheet) =>
    save({...data, sheets: data.sheets.map(s => s.id===sheetId ? fullSheet : s)});

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
        <div style={{display:'flex', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0}}>
          {NT_TRACK_TABS.map(t => (
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
        <div style={{flex:1, overflowY:'auto', background:'var(--bg)'}}>
          {visibleSheets.map(sheet => {
            const collapsed = collStage[sheet.id];
            return (
              <React.Fragment key={sheet.id}>
                {/* ── Stage divider — identical visual weight to a group header ── */}
                <div style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'10px 20px', background:'var(--surface)',
                  borderBottom:'1px solid var(--border)', borderTop:'4px solid var(--bg)',
                  cursor:'pointer', userSelect:'none',
                }} onClick={() => toggleStage(sheet.id)}>
                  <span style={{fontSize:10, color:'var(--text-3)', display:'inline-block',
                    transform: collapsed ? 'rotate(-90deg)' : '', transition:'transform .15s'}}>▾</span>
                  <span style={{width:11, height:11, borderRadius:3, background:'#2563EB', flexShrink:0, display:'inline-block'}}/>
                  <span style={{fontWeight:700, fontSize:13, color:'var(--text)'}}>{sheet.name}</span>
                  <span style={{fontSize:11, color:'var(--text-3)', marginRight:'auto'}}>{(sheet.tasks||[]).length} משימות</span>
                </div>

                {/* ── The exact same list view used in מסלול רישוי ── */}
                {!collapsed && <ListView data={sheet} save={patch => saveSheet(sheet.id, patch)}/>}
              </React.Fragment>
            );
          })}
          {visibleSheets.length===0 && (
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

- [ ] **Step 2: Verify in the browser**

Reload, switch the sidebar to "ניהול תכנון". Via `mcp__Claude_Preview__preview_screenshot`, confirm:
- Two tabs render: "ניהול שוטף" (active by default, bold + blue underline) and "מסלול רישוי".
- "ניהול שוטף" tab shows exactly one stage divider: "משימות שוטפות".
- Clicking "מסלול רישוי" shows every licensing stage sheet stacked (תיק מידע, תנאים מקדימים, בקרת תכן, and "כללי - רישוי" if created in Task 3) — and **not** "משימות שוטפות".

- [ ] **Step 3: Verify a task added under "ניהול שוטף" persists and stays out of מסלول רישוי**

Via `mcp__Claude_Preview__preview_eval`, expand the "משימות שוטפות" sheet's group and add a task through the UI (or simulate via `preview_click`/`preview_fill` on the rendered "+ הוסף משימה" button), then check:
```js
JSON.stringify(JSON.parse(localStorage.getItem('pm_asana_v9')).sheets.find(s=>s.name==='משימות שוטפות').tasks.length)
```
Expected: count increased by 1. Then switch to "מסלול רישוי" (both the sub-tab inside ניהול תכנון and the main sidebar track) and confirm the new task does not appear anywhere there.

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "feat: split ניהול תכנון into ניהול שוטף / מסלול רישוי sub-tabs

Replace the single stacked list (every sheet rendered one after
another) with a tab bar driven by NT_TRACK_TABS, so only one track's
sheets render at a time. Adding a future track (tender/execution) is
a one-line addition to NT_TRACK_TABS plus a matching sheet.track value
— no other change needed here."
```

---

## Task 6: Full manual regression pass

**Files:** none (verification only)

- [ ] **Step 1: Fresh reload sanity check**

Reload the app fully (`window.location.reload()`), confirm no console errors via `mcp__Claude_Preview__preview_console_logs` (level `error`) beyond the pre-existing harmless Babel size-warning notices seen throughout this session.

- [ ] **Step 2: Walk every entry point that touches sheets**

Using `preview_screenshot` after each step:
1. Sidebar → "בית" / "מבט על" → unaffected, loads normally.
2. Sidebar → "מסלול רישוי" → dashboard tab + licensing stage tabs only, no "משימות שוטפות".
3. Sidebar → "ניהול תכנון" → "ניהול שוטף" tab active by default, shows "משימות שוטפות" only.
4. Click "מסלול רישוי" sub-tab inside ניהול תכנון → all licensing stages stacked, matches what Task 4/5 verified.
5. Back in "מסלול רישוי" main track, click "+" to add a new stage → new tab appears immediately, and also appears under the "מסלול רישוי" sub-tab in ניהול תכנון (per Task 3 + Task 5).

- [ ] **Step 3: No commit for this task** — it's a verification pass over work already committed in Tasks 2-5. If any check fails, fix forward in a new commit rather than amending.

---

## Self-Review Notes

- **Spec coverage:** sheet.track field + migration (Task 2), מסלול רישוי filtering incl. dashboard (Task 4), reused empty placeholder → משימות שוטפות (Task 2), new sheet auto-tagging (Task 3), sub-tabs in ניהול תכנון (Task 5), extensibility for future tracks (`NT_TRACK_TABS` / spec's "future track" note) — all covered. The spec's "dashboard sheets unaffected by track" edge case is covered by Task 4 Step 1 (`s.type==='dashboard' ||...`).
- **Idempotency:** Task 2 Step 1 explicitly calls out and fixes the `??` vs `'track' in s` bug before it ships, with a dedicated verification step (Task 2 Step 5) rather than leaving it implicit.
- **Dead code:** Task 4 removes the now-meaningless `track==='tasks'` sub-tab row and its `setTrackWithSheet` branch, since `NihulTikhnunView` (Task 5) stops depending on `activeSheetId` entirely — left unremoved, it would have been a second, contradictory source of "which sheets show under ניהול תכנון."
- **Type/naming consistency:** `sheet.track`, `NT_TRACK_TABS`, `activeTrackTab`, `saveSheet` are each defined once (Task 2 / Task 5) and referenced identically everywhere else in the plan.
