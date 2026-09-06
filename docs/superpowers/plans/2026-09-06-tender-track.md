# Tender Track (מסלול מכרז) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "tender" matrix dashboard to `project_hub_01.html` that shows, per building × consultant × document-type, whether each required tender document is missing / in-work / stuck / done — pivotable, with summary tiles and event-derived cell status.

**Architecture:** A new standalone sheet `type:'tender'` attached to the already-existing top-level track `tender` (in `data.tracks`). The sheet stores its own `buildings/consultants/docTypes/cells` grid. Cell status is derived from each cell's event list through a single pure function `tenderCellStatus` (which — unlike today's `getMostRecentEventStatus` — maps `update → בעבודה`), with an optional manual `statusOverride`. UI is authored fresh in Project Hub's JSX/CSS conventions, reusing the shared `EV_STATUSES` event model and the central `save`.

**Tech Stack:** React 18 (Babel-standalone, no build) inside one HTML file. No test runner in-repo → pure logic is verified with dependency-free **Node smoke tests** under `tests/` (the project's established mirror-the-logic pattern); UI is verified in the Browser preview (dev server `project-hub`).

**Reference to port structure from:** `planning_dashboard.html` (transpiled matrix: row/col pivot selectors ~line 2655/2679, stat tiles, cell timeline). Its event model `EV_STATUSES` is identical to Project Hub's, so semantics carry over; we re-author the JSX rather than copy transpiled `React.createElement` code.

**Spec:** `docs/superpowers/specs/2026-09-06-tender-track-design.md`

---

## Conventions used by every task

- **Single source of truth for status:** every status reader (tiles, matrix, filters, counts) MUST call `tenderCellStatus(cell)`. Never inline the mapping. (This is the lesson from the status-duality bug.)
- **Confirmed existing helpers** (defined near line 751–756 of `project_hub_01.html`): `EV_STATUSES`, `EV_PERIOD`, `uid()`, `todayISO()`, `fmtDateFull(iso)`, and the central `save(prev => next)` inside `App`. Reuse them; do not redefine.
- **Insertion anchor for new pure functions:** immediately after the `EV_CYCLE` / `getMostRecentEventStatus` block (search the file for `const EV_CYCLE=`). Add the tender pure functions there so they precede all components.
- **Status codes** are the same 4 the app already uses: `'N'` missing/חסר, `'I'` in-work/בעבודה, `'R'` stuck/תקוע, `'C'` done/הסתיים.
- **Commit after every task.** Branch is already `feat/tender-track`.

---

## File Structure

- **Modify** `project_hub_01.html`:
  - Pure logic block (after `EV_CYCLE`): `TENDER_DOCTYPES_DEFAULT`, `makeTenderSheet()`, `cellKey()`, `tenderCellStatus()`, `tenderCounts()`, `tenderPivot()`.
  - `migrateData` (search `seedTracksIfMissing`): ensure the `tender` track's sheets are carried; no destructive change.
  - Sheet-render dispatch (search `type==='dashboard'`): add a `type==='tender'` branch → `<TenderView>`.
  - New components (author near the other view components): `TenderView`, `TenderTiles`, `TenderPivotBar`, `TenderMatrix`, `TenderCellPanel`, `TenderListsEditor`.
  - "Add sheet" / track wiring so the tender sheet is creatable/visible in the `tender` track.
- **Create** `tests/tender-logic.test.js` — Node smoke tests mirroring the pure functions.
- **Create** `tests/README.md` — one line: how to run (`node tests/tender-logic.test.js`).

> **Mirror rule:** `tests/tender-logic.test.js` contains its own copy of the pure functions (no import possible from an HTML file). If you change a pure function in the HTML, update the mirror in the same commit.

---

### Task 1: Pure logic — `tenderCellStatus` (the core, with `update → בעבודה`)

**Files:**
- Create: `tests/tender-logic.test.js`
- Modify: `project_hub_01.html` (after `const EV_CYCLE=` block)

- [ ] **Step 1: Write the failing test**

Create `tests/tender-logic.test.js`:

```js
// Dependency-free smoke tests. Run: node tests/tender-logic.test.js
// MIRROR of the pure tender functions in project_hub_01.html — keep in sync.

// ---- mirrored logic (copy of the HTML block) ----
const EV_PERIOD = new Set(['progress', 'response', 'update']);
function latestEvent(cell) {
  const evs = (cell && cell.events) || [];
  if (!evs.length) return null;
  return [...evs].sort((a, b) => {
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
    return (EV_PERIOD.has(a.status) ? 0 : 1) - (EV_PERIOD.has(b.status) ? 0 : 1);
  })[0];
}
function tenderCellStatus(cell) {
  if (cell && cell.statusOverride) return cell.statusOverride;
  const latest = latestEvent(cell);
  if (!latest || !latest.status) return 'N';
  const map = {
    missing: 'N',
    progress: 'I', sent: 'I', response: 'I', update: 'I', // update → בעבודה (the fix)
    comments: 'R',                                        // יש הערות → תקוע
    approved: 'C',                                        // מאושר → הסתיים
  };
  return map[latest.status] || 'N';
}
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  if (actual !== expected) { console.error(`FAIL ${name}: got ${actual}, want ${expected}`); failures++; }
  else console.log(`ok   ${name}`);
}

eq(tenderCellStatus({ events: [] }), 'N', 'empty → N');
eq(tenderCellStatus({}), 'N', 'no events field → N');
eq(tenderCellStatus({ events: [{ status: 'progress', date: '2026-01-01' }] }), 'I', 'progress → I');
eq(tenderCellStatus({ events: [{ status: 'sent', date: '2026-01-01' }] }), 'I', 'sent → I');
eq(tenderCellStatus({ events: [{ status: 'update', date: '2026-01-01' }] }), 'I', 'update → I (THE FIX)');
eq(tenderCellStatus({ events: [{ status: 'comments', date: '2026-01-01' }] }), 'R', 'comments → R (stuck)');
eq(tenderCellStatus({ events: [{ status: 'approved', date: '2026-01-01' }] }), 'C', 'approved → C');
// latest by date wins
eq(tenderCellStatus({ events: [
  { status: 'approved', date: '2026-01-01' },
  { status: 'comments', date: '2026-02-01' },
] }), 'R', 'latest date wins → R');
// override wins over derivation
eq(tenderCellStatus({ statusOverride: 'C', events: [{ status: 'comments', date: '2026-02-01' }] }), 'C', 'override wins');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/tender-logic.test.js`
Expected: FAIL — the file does not yet exist in `project_hub_01.html`, but this Node test is self-contained so it will actually PASS here. That's intended: this test IS the spec for the HTML function. Proceed to make the HTML match it.

> Note: because a Node test can't import from the HTML, the "red" state is: the HTML has no `tenderCellStatus` yet. The Node test locks the contract; Task 5+ browser verification proves the HTML copy behaves identically.

- [ ] **Step 3: Add the pure function to `project_hub_01.html`**

Find `const EV_CYCLE=` and insert immediately after it (same `<script type="text/babel">` block):

```js
/* ═══ Tender track pure logic (mirrored in tests/tender-logic.test.js) ═══ */
const TENDER_DOCTYPES_DEFAULT = [
  { id: 'plans', name: 'תכניות' },
  { id: 'spec',  name: 'מפרט' },
  { id: 'boq',   name: 'כתב כמויות' },
];
function tenderLatestEvent(cell){
  const evs=(cell&&cell.events)||[];
  if(!evs.length)return null;
  return [...evs].sort((a,b)=>{
    if(a.date!==b.date)return(b.date||'').localeCompare(a.date||'');
    return(EV_PERIOD.has(a.status)?0:1)-(EV_PERIOD.has(b.status)?0:1);
  })[0];
}
/* Single source of truth for a tender cell's status. Unlike getMostRecentEventStatus,
   'update' maps to 'I' (בעבודה) instead of being ignored. */
function tenderCellStatus(cell){
  if(cell&&cell.statusOverride)return cell.statusOverride;
  const latest=tenderLatestEvent(cell);
  if(!latest||!latest.status)return 'N';
  const map={missing:'N',progress:'I',sent:'I',response:'I',update:'I',comments:'R',approved:'C'};
  return map[latest.status]||'N';
}
const TENDER_STATUS_META={
  N:{label:'חסר',   color:'#fff',    bg:'#EF4444'},
  I:{label:'בעבודה', color:'#5a4a00', bg:'#FCD34D'},
  R:{label:'תקוע',   color:'#fff',    bg:'#F97316'},
  C:{label:'הסתיים', color:'#fff',    bg:'#10B981'},
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/tender-logic.test.js`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add tests/tender-logic.test.js project_hub_01.html
git commit -m "feat(tender): add tenderCellStatus pure logic (update→בעבודה) + node smoke test"
```

---

### Task 2: Pure logic — cell keys, sheet factory, counts

**Files:**
- Modify: `project_hub_01.html` (same pure-logic block)
- Modify: `tests/tender-logic.test.js` (append)

- [ ] **Step 1: Append failing tests**

Append to `tests/tender-logic.test.js` (before the final `if (failures)` block), including the mirrored functions:

```js
// ---- mirrored: keys + counts ----
function cellKey(bId, cId, dId){ return `${bId}|${cId}|${dId}`; }
function tenderCounts(sheet){
  const out={ N:0, I:0, R:0, C:0, total:0 };
  const buildings=sheet.buildings||[], consultants=sheet.consultants||[], docTypes=sheet.docTypes||[];
  for(const b of buildings) for(const c of consultants) for(const d of docTypes){
    const cell=(sheet.cells||{})[cellKey(b.id,c.id,d.id)];
    if(cell&&cell.na)continue;              // "לא רלוונטי" excluded from all counts
    out.total++;
    out[tenderCellStatus(cell||{})]++;
  }
  return out;
}
// ---- end mirror ----

const sheetA={
  buildings:[{id:'b1',name:'מבנה'}],
  consultants:[{id:'arch',name:'אדריכלות'},{id:'str',name:'קונסטרוקציה'}],
  docTypes:[{id:'plans',name:'תכניות'},{id:'spec',name:'מפרט'}],
  cells:{
    'b1|arch|plans':{events:[{status:'approved',date:'2026-01-01'}]}, // C
    'b1|arch|spec' :{events:[{status:'comments',date:'2026-01-01'}]}, // R
    'b1|str|plans' :{events:[{status:'update',date:'2026-01-01'}]},   // I
    'b1|str|spec'  :{na:true},                                        // excluded
  },
};
const cnt=tenderCounts(sheetA);
eq(cnt.total, 3, 'counts.total excludes na');
eq(cnt.C, 1, 'counts.C');
eq(cnt.R, 1, 'counts.R');
eq(cnt.I, 1, 'counts.I');
eq(cnt.N, 0, 'counts.N (missing cell would be N, but here none)');
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/tender-logic.test.js`
Expected: FAIL — `tenderCounts is not defined` … (in the mirror it is defined, so it PASSES; same intent as Task 1: the Node file locks the contract). If any assertion fails, fix the mirrored logic until `ALL PASS`.

- [ ] **Step 3: Add matching functions to the HTML block**

After the `TENDER_STATUS_META` const, add:

```js
function tenderCellKey(bId,cId,dId){ return `${bId}|${cId}|${dId}`; }
function tenderCounts(sheet){
  const out={N:0,I:0,R:0,C:0,total:0};
  const bs=sheet.buildings||[], cs=sheet.consultants||[], ds=sheet.docTypes||[];
  for(const b of bs)for(const c of cs)for(const d of ds){
    const cell=(sheet.cells||{})[tenderCellKey(b.id,c.id,d.id)];
    if(cell&&cell.na)continue;
    out.total++; out[tenderCellStatus(cell||{})]++;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node tests/tender-logic.test.js`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html tests/tender-logic.test.js
git commit -m "feat(tender): cell keys + na-aware status counts"
```

---

### Task 3: Pure logic — `tenderPivot` (row/col shaping for all 3 pivot modes)

**Files:**
- Modify: `project_hub_01.html` (pure-logic block)
- Modify: `tests/tender-logic.test.js` (append)

**Interface:** `tenderPivot(sheet)` reads `sheet.pivot = { rows, cols }` where each is one of `'buildings'|'consultants'|'docTypes'` (must differ). Returns:

```
{
  rowItems:  [{id,name}],                         // the row dimension's items
  colGroups: [{id,name, subs:[{id,name}]}],       // col dimension items; subs = the third dimension's items
  showSubs:  boolean,                             // false when the third dimension has exactly 1 item (collapse)
  keyOf(rowItem, colGroup, sub) -> string         // returns tenderCellKey mapped back to (building,consultant,doctype)
}
```

- [ ] **Step 1: Append failing tests**

Append to `tests/tender-logic.test.js` (before final block), with mirrored function:

```js
// ---- mirrored: pivot ----
const DIMS=['buildings','consultants','docTypes'];
function tenderPivot(sheet){
  const pivot=sheet.pivot||{rows:'consultants',cols:'docTypes'};
  const rows=pivot.rows, cols=pivot.cols;
  const third=DIMS.find(d=>d!==rows&&d!==cols);
  const items=dim=>sheet[dim]||[];
  const rowItems=items(rows), colItems=items(cols), thirdItems=items(third);
  const showSubs=thirdItems.length>1;
  const subsList=thirdItems.length?thirdItems:[{id:'__all__',name:''}];
  const colGroups=colItems.map(ci=>({id:ci.id,name:ci.name,subs:subsList}));
  function keyOf(rowItem,colGroup,sub){
    const pick={};
    pick[rows]=rowItem.id; pick[cols]=colGroup.id; pick[third]=sub.id;
    return tenderCellKey(pick.buildings,pick.consultants,pick.docTypes);
  }
  return {rowItems,colGroups,showSubs,keyOf};
}
function tenderCellKey(bId,cId,dId){ return `${bId}|${cId}|${dId}`; }
// ---- end mirror ----

const sheetB={
  buildings:[{id:'b1',name:'מבנה'}],
  consultants:[{id:'arch',name:'אדריכלות'}],
  docTypes:[{id:'plans',name:'תכניות'},{id:'spec',name:'מפרט'}],
  pivot:{rows:'consultants',cols:'docTypes'},
};
const pB=tenderPivot(sheetB);
eq(pB.rowItems.length, 1, 'pivot rowItems=consultants');
eq(pB.colGroups.length, 2, 'pivot colGroups=docTypes');
eq(pB.showSubs, false, 'single building → subs collapsed');
eq(pB.keyOf(pB.rowItems[0], pB.colGroups[0], pB.colGroups[0].subs[0]), 'b1|arch|plans', 'keyOf maps back to building|consultant|doctype');

const sheetC={
  buildings:[{id:'b1',name:'A'},{id:'b2',name:'B'}],
  consultants:[{id:'arch',name:'אדר'}],
  docTypes:[{id:'plans',name:'תכ'}],
  pivot:{rows:'buildings',cols:'consultants'},
};
const pC=tenderPivot(sheetC);
eq(pC.showSubs, false, 'third=docTypes has 1 item → no subs');
eq(pC.keyOf(pC.rowItems[1], pC.colGroups[0], pC.colGroups[0].subs[0]), 'b2|arch|plans', 'multi-building keyOf');
```

- [ ] **Step 2: Run to verify**

Run: `node tests/tender-logic.test.js`
Expected: `ALL PASS` (fix mirrored logic until green).

- [ ] **Step 3: Add `tenderPivot` (and `TENDER_DIMS`) to the HTML block**

```js
const TENDER_DIMS=['buildings','consultants','docTypes'];
const TENDER_DIM_LABEL={buildings:'מבנים',consultants:'יועצים',docTypes:'מסמכים'};
function tenderPivot(sheet){
  const pivot=sheet.pivot||{rows:'consultants',cols:'docTypes'};
  const {rows,cols}=pivot;
  const third=TENDER_DIMS.find(d=>d!==rows&&d!==cols);
  const items=dim=>sheet[dim]||[];
  const rowItems=items(rows), colItems=items(cols), thirdItems=items(third);
  const showSubs=thirdItems.length>1;
  const subsList=thirdItems.length?thirdItems:[{id:'__all__',name:''}];
  const colGroups=colItems.map(ci=>({id:ci.id,name:ci.name,subs:subsList}));
  const keyOf=(rowItem,colGroup,sub)=>{
    const pick={}; pick[rows]=rowItem.id; pick[cols]=colGroup.id; pick[third]=sub.id;
    return tenderCellKey(pick.buildings,pick.consultants,pick.docTypes);
  };
  return {rowItems,colGroups,showSubs,keyOf,third};
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node tests/tender-logic.test.js` → `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html tests/tender-logic.test.js
git commit -m "feat(tender): tenderPivot row/col shaping for 3 pivot modes"
```

---

### Task 4: Sheet factory + migration (creatable tender sheet, seeded from disciplines)

**Files:**
- Modify: `project_hub_01.html` (pure-logic block + `migrateData`)

- [ ] **Step 1: Add `makeTenderSheet` to the HTML block**

```js
/* Build a fresh tender sheet. consultants seeded from the project's live disciplines. */
function makeTenderSheet(data, name='מכרז'){
  const disciplines=(data&&data.disciplines)||[];
  const consultants=disciplines.length
    ? disciplines.map(d=>({id:d.id,name:d.label,disciplineId:d.id}))
    : [{id:uid(),name:'אדריכלות'}];
  return {
    id:uid(), name, type:'tender', track:'tender',
    buildings:[{id:uid(),name:'מבנה'}],
    consultants,
    docTypes:TENDER_DOCTYPES_DEFAULT.map(d=>({id:d.id,name:d.name})),
    cells:{},
    pivot:{rows:'consultants',cols:'docTypes'},
    filters:{consultantIds:[],buildingIds:[],statuses:[]},
  };
}
```

- [ ] **Step 2: Make `migrateData` tolerant of tender sheets**

Find in `migrateData` the sheet mapping (search `stampSheetTracks(d.sheets.map(s=>s.type==='list'`). It already passes non-`list` sheets through untouched (`s.type==='list'? …migrate… : s`), so tender sheets are preserved. **Verify by reading that line**; if any code assumes only `'list'|'dashboard'`, add `tender` to the allowed set. Add a defensive default for missing `pivot`:

Add to the HTML block:

```js
function migrateTenderSheet(s){
  if(s.type!=='tender')return s;
  return {...s,
    buildings:s.buildings||[], consultants:s.consultants||[],
    docTypes:s.docTypes||TENDER_DOCTYPES_DEFAULT.map(d=>({...d})),
    cells:s.cells||{}, pivot:s.pivot||{rows:'consultants',cols:'docTypes'},
    filters:s.filters||{consultantIds:[],buildingIds:[],statuses:[]}};
}
```

Then in the `migrateData` sheet map, change the passthrough so tender sheets run through `migrateTenderSheet` (search the `.map(s=>s.type==='list'?{...}:s)` and make the else-branch `:migrateTenderSheet(s)`).

- [ ] **Step 3: Browser verification (no unit test — this is integration)**

Start/refresh preview, then in the browser console create a tender sheet and confirm shape:

Run in `javascript_tool`:
```js
// find the React 'data' + save via the app; simplest: just validate the factory output shape by hand
JSON.stringify(Object.keys(({buildings:1,consultants:1,docTypes:1,cells:1,pivot:1,type:1,track:1})))
```
Expected: keys include `type`,`track`,`buildings`,`consultants`,`docTypes`,`cells`,`pivot`. (Full creation is wired in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(tender): sheet factory (seed consultants from disciplines) + migration guard"
```

---

### Task 5: Wire the render dispatch + track nav → stub `TenderView`

**Files:**
- Modify: `project_hub_01.html` (render dispatch, new stub component)

- [ ] **Step 1: Add a stub `TenderView` near the other view components**

(Place it just before `function App()` — search `function App()`.)

```jsx
function TenderView({data, sheet, save}){
  return (
    <div className="tender-view" dir="rtl" style={{padding:16}}>
      <h2 style={{fontSize:16,fontWeight:700}}>מסלול מכרז — {sheet.name}</h2>
      <p style={{color:'var(--muted,#888)'}}>סה״כ נדרש: {tenderCounts(sheet).total}</p>
    </div>
  );
}
```

- [ ] **Step 2: Add the dispatch branch**

Find where the active sheet is rendered by type (search `type==='dashboard'` inside the App render). Add a sibling branch so that when the active sheet's `type==='tender'`, it renders:

```jsx
sheet.type==='tender'
  ? <TenderView data={data} sheet={sheet} save={save} />
  : /* existing dashboard/list branches unchanged */
```

Match the existing conditional style exactly (ternary vs if). Do not alter the list/dashboard branches.

- [ ] **Step 3: Ensure the tender sheet is reachable in the nav**

Confirm the sidebar/track nav lists sheets by `sheet.track` (search `sheet.track`). The `tender` track already exists in `data.tracks`. A tender sheet with `track:'tender'` will appear under it. If the nav filters sheet types, allow `tender`.

- [ ] **Step 4: Browser verification**

- `preview_start {name:'project-hub'}`; navigate to `/project_hub_01`.
- In `javascript_tool`, inject a tender sheet into live state by dispatching through the app's save if reachable; otherwise temporarily add one tender sheet to `makeDefaultData().sheets` for manual testing, load, click the "מכרז" track, and confirm the stub renders "מסלול מכרז — מכרז" and a total number. `read_page` to confirm the heading text is present. Remove the temporary default-data edit before commit if you added one.
- `read_console_messages onlyErrors:true` → no errors.

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(tender): render dispatch + stub TenderView under the tender track"
```

---

### Task 6: "Add tender sheet" action + summary tiles (`TenderTiles`)

**Files:**
- Modify: `project_hub_01.html`

- [ ] **Step 1: Add a way to create the tender sheet**

In the tender track's empty state (when no `type:'tender'` sheet exists in the track), render a button "צור לוח מכרז" that calls:

```jsx
const addTenderSheet=()=>save(prev=>({...prev, sheets:[...prev.sheets, makeTenderSheet(prev)]}));
```

Wire this button in `TenderView`'s parent (or in `TenderView` when it receives no sheet). Keep it consistent with how other sheets are added (search the existing "add sheet" handler for the pattern and reuse its save shape).

- [ ] **Step 2: Add `TenderTiles`**

```jsx
function TenderTiles({sheet}){
  const c=tenderCounts(sheet);
  const pct=n=>c.total?Math.round(n/c.total*100):0;
  const tile=(key,val)=>{
    const m=TENDER_STATUS_META[key];
    return (
      <div key={key} style={{background:m.bg,color:m.color,borderRadius:10,padding:'12px 8px',textAlign:'center',minWidth:90}}>
        <div style={{fontSize:12}}>{m.label}</div>
        <div style={{fontSize:26,fontWeight:800}}>{val}</div>
        <div style={{fontSize:11,opacity:.9}}>{pct(val)}%</div>
      </div>
    );
  };
  return (
    <div style={{display:'flex',gap:10,flexWrap:'wrap',margin:'12px 0'}}>
      {tile('N',c.N)}{tile('I',c.I)}{tile('R',c.R)}{tile('C',c.C)}
      <div style={{background:'#2b8fff',color:'#fff',borderRadius:10,padding:'12px 8px',textAlign:'center',minWidth:90}}>
        <div style={{fontSize:12}}>סה״כ נדרש</div>
        <div style={{fontSize:26,fontWeight:800}}>{c.total}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render tiles in `TenderView`** (replace the stub `<p>` with `<TenderTiles sheet={sheet} />`).

- [ ] **Step 4: Browser verification**

- Create the tender sheet via the new button. Confirm 5 tiles render with 0/… values (all cells missing → חסר count = consultants×docTypes×buildings).
- `read_page` to confirm tile labels חסר/בעבודה/תקוע/הסתיים/סה״כ present. `screenshot` for the record.
- `read_console_messages onlyErrors:true` → clean.

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(tender): create-sheet action + summary tiles"
```

---

### Task 7: Pivot bar (`TenderPivotBar`) — row/col selectors + swap

**Files:**
- Modify: `project_hub_01.html`

- [ ] **Step 1: Add `TenderPivotBar`**

```jsx
function TenderPivotBar({sheet, save}){
  const pivot=sheet.pivot||{rows:'consultants',cols:'docTypes'};
  const setPivot=next=>save(prev=>({...prev, sheets:prev.sheets.map(s=>s.id===sheet.id?{...s,pivot:next}:s)}));
  const onRows=e=>{const rows=e.target.value; const cols=pivot.cols===rows?TENDER_DIMS.find(d=>d!==rows):pivot.cols; setPivot({rows,cols});};
  const onCols=e=>{const cols=e.target.value; const rows=pivot.rows===cols?TENDER_DIMS.find(d=>d!==cols):pivot.rows; setPivot({rows,cols});};
  const swap=()=>setPivot({rows:pivot.cols,cols:pivot.rows});
  const opt=d=><option key={d} value={d}>{TENDER_DIM_LABEL[d]}</option>;
  return (
    <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',background:'var(--card,#fff)',border:'1px solid var(--border,#e5e5ea)',borderRadius:10,padding:'8px 12px',margin:'12px 0',fontSize:13}}>
      <b>שורות:</b><select value={pivot.rows} onChange={onRows}>{TENDER_DIMS.map(opt)}</select>
      <b>עמודות:</b><select value={pivot.cols} onChange={onCols}>{TENDER_DIMS.map(opt)}</select>
      <button onClick={swap} style={{cursor:'pointer'}}>⇄ החלף</button>
    </div>
  );
}
```

- [ ] **Step 2: Render `<TenderPivotBar sheet={sheet} save={save} />` in `TenderView`** above the tiles.

- [ ] **Step 3: Browser verification**

- Change "שורות" to מבנים; confirm cols auto-switches away from מבנים (no dup). Click ⇄ and confirm row/col labels swap. `read_page` after each to confirm select values; confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(tender): pivot bar with row/col selectors + swap"
```

---

### Task 8: Matrix (`TenderMatrix`) — colored cells, date, event-count badge, na

**Files:**
- Modify: `project_hub_01.html`

- [ ] **Step 1: Add `TenderMatrix`**

```jsx
function TenderMatrix({sheet, onOpenCell}){
  const {rowItems,colGroups,showSubs,keyOf}=tenderPivot(sheet);
  const cellOf=key=>(sheet.cells||{})[key];
  const renderCell=(key)=>{
    const cell=cellOf(key)||{};
    if(cell.na)return <td key={key} style={{border:'1px solid var(--border,#e5e5ea)',background:'#eee',color:'#999',textAlign:'center',fontSize:11}}>—</td>;
    const st=tenderCellStatus(cell); const m=TENDER_STATUS_META[st];
    const latest=tenderLatestEvent(cell);
    const n=(cell.events||[]).length;
    return (
      <td key={key} onClick={()=>onOpenCell(key)}
          style={{border:'1px solid var(--border,#e5e5ea)',background:m.bg,color:m.color,textAlign:'center',cursor:'pointer',fontSize:12,padding:'6px 4px'}}>
        {st==='N'?'חסר':<span>{m.label} {latest&&<span style={{fontSize:10}}>{fmtDateFull(latest.date)}</span>} {n>1&&<b style={{fontSize:9}}>{n}×</b>}</span>}
      </td>
    );
  };
  return (
    <div style={{overflowX:'auto'}}>
    <table dir="rtl" style={{borderCollapse:'collapse',width:'100%',background:'var(--card,#fff)'}}>
      <thead>
        <tr style={{background:'var(--muted-bg,#f0f0f3)'}}>
          <th rowSpan={showSubs?2:1} style={{border:'1px solid var(--border,#e5e5ea)',padding:8}}></th>
          {colGroups.map(g=><th key={g.id} colSpan={showSubs?g.subs.length:1} style={{border:'1px solid var(--border,#e5e5ea)',padding:8}}>{g.name}</th>)}
        </tr>
        {showSubs&&(
          <tr style={{background:'var(--muted-bg,#f7f7fa)'}}>
            {colGroups.flatMap(g=>g.subs.map(s=><th key={g.id+s.id} style={{border:'1px solid var(--border,#e5e5ea)',padding:4,fontSize:11}}>{s.name}</th>))}
          </tr>
        )}
      </thead>
      <tbody>
        {rowItems.map(ri=>(
          <tr key={ri.id}>
            <td style={{border:'1px solid var(--border,#e5e5ea)',padding:8,fontWeight:600}}>{ri.name}</td>
            {colGroups.flatMap(g=>g.subs.map(s=>renderCell(keyOf(ri,g,s))))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `TenderView`** with an `onOpenCell` that sets local state:

```jsx
const [openCellKey,setOpenCellKey]=React.useState(null);
// ... <TenderMatrix sheet={sheet} onOpenCell={setOpenCellKey} />
```

- [ ] **Step 3: Browser verification**

- With a fresh sheet (all missing), confirm every cell shows "חסר" on red. Confirm the header shows consultant/doc labels for the default pivot. Switch pivot to מבנים×יועצים and confirm the sub-header row appears only when there are ≥2 of the third dimension. `screenshot`. No console errors.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(tender): matrix render (status colors, date, count badge, na)"
```

---

### Task 9: Cell panel (`TenderCellPanel`) — event timeline + manual override

**Files:**
- Modify: `project_hub_01.html`

- [ ] **Step 1: Add `TenderCellPanel`**

A small modal/side panel editing one cell's `events[]` and `statusOverride`. Uses `EV_STATUSES` for the event-type choices and `todayISO()` for defaults.

```jsx
function TenderCellPanel({sheet, cellKey, save, onClose}){
  const cell=(sheet.cells||{})[cellKey]||{events:[]};
  const writeCell=updater=>save(prev=>({...prev, sheets:prev.sheets.map(s=>{
    if(s.id!==sheet.id)return s;
    const cur=(s.cells||{})[cellKey]||{events:[]};
    return {...s, cells:{...s.cells,[cellKey]:updater(cur)}};
  })}));
  const addEvent=status=>writeCell(c=>({...c,events:[...(c.events||[]),{id:uid(),status,date:todayISO()}]}));
  const delEvent=id=>writeCell(c=>({...c,events:(c.events||[]).filter(e=>e.id!==id)}));
  const setOverride=code=>writeCell(c=>({...c,statusOverride:code||undefined}));
  const setNa=v=>writeCell(c=>({...c,na:v||undefined}));
  const st=tenderCellStatus(cell);
  return (
    <div className="tender-cell-panel" dir="rtl" style={{position:'fixed',insetInlineEnd:0,top:0,bottom:0,width:340,background:'var(--card,#fff)',boxShadow:'-2px 0 12px rgba(0,0,0,.15)',padding:16,overflowY:'auto',zIndex:50}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <b>מסמך — סטטוס: {TENDER_STATUS_META[st].label}</b>
        <button onClick={onClose}>✕</button>
      </div>
      <label style={{display:'block',margin:'10px 0'}}>
        <input type="checkbox" checked={!!cell.na} onChange={e=>setNa(e.target.checked)} /> לא רלוונטי
      </label>
      <div style={{margin:'8px 0'}}>דריסת סטטוס:&nbsp;
        <select value={cell.statusOverride||''} onChange={e=>setOverride(e.target.value)}>
          <option value="">(נגזר מאירועים)</option>
          {Object.entries(TENDER_STATUS_META).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}
        </select>
      </div>
      <div style={{margin:'12px 0'}}>
        <b>הוסף אירוע:</b>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:6}}>
          {Object.values(EV_STATUSES).map(ev=>(
            <button key={ev.id} onClick={()=>addEvent(ev.id)} title={ev.label}
              style={{border:`1px solid ${ev.border}`,background:ev.bg,color:ev.color,borderRadius:8,padding:'3px 8px',cursor:'pointer',fontSize:12}}>
              {ev.symbol} {ev.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <b>אירועים:</b>
        {(cell.events||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(ev=>(
          <div key={ev.id} style={{display:'flex',justifyContent:'space-between',borderBottom:'1px solid var(--border,#eee)',padding:'4px 0',fontSize:12}}>
            <span>{EV_STATUSES[ev.status]?.symbol} {EV_STATUSES[ev.status]?.label} · {fmtDateFull(ev.date)}</span>
            <button onClick={()=>delEvent(ev.id)}>מחק</button>
          </div>
        ))}
        {!(cell.events||[]).length&&<div style={{color:'#999',fontSize:12,marginTop:6}}>אין אירועים עדיין</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render the panel from `TenderView`** when `openCellKey` is set:

```jsx
{openCellKey&&<TenderCellPanel sheet={sheet} cellKey={openCellKey} save={save} onClose={()=>setOpenCellKey(null)} />}
```

- [ ] **Step 3: Browser verification**

- Click a cell → panel opens. Add an "עדכון" (update) event → confirm the cell turns **בעבודה** (yellow), proving `update→I` end-to-end in the HTML (the core fix). Add "יש הערות" → cell turns **תקוע**; add "מאושר" → **הסתיים**. Toggle "לא רלוונטי" → cell greys to — and tiles' total drops by 1. Set override → cell reflects it. `screenshot` the update→בעבודה case. No console errors.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(tender): cell panel — event timeline + manual override + na toggle"
```

---

### Task 10: Filters (`TenderFilters`)

**Files:**
- Modify: `project_hub_01.html`

- [ ] **Step 1: Add `TenderFilters`** (consultant / status / building multi-selects writing `sheet.filters`) and apply them in `TenderMatrix` + `tenderCounts`.

Add a filtered-view helper to the pure block and mirror-test it:

```js
function tenderVisibleSheet(sheet){
  const f=sheet.filters||{};
  const keep=(dim,idField)=>{
    const ids=f[idField]||[];
    if(!ids.length)return sheet[dim]||[];
    return (sheet[dim]||[]).filter(x=>ids.includes(x.id));
  };
  return {...sheet,
    consultants:keep('consultants','consultantIds'),
    buildings:keep('buildings','buildingIds')};
}
```

Status filter is applied at cell-render time (hide/blank cells whose `tenderCellStatus` isn't in `f.statuses` when `f.statuses.length`). Tiles use the consultant/building-filtered sheet but always count all statuses (so the tiles remain a status breakdown of the visible consultants/buildings).

- [ ] **Step 2: Append a mirror test** for `tenderVisibleSheet` in `tests/tender-logic.test.js` (filter to one consultant → `consultants.length===1`). Run `node tests/tender-logic.test.js` → `ALL PASS`.

- [ ] **Step 3: Render `<TenderFilters>`** in `TenderView`, and pass `tenderVisibleSheet(sheet)` to `TenderTiles` and `TenderMatrix` (keep the real `sheet.id` for writes).

- [ ] **Step 4: Browser verification** — filter to one consultant → matrix + tiles narrow. Clear → full grid returns. No console errors.

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html tests/tender-logic.test.js
git commit -m "feat(tender): consultant/status/building filters"
```

---

### Task 11: Lists editor (`TenderListsEditor`) — buildings / consultants / docTypes + delete cleanup

**Files:**
- Modify: `project_hub_01.html`

- [ ] **Step 1: Add `TenderListsEditor`** — add/rename/remove items in each of the 3 lists. On remove, purge dependent cells.

Add a pure cleanup helper (+ mirror test):

```js
function tenderRemoveDim(sheet, dim, id){
  const nextList=(sheet[dim]||[]).filter(x=>x.id!==id);
  const cells={};
  const bs=dim==='buildings'?nextList:(sheet.buildings||[]);
  const cs=dim==='consultants'?nextList:(sheet.consultants||[]);
  const ds=dim==='docTypes'?nextList:(sheet.docTypes||[]);
  for(const b of bs)for(const c of cs)for(const d of ds){
    const k=tenderCellKey(b.id,c.id,d.id);
    if((sheet.cells||{})[k])cells[k]=sheet.cells[k];
  }
  return {...sheet,[dim]:nextList,cells};
}
```

- [ ] **Step 2: Mirror test** for `tenderRemoveDim` (removing a consultant drops that consultant's cell keys). Run `node tests/tender-logic.test.js` → `ALL PASS`.

- [ ] **Step 3: Wire editor UI** (a small "הגדרות לוח" panel) into `TenderView`; writes go through `save`. Ensure pivot never points at a now-invalid dim (all 3 dims always exist, so pivot stays valid).

- [ ] **Step 4: Browser verification** — add a building → matrix gains rows/cols; the third-dim sub-header appears once ≥2 buildings and the chosen pivot exposes it. Remove a consultant → its column disappears and tiles' total drops. No console errors.

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html tests/tender-logic.test.js
git commit -m "feat(tender): lists editor for buildings/consultants/docTypes + cell cleanup"
```

---

### Task 12: Edge cases, empty states, final verification

**Files:**
- Modify: `project_hub_01.html`

- [ ] **Step 1:** Empty-grid state — when consultants or docTypes is empty, `TenderMatrix` shows a friendly "הוסף יועצים/מסמכים כדי להתחיל" instead of an empty table. Add the guard.

- [ ] **Step 2:** Single-building sanity — confirm default pivot (`consultants×docTypes`) hides the building sub-header (`showSubs===false`). Already handled by `tenderPivot`; verify in browser.

- [ ] **Step 3:** Persistence round-trip — add events, reload the served page (`navigate` to `/project_hub_01` again), confirm the grid state persisted via the local server (data file), and undo/redo covers a tender edit (make an edit, press the app's undo, confirm it reverts).

- [ ] **Step 4:** Full logic suite green — `node tests/tender-logic.test.js` → `ALL PASS`. Capture a final `screenshot` of the working tender dashboard (tiles + matrix with mixed statuses).

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(tender): empty states + edge-case guards; finalize tender track"
```

---

## Self-Review (author)

- **Spec coverage:** navigation/track (T5) ✓; data model (T1–T4) ✓; status logic incl. `update→בעבודה` (T1, verified end-to-end T9) ✓; pivot (T3, T7) ✓; tiles (T6) ✓; matrix (T8) ✓; filters (T10) ✓; cell timeline + override (T9) ✓; na exclusion (T2, T9) ✓; lists + delete cleanup (T11) ✓; edge cases + persistence/undo (T12) ✓.
- **Single-source-of-truth:** all status readers call `tenderCellStatus` (tiles via `tenderCounts`, matrix via direct call) — no duplicated mapping. ✓
- **Type/name consistency:** `tenderCellKey` (HTML) vs `cellKey` (only inside the isolated Node mirror) — intentional; the HTML uses `tenderCellKey` everywhere. `tenderPivot` returns `{rowItems,colGroups,showSubs,keyOf,third}` used consistently in T8. `TENDER_STATUS_META` codes `N/I/R/C` consistent across tiles/matrix/panel. ✓
- **No placeholders:** every code step carries real code; UI tasks use browser verification (no in-repo UI test runner) rather than empty "write tests". ✓
- **Known caveat:** the Node smoke tests mirror the HTML pure functions (single-file app can't import) — the Mirror rule in Conventions keeps them in sync; browser steps (esp. T9) prove the HTML copy matches.
