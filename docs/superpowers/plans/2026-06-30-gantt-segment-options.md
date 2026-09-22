# Gantt Segment Display Sub-Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 display sub-options (תחום, סוג עדכון, ספירת ימים, חריגות) under the "עדכונים בגאנט" checkbox in NihulGanttView, each controlling what information appears inside Gantt event-segment bars.

**Architecture:** All changes are in `project_hub.html` (compiled single-file React app). No JSX — edits are to plain compiled JavaScript. Four new boolean state vars + one numeric state var drive the rendering. Sub-options UI appears as indented checkboxes when `showUpdates` is true. Overrun detection adds a red outline alongside the existing stuck-outline logic.

**Tech Stack:** React (in-browser, pre-compiled), single HTML file, PowerShell string replace via `[System.IO.File]`.

---

### Task 1: Add state variables

**Files:**
- Modify: `C:\Users\Omega\Database\project_hub.html` (NihulGanttView function, state section)

The five new state vars go immediately after the existing `showUpdates` line.

Find this exact string:
```
const[showUpdates,setShowUpdates]=useState(true);// segment bars by process-event holder
```

Replace with:
```
const[showUpdates,setShowUpdates]=useState(true);// segment bars by process-event holder
const[segShowDisc,setSegShowDisc]=useState(true);const[segShowType,setSegShowType]=useState(true);const[segShowDays,setSegShowDays]=useState(true);const[segOverrun,setSegOverrun]=useState(false);const[segOverrunDays,setSegOverrunDays]=useState(30);
```

- [ ] **Step 1: Apply the edit via PowerShell**

```powershell
$f = "C:\Users\Omega\Database\project_hub.html"
$c = [System.IO.File]::ReadAllText($f)
$old = 'const[showUpdates,setShowUpdates]=useState(true);// segment bars by process-event holder'
$new = 'const[showUpdates,setShowUpdates]=useState(true);// segment bars by process-event holder' + "`r`n" + 'const[segShowDisc,setSegShowDisc]=useState(true);const[segShowType,setSegShowType]=useState(true);const[segShowDays,setSegShowDays]=useState(true);const[segOverrun,setSegOverrun]=useState(false);const[segOverrunDays,setSegOverrunDays]=useState(30);'
if($c.Contains($old)){[System.IO.File]::WriteAllText($f,$c.Replace($old,$new),[System.Text.Encoding]::UTF8);Write-Host "OK"}else{Write-Host "NOT FOUND"}
```

Expected: `OK`

- [ ] **Step 2: Verify in browser** — reload `http://localhost:3400/project_hub.html`, confirm no JS errors in console.

- [ ] **Step 3: Commit**
```bash
git add project_hub.html
git commit -m "feat: add segShowDisc/Type/Days/Overrun state to NihulGanttView"
```

---

### Task 2: Update view snapshot to persist new state

**Files:**
- Modify: `C:\Users\Omega\Database\project_hub.html` (currentViewSnapshot + applyViewSnapshot)

Find:
```
currentViewSnapshot=()=>({filterState,sortState,groupByState,colorBy,showMilestones,showPrinciples,showUpdates});
```

Replace with:
```
currentViewSnapshot=()=>({filterState,sortState,groupByState,colorBy,showMilestones,showPrinciples,showUpdates,segShowDisc,segShowType,segShowDays,segOverrun,segOverrunDays});
```

Also find the `applyViewSnapshot` call that ends with `setShowUpdates(...)` — it will look like:
```
setShowUpdates(v.showUpdates??true);};
```

Replace with:
```
setShowUpdates(v.showUpdates??true);setSegShowDisc(v.segShowDisc??true);setSegShowType(v.segShowType??true);setSegShowDays(v.segShowDays??true);setSegOverrun(v.segOverrun??false);setSegOverrunDays(v.segOverrunDays??30);};
```

- [ ] **Step 1: Apply snapshot edit**

```powershell
$f = "C:\Users\Omega\Database\project_hub.html"
$c = [System.IO.File]::ReadAllText($f)
$old = 'currentViewSnapshot=()=>({filterState,sortState,groupByState,colorBy,showMilestones,showPrinciples,showUpdates});'
$new = 'currentViewSnapshot=()=>({filterState,sortState,groupByState,colorBy,showMilestones,showPrinciples,showUpdates,segShowDisc,segShowType,segShowDays,segOverrun,segOverrunDays});'
if($c.Contains($old)){$c=$c.Replace($old,$new);Write-Host "snapshot OK"}else{Write-Host "snapshot NOT FOUND"}
[System.IO.File]::WriteAllText($f,$c,[System.Text.Encoding]::UTF8)
```

- [ ] **Step 2: Apply applyViewSnapshot edit**

