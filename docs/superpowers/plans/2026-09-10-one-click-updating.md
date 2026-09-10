# One-Click Updating (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logging a status update costs one deliberate click on every surface, and tasks with no updates gain a row-level entry point.

**Architecture:** Three components today write the same `events[]` record with three different interaction models and two different guesses for the next status. This plan extracts the shared decision into pure helpers (`latestUpdateOf`, `suggestedStatusFor`, `appendUpdate`) plus one presentational component (`QuickUpdatePills`), then rewires all three callers to it. The stored record shape does not change, so the Gantt, day-counts and delay outlines keep working untouched.

**Tech Stack:** Single-file React 18 app using `React.createElement` (no JSX, no build step). Dependency-free Node smoke tests. Local Node static server.

---

## Working method (read before Task 1)

`project_hub_01.html` is ~777KB with long minified-style lines and **mixed line endings** — content checked out from git uses `\r\n`, content added in later sessions is `\n`-only. Editing by hand or by naive search is how this file gets corrupted. Every edit in this plan uses a Node script with this helper:

```js
const fs=require('fs');
const FILE='C:/Users/Omega/Database/project_hub_01.html';
let s=fs.readFileSync(FILE,'utf8');
function mustReplace(oldStr,newStr,label){
  const cnt=s.split(oldStr).length-1;
  if(cnt!==1) throw new Error(`NOT UNIQUE (count=${cnt}) for ${label}`);
  s=s.replace(oldStr,newStr);
}
// ... mustReplace calls ...
fs.writeFileSync(FILE,s,'utf8');
console.log('DONE',s.length);
```

`mustReplace` throws unless the anchor matches **exactly once** — that is the safety net. If it throws with `count=0`, the anchor's line endings are wrong: print the real bytes with
`node -e "const s=require('fs').readFileSync('C:/Users/Omega/Database/project_hub_01.html','utf8');const i=s.indexOf('<a distinctive substring>');console.log(JSON.stringify(s.slice(i-80,i+200)))"`
and rebuild the anchor from what it prints.

**After every edit**, validate syntax by extracting the largest `<script>` block and running `node --check`:

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('C:/Users/Omega/Database/project_hub_01.html','utf8');let i=0,b=null;while(true){const st=s.indexOf('<script',i);if(st===-1)break;const o=s.indexOf('>',st)+1;const e=s.indexOf('</script>',o);if(!b||e-o>b.len)b={o,e,len:e-o};i=e+1}fs.writeFileSync('/tmp/app.js',s.slice(b.o,b.e))"
node --check /tmp/app.js && echo SYNTAX_OK
```

On Windows use `%TEMP%\app.js` instead of `/tmp/app.js`.

**Browser verification** (used from Task 2 onward):

```bash
node tools/local-server/server.js "C:\Users\Omega\Database" --port 3403
```

then open `http://localhost:3403/project_hub_01.html`. The tender board is at sidebar → **מסלול מכרז**; the task list at sidebar → **ניהול תכנון**.

**Mirror rule:** `tests/*.test.js` files contain their own copy of the pure functions (no import is possible from an HTML file). If you change a pure function in the HTML, update the mirror in the same commit.

---

## File Structure

- **Modify** `project_hub_01.html` — all six changes below live here. Ordered by dependency: pure helpers first (used by everything), then the shared component, then its three callers.
- **Create** `tests/quick-update.test.js` — Node smoke tests for the new pure helpers, mirroring them per the mirror rule.

No other files change. `tests/tender-logic.test.js` keeps passing untouched: Task 1 changes `tenderLatestEvent`'s *implementation* to delegate, not its behavior.

---

### Task 1: Pure helpers for suggestion and append

**Files:**
- Create: `tests/quick-update.test.js`
- Modify: `project_hub_01.html` (insert after `getNextSuggestedStatus`)

The three surfaces each sort events to find the latest one, and two of them then disagree about what to suggest. This task creates one implementation of both decisions.

- [ ] **Step 1: Write the failing test**

Create `tests/quick-update.test.js`:

