# Automations (אוטומציות) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Asana-style rule automations — "כאשר X ← תבדוק ש-Y ← תעשה Z" — with a visual RTL builder in a new Template "אוטומציות" tab, per-rule sheet scope, a toolbar panel in task lists, and a real engine that executes rules on every data change (plus on load for date-based triggers).

**Architecture:** New root keys `data.automations` / `data.automationLog`. A pure engine (`runAutomations(prevData,nextData)`) is called inside `App`'s central `save` — it diffs tasks, matches enabled in-scope rules, applies actions immutably in a single pass (no rule chaining). Time-based triggers run once on load via `runTimeBasedAutomations` with dedupe keys in the log. UI components (`AutomationsTab`, `AutomationBuilder`, `AutoParamControls`) live next to `FieldsTab` and reuse existing constants (`STATUSES`, `PRIORITIES`, `DISCIPLINES`, `OFFICE_STAFF`, `data.fields`).

**Tech Stack:** Single-file React 18 app — `project_hub_01.html` (the active file; `project_hub.html` is a stale copy — do NOT edit it). **The script is plain precompiled JS, NOT Babel/JSX — all new UI code must use `React.createElement`** (match the existing `/*#__PURE__*/` style; the pure annotations are optional). `useState`/`useEffect`/`useRef`/`useCallback` are already destructured from React in this file. No test framework; verification is manual via the browser preview (`project-hub` launch config, port 3403, `/project_hub_01.html`).

**Spec:** `docs/superpowers/specs/2026-07-14-automations-design.md`

---

### Task 1: Data model — `automations` + `automationLog` root keys

**Files:**
- Modify: `project_hub_01.html` (`makeDefaultData` ~line 751, `migrateData` ~line 772)

- [ ] **Step 1: Add the keys to `makeDefaultData`**

Find this exact text:

```js
"licensingMilestones":[],"licensingGoals":[],"fields":[],"sheets":[
```

Replace with:

```js
"licensingMilestones":[],"licensingGoals":[],"fields":[],"automations":[],"automationLog":[],"sheets":[
```

- [ ] **Step 2: Default the keys in `migrateData` for existing saved data**

Find this exact text:

```js
if(!d.fields){d={...d,fields:[]};}if(!d.staff){d={...d,staff:OFFICE_STAFF};}
```

Replace with:

```js
if(!d.fields){d={...d,fields:[]};}if(!d.automations){d={...d,automations:[]};}if(!d.automationLog){d={...d,automationLog:[]};}if(!d.staff){d={...d,staff:OFFICE_STAFF};}
```

- [ ] **Step 3: Syntax check in the browser**

