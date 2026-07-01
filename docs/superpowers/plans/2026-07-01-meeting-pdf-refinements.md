# Meeting PDF Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six refinements to the meeting-minutes print output in `project_hub.html`: smaller print font, indented/numbered sub-items, a folded-in third nesting level, full discipline names, and reverting the single `dueDate` field back to a `startDate`/`dueDate` pair edited via the app's existing `DateRangeCell` component and split into two columns in print.

**Architecture:** All changes live in `project_hub.html` — a single-page React 18 app with no build step (plain `React.createElement` calls, no JSX/Babel). Three edits: one CSS tweak, one small data-model/consumer fix (mirrors the shape of an earlier task in this same file's history), and one full rewrite of `MeetingItemsTable` that reuses the existing `DateRangeCell`/`CalendarRangePicker` components already used elsewhere in the file for task dates.

**Tech Stack:** React 18 (UMD, no build), plain CSS, `node --check` for syntax validation (no test framework exists in this repo).

**Spec:** [docs/superpowers/specs/2026-07-01-meeting-pdf-refinements-design.md](../specs/2026-07-01-meeting-pdf-refinements-design.md)

---

## Important: how "testing" works in this plan

Same as the previous plan for this feature: this repo has no test framework. Every task's verification step is `node --check` on the extracted inline `<script>`, run with this exact command from the repo root (`C:\Users\Omega\Database`):

```bash
node -e "
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const text=fs.readFileSync('project_hub.html','utf8');
const start=text.indexOf('<script>')+'<script>'.length;
const end=text.lastIndexOf('</script>');
const out=path.join(os.tmpdir(),'ph_syntax_check.js');
fs.writeFileSync(out,text.slice(start,end));
cp.execFileSync(process.execPath,['--check',out],{stdio:'inherit'});
console.log('SYNTAX_OK');
"
```

Expected output ends with `SYNTAX_OK`. Do not proceed past a failing check — re-read the block you just inserted for a missing/extra `(`, `{`, or `}`.

**For Task 3's big rewrite:** fetch the current exact `MeetingItemsTable` line yourself via Grep/Read immediately before editing (it's one very long physical line) — don't try to transcribe it from this plan. The **new** code is given here in full.

---

### Task 1: Print CSS — font size 10

**Files:**
- Modify: `project_hub.html` (CSS `<style>` block)

- [ ] **Step 1: Confirm the anchor text is unique**

Run:
```bash
grep -c "font-size: 11pt" project_hub.html
```
Expected: `1`.

- [ ] **Step 2: Change it**

Use the Edit tool. `old_string`:
```
  .meeting-doc th, .meeting-doc td { border: 1px solid #ccc; padding: 6px 10px; font-size: 11pt; }
```
`new_string`:
```
  .meeting-doc th, .meeting-doc td { border: 1px solid #ccc; padding: 6px 10px; font-size: 10pt; }
```

- [ ] **Step 3: Run the syntax check**

