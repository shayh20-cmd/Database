# Execution Track (Issue / RFI / Submittal) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Status:** experimental — built on branch `feat/execution-track` (forked from `feat/meeting-summaries`). Not merged, not deployed, until the user decides it works.

**Goal:** Let a project in its execution phase track Issues, RFIs and Submittals: official numbering, "ball in court", reply thread / submittal rounds, waiting days per party, a log with counters, items in "העבודה שלי", and meeting-summary integration.

**Source:** brief `O:\@Omicron Office\Downloads\hub-execution-track-brief.md` + approved mockup (4 screens: project execution page with counters and log; item screen with thread, ball handoff, waiting days, links, submittal rounds; My Work; site meeting pulling open items).

## Decisions (defaults the user accepted)

- **Storage:** a separate array `doc.execItems` next to the task sheets (not tasks with a `type`). Tasks stay simple; both appear in My Work and meetings.
- **Replies are entered by the office on behalf of the other party** ("קבלן · דנה ל."). Contractors/supervisors have no Project Hub users.
- **Waiting days = working days Sunday–Thursday.**
- **Phase:** `projectMeta.phase` = `'design' | 'tender' | 'execution'`, set manually in the project header (default `'design'`; no automatic switching in this round).
- **Parties:** `architect` (the office), `contractor`, `supervisor`, `consultant` (with a name/discipline). "Ball with us" = `architect`.
- The project tab **"פיקוח"** (today a "coming soon" placeholder, id `supervision`) becomes **"ביצוע"** and hosts the execution screen.

## Data

```js
doc.execItems = [{
  id, type: 'issue'|'rfi'|'submittal', seq: 14, number: 'RFI-014',
  title, description, status,                 // per-type statuses below
  openedBy: { party, name }, ball: { party, name } | null, ownerId,   // ownerId = office staffId (optional)
  dueDate, discipline, specSection,           // discipline id from projList(doc,'disciplines'); specSection free text (submittals)
  source: { kind: 'meeting'|'site_visit'|'email'|'manual', ref } | null,
  createdAt, closedAt,
  responses: [{ id, at, party, name, body, files:[{id,url,name}], ballTo:{party,name}|null, kind:'open'|'reply'|'answer'|'close'|'reopen'|'revision'|'decision' }],
  revisions: [{ id, label:'A', files, submittedAt, decision:null|'approved'|'approved_notes'|'rejected', notes, decidedBy, decidedAt }],  // submittals only
  ballHistory: [{ party|null, name, from }],  // ISO datetimes; derived waiting days
  links: [{ kind:'task', sheetId, taskId } | { kind:'meeting', meetingId, itemId }]
}]
```

Statuses — Issue: פתוח `open` / בטיפול `in_progress` / נפתר `resolved` (closed). RFI: ממתין `pending` / נענה `answered` / נסגר `closed` (closed). Submittal: הוגש `submitted` / אושר `approved` (closed) / אושר עם הערות `approved_notes` (closed) / נדחה – להגשה מחדש `rejected`.

## Conventions (every task)

Same as `docs/superpowers/plans/2026-10-11-meeting-summaries.md` → "Conventions for every task": edit `project_hub_01.html` with Node patch scripts (written with a file tool into the session scratchpad), exact anchors asserted to occur exactly once, CRLF; syntax check must print `scripts 3`; `node --test tests/*.test.js` must pass; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never press שמור on, or edit, existing real data while browser-testing — create test records and delete them afterwards.

---

### Task 1: `exec-logic` block + tests

**Files:** create `tests/exec-logic.test.js`; modify `project_hub_01.html` (insert the block immediately before `/* ═══ meeting-logic ═══ */`).

- [ ] **Step 1: tests (write first, run, see them fail)**

