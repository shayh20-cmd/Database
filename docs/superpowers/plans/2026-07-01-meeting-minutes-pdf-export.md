# Meeting Minutes PDF Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the meeting-minutes PDF export in `project_hub.html` so it prints clean A4 content instead of a screenshot of the app, consolidate the item date fields, and add print-only grouped-section table rendering.

**Architecture:** All changes live in one file, `project_hub.html` — a single-page React 18 app with no build step (plain `React.createElement` calls in an inline `<script>`, no JSX/Babel). Six surgical edits: print CSS, a new `migrateMeeting` migration step, a small `MeetingsView` fix, a `CreateItemDialog` fix, and full rewrites of `MeetingItemsTable` and `MeetingEditor`.

**Tech Stack:** React 18 (UMD, no build), plain CSS, `node --check` for syntax validation (no test framework exists in this repo).

**Spec:** [docs/superpowers/specs/2026-07-01-meeting-minutes-pdf-export-design.md](../specs/2026-07-01-meeting-minutes-pdf-export-design.md)

---

## Important: how "testing" works in this plan

This repo has no test framework, no `package.json`, and no build step for `project_hub.html` — it's a single static file loaded directly by the browser. There is nothing to unit-test in the traditional sense. Instead, every task's verification step is:

1. **Syntax validation** — extract the inline `<script>` and run `node --check` on it. This is fast, deterministic, and catches every class of bug this file is prone to (this file had three separate unclosed/extra-paren syntax errors from earlier imprecise edits, found and fixed the same day this plan was written).
2. **Runtime/browser verification** (later tasks) — load the app via the preview tool, exercise the feature, check the console for errors.

Run the syntax check with this exact command from the repo root (`C:\Users\Omega\Database`) after every edit to `project_hub.html`:

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

Expected output ends with `SYNTAX_OK`. If it throws instead, the last edit introduced a syntax error — re-read the new code block you just inserted for a missing/extra `(`, `{`, or `}` before doing anything else. Do not proceed to the next task until this prints `SYNTAX_OK`.

**A note on `old_string` for the two big rewrites (Tasks 5 and 6):** `MeetingItemsTable` and `MeetingEditor` are each a single, several-thousand-character line. Rather than hand-copying that whole line into this plan (error-prone to transcribe exactly, and it will drift if earlier tasks in this plan touch nearby code), those two tasks tell you to fetch the current exact text yourself with Grep/Read immediately before editing, using a precise unique start/end boundary. The **new** code for both is given here in full — there are no placeholders anywhere in this plan.

---

### Task 1: Print CSS — isolate `.meeting-doc` and add print-only helper classes

**Files:**
- Modify: `project_hub.html` (CSS `<style>` block, the `@media print` rule)

- [ ] **Step 1: Confirm the current CSS block is unchanged**

Run:
```bash
grep -n "@media print" "project_hub.html"
```
Expected: one match, followed a few lines later by `@page { margin: 20mm; size: A4; }` and a closing `}`.

- [ ] **Step 2: Replace the block**

Use the Edit tool on `project_hub.html`. `old_string` (exact, including indentation — this is the current literal content of that block):

```
@media print {
  .meeting-print-hide { display: none !important; }
  .meeting-doc { padding: 24px !important; max-width: 100% !important; overflow: visible !important; }
  .meeting-doc table { border-collapse: collapse; width: 100%; }
  .meeting-doc th, .meeting-doc td { border: 1px solid #ccc; padding: 6px 10px; font-size: 11pt; }
  .meeting-doc input, .meeting-doc textarea, .meeting-doc select { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-family: inherit; }
  .meeting-doc input[type='date'] { -webkit-appearance: none; }
  @page { margin: 20mm; size: A4; }
}
```

`new_string`:

```
.meeting-print-only { display: none; }
.meeting-print-table { display: none; }

@media print {
  body * { visibility: hidden; }
  .meeting-doc, .meeting-doc * { visibility: visible; }
  .meeting-doc {
    position: absolute; top: 0; left: 0;
    width: 100% !important; max-width: 100% !important;
    margin: 0 !important; padding: 24px !important;
    overflow: visible !important;
  }
  .meeting-print-hide { display: none !important; }
  .meeting-print-only { display: block; }
  .meeting-print-table { display: table; }
  .meeting-doc table { border-collapse: collapse; width: 100%; }
  .meeting-doc th, .meeting-doc td { border: 1px solid #ccc; padding: 6px 10px; font-size: 11pt; }
  .meeting-doc input, .meeting-doc textarea, .meeting-doc select { border: none !important; outline: none !important; background: transparent !important; padding: 0 !important; font-family: inherit; }
  .meeting-doc input[type='date'] { -webkit-appearance: none; }
  .meeting-print-group-header { font-weight: 700; text-decoration: underline; }
  @page { margin: 15mm 12mm; size: A4; }
}
```

