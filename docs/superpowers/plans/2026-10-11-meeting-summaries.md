# Meeting Summaries — A4 Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat, hand-numbered meeting items with an A4 page editor: topics with automatic numbering, items and sub-items, assignee (discipline + person), due date with "carried from" note, reorderable topics, photos in an appendix, saved participant lists, and "new meeting based on the previous one".

**Architecture:** Pure logic in a marked `meeting-logic` block inside `project_hub_01.html`, unit-tested by extracting the block (same pattern as `admin-logic`). UI: a new `MeetingTable` and `MeetingParticipants` replace `MeetingItemsTable` and the participants section of `MeetingEditor`; `MeetingsView` gets a "new meeting" chooser. Old meetings are migrated in memory on open (`migrateMeeting`) and saved only when the user presses שמור. One table serves screen and print.

**Tech Stack:** Single-file pre-compiled React 18 (`React.createElement`, no JSX), CRLF line endings, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-11-meeting-summaries-design.md`

---

## Conventions for every task

- The app is one file, `project_hub_01.html`, with very long lines and CRLF endings. Edit it with a small Node script that replaces exact anchors and **asserts each anchor occurs exactly once**:

  ```js
  // save as <scratchpad>/patch-N.js and run: node <scratchpad>/patch-N.js project_hub_01.html
  const fs = require('fs'); const F = process.argv[2]; let s = fs.readFileSync(F, 'utf8');
  const N = x => x.replace(/\r?\n/g, '\r\n');
  const once = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error('anchor x' + n + ': ' + a.slice(0, 80)); s = s.replace(a, () => N(b)); };
  // once(ANCHOR, REPLACEMENT); ...
  fs.writeFileSync(F, s); console.log('ok');
  ```
  Put code that contains regexes or backslashes in `String.raw` templates.
- Syntax check after every edit (must print `scripts 3`):
  ```bash
  node -e "const s=require('fs').readFileSync('project_hub_01.html','utf8');let n=0;for(const m of s.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)){new Function(m[1]);n++;}console.log('scripts',n)"
  ```
- Tests: `node --test tests/*.test.js` (all must pass).
- Hooks available at top level: `useState,useEffect,useCallback,useRef,useMemo,useContext`. Use `React.useLayoutEffect` for layout effects.
- Existing helpers used below: `uid()`, `todayISO()`, `projList(data,key)`, `visOpts(list)`, `DISCIPLINE_FULL_NAMES`, `DateField`, `askConfirm(msg,opts)`, `uploadAttachment(blob,name)` (returns URL), `fitMenuInView(el)`, `nameForLang(s)`, `RegisterLinkUI.useConsultantRows(data,disciplines)`, `CreateItemDialog({data,save,item,meeting,onClose,onCreate})`, `SHOW_GOALS`.
- Commit after each task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `meeting-logic` block + unit tests

**Files:**
- Create: `tests/meeting-logic.test.js`
- Modify: `project_hub_01.html` (insert block immediately before `function MeetingsView(`)

- [ ] **Step 1: Write the failing test file**

```js
// Run: node --test tests/meeting-logic.test.js
// Loads the meeting-logic block straight from project_hub_01.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'project_hub_01.html'), 'utf8');
const m = html.match(/\/\* ═══ meeting-logic ═══ \*\/([\s\S]*?)\/\* ═══ \/meeting-logic ═══ \*\//);
if (!m) throw new Error('meeting-logic block not found in project_hub_01.html');
let n = 0;
const uid = () => 'u' + ++n;
const L = new Function('uid', m[1] + '\nreturn {migrateMeeting,meetingRows,indentItem,outdentItem,moveItem,moveSectionTo,followUpMeeting,prevMeetingOf,photoAppendix,assigneeText,mtgDate,mtgNewItem,mergeParticipants};')(uid);

const old = { id: 'M1', date: '2026-09-28', trackId: null, participants: [{ id: 'p', name: 'דנה' }], items: [
  { id: 'a', number: '1', topic: 'לוחות זמנים' },
  { id: 'b', number: '1.1', topic: 'גנט מעקב', assignee: 'PM', dueDate: '2026-10-15', itemType: 'task', createdTaskTrackId: 's1' },
  { id: 'c', number: '1.1.1', topic: 'מיזוג' },
  { id: 'd', number: '2', topic: 'בטיחות', assignee: 'PM', dueDate: '2026-10-15' },
  { id: 'e', number: 'x', topic: 'בלי מספר' }
] };

test('migrateMeeting: whole numbers become topics, x.y items, x.y.z sub-items', () => {
  n = 0;
  const r = L.migrateMeeting(old);
  assert.deepStrictEqual(r.sections.map(s => s.title), ['לוחות זמנים', 'בטיחות']);
  const b = r.items.find(i => i.id === 'b');
  assert.strictEqual(b.sectionId, r.sections[0].id);
  assert.strictEqual(b.parentId, null);
  assert.strictEqual(b.itemType, 'task');
  assert.strictEqual(r.items.find(i => i.id === 'c').parentId, 'b');
});

test('migrateMeeting: a topic row with its own assignee/date also becomes its first item', () => {
  const r = L.migrateMeeting(old);
  const d = r.items.find(i => i.id === 'd');
  assert.strictEqual(d.sectionId, r.sections[1].id);
  assert.strictEqual(d.topic, 'בטיחות');
  assert.strictEqual(d.dueDate, '2026-10-15');
});

test('migrateMeeting: an unnumbered row goes under the last topic; new-format meetings are returned as is', () => {
  const r = L.migrateMeeting(old);
  assert.strictEqual(r.items.find(i => i.id === 'e').sectionId, r.sections[1].id);
  assert.strictEqual(L.migrateMeeting(r), r);
  const empty = L.migrateMeeting({ id: 'z', items: [{ id: 'q', number: '', topic: 'x' }] });
  assert.deepStrictEqual(empty.sections.map(s => s.title), ['כללי']);
});

test('migrateMeeting: old-format items added to an already-converted meeting are converted too', () => {
  const conv = L.migrateMeeting(old);
  const mixed = { ...conv, items: [...conv.items, { id: 'f', number: '3', topic: 'חדש מהקונקטור' }] };
  const r = L.migrateMeeting(mixed);
  assert.strictEqual(r.sections.length, 3);
  assert.ok(r.items.every(i => i.sectionId));
});

const conv = () => { n = 0; return L.migrateMeeting(old); };

test('meetingRows numbers topics, items and sub-items from the order', () => {
  const rows = L.meetingRows(conv());
  assert.deepStrictEqual(rows.map(r => r.number), ['1', '2']);
  assert.strictEqual(rows[0].items[0].number, '1.1');
  assert.strictEqual(rows[0].items[0].subs[0].number, '1.1.1');
  assert.deepStrictEqual(rows[1].items.map(x => x.number), ['2.1', '2.2']);
});

test('moveSectionTo renumbers', () => {
  const m2 = conv();
  const moved = { ...m2, sections: L.moveSectionTo(m2.sections, m2.sections[1].id, 0) };
  const rows = L.meetingRows(moved);
  assert.strictEqual(rows[0].section.title, 'בטיחות');
  assert.strictEqual(rows[1].items[0].number, '2.1');
});

test('indentItem makes an item a sub-item of the previous one (with its own subs); outdentItem undoes it', () => {
  const m2 = conv();
  const sec = m2.sections[1].id;
  const ind = L.indentItem(m2.items, 'e');
  assert.strictEqual(ind.find(i => i.id === 'e').parentId, 'd');
  assert.strictEqual(L.indentItem(m2.items, 'd'), m2.items, 'first item cannot indent');
  const out = L.outdentItem(ind, 'e');
  const rows = L.meetingRows({ ...m2, items: out });
  assert.deepStrictEqual(rows[1].items.map(x => x.item.id), ['d', 'e']);
  assert.ok(out.every(i => i.sectionId === sec || i.sectionId === m2.sections[0].id));
});

test('outdentItem: later siblings become sub-items of the outdented item, order kept', () => {
  const items = [
    { id: 'p', sectionId: 's', parentId: null }, { id: 'x', sectionId: 's', parentId: 'p' },
    { id: 'y', sectionId: 's', parentId: 'p' }, { id: 'z', sectionId: 's', parentId: 'p' }
  ];
  const out = L.outdentItem(items, 'y');
  const rows = L.meetingRows({ sections: [{ id: 's', title: '' }], items: out });
  assert.deepStrictEqual(rows[0].items.map(r => [r.item.id, r.subs.map(s => s.item.id)]), [['p', ['x']], ['y', ['z']]]);
});

test('moveItem swaps with the neighbouring sibling only', () => {
  const m2 = conv();
  const out = L.moveItem(m2.items, 'e', -1);
  assert.deepStrictEqual(L.meetingRows({ ...m2, items: out })[1].items.map(x => x.item.id), ['e', 'd']);
  assert.strictEqual(L.moveItem(m2.items, 'b', -1), m2.items);
});

test('followUpMeeting copies topics and items, marks carriedFrom from the first meeting, drops photos and links', () => {
  const m2 = conv();
  m2.items[0].photos = [{ id: 'ph', url: '/x.png' }];
  m2.items[1] = { ...m2.items[1], carriedFrom: { meetingId: 'M0', date: '2026-09-01' } };
  const f = L.followUpMeeting(m2, { id: 'M2', date: '2026-10-11' });
  assert.strictEqual(f.basedOnMeetingId, 'M1');
  assert.strictEqual(f.items.length, m2.items.length);
  assert.ok(f.items.every(i => i.photos.length === 0 && !i.itemType && !i.linkedRecordId));
  assert.deepStrictEqual(f.items[0].carriedFrom, { meetingId: 'M1', date: '2026-09-28' });
  assert.deepStrictEqual(f.items[1].carriedFrom, { meetingId: 'M0', date: '2026-09-01' });
  const sub = f.items.find(i => i.parentId);
  assert.ok(f.items.some(i => i.id === sub.parentId), 'sub-item points at the copied parent');
  assert.ok(f.items.every(i => f.sections.some(s => s.id === i.sectionId)));
  assert.notStrictEqual(f.participants[0].id, 'p');
});

test('prevMeetingOf picks the latest meeting of the same track', () => {
  const ms = [{ id: 'a', date: '2026-09-01', trackId: null }, { id: 'b', date: '2026-10-01', trackId: null }, { id: 'c', date: '2026-11-01', trackId: 't1' }];
  assert.strictEqual(L.prevMeetingOf(ms, null).id, 'b');
  assert.strictEqual(L.prevMeetingOf(ms, 't1').id, 'c');
  assert.strictEqual(L.prevMeetingOf(ms, 't2'), null);
});

test('photoAppendix letters photos in item order', () => {
  const m2 = conv();
  m2.items = m2.items.map(i => i.id === 'c' ? { ...i, photos: [{ id: 'p1', url: '1' }] } : i.id === 'd' ? { ...i, photos: [{ id: 'p2', url: '2' }, { id: 'p3', url: '3' }] } : i);
  assert.deepStrictEqual(L.photoAppendix(m2).map(a => [a.letter, a.number]), [["א'", '1.1.1'], ["ב'", '2.1'], ["ג'", '2.1']]);
});

test('assigneeText, mtgDate, mtgNewItem, mergeParticipants', () => {
  const lbl = id => ({ STRC: 'קונסטרוקציה' })[id] || id;
  assert.strictEqual(L.assigneeText({ assignee: 'STRC', person: 'יוסי' }, lbl), 'קונסטרוקציה – יוסי');
  assert.strictEqual(L.assigneeText({ assignee: null, person: 'יוסי' }, lbl), 'יוסי');
  assert.strictEqual(L.assigneeText({ assignee: 'לידיעה', person: '' }, lbl), 'לידיעה');
  assert.strictEqual(L.mtgDate('2026-10-15'), '15/10/2026');
  assert.strictEqual(L.mtgDate(''), '');
  const it = L.mtgNewItem('s', null);
  assert.deepStrictEqual([it.sectionId, it.parentId, it.topic, it.photos], ['s', null, '', []]);
  const merged = L.mergeParticipants([{ id: '1', name: 'דנה' }], [{ name: 'דנה' }, { name: 'יוסי', role: 'קונסטרוקטור' }]);
  assert.deepStrictEqual(merged.map(p => p.name), ['דנה', 'יוסי']);
  assert.ok(merged[1].id);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/meeting-logic.test.js`
Expected: FAIL — `meeting-logic block not found in project_hub_01.html`

- [ ] **Step 3: Insert the block before `function MeetingsView(`**

Anchor: `function MeetingsView({data,save,trackId=null,openMeetingId=null,onConsumeOpen}){` — replacement = the block below followed by the same anchor text.

```js
/* ═══ meeting-logic ═══ */
/* Meeting summaries: topics (sections) hold items; an item with parentId is a sub-item.
   Numbers are never stored — meetingRows derives them from the order. */