```js
// Run: node --test tests/exec-logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'project_hub_01.html'), 'utf8');
const m = html.match(/\/\* ═══ exec-logic ═══ \*\/([\s\S]*?)\/\* ═══ \/exec-logic ═══ \*\//);
if (!m) throw new Error('exec-logic block not found in project_hub_01.html');
let n = 0;
const uid = () => 'x' + ++n;
const L = new Function('uid', m[1] + '\nreturn {EXEC_TYPES,EXEC_PARTIES,execIsClosed,execNextNumber,execWorkdays,execNewItem,execRespond,execSetBall,execAddRevision,execDecide,execWaiting,execBallDays,execCounts,execBallSplit,execForMe,execLogRows,execPartyLabel};')(uid);

const T0 = '2026-10-04T08:00:00.000Z'; // Sunday
const mk = (over = {}) => L.execNewItem(over.items || [], { type: 'rfi', title: 'גובה תקרה', description: 'שאלה', openedBy: { party: 'contractor', name: 'דנה' }, ballTo: { party: 'architect', name: '' }, ...over }, T0);

test('numbering is per type and per project', () => {
  const a = mk();
  assert.strictEqual(a.number, 'RFI-001');
  const b = L.execNewItem([a], { type: 'rfi', title: 'b', openedBy: { party: 'contractor' } }, T0);
  assert.strictEqual(b.number, 'RFI-002');
  const s = L.execNewItem([a, b], { type: 'submittal', title: 's', openedBy: { party: 'contractor' } }, T0);
  assert.strictEqual(s.number, 'SUB-001');
  assert.deepStrictEqual(s.revisions.map(r => r.label), ['A']);
  assert.strictEqual(s.status, 'submitted');
});

test('workdays count Sunday–Thursday only', () => {
  assert.strictEqual(L.execWorkdays('2026-10-04', '2026-10-11'), 5); // Sun → next Sun
  assert.strictEqual(L.execWorkdays('2026-10-08', '2026-10-11'), 1); // Thu → Sun (Fri, Sat skipped)
  assert.strictEqual(L.execWorkdays('2026-10-11', '2026-10-11'), 0);
  assert.strictEqual(L.execWorkdays('2026-10-12T10:00:00Z', '2026-10-11'), 0);
});

test('new item: opening response, ball history, first status', () => {
  const a = mk();
  assert.strictEqual(a.status, 'pending');
  assert.strictEqual(a.responses.length, 1);
  assert.strictEqual(a.responses[0].kind, 'open');
  assert.deepStrictEqual(a.ballHistory.map(h => h.party), ['architect']);
});

test('respond moves the ball and records history; same ball is not duplicated', () => {
  let a = mk();
  a = L.execRespond(a, { party: 'architect', name: 'שי', body: 'בודקים', ballTo: { party: 'consultant', name: 'אקוסטיקה' } }, '2026-10-06T08:00:00Z');
  assert.deepStrictEqual(a.ball, { party: 'consultant', name: 'אקוסטיקה' });
  a = L.execRespond(a, { party: 'consultant', name: 'אקוסטיקה', body: 'עוד' , ballTo: { party: 'consultant', name: 'אקוסטיקה' } }, '2026-10-07T08:00:00Z');
  assert.strictEqual(a.ballHistory.length, 2);
  a = L.execRespond(a, { party: 'architect', body: 'תשובה', kind: 'answer', ballTo: { party: 'contractor', name: 'דנה' } }, '2026-10-08T08:00:00Z');
  assert.strictEqual(a.status, 'answered');
  a = L.execRespond(a, { party: 'architect', kind: 'close' }, '2026-10-11T08:00:00Z');
  assert.strictEqual(a.status, 'closed');
  assert.strictEqual(a.ball, null);
  assert.ok(a.closedAt);
  assert.ok(L.execIsClosed(a));
});

test('issue: first reply sets in_progress; close resolves; reopen returns to open', () => {
  let i = L.execNewItem([], { type: 'issue', title: 'התנגשות', openedBy: { party: 'supervisor', name: 'רון' }, ballTo: { party: 'architect' } }, T0);
  assert.strictEqual(i.number, 'ISS-001');
  i = L.execRespond(i, { party: 'architect', body: 'מטפלים' }, T0);
  assert.strictEqual(i.status, 'in_progress');
  i = L.execRespond(i, { party: 'architect', kind: 'close' }, T0);
  assert.strictEqual(i.status, 'resolved');
  i = L.execRespond(i, { party: 'contractor', kind: 'reopen', ballTo: { party: 'architect' } }, T0);
  assert.strictEqual(i.status, 'open');
  assert.strictEqual(i.closedAt, null);
  assert.strictEqual(i.ball.party, 'architect');
});

test('submittal rounds: reject → resubmit (Rev B) → approve with notes closes it', () => {
  let s = L.execNewItem([], { type: 'submittal', title: 'HPL', openedBy: { party: 'contractor' }, ballTo: { party: 'architect' } }, T0);
  s = L.execDecide(s, { decision: 'rejected', notes: 'חסר פרט', name: 'שי' }, '2026-10-06T08:00:00Z');
  assert.strictEqual(s.status, 'rejected');
  assert.strictEqual(s.ball.party, 'contractor');
  assert.strictEqual(s.revisions[0].decision, 'rejected');
  s = L.execAddRevision(s, { party: 'contractor', name: 'דנה', files: [] }, '2026-10-08T08:00:00Z');
  assert.deepStrictEqual(s.revisions.map(r => r.label), ['A', 'B']);
  assert.strictEqual(s.status, 'submitted');
  assert.strictEqual(s.ball.party, 'architect');
  s = L.execDecide(s, { decision: 'approved_notes', notes: 'לתקן גוון', name: 'שי' }, '2026-10-11T08:00:00Z');
  assert.ok(L.execIsClosed(s));
  assert.strictEqual(s.ball, null);
});

test('waiting days: current holder and per party', () => {
  let a = mk(); // ball → architect at Sun 4/10
  a = L.execRespond(a, { party: 'architect', body: '', ballTo: { party: 'contractor', name: 'דנה' } }, '2026-10-06T08:00:00Z'); // Tue
  assert.strictEqual(L.execWaiting(a, '2026-10-11'), 3); // Tue→Sun: Wed, Thu, Sun
  const per = L.execBallDays(a, '2026-10-11');
  assert.deepStrictEqual(per.map(p => [p.party, p.days]), [['contractor', 3], ['architect', 2]]);
});

test('counts, ball split, my items and log order', () => {
  const r1 = mk(); // rfi, ball architect since 4/10
  const r2 = L.execRespond(L.execNewItem([r1], { type: 'rfi', title: 'b', openedBy: { party: 'contractor' }, ballTo: { party: 'architect' }, dueDate: '2026-10-20' }, '2026-10-09T08:00:00Z'), { party: 'architect', ballTo: { party: 'contractor' } }, '2026-10-11T08:00:00Z');
  const s1 = L.execNewItem([], { type: 'submittal', title: 's', openedBy: { party: 'contractor' }, ballTo: { party: 'architect' }, ownerId: 'st07' }, T0);
  const i1 = L.execNewItem([], { type: 'issue', title: 'i', openedBy: { party: 'supervisor' }, ballTo: { party: 'consultant', name: 'מיזוג' } }, '2026-09-01T08:00:00Z');
  const closed = L.execRespond(L.execNewItem([], { type: 'issue', title: 'c', openedBy: { party: 'supervisor' } }, T0), { party: 'architect', kind: 'close' }, T0);
  const items = [r1, r2, s1, i1, closed];
  const c = L.execCounts(items, '2026-10-14');
  assert.strictEqual(c.rfiOpen, 2);
  assert.strictEqual(c.rfiLate, 1);       // r1 waiting 8 workdays > 7
  assert.strictEqual(c.subPending, 1);
  assert.strictEqual(c.issuesLate, 1);    // i1 open > 14 workdays
  assert.strictEqual(c.mine, 2);          // r1, s1 (ball architect)
  assert.deepStrictEqual(L.execBallSplit(items), { architect: 2, contractor: 1, supervisor: 0, consultant: 1 });
  assert.deepStrictEqual(L.execForMe(items, 'st07', false).map(x => x.id), [s1.id]);
  assert.deepStrictEqual(L.execForMe(items, 'zz', true).map(x => x.id), [r1.id]);
  const rows = L.execLogRows(items, 'all', '2026-10-14');
  assert.strictEqual(rows[rows.length - 1].id, closed.id, 'closed last');
  assert.strictEqual(rows[0].id, i1.id, 'longest waiting first');
  assert.deepStrictEqual(L.execLogRows(items, 'rfi', '2026-10-14').map(x => x.type), ['rfi', 'rfi']);
  assert.strictEqual(L.execPartyLabel({ party: 'consultant', name: 'מיזוג' }), 'יועץ מיזוג');
  assert.strictEqual(L.execPartyLabel({ party: 'contractor', name: 'דנה' }), 'קבלן · דנה');
  assert.strictEqual(L.execPartyLabel(null), '—');
});
```