- [ ] **Step 3: Run the syntax check**

This is CSS, not JS, so `node --check` won't catch CSS mistakes — instead just re-read the inserted block to confirm every `{` has a matching `}`. Still run the standard check command (from the "Important" section above) to confirm you didn't accidentally break the surrounding `<style>`/`<script>` boundary:

Run the syntax-check command. Expected: `SYNTAX_OK`.

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "style(meetings): isolate print output to .meeting-doc content"
```

---

### Task 2: Data model — consolidate item dates, add recordedBy/distribution

**Files:**
- Modify: `project_hub.html` (`migrateData`, new `migrateMeeting`, `MeetingsView.openNew`, `CreateItemDialog`)

- [ ] **Step 1: Locate the insertion point for `migrateMeeting`**

Run:
```bash
grep -c "return{...d,tracks};}function migrateData(d){" "project_hub.html"
```
Expected: `1` (confirms the anchor text is unique before you edit).

- [ ] **Step 2: Insert `migrateMeeting` and call it from `migrateData`**

Use the Edit tool. `old_string`:
```
return{...d,tracks};}function migrateData(d){
```
`new_string`:
```
return{...d,tracks};}function migrateMeeting(m){return{...m,recordedBy:m.recordedBy||'',distribution:m.distribution||'',items:(m.items||[]).map(it=>({...it,dueDate:it.dueDate??it.endDate??it.startDate??null}))};}function migrateData(d){
```

- [ ] **Step 3: Call `migrateMeeting` on every stored meeting**

Run:
```bash
grep -c "if(!d.meetings)d={...d,meetings:\[\]};return d;}function repairPrecondsSheet" "project_hub.html"
```
Expected: `1`.

Use the Edit tool. `old_string`:
```
if(!d.meetings)d={...d,meetings:[]};return d;}function repairPrecondsSheet
```
`new_string`:
```
if(!d.meetings)d={...d,meetings:[]};d={...d,meetings:d.meetings.map(migrateMeeting)};return d;}function repairPrecondsSheet
```

- [ ] **Step 4: Default `recordedBy`/`distribution` on brand-new meetings**

Run:
```bash
grep -c "const openNew=()=>{const m={id:uid(),trackId:trackId,title:'',date:todayISO(),participants:\[\],items:\[\],createdAt:new Date().toISOString()};" "project_hub.html"
```
Expected: `1`.

Use the Edit tool. `old_string`:
```
const openNew=()=>{const m={id:uid(),trackId:trackId,title:'',date:todayISO(),participants:[],items:[],createdAt:new Date().toISOString()};
```
`new_string`:
```
const openNew=()=>{const m={id:uid(),trackId:trackId,title:'',date:todayISO(),participants:[],items:[],recordedBy:'',distribution:'',createdAt:new Date().toISOString()};
```

- [ ] **Step 5: Fix `CreateItemDialog`'s stale `startDate`/`endDate` reference**

`CreateItemDialog` currently reads `item.startDate` and `item.endDate` off a meeting item to seed a new task's dates. Those fields no longer exist once Task 5 removes them (they're being replaced by `item.dueDate`), so this must be fixed now or a created task will silently get no dates.

Run:
```bash
grep -c "startDate:item&&item.startDate||'',dueDate:item&&item.endDate||''" "project_hub.html"
```
Expected: `1`.

Use the Edit tool. `old_string`:
```
startDate:item&&item.startDate||'',dueDate:item&&item.endDate||''
```
`new_string`:
```
startDate:item&&item.dueDate||'',dueDate:item&&item.dueDate||''
```

- [ ] **Step 6: Run the syntax check**

Run the syntax-check command from the "Important" section. Expected: `SYNTAX_OK`.

- [ ] **Step 7: Commit**

```bash
git add project_hub.html
git commit -m "feat(meetings): consolidate item dates to dueDate, add recordedBy/distribution"
```

---

### Task 3: Rewrite `MeetingItemsTable` — one date column + print-only grouped table

**Files:**
- Modify: `project_hub.html` (`MeetingItemsTable` function, add `buildPrintGroups` helper)

- [ ] **Step 1: Fetch the current exact function text**

Run:
```bash
grep -o "function MeetingItemsTable({data,save,meeting,onChange}){.*" "project_hub.html" | head -c 200
```
This confirms the function exists and shows you the start of the line so you can identify it in the file (it's one physical line). Use the Read tool on `project_hub.html` around that line number (find the line number with `grep -n "function MeetingItemsTable"`) to get the full exact line text — you need this as the Edit tool's `old_string`. The line runs from `function MeetingItemsTable({data,save,meeting,onChange}){` up to (but not including) the start of the next line, `function MeetingEditor({data,save,meeting,onBack,onSave}){`.

- [ ] **Step 2: Replace it**

Use the Edit tool with the exact current line as `old_string` (fetched in Step 1) and this as `new_string`:

```javascript
function buildPrintGroups(items){const groups=[];let current=null;items.forEach(it=>{const isChild=it.number.includes('.');if(isChild){const prefix=it.number.split('.')[0];if(current&&current.number===prefix){current.children.push(it);}else{groups.push({key:it.id,number:null,header:null,children:[it]});}}else{current={key:it.id,number:it.number,header:it,children:[]};groups.push(current);}});return groups;}
function MeetingItemsTable({data,save,meeting,onChange}){
const items=meeting.items||[];
const disciplines=data.disciplines||DISCIPLINES;
const[createItemFor,setCreateItemFor]=useState(null);
const[openMenuId,setOpenMenuId]=useState(null);
useEffect(()=>{if(!openMenuId)return;const h=e=>{setOpenMenuId(null);};document.addEventListener('click',h);return()=>document.removeEventListener('click',h);},[openMenuId]);
const ITEM_TYPES=[{id:'task',label:'משימה'},{id:'subtask',label:'תת-משימה'},{id:'update',label:'עדכון'},{id:'principle',label:'עקרון תכנון'},{id:'milestone',label:'אבן דרך'},{id:'goal',label:'יעד'}];
const addRow=()=>{const last=items[items.length-1];const n=last?String(parseInt(last.number||'0')+1):'1';onChange([...items,{id:uid(),number:n,topic:'',assignee:null,dueDate:'',itemType:null,createdTaskTrackId:null}]);};
const addSubRow=()=>{const last=items[items.length-1];const base=last?(last.number||'1').split('.')[0]:'1';const existing=items.filter(it=>it.number.startsWith(base+'.')&&it.number.split('.').length===2);const sub=existing.length+1;onChange([...items,{id:uid(),number:base+'.'+sub,topic:'',assignee:null,dueDate:'',itemType:null,createdTaskTrackId:null}]);};
const updateItem=(id,patch)=>onChange(items.map(it=>it.id===id?{...it,...patch}:it));
const deleteItem=id=>{if(id===createItemFor)setCreateItemFor(null);onChange(items.filter(it=>it.id!==id));};
const discOptions=[{id:'',label:'—'},...disciplines.map(d=>({id:d.id,label:d.label})),{id:'לידיעה',label:'לידיעה'}];
const thStyle={textAlign:'right',padding:'6px 8px',color:'var(--text-2)',fontWeight:600,borderBottom:'2px solid var(--border)'};
const printGroups=buildPrintGroups(items);
const assigneeLabel=id=>id?(discOptions.find(o=>o.id===id)||{}).label||id:'';
return/*#__PURE__*/React.createElement("div",{style:{marginTop:24}},
/*#__PURE__*/React.createElement("table",{className:"meeting-print-hide",style:{width:'100%',borderCollapse:'collapse',fontSize:12,direction:'rtl'}},
/*#__PURE__*/React.createElement("thead",null,/*#__PURE__*/React.createElement("tr",null,
/*#__PURE__*/React.createElement("th",{style:{...thStyle,width:50}},"מס'"),
/*#__PURE__*/React.createElement("th",{style:thStyle},"נושא"),
/*#__PURE__*/React.createElement("th",{style:{...thStyle,width:100}},"לטיפול"),
/*#__PURE__*/React.createElement("th",{style:{...thStyle,width:105}},"תאריך יעד"),
/*#__PURE__*/React.createElement("th",{style:{width:60,borderBottom:'2px solid var(--border)'}}))),
/*#__PURE__*/React.createElement("tbody",null,items.map((item,idx)=>/*#__PURE__*/React.createElement("tr",{key:item.id,style:{borderBottom:'1px solid var(--border)',background:idx%2===0?'transparent':'rgba(0,0,0,.015)'}},
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("input",{value:item.number,onChange:e=>updateItem(item.id,{number:e.target.value}),style:{width:'100%',border:'none',outline:'none',background:'transparent',fontFamily:'inherit',fontSize:12,fontWeight:item.number.includes('.')?400:600,color:'var(--text)',direction:'rtl'}})),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("textarea",{value:item.topic,onChange:e=>updateItem(item.id,{topic:e.target.value}),rows:1,style:{width:'100%',border:'none',outline:'none',background:'transparent',fontFamily:'inherit',fontSize:12,color:'var(--text)',resize:'none',direction:'rtl',lineHeight:1.5,minHeight:22,overflow:'hidden',boxSizing:'border-box'},onInput:e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px';}})),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("select",{value:item.assignee||'',onChange:e=>updateItem(item.id,{assignee:e.target.value||null}),style:{fontSize:11,border:'1px solid var(--border)',borderRadius:4,padding:'2px 4px',background:'var(--surface)',color:'var(--text)',fontFamily:'inherit',width:'100%'}},discOptions.map(o=>/*#__PURE__*/React.createElement("option",{key:o.id,value:o.id},o.label)))),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("input",{type:"date",value:item.dueDate||'',onChange:e=>updateItem(item.id,{dueDate:e.target.value}),style:{fontSize:11,border:'1px solid var(--border)',borderRadius:4,padding:'2px 4px',background:'var(--surface)',fontFamily:'inherit',color:'var(--text)',width:'100%'}})),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 4px',verticalAlign:'top'}},/*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:2,alignItems:'center'}},
/*#__PURE__*/React.createElement("button",{onClick:()=>deleteItem(item.id),style:{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:13,padding:'2px 4px',borderRadius:3},onMouseEnter:e=>e.currentTarget.style.color='#EF4444',onMouseLeave:e=>e.currentTarget.style.color='var(--text-3)'},'✕'),
/*#__PURE__*/React.createElement("div",{style:{position:'relative'}},
/*#__PURE__*/React.createElement("button",{onClick:e=>{e.stopPropagation();setOpenMenuId(o=>o===item.id?null:item.id);},style:{background:item.itemType?'rgba(99,102,241,.15)':'none',border:item.itemType?'1px solid var(--accent)':'1px solid var(--border)',borderRadius:4,cursor:'pointer',color:item.itemType?'var(--accent)':'var(--text-3)',fontSize:10,padding:'2px 5px',fontFamily:'inherit',whiteSpace:'nowrap'}},item.itemType?(ITEM_TYPES.find(t=>t.id===item.itemType)||{}).label||'⚙':'⚙'),
/*#__PURE__*/React.createElement("div",{style:{display:openMenuId===item.id?'block':'none',position:'absolute',top:'calc(100% + 2px)',left:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,boxShadow:'0 4px 12px rgba(0,0,0,.12)',zIndex:300,minWidth:120}},
ITEM_TYPES.map(type=>/*#__PURE__*/React.createElement("div",{key:type.id,onClick:e=>{e.stopPropagation();updateItem(item.id,{itemType:type.id});setOpenMenuId(null);setCreateItemFor(item.id);},style:{padding:'7px 12px',cursor:'pointer',fontSize:12,color:'var(--text)'},onMouseEnter:e=>e.currentTarget.style.background='var(--bg)',onMouseLeave:e=>e.currentTarget.style.background=''},type.label)),
/*#__PURE__*/React.createElement("div",{onClick:e=>{e.stopPropagation();updateItem(item.id,{itemType:null,createdTaskTrackId:null});setOpenMenuId(null);},style:{padding:'7px 12px',cursor:'pointer',fontSize:12,color:'var(--text-3)',borderTop:'1px solid var(--border)'},onMouseEnter:e=>e.currentTarget.style.background='var(--bg)',onMouseLeave:e=>e.currentTarget.style.background=''},'נקה'))))))))),
/*#__PURE__*/React.createElement("table",{className:"meeting-print-table",style:{fontSize:11}},
/*#__PURE__*/React.createElement("thead",null,/*#__PURE__*/React.createElement("tr",null,
/*#__PURE__*/React.createElement("th",{style:{width:36}},"מס'"),
/*#__PURE__*/React.createElement("th",null,"הנושא"),
/*#__PURE__*/React.createElement("th",{style:{width:90}},"לטיפול"),
/*#__PURE__*/React.createElement("th",{style:{width:90}},"תאריך יעד"))),
/*#__PURE__*/React.createElement("tbody",null,printGroups.map(g=>{
if(g.header&&g.children.length>0){
return/*#__PURE__*/React.createElement(React.Fragment,{key:g.key},
/*#__PURE__*/React.createElement("tr",null,
/*#__PURE__*/React.createElement("td",{rowSpan:1+g.children.length,style:{textAlign:'center',verticalAlign:'top'}},g.number),
/*#__PURE__*/React.createElement("td",{className:"meeting-print-group-header"},g.header.topic),
/*#__PURE__*/React.createElement("td",null),
/*#__PURE__*/React.createElement("td",null)),
g.children.map(child=>/*#__PURE__*/React.createElement("tr",{key:child.id},
/*#__PURE__*/React.createElement("td",null,child.topic),
/*#__PURE__*/React.createElement("td",null,assigneeLabel(child.assignee)),
/*#__PURE__*/React.createElement("td",null,child.dueDate?fmtDate(child.dueDate):''))));
}
if(g.header&&g.children.length===0){
return/*#__PURE__*/React.createElement("tr",{key:g.key},
/*#__PURE__*/React.createElement("td",{style:{textAlign:'center'}},g.number),
/*#__PURE__*/React.createElement("td",null,g.header.topic),
/*#__PURE__*/React.createElement("td",null,assigneeLabel(g.header.assignee)),
/*#__PURE__*/React.createElement("td",null,g.header.dueDate?fmtDate(g.header.dueDate):''));
}
return g.children.map(child=>/*#__PURE__*/React.createElement("tr",{key:child.id},
/*#__PURE__*/React.createElement("td",{style:{textAlign:'center'}},child.number),
/*#__PURE__*/React.createElement("td",null,child.topic),
/*#__PURE__*/React.createElement("td",null,assigneeLabel(child.assignee)),
/*#__PURE__*/React.createElement("td",null,child.dueDate?fmtDate(child.dueDate):'')));
}))),
createItemFor&&/*#__PURE__*/React.createElement(CreateItemDialog,{data:data,save:save,item:items.find(it=>it.id===createItemFor),onClose:()=>setCreateItemFor(null),onCreate:(sheetId,groupId,title)=>{updateItem(createItemFor,{createdTaskTrackId:sheetId});setCreateItemFor(null);}}),
/*#__PURE__*/React.createElement("div",{className:"meeting-print-hide",style:{display:'flex',gap:8,marginTop:12}},
/*#__PURE__*/React.createElement("button",{onClick:addRow,style:{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-2)',cursor:'pointer',fontFamily:'inherit'}},'+ שורה'),
/*#__PURE__*/React.createElement("button",{onClick:addSubRow,disabled:items.length===0,style:{fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:items.length===0?'var(--text-3)':'var(--text-2)',cursor:items.length===0?'not-allowed':'pointer',fontFamily:'inherit'}},'+ תת-שורה')));}
```

- [ ] **Step 3: Run the syntax check**

Run the syntax-check command from the "Important" section. Expected: `SYNTAX_OK`. If it fails, the most likely cause is a paren/brace count mismatch introduced while pasting — re-count the `React.createElement(` / `)` pairs in the block you just inserted before doing anything else.

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "feat(meetings): print-only grouped topics table, single due-date column"
```

---

### Task 4: Rewrite `MeetingEditor` — attendees line + רשם/תפוצה fields

**Files:**
- Modify: `project_hub.html` (`MeetingEditor` function)

- [ ] **Step 1: Fetch the current exact function text**

Run:
```bash
grep -n "function MeetingEditor({data,save,meeting,onBack,onSave}){" "project_hub.html"
```
Use the Read tool at that line number to get the exact full line — that whole line (from `function MeetingEditor({data,save,meeting,onBack,onSave}){` to its end) is the Edit tool's `old_string`.

- [ ] **Step 2: Replace it**

Use the Edit tool with the exact current line as `old_string` and this as `new_string`:

```javascript
function MeetingEditor({data,save,meeting,onBack,onSave}){
const[m,setM]=useState(meeting);
const update=patch=>{const next={...m,...patch};setM(next);};
const commit=()=>onSave(m);
const allPersons=[...(data.team||[]).map(p=>({key:'team-'+p.id,name:p.name,role:p.projectRole||p.role||''})),...(data.consultants||[]).flatMap(c=>(c.contacts||[]).map(ct=>({key:'con-'+c.id+'-'+ct.name,name:ct.name||c.firm,role:c.discipline||c.firm||''})))].filter(p=>p.name);
const usedNames=new Set(m.participants.map(p=>p.name));
const available=allPersons.filter(p=>!usedNames.has(p.name));
const addParticipant=p=>{update({participants:[...m.participants,{id:uid(),name:p.name,role:p.role,isCustom:false}]});};
const removeParticipant=id=>update({participants:m.participants.filter(p=>p.id!==id)});
const[showPicker,setShowPicker]=useState(false);
const[customName,setCustomName]=useState('');
const[customRole,setCustomRole]=useState('');
const[showCustomForm,setShowCustomForm]=useState(false);
const pickerRef=useRef(null);
useEffect(()=>{if(!showPicker)return;const h=e=>{if(pickerRef.current&&!pickerRef.current.contains(e.target))setShowPicker(false);};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[showPicker]);
const addCustom=()=>{if(!customName.trim())return;update({participants:[...m.participants,{id:uid(),name:customName.trim(),role:customRole.trim(),isCustom:true}]});setCustomName('');setCustomRole('');setShowCustomForm(false);};
const attendeesLine=m.participants.map(p=>p.role?`${p.name} (${p.role})`:p.name).join(', ');
return/*#__PURE__*/React.createElement("div",{style:{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}},
/*#__PURE__*/React.createElement("div",{className:"meeting-print-hide",style:{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderBottom:'1px solid var(--border)',background:'var(--surface)',flexShrink:0}},
/*#__PURE__*/React.createElement("button",{onClick:onBack,style:{background:'none',border:'none',cursor:'pointer',color:'var(--text-2)',fontSize:13,fontFamily:'inherit',padding:'4px 8px',borderRadius:5,display:'flex',alignItems:'center',gap:4}},/*#__PURE__*/React.createElement(Ic,{n:'chevron',size:12}),' חזרה'),
/*#__PURE__*/React.createElement("span",{style:{flex:1}}),
/*#__PURE__*/React.createElement("button",{onClick:()=>window.print(),style:{padding:'6px 14px',fontSize:12,borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5}},'🗘 ייצוא PDF'),
/*#__PURE__*/React.createElement("button",{onClick:commit,style:{padding:'6px 14px',fontSize:12,borderRadius:6,border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontFamily:'inherit',fontWeight:600}},'שמור')),
/*#__PURE__*/React.createElement("div",{className:"meeting-doc",style:{flex:1,overflowY:'auto',padding:'32px 48px',maxWidth:860,margin:'0 auto',width:'100%',boxSizing:'border-box'}},
/*#__PURE__*/React.createElement("div",{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8,direction:'rtl'}},
/*#__PURE__*/React.createElement("div",{style:{fontSize:20,fontWeight:700,color:'var(--text)'}},data.projectName||'פרויקט'),
/*#__PURE__*/React.createElement("input",{type:'date',value:m.date,onChange:e=>update({date:e.target.value}),style:{fontSize:13,border:'1px solid var(--border)',borderRadius:5,padding:'4px 8px',fontFamily:'inherit',color:'var(--text)',background:'var(--surface)'}})),
/*#__PURE__*/React.createElement("input",{value:m.title,onChange:e=>update({title:e.target.value}),placeholder:'נושא הפגישה...',style:{fontSize:15,fontWeight:600,color:'var(--text)',border:'none',borderBottom:'2px solid var(--border)',outline:'none',background:'transparent',width:'100%',fontFamily:'inherit',marginBottom:24,paddingBottom:4,direction:'rtl',boxSizing:'border-box'}}),
/*#__PURE__*/React.createElement("div",{style:{marginBottom:24}},
/*#__PURE__*/React.createElement("div",{style:{fontSize:12,fontWeight:700,color:'var(--text-2)',marginBottom:8,textAlign:'right'}},'משתתפים'),
/*#__PURE__*/React.createElement("div",{className:"meeting-print-only",style:{fontSize:12,color:'var(--text)',marginBottom:10,textAlign:'right',direction:'rtl'}},'נכחו: ',attendeesLine),
m.participants.length>0&&/*#__PURE__*/React.createElement("table",{className:"meeting-print-hide",style:{width:'100%',borderCollapse:'collapse',marginBottom:10,direction:'rtl',fontSize:12}},
/*#__PURE__*/React.createElement("thead",null,/*#__PURE__*/React.createElement("tr",null,
/*#__PURE__*/React.createElement("th",{style:{textAlign:'right',borderBottom:'1px solid var(--border)',padding:'4px 8px',color:'var(--text-2)',fontWeight:600}},'שם'),
/*#__PURE__*/React.createElement("th",{style:{textAlign:'right',borderBottom:'1px solid var(--border)',padding:'4px 8px',color:'var(--text-2)',fontWeight:600}},'תפקיד'),
/*#__PURE__*/React.createElement("th",{style:{width:24,borderBottom:'1px solid var(--border)'}}))),
/*#__PURE__*/React.createElement("tbody",null,m.participants.map(p=>/*#__PURE__*/React.createElement("tr",{key:p.id},
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',borderBottom:'1px solid var(--border)',color:'var(--text)'}},p.name),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 8px',borderBottom:'1px solid var(--border)',color:'var(--text-2)'}},p.role),
/*#__PURE__*/React.createElement("td",{style:{padding:'5px 4px',borderBottom:'1px solid var(--border)'}},/*#__PURE__*/React.createElement("button",{onClick:()=>removeParticipant(p.id),style:{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:12,padding:'2px 4px'}},'✕')))))),
/*#__PURE__*/React.createElement("div",{className:"meeting-print-hide",style:{display:'flex',gap:8,alignItems:'flex-start',flexWrap:'wrap'}},
/*#__PURE__*/React.createElement("div",{ref:pickerRef,style:{position:'relative'}},
/*#__PURE__*/React.createElement("button",{onClick:()=>{setShowPicker(o=>!o);setShowCustomForm(false);},style:{fontSize:12,padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-2)',cursor:'pointer',fontFamily:'inherit'}},'+ הוסף משתתף'),
showPicker&&available.length>0&&/*#__PURE__*/React.createElement("div",{style:{position:'absolute',top:'calc(100% + 4px)',right:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 4px 16px rgba(0,0,0,.12)',zIndex:200,minWidth:200,maxHeight:220,overflowY:'auto',direction:'rtl'}},
available.map(p=>/*#__PURE__*/React.createElement("div",{key:p.key,onClick:()=>{addParticipant(p);setShowPicker(false);},style:{padding:'8px 12px',cursor:'pointer',fontSize:12},onMouseEnter:e=>e.currentTarget.style.background='var(--bg)',onMouseLeave:e=>e.currentTarget.style.background=''},
/*#__PURE__*/React.createElement("div",{style:{fontWeight:600,color:'var(--text)'}},p.name),
p.role&&/*#__PURE__*/React.createElement("div",{style:{fontSize:10,color:'var(--text-3)'}},p.role))))),
/*#__PURE__*/React.createElement("button",{onClick:()=>{setShowCustomForm(o=>!o);setShowPicker(false);},style:{fontSize:12,padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-2)',cursor:'pointer',fontFamily:'inherit'}},'+ הוסף ידנית'),
showCustomForm&&/*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:6,alignItems:'center'}},
/*#__PURE__*/React.createElement("input",{value:customName,onChange:e=>setCustomName(e.target.value),placeholder:'שם',style:{fontSize:12,padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',fontFamily:'inherit',width:120}}),
/*#__PURE__*/React.createElement("input",{value:customRole,onChange:e=>setCustomRole(e.target.value),placeholder:'תפקיד',style:{fontSize:12,padding:'4px 8px',borderRadius:5,border:'1px solid var(--border)',fontFamily:'inherit',width:120}}),
/*#__PURE__*/React.createElement("button",{onClick:addCustom,style:{fontSize:12,padding:'4px 10px',borderRadius:5,border:'none',background:'var(--accent)',color:'#fff',cursor:'pointer',fontFamily:'inherit'}},'הוסף')))),
/*#__PURE__*/React.createElement(MeetingItemsTable,{data:data,save:save,meeting:m,onChange:items=>update({items})}),
/*#__PURE__*/React.createElement("div",{style:{marginTop:24}},
/*#__PURE__*/React.createElement("div",{className:"meeting-print-hide",style:{display:'flex',gap:12,flexWrap:'wrap'}},
/*#__PURE__*/React.createElement("div",{style:{flex:1,minWidth:200}},
/*#__PURE__*/React.createElement("label",{style:{fontSize:11,color:'var(--text-2)',display:'block',marginBottom:4}},'רשם'),
/*#__PURE__*/React.createElement("input",{value:m.recordedBy||'',onChange:e=>update({recordedBy:e.target.value}),placeholder:'שם הרושם...',style:{width:'100%',fontSize:12,padding:'6px 8px',borderRadius:5,border:'1px solid var(--border)',fontFamily:'inherit',color:'var(--text)',background:'var(--surface)',boxSizing:'border-box'}})),
/*#__PURE__*/React.createElement("div",{style:{flex:2,minWidth:260}},
/*#__PURE__*/React.createElement("label",{style:{fontSize:11,color:'var(--text-2)',display:'block',marginBottom:4}},'תפוצה'),
/*#__PURE__*/React.createElement("input",{value:m.distribution||'',onChange:e=>update({distribution:e.target.value}),placeholder:'רשימת תפוצה...',style:{width:'100%',fontSize:12,padding:'6px 8px',borderRadius:5,border:'1px solid var(--border)',fontFamily:'inherit',color:'var(--text)',background:'var(--surface)',boxSizing:'border-box'}}))),
(m.recordedBy||m.distribution)&&/*#__PURE__*/React.createElement("div",{className:"meeting-print-only",style:{fontSize:12,color:'var(--text)',direction:'rtl',marginTop:8}},
m.recordedBy&&/*#__PURE__*/React.createElement("div",null,'רשם: ',m.recordedBy),
m.distribution&&/*#__PURE__*/React.createElement("div",{style:{marginTop:4}},'תפוצה: ',m.distribution)))));}
```

- [ ] **Step 3: Run the syntax check**

Run the syntax-check command from the "Important" section. Expected: `SYNTAX_OK`.

- [ ] **Step 4: Commit**

```bash
git add project_hub.html
git commit -m "feat(meetings): attendees line and רשם/תפוצה fields for print output"
```

---

### Task 5: Browser verification

**Files:** none (verification only)

- [ ] **Step 1: Start the preview server**

Use the `preview_start` tool with the `project-hub` configuration from `.claude/launch.json` (serves the repo root on port 3403).

- [ ] **Step 2: Load the app and check for console errors**

Navigate to `http://localhost:3403/project_hub.html`, reload, then check console logs (error level). Expected: no errors. If `MeetingItemsTable`'s print-only table has a bug in `buildPrintGroups` or its render, it will throw immediately here even though the print table is CSS-hidden on screen — it's still mounted in the DOM at all times.

- [ ] **Step 3: Exercise the editing UI**

Open (or create) a meeting. Add three items: `1` (topic "נושא כללי"), `1.1` (topic "סעיף א", assignee + due date filled), `1.2` (topic "סעיף ב", assignee + due date filled), then `2` (topic "נושא בודד") with no children — fill its assignee/due date directly. Confirm:
- Only one date input per row (no start/end pair).
- Adding, editing, and deleting rows works with no console errors.
- Fill the רשם and תפוצה inputs and confirm they persist after clicking שמור, going back to the archive, and reopening the meeting.

- [ ] **Step 4: Visually verify the print layout without an actual print dialog**

Headless tools can't drive the browser's native print preview, so verify the print CSS by temporarily applying it under `screen` media via `preview_eval`, screenshot, then remove it:

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

Then take a screenshot. Expected: the sidebar, project header, and tab bars are gone; only the meeting document is visible, with the "2 | סעיף א / סעיף ב" group rendered as one bold underlined header row plus two child rows sharing a single merged "1" cell in the מס' column, and item "2" rendered as a normal single row. Confirm the נכחו:/רשם:/תפוצה: lines appear as plain text (not inputs/tables).

Clean up afterward:
```javascript
document.getElementById('__print_preview_debug__')?.remove();
```

- [ ] **Step 5: Report results**

Summarize what was verified (or any issue found) — if an issue is found, fix it in the relevant task above, re-run that task's syntax check, and repeat this task's verification before moving on.

---

## Out of scope (per spec)

- Office letterhead/logo reproduction and running page-number footer — deferred to a future pass.
- Any change to the meetings archive view, navigation, or the create-item dialog's own UI (only its `startDate`/`endDate` field reference was touched, in Task 2).
