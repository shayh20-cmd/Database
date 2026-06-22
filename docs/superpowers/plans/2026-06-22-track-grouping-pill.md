# Track Grouping Pill Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the מבט מאוחד (combined) view's virtual-group rows, give the track-level (`__track`) grouping row a filled rounded-rect pill label reading `מסלול: {name}` instead of the plain dot+text label, while leaving stage/section grouping rows untouched.

**Architecture:** Single conditional branch inside the existing virtual-group `<tr className="sec-row">` render block in the `ListView` component (`project_hub.html`). No new state, no new helper functions — purely a JSX/style change keyed off `vg.field==='__track'`.

**Tech Stack:** Single-file HTML, React 18 (Babel standalone, no build step, no test runner). Verification is manual via the Claude Code browser preview tool.

---

### Task 1: Render track virtual-group rows with a filled pill label

**Files:**
- Modify: `project_hub.html:6834-6852` (inside `ListView`'s virtual-group `<tr className="sec-row">` block)

- [ ] **Step 1: Read the current block to confirm line numbers haven't shifted**

Open `project_hub.html` around line 6822-6852 and confirm this exact structure is present:

```jsx
<div style={{width:10,height:10,borderRadius:'50%',background:'var(--blue)',flexShrink:0}}/>
{vgRealGroup&&editingGroupId===vgRealGroup.id
  ?<input autoFocus value={groupNameDraft}
      onChange={e=>setGroupNameDraft(e.target.value)}
      onBlur={()=>{
        if(groupNameDraft.trim()) save({...data,groups:groups.map(x=>x.id===vgRealGroup.id?{...x,name:groupNameDraft.trim()}:x)});
        setEditingGroupId(null);
      }}
      onKeyDown={e=>{if(e.key==='Enter'){e.target.blur();}if(e.key==='Escape'){setEditingGroupId(null);}}}
      onClick={e=>e.stopPropagation()}
      style={{fontWeight:700,fontSize:13,border:'none',borderBottom:'1.5px solid var(--accent)',
        outline:'none',background:'transparent',fontFamily:'inherit',padding:'0 2px',minWidth:80}}/>
  :<span style={{fontWeight:700,fontSize:13,cursor:vgRealGroup?'text':'default'}}
      onClick={vgRealGroup?e=>{e.stopPropagation();setGroupNameDraft(vgRealGroup.name);setEditingGroupId(vgRealGroup.id);}:undefined}>
      {vg.pill
        ?<span className="pill" style={{color:vg.pill.color,background:vg.pill.bg}}>{vg.label}</span>
        :vg.label}
    </span>
}
```

If the structure differs (e.g. due to unrelated edits), locate the equivalent block by searching for `vgRealGroup&&editingGroupId===vgRealGroup.id` inside the virtual-groups `.map(vg=>{...})` render (not the real-groups `.map(g=>{...})` render further down — that one doesn't apply here).

- [ ] **Step 2: Replace the dot + label block with a track-aware conditional**

Replace this exact snippet (the dot `<div>` through the closing `</span>}` of Step 1, i.e. `project_hub.html:6834-6852`):

```jsx
                      <div style={{width:10,height:10,borderRadius:'50%',background:'var(--blue)',flexShrink:0}}/>
                      {vgRealGroup&&editingGroupId===vgRealGroup.id
                        ?<input autoFocus value={groupNameDraft}
                            onChange={e=>setGroupNameDraft(e.target.value)}
                            onBlur={()=>{
                              if(groupNameDraft.trim()) save({...data,groups:groups.map(x=>x.id===vgRealGroup.id?{...x,name:groupNameDraft.trim()}:x)});
                              setEditingGroupId(null);
                            }}
                            onKeyDown={e=>{if(e.key==='Enter'){e.target.blur();}if(e.key==='Escape'){setEditingGroupId(null);}}}
                            onClick={e=>e.stopPropagation()}
                            style={{fontWeight:700,fontSize:13,border:'none',borderBottom:'1.5px solid var(--accent)',
                              outline:'none',background:'transparent',fontFamily:'inherit',padding:'0 2px',minWidth:80}}/>
                        :<span style={{fontWeight:700,fontSize:13,cursor:vgRealGroup?'text':'default'}}
                            onClick={vgRealGroup?e=>{e.stopPropagation();setGroupNameDraft(vgRealGroup.name);setEditingGroupId(vgRealGroup.id);}:undefined}>
                            {vg.pill
                              ?<span className="pill" style={{color:vg.pill.color,background:vg.pill.bg}}>{vg.label}</span>
                              :vg.label}
                          </span>
                      }
```

with:

```jsx
                      {vg.field==='__track'
                        ?<span style={{background:'var(--blue)',color:'#fff',fontWeight:700,fontSize:13,
                              padding:'5px 14px',borderRadius:6,flexShrink:0}}>
                            מסלול: {vg.label}
                          </span>
                        :<>
                          <div style={{width:10,height:10,borderRadius:'50%',background:'var(--blue)',flexShrink:0}}/>
                          {vgRealGroup&&editingGroupId===vgRealGroup.id
                            ?<input autoFocus value={groupNameDraft}
                                onChange={e=>setGroupNameDraft(e.target.value)}
                                onBlur={()=>{
                                  if(groupNameDraft.trim()) save({...data,groups:groups.map(x=>x.id===vgRealGroup.id?{...x,name:groupNameDraft.trim()}:x)});
                                  setEditingGroupId(null);
                                }}
                                onKeyDown={e=>{if(e.key==='Enter'){e.target.blur();}if(e.key==='Escape'){setEditingGroupId(null);}}}
                                onClick={e=>e.stopPropagation()}
                                style={{fontWeight:700,fontSize:13,border:'none',borderBottom:'1.5px solid var(--accent)',
                                  outline:'none',background:'transparent',fontFamily:'inherit',padding:'0 2px',minWidth:80}}/>
                            :<span style={{fontWeight:700,fontSize:13,cursor:vgRealGroup?'text':'default'}}
                                onClick={vgRealGroup?e=>{e.stopPropagation();setGroupNameDraft(vgRealGroup.name);setEditingGroupId(vgRealGroup.id);}:undefined}>
                                {vg.pill
                                  ?<span className="pill" style={{color:vg.pill.color,background:vg.pill.bg}}>{vg.label}</span>
                                  :vg.label}
                              </span>
                          }
                        </>
                      }
```

Note: `vgRealGroup` is only non-null when `vg.field==='section'` (see the line right above this block: `const vgRealGroup=vg.field==='section'?groups.find(g=>g.id===vg.value):null;`), so it is always `null` inside the new `vg.field==='__track'` branch — no rename-on-click behavior is lost for track rows because they never had it.

- [ ] **Step 3: Start the dev preview and navigate to the combined view**

Use the `mcp__Claude_Preview__preview_start` tool pointed at `project_hub.html` (or reload if already running), then:
1. In the app, open the project, go to the track tab row, click `מבט מאוחד`.
2. Use the קבוצות (group-by) control in the toolbar to set grouping to `מסלול` (track) as the only/primary criterion (or apply a track filter — either path sets `groupByState` to `[{field:'__track'}]` per the existing auto-switch effect).

- [ ] **Step 4: Visually verify the pill**

Use `mcp__Claude_Preview__preview_snapshot` and `mcp__Claude_Preview__preview_screenshot` to confirm:
- Each top-level group row shows a blue filled pill with white text reading `מסלול: <track name>` (e.g. `מסלול: רישוי`), `border-radius: 6px` (rounded-rect, not a full circle).
- No leftover round dot next to the pill.
- The chevron still toggles collapse/expand (click it via `mcp__Claude_Preview__preview_click` and confirm rows hide/show).
- Task count text (`N משימות`) still appears after the pill.

- [ ] **Step 5: Verify stage and section grouping are unaffected**

Switch grouping to `שלב` (stage) only, and separately to a regular sheet's default `מקטע`/`section` grouping (outside מבט מאוחד). Confirm both still show the original round dot + plain text label (no pill, no `מסלול:` prefix) — i.e. nothing regressed for `vg.field==='__stage'` or `'section'`.

- [ ] **Step 6: Verify two-level grouping (track + stage)**

In the toolbar's group-by control, add a second grouping criterion (`שלב`) on top of `מסלול`, producing `groupByState=[{field:'__track'},{field:'__stage'}]`. Confirm:
- Top-level rows still show the new track pill.
- Nested `sub-sec-row` rows for each stage subgroup are unchanged (round dot, plain text, smaller font) and still appear indented underneath each track pill row.

- [ ] **Step 7: Commit**

```bash
git add project_hub.html
git commit -m "feat: render track-level grouping rows as filled pills in מבט מאוחד"
```