Start the `project-hub` launch config and open `http://localhost:3403/project_hub_01.html`. Expect the app to load with no console errors.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(automations): add automations/automationLog to data model"
```

---

### Task 2: Catalogs + execution engine (pure logic)

**Files:**
- Modify: `project_hub_01.html` (insert new code immediately before `function Toolbar`, ~line 855)

- [ ] **Step 1: Insert the catalogs and engine**

Find this exact text (unique — the end of the comment header right before `Toolbar`):

```js
*/function Toolbar({onAddTask
```

Replace with the following (the engine block is inserted between `*/` and `function Toolbar({onAddTask`; everything after the final newline is the original unchanged text):

```js
*/
/* ═══ Automations — catalogs & engine (see docs/superpowers/specs/2026-07-14-automations-design.md) ═══ */
const AUTO_TRIGGERS=[
{id:'task-added',label:'משימה נוספה',cat:'משימה'},
{id:'task-moved',label:'משימה הועברה לקבוצה',cat:'משימה'},
{id:'task-completed',label:'משימה הושלמה',cat:'משימה'},
{id:'subtasks-completed',label:'כל תתי-המשימות הושלמו',cat:'משימה'},
{id:'status-changed',label:'סטטוס השתנה',cat:'שדות'},
{id:'priority-changed',label:'עדיפות השתנתה',cat:'שדות'},
{id:'discipline-changed',label:'תחום השתנה',cat:'שדות'},
{id:'assignee-changed',label:'אחראי השתנה',cat:'שדות'},
{id:'field-changed',label:'שדה מותאם השתנה',cat:'שדות'},
{id:'duedate-changed',label:'תאריך יעד השתנה',cat:'תאריכים'},
{id:'duedate-approaching',label:'תאריך יעד מתקרב',cat:'תאריכים'},
{id:'task-overdue',label:'משימה באיחור',cat:'תאריכים'}];
const AUTO_CONDITIONS=[
{id:'in-group',label:'נמצאת בקבוצה',cat:'משימה'},
{id:'tasktype-is',label:'סוג המשימה הוא',cat:'משימה'},
{id:'status-is',label:'הסטטוס הוא',cat:'שדות'},
{id:'priority-is',label:'העדיפות היא',cat:'שדות'},
{id:'discipline-is',label:'התחום הוא',cat:'שדות'},
{id:'assignee-is',label:'האחראי הוא',cat:'שדות'},
{id:'field-is',label:'ערך שדה מותאם הוא',cat:'שדות'},
{id:'duedate-is',label:'תאריך היעד',cat:'תאריכים'}];
const AUTO_ACTIONS=[
{id:'move-to-group',label:'העבר לקבוצה',cat:'משימה'},
{id:'complete-task',label:'סמן כהושלמה',cat:'משימה'},
{id:'add-subtask',label:'צור תת-משימה',cat:'משימה'},
{id:'add-update',label:'הוסף עדכון למשימה',cat:'משימה'},
{id:'set-status',label:'שנה סטטוס ל...',cat:'שדות'},
{id:'set-priority',label:'שנה עדיפות ל...',cat:'שדות'},
{id:'set-discipline',label:'שנה תחום ל...',cat:'שדות'},
{id:'set-assignee',label:'שנה אחראי ל...',cat:'שדות'},
{id:'set-field',label:'קבע ערך שדה מותאם',cat:'שדות'},
{id:'set-duedate',label:'קבע תאריך יעד',cat:'תאריכים'}];
const autoOptionLabel=(list,type)=>(list.find(o=>o.id===type)||{}).label||type||'';
const autoStaffList=data=>(data.staff&&data.staff.length?data.staff:OFFICE_STAFF);
const autoScopeSheets=(data,scope)=>(data.sheets||[]).filter(s=>s.type==='list'&&(scope==='all'||(Array.isArray(scope)&&scope.includes(s.id))));
const autoGroupOptions=(data,scope)=>[...new Set(autoScopeSheets(data,scope).flatMap(s=>(s.groups||[]).map(g=>g.name)))];
const autoScopeLabel=rule=>rule.scope==='all'?'כל הפרויקט':`${(rule.scope||[]).length} שלבים`;
const autoGroupName=(sheet,task)=>{const g=(sheet.groups||[]).find(g=>g.id===task.groupId);return g?g.name:'';};
const autoAllSubsDone=t=>{const s=t.subtasks||[];return s.length>0&&s.every(x=>x.done);};
const autoRuleInScope=(rule,sheetId)=>rule.scope==='all'||(Array.isArray(rule.scope)&&rule.scope.includes(sheetId));
function automationSummary(rule){const t=autoOptionLabel(AUTO_TRIGGERS,rule.trigger&&rule.trigger.type);const c=rule.condition?autoOptionLabel(AUTO_CONDITIONS,rule.condition.type):null;const a=(rule.actions||[]).map(x=>autoOptionLabel(AUTO_ACTIONS,x.type)).join(', ');return`כאשר ${t}${c?` ← בדוק ש${c}`:''} ← ${a}`;}
function autoMatchTrigger(trg,prev,next,sheet){const p=trg.params||{};switch(trg.type){
case 'task-added':return !prev;
case 'task-moved':{if(!prev||prev.groupId===next.groupId)return false;return !p.group||autoGroupName(sheet,next)===p.group;}
case 'task-completed':return !!prev&&!prev.done&&!!next.done;
case 'subtasks-completed':return !!prev&&!autoAllSubsDone(prev)&&autoAllSubsDone(next);
case 'status-changed':{if(!prev||prev.statusId===next.statusId)return false;return !p.status||next.statusId===p.status;}
case 'priority-changed':{if(!prev||prev.priority===next.priority)return false;return !p.priority||next.priority===p.priority;}
case 'discipline-changed':{if(!prev||prev.discipline===next.discipline)return false;return !p.discipline||next.discipline===p.discipline;}
case 'assignee-changed':{if(!prev||(prev.assigneeId||'')===(next.assigneeId||''))return false;return !p.staff||next.assigneeId===p.staff;}
case 'field-changed':{if(!prev||!p.field)return false;return JSON.stringify((prev.fieldValues||{})[p.field]??null)!==JSON.stringify((next.fieldValues||{})[p.field]??null);}
case 'duedate-changed':return !!prev&&(prev.dueDate||'')!==(next.dueDate||'');
default:return false;}}
function autoEvalCondition(cond,task,sheet){if(!cond||!cond.type)return true;const p=cond.params||{};switch(cond.type){
case 'in-group':return autoGroupName(sheet,task)===p.group;
case 'tasktype-is':return (task.taskType||'simple')===p.tasktype;
case 'status-is':return task.statusId===p.status;
case 'priority-is':return task.priority===p.priority;
case 'discipline-is':return task.discipline===p.discipline;
case 'assignee-is':return (task.assigneeId||'')===p.staff;
case 'field-is':return JSON.stringify((task.fieldValues||{})[p.field]??null)===JSON.stringify(p.value??null);
case 'duedate-is':{const d=task.dueDate||'';if(p.mode==='empty')return !d;if(!d)return false;return p.mode==='before'?d<p.date:d>p.date;}
default:return true;}}
function autoApplyAction(act,task,sheet){const p=act.params||{};switch(act.type){
case 'move-to-group':{const g=(sheet.groups||[]).find(g=>g.name===p.group);return g?{...task,groupId:g.id}:task;}
case 'complete-task':return{...task,done:true,statusId:'C'};
case 'add-subtask':return{...task,subtasks:[...(task.subtasks||[]),{id:uid(),title:p.title||'תת-משימה',done:false,statusId:'N',priority:'',discipline:'',events:[]}]};
case 'add-update':return{...task,events:[...(task.events||[]),{id:uid(),status:'update',date:todayISO(),note:p.note||'',assignee:task.discipline||''}]};
case 'set-status':return p.status?{...task,statusId:p.status,done:p.status==='C'?true:task.done}:task;
case 'set-priority':return p.priority?{...task,priority:p.priority}:task;
case 'set-discipline':return p.discipline?{...task,discipline:p.discipline}:task;
case 'set-assignee':return p.staff?{...task,assigneeId:p.staff}:task;
case 'set-field':return p.field?{...task,fieldValues:{...(task.fieldValues||{}),[p.field]:p.value}}:task;
case 'set-duedate':{let d='';if(p.mode==='relative'){const dt=new Date();dt.setDate(dt.getDate()+(parseInt(p.days)||0));d=dt.toISOString().slice(0,10);}else{d=p.date||'';}return d?{...task,dueDate:d}:task;}
default:return task;}}
/* Single pass over changed tasks. Rule actions never re-trigger other rules
   (no chaining, no loops by design). Time-based triggers are skipped here —
   they run once per load via runTimeBasedAutomations below. */
function runAutomations(prevData,nextData){const rules=(nextData.automations||[]).filter(r=>r.enabled&&r.trigger&&r.trigger.type&&(r.actions||[]).length&&r.trigger.type!=='duedate-approaching'&&r.trigger.type!=='task-overdue');if(!rules.length)return nextData;
const prevTasks={};(prevData&&prevData.sheets||[]).forEach(s=>{if(s.type==='list')(s.tasks||[]).forEach(t=>{prevTasks[t.id]=t;});});
let log=[...(nextData.automationLog||[])];let fired=false;
const sheets=(nextData.sheets||[]).map(sheet=>{if(sheet.type!=='list')return sheet;let changed=false;
const newTasks=(sheet.tasks||[]).map(task=>{const prev=prevTasks[task.id]||null;if(prev===task)return task;let cur=task;
rules.forEach(rule=>{if(!autoRuleInScope(rule,sheet.id))return;
if(!autoMatchTrigger(rule.trigger,prev,cur,sheet))return;
if(!autoEvalCondition(rule.condition,cur,sheet))return;
(rule.actions||[]).forEach(a=>{cur=autoApplyAction(a,cur,sheet);});
log.push({id:uid(),ruleId:rule.id,taskId:cur.id,at:Date.now(),dedupeKey:''});fired=true;});
if(cur!==task)changed=true;return cur;});
return changed?{...sheet,tasks:newTasks}:sheet;});
if(!fired)return nextData;return{...nextData,sheets,automationLog:log.slice(-200)};}
/* Date-based triggers — evaluated once per app load. Dedupe: a rule fires at
   most once per (rule, task, dueDate value); changing the due date re-arms it. */
function runTimeBasedAutomations(data){const rules=(data.automations||[]).filter(r=>r.enabled&&r.trigger&&(r.trigger.type==='duedate-approaching'||r.trigger.type==='task-overdue')&&(r.actions||[]).length);if(!rules.length)return{changed:false,data};
const today=todayISO();let log=[...(data.automationLog||[])];const seen=new Set(log.map(e=>e.dedupeKey).filter(Boolean));let fired=false;
const sheets=(data.sheets||[]).map(sheet=>{if(sheet.type!=='list')return sheet;let changed=false;
const newTasks=(sheet.tasks||[]).map(task=>{let cur=task;
rules.forEach(rule=>{if(!autoRuleInScope(rule,sheet.id))return;
const due=cur.dueDate||'';if(!due||cur.done)return;
if(rule.trigger.type==='duedate-approaching'){const days=parseInt(rule.trigger.params&&rule.trigger.params.days)||3;const dt=new Date(due);dt.setDate(dt.getDate()-days);const from=dt.toISOString().slice(0,10);if(today<from||today>due)return;}
else{if(due>=today)return;}
const key=`${rule.id}|${cur.id}|${due}`;if(seen.has(key))return;
if(!autoEvalCondition(rule.condition,cur,sheet))return;
(rule.actions||[]).forEach(a=>{cur=autoApplyAction(a,cur,sheet);});
seen.add(key);log.push({id:uid(),ruleId:rule.id,taskId:cur.id,at:Date.now(),dedupeKey:key});fired=true;});
if(cur!==task)changed=true;return cur;});
return changed?{...sheet,tasks:newTasks}:sheet;});
if(!fired)return{changed:false,data};return{changed:true,data:{...data,sheets,automationLog:log.slice(-200)}};}
/* ══ Toolbar ══ */function Toolbar({onAddTask
```

- [ ] **Step 2: Syntax check in the browser**

Reload `http://localhost:3403/project_hub_01.html`. Expect no console errors (the engine is defined but not yet called).

- [ ] **Step 3: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(automations): add trigger/condition/action catalogs and execution engine"
```

---

### Task 3: Hook the engine into `App`'s save + on-load pass

**Files:**
- Modify: `project_hub_01.html` (`App`'s `save` useCallback, ~line 1246)

- [ ] **Step 1: Run change-based rules inside `save`**

Find this exact text:

```js
const save=useCallback(nd=>{const d={...nd,_ts:Date.now()};
```

Replace with:

```js
const save=useCallback(nd=>{const ad=runAutomations(data,nd);const d={...ad,_ts:Date.now()};
```

(`detectActionLabel(data,nd)` on the next expression intentionally keeps `nd` — the undo label describes the *user's* action; the automation effects ride along in the same undo step via `d`.)

- [ ] **Step 2: Add the one-time on-load pass for date-based triggers**

Find this exact text (the end of the `save` useCallback plus the start of `undoTo`):

```js
setFutureStack([]);setData(d);persist(d);},[data,persist]);const undoTo=useCallback(
```

Replace with:

```js
setFutureStack([]);setData(d);persist(d);},[data,persist]);const timeAutoRan=useRef(false);React.useEffect(()=>{if(!data||timeAutoRan.current)return;timeAutoRan.current=true;const res=runTimeBasedAutomations(data);if(res.changed){const d={...res.data,_ts:Date.now()};setData(d);persist(d);}},[data,persist]);const undoTo=useCallback(
```

(No undo-history entry for the load pass — it isn't a user action. `undoTo`/`redoTo` call `setData`/`persist` directly and so never re-trigger rules.)

- [ ] **Step 3: Functional smoke test via console**

Reload the app, then run in the browser console (via the preview's javascript tool):

```js
(()=>{const raw=localStorage.getItem('pm_asana_v9');return raw?Object.keys(JSON.parse(raw)):'server-persisted — check app loads clean';})()
```

The real assertion for this task is simply: app loads, tasks render, editing a task (e.g. change a status) still saves normally, and the console shows no errors — the engine no-ops while `data.automations` is empty.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(automations): run rules on save and date-based rules on load"
```

---

### Task 4: Builder UI — `AutoParamControls` + `AutomationBuilder`

**Files:**
- Modify: `project_hub_01.html` (insert before `function FieldsTab`, ~line 1234)

- [ ] **Step 1: Insert the builder components**

Find this exact text (unique):

```js
function FieldsTab({data,save}){
```

Replace with the following (new components prepended; the original `function FieldsTab({data,save}){` remains unchanged at the end):

```js
function AutoSelect({value,onChange,options,placeholder}){return React.createElement("select",{value:value||'',onChange:e=>onChange(e.target.value),style:{width:'100%',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:6,fontSize:12,fontFamily:'inherit',color:'var(--text)',background:'var(--bg)',boxSizing:'border-box',marginTop:6}},React.createElement("option",{value:''},placeholder||'— בחר —'),options.map(o=>React.createElement("option",{key:o.v,value:o.v},o.l)));}
function AutoTextInput({value,onChange,placeholder,type}){return React.createElement("input",{type:type||'text',value:value??'',onChange:e=>onChange(e.target.value),placeholder:placeholder||'',style:{width:'100%',padding:'6px 8px',border:'1px solid var(--border)',borderRadius:6,fontSize:12,fontFamily:'inherit',color:'var(--text)',background:'var(--bg)',boxSizing:'border-box',marginTop:6,direction:'rtl'}});}
function AutoParamControls({type,params,setParams,data,scope}){const p=params||{};const set=(k,v)=>setParams({...p,[k]:v});
const statusOpts=STATUSES.map(s=>({v:s.id,l:s.label}));const prioOpts=PRIORITIES.map(x=>({v:x.id,l:x.label}));const discOpts=DISCIPLINES.map(x=>({v:x.id,l:x.label}));const staffOpts=autoStaffList(data).map(s=>({v:s.id,l:s.name}));const groupOpts=autoGroupOptions(data,scope).map(g=>({v:g,l:g}));const fieldOpts=(data.fields||[]).map(f=>({v:f.id,l:f.title}));const fieldDef=p.field?(data.fields||[]).find(f=>f.id===p.field):null;
switch(type){
case 'task-moved':return React.createElement(AutoSelect,{value:p.group,onChange:v=>set('group',v),options:groupOpts,placeholder:'כל קבוצה'});
case 'in-group':case 'move-to-group':return React.createElement(AutoSelect,{value:p.group,onChange:v=>set('group',v),options:groupOpts,placeholder:'— בחר קבוצה —'});
case 'status-changed':return React.createElement(AutoSelect,{value:p.status,onChange:v=>set('status',v),options:statusOpts,placeholder:'כל סטטוס'});
case 'status-is':case 'set-status':return React.createElement(AutoSelect,{value:p.status,onChange:v=>set('status',v),options:statusOpts,placeholder:'— בחר סטטוס —'});
case 'priority-changed':return React.createElement(AutoSelect,{value:p.priority,onChange:v=>set('priority',v),options:prioOpts,placeholder:'כל עדיפות'});
case 'priority-is':case 'set-priority':return React.createElement(AutoSelect,{value:p.priority,onChange:v=>set('priority',v),options:prioOpts,placeholder:'— בחר עדיפות —'});
case 'discipline-changed':return React.createElement(AutoSelect,{value:p.discipline,onChange:v=>set('discipline',v),options:discOpts,placeholder:'כל תחום'});
case 'discipline-is':case 'set-discipline':return React.createElement(AutoSelect,{value:p.discipline,onChange:v=>set('discipline',v),options:discOpts,placeholder:'— בחר תחום —'});
case 'assignee-changed':return React.createElement(AutoSelect,{value:p.staff,onChange:v=>set('staff',v),options:staffOpts,placeholder:'כל אחראי'});
case 'assignee-is':case 'set-assignee':return React.createElement(AutoSelect,{value:p.staff,onChange:v=>set('staff',v),options:staffOpts,placeholder:'— בחר אחראי —'});
case 'duedate-approaching':return React.createElement(AutoTextInput,{type:'number',value:p.days??3,onChange:v=>set('days',v),placeholder:'מספר ימים לפני'});
case 'field-changed':return React.createElement(AutoSelect,{value:p.field,onChange:v=>set('field',v),options:fieldOpts,placeholder:'— בחר שדה —'});
case 'field-is':case 'set-field':return React.createElement(React.Fragment,null,React.createElement(AutoSelect,{value:p.field,onChange:v=>setParams({...p,field:v,value:''}),options:fieldOpts,placeholder:'— בחר שדה —'}),p.field&&(fieldDef&&(fieldDef.type==='single-select'||fieldDef.type==='multi-select')?React.createElement(AutoSelect,{value:p.value,onChange:v=>set('value',v),options:(fieldDef.options||[]).map(o=>({v:o.id??o,l:o.label??String(o)})),placeholder:'— בחר ערך —'}):React.createElement(AutoTextInput,{value:p.value,onChange:v=>set('value',v),placeholder:'ערך'})));
case 'duedate-is':return React.createElement(React.Fragment,null,React.createElement(AutoSelect,{value:p.mode,onChange:v=>set('mode',v),options:[{v:'before',l:'לפני תאריך'},{v:'after',l:'אחרי תאריך'},{v:'empty',l:'ריק'}],placeholder:'— בחר —'}),p.mode&&p.mode!=='empty'&&React.createElement(AutoTextInput,{type:'date',value:p.date,onChange:v=>set('date',v)}));
case 'tasktype-is':return React.createElement(AutoSelect,{value:p.tasktype,onChange:v=>set('tasktype',v),options:[{v:'simple',l:'פשוטה'},{v:'process',l:'תהליך'}],placeholder:'— בחר —'});
case 'set-duedate':return React.createElement(React.Fragment,null,React.createElement(AutoSelect,{value:p.mode,onChange:v=>set('mode',v),options:[{v:'absolute',l:'תאריך מסוים'},{v:'relative',l:'מספר ימים מהיום'}],placeholder:'— בחר —'}),p.mode==='absolute'&&React.createElement(AutoTextInput,{type:'date',value:p.date,onChange:v=>set('date',v)}),p.mode==='relative'&&React.createElement(AutoTextInput,{type:'number',value:p.days??7,onChange:v=>set('days',v),placeholder:'מספר ימים'}));
case 'add-update':return React.createElement(AutoTextInput,{value:p.note,onChange:v=>set('note',v),placeholder:'טקסט העדכון'});
case 'add-subtask':return React.createElement(AutoTextInput,{value:p.title,onChange:v=>set('title',v),placeholder:'שם תת-המשימה'});
default:return null;}}
function AutomationBuilder({data,save,rule,onClose}){
const[name,setName]=useState(rule?rule.name:'');
const[scope,setScope]=useState(rule?rule.scope:'all');
const[trigger,setTrigger]=useState(rule?rule.trigger:null);
const[condition,setCondition]=useState(rule?rule.condition:null);
const[actions,setActions]=useState(rule?rule.actions:[]);
const[picker,setPicker]=useState('trigger');
const[search,setSearch]=useState('');
const listSheets=(data.sheets||[]).filter(s=>s.type==='list');
const valid=!!(trigger&&trigger.type&&actions.length);
const doSave=()=>{if(!valid)return;const r={id:rule?rule.id:uid(),name:name.trim()||'אוטומציה ללא שם',enabled:rule?rule.enabled!==false:true,scope,trigger,condition,actions};const autos=data.automations||[];save({...data,automations:rule?autos.map(x=>x.id===r.id?r:x):[...autos,r]});onClose();};
const pickerList=picker==='trigger'?AUTO_TRIGGERS:picker==='condition'?AUTO_CONDITIONS:AUTO_ACTIONS;
const cats=[...new Set(pickerList.map(o=>o.cat))];
const pick=o=>{if(picker==='trigger')setTrigger({type:o.id,params:{}});else if(picker==='condition')setCondition({type:o.id,params:{}});else setActions(a=>[...a,{type:o.id,params:{}}]);setSearch('');};
const stopClick=e=>e.stopPropagation();
const card=(key,title,body,onRemove)=>React.createElement("div",{onClick:()=>setPicker(key),style:{width:250,flexShrink:0,background:'var(--surface)',border:`1.5px solid ${picker===key?'var(--accent)':'var(--border)'}`,borderRadius:10,padding:'14px 16px',cursor:'pointer',boxShadow:picker===key?'0 2px 10px rgba(37,99,235,.14)':'0 1px 3px rgba(0,0,0,.05)',position:'relative'}},React.createElement("div",{style:{fontSize:11,fontWeight:700,color:'var(--text-3)',marginBottom:6}},title),body,onRemove&&React.createElement("button",{onClick:e=>{e.stopPropagation();onRemove();},title:'הסר',style:{position:'absolute',top:8,left:8,background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:13}},'✕'));
const connector=React.createElement("div",{style:{width:34,height:2,background:'var(--border-strong)',flexShrink:0,alignSelf:'center'}});
const triggerBody=trigger?React.createElement("div",null,React.createElement("div",{style:{fontSize:13,fontWeight:600,color:'var(--text)'}},autoOptionLabel(AUTO_TRIGGERS,trigger.type)),React.createElement("div",{onClick:stopClick},React.createElement(AutoParamControls,{type:trigger.type,params:trigger.params,setParams:np=>setTrigger({...trigger,params:np}),data,scope}))):React.createElement("div",{style:{color:'var(--text-3)',fontSize:12.5}},'+ בחר טריגר');
const condBody=condition?React.createElement("div",null,React.createElement("div",{style:{fontSize:13,fontWeight:600,color:'var(--text)'}},autoOptionLabel(AUTO_CONDITIONS,condition.type)),React.createElement("div",{onClick:stopClick},React.createElement(AutoParamControls,{type:condition.type,params:condition.params,setParams:np=>setCondition({...condition,params:np}),data,scope}))):null;
const actionsBody=actions.length?React.createElement("div",null,actions.map((a,i)=>React.createElement("div",{key:i,style:{borderTop:i>0?'1px solid var(--border)':'none',paddingTop:i>0?8:0,marginTop:i>0?8:0}},React.createElement("div",{style:{display:'flex',alignItems:'center',gap:6}},React.createElement("span",{style:{fontSize:13,fontWeight:600,color:'var(--text)',flex:1}},autoOptionLabel(AUTO_ACTIONS,a.type)),React.createElement("button",{onClick:e=>{e.stopPropagation();setActions(actions.filter((_,j)=>j!==i));},title:'הסר פעולה',style:{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:12}},'✕')),React.createElement("div",{onClick:stopClick},React.createElement(AutoParamControls,{type:a.type,params:a.params,setParams:np=>setActions(actions.map((x,j)=>j===i?{...x,params:np}:x)),data,scope})))),React.createElement("div",{style:{color:'var(--accent)',fontSize:11.5,marginTop:10,fontWeight:600}},'+ הוסף פעולה נוספת')):React.createElement("div",{style:{color:'var(--text-3)',fontSize:12.5}},'+ בחר פעולה');
return React.createElement("div",{style:{display:'flex',height:'100%',overflow:'hidden'}},
React.createElement("div",{style:{flex:1,overflow:'auto',padding:'20px 24px'}},
React.createElement("div",{style:{display:'flex',alignItems:'center',gap:10,marginBottom:8,flexWrap:'wrap'}},
React.createElement("input",{value:name,onChange:e=>setName(e.target.value),placeholder:'שם האוטומציה',style:{flex:'1 1 220px',maxWidth:340,padding:'8px 10px',border:'1px solid var(--border)',borderRadius:7,fontSize:13,fontFamily:'inherit',fontWeight:600,color:'var(--text)',background:'var(--surface)',direction:'rtl'}}),
React.createElement("select",{value:scope==='all'?'all':'custom',onChange:e=>setScope(e.target.value==='all'?'all':[]),style:{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,fontFamily:'inherit',color:'var(--text)',background:'var(--surface)'}},React.createElement("option",{value:'all'},'כל הפרויקט'),React.createElement("option",{value:'custom'},'שלבים נבחרים')),
React.createElement("div",{style:{marginRight:'auto',display:'flex',gap:8}},
React.createElement("button",{onClick:onClose,style:{padding:'8px 16px',fontSize:12.5,borderRadius:7,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-2)',cursor:'pointer',fontFamily:'inherit'}},'ביטול'),
React.createElement("button",{onClick:doSave,disabled:!valid,style:{padding:'8px 18px',fontSize:12.5,borderRadius:7,border:'none',background:valid?'var(--accent)':'var(--border)',color:valid?'#fff':'var(--text-3)',cursor:valid?'pointer':'not-allowed',fontFamily:'inherit',fontWeight:600}},'שמירה'))),
scope!=='all'&&React.createElement("div",{style:{display:'flex',gap:12,flexWrap:'wrap',marginBottom:6,padding:'8px 2px'}},listSheets.map(s=>React.createElement("label",{key:s.id,style:{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'var(--text)',cursor:'pointer'}},React.createElement("input",{type:'checkbox',checked:Array.isArray(scope)&&scope.includes(s.id),onChange:()=>setScope(sc=>{const arr=Array.isArray(sc)?sc:[];return arr.includes(s.id)?arr.filter(x=>x!==s.id):[...arr,s.id];}),style:{accentColor:'var(--accent)'}}),s.name))),
React.createElement("div",{style:{display:'flex',alignItems:'flex-start',marginTop:18}},
card('trigger','כאשר...',triggerBody),
connector,
condition?card('condition','תבדוק ש...',condBody,()=>{setCondition(null);if(picker==='condition')setPicker(null);}):React.createElement("button",{onClick:()=>setPicker('condition'),style:{alignSelf:'center',flexShrink:0,padding:'8px 14px',fontSize:12,borderRadius:8,border:'1.5px dashed var(--border-strong)',background:'none',color:'var(--text-2)',cursor:'pointer',fontFamily:'inherit'}},'+ תנאי'),
connector,
card('action','תעשה...',actionsBody))),
picker&&React.createElement("div",{style:{width:300,flexShrink:0,borderRight:'1px solid var(--border)',background:'var(--surface)',display:'flex',flexDirection:'column',overflow:'hidden'}},
React.createElement("div",{style:{display:'flex',alignItems:'center',padding:'14px 16px 6px'}},
React.createElement("div",{style:{flex:1}},
React.createElement("div",{style:{fontSize:13.5,fontWeight:700,color:'var(--text)'}},picker==='trigger'?'כאשר...':picker==='condition'?'תבדוק ש...':'תעשה...'),
React.createElement("div",{style:{fontSize:11,color:'var(--text-3)',marginTop:2}},picker==='trigger'?'בחר טריגר שמפעיל את החוק':picker==='condition'?'הוסף תנאי שחייב להתקיים':'בחר פעולה שתתבצע')),
React.createElement("button",{onClick:()=>setPicker(null),style:{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:14}},'✕')),
React.createElement("div",{style:{padding:'8px 16px'}},React.createElement("input",{value:search,onChange:e=>setSearch(e.target.value),placeholder:'חיפוש...',style:{width:'100%',padding:'7px 10px',border:'1px solid var(--border)',borderRadius:7,fontSize:12,fontFamily:'inherit',background:'var(--bg)',color:'var(--text)',boxSizing:'border-box',direction:'rtl'}})),
React.createElement("div",{style:{flex:1,overflow:'auto',padding:'0 8px 14px'}},cats.map(cat=>{const opts=pickerList.filter(o=>o.cat===cat&&(!search.trim()||o.label.includes(search.trim())));if(!opts.length)return null;return React.createElement("div",{key:cat},React.createElement("div",{style:{fontSize:10.5,fontWeight:700,color:'var(--text-3)',padding:'10px 8px 4px',letterSpacing:.4}},cat),opts.map(o=>React.createElement("button",{key:o.id,onClick:()=>pick(o),style:{display:'block',width:'100%',textAlign:'right',padding:'8px 10px',border:'none',background:'none',borderRadius:7,fontSize:12.5,fontFamily:'inherit',color:'var(--text)',cursor:'pointer'},onMouseEnter:e=>e.currentTarget.style.background='var(--bg)',onMouseLeave:e=>e.currentTarget.style.background='none'},o.label)));}))));}
function FieldsTab({data,save}){
```

- [ ] **Step 2: Syntax check in the browser**

Reload `http://localhost:3403/project_hub_01.html`. Expect no console errors (the components exist but are not yet rendered anywhere).

- [ ] **Step 3: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(automations): add visual rule builder components"
```

---

### Task 5: `AutomationsTab` list + fourth Template tab

**Files:**
- Modify: `project_hub_01.html` (insert before `function AutomationBuilder` from Task 4; `TemplateView` signature ~line 1235 and tab bar ~line 1239)

- [ ] **Step 1: Insert the `AutomationsTab` component**

Find this exact text (from Task 4's insertion):

```js
function AutomationBuilder({data,save,rule,onClose}){
```

Replace with (prepends `AutomationsTab`; the original line remains at the end):

```js
function AutomationsTab({data,save,openRuleId,onOpenConsumed}){const autos=data.automations||[];const[editing,setEditing]=useState(null);
useEffect(()=>{if(openRuleId){const r=(data.automations||[]).find(x=>x.id===openRuleId);if(r)setEditing(r);onOpenConsumed&&onOpenConsumed();}},[openRuleId]);
const toggle=r=>save({...data,automations:autos.map(x=>x.id===r.id?{...x,enabled:!x.enabled}:x)});
const del=r=>{if(!window.confirm(`למחוק את האוטומציה "${r.name}"?`))return;save({...data,automations:autos.filter(x=>x.id!==r.id)});};
if(editing)return React.createElement(AutomationBuilder,{data,save,rule:editing.id?editing:null,onClose:()=>setEditing(null)});
return React.createElement("div",{style:{padding:'24px 20px',maxWidth:760}},
React.createElement("div",{style:{display:'flex',alignItems:'center',marginBottom:16}},
React.createElement("div",{className:'sp-sec-lbl',style:{padding:0,flex:1}},'אוטומציות הפרויקט'),
React.createElement("button",{onClick:()=>setEditing({}),style:{background:'var(--accent)',color:'#fff',border:'none',borderRadius:7,padding:'7px 16px',fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}},'+ אוטומציה חדשה')),
autos.length===0?React.createElement("div",{style:{color:'var(--text-3)',fontSize:12.5,padding:'28px 0',textAlign:'center',border:'1.5px dashed var(--border)',borderRadius:10}},'עדיין אין אוטומציות בפרויקט — צור אחת עם הכפתור למעלה'):
React.createElement("div",{style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}},autos.map((r,i)=>React.createElement("div",{key:r.id,style:{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderTop:i>0?'1px solid var(--border)':'none',opacity:r.enabled?1:.55}},
React.createElement("button",{className:`sp-toggle${r.enabled?' on':''}`,title:r.enabled?'כבה':'הפעל',onClick:()=>toggle(r)}),
React.createElement("div",{style:{flex:1,minWidth:0}},
React.createElement("div",{style:{fontSize:13,fontWeight:600,color:'var(--text)'}},r.name),
React.createElement("div",{style:{fontSize:11.5,color:'var(--text-2)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},automationSummary(r))),
React.createElement("span",{style:{fontSize:11,color:'var(--text-3)',flexShrink:0}},autoScopeLabel(r)),
React.createElement("button",{title:'ערוך',onClick:()=>setEditing(r),style:{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:13}},'✏'),
React.createElement("button",{title:'מחק',onClick:()=>del(r),style:{background:'none',border:'none',cursor:'pointer',color:'#EF4444',fontSize:13}},'✕')))));}
function AutomationBuilder({data,save,rule,onClose}){
```

- [ ] **Step 2: Extend `TemplateView`'s signature and add the nav-request effect**

Find this exact text:

```js
function TemplateView({data,save}){const[activeTab,setActiveTab]=useState('work');// 'general' | 'work'
```

Replace with:

```js
function TemplateView({data,save,autoNavReq,onAutoNavConsumed}){const[activeTab,setActiveTab]=useState('work');useEffect(()=>{if(autoNavReq)setActiveTab('automations');},[autoNavReq]);// 'general' | 'work' | 'fields' | 'automations'
```

- [ ] **Step 3: Add the fourth tab and its content branch**

Find this exact text:

```js
[{id:'general',label:'כללי'},{id:'work',label:'סכימת עבודה'},{id:'fields',label:'שדות'}].map(t=>
```

Replace with:

```js
[{id:'general',label:'כללי'},{id:'work',label:'סכימת עבודה'},{id:'fields',label:'שדות'},{id:'automations',label:'אוטומציות'}].map(t=>
```

Then find this exact text:

```js
activeTab==='fields'&&/*#__PURE__*/React.createElement(FieldsTab,{data,save}),
```

Replace with:

```js
activeTab==='fields'&&/*#__PURE__*/React.createElement(FieldsTab,{data,save}),activeTab==='automations'&&/*#__PURE__*/React.createElement(AutomationsTab,{data:data,save:save,openRuleId:autoNavReq?autoNavReq.ruleId:null,onOpenConsumed:onAutoNavConsumed}),
```

Note: the `automations` tab content must NOT be wrapped in extra padding — `AutomationBuilder` manages its own full-height flex layout, and the tab content container already has `flex:1,overflow:'auto'`.

- [ ] **Step 4: Verify in the browser**

Reload, open טמפלייט in the sidebar → the new "אוטומציות" tab. Expect: empty state + "+ אוטומציה חדשה". Click it → builder opens with the three cards (כאשר / + תנאי / תעשה) and the picker panel on the left showing triggers. Pick "סטטוס השתנה", pick a status param, click the תעשה card, pick "שנה עדיפות ל...", choose a priority, name it, save. Expect: back at the list showing the rule with a readable summary. No console errors.

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(automations): add אוטומציות Template tab with rule list and builder"
```

---

### Task 6: Toolbar "אוטומציות" button + navigation threading

**Files:**
- Modify: `project_hub_01.html` (`App` ~line 1247, `TrackView` ~line 1157/1164, `ListView` ~line 910/919, `Toolbar` ~line 855/856)

- [ ] **Step 1: App-level nav state and callbacks**

Find this exact text:

```js
const[track,setTrack]=useState('tasks');
```

Replace with:

```js
const[track,setTrack]=useState('tasks');const[autoNavReq,setAutoNavReq]=useState(null);const editAutomation=useCallback(ruleId=>{setAutoNavReq({ruleId});setTrack('template');},[]);
```

- [ ] **Step 2: Pass the callbacks into `TrackView` and `TemplateView`**

Find this exact text:

```js
React.createElement(TrackView,{data:data,save:save,trackId:track})
```

Replace with:

```js
React.createElement(TrackView,{data:data,save:save,trackId:track,onEditAutomation:editAutomation})
```

Find this exact text:

```js
React.createElement(TemplateView,{data:data,save:save})
```

Replace with:

```js
React.createElement(TemplateView,{data:data,save:save,autoNavReq:autoNavReq,onAutoNavConsumed:()=>setAutoNavReq(null)})
```

- [ ] **Step 3: Accept the prop in `TrackView` and build the toolbar context for the active stage**

Find this exact text:

```js
function TrackView({data,save,trackId,onOpenMeeting})
```

Replace with:

```js
function TrackView({data,save,trackId,onOpenMeeting,onEditAutomation})
```

Find this exact text (the per-stage `ListView` call):

```js
React.createElement(ListView,{data:activeStage,save:patch=>saveSheet(activeStage.id,patch),onOpenMeeting:onOpenMeeting,meetings:data.meetings,projectFields:data.fields||[]})
```

Replace with:

```js
React.createElement(ListView,{data:activeStage,save:patch=>saveSheet(activeStage.id,patch),onOpenMeeting:onOpenMeeting,meetings:data.meetings,projectFields:data.fields||[],automations:{rules:(data.automations||[]).filter(r=>autoRuleInScope(r,activeStage.id)),onToggle:id=>save({...data,automations:(data.automations||[]).map(r=>r.id===id?{...r,enabled:!r.enabled}:r)}),onEdit:onEditAutomation}})
```

(The combined-view `ListView` call — `data:combinedData` — is intentionally left without `automations`: the button is hidden there, since the combined view isn't a single sheet a rule can scope to.)

- [ ] **Step 4: Thread through `ListView` to `Toolbar`**

Find this exact text:

```js
function ListView({data,save,onOpenMeeting,meetings,projectFields=[]}){
```

Replace with:

```js
function ListView({data,save,onOpenMeeting,meetings,projectFields=[],automations=null}){
```

Find this exact text (end of the `Toolbar` invocation inside `ListView`):

```js
isCombinedView:!!data.__combined}),
```

Replace with:

```js
isCombinedView:!!data.__combined,automations:automations}),
```

- [ ] **Step 5: Add the button + panel to `Toolbar`**

Find this exact text:

```js
function Toolbar({onAddTask,onAddGroup,filterState,setFilterState,sortState,setSortState,groupByState,setGroupByState,onSettings,settingsOpen,views,activeViewId,activeViewName,isViewDirty,onSaveView,onLoadView,onDeleteView,onRenameView,onUpdateView,trackOptions,stageOptions,isCombinedView}){
```

Replace with:

```js
function Toolbar({onAddTask,onAddGroup,filterState,setFilterState,sortState,setSortState,groupByState,setGroupByState,onSettings,settingsOpen,views,activeViewId,activeViewName,isViewDirty,onSaveView,onLoadView,onDeleteView,onRenameView,onUpdateView,trackOptions,stageOptions,isCombinedView,automations}){const[showAutos,setShowAutos]=useState(false);const autosRef=useRef(null);useEffect(()=>{if(!showAutos)return;const h=e=>{if(autosRef.current&&!autosRef.current.contains(e.target)){setShowAutos(false);}};document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);},[showAutos]);
```

Then find this exact text (the settings button at the toolbar's end):

```js
/*#__PURE__*/React.createElement("button",{className:`btn-tb${settingsOpen?' on':''}`,onClick:onSettings},"⚙ הגדרות")));}
```

Replace with:

```js
automations&&/*#__PURE__*/React.createElement("div",{ref:autosRef,style:{position:'relative'}},/*#__PURE__*/React.createElement("button",{className:`btn-tb${showAutos?' on':''}`,onClick:()=>setShowAutos(o=>!o)},"⚡ אוטומציות ",automations.rules.filter(r=>r.enabled).length>0&&/*#__PURE__*/React.createElement("span",{className:"tb-badge"},automations.rules.filter(r=>r.enabled).length)),showAutos&&/*#__PURE__*/React.createElement("div",{className:"dp",style:{right:0,left:'auto',minWidth:260,padding:0},onClick:e=>e.stopPropagation()},/*#__PURE__*/React.createElement("div",{className:"dp-title",style:{padding:'8px 12px 6px'}},"אוטומציות בשלב זה"),automations.rules.length===0&&/*#__PURE__*/React.createElement("div",{style:{padding:'6px 14px 10px',color:'var(--text-3)',fontSize:12}},"אין אוטומציות שחלות על שלב זה"),automations.rules.map(r=>/*#__PURE__*/React.createElement("div",{key:r.id,style:{display:'flex',alignItems:'center',gap:8,padding:'5px 12px'}},/*#__PURE__*/React.createElement("button",{className:`sp-toggle${r.enabled?' on':''}`,title:r.enabled?'כבה':'הפעל',onClick:()=>automations.onToggle(r.id)}),/*#__PURE__*/React.createElement("span",{style:{flex:1,fontSize:12.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},r.name),/*#__PURE__*/React.createElement("button",{title:"ערוך",onClick:()=>automations.onEdit(r.id),style:{background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',fontSize:12}},"✏"))),automations.rules.length>0&&/*#__PURE__*/React.createElement("div",{style:{height:6}}))),/*#__PURE__*/React.createElement("button",{className:`btn-tb${settingsOpen?' on':''}`,onClick:onSettings},"⚙ הגדרות")));}
```

- [ ] **Step 6: Verify in the browser**

Reload, open any track stage (e.g. מסלול רישוי → תנאים מקדימים). Expect a "⚡ אוטומציות" button next to "⚙ הגדרות". Click it: the panel lists rules in scope with working toggles; clicking ✏ jumps to טמפלייט → אוטומציות with that rule open in the builder. The מבט מאוחד (combined) list must NOT show the button. No console errors.

- [ ] **Step 7: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(automations): add toolbar automations panel with edit navigation"
```

---

### Task 7: End-to-end manual verification

**Files:** none (verification only)

Use the `project-hub` launch config → `http://localhost:3403/project_hub_01.html`.

- [ ] **Step 1: Change-based rule fires**

In טמפלייט → אוטומציות create: name "בדיקה 1", scope כל הפרויקט, trigger "סטטוס השתנה" with param בוצע, no condition, action "שנה עדיפות ל..." → נמוכה. Save. Open a task list, pick a task with priority ≠ נמוכה, change its status to בוצע. Expected: its priority flips to נמוכה in the same render.

- [ ] **Step 2: Condition gates the rule**

Edit "בדיקה 1": add condition "התחום הוא" → ARCH. Change a **non-ARCH** task's status to בוצע → priority must NOT change. Change an **ARCH** task's status to בוצע → priority changes.

- [ ] **Step 3: Disabled rule + scope**

Toggle the rule off in the Template list → trigger it → nothing happens. Toggle back on. Then edit scope to שלבים נבחרים with only one sheet checked → trigger it on a task in a *different* sheet → nothing happens; on the chosen sheet → fires.

- [ ] **Step 4: Move-to-group action**

Create a rule: trigger "משימה הושלמה", action "העבר לקבוצה" → some group of the current sheet. Complete a task in another group → it moves to that group.

- [ ] **Step 5: Date-based trigger on load**

Create a rule: trigger "משימה באיחור", action "הוסף עדכון למשימה" with note "באיחור!". Set some task's due date to yesterday (and make sure it isn't done). Reload the page. Expected: the task gains an עדכון event dated today with that note. Reload again — no duplicate (dedupe by rule+task+dueDate).

- [ ] **Step 6: Undo covers automation effects**

Trigger the Step-1 rule, then press Ctrl+Z once. Expected: both the status change AND the automated priority change revert together.

- [ ] **Step 7: Toolbar panel + builder navigation round-trip**

From a stage's ⚡ panel, toggle a rule off and on; click ✏ → lands in the builder with that rule loaded; ביטול returns to the rule list.

- [ ] **Step 8: Console check**

After all interactions, check the browser console — expect no errors.

No commit for this task. If any check fails, fix the offending task's code and re-verify before moving on.