- [ ] **Step 2: the block** (insert before `/* ═══ meeting-logic ═══ */`)

```js
/* ═══ exec-logic ═══ */
/* Execution phase items (Issue / RFI / Submittal) kept in doc.execItems. The office enters
   every party's replies; "ball" says who must act now. Waiting days are working days, Sun–Thu. */
const EXEC_TYPES={
  issue:{prefix:'ISS',label:'Issue',statuses:[{id:'open',label:'פתוח'},{id:'in_progress',label:'בטיפול'},{id:'resolved',label:'נפתר',closed:true}]},
  rfi:{prefix:'RFI',label:'RFI',statuses:[{id:'pending',label:'ממתין'},{id:'answered',label:'נענה'},{id:'closed',label:'נסגר',closed:true}]},
  submittal:{prefix:'SUB',label:'הגשה',statuses:[{id:'submitted',label:'הוגש'},{id:'approved',label:'אושר',closed:true},{id:'approved_notes',label:'אושר עם הערות',closed:true},{id:'rejected',label:'נדחה – להגשה מחדש'}]}
};
const EXEC_PARTIES=[{id:'architect',label:'אדריכל'},{id:'contractor',label:'קבלן'},{id:'supervisor',label:'מפקח'},{id:'consultant',label:'יועץ'}];
const EXEC_RFI_LATE=7,EXEC_ISSUE_LATE=14;
function execPartyLabel(b){if(!b||!b.party)return '—';const p=(EXEC_PARTIES.find(x=>x.id===b.party)||{}).label||b.party;const nm=String(b.name||'').trim();return !nm?p:b.party==='consultant'?p+' '+nm:p+' · '+nm;}
function execIsClosed(it){const t=EXEC_TYPES[it.type];const s=t&&t.statuses.find(x=>x.id===it.status);return !!(s&&s.closed);}
function execNextNumber(items,type){const seq=Math.max(0,...(items||[]).filter(i=>i.type===type).map(i=>i.seq||0))+1;return{seq,number:EXEC_TYPES[type].prefix+'-'+String(seq).padStart(3,'0')};}
function execWorkdays(fromISO,toISO){
  if(!fromISO||!toISO)return 0;const a=String(fromISO).slice(0,10),b=String(toISO).slice(0,10);if(b<=a)return 0;
  const d=new Date(a+'T00:00:00Z'),end=new Date(b+'T00:00:00Z');let n=0;
  while(d<end){d.setUTCDate(d.getUTCDate()+1);const w=d.getUTCDay();if(w!==5&&w!==6)n++;}
  return n;
}
function execSetBall(item,ball,at){
  const cur=item.ball;const same=(!cur&&!ball)||(cur&&ball&&cur.party===ball.party&&String(cur.name||'')===String(ball.name||''));
  if(same)return item;
  return{...item,ball:ball?{party:ball.party,name:ball.name||''}:null,ballHistory:[...(item.ballHistory||[]),{party:ball?ball.party:null,name:ball?ball.name||'':'',from:at}]};
}
function execNewItem(items,o,now){
  const at=now||new Date().toISOString();const{seq,number}=execNextNumber(items,o.type);
  const openedBy={party:(o.openedBy||{}).party||'architect',name:(o.openedBy||{}).name||''};
  let it={id:uid(),type:o.type,seq,number,title:o.title||'',description:o.description||'',status:EXEC_TYPES[o.type].statuses[0].id,openedBy,ball:null,ownerId:o.ownerId||null,dueDate:o.dueDate||'',discipline:o.discipline||'',specSection:o.specSection||'',source:o.source||null,createdAt:at,closedAt:null,
    responses:[{id:uid(),at,party:openedBy.party,name:openedBy.name,body:o.description||'',files:o.files||[],ballTo:o.ballTo||null,kind:'open'}],
    revisions:o.type==='submittal'?[{id:uid(),label:'A',files:o.files||[],submittedAt:at,decision:null,notes:'',decidedBy:'',decidedAt:null}]:[],
    ballHistory:[],links:[]};
  return o.ballTo?execSetBall(it,o.ballTo,at):it;
}
function execRespond(item,r,now){
  const at=now||new Date().toISOString();const kind=r.kind||'reply';
  let next={...item,responses:[...(item.responses||[]),{id:uid(),at,party:r.party,name:r.name||'',body:r.body||'',files:r.files||[],ballTo:kind==='close'?null:(r.ballTo||null),kind}]};
  if(kind==='close'){next.status=item.type==='issue'?'resolved':item.type==='rfi'?'closed':item.status;next.closedAt=at;return execSetBall(next,null,at);}
  if(kind==='reopen'){next.status=EXEC_TYPES[item.type].statuses[0].id;next.closedAt=null;}
  if(kind==='answer'&&item.type==='rfi')next.status='answered';
  if(kind==='reply'&&item.type==='issue'&&item.status==='open')next.status='in_progress';
  return r.ballTo?execSetBall(next,r.ballTo,at):next;
}
function execAddRevision(item,r,now){
  const at=now||new Date().toISOString();const revs=item.revisions||[];
  const label=String.fromCharCode(65+revs.length);
  let next={...item,status:'submitted',closedAt:null,revisions:[...revs,{id:uid(),label,files:r.files||[],submittedAt:at,decision:null,notes:'',decidedBy:'',decidedAt:null}],
    responses:[...(item.responses||[]),{id:uid(),at,party:r.party||'contractor',name:r.name||'',body:r.body||'',files:r.files||[],ballTo:{party:'architect',name:''},kind:'revision'}]};
  return execSetBall(next,{party:'architect',name:''},at);
}
function execDecide(item,d,now){
  const at=now||new Date().toISOString();const revs=(item.revisions||[]).slice();const i=revs.length-1;
  if(i>=0)revs[i]={...revs[i],decision:d.decision,notes:d.notes||'',decidedBy:d.name||'',decidedAt:at};
  let next={...item,revisions:revs,status:d.decision,responses:[...(item.responses||[]),{id:uid(),at,party:'architect',name:d.name||'',body:d.notes||'',files:d.files||[],ballTo:null,kind:'decision'}]};
  const closed=execIsClosed(next);next.closedAt=closed?at:null;
  return execSetBall(next,closed?null:(d.ballTo||{party:'contractor',name:''}),at);
}
function execWaiting(item,today){const h=item.ballHistory||[];if(!item.ball||!h.length)return 0;return execWorkdays(h[h.length-1].from,today);}
function execBallDays(item,today){
  const h=item.ballHistory||[];const acc={};
  h.forEach((e,i)=>{if(!e.party)return;const end=i+1<h.length?h[i+1].from:(item.closedAt||today);const k=e.party+'|'+(e.name||'');acc[k]=acc[k]||{party:e.party,name:e.name||'',days:0};acc[k].days+=execWorkdays(e.from,end);});
  return Object.values(acc).sort((a,b)=>b.days-a.days);
}
function execCounts(items,today){
  const open=(items||[]).filter(i=>!execIsClosed(i));
  const rfi=open.filter(i=>i.type==='rfi');const mine=open.filter(i=>i.ball&&i.ball.party==='architect');
  return{
    rfiOpen:rfi.length,
    rfiLate:rfi.filter(i=>(i.dueDate&&i.dueDate<today)||execWaiting(i,today)>EXEC_RFI_LATE).length,
    subPending:open.filter(i=>i.type==='submittal'&&i.status==='submitted').length,
    subRound3:open.filter(i=>i.type==='submittal'&&(i.revisions||[]).length>=3).length,
    issuesLate:open.filter(i=>i.type==='issue'&&execWorkdays(i.createdAt,today)>EXEC_ISSUE_LATE).length,
    mine:mine.length,
    mineAvg:mine.length?Math.round(mine.reduce((s,i)=>s+execWaiting(i,today),0)/mine.length*10)/10:0
  };
}
function execBallSplit(items){const out={architect:0,contractor:0,supervisor:0,consultant:0};(items||[]).forEach(i=>{if(!execIsClosed(i)&&i.ball&&out[i.ball.party]!=null)out[i.ball.party]++;});return out;}
function execForMe(items,staffId,iManage){return(items||[]).filter(i=>!execIsClosed(i)&&i.ball&&i.ball.party==='architect'&&(i.ownerId?i.ownerId===staffId:iManage));}
function execLogRows(items,filter,today){
  const list=(items||[]).filter(i=>filter==='all'||!filter||i.type===filter);
  const open=list.filter(i=>!execIsClosed(i)).sort((a,b)=>execWaiting(b,today)-execWaiting(a,today)||(a.seq-b.seq));
  const closed=list.filter(i=>execIsClosed(i)).sort((a,b)=>String(b.closedAt||'').localeCompare(String(a.closedAt||'')));
  return[...open,...closed];
}
/* ═══ /exec-logic ═══ */
```