```powershell
$f = "C:\Users\Omega\Database\project_hub.html"
$c = [System.IO.File]::ReadAllText($f)
$old = 'setShowUpdates(v.showUpdates??true);};'
$new = 'setShowUpdates(v.showUpdates??true);setSegShowDisc(v.segShowDisc??true);setSegShowType(v.segShowType??true);setSegShowDays(v.segShowDays??true);setSegOverrun(v.segOverrun??false);setSegOverrunDays(v.segOverrunDays??30);};'
if($c.Contains($old)){[System.IO.File]::WriteAllText($f,$c.Replace($old,$new),[System.Text.Encoding]::UTF8);Write-Host "apply OK"}else{Write-Host "apply NOT FOUND"}
```

- [ ] **Step 3: Commit**
```bash
git add project_hub.html
git commit -m "feat: persist segment sub-options in gantt view snapshot"
```

---

### Task 3: Add sub-options UI in the layers panel

**Files:**
- Modify: `C:\Users\Omega\Database\project_hub.html` (layers panel, after "עדכונים בגאנט" label)

Find this exact string (the closing of the עדכונים בגאנט label, right before the separator div):
```
React.createElement("span",{style:{fontSize:12,color:'var(--text)'}},"עדכונים בגאנט")),/*#__PURE__*/React.createElement("div",{style:{borderTop:'1px solid var(--border)',margin:'4px 0'}})
```

Replace with (inserts the 4 sub-option rows between the label and the separator):
```
React.createElement("span",{style:{fontSize:12,color:'var(--text)'}},"עדכונים בגאנט")),showUpdates&&/*#__PURE__*/React.createElement("div",{style:{paddingRight:16,display:'flex',flexDirection:'column',gap:1}},/*#__PURE__*/React.createElement("label",{style:{display:'flex',alignItems:'center',gap:6,padding:'3px 6px',cursor:'pointer'}},/*#__PURE__*/React.createElement("input",{type:"checkbox",checked:segShowDisc,onChange:e=>setSegShowDisc(e.target.checked),style:{width:12,height:12,accentColor:'var(--accent)',cursor:'pointer'}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:'var(--text)'}},"תחום")),/*#__PURE__*/React.createElement("label",{style:{display:'flex',alignItems:'center',gap:6,padding:'3px 6px',cursor:'pointer'}},/*#__PURE__*/React.createElement("input",{type:"checkbox",checked:segShowType,onChange:e=>setSegShowType(e.target.checked),style:{width:12,height:12,accentColor:'var(--accent)',cursor:'pointer'}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:'var(--text)'}},"סוג עדכון")),/*#__PURE__*/React.createElement("label",{style:{display:'flex',alignItems:'center',gap:6,padding:'3px 6px',cursor:'pointer'}},/*#__PURE__*/React.createElement("input",{type:"checkbox",checked:segShowDays,onChange:e=>setSegShowDays(e.target.checked),style:{width:12,height:12,accentColor:'var(--accent)',cursor:'pointer'}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:'var(--text)'}},"ספירת ימים")),/*#__PURE__*/React.createElement("div",{style:{display:'flex',alignItems:'center',gap:6,padding:'3px 6px'}},/*#__PURE__*/React.createElement("input",{type:"checkbox",checked:segOverrun,onChange:e=>setSegOverrun(e.target.checked),style:{width:12,height:12,accentColor:'#EF4444',cursor:'pointer'}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:'var(--text)',cursor:'pointer',flex:1},onClick:()=>setSegOverrun(v=>!v)},"חריגות"),/*#__PURE__*/React.createElement("input",{type:"number",min:1,max:999,value:segOverrunDays,disabled:!segOverrun,onChange:e=>setSegOverrunDays(Number(e.target.value)||1),style:{width:36,fontSize:11,padding:'1px 4px',border:'1px solid var(--border)',borderRadius:4,background:segOverrun?'var(--surface)':'var(--bg)',color:'var(--text)',opacity:segOverrun?1:.4,textAlign:'center'}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:'var(--text-3)'}},"ימים"))),/*#__PURE__*/React.createElement("div",{style:{borderTop:'1px solid var(--border)',margin:'4px 0'}})
```

- [ ] **Step 1: Apply the UI edit via PowerShell**