Run the command from the "Important" section above. Expected: `SYNTAX_OK`.

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "style(meetings): shrink print table font to 10pt"
```

---

### Task 2: Revert meeting item dates to startDate/dueDate pair

**Files:**
- Modify: `project_hub.html` (`migrateMeeting`, `CreateItemDialog`)

- [ ] **Step 1: Confirm anchor text is unique, then fix `migrateMeeting`**

Run:
```bash
grep -c "function migrateMeeting(m){return{...m,recordedBy:m.recordedBy||'',distribution:m.distribution||'',items:(m.items||\[\]).map(it=>({...it,dueDate:it.dueDate??it.endDate??it.startDate??null}))};}" project_hub.html
```
Expected: `1`.

Use the Edit tool. `old_string`:
```
function migrateMeeting(m){return{...m,recordedBy:m.recordedBy||'',distribution:m.distribution||'',items:(m.items||[]).map(it=>({...it,dueDate:it.dueDate??it.endDate??it.startDate??null}))};}
```
`new_string`:
```
function migrateMeeting(m){return{...m,recordedBy:m.recordedBy||'',distribution:m.distribution||'',items:(m.items||[]).map(it=>({...it,startDate:it.startDate??null,dueDate:it.dueDate??null}))};}
```

This keeps whatever `dueDate` a previously-migrated item already has (the prior migration already put a usable value there), and simply ensures `startDate` exists (defaulting to `null` — the original start date for items migrated under the *previous* plan was already discarded then, which was already documented as an accepted one-time loss).

- [ ] **Step 2: Fix `CreateItemDialog`'s date mapping**

Run:
```bash
grep -c "startDate:item&&item.dueDate||'',dueDate:item&&item.dueDate||''" project_hub.html
```
Expected: `1`.

Use the Edit tool. `old_string`:
```
startDate:item&&item.dueDate||'',dueDate:item&&item.dueDate||''
```
`new_string`:
```
startDate:item&&item.startDate||'',dueDate:item&&item.dueDate||''
```

- [ ] **Step 3: Run the syntax check**

Run the command from the "Important" section. Expected: `SYNTAX_OK`.

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "fix(meetings): revert item dates to startDate/dueDate pair"
```

---

### Task 3: Rewrite `MeetingItemsTable` — DateRangeCell, 3-level grouping, discipline names, indent

**Files:**
- Modify: `project_hub.html` (`buildPrintGroups`, `MeetingItemsTable`)

- [ ] **Step 1: Fetch the current exact function text**

Run:
```bash
grep -n "function buildPrintGroups" project_hub.html
```
Use the Read tool at that line number. The line runs from `function buildPrintGroups(items){` through the end of `MeetingItemsTable` (up to, but not including, `function MeetingEditor({data,save,meeting,onBack,onSave}){` on the next line) — both functions are on the same physical line in this file. Copy that whole line exactly as your `old_string`; do not paraphrase or reformat it.

- [ ] **Step 2: Replace it**

Use the Edit tool with the exact current line as `old_string` and the following as `new_string`. This is complete, final code — insert it exactly as given:

```javascript
const DISCIPLINE_FULL_NAMES={ARCH:'אדריכל',STRC:'קונסטרוקטור',ELEC:'חשמל',ENVI:'סביבה',LAND:'נוף',TRAF:'תנועה',PM:'ניהול פרויקט',SAFE:'בטיחות',HVAC:'מיזוג אוויר',PLUM:'אינסטלציה',HYDR:'ניקוז',ACSS:'נגישות',GR:'קרקע',LIFT:'מעליות',TNDR:'מכרזים',AGRO:'אגרונומיה'};
const fmtDateNumeric=iso=>iso?iso.split('-').reverse().join('.'):'-';
function buildPrintGroups(items){
const groups=[];
let currentParent=null;
let currentChild=null;
items.forEach(it=>{
const segs=it.number.split('.');
if(segs.length===1){
currentParent={key:it.id,number:it.number,header:it,children:[]};
groups.push(currentParent);
currentChild=null;
}else if(segs.length===2){
const prefix=segs[0];
const child={item:it,grandchildren:[]};
if(currentParent&&currentParent.number===prefix){
currentParent.children.push(child);
}else{
currentParent={key:it.id,number:null,header:null,children:[child]};
groups.push(currentParent);
}
currentChild=child;
}else{
const prefix=segs.slice(0,2).join('.');
if(currentChild&&currentChild.item.number===prefix){
currentChild.grandchildren.push(it);
}else{
const standalone={item:it,grandchildren:[]};
groups.push({key:it.id,number:null,header:null,children:[standalone]});
currentChild=standalone;
}
}
});
return groups;
}
function MeetingItemsTable({data,save,meeting,onChange}){
const items=meeting.items||[];
const disciplines=data.disciplines||DISCIPLINES;
const[createItemFor,setCreateItemFor]=useState(null);
const[openMenuId,setOpenMenuId]=useState(null);
useEffect(()=>{if(!openMenuId)return;const h=e=>{setOpenMenuId(null);};document.addEventListener('click',h);return()=>document.removeEventListener('click',h);},[openMenuId]);
const ITEM_TYPES=[{id:'task',label:'משימה'},{id:'subtask',label:'תת-משימה'},{id:'update',label:'עדכון'},{id:'principle',label:'עקרון תכנון'},{id:'milestone',label:'אבן דרך'},{id:'goal',label:'יעד'}];
const addRow=()=>{const last=items[items.length-1];const n=last?String(parseInt(last.number||'0')+1):'1';onChange([...items,{id:uid(),number:n,topic:'',assignee:null,startDate:'',dueDate:'',itemType:null,createdTaskTrackId:null}]);};
const addSubRow=()=>{const last=items[items.length-1];const base=last?(last.number||'1').split('.')[0]:'1';const existing=items.filter(it=>it.number.startsWith(base+'.')&&it.number.split('.').length===2);const sub=existing.length+1;onChange([...items,{id:uid(),number:base+'.'+sub,topic:'',assignee:null,startDate:'',dueDate:'',itemType:null,createdTaskTrackId:null}]);};
const lastNum=items.length?items[items.length-1].number:'';
const lastSegs=lastNum.split('.');
const subSubBase=lastSegs.length>=2?lastSegs.slice(0,2).join('.'):null;
const addSubSubRow=()=>{if(!subSubBase)return;const existing=items.filter(it=>it.number.startsWith(subSubBase+'.')&&it.number.split('.').length===3);const sub=existing.length+1;onChange([...items,{id:uid(),number:subSubBase+'.'+sub,topic:'',assignee:null,startDate:'',dueDate:'',itemType:null,createdTaskTrackId:null}]);};
const updateItem=(id,patch)=>onChange(items.map(it=>it.id===id?{...it,...patch}:it));
const deleteItem=id=>{if(id===createItemFor)setCreateItemFor(null);onChange(items.filter(it=>it.id!==id));};
const discOptions=[{id:'',label:'—'},...disciplines.map(d=>({id:d.id,label:d.label})),{id:'לידיעה',label:'לידיעה'}];
const thStyle={textAlign:'right',padding:'6px 8px',color:'var(--text-2)',fontWeight:600,borderBottom:'2px solid var(--border)'};
const printGroups=buildPrintGroups(items);
const assigneeLabel=id=>id?(DISCIPLINE_FULL_NAMES[id]||(discOptions.find(o=>o.id===id)||{}).label||id):'';
return/*#__PURE__*/React.createElement("div",{style:{marginTop:24}},
/*#__PURE__*/React.createElement("table",{className:"meeting-print-hide",style:{width:'100%',borderCollapse:'collapse',fontSize:12,direction:'rtl'}},
/*#__PURE__*/React.createElement("thead",null,/*#__PURE__*/React.createElement("tr",null,
/*#__PURE__*/React.createElement("th",{style:{...thStyle,width:50}},"מס'"),
/*#__PURE__*/React.createElement("th",{style:thStyle},"נושא"),
/*#__PURE__*/React.createElement("th",{style:{...thStyle,width:100}},"לטיפול"),
/*#__PURE__*/React.createElement("th",{style:{...thStyle,width:160}},"תאריכים"),
/*#__PURE__*/React.createElement("th",{style:{width:60,borderBottom:'2px solid var(--border)'}}))),
/*#__PURE__*/React.createElement("tbody",null,items.map((item,idx)=>/*#__PURE__*/React.createElement("tr",{key:item.id,style:{borderBottom:'1px solid var(--border)',background:idx%2===0?'transparent':'rgba(0,0,0,.015)'}},
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("input",{value:item.number,onChange:e=>updateItem(item.id,{number:e.target.value}),style:{width:'100%',border:'none',outline:'none',background:'transparent',fontFamily:'inherit',fontSize:12,fontWeight:item.number.includes('.')?400:600,color:'var(--text)',direction:'rtl'}})),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("textarea",{value:item.topic,onChange:e=>updateItem(item.id,{topic:e.target.value}),rows:1,style:{width:'100%',border:'none',outline:'none',background:'transparent',fontFamily:'inherit',fontSize:12,color:'var(--text)',resize:'none',direction:'rtl',lineHeight:1.5,minHeight:22,overflow:'hidden',boxSizing:'border-box'},onInput:e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';}})),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("select",{value:item.assignee||'',onChange:e=>updateItem(item.id,{assignee:e.target.value||null}),style:{fontSize:11,border:'1px solid var(--border)',borderRadius:4,padding:'2px 4px',background:'var(--surface)',color:'var(--text)',fontFamily:'inherit',width:'100%'}},discOptions.map(o=>/*#__PURE__*/React.createElement("option",{key:o.id,value:o.id},o.label)))),
/*#__PURE__*/React.createElement(DateRangeCell,{startDate:item.startDate||'',dueDate:item.dueDate||'',onChange:(f,v)=>updateItem(item.id,{[f]:v})}),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 4px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:2,alignItems:'center'}},
/*#__PURE__*/React.createElement("button",{onClick:()=>deleteItem(item.id),style:{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:13,padding:'2px 4px',borderRadius:3},onMouseEnter:e=>e.currentTarget.style.color='#EF4444',onMouseLeave:e=>e.currentTarget.style.color='var(--text-3)'},'✕'),
/*#__PURE__*/React.createElement("div",{style:{position:'relative'}},
/*#__PURE__*/React.createElement("button",{onClick:e=>{e.stopPropagation();setOpenMenuId(o=>o===item.id?null:item.id);},style:{background:item.itemType?'rgba(99,102,241,.15)':'none',border:item.itemType?'1px solid var(--accent)':'1px solid var(--border)',borderRadius:4,cursor:'pointer',color:item.itemType?'var(--accent)':'var(--text-3)',fontSize:10,padding:'2px 5px',fontFamily:'inherit',whiteSpace:'nowrap'}},item.itemType?(ITEM_TYPES.find(t=>t.id===item.itemType)||{}).label||'⚙':'⚙'),
/*#__PURE__*/React.createElement("div",{style:{display:openMenuId===item.id?'block':'none',position:'absolute',top:'calc(100% + 2px)',left:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,boxShadow:'0 4px 12px rgba(0,0,0,.12)',zIndex:300,minWidth:120}},
ITEM_TYPES.map(type=>/*#__PURE__*/React.createElement("div",{key:type.id,onClick:e=>{e.stopPropagation();updateItem(item.id,{itemType:type.id});setOpenMenuId(null);setCreateItemFor(item.id);},style:{padding:'7px 12px',cursor:'pointer',fontSize:12,color:'var(--text)'},onMouseEnter:e=>e.currentTarget.style.background='var(--bg)',onMouseLeave:e=>e.currentTarget.style.background=''},type.label)),
/*#__PURE__*/React.createElement("div",{onClick:e=>{e.stopPropagation();updateItem(item.id,{itemType:null,createdTaskTrackId:null});setOpenMenuId(null);},style:{padding:'7px 12px',cursor:'pointer',fontSize:12,color:'var(--text-3)',borderTop:'1px solid var(--border)'},onMouseEnter:e=>e.currentTarget.style.background='var(--bg)',onMouseLeave:e=>e.currentTarget.style.background=''},'נקה'))))))))),
/*#__PURE__*/React.createElement("table",{className:"meeting-print-table",style:{fontSize:10}},
/*#__PURE__*/React.createElement("thead",null,/*#__PURE__*/React.createElement("tr",null,
/*#__PURE__*/React.createElement("th",{style:{width:32}},"מס'"),
/*#__PURE__*/React.createElement("th",null,"הנושא"),
/*#__PURE__*/React.createElement("th",{style:{width:80}},"לטיפול"),
/*#__PURE__*/React.createElement("th",{style:{width:75}},"תאריך התחלה"),
/*#__PURE__*/React.createElement("th",{style:{width:75}},"תאריך יעד"))),
/*#__PURE__*/React.createElement("tbody",null,printGroups.map(g=>{
if(g.header&&g.children.length>0){
return/*#__PURE__*/React.createElement(React.Fragment,{key:g.key},
/*#__PURE__*/React.createElement("tr",null,
/*#__PURE__*/React.createElement("td",{rowSpan:1+g.children.length,style:{textAlign:'center',verticalAlign:'top'}},g.number),
/*#__PURE__*/React.createElement("td",{className:"meeting-print-group-header"},g.header.topic),
/*#__PURE__*/React.createElement("td",null),
/*#__PURE__*/React.createElement("td",null),
/*#__PURE__*/React.createElement("td",null)),
g.children.map(c=>/*#__PURE__*/React.createElement("tr",{key:c.item.id},
/*#__PURE__*/React.createElement("td",{style:{paddingRight:16}},c.item.number,'  ',c.item.topic,c.grandchildren.length>0&&/*#__PURE__*/React.createElement("ul",{style:{margin:'4px 0 0',paddingRight:18,fontSize:9,listStyle:'none'}},c.grandchildren.map(gc=>/*#__PURE__*/React.createElement("li",{key:gc.id},gc.number,'  ',gc.topic)))),
/*#__PURE__*/React.createElement("td",null,assigneeLabel(c.item.assignee)),
/*#__PURE__*/React.createElement("td",null,fmtDateNumeric(c.item.startDate)),
/*#__PURE__*/React.createElement("td",null,fmtDateNumeric(c.item.dueDate)))));
}
if(g.header&&g.children.length===0){
return/*#__PURE__*/React.createElement("tr",{key:g.key},
/*#__PURE__*/React.createElement("td",{style:{textAlign:'center'}},g.number),
/*#__PURE__*/React.createElement("td",null,g.header.topic),
/*#__PURE__*/React.createElement("td",null,assigneeLabel(g.header.assignee)),
/*#__PURE__*/React.createElement("td",null,fmtDateNumeric(g.header.startDate)),
/*#__PURE__*/React.createElement("td",null,fmtDateNumeric(g.header.dueDate)));
}
return g.children.map(c=>/*#__PURE__*/React.createElement("tr",{key:c.item.id},
/*#__PURE__*/React.createElement("td",{style:{textAlign:'center'}},c.item.number),
/*#__PURE__*/React.createElement("td",null,c.item.topic,c.grandchildren.length>0&&/*#__PURE__*/React.createElement("ul",{style:{margin:'4px 0 0',paddingRight:18,fontSize:9,listStyle:'none'}},c.grandchildren.map(gc=>/*#__PURE__*/React.createElement("li",{key:gc.id},gc.number,'  ',gc.topic)))),
/*#__PURE__*/React.createElement("td",null,assigneeLabel(c.item.assignee)),
/*#__PURE__*/React.createElement("td",null,fmtDateNumeric(c.item.startDate)),
/*#__PURE__*/React.createElement("td",null,fmtDateNumeric(c.item.dueDate))));
}))),
createItemFor&&/*#__PURE__*/React.createElement(CreateItemDialog,{data:data,save:save,item:items.find(it=>it.id===createItemFor),onClose:()=>setCreateItemFor(null),onCreate:(sheetId,groupId,title)=>{updateItem(createItemFor,{createdTaskTrackId:sheetId});setCreateItemFor(null);}}),
/*#__PURE__*/React.createElement("div",{className:"meeting-print-hide",style:{display:'flex',gap:8,marginTop:12}},
/*#__PURE__*/React.createElement("button",{onClick:addRow,style:{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-2)',cursor:'pointer',fontFamily:'inherit'}},'+ שורה'),
/*#__PURE__*/React.createElement("button",{onClick:addSubRow,disabled:items.length===0,style:{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:items.length===0?'var(--text-3)':'var(--text-2)',cursor:items.length===0?'not-allowed':'pointer',fontFamily:'inherit'}},'+ תת-שורה'),
/*#__PURE__*/React.createElement("button",{onClick:addSubSubRow,disabled:!subSubBase,style:{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:!subSubBase?'var(--text-3)':'var(--text-2)',cursor:!subSubBase?'not-allowed':'pointer',fontFamily:'inherit'}},'+ תת תת שורה')));}
```