```js
// Dependency-free smoke tests. Run: node tests/quick-update.test.js
// MIRROR of the pure quick-update helpers in project_hub_01.html — keep in sync.

// ---- mirrored logic (copy of the HTML block) ----
// (intentionally empty for Step 1 — the assertions below must fail first)
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  if (actual !== expected) { console.error(`FAIL ${name}: got ${actual}, want ${expected}`); failures++; }
  else console.log(`ok   ${name}`);
}

// latestUpdateOf — newest date wins; on a tie an open (period) status outranks a milestone
eq(latestUpdateOf([]), null, 'latest: no events → null');
eq(latestUpdateOf(undefined), null, 'latest: undefined → null');
eq(latestUpdateOf([{id:'a',status:'sent',date:'2026-01-01'}]).id, 'a', 'latest: single event');
eq(latestUpdateOf([
  {id:'a',status:'sent',date:'2026-01-01'},
  {id:'b',status:'progress',date:'2026-02-01'},
]).id, 'b', 'latest: newest date wins');
eq(latestUpdateOf([
  {id:'a',status:'sent',date:'2026-03-01'},
  {id:'b',status:'progress',date:'2026-03-01'},
]).id, 'b', 'latest: same date → period status outranks milestone');

// suggestedStatusFor — the NEXT step, never a repeat of the current one
eq(suggestedStatusFor([]), 'progress', 'suggest: no events → progress');
eq(suggestedStatusFor([{id:'a',status:'progress',date:'2026-01-01'}]), 'sent', 'suggest: progress → sent');
eq(suggestedStatusFor([{id:'a',status:'sent',date:'2026-01-01'}]), 'response', 'suggest: sent → response');
eq(suggestedStatusFor([{id:'a',status:'response',date:'2026-01-01'}]), 'sent', 'suggest: response → sent');
eq(suggestedStatusFor([{id:'a',status:'comments',date:'2026-01-01'}]), 'progress', 'suggest: comments → progress');
eq(suggestedStatusFor([{id:'a',status:'approved',date:'2026-01-01'}]), 'progress', 'suggest: approved → progress');
eq(suggestedStatusFor([{id:'a',status:'missing',date:'2026-01-01'}]), 'progress', 'suggest: missing → progress');
eq(suggestedStatusFor([
  {id:'a',status:'progress',date:'2026-01-01'},
  {id:'b',status:'sent',date:'2026-02-01'},
]), 'response', 'suggest: reads the latest event, not the first');

// appendUpdate — always appends, never prepends, never mutates
const base = [{id:'a',status:'sent',date:'2026-01-01'}];
const out = appendUpdate(base, {id:'b',status:'progress',date:'2026-02-01'});
eq(out.length, 2, 'append: length grows');
eq(out[1].id, 'b', 'append: new record goes last');
eq(base.length, 1, 'append: source array not mutated');
eq(appendUpdate(undefined, {id:'z'}).length, 1, 'append: undefined events → single-item array');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/quick-update.test.js`
Expected: `ReferenceError: latestUpdateOf is not defined`

- [ ] **Step 3: Fill in the mirrored implementation in the test file**

Replace the placeholder mirror block in `tests/quick-update.test.js` with:

```js
// ---- mirrored logic (copy of the HTML block) ----
const EV_PERIOD = new Set(['progress', 'response', 'update']);
function getNextSuggestedStatus(lastStatus){
  if(!lastStatus) return 'progress';
  const map = {missing:'progress',progress:'sent',sent:'response',response:'sent',comments:'progress',approved:'progress'};
  return map[lastStatus] || 'progress';
}
function latestUpdateOf(events){
  const evs = events || [];
  if(!evs.length) return null;
  return [...evs].sort((a,b)=>{
    if(a.date !== b.date) return (b.date||'').localeCompare(a.date||'');
    return (EV_PERIOD.has(a.status)?0:1) - (EV_PERIOD.has(b.status)?0:1);
  })[0];
}
function suggestedStatusFor(events){
  return getNextSuggestedStatus(latestUpdateOf(events)?.status);
}
function appendUpdate(events, rec){
  return [...(events||[]), rec];
}
// ---- end mirrored logic ----
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/quick-update.test.js`
Expected: every line `ok ...`, then `ALL PASS`

- [ ] **Step 5: Add the same three helpers to the HTML**

Run this Node script (using the `mustReplace` scaffold from *Working method*):

