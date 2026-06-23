# Combined View Flat Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In מבט מאוחד (the combined cross-track/stage view), make filtering and grouping fully independent: the view defaults to one flat, ungrouped task list, filtering only narrows that flat list, and grouping headers (by section/track/stage/etc.) appear only when explicitly chosen via the "קבוצות" toolbar control.

**Architecture:** Single-file HTML app (`project_hub.html`), React 18 via Babel standalone, no build step, no test framework. The change is confined to the `ListView` and `Toolbar` components: change one initial state value, delete one effect, add one new conditional render branch, and adjust three toolbar reset/default behaviors to be combined-view-aware.

**Tech Stack:** Vanilla React 18 (Babel standalone). Verification is manual via the Claude Code browser preview tool (`mcp__Claude_Preview__*`), same as the prior track-pill change.

---

### Task 1: Decouple grouping from filtering in מבט מאוחד

**Files:**
- Modify: `project_hub.html:6325` (`groupByState` initial state)
- Modify: `project_hub.html:6326-6334` (delete the auto-switch effect)
- Modify: `project_hub.html:6542` (`clearAll`)
- Modify: `project_hub.html:5254-5256` (`Toolbar`'s `groupList`/`isDefaultGroup`/`groupCount`)
- Modify: `project_hub.html:5512` (last-criterion delete handler)
- Modify: `project_hub.html:5523` (reset-group handler)
- Modify: `project_hub.html:5184` (`Toolbar` function signature — add `isCombinedView` prop)
- Modify: `project_hub.html:6698-6699` area (the `<Toolbar .../>` call site in `ListView` — add `isCombinedView` prop)
- Modify: `project_hub.html:6624-6677` (`isDefaultGrouping`/`virtualGroups` computation — add `isFlatMode`)
- Modify: `project_hub.html:6906` (real-groups render guard — add `&&!isFlatMode`)
- Modify: `project_hub.html:6786` area (`<tbody>` — add new flat-render branch)

- [ ] **Step 1: Confirm current code matches expectations**

Read `project_hub.html` at the following ranges and confirm they match exactly (line numbers may have drifted by a few lines from unrelated edits, but the content should match):

`6321-6335`:
```jsx
function ListView({data, save}) {
  const {groups,tasks}=data;
  const [filterState,setFilterState]=useState(null);
  const [sortState,setSortState]=useState(null);
  const [groupByState,setGroupByState]=useState([{field:'section'}]);
  /* Combined view: filtering by track/stage should auto-switch grouping to match —
     selecting a track alone shows one flat header per track (no stage breakdown);
     selecting a stage shows one flat header per stage with its tasks underneath. */
  useEffect(()=>{
    if(!data.__combined) return;
    if(filterState?.stage?.length)       setGroupByState([{field:'__stage'}]);
    else if(filterState?.track?.length)  setGroupByState([{field:'__track'}]);
    else                                   setGroupByState([{field:'section'}]);
  },[JSON.stringify(filterState?.track||[]),JSON.stringify(filterState?.stage||[]),data.__combined]);
  const [newTaskId,setNewTaskId]=useState(null);
```

`6542`:
```jsx
  const clearAll=()=>{setFilterState(null);setSortState(null);setGroupByState([{field:'section'}]);};
```

`5184`:
```jsx
function Toolbar({onAddTask, onAddGroup, filterState, setFilterState, sortState, setSortState, groupByState, setGroupByState, onSettings, settingsOpen, views, activeViewId, activeViewName, isViewDirty, onSaveView, onLoadView, onDeleteView, onRenameView, onUpdateView, trackOptions, stageOptions}) {
```

`5250-5256`:
```jsx
  const sortList    = sortState||[];
  const filterMap    = filterState||{};
  const filterCount = Object.values(filterMap).reduce((n,arr)=>n+(arr?.length||0),0);
  const sortCount   = sortList.length;
  const groupList   = groupByState||[{field:'section'}];
  const isDefaultGroup = groupList.length===1 && groupList[0].field==='section';
  const groupCount  = isDefaultGroup ? 0 : groupList.length;
```

`5510-5526`:
```jsx
                        <button className="sort-crit-move" disabled={i===0} onClick={()=>{const a=[...groupList];[a[i-1],a[i]]=[a[i],a[i-1]];setGroupByState(a);}}>↑</button>
                        <button className="sort-crit-move" disabled={i===groupList.length-1} onClick={()=>{const a=[...groupList];[a[i],a[i+1]]=[a[i+1],a[i]];setGroupByState(a);}}>↓</button>
                        <button className="sort-crit-del" onClick={()=>{const a=groupList.filter((_,j)=>j!==i);setGroupByState(a.length?a:[{field:'section'}]);}}>✕</button>
                      </div>
                    );
                  })}
                  <div style={{padding:'6px 0 4px',borderTop:groupList.length?'1px solid var(--border)':'none'}}>
                    {groupList.length<groupFields.length&&(
                      <div className="dp-opt" onClick={()=>setGroupAddStep(true)}>
                        <span style={{color:'var(--blue)',fontWeight:700,fontSize:14,lineHeight:1}}>+</span> הוסף רמת קבוצה
                      </div>
                    )}
                    {!isDefaultGroup&&(
                      <div className="dp-opt" style={{color:'#EF4444'}} onClick={()=>{setGroupByState([{field:'section'}]);setShowGroup(false);}}>
                        ✕ אפס קבוצה
                      </div>
                    )}
                  </div>
```

`6690-6699`:
```jsx
  return(
    <>
      <Toolbar onAddTask={addTask} onAddGroup={addGroup} filterState={filterState} setFilterState={setFilterState} sortState={sortState} setSortState={setSortState}
        groupByState={groupByState} setGroupByState={setGroupByState}
        views={views} activeViewId={activeViewId} activeViewName={activeView?.name}
        isViewDirty={isViewDirty} onUpdateView={updateView}
        onSaveView={saveView} onLoadView={loadView} onDeleteView={deleteView} onRenameView={renameView}
        onSettings={()=>setShowSettings(o=>!o)} settingsOpen={showSettings}
        trackOptions={data.__combined ? [...new Set(tasks.map(t=>t.__track).filter(Boolean))] : null}
        stageOptions={data.__combined ? [...new Set(tasks.map(t=>t.__stage).filter(Boolean))] : null}/>
```

`6624-6627`:
```jsx
  /* ── Virtual group computation ── */
  const isDefaultGrouping = groupByState.length===1 && groupByState[0].field==='section';
  const buildVirtualGroups=()=>{
    const primaryField=groupByState[0].field;
```

`6677`:
```jsx
  const virtualGroups=isDefaultGrouping?null:buildVirtualGroups();
```

`6786-6787`:
```jsx
          <tbody>
            {virtualGroups&&virtualGroups.map(vg=>{
```

`6906` (search for `{!virtualGroups&&groups.map(g=>{` if the exact line number has drifted):
```jsx
            {!virtualGroups&&groups.map(g=>{
```

If any of these snippets don't match (content differs, not just line numbers), STOP and report — don't guess at the surrounding structure.

- [ ] **Step 2: Change `groupByState` initial state to be combined-view-aware**

In `ListView`, replace:
```jsx
  const [groupByState,setGroupByState]=useState([{field:'section'}]);
  /* Combined view: filtering by track/stage should auto-switch grouping to match —
     selecting a track alone shows one flat header per track (no stage breakdown);
     selecting a stage shows one flat header per stage with its tasks underneath. */
  useEffect(()=>{
    if(!data.__combined) return;
    if(filterState?.stage?.length)       setGroupByState([{field:'__stage'}]);
    else if(filterState?.track?.length)  setGroupByState([{field:'__track'}]);
    else                                   setGroupByState([{field:'section'}]);
  },[JSON.stringify(filterState?.track||[]),JSON.stringify(filterState?.stage||[]),data.__combined]);
```

with:
```jsx
  /* Combined view (מבט מאוחד) defaults to a flat, ungrouped list — filtering
     never implies grouping. Regular sheets keep grouping by section. */
  const [groupByState,setGroupByState]=useState(()=>data.__combined?[]:[{field:'section'}]);
```

This removes the effect entirely — `filterState` still drives `display` (the filtered task list) through existing logic elsewhere in `ListView`, untouched.

- [ ] **Step 3: Make `clearAll` combined-view-aware**

Replace:
```jsx
  const clearAll=()=>{setFilterState(null);setSortState(null);setGroupByState([{field:'section'}]);};
```
with:
```jsx
  const clearAll=()=>{setFilterState(null);setSortState(null);setGroupByState(data.__combined?[]:[{field:'section'}]);};
```

- [ ] **Step 4: Add `isFlatMode` and guard `isDefaultGrouping`/`virtualGroups`**

Replace:
```jsx
  /* ── Virtual group computation ── */
  const isDefaultGrouping = groupByState.length===1 && groupByState[0].field==='section';
```
with:
```jsx
  /* ── Virtual group computation ── */
  const isFlatMode = groupByState.length===0;
  const isDefaultGrouping = !isFlatMode && groupByState.length===1 && groupByState[0].field==='section';
```

Replace:
```jsx
  const virtualGroups=isDefaultGrouping?null:buildVirtualGroups();
```
with:
```jsx
  const virtualGroups=(!isFlatMode&&!isDefaultGrouping)?buildVirtualGroups():null;
```

- [ ] **Step 5: Guard the real-groups render branch against flat mode**

Find:
```jsx
            {!virtualGroups&&groups.map(g=>{
```
Replace with:
```jsx
            {!virtualGroups&&!isFlatMode&&groups.map(g=>{
```

- [ ] **Step 6: Add the flat-mode render branch**

Immediately before the `<tbody>`'s existing `{virtualGroups&&virtualGroups.map(vg=>{...})}` block (i.e. right after the `<tbody>` opening tag at `project_hub.html:6786`), add a new block. Find:
```jsx
          <tbody>
            {virtualGroups&&virtualGroups.map(vg=>{
```
Replace with:
```jsx
          <tbody>
            {isFlatMode&&(()=>{
              const colSpanFlat=visibleColIds.length+1;
              const taskRowPropsFlat={fields,visibleColIds,daysThreshold:data.builtinConfig?.__owner_status?.delayThreshold??null,sortState,
                taskDragSrc,taskDragTarget,onTaskDragStart:handleTaskDragStart,onTaskDragEnd:handleTaskDragEnd,onTaskDragOver:handleTaskDragOver,onTaskDrop:handleTaskDropOnTask,
                selectedIds,onSelect:handleSelect,onDuplicate:duplicateTask,onShowDetail:setDetailTaskId,expandSignal};
              const activeFlat=display.filter(t=>t.statusId!=='C');
              const doneFlat=display.filter(t=>t.statusId==='C');
              const doneOpenFlat=openDone.has('__flat__');
              const toggleDoneFlat=()=>setOpenDone(prev=>{const n=new Set(prev);n.has('__flat__')?n.delete('__flat__'):n.add('__flat__');return n;});
              const addTaskFlat=()=>{
                const gId=groups[0]?.id; if(!gId)return;
                const id=uid();
                savePartial({tasks:[...tasks,{id,groupId:gId,title:'',statusId:'N',priority:'',discipline:'',startDate:'',dueDate:'',comment:'',done:false,subtasks:[],fieldValues:{},events:[]}]});
                setNewTaskId(id);
              };
              return(<React.Fragment key="flat">
                {activeFlat.map(task=>(<TaskRow key={task.id} task={task} {...taskRowPropsFlat} autoFocus={task.id===newTaskId} onUpdate={t=>{setNewTaskId(null);updateTask(t);}} onDelete={()=>{setNewTaskId(null);deleteTask(task.id);}}/>))}
                {doneFlat.length>0&&(<>
                  <tr className="done-sec-row" onClick={toggleDoneFlat}>
                    <td colSpan={colSpanFlat}><div style={{display:'flex',alignItems:'center',gap:7}}>
                      <span className={`done-chevron${doneOpenFlat?' open':''}`}>▶</span>
                      <span style={{fontSize:12,fontWeight:600,color:'#888'}}>הושלמו</span>
                      <span style={{fontSize:11,fontWeight:400,color:'#888'}}>{doneFlat.length} משימות</span>
                    </div></td>
                  </tr>
                  {doneOpenFlat&&doneFlat.map(task=>(<TaskRow key={task.id} task={task} {...taskRowPropsFlat} autoFocus={task.id===newTaskId} onUpdate={t=>{setNewTaskId(null);updateTask(t);}} onDelete={()=>{setNewTaskId(null);deleteTask(task.id);}}/>))}
                </>)}
                <tr className="add-task-row"><td colSpan={colSpanFlat}>
                  <button className="add-task-btn" onClick={addTaskFlat}>
                    <span style={{fontSize:16,lineHeight:1,color:'var(--accent)'}}>+</span> הוסף משימה
                  </button>
                </td></tr>
              </React.Fragment>);
            })()}
            {virtualGroups&&virtualGroups.map(vg=>{
```

Note: `display`, `openDone`, `setOpenDone`, `groups`, `tasks`, `uid`, `savePartial`, `setNewTaskId`, `newTaskId`, `updateTask`, `deleteTask`, `fields`, `visibleColIds`, `sortState`, `taskDragSrc`, `taskDragTarget`, `handleTaskDragStart`, `handleTaskDragEnd`, `handleTaskDragOver`, `handleTaskDropOnTask`, `selectedIds`, `handleSelect`, `duplicateTask`, `setDetailTaskId`, `expandSignal` are all existing `ListView`-scope variables/functions already used by the surrounding code (the same names appear in the `virtualGroups` and real-groups branches just below) — no new state or helpers are introduced.

- [ ] **Step 7: Add `isCombinedView` prop to `Toolbar` and its call site**

In the `Toolbar` function signature, find:
```jsx
function Toolbar({onAddTask, onAddGroup, filterState, setFilterState, sortState, setSortState, groupByState, setGroupByState, onSettings, settingsOpen, views, activeViewId, activeViewName, isViewDirty, onSaveView, onLoadView, onDeleteView, onRenameView, onUpdateView, trackOptions, stageOptions}) {
```
Replace with:
```jsx
function Toolbar({onAddTask, onAddGroup, filterState, setFilterState, sortState, setSortState, groupByState, setGroupByState, onSettings, settingsOpen, views, activeViewId, activeViewName, isViewDirty, onSaveView, onLoadView, onDeleteView, onRenameView, onUpdateView, trackOptions, stageOptions, isCombinedView}) {
```

At the `<Toolbar .../>` call site in `ListView`, find:
```jsx
        trackOptions={data.__combined ? [...new Set(tasks.map(t=>t.__track).filter(Boolean))] : null}
        stageOptions={data.__combined ? [...new Set(tasks.map(t=>t.__stage).filter(Boolean))] : null}/>
```
Replace with:
```jsx
        trackOptions={data.__combined ? [...new Set(tasks.map(t=>t.__track).filter(Boolean))] : null}
        stageOptions={data.__combined ? [...new Set(tasks.map(t=>t.__stage).filter(Boolean))] : null}
        isCombinedView={!!data.__combined}/>
```

- [ ] **Step 8: Make `Toolbar`'s `isDefaultGroup` combined-view-aware**

Find:
```jsx
  const groupList   = groupByState||[{field:'section'}];
  const isDefaultGroup = groupList.length===1 && groupList[0].field==='section';
  const groupCount  = isDefaultGroup ? 0 : groupList.length;
```
Replace with:
```jsx
  const groupList   = groupByState||[{field:'section'}];
  const isDefaultGroup = isCombinedView ? groupList.length===0 : (groupList.length===1 && groupList[0].field==='section');
  const groupCount  = isDefaultGroup ? 0 : groupList.length;
```

- [ ] **Step 9: Make the last-criterion delete fallback combined-view-aware**

Find:
```jsx
                        <button className="sort-crit-del" onClick={()=>{const a=groupList.filter((_,j)=>j!==i);setGroupByState(a.length?a:[{field:'section'}]);}}>✕</button>
```
Replace with:
```jsx
                        <button className="sort-crit-del" onClick={()=>{const a=groupList.filter((_,j)=>j!==i);setGroupByState(a.length?a:(isCombinedView?[]:[{field:'section'}]));}}>✕</button>
```

- [ ] **Step 10: Make the "✕ אפס קבוצה" reset combined-view-aware**

Find:
```jsx
                    {!isDefaultGroup&&(
                      <div className="dp-opt" style={{color:'#EF4444'}} onClick={()=>{setGroupByState([{field:'section'}]);setShowGroup(false);}}>
                        ✕ אפס קבוצה
                      </div>
                    )}
```
Replace with:
```jsx
                    {!isDefaultGroup&&(
                      <div className="dp-opt" style={{color:'#EF4444'}} onClick={()=>{setGroupByState(isCombinedView?[]:[{field:'section'}]);setShowGroup(false);}}>
                        ✕ אפס קבוצה
                      </div>
                    )}
```

- [ ] **Step 11: Start the preview and verify default flat state**

Use `mcp__Claude_Preview__preview_start` with the `project-hub` launch config (already defined in `.claude/launch.json`, port 3401), then navigate (via `mcp__Claude_Preview__preview_eval`, `window.location.href='http://localhost:3401/project_hub.html'` followed by `window.location.reload()`) to `project_hub.html`. Click into "ניהול תכנון" → "מבט מאוחד" (same navigation as used to verify the track-pill change). Use `mcp__Claude_Preview__preview_screenshot` to confirm:
- No section/group headers are visible at all — just a flat sequence of task rows (plus a collapsed "הושלמו" row if any tasks are done, and an "+ הוסף משימה" row at the bottom).
- The "קבוצות" toolbar button shows no badge number (since `isDefaultGroup` is true when flat).

- [ ] **Step 12: Verify filtering does not introduce grouping**

Using `mcp__Claude_Preview__preview_eval`/`preview_click`, apply a track filter and separately a track+stage filter combination (the same "סינון" control used earlier — click "⊼ סינון", pick a track value, e.g. "מסלול רישוי", then also pick a stage value, e.g. "תנאים מקדימים"). Take a screenshot after each filter step and confirm:
- The task list narrows to only matching tasks.
- No section/track/stage header rows appear at any point — the list stays flat (same rendering as Step 11, just fewer rows).

- [ ] **Step 13: Verify explicit grouping still works**

Open the "קבוצות" control, add "מסלול" as a grouping criterion (same steps as previously used to verify the track-pill feature: click קבוצות → pick מסלול from the field list). Screenshot and confirm:
- Track-level pill headers (`מסלול: <name>`) now appear, grouping the (possibly filtered) task list — i.e. explicit grouping still functions exactly as before this change.
- Click "✕ אפס קבוצה" (or remove the criterion via its ✕ button) and confirm the view returns to the flat, header-less state from Step 11 — not to a `section`-grouped state.

- [ ] **Step 14: Verify non-combined sheets are unaffected**

Navigate to a regular track tab's sheet (e.g. "מסלול רישוי" → "תנאים מקדימים", NOT "מבט מאוחד"). Screenshot and confirm the existing section-grouped behavior is unchanged: it still shows מקטע group headers by default, and the "קבוצות" toolbar control still defaults/resets to section grouping there (not to a flat empty state).

- [ ] **Step 15: Commit**

```bash
git add project_hub.html
git commit -m "feat: decouple filtering from grouping in מבט מאוחד (flat by default)"
```