- [ ] **Step 3: Run the syntax check**

Run the command from the "Important" section. Expected: `SYNTAX_OK`. If it fails, re-count the `React.createElement(` / `)` pairs in the block you just inserted before doing anything else — do not guess-fix.

- [ ] **Step 4: Commit**

**IMPORTANT: stage only `project_hub.html`, and confirm via `git diff --stat -- project_hub.html` immediately before committing that the diff is exactly this one function replacement.** This repo has a few unrelated pre-existing uncommitted files (`.claude/launch.json`, some untracked docs) — do not touch or stage those.

```bash
git add project_hub.html
git commit -m "feat(meetings): DateRangeCell dates, 3-level grouping, discipline full names"
```

## Context for Task 3

`project_hub.html` is a single-file React 18 app (no build step, plain `React.createElement` calls, no JSX/Babel). Task 1 and Task 2 of this plan (already committed by the time you work on this task) shrank the print font and put `startDate`/`dueDate` back on meeting items. This task:

- Reuses `DateRangeCell` — an existing component in this file (used elsewhere for task/subtask dates) that renders its own `<td>` with a compact timeline bar; clicking it opens `CalendarRangePicker`, letting the user set both dates (and clear them) in one popover. Its call signature (already used elsewhere in the file, e.g. for subtasks): `React.createElement(DateRangeCell,{startDate:x,dueDate:y,onChange:(field,value)=>...})` — `onChange` is called once per date with the field name (`'startDate'` or `'dueDate'`) and the new ISO value, **not** a whole patch object. Because `DateRangeCell` renders its own `<td>`, it must NOT be wrapped in an extra `<td>` — insert it directly as a `<tr>` child, same as the other cells.
- Replaces the 2-level `buildPrintGroups` with a 3-level version. Groups are top-level items (`number` with no dot). Each group's `children` array now holds `{item, grandchildren}` objects instead of raw items — `item` is the 2-segment child, `grandchildren` is an array of raw 3-segment items folded under it. A 3-segment item attaches to whichever 2-segment item was most recently seen (`currentChild`); if none is open yet, it becomes its own standalone leaf group (mirroring the existing 2-segment orphan fallback).
- In the print table, child rows show `child.item.number` prefixed onto the topic (e.g. `"2.1  לעשות אחד"`) with `paddingRight:16` for a visual indent, and — only if `grandchildren.length>0` — a `<ul style={{listStyle:'none'}}>` list of `"{gc.number}  {gc.topic}"` lines appended inside the same cell (no separate `<tr>` for grandchildren; `listStyle:'none'` avoids double-numbering since each `<li>` already has its own number prefixed as text).
- `assigneeLabel` now checks `DISCIPLINE_FULL_NAMES[id]` first (the new top-level lookup table), falling back to the existing short-code label, then the raw id — so an unmapped discipline id still renders something instead of crashing or showing blank.
- `fmtDateNumeric` (new top-level helper) formats an ISO date as `DD.MM.YYYY` and returns `'-'` for empty/missing — used for both new print date columns instead of the existing `fmtDate` (which produces a different, non-numeric format like `"26 יונ"` and is NOT the right one for this column per the spec).
- The editable table's date column changes from two separate `<td>`s to a single `DateRangeCell`, and its `<th>` changes from two headers ("התחלה"/"סיום") to one ("תאריכים") — column count in `<thead>` and each `<tr>` both drop from 6 to 5 to match.
- `addRow`/`addSubRow` seed `startDate:'',dueDate:''` instead of the single `dueDate:''` from the previous plan.
- New `addSubSubRow`, wired to a new "+ תת תת שורה" button: bases the new number on the last item in the array — if that item (or its ancestor chain) has at least 2 number segments, the new item's prefix is the first 2 segments of the last item's number; otherwise (`subSubBase` is `null`) the button is disabled, mirroring how "+ תת-שורה" is already disabled when there are no items at all.