```powershell
$f = "C:\Users\Omega\Database\project_hub.html"
$c = [System.IO.File]::ReadAllText($f)
$old = 'React.createElement("span",{style:{fontSize:12,color:''var(--text)''}},"עדכונים בגאנט")),/*#__PURE__*/React.createElement("div",{style:{borderTop:''1px solid var(--border)'',margin:''4px 0''}})'
$new = 'React.createElement("span",{style:{fontSize:12,color:''var(--text)''}},"עדכונים בגאנט")),showUpdates&&/*#__PURE__*/React.createElement("div",{style:{paddingRight:16,display:''flex'',flexDirection:''column'',gap:1}},/*#__PURE__*/React.createElement("label",{style:{display:''flex'',alignItems:''center'',gap:6,padding:''3px 6px'',cursor:''pointer''}},/*#__PURE__*/React.createElement("input",{type:"checkbox",checked:segShowDisc,onChange:e=>setSegShowDisc(e.target.checked),style:{width:12,height:12,accentColor:''var(--accent)'',cursor:''pointer''}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:''var(--text)''}},"תחום")),/*#__PURE__*/React.createElement("label",{style:{display:''flex'',alignItems:''center'',gap:6,padding:''3px 6px'',cursor:''pointer''}},/*#__PURE__*/React.createElement("input",{type:"checkbox",checked:segShowType,onChange:e=>setSegShowType(e.target.checked),style:{width:12,height:12,accentColor:''var(--accent)'',cursor:''pointer''}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:''var(--text)''}},"סוג עדכון")),/*#__PURE__*/React.createElement("label",{style:{display:''flex'',alignItems:''center'',gap:6,padding:''3px 6px'',cursor:''pointer''}},/*#__PURE__*/React.createElement("input",{type:"checkbox",checked:segShowDays,onChange:e=>setSegShowDays(e.target.checked),style:{width:12,height:12,accentColor:''var(--accent)'',cursor:''pointer''}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:''var(--text)''}},"ספירת ימים")),/*#__PURE__*/React.createElement("div",{style:{display:''flex'',alignItems:''center'',gap:6,padding:''3px 6px''}},/*#__PURE__*/React.createElement("input",{type:"checkbox",checked:segOverrun,onChange:e=>setSegOverrun(e.target.checked),style:{width:12,height:12,accentColor:''#EF4444'',cursor:''pointer''}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:''var(--text)'',cursor:''pointer'',flex:1},onClick:()=>setSegOverrun(v=>!v)},"חריגות"),/*#__PURE__*/React.createElement("input",{type:"number",min:1,max:999,value:segOverrunDays,disabled:!segOverrun,onChange:e=>setSegOverrunDays(Number(e.target.value)||1),style:{width:36,fontSize:11,padding:''1px 4px'',border:''1px solid var(--border)'',borderRadius:4,background:segOverrun?''var(--surface)'':''var(--bg)'',color:''var(--text)'',opacity:segOverrun?1:.4,textAlign:''center''}}),/*#__PURE__*/React.createElement("span",{style:{fontSize:11,color:''var(--text-3)''}},"ימים"))),/*#__PURE__*/React.createElement("div",{style:{borderTop:''1px solid var(--border)'',margin:''4px 0''}})'
if($c.Contains($old)){[System.IO.File]::WriteAllText($f,$c.Replace($old,$new),[System.Text.Encoding]::UTF8);Write-Host "OK"}else{Write-Host "NOT FOUND"}
```

- [ ] **Step 2: Reload browser and verify** — check the layers panel shows 4 sub-checkboxes when "עדכונים בגאנט" is on, hidden when off. The "חריגות" number input should be greyed out when its checkbox is unchecked.

- [ ] **Step 3: Commit**
```bash
git add project_hub.html
git commit -m "feat: add segment sub-options UI panel (תחום, סוג עדכון, ספירת ימים, חריגות)"
```

---

### Task 4: Update segment rendering — discipline, event type, day count

**Files:**
- Modify: `C:\Users\Omega\Database\project_hub.html` (segs.map segment children)

**Constants to add** — find this string near the top of the NihulGanttView function (after the state block, before the derived vars):

Find:
```
const discColor=id=>(disciplines.find(d=>d.id===id)||{}).color||null;
```

Replace with:
```
const TRANSIT_STATUSES=new Set(['sent','comments']);const discColor=id=>(disciplines.find(d=>d.id===id)||{}).color||null;
```

Then find the segment children (the content inside each segment div):
```
span===maxSegSpan&&span>=7&&sw>16&&/*#__PURE__*/React.createElement("span",{title:"הזמן הארוך ביותר בתהליך",style:{fontSize:9}},"⚠"))
```

Replace with:
```
segShowDisc&&sg.assignee&&sw>20&&/*#__PURE__*/React.createElement("span",{style:{fontSize:7,fontWeight:700,color:'#fff',flexShrink:0,whiteSpace:'nowrap',background:'rgba(0,0,0,.22)',borderRadius:3,padding:'0 3px'}},discLabel(sg.assignee)),segShowType&&sg.status&&EV_STATUSES[sg.status]&&sw>12&&/*#__PURE__*/React.createElement("span",{style:{fontSize:10,color:'rgba(255,255,255,.9)',flexShrink:0}},EV_STATUSES[sg.status].symbol),segShowDays&&!TRANSIT_STATUSES.has(sg.status)&&span>=3&&sw>30&&/*#__PURE__*/React.createElement("span",{style:{fontSize:8,color:'rgba(255,255,255,.85)',fontWeight:600,whiteSpace:'nowrap'}},span," י׳"))
```