```js
mustReplace(
  "function getNextSuggestedStatus(lastStatus){",
  "function latestUpdateOf(events){const evs=events||[];if(!evs.length)return null;return[...evs].sort((a,b)=>{if(a.date!==b.date)return(b.date||'').localeCompare(a.date||'');return(EV_PERIOD.has(a.status)?0:1)-(EV_PERIOD.has(b.status)?0:1);})[0];}\r\n"+
  "function suggestedStatusFor(events){return getNextSuggestedStatus(latestUpdateOf(events)?.status);}\r\n"+
  "function appendUpdate(events,rec){return[...(events||[]),rec];}\r\n"+
  "function getNextSuggestedStatus(lastStatus){",
  'insert quick-update helpers'
);
```

- [ ] **Step 6: Make `tenderLatestEvent` delegate instead of re-sorting**

Same script, second call. This removes the duplicated sort; behavior is identical, so `tests/tender-logic.test.js` stays valid untouched.

```js
mustReplace(
  "function tenderLatestEvent(cell){\r\n  const evs=(cell&&cell.events)||[];\r\n  if(!evs.length)return null;\r\n  return [...evs].sort((a,b)=>{\r\n    if(a.date!==b.date)return(b.date||'').localeCompare(a.date||'');\r\n    return(EV_PERIOD.has(a.status)?0:1)-(EV_PERIOD.has(b.status)?0:1);\r\n  })[0];\r\n}",
  "function tenderLatestEvent(cell){return latestUpdateOf((cell&&cell.events)||[]);}",
  'tenderLatestEvent delegates to latestUpdateOf'
);
```

If this throws `count=0`, print the real bytes as described in *Working method* and rebuild the anchor.

- [ ] **Step 7: Verify syntax and the existing suite**

Run the `node --check` extraction from *Working method*.
Expected: `SYNTAX_OK`

Run: `node tests/tender-logic.test.js`
Expected: `ALL PASS`

- [ ] **Step 8: Commit**

```bash
git add project_hub_01.html tests/quick-update.test.js
git commit -m "refactor: single source for the next-status suggestion and update append

Three surfaces each sorted events to find the latest one and two of them
disagreed about what to suggest next. latestUpdateOf/suggestedStatusFor/
appendUpdate hold both decisions once; tenderLatestEvent now delegates
rather than keeping a third copy of the same sort."
```

---

### Task 2: `QuickUpdatePills` component, proven on the tender panel

**Files:**
- Modify: `project_hub_01.html` (insert component before `function TenderCellPanel(`; rewire its status buttons)

`TenderCellPanel` already logs in one click, so it is the lowest-risk place to introduce the component. It gains the suggestion highlight it does not have today.

- [ ] **Step 1: Add the component**

```js
mustReplace(
  "function TenderCellPanel({sheet,cellKey,save,onClose}){",
  `/* Shared one-click update strip. Clicking a pill IS the save: the caller
   writes {id,status,date:todayISO(),assignee} and appends it via appendUpdate,
   then opens that entry for optional refinement. The suggested next status is
   emphasized, never the current one. */