const MTG_LETTERS='אבגדהוזחטיכלמנסעפצקרשת';
function mtgNewItem(sectionId,parentId){return{id:uid(),sectionId,parentId:parentId||null,topic:'',assignee:null,person:'',dueDate:'',startDate:'',carriedFrom:null,photos:[],itemType:null,createdTaskTrackId:null,linkedRecordId:null,linkedRecordKind:null};}
function mtgDate(iso){if(!iso)return '';const[y,mo,d]=String(iso).split('-');return d&&mo&&y?d+'/'+mo+'/'+y:'';}
function migrateMeeting(m){
  const all=m.items||[];
  if(Array.isArray(m.sections)&&all.every(it=>it.sectionId))return m;
  const sections=[...(m.sections||[])];
  const kept=all.filter(it=>it.sectionId);
  const items=[];
  const secByNum={},itemByNum={};
  let lastSec=sections.length?sections[sections.length-1]:null;
  const general=()=>{if(!lastSec){lastSec={id:uid(),title:'כללי'};sections.push(lastSec);}return lastSec;};
  const base=it=>({...mtgNewItem(null,null),id:it.id||uid(),topic:it.topic||'',assignee:it.assignee||null,person:it.person||'',dueDate:it.dueDate||'',startDate:it.startDate||'',carriedFrom:it.carriedFrom||null,photos:it.photos||[],itemType:it.itemType||null,createdTaskTrackId:it.createdTaskTrackId||null,linkedRecordId:it.linkedRecordId||null,linkedRecordKind:it.linkedRecordKind||null});
  for(const it of all.filter(x=>!x.sectionId)){
    const segs=String(it.number||'').trim().split('.').filter(Boolean);
    const valid=segs.length>0&&segs.every(x=>/^\d+$/.test(x));
    if(valid&&segs.length===1){
      const sec={id:uid(),title:it.topic||''};sections.push(sec);secByNum[segs[0]]=sec;lastSec=sec;
      if(it.assignee||it.dueDate||it.startDate||it.itemType||it.linkedRecordId)items.push({...base(it),sectionId:sec.id});
      continue;
    }
    const parent=valid&&segs.length>=3?itemByNum[segs.slice(0,2).join('.')]:null;
    if(parent){items.push({...base(it),sectionId:parent.sectionId,parentId:parent.id});continue;}
    const sec=valid&&secByNum[segs[0]];
    if(sec){const x={...base(it),sectionId:sec.id};items.push(x);itemByNum[segs.slice(0,2).join('.')]=x;continue;}
    items.push({...base(it),sectionId:general().id});
  }
  return{...m,sections,items:[...kept,...items]};
}
function meetingRows(m){
  const items=m.items||[];
  return(m.sections||[]).map((section,si)=>{
    const n=String(si+1);
    const tops=items.filter(it=>it.sectionId===section.id&&!it.parentId);
    return{section,number:n,items:tops.map((item,ii)=>{const num=n+'.'+(ii+1);return{item,number:num,subs:items.filter(x=>x.parentId===item.id).map((x,k)=>({item:x,number:num+'.'+(k+1)}))};})};
  });
}
function indentItem(items,id){
  const it=items.find(x=>x.id===id);if(!it||it.parentId)return items;
  const tops=items.filter(x=>x.sectionId===it.sectionId&&!x.parentId);
  const i=tops.findIndex(x=>x.id===id);if(i<1)return items;
  const prev=tops[i-1];
  return items.map(x=>x.id===id||x.parentId===id?{...x,parentId:prev.id}:x);
}
function outdentItem(items,id){
  const it=items.find(x=>x.id===id);if(!it||!it.parentId)return items;
  const sibs=items.filter(x=>x.parentId===it.parentId);
  const later=sibs.slice(sibs.findIndex(x=>x.id===id)+1).map(x=>x.id);
  const rest=items.filter(x=>x.id!==id);
  let last=rest.findIndex(x=>x.id===it.parentId);
  rest.forEach((x,k)=>{if(x.parentId===it.parentId&&!later.includes(x.id)&&k>last)last=k;});
  const out=[...rest.slice(0,last+1),{...it,parentId:null},...rest.slice(last+1)];
  return out.map(x=>later.includes(x.id)?{...x,parentId:id}:x);
}
function moveItem(items,id,dir){
  const it=items.find(x=>x.id===id);if(!it)return items;
  const sibs=items.filter(x=>x.sectionId===it.sectionId&&(x.parentId||null)===(it.parentId||null));
  const j=sibs.findIndex(x=>x.id===id)+dir;if(j<0||j>=sibs.length)return items;
  const a=items.indexOf(it),b=items.indexOf(sibs[j]);const out=items.slice();out[a]=sibs[j];out[b]=it;return out;
}
function moveSectionTo(sections,id,to){
  const from=sections.findIndex(s=>s.id===id);if(from<0||to<0||to>=sections.length||from===to)return sections;
  const out=sections.slice();const[s]=out.splice(from,1);out.splice(to,0,s);return out;
}
function followUpMeeting(prev,{id,date}){
  const m=migrateMeeting(prev);const secMap={},itemMap={};
  const sections=(m.sections||[]).map(s=>{const x={id:uid(),title:s.title};secMap[s.id]=x.id;return x;});
  (m.items||[]).forEach(it=>{itemMap[it.id]=uid();});
  const items=(m.items||[]).map(it=>({...it,id:itemMap[it.id],sectionId:secMap[it.sectionId],parentId:it.parentId?itemMap[it.parentId]||null:null,carriedFrom:it.carriedFrom||{meetingId:m.id,date:m.date||''},photos:[],itemType:null,createdTaskTrackId:null,linkedRecordId:null,linkedRecordKind:null}));
  return{id,trackId:m.trackId??null,title:m.title||'',date,participants:(m.participants||[]).map(p=>({...p,id:uid()})),sections,items,recordedBy:m.recordedBy||'',distribution:m.distribution||'',createdAt:new Date().toISOString(),basedOnMeetingId:m.id};
}
function prevMeetingOf(meetings,trackId){
  const same=(meetings||[]).filter(m=>(m.trackId??null)===(trackId??null));if(!same.length)return null;
  return same.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
}
function photoAppendix(m){
  const out=[];
  meetingRows(m).forEach(r=>r.items.forEach(x=>[x,...x.subs].forEach(e=>(e.item.photos||[]).forEach(photo=>{const k=out.length;out.push({letter:k<MTG_LETTERS.length?MTG_LETTERS[k]+"'":String(k+1),number:e.number,item:e.item,photo});}))));
  return out;
}
function assigneeText(item,labelOf){
  const d=item.assignee?(item.assignee==='לידיעה'?'לידיעה':labelOf(item.assignee)):'';
  const p=String(item.person||'').trim();
  return d&&p?d+' – '+p:d||p;
}
function mergeParticipants(current,members){
  const have=new Set((current||[]).map(p=>p.name));
  return[...(current||[]),...(members||[]).filter(p=>p.name&&!have.has(p.name)).map(p=>({id:uid(),name:p.name,role:p.role||'',firm:p.firm||'',isCustom:false}))];
}
/* ═══ /meeting-logic ═══ */
```

- [ ] **Step 4: Run tests — all pass**

Run: `node --test tests/*.test.js` — expected: all pass, including the 13 new tests. Run the syntax check — `scripts 3`.

- [ ] **Step 5: Commit**

```bash
git add tests/meeting-logic.test.js project_hub_01.html
git commit -m "feat(project-hub): meeting-logic — topics, numbering, migration, follow-up"
```

---

### Task 2: A4 page and table styles

**Files:** Modify `project_hub_01.html` (CSS)

- [ ] **Step 1: Add styles**

Anchor (exactly once): `.meeting-print-only { display: none; }` — replace with the block below followed by the anchor.

```css
/* Meeting summary — an A4 sheet on screen, the same sheet in print */
.mtg-page{width:210mm;max-width:100%;margin:0 auto 40px;padding:15mm;box-sizing:border-box;background:#fff;color:#111;box-shadow:0 1px 6px rgba(0,0,0,.14);font-size:12px;line-height:1.5}
.mtg-page input,.mtg-page select,.mtg-page textarea{color:#111}
.mtg-table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:14px}
.mtg-table th{background:#efefef;border:1px solid #222;padding:6px;font-weight:700;text-align:center}
.mtg-table td{border-left:1px solid #222;border-right:1px solid #222;padding:4px 6px;vertical-align:top}
.mtg-table tbody.mtg-sec{border-top:1px solid #222;border-bottom:1px solid #222;break-inside:avoid}
.mtg-table tbody.mtg-dragging{opacity:.45}
.mtg-num{text-align:center;position:relative}
.mtg-drag{position:absolute;top:4px;inset-inline-start:-16px;cursor:grab;color:#999;font-size:11px;letter-spacing:-2px;user-select:none}
.mtg-text{display:block;width:100%;border:none;outline:none;background:transparent;resize:none;font:inherit;color:inherit;line-height:1.5;padding:0;overflow:hidden;min-height:18px}
.mtg-text:focus{background:rgba(99,102,241,.07)}
.mtg-text-b{font-weight:600}
.mtg-line{display:flex;gap:6px;align-items:flex-start;position:relative}
.mtg-sub{padding-inline-start:24px}
.mtg-n{color:#555;min-width:30px;flex-shrink:0}
.mtg-carried{font-size:10px;color:#666;margin-top:2px}
.mtg-photo-ref{font-size:10px;color:#555;white-space:nowrap;flex-shrink:0}
.mtg-chip{font-size:10px;color:var(--accent);border:1px solid var(--accent);border-radius:9px;padding:0 6px;white-space:nowrap;flex-shrink:0}
.mtg-sel,.mtg-person{width:100%;font-size:11px;font-family:inherit;border:1px solid #ddd;border-radius:4px;padding:2px 4px;background:#fff;box-sizing:border-box}
.mtg-person{margin-top:3px}
.mtg-menu-btn{border:none;background:none;cursor:pointer;color:#999;font-size:14px;padding:0 3px;line-height:1.2;opacity:0}
.mtg-line:hover .mtg-menu-btn,.mtg-menu-btn.open{opacity:1}
.mtg-menu{position:absolute;top:100%;inset-inline-end:0;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.14);z-index:300;min-width:170px;padding:4px 0}
.mtg-menu button{display:block;width:100%;text-align:start;border:none;background:none;padding:6px 12px;font:inherit;font-size:12px;color:inherit;cursor:pointer}
.mtg-menu button:hover{background:var(--bg)}
.mtg-menu hr{border:none;border-top:1px solid var(--border);margin:4px 0}
.mtg-sec-tools{display:flex;gap:4px;margin-top:6px;opacity:0}
.mtg-sec:hover .mtg-sec-tools{opacity:1}
.mtg-tool{border:1px solid #ddd;background:#fff;border-radius:4px;font-size:10px;padding:1px 6px;cursor:pointer;color:#555;font-family:inherit}
.mtg-add{margin-top:10px;border:1px dashed #bbb;background:none;border-radius:6px;padding:5px 12px;font:inherit;font-size:12px;color:#555;cursor:pointer}
.mtg-appendix{margin-top:28px;break-before:page}
.mtg-app-title{font-size:14px;font-weight:700;margin-bottom:10px}
.mtg-app-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mtg-fig{margin:0;position:relative;break-inside:avoid}
.mtg-fig img{width:100%;max-height:90mm;object-fit:contain;border:1px solid #ddd}
.mtg-fig figcaption{font-size:11px;color:#333;margin-top:3px}
.mtg-fig-x{position:absolute;top:4px;inset-inline-end:4px;border:none;background:rgba(0,0,0,.55);color:#fff;border-radius:4px;cursor:pointer;font-size:11px}
.mtg-pp{position:relative;display:inline-block}
.mtg-pop{position:absolute;top:calc(100% + 4px);inset-inline-start:0;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:200;min-width:230px;max-height:280px;overflow-y:auto;padding:6px 0;font-size:12px}
.mtg-pop-row{display:flex;align-items:center;gap:6px;padding:6px 12px;cursor:pointer}
.mtg-pop-row:hover{background:var(--bg)}
.mtg-pop-lbl{padding:6px 12px 2px;font-size:10px;color:var(--text-3)}
```

Then, inside the existing `@media print {` block, add right after `.meeting-print-hide { display: none !important; }`:

```css
  .mtg-page { width: auto !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
  .meeting-doc .mtg-table th, .meeting-doc .mtg-table td { padding: 4px 6px; font-size: 10pt; }
  .meeting-doc .mtg-table td { border-top: none; border-bottom: none; border-left: 1px solid #222; border-right: 1px solid #222; }
  .meeting-doc .mtg-table th { border: 1px solid #222; background: #efefef !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
```

(The generic `.meeting-doc th, .meeting-doc td { border: 1px solid #ccc }` rule would otherwise draw lines between items of one topic.)

- [ ] **Step 2: Syntax check, commit**

```bash
git commit -am "feat(project-hub): A4 meeting page styles"
```

---

### Task 3: `MeetingTable` — topics, items, sub-items, keyboard, links

**Files:** Modify `project_hub_01.html` — insert `MtgText` and `MeetingTable` immediately before `function MeetingEditor(`. (The old `MeetingItemsTable` is removed in Task 5.)

- [ ] **Step 1: Insert the components**

`MeetingTable` receives `onChange(patchOrFn)`: either an object merged into the meeting, or a function `prev => patch` (used after async uploads, so it never writes a stale copy).

```js
function MtgText({value,onChange,onKeyDown,placeholder,dataId,bold}){
  const ref=useRef(null);
  React.useLayoutEffect(()=>{const el=ref.current;if(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}},[value]);
  return React.createElement("textarea",{ref,rows:1,value:value||'',placeholder,"data-mtg-item":dataId,"data-i18n-skip":"",className:"mtg-text"+(bold?" mtg-text-b":""),onChange:e=>onChange(e.target.value),onKeyDown});
}
function MeetingTable({data,save,meeting,onChange}){
  const h=React.createElement;
  const sections=meeting.sections||[];const items=meeting.items||[];
  const disciplines=projList(data,'disciplines');
  const discOptions=[{id:'',label:'—'},...visOpts(disciplines).map(d=>({id:d.id,label:d.label})),{id:'לידיעה',label:'לידיעה'}];
  const labelOf=id=>DISCIPLINE_FULL_NAMES[id]||(discOptions.find(o=>o.id===id)||{}).label||id;
  const ITEM_TYPES=[{id:'task',label:'משימה'},{id:'subtask',label:'תת-משימה'},{id:'update',label:'עדכון'},{id:'principle',label:'עקרון תכנון'},{id:'milestone',label:'אבן דרך'},...(SHOW_GOALS?[{id:'goal',label:'יעד'}]:[])];
  const rows=meetingRows(meeting);
  const appendix=photoAppendix(meeting);
  const order=rows.flatMap(r=>r.items.flatMap(x=>[x.item.id,...x.subs.map(s=>s.item.id)]));
  const[focusId,setFocusId]=useState(null);
  const[menuId,setMenuId]=useState(null);
  const[createItemFor,setCreateItemFor]=useState(null);
  const[dragSec,setDragSec]=useState(null);
  const fileRef=useRef(null);const photoFor=useRef(null);
  useEffect(()=>{if(!menuId)return;const c=()=>setMenuId(null);document.addEventListener('click',c);return()=>document.removeEventListener('click',c);},[menuId]);
  useEffect(()=>{if(!focusId)return;const el=document.querySelector('[data-mtg-item="'+focusId+'"]');if(el){el.focus();const L=el.value.length;el.setSelectionRange(L,L);}setFocusId(null);},[focusId]);
  const setItems=next=>onChange({items:next});
  const setSections=next=>onChange({sections:next});
  const updateItem=(id,patch)=>onChange(prev=>({items:(prev.items||[]).map(it=>it.id===id?{...it,...patch}:it)}));
  const insertAt=(idx,item)=>{const out=items.slice();out.splice(idx,0,item);setItems(out);setFocusId(item.id);};
  const endOf=id=>{let k=items.findIndex(x=>x.id===id);items.forEach((x,i)=>{if(x.parentId===id&&i>k)k=i;});return k;};
  const addItem=sectionId=>{let k=-1;items.forEach((x,i)=>{if(x.sectionId===sectionId)k=i;});insertAt(k<0?items.length:k+1,mtgNewItem(sectionId,null));};
  const addSection=()=>{const sec={id:uid(),title:''};const it=mtgNewItem(sec.id,null);onChange(prev=>({sections:[...(prev.sections||[]),sec],items:[...(prev.items||[]),it]}));setFocusId('sec-'+sec.id);};
  const deleteItem=id=>{if(id===createItemFor)setCreateItemFor(null);setItems(items.filter(x=>x.id!==id&&x.parentId!==id));};
  const deleteSection=async sec=>{const has=items.some(x=>x.sectionId===sec.id&&x.topic);if(has&&!(await askConfirm('למחוק את הנושא וכל הסעיפים שבו?',{confirmLabel:'מחק'})))return;onChange(prev=>({sections:(prev.sections||[]).filter(s=>s.id!==sec.id),items:(prev.items||[]).filter(x=>x.sectionId!==sec.id)}));};
  const onKey=(e,it)=>{
    if(e.nativeEvent&&e.nativeEvent.isComposing)return;
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const n=mtgNewItem(it.sectionId,it.parentId);insertAt(it.parentId?items.indexOf(it)+1:endOf(it.id)+1,n);return;}
    if(e.key==='Tab'){e.preventDefault();setItems(e.shiftKey?outdentItem(items,it.id):indentItem(items,it.id));setFocusId(it.id);return;}
    if(e.key==='Backspace'&&!it.topic&&!items.some(x=>x.parentId===it.id)){e.preventDefault();const i=order.indexOf(it.id);deleteItem(it.id);setFocusId(order[i-1]||null);}
  };
  const uploadPhotos=async(itemId,files)=>{
    for(const f of Array.from(files||[]).filter(f=>/^image\//.test(f.type))){
      try{const url=await uploadAttachment(f,f.name);onChange(prev=>({items:(prev.items||[]).map(it=>it.id===itemId?{...it,photos:[...(it.photos||[]),{id:uid(),url,name:f.name}]}:it)}));}
      catch(err){alert(tx('העלאת התמונה נכשלה')+': '+err.message);}
    }
  };
  const removePhoto=(itemId,photoId)=>updateItem(itemId,{photos:(items.find(x=>x.id===itemId).photos||[]).filter(p=>p.id!==photoId)});
  const linkItemAsRecord=(item,kind)=>{const disc=item.assignee&&item.assignee!=='לידיעה'?item.assignee:'';const id=uid();if(kind==='principle'){save({...data,standalonePrinciples:[...(data.standalonePrinciples||[]),{id,description:item.topic||'',discipline:disc,createdAt:item.startDate||todayISO(),sourceMeetingId:meeting.id,sourceMeetingItemId:item.id}]});}else if(kind==='goal'){save({...data,licensingGoals:[...(data.licensingGoals||[]),{id,title:item.topic||'',targetDate:item.dueDate||'',startDate:todayISO(),status:'not_started',done:false,stageId:null}]});}else if(kind==='milestone'){save({...data,licensingMilestones:[...(data.licensingMilestones||[]),{id,title:item.topic||'',date:item.dueDate||'',startDate:todayISO(),status:'not_started',done:false,stageId:null}]});}updateItem(item.id,{linkedRecordId:id,linkedRecordKind:kind});};
  const linkAs=(item,type)=>{updateItem(item.id,{itemType:type});setMenuId(null);if(type==='principle'||type==='goal'||type==='milestone')linkItemAsRecord(item,type);else setCreateItemFor(item.id);};
  const menu=(item,isSub)=>h("span",{className:"meeting-print-hide",style:{position:'relative',flexShrink:0}},
    h("button",{className:"mtg-menu-btn"+(menuId===item.id?' open':''),title:"אפשרויות",onClick:e=>{e.stopPropagation();setMenuId(m=>m===item.id?null:item.id);}},"⋯"),
    menuId===item.id&&h("div",{className:"mtg-menu","data-pop":"",ref:fitMenuInView,onClick:e=>e.stopPropagation()},
      h("button",{onClick:()=>{photoFor.current=item.id;setMenuId(null);fileRef.current&&fileRef.current.click();}},"📷 הוסף תמונה"),
      h("button",{onClick:()=>{setItems(moveItem(items,item.id,-1));setMenuId(null);}},"↑ הזז למעלה"),
      h("button",{onClick:()=>{setItems(moveItem(items,item.id,1));setMenuId(null);}},"↓ הזז למטה"),
      isSub?h("button",{onClick:()=>{setItems(outdentItem(items,item.id));setMenuId(null);}},"⇤ הפוך לסעיף"):h("button",{onClick:()=>{setItems(indentItem(items,item.id));setMenuId(null);}},"⇥ הפוך לתת סעיף"),
      h("hr"),
      ...ITEM_TYPES.map(t=>h("button",{key:t.id,onClick:()=>linkAs(item,t.id)},"קשר כ"+t.label)),
      item.itemType&&h("button",{onClick:()=>{updateItem(item.id,{itemType:null,createdTaskTrackId:null,linkedRecordId:null,linkedRecordKind:null});setMenuId(null);}},"נקה קישור"),
      h("hr"),
      h("button",{style:{color:'#EF4444'},onClick:()=>{deleteItem(item.id);setMenuId(null);}},"✕ מחק סעיף")));
  const extras=item=>{const letters=appendix.filter(a=>a.item.id===item.id).map(a=>a.letter);const t=item.itemType&&ITEM_TYPES.find(x=>x.id===item.itemType);return[
    letters.length>0&&h("span",{key:'p',className:"mtg-photo-ref"},"📷 נספח ",letters.join(", ")),
    t&&h("span",{key:'c',className:"mtg-chip meeting-print-hide"},t.label," ↗")];};
  const line=(e,isSub)=>h("div",{key:e.item.id,className:"mtg-line"+(isSub?" mtg-sub":"")},
    h("span",{className:"mtg-n"},e.number),
    h(MtgText,{value:e.item.topic,dataId:e.item.id,placeholder:isSub?"תת סעיף":"תיאור הסעיף",onChange:v=>updateItem(e.item.id,{topic:v}),onKeyDown:ev=>onKey(ev,e.item)}),
    ...extras(e.item),menu(e.item,isSub));
  const dropPhotos=itemId=>({onDragOver:e=>{if(!dragSec&&e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files'))e.preventDefault();},onDrop:e=>{if(dragSec||!e.dataTransfer||!e.dataTransfer.files.length)return;e.preventDefault();e.stopPropagation();uploadPhotos(itemId,e.dataTransfer.files);}});
  const itemCells=x=>[
    h("td",{key:'d',...dropPhotos(x.item.id)},line(x,false),x.subs.map(s=>line(s,true))),
    h("td",{key:'a'},
      h("select",{className:"mtg-sel meeting-print-hide",value:x.item.assignee||'',onChange:e=>updateItem(x.item.id,{assignee:e.target.value||null})},discOptions.map(o=>h("option",{key:o.id,value:o.id},o.label))),
      h("input",{className:"mtg-person meeting-print-hide",list:"mtg-people","data-i18n-skip":"",value:x.item.person||'',placeholder:"שם",onChange:e=>updateItem(x.item.id,{person:e.target.value})}),
      h("div",{className:"meeting-print-only","data-i18n-skip":""},assigneeText(x.item,labelOf))),
    h("td",{key:'t'},
      h("div",{className:"meeting-print-hide"},h(DateField,{value:x.item.dueDate||'',onChange:v=>updateItem(x.item.id,{dueDate:v}),style:{fontSize:11}})),
      h("div",{className:"meeting-print-only"},mtgDate(x.item.dueDate)),
      x.item.carriedFrom&&h("div",{className:"mtg-carried"},"מישיבה ",mtgDate(x.item.carriedFrom.date)))];
  return h("div",null,
    h("datalist",{id:"mtg-people"},(meeting.participants||[]).map(p=>h("option",{key:p.id,value:p.name}))),
    h("input",{ref:fileRef,type:"file",accept:"image/*",multiple:true,style:{display:'none'},onChange:e=>{const id=photoFor.current;const fs=e.target.files;if(id&&fs)uploadPhotos(id,fs);e.target.value='';}}),
    h("table",{className:"mtg-table"},
      h("colgroup",null,h("col",{style:{width:'7%'}}),h("col",{style:{width:'17%'}}),h("col",null),h("col",{style:{width:'18%'}}),h("col",{style:{width:'14%'}})),
      h("thead",null,h("tr",null,h("th",null,"#"),h("th",null,"נושא"),h("th",null,"תיאור"),h("th",null,"אחראי"),h("th",null,"לטיפול"))),
      rows.map((r,si)=>{const span=Math.max(1,r.items.length);return h("tbody",{key:r.section.id,className:"mtg-sec"+(dragSec===r.section.id?" mtg-dragging":""),
        onDragOver:e=>{if(dragSec)e.preventDefault();},
        onDrop:e=>{if(!dragSec)return;e.preventDefault();if(dragSec!==r.section.id)setSections(moveSectionTo(sections,dragSec,si));setDragSec(null);}},
        (r.items.length?r.items:[null]).map((x,ii)=>h("tr",{key:x?x.item.id:'empty'},
          ii===0&&h("td",{rowSpan:span,className:"mtg-num"},
            h("span",{className:"mtg-drag meeting-print-hide",draggable:true,title:"גרור לשינוי סדר הנושאים",onDragStart:e=>{setDragSec(r.section.id);e.dataTransfer.effectAllowed='move';},onDragEnd:()=>setDragSec(null)},"⋮⋮"),
            r.number),
          ii===0&&h("td",{rowSpan:span},
            h(MtgText,{value:r.section.title,dataId:'sec-'+r.section.id,placeholder:"נושא",bold:true,onChange:v=>setSections(sections.map(s=>s.id===r.section.id?{...s,title:v}:s)),onKeyDown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!(e.nativeEvent&&e.nativeEvent.isComposing)){e.preventDefault();const first=items.find(i=>i.sectionId===r.section.id&&!i.parentId);if(first)setFocusId(first.id);else addItem(r.section.id);}}}),
            h("div",{className:"mtg-sec-tools meeting-print-hide"},
              h("button",{className:"mtg-tool",onClick:()=>addItem(r.section.id)},"+ סעיף"),
              h("button",{className:"mtg-tool",title:"הזז למעלה",onClick:()=>setSections(moveSectionTo(sections,r.section.id,si-1))},"↑"),
              h("button",{className:"mtg-tool",title:"הזז למטה",onClick:()=>setSections(moveSectionTo(sections,r.section.id,si+1))},"↓"),
              h("button",{className:"mtg-tool",title:"מחק נושא",onClick:()=>deleteSection(r.section)},"✕"))),
          x?itemCells(x):h("td",{colSpan:3},h("button",{className:"mtg-tool meeting-print-hide",onClick:()=>addItem(r.section.id)},"+ סעיף")))));})),
    h("button",{className:"mtg-add meeting-print-hide",onClick:addSection},"+ נושא"),
    appendix.length>0&&h("div",{className:"mtg-appendix"},
      h("div",{className:"mtg-app-title"},"נספח תמונות"),
      h("div",{className:"mtg-app-grid"},appendix.map(a=>h("figure",{key:a.photo.id,className:"mtg-fig"},
        h("img",{src:a.photo.url,alt:""}),
        h("figcaption",{"data-i18n-skip":""},a.letter," · סעיף ",a.number,a.item.topic?" — "+a.item.topic.slice(0,70):""),
        h("button",{className:"mtg-fig-x meeting-print-hide",title:"הסר תמונה",onClick:()=>removePhoto(a.item.id,a.photo.id)},"✕"))))),
    createItemFor&&h(CreateItemDialog,{data,save,item:items.find(it=>it.id===createItemFor),meeting,onClose:()=>setCreateItemFor(null),onCreate:sheetId=>{updateItem(createItemFor,{createdTaskTrackId:sheetId});setCreateItemFor(null);}}));
}
```

Check `tx` exists (`grep -c "function tx(\|const tx=" project_hub_01.html` ≥ 1); if not, use the plain string.

- [ ] **Step 2: Syntax check, run tests, commit**

```bash
git commit -am "feat(project-hub): MeetingTable — numbered topics, items, sub-items, photos, links"
```

---

### Task 4: `MeetingParticipants` — saved lists, consultants, manual

**Files:** Modify `project_hub_01.html` — insert `MeetingParticipants` before `function MeetingEditor(` (after `MeetingTable`).

- [ ] **Step 1: Insert the component**

```js
function MeetingParticipants({data,save,m,update}){
  const h=React.createElement;
  const lists=data.participantLists||[];
  const allPersons=[...(data.team||[]).map(p=>({key:'team-'+p.id,name:p.name,role:p.projectRole||p.role||'',firm:''})),...RegisterLinkUI.useConsultantRows(data,data.disciplines||DISCIPLINES).flatMap(c=>(c.contacts||[]).map(ct=>({key:'con-'+c.id+'-'+ct.name,name:ct.name||c.firm,role:c.discipline||c.firm||'',firm:c.firm||''})))].filter(p=>p.name);
  const participants=m.participants||[];
  const used=new Set(participants.map(p=>p.name));
  const available=allPersons.filter(p=>!used.has(p.name));
  const[open,setOpen]=useState(null);// 'load' | 'pick' | 'custom' | 'save' | null
  const[name,setName]=useState('');const[role,setRole]=useState('');
  const[listName,setListName]=useState('');
  const[renaming,setRenaming]=useState(null);const[renameDraft,setRenameDraft]=useState('');
  const ref=useRef(null);
  useEffect(()=>{if(!open||open==='custom')return;const c=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(null);};document.addEventListener('mousedown',c);return()=>document.removeEventListener('mousedown',c);},[open]);
  const saveLists=next=>save({...data,participantLists:next});
  const members=()=>participants.map(p=>({name:p.name,role:p.role||'',firm:p.firm||''}));
  const saveAsNew=()=>{if(!listName.trim())return;saveLists([...lists,{id:uid(),name:listName.trim(),members:members()}]);setListName('');setOpen(null);};
  const overwrite=async l=>{if(!(await askConfirm('לעדכן את הרשימה "'+l.name+'" למשתתפים הנוכחיים?',{confirmLabel:'עדכן'})))return;saveLists(lists.map(x=>x.id===l.id?{...x,members:members()}:x));setOpen(null);};
  const removeList=async l=>{if(!(await askConfirm('למחוק את הרשימה "'+l.name+'"?',{confirmLabel:'מחק'})))return;saveLists(lists.filter(x=>x.id!==l.id));};
  const commitRename=l=>{if(renameDraft.trim())saveLists(lists.map(x=>x.id===l.id?{...x,name:renameDraft.trim()}:x));setRenaming(null);};
  const addCustom=()=>{if(!name.trim())return;update({participants:[...participants,{id:uid(),name:name.trim(),role:role.trim(),firm:'',isCustom:true}]});setName('');setRole('');setOpen(null);};
  const btn=(label,key)=>h("button",{className:"mtg-tool",style:{fontSize:12,padding:'4px 10px'},onClick:()=>setOpen(o=>o===key?null:key)},label);
  const line=participants.map(p=>p.role?p.name+' ('+p.role+')':p.name).join(', ');
  return h("div",{style:{marginTop:10}},
    h("div",{"data-i18n-skip":"",style:{fontSize:12}},h("b",null,"נכחו: "),line||h("span",{className:"meeting-print-hide",style:{color:'#999'}},"אין משתתפים עדיין")),
    participants.length>0&&h("div",{className:"meeting-print-hide",style:{display:'flex',flexWrap:'wrap',gap:4,marginTop:6}},participants.map(p=>h("span",{key:p.id,"data-i18n-skip":"",style:{fontSize:11,border:'1px solid #ddd',borderRadius:10,padding:'1px 8px',display:'inline-flex',gap:4,alignItems:'center'}},nameForLang(p.name),p.role?h("span",{style:{color:'#888'}},nameForLang(p.role)):null,h("button",{title:"הסר",onClick:()=>update({participants:participants.filter(x=>x.id!==p.id)}),style:{border:'none',background:'none',cursor:'pointer',color:'#999',fontSize:11,padding:0}},"✕")))),
    h("div",{ref,className:"meeting-print-hide",style:{display:'flex',gap:6,marginTop:8,flexWrap:'wrap',alignItems:'flex-start'}},
      h("span",{className:"mtg-pp"},btn("טען רשימה ▾",'load'),open==='load'&&h("div",{className:"mtg-pop"},
        lists.length===0&&h("div",{className:"mtg-pop-lbl"},"אין רשימות שמורות. הוסף משתתפים ולחץ \"שמור כרשימה\"."),
        lists.map(l=>h("div",{key:l.id,className:"mtg-pop-row",onClick:()=>{if(renaming)return;update({participants:mergeParticipants(participants,l.members)});setOpen(null);}},
          renaming===l.id?h("input",{autoFocus:true,value:renameDraft,onClick:e=>e.stopPropagation(),onChange:e=>setRenameDraft(e.target.value),onBlur:()=>commitRename(l),onKeyDown:e=>{if(e.key==='Enter')commitRename(l);if(e.key==='Escape')setRenaming(null);},style:{flex:1,fontSize:12}}):h("span",{"data-i18n-skip":"",style:{flex:1}},l.name,h("span",{style:{color:'var(--text-3)',fontSize:10}}," · ",l.members.length)),
          h("button",{className:"mtg-tool",title:"שנה שם",onClick:e=>{e.stopPropagation();setRenaming(l.id);setRenameDraft(l.name);}},"✎"),
          h("button",{className:"mtg-tool",title:"מחק רשימה",onClick:e=>{e.stopPropagation();removeList(l);}},"✕"))))),
      h("span",{className:"mtg-pp"},btn("+ משתתף",'pick'),open==='pick'&&h("div",{className:"mtg-pop"},
        available.length===0&&h("div",{className:"mtg-pop-lbl"},"כל אנשי הפרויקט כבר ברשימה"),
        available.map(p=>h("div",{key:p.key,className:"mtg-pop-row",onClick:()=>{update({participants:[...participants,{id:uid(),name:p.name,role:p.role,firm:p.firm,isCustom:false}]});setOpen(null);}},
          h("span",{"data-i18n-skip":"",style:{flex:1}},nameForLang(p.name),p.role&&h("span",{style:{color:'var(--text-3)',fontSize:10}}," · ",nameForLang(p.role))))))),
      btn("+ הזנה ידנית",'custom'),
      open==='custom'&&h("span",{style:{display:'inline-flex',gap:4}},
        h("input",{autoFocus:true,value:name,onChange:e=>setName(e.target.value),placeholder:"שם",style:{fontSize:12,width:110}}),
        h("input",{value:role,onChange:e=>setRole(e.target.value),onKeyDown:e=>{if(e.key==='Enter')addCustom();},placeholder:"תפקיד",style:{fontSize:12,width:110}}),
        h("button",{className:"mtg-tool",onClick:addCustom},"הוסף")),
      participants.length>0&&h("span",{className:"mtg-pp"},btn("שמור כרשימה",'save'),open==='save'&&h("div",{className:"mtg-pop",style:{padding:8}},
        h("div",{style:{display:'flex',gap:4}},h("input",{autoFocus:true,value:listName,onChange:e=>setListName(e.target.value),onKeyDown:e=>{if(e.key==='Enter')saveAsNew();},placeholder:"שם רשימה חדשה",style:{flex:1,fontSize:12}}),h("button",{className:"mtg-tool",onClick:saveAsNew},"שמור")),
        lists.length>0&&h("div",{className:"mtg-pop-lbl"},"או עדכן רשימה קיימת:"),
        lists.map(l=>h("div",{key:l.id,className:"mtg-pop-row","data-i18n-skip":"",onClick:()=>overwrite(l)},l.name))))));
}
```

- [ ] **Step 2: Syntax check, commit**

```bash
git commit -am "feat(project-hub): meeting participants — saved lists, consultants, manual"
```

---

### Task 5: Wire into `MeetingEditor`, remove the old table

**Files:** Modify `project_hub_01.html`

- [ ] **Step 1: Migrate on open and accept functional updates**

```
once("function MeetingEditor({data,save,meeting,onBack,onSave}){\nconst[m,setM]=useState(meeting);\nconst update=patch=>{const next={...m,...patch};setM(next);};",
     "function MeetingEditor({data,save,meeting,onBack,onSave}){\nconst[m,setM]=useState(()=>migrateMeeting(meeting));\nconst update=patch=>setM(prev=>({...prev,...(typeof patch==='function'?patch(prev):patch)}));");
```
(Line breaks in the anchor are CRLF in the file — the `N()` helper only applies to the replacement, so write the anchor with `\r\n`.)

- [ ] **Step 2: Replace the document body**

In `MeetingEditor`, everything from the element with `className:"meeting-doc"` to the end of the function is replaced. Locate it with:
- start: `/*#__PURE__*/React.createElement("div",{className:"meeting-doc",style:{flex:1,overflowY:'auto',padding:'32px 48px',maxWidth:860,margin:'0 auto',width:'100%',boxSizing:'border-box'}},`
- end: the first occurrence after the start of `'תפוצה: ',m.distribution)))));}` (end of the function).

Assert both are found and the end comes after the start, then replace the whole span with:

```js
React.createElement("div",{className:"meeting-doc",style:{flex:1,overflowY:'auto',padding:'24px 16px',background:'var(--bg)'}},
React.createElement("div",{className:"mtg-page"},
React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12}},
React.createElement("div",{style:{flex:1}},
React.createElement("div",{"data-i18n-skip":"",style:{fontSize:17,fontWeight:700}},data.projectName||tx('פרויקט')),
React.createElement("input",{value:m.title,onChange:e=>update({title:e.target.value}),placeholder:'נושא הישיבה',style:{fontSize:14,fontWeight:600,border:'none',borderBottom:'1px solid #ddd',outline:'none',background:'transparent',width:'100%',fontFamily:'inherit',marginTop:4,padding:'2px 0'}})),
React.createElement("div",{className:"meeting-print-hide"},React.createElement(DateField,{value:m.date||'',onChange:v=>update({date:v}),style:{fontSize:12}})),
React.createElement("div",{className:"meeting-print-only",style:{fontSize:12}},mtgDate(m.date))),
React.createElement(MeetingParticipants,{data:data,save:save,m:m,update:update}),
React.createElement(MeetingTable,{data:data,save:save,meeting:m,onChange:update}),
React.createElement("div",{style:{display:'flex',gap:12,marginTop:18,flexWrap:'wrap',fontSize:12}},
React.createElement("label",{style:{flex:1,minWidth:180}},'רשם: ',React.createElement("input",{value:m.recordedBy||'',onChange:e=>update({recordedBy:e.target.value}),placeholder:'שם הרושם',style:{border:'none',borderBottom:'1px solid #ddd',outline:'none',background:'transparent',fontFamily:'inherit',fontSize:12,width:'70%'}})),
React.createElement("label",{style:{flex:2,minWidth:240}},'תפוצה: ',React.createElement("input",{value:m.distribution||'',onChange:e=>update({distribution:e.target.value}),placeholder:'רשימת תפוצה',style:{border:'none',borderBottom:'1px solid #ddd',outline:'none',background:'transparent',fontFamily:'inherit',fontSize:12,width:'80%'}}))))));}
```

The old participants block (`allPersons`, `showPicker`, `customName`… declared at the top of `MeetingEditor`) is now unused — delete those declarations too: from `const allPersons=` through `const attendeesLine=…join(', ');` (inclusive). Assert `showPicker` and `attendeesLine` no longer occur in the file afterwards.

- [ ] **Step 3: Remove `MeetingItemsTable` and `buildPrintGroups`**

Delete from `function buildPrintGroups(items){` up to (not including) `function MtgText(` — this span contains only `buildPrintGroups` and `MeetingItemsTable`. Assert afterwards: `MeetingItemsTable`, `buildPrintGroups`, `meeting-print-table` (in JS) no longer occur, except the two CSS rules for `.meeting-print-table` which may stay.

- [ ] **Step 4: Syntax check, tests, commit**

```bash
git commit -am "feat(project-hub): meeting editor uses the A4 table and participant lists"
```

---

### Task 6: New meeting chooser in `MeetingsView`

**Files:** Modify `project_hub_01.html`

- [ ] **Step 1: Replace `openNew` with a chooser**

```
once("const openNew=()=>{const m={id:uid(),trackId:trackId,title:'',date:todayISO(),participants:[],items:[],recordedBy:'',distribution:'',createdAt:new Date().toISOString()};save({...data,meetings:[...allMeetings,m]});setEditId(m.id);};",
     "const[newMenu,setNewMenu]=useState(false);const prevMeeting=prevMeetingOf(allMeetings,trackId);const createMeeting=m=>{save({...data,meetings:[...allMeetings,m]});setEditId(m.id);setNewMenu(false);};const blankMeeting=participants=>{const sec={id:uid(),title:''};return{id:uid(),trackId:trackId,title:'',date:todayISO(),participants:participants||[],sections:[sec],items:[mtgNewItem(sec.id,null)],recordedBy:'',distribution:'',createdAt:new Date().toISOString()};};const openNew=()=>setNewMenu(o=>!o);");
```

Then replace the "+ ישיבה חדשה" button so it opens a menu:

```
once('/*#__PURE__*/React.createElement("button",{onClick:openNew,style:{padding:\'7px 16px\',fontSize:12,borderRadius:7,border:\'none\',background:\'var(--accent)\',color:\'#fff\',cursor:\'pointer\',fontFamily:\'inherit\',fontWeight:600}},"+ ישיבה חדשה")',
     `React.createElement("span",{className:"mtg-pp"},/*#__PURE__*/React.createElement("button",{onClick:openNew,style:{padding:'7px 16px',fontSize:12,borderRadius:7,border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:600}},"+ ישיבה חדשה ▾"),newMenu&&React.createElement("div",{className:"mtg-pop","data-pop":"",style:{insetInlineStart:'auto',insetInlineEnd:0}},
React.createElement("div",{className:"mtg-pop-row",onClick:()=>createMeeting(blankMeeting())},"ישיבה ריקה"),
prevMeeting&&React.createElement("div",{className:"mtg-pop-row",onClick:()=>createMeeting(followUpMeeting(prevMeeting,{id:uid(),date:todayISO()}))},React.createElement("span",{"data-i18n-skip":""},"על בסיס הישיבה הקודמת · ",prevMeeting.title||'ישיבה'," ",mtgDate(prevMeeting.date))),
(data.participantLists||[]).length>0&&React.createElement("div",{className:"mtg-pop-lbl"},"ריקה, עם רשימת משתתפים:"),
(data.participantLists||[]).map(l=>React.createElement("div",{key:l.id,className:"mtg-pop-row","data-i18n-skip":"",onClick:()=>createMeeting(blankMeeting(mergeParticipants([],l.members)))},l.name))))`);
```

Close the menu on outside click: add after `const openNew=…;` in the same replacement:
`useEffect(()=>{if(!newMenu)return;const c=e=>{if(!e.target.closest('.mtg-pp'))setNewMenu(false);};document.addEventListener('mousedown',c);return()=>document.removeEventListener('mousedown',c);},[newMenu]);`

Note: `MeetingsView` returns early when `editId` is set, *before* the JSX — the `useState`/`useEffect` added above sit before that early return (they are inside the `openNew` replacement, which precedes `if(editId)`), so hook order stays stable.

- [ ] **Step 2: Fix the meeting card count**

The list card shows `m.items.length` items. Keep it, but count only top-level items: replace the exact text `m.items.length>0&&` with `(m.items||[]).length>0&&` and the following `m.items.length` in that card with `(m.items||[]).filter(i=>!i.parentId).length` (inspect the card code first: `grep -o "m.items.length.\{0,120\}" project_hub_01.html`).

- [ ] **Step 3: Syntax check, tests, commit**

```bash
git commit -am "feat(project-hub): new meeting — blank, from the previous meeting, or from a participant list"
```

---

### Task 7: Translations and browser verification

**Files:** Modify `i18n-dict.js`

- [ ] **Step 1: Add English entries** for every new Hebrew UI string. Append before the final `\r\n});` of `i18n-dict.js`, one `JSON.stringify(key)+': '+JSON.stringify(value)+','` per line:

| Hebrew | English |
|---|---|
| נושא | Topic |
| תיאור | Description |
| אחראי | Responsible |
| לטיפול | Due |
| תיאור הסעיף | Item description |
| תת סעיף | Sub-item |
| שם | Name |
| מישיבה | From meeting |
| 📷 הוסף תמונה | 📷 Add photo |
| ↑ הזז למעלה | ↑ Move up |
| ↓ הזז למטה | ↓ Move down |
| ⇤ הפוך לסעיף | ⇤ Make item |
| ⇥ הפוך לתת סעיף | ⇥ Make sub-item |
| נקה קישור | Clear link |
| ✕ מחק סעיף | ✕ Delete item |
| + סעיף | + Item |
| + נושא | + Topic |
| נספח תמונות | Photo appendix |
| נספח | Appendix |
| סעיף | Item |
| הסר תמונה | Remove photo |
| העלאת התמונה נכשלה | Photo upload failed |
| למחוק את הנושא וכל הסעיפים שבו? | Delete the topic and all its items? |
| גרור לשינוי סדר הנושאים | Drag to reorder topics |
| מחק נושא | Delete topic |
| נכחו: | Present: |
| אין משתתפים עדיין | No participants yet |
| טען רשימה ▾ | Load list ▾ |
| + משתתף | + Participant |
| + הזנה ידנית | + Add manually |
| שמור כרשימה | Save as list |
| שם רשימה חדשה | New list name |
| או עדכן רשימה קיימת: | Or update an existing list: |
| כל אנשי הפרויקט כבר ברשימה | Everyone in the project is already listed |
| שנה שם | Rename |
| מחק רשימה | Delete list |
| נושא הישיבה | Meeting subject |
| רשם: | Recorded by: |
| תפוצה: | Distribution: |
| + ישיבה חדשה ▾ | + New meeting ▾ |
| ישיבה ריקה | Blank meeting |
| על בסיס הישיבה הקודמת · | Based on the previous meeting · |
| ריקה, עם רשימת משתתפים: | Blank, with a participant list: |
| קשר כ | Link as |

Skip any key that already exists (`grep -c '"KEY"' i18n-dict.js`). Then run `node tools/i18n-extract.js` — it exits 1 whenever any gaps exist anywhere (normal); confirm none of the strings above are listed as gaps.

- [ ] **Step 2: Browser verification** (preview server `project-hub`, port 3403; open a project → ניהול תכנון → ישיבות):
  1. An existing meeting opens converted: topics numbered 1, 2…; items x.y; sub-items x.y.z; nothing lost (compare with the old item count). Press חזרה without שמור, reopen — stored data unchanged (`fetch` the project JSON and check `meetings[i].sections` is absent).
  2. Typing: Enter adds an item, Tab makes it a sub-item (number becomes x.y.1), Shift+Tab back, Backspace on an empty item deletes it and focuses the previous one.
  3. Drag topic 2 above topic 1 — numbers update. ↑/↓ buttons too.
  4. Assignee: discipline + name prints as "קונסטרוקציה – יוסי" (use the print preview: `window.print` is fine to skip; instead toggle `document.body.classList` is not needed — check `.meeting-print-only` text via `read_page`).
  5. Add a photo to item 1.2 (menu → 📷) — "📷 נספח א'" appears beside it and the appendix shows the photo captioned "א' · סעיף 1.2".
  6. "+ ישיבה חדשה ▾" → "על בסיס הישיבה הקודמת": topics and items copied, each due cell shows "מישיבה DD/MM/YYYY", no photos, no link chips.
  7. Participants: "+ משתתף" from consultants, "+ הזנה ידנית", "שמור כרשימה" (new), then a new blank meeting "עם רשימת משתתפים" loads them; rename and delete a list.
  8. Link an item as משימה through the menu — CreateItemDialog opens and the chip shows.
  9. A4: the page is 210 mm wide; dark mode keeps the sheet white with dark text.
  10. No console errors. Delete the test meeting and test list afterwards.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(project-hub): meeting summaries translations"
```

---

## Self-review notes

- Spec coverage: page structure (T2, T3, T5), numbering (T1 `meetingRows`), assignee (T1 `assigneeText`, T3), keyboard (T3), reorder (T1, T3), photos + appendix (T1, T3), links kept (T3), new meeting options (T1, T6), participant lists (T4, T6), migration (T1, T5), print (T2), stage 2 out of scope.
- Connector (`tools/local-server/mcp.js`) still writes old-format items; `migrateMeeting` converts them on open, including into an already-converted meeting (tested).
- Names used across tasks: `migrateMeeting`, `meetingRows`, `indentItem`, `outdentItem`, `moveItem`, `moveSectionTo`, `followUpMeeting`, `prevMeetingOf`, `photoAppendix`, `assigneeText`, `mtgDate`, `mtgNewItem`, `mergeParticipants`, `MtgText`, `MeetingTable`, `MeetingParticipants`.