Work from: `C:\Users\Omega\Database`. There is no test framework in this repo; the `node --check` command is the actual verification method used throughout this plan.

---

### Task 4: Browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the preview server**

Use the `preview_start` tool with the `project-hub` configuration from `.claude/launch.json` (serves the repo root on port 3403).

- [ ] **Step 2: Load the app and check for console errors**

Navigate to `http://localhost:3403/project_hub.html`, reload, then check console logs (error level). Expected: no new errors (a handful of pre-existing unrelated `TEST_ERROR_MARKER_12345` entries from earlier manual testing may still be present in the log buffer — those are not from this change).

- [ ] **Step 3: Exercise the editing UI on an existing meeting**

Open the meetings archive, open an existing meeting that already has grouped items (created during the previous plan's work — a meeting with items numbered like "1", "1.1", "2", "2.1", "3" should already exist). Confirm:
- The date column now shows the `DateRangeCell` timeline-bar UI (not two raw `<input type="date">` fields), and clicking it opens a calendar range picker where you can set both a start and due date and clear them.
- Add a grandchild item: click into a 2-segment row (e.g. "2.1") last, then click "+ תת תת שורה" and confirm a new "2.1.1" row appears in the editable table.
- No console errors after these interactions.

- [ ] **Step 4: Visually verify the print layout**

Use the same print-CSS-under-screen-media trick as before via `preview_eval`:

```javascript
(function(){
  const rules = Array.from(document.styleSheets)
    .flatMap(s => { try { return Array.from(s.cssRules); } catch(e) { return []; } })
    .filter(r => r.media && r.media.mediaText === 'print')
    .map(r => r.cssText.replace(/^@media print/, '@media screen'))
    .join('\n');
  const style = document.createElement('style');
  style.id = '__print_preview_debug__';
  style.textContent = rules;
  document.head.appendChild(style);
  return 'injected ' + rules.length + ' chars';
})()
```

Then take a screenshot. Expected: print table text is visibly smaller than before; the "2" group's child row "2.1" shows its own number prefixed and indented under the bold "2" header; the "2.1.1" grandchild you added in Step 3 appears as a small unstyled-bullet line inside "2.1"'s row (not as its own table row); the לטיפול column shows a full Hebrew profession name (e.g. "קונסטרוקטור") instead of a short code; there are two date columns ("תאריך התחלה", "תאריך יעד") both showing numeric `DD.MM.YYYY` dates or `-` for empty ones.

Clean up afterward:
```javascript
document.getElementById('__print_preview_debug__')?.remove();
```

- [ ] **Step 5: Report results**

Summarize what was verified (or any issue found). If an issue is found, fix it in the relevant task above, re-run that task's syntax check, and repeat this task's verification before moving on.

---

## Out of scope (per spec)

- Everything already built and unchanged from the previous plan: print isolation, attendees paragraph, רשם/תפוצה fields and their print blocks, the 2-level group-header bold/underline/rowSpan structure itself (only extended, not replaced).
- Any change to `itemType`/⚙ menu behavior or `CreateItemDialog`'s own UI fields beyond the date mapping fixed in Task 2.