function QuickUpdatePills({events,onAdd,includeMissing=false,compact=false}){
  const suggested=suggestedStatusFor(events);
  const ids=EV_CYCLE.filter(id=>includeMissing||id!=='missing');
  return/*#__PURE__*/React.createElement("div",{style:{display:'flex',flexWrap:'wrap',gap:compact?4:6}},
    ids.map(id=>{
      const m=EV_STATUSES[id];
      const on=id===suggested;
      return/*#__PURE__*/React.createElement("button",{key:id,type:'button',title:m.label,
        onClick:e=>{e.stopPropagation();onAdd(id);},
        style:{border:\`\${on?2:1}px solid \${m.border}\`,background:on?m.bg:'transparent',color:m.color,
          borderRadius:999,padding:compact?'3px 8px':'4px 10px',cursor:'pointer',fontSize:compact?11:12,
          fontWeight:on?700:500,fontFamily:'inherit',lineHeight:1.2}},
        m.symbol," ",m.label);
    })
  );
}
function TenderCellPanel({sheet,cellKey,save,onClose}){`,
  'add QuickUpdatePills'
);
```

- [ ] **Step 2: Point the tender panel at it**

```js
mustReplace(
  `/*#__PURE__*/React.createElement("div",{style:{display:'flex',flexWrap:'wrap',gap:6}},
            Object.values(EV_STATUSES).map(ev=>/*#__PURE__*/React.createElement("button",{key:ev.id,onClick:()=>addEvent(ev.id),title:ev.label,
              style:{border:\`1px solid \${ev.border}\`,background:ev.bg,color:ev.color,borderRadius:8,padding:'3px 8px',cursor:'pointer',fontSize:12}},
              ev.symbol," ",ev.label))
          )`,
  `/*#__PURE__*/React.createElement(QuickUpdatePills,{events:cell.events,onAdd:addEvent,includeMissing:true})`,
  'tender panel uses QuickUpdatePills'
);
```

`includeMissing:true` preserves the tender board's ability to log חסר, which the task surfaces do not offer.

- [ ] **Step 3: Switch `addEvent` to `appendUpdate`**

```js
mustReplace(
  "writeCell(c=>({...c,events:[...(c.events||[]),{id,status,date:todayISO()}]}));",
  "writeCell(c=>({...c,events:appendUpdate(c.events,{id,status,date:todayISO()})}));",
  'addEvent uses appendUpdate'
);
```

- [ ] **Step 4: Verify syntax**

Run the `node --check` extraction. Expected: `SYNTAX_OK`

- [ ] **Step 5: Verify in the browser**

Start the server, open the app, go to **מסלול מכרז**, click any matrix cell to open the panel.
Expected: the "הוסף עדכון" row now shows rounded pills; exactly one is emphasized (thicker border, filled, bold) and it is the *next* step after the cell's latest update. Clicking any pill adds the entry immediately and expands it — same as before.

Check the console for errors: expected none.

- [ ] **Step 6: Commit**

```bash
git add project_hub_01.html
git commit -m "feat: shared QuickUpdatePills strip, adopted by the tender panel

The tender panel already logged in one click, so it is where the shared
component gets proven. It also gains the suggested-next-status highlight
it did not have."
```

---

### Task 3: `StatusOwnerCell` logs in one click

**Files:**
- Modify: `project_hub_01.html` (the `panel==='add'` popover inside `StatusOwnerCell`)

Today this popover asks for a discipline **and** a status and then a confirm — up to four clicks over 22 pills — and pre-selects the *current* status, i.e. suggests repeating what is already recorded.

- [ ] **Step 1: Replace the popover body**

The current block runs from the discipline heading through the confirm button. Anchor on its distinctive opening and closing text:

```js
const oldPanel = s.slice(
  s.indexOf(`/*#__PURE__*/React.createElement("div",{className:"dp-title",style:{marginBottom:8}},"עדכון חדש")`),
  s.indexOf(`"✓ הוסף"))));}`) + `"✓ הוסף"))));}`.length
);
```

Print `oldPanel` first to confirm it starts at `"עדכון חדש"` and ends at the confirm button, then replace it:

```js
mustReplace(oldPanel,
  `/*#__PURE__*/React.createElement("div",{className:"dp-title",style:{marginBottom:8}},"עדכון חדש"),`+
  `/*#__PURE__*/React.createElement(QuickUpdatePills,{events:task.events,compact:true,onAdd:status=>{`+
  `onUpdate({...task,events:appendUpdate(task.events,{id:uid(),status,assignee:discId||'',date:todayISO(),title:'',note:''})});`+
  `setPanel(null);}}),`+
  `/*#__PURE__*/React.createElement("button",{type:'button',onClick:()=>setPanel('full'),`+
  `style:{marginTop:8,background:'none',border:'none',padding:0,fontFamily:'inherit',fontSize:11,`+
  `color:'var(--text-3)',cursor:'pointer',textDecoration:'underline',textUnderlineOffset:3}},`+
  `"אחראי אחר, כותרת או סבב…")));}`,
  'StatusOwnerCell one-click panel'
);
```

Three behavior changes land here: the write **appends** (was prepend), the assignee **defaults to the current discipline** rather than being asked for, and the suggested status is the **next** step.

Do not touch the `+` button's visibility. `.add-ev-inline` is already `opacity:0` until the row is hovered, which is exactly the behavior the spec calls for on rows that already show a chip.

- [ ] **Step 2: Keep the detailed form as the popover's second state**

`setPanel('full')` needs a destination. Do **not** plumb a new "open the task detail panel" callback through `TaskRow`/`ListView` — `StatusOwnerCell` only receives `{task,onUpdate,onChangeResponsible,threshold}`, and widening that contract for one link is more scope than this buys.

Instead, keep the existing discipline-pills + status-pills + ביטול/✓ הוסף UI exactly as it is today and render it under `panel==='full'`. The popover then has two states: `'add'` (the strip, the default) and `'full'` (what the popover shows today). Nothing is deleted and no capability is lost — the detailed path simply stops being the first thing you meet.

Concretely: the block currently rendered under `panel==='add'` moves to `panel==='full'` unchanged, and the new strip from Step 1 takes over `panel==='add'`.

- [ ] **Step 3: Verify syntax**

Run the `node --check` extraction. Expected: `SYNTAX_OK`

- [ ] **Step 4: Verify in the browser**

Go to **ניהול תכנון**. Find a task whose עדכונים column shows a chip and click its `+`.
Expected: a compact pill strip, one pill emphasized as the *next* status (e.g. a task last marked נשלח emphasizes בהתייחסות, not נשלח). One click closes the popover and updates the chip. The new entry is **last** in the task's timeline, not first — confirm by opening the task detail panel's עדכונים tab.

Check the console for errors: expected none.

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html
git commit -m "feat: the עדכונים column logs an update in one click

Was: pick a discipline, pick a status, confirm — over a popover of 22
pills that suggested repeating the current status. Now the strip is the
panel, the discipline carries over, and the write appends like the other
two surfaces instead of prepending."
```

---

### Task 4: An entry point for tasks with no updates

**Files:**
- Modify: `project_hub_01.html` (`StatusOwnerCell`'s `!isProcess` early return)

A task with no updates renders an empty `<td>`, so the tasks where documentation has not started are the only ones you cannot start from the row.

- [ ] **Step 1: Replace the early return**

```js
mustReplace(
  `if(!isProcess){return/*#__PURE__*/React.createElement("td",{style:{padding:'0 10px',verticalAlign:'middle',background:'inherit'}});}`,
  `if(!isProcess){return/*#__PURE__*/React.createElement("td",{ref:ref,style:{position:'relative',padding:'0 10px',verticalAlign:'middle',background:'inherit'}},`+
  `/*#__PURE__*/React.createElement("button",{type:'button',title:"הוסף עדכון",`+
  `onClick:e=>{e.stopPropagation();setPanel(p=>p==='add'?null:'add');},`+
  `style:{width:19,height:19,borderRadius:5,border:'1px dashed var(--border-strong)',background:'transparent',`+
  `color:'var(--text-3)',fontSize:12,lineHeight:1,cursor:'pointer',padding:0,opacity:.65}},"+"),`+
  `panel==='add'&&/*#__PURE__*/React.createElement("div",{className:"dp",onClick:e=>e.stopPropagation(),style:{minWidth:200,padding:'10px'}},`+
  `/*#__PURE__*/React.createElement("div",{className:"dp-title",style:{marginBottom:8}},"עדכון ראשון"),`+
  `/*#__PURE__*/React.createElement(QuickUpdatePills,{events:[],compact:true,onAdd:status=>{`+
  `onUpdate({...task,events:appendUpdate(task.events,{id:uid(),status,assignee:task.discipline||'',date:todayISO(),title:'',note:''})});`+
  `setPanel(null);}})));}`,
  'entry point for tasks with no updates'
);
```

`events:[]` makes the strip emphasize בעבודה, which is the correct first step. The assignee falls back to the task's own discipline, since there is no previous update to carry one from.

- [ ] **Step 2: Verify syntax**

Run the `node --check` extraction. Expected: `SYNTAX_OK`

- [ ] **Step 3: Verify in the browser**

Go to **ניהול תכנון** and find a task with an empty עדכונים cell (e.g. one showing "—" in other columns).
Expected: a faint dashed `+`. Clicking it opens a strip titled "עדכון ראשון" with בעבודה emphasized. One click writes the first update and the cell now renders the normal chip.

Confirm the click-outside close still works (the `ref` is reused by the existing `useEffect` mousedown handler).

Check the console for errors: expected none.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat: tasks with no updates get a row-level entry point

StatusOwnerCell returned an empty <td> for exactly the tasks where
documentation had not started yet, so the first update was the only one
that required opening the detail panel."
```

---

### Task 5: The task detail panel opens on the strip, not the form

**Files:**
- Modify: `project_hub_01.html` (`EventsTimelineSection`)

The six-field form is correct but reads as an obligation. Its defaults are already good — `getNextSuggestedStatus`, today's date, the carried-over assignee — so the fast path exists and is simply invisible.

- [ ] **Step 1: Stop the form from being the default state**

```js
mustReplace(
  "const[showForm,setShowForm]=useState(events.length===0);",
  "const[showForm,setShowForm]=useState(false);",
  'form no longer opens by default'
);
```

- [ ] **Step 2: Put the strip under the header and relabel the existing button**

The component already has a `tp-ev-hdr` row holding the title and a `+ הוסף עדכון` button that opens the form. That button becomes the "more" affordance — no second button is needed. The same edit inserts the strip as the header's next sibling.

```js
mustReplace(
  `!showForm&&/*#__PURE__*/React.createElement("button",{className:"tp-add-ev-btn",onClick:()=>setShowForm(true)},"+ הוסף עדכון"))`,
  `!showForm&&/*#__PURE__*/React.createElement("button",{className:"tp-add-ev-btn",onClick:()=>setShowForm(true)},"פרטים נוספים…")),`+
  `/*#__PURE__*/React.createElement("div",{style:{margin:'10px 0 2px'}},`+
  `/*#__PURE__*/React.createElement(QuickUpdatePills,{events:events,onAdd:status=>{`+
  `const rec={id:uid(),status,assignee:latestByDate?.assignee||'',date:todayISO(),title:'',note:''};`+
  `setEvents(appendUpdate(events,rec));setExpandedEvId(rec.id);}}))`,
  'strip under the header, button relabelled'
);
```

`setExpandedEvId(rec.id)` is what makes the new entry open for refinement — the component already keeps that state for one-card-at-a-time expansion, and the expanded card already renders the note field and מחק. This is the same behavior the tender panel gets from its own `setExpandedEvId` call.

- [ ] **Step 3: Verify syntax**

Run the `node --check` extraction. Expected: `SYNTAX_OK`

- [ ] **Step 4: Verify in the browser**

Open a task's detail panel → עדכונים tab.
Expected: the pill strip is what you see first; the six-field form is closed behind "פרטים נוספים…". Clicking a pill adds the update immediately, it appears **last** in the list, and that card is **expanded** with its note field and מחק visible. Opening "פרטים נוספים…" still shows the full form with its existing defaults, and שמור עדכון still works.

Check the console for errors: expected none.

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html
git commit -m "feat: the updates tab leads with the one-click strip

The six-field form kept its defaults and its capabilities — it just stops
being the first thing you meet, which is what made logging an update read
as a form you owe rather than a thing you tap."
```

---

### Task 6: Cross-surface regression pass

**Files:**
- Modify: none unless a defect is found

All three surfaces now write through the same helpers. This task proves they produce identical records and that nothing downstream broke.

- [ ] **Step 1: Run both test suites**

```bash
node tests/quick-update.test.js
node tests/tender-logic.test.js
```
Expected: `ALL PASS` from both.

- [ ] **Step 2: Log one update from each surface**

In the browser, log an update from:
1. a tender matrix cell panel,
2. the עדכונים column of a task that already has updates,
3. the עדכונים column of a task with none,
4. a task detail panel's עדכונים tab.

- [ ] **Step 3: Confirm the records match**

In the browser console:

```js
const d = await (await fetch('/api/project-hub-01')).json();
const all = [];
const walk = o => { if(!o||typeof o!=='object') return;
  if(Array.isArray(o)) return o.forEach(walk);
  if(Array.isArray(o.events)) o.events.forEach(e=>all.push(e));
  for(const k in o) walk(o[k]); };
walk(d);
console.log(all.filter(e=>e.date===new Date().toISOString().slice(0,10)));
```

Expected: every record written today has `{id, status, date}` and the ones from task surfaces also carry `assignee`. No record is missing `date`, and none was inserted at index 0 of an existing non-empty array.

- [ ] **Step 4: Confirm downstream views are unaffected**

- **מסלול מכרז → גאנט**: bars still render, day counts unchanged for cells you did not touch.
- Hover a matrix cell: the tooltip still reports days-in-status and total.
- A cell past its delay threshold still shows the red outline.

- [ ] **Step 5: Commit if anything was fixed**

```bash
git add project_hub_01.html
git commit -m "fix: <what the regression pass turned up>"
```

If nothing needed fixing, skip the commit.

---

## Not in this plan

Phase 2 of the spec — the global-hotkey capture window, `data.inbox`, capturing a decision into `data.standalonePrinciples`, dictation and paste-from-email — is a separate plan. It depends on `QuickUpdatePills` and the helpers built here, which is why it comes second.