- [ ] **Step 1: Add TRANSIT_STATUSES constant**

```powershell
$f = "C:\Users\Omega\Database\project_hub.html"
$c = [System.IO.File]::ReadAllText($f)
$old = 'const discColor=id=>(disciplines.find(d=>d.id===id)||{}).color||null;'
$new = "const TRANSIT_STATUSES=new Set(['sent','comments']);const discColor=id=>(disciplines.find(d=>d.id===id)||{}).color||null;"
if($c.Contains($old)){[System.IO.File]::WriteAllText($f,$c.Replace($old,$new),[System.Text.Encoding]::UTF8);Write-Host "OK"}else{Write-Host "NOT FOUND"}
```

- [ ] **Step 2: Replace segment children**

```powershell
$f = "C:\Users\Omega\Database\project_hub.html"
$c = [System.IO.File]::ReadAllText($f)
$old = 'span===maxSegSpan&&span>=7&&sw>16&&/*#__PURE__*/React.createElement("span",{title:"הזמן הארוך ביותר בתהליך",style:{fontSize:9}},"⚠"))'
$new = 'segShowDisc&&sg.assignee&&sw>20&&/*#__PURE__*/React.createElement("span",{style:{fontSize:7,fontWeight:700,color:''#fff'',flexShrink:0,whiteSpace:''nowrap'',background:''rgba(0,0,0,.22)'',borderRadius:3,padding:''0 3px''}},discLabel(sg.assignee)),segShowType&&sg.status&&EV_STATUSES[sg.status]&&sw>12&&/*#__PURE__*/React.createElement("span",{style:{fontSize:10,color:''rgba(255,255,255,.9)'',flexShrink:0}},EV_STATUSES[sg.status].symbol),segShowDays&&!TRANSIT_STATUSES.has(sg.status)&&span>=3&&sw>30&&/*#__PURE__*/React.createElement("span",{style:{fontSize:8,color:''rgba(255,255,255,.85)'',fontWeight:600,whiteSpace:''nowrap''}},span," י׳"))'
if($c.Contains($old)){[System.IO.File]::WriteAllText($f,$c.Replace($old,$new),[System.Text.Encoding]::UTF8);Write-Host "OK"}else{Write-Host "NOT FOUND"}
```

- [ ] **Step 3: Reload browser and verify** — enable "עדכונים בגאנט" and toggle each sub-option; confirm תחום labels, status symbols, and day counts appear/disappear correctly. Confirm day count is absent on segments with status `sent` or `comments`.

- [ ] **Step 4: Commit**
```bash
git add project_hub.html
git commit -m "feat: render תחום/סוג עדכון/ספירת ימים inside gantt segments"
```

---

### Task 5: Add overrun outline logic

**Files:**
- Modify: `C:\Users\Omega\Database\project_hub.html` (selOutline computation in row rendering)

Find the existing selOutline line (already modified earlier to include isStuck):
```
const isStuck=t.statusId==='S';const selOutline=isSelected?'2px solid var(--accent)':isStuck?'2px solid #EF4444':'none';
```

Replace with:
```
const isStuck=t.statusId==='S';const hasOverrun=segOverrun&&segs!=null&&segs.some(sg=>daysBetween(sg.from,sg.to)>=segOverrunDays);const selOutline=isSelected?'2px solid var(--accent)':(isStuck||hasOverrun)?'2px solid #EF4444':'none';
```

- [ ] **Step 1: Apply the edit**

```powershell
$f = "C:\Users\Omega\Database\project_hub.html"
$c = [System.IO.File]::ReadAllText($f)
$old = "const isStuck=t.statusId==='S';const selOutline=isSelected?'2px solid var(--accent)':isStuck?'2px solid #EF4444':'none';"
$new = "const isStuck=t.statusId==='S';const hasOverrun=segOverrun&&segs!=null&&segs.some(sg=>daysBetween(sg.from,sg.to)>=segOverrunDays);const selOutline=isSelected?'2px solid var(--accent)':(isStuck||hasOverrun)?'2px solid #EF4444':'none';"
if($c.Contains($old)){[System.IO.File]::WriteAllText($f,$c.Replace($old,$new),[System.Text.Encoding]::UTF8);Write-Host "OK"}else{Write-Host "NOT FOUND"}
```

- [ ] **Step 2: Reload browser and verify** — enable "חריגות", set threshold to a low number (e.g. 5 days), confirm that tasks with a segment exceeding that span get a red outline on the entire bar. Confirm no outline when threshold is higher than all segments.

- [ ] **Step 3: Final commit**
```bash
git add project_hub.html
git commit -m "feat: add overrun outline — red bar outline when segment exceeds threshold"
```