- [ ] **Step 3:** tests pass, syntax `scripts 3`, commit `feat(project-hub): exec-logic — issue/rfi/submittal items, ball in court, waiting days`.

---

### Task 2: Phase switch + "ביצוע" tab + execution page (counters, ball bar, log, new item)

**Files:** `project_hub_01.html`.

1. **Phase:** in `NihulHubView`'s tab bar, before the "המשימות שלי בפרויקט ←" button, add a compact segmented control `תכנון | מכרז | ביצוע` bound to `data.projectMeta.phase` (default `'design'`), saving `save({...data,projectMeta:{...(data.projectMeta||{}),phase}})`. Hidden for admin projects (`isAdminProject(data)`). Viewers (`myOfficeRole()==='viewer'`) see it read-only.
2. **Tab:** in `CROSS_CUTTING_ITEMS` change `{id:'supervision',label:'פיקוח',…}` to label `'ביצוע'` (keep id `supervision` so saved screen state keeps working). Replace `activeTab==='supervision'&&…ComingSoonPage…` with `ExecutionView({data,save,openItemId,onConsumeOpen})`. When phase is `'execution'` and the remembered tab is the default, open on `supervision` (only when there is no explicit pending tab).
3. **`ExecutionView`** (new component, placed before `function NihulHubView(`), RTL, following the mockup screen 1:
   - KPI row (4 cards, `execCounts`): RFI פתוחים (sub: "N עברו 7 ימי עבודה" in red when >0), הגשות ממתינות (sub: "N בסבב שלישי ומעלה"), Issues חריגים (sub "פתוחים מעל 14 ימי עבודה"), הכדור אצלנו (sub "ממוצע X ימים", accent outline). Clicking a card sets the log filter (rfi / submittal / issue / "mine").
   - "אצל מי הכדור" stacked bar from `execBallSplit` with legend (אדריכל / קבלן / מפקח / יועצים) and the open-items total.
   - Filter segmented control `הכל N | Issues N | RFI N | הגשות N` (+ "אצלנו" when chosen from the KPI), "הצג סגורים" checkbox (closed rows hidden by default), buttons "ייצוא PDF" (prints the log via the existing `.meeting-doc`-style print: wrap the log in a container with a print class and call `window.print()`; reuse/extend the `@media print` block so only the log prints with project name + date header) and "+ פריט חדש ▾" (menu: Issue / RFI / הגשה).
   - Log table (`execLogRows`): מס' (type pill + number, mono), נושא, תחום (discipline full name via `DISCIPLINE_FULL_NAMES`, plus `specSection` for submittals), הכדור אצל (party chip with colour dot: architect #7F77DD, contractor #D85A30, supervisor #1D9E75, consultant #888780), ממתין (`execWaiting` days; red when > 7 for RFI / due date passed, amber 5–7), סטטוס (status label), יעד (dueDate dd/mm). Row click opens the item (Task 3). Empty state: "אין עדיין פריטי ביצוע. פתח Issue, RFI או הגשה." 
   - Below the log, a muted line linking to the planning tasks tab ("משימות תכנון שוטפות (N פתוחות) ←" → `setActiveTab('ongoing')` via a prop).
   - **New item dialog** (modal using the app's existing modal styling — look for an existing modal component/pattern, e.g. the one used by `CreateItemDialog`): type (preselected), כותרת (required), תיאור, נפתח ע"י (party select + name), הכדור אצל (party select + name; defaults: RFI/Submittal opened by contractor → architect; Issue → architect), תחום (disciplines select), סעיף מפרט (submittal only), תאריך יעד (DateField; default: RFI +7 workdays, Submittal +10 workdays, Issue empty — add a helper `execAddWorkdays(iso,n)` to exec-logic with a unit test), אחראי במשרד (team select, optional), קבצים (upload via `uploadAttachment`). Saves `execNewItem(doc.execItems, …)` into `doc.execItems` and opens it.
4. Type pills colours: Issue bg #FAECE7 / text #712B13; RFI #EEEDFE / #3C3489; Submittal #E1F5EE / #085041. Add `.ex-*` CSS (keep all execution styles prefixed `ex-`), dark-mode safe (use app vars `--surface`, `--text`, `--border`, `--bg`).
5. Browser-check in a test project state you create (use "אולם ספורט לוד", switch phase to ביצוע, create 3 items of different types, verify counters/bar/log/filters/PDF preview markup), then delete the test items (add a "מחק פריט" action in Task 3; for Task 2 cleanup you may remove them via the dialog-less path: set `doc.execItems` back to its previous value through the app's own `save`) and set the phase back to `design`.

Commit: `feat(project-hub): execution page — phase switch, counters, ball-in-court log, new items`.

---

### Task 3: Item screen (thread, ball handoff, submittal rounds, waiting days, links)

Side panel like the task side panel (`tds-panel` classes, resizable width is optional), opened from the log row, from My Work and from meetings. Component `ExecItemPanel({data,save,itemId,onClose})`, rendered by `ExecutionView`. Mockup screen 2.

- Header: type pill + number, title (click to edit), status pill, close ×. A "⋯" menu: שנה סטטוס (manual override among the type's statuses), פתח מחדש (closed items → `execRespond kind:'reopen'`), מחק פריט (askConfirm; removes from `doc.execItems`; only `myOfficeRole()` admin/superadmin or the creator).
- Body (two columns ≥ 720px, stacked below): 
  - **Thread** — each response as a card: party chip, name, date, body (pre-wrap), files (links). Between cards, when `ballTo` changed: "↳ הכדור עבר ל[chip]". Response kinds styled: `open` (פתח), `answer` (תשובה רשמית, highlighted border), `close` (נסגר), `reopen`, `revision` ("הוגשה Rev B"), `decision` (decision pill + notes).
  - **Composer**: author party select + name (default architect + current user name `CURRENT_USER.name`), textarea, attach files (`uploadAttachment`), "העבר את הכדור ל:" segmented (קבלן / מפקח / יועץ ▾ with name input / אדריכל / ללא שינוי), buttons: "שלח" (kind reply), for RFI "תשובה רשמית" (kind answer; default ball → contractor), "סגור" (kind close, askConfirm). For Issue: "סמן כנפתר" (close). For Submittal the composer is replaced by the **rounds** block: list of revisions (Rev label, submitted date, files, decision pill, notes, decided by/at); when the last revision has no decision: decision buttons אושר / אושר עם הערות / נדחה – להגשה מחדש with notes textarea (`execDecide`); when rejected: "+ הגשה חוזרת (Rev X)" with files and name (`execAddRevision`). A plain comment composer is still available under the rounds (kind reply, no status change).
  - **Side info**: הכדור אצל (chip), ממתין N ימי עבודה, יעד (DateField editable; red if passed), נפתח ע"י, תחום / סעיף מפרט (editable), אחראי במשרד (team select), מקור (source kind + link to the meeting when `source.kind==='meeting'`), **ימי המתנה לפי צד** (`execBallDays`: stacked bar + rows).
  - **Links**: list of linked tasks (open the task: navigate like My Tasks' `openInProject` / or switch to the ongoing tab and open the task sidebar — find the existing mechanism used for "open task in project", e.g. `searchGo` or `ph:go-hub`); "+ צור משימה מקושרת": small form — stage sheet select (list sheets of `data.sheets` with `type==='list'`), group = first group, title default `עדכון לפי {number}: {title}`, assignee (team, optional), due date; creates the task in that sheet (follow how `CreateItemDialog` creates tasks, including `uid()`, `statusId:'N'`, activity log if the app records one) with `execRef:{itemId, number}` on the task, and adds `{kind:'task',sheetId,taskId}` to the item's links. Show the reverse link in the task side panel: in `TaskDetailSidebar`, when `task.execRef` exists, show a small row "נוצרה מ־RFI-014" (read-only; clicking dispatches an event that opens the execution tab with that item — reuse the `ph:go-hub` event with `{tab:'supervision', execItemId}` and handle it in NihulHubView + ExecutionView).
- All writes go through one helper `const updateItem=(id,fn)=>save({...data,execItems:(data.execItems||[]).map(x=>x.id===id?fn(x):x)})`.

Commit: `feat(project-hub): execution item panel — thread, ball handoff, submittal rounds, links`.

---

### Task 4: "העבודה שלי" — execution items where the ball is with me

- In the My Tasks loader (the `loaded.forEach(p => { const doc = docOf(p); … })` loop that builds `tasks`), also collect `execForMe(doc.execItems||[], CURRENT_USER.id, iManageIt)` into a separate array `execMine` with `{...item, __projId:p.id, mtProject:p.name, mtProjCode:p.code, mtProjColor:p.color, waiting: execWaiting(item, today)}`.
- In `MtPlanner` (planner mode) add a section at the top of the attention pane: **"פריטי ביצוע אצלי (N)"**, rows: type pill + number, title, project code chip, "ממתין N ימים" (red > 7), sorted by waiting desc. Row click → open the project on the execution tab with that item (`ph:go-hub` / the existing open-in-project route + `execItemId`). Hidden when empty. Add a quick type filter chips row only if N > 5 (YAGNI otherwise).
- In list mode (`MyTasksTable`) do not mix them in this round.
- Keep the existing attention buckets unchanged.

Commit: `feat(project-hub): my work shows execution items where the ball is with us`.

---

### Task 5: Meeting summaries integration

In `MeetingTable` (new A4 editor):
- A button next to "+ נושא": **"+ משוך פריטים פתוחים"** (only when the project has open exec items). It adds (or refreshes, if it exists) a topic titled "פריטים פתוחים" with one item per open exec item: `topic` = `${number} ${title}`, `assignee` = discipline, `person` = `execPartyLabel(ball)`, `dueDate` = item.dueDate, plus `execRef:{itemId,number,type}` on the meeting item. Refresh = add missing ones, update text/ball/date of existing ones (match by `execRef.itemId`), keep user-added rows.
- Meeting items with `execRef` render a type pill before the text (screen and print) and, under the due date, small "פתוח N ימים" (calendar days since createdAt, matching the mockup) — print included.
- Row menu gains **"פתח כ־Issue / RFI / הגשה"** (for rows without execRef): creates an exec item via `execNewItem` (title = row text, source `{kind:'meeting',ref:meeting.id}`, opened by architect, ball → contractor for Issue/RFI? → use: Issue ball contractor, RFI ball architect, Submittal ball contractor), saves it to `doc.execItems` immediately (like linking a task), and sets `execRef` on the row.
- Clicking the pill on a row opens the exec item (event → execution tab).
- `followUpMeeting` (meeting-logic) keeps `execRef` when copying (unlike task links) — add a unit test to tests/meeting-logic.test.js.

Commit: `feat(project-hub): meetings pull open execution items and open new ones`.

---

### Task 6: Translations + full browser verification

- English entries in `i18n-dict.js` for all new Hebrew UI strings (grep the new components); run `node tools/i18n-extract.js` (exit 1 is normal) and make sure none of the new strings are gaps. User content (titles, bodies, names) gets `data-i18n-skip`.
- Browser walk-through on "אולם ספורט לוד" (local): switch phase to ביצוע; create RFI, Issue, Submittal; reply and hand the ball around; RFI official answer → close; submittal reject → Rev B → approve with notes; create a linked task and see the reverse link in the task panel; My Work planner shows the items with the ball at the architect; a new meeting pulls open items, opens a new Issue from a row; PDF print preview markup of the log; dark mode; English; no console errors. Then delete every test item, task and meeting created, and set the phase back to תכנון.

Commit: `feat(project-hub): execution track translations`.
