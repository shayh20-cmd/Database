# Template "שדות" (Fields) Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "שדות" (Fields) tab to `TemplateView` where project-wide custom fields can be created (pick a type → configure) and are listed with a usage count (how many sheets show that column), moving custom-field ownership from per-sheet (`sheet.fields`) to project-wide (`data.fields`).

**Architecture:** `data.fields` becomes the single source of truth for custom field *definitions*, read by a new `FieldsTab` component (reusing the existing `AddFieldModal`/`EditFieldModal`). Each sheet keeps its own `hiddenCols` map purely for per-sheet visibility (unchanged mechanism) — a `projectFields` prop threads from `TrackView` (which already has root `data` in scope) through `ListView` to `SettingsPanel`, whose custom-fields section becomes a visibility toggle only.

**Tech Stack:** Single-file React 18 app (Babel standalone, no build step) — `project_hub_01.html`. No test framework for this file; verification is manual, via the browser preview tooling.

**Spec:** `docs/superpowers/specs/2026-07-13-template-fields-tab-design.md`

---

### Task 1: Data model — project-wide `fields` array

**Files:**
- Modify: `project_hub_01.html` (`makeDefaultData` and `migrateData` functions)

- [ ] **Step 1: Add `fields:[]` to `makeDefaultData`'s returned object**

Find this exact text (it's part of one long line — the start of `makeDefaultData`'s return object):

```js
"licensingMilestones":[],"licensingGoals":[],"sheets":[
```

Replace with:

```js
"licensingMilestones":[],"licensingGoals":[],"fields":[],"sheets":[
```

- [ ] **Step 2: Add a `fields` default in `migrateData` for existing saved data**

Find this exact text inside `migrateData` (right after the `licensingGoals` default-seeding block, before the `staff` default):

```js
{id:uid(),title:'קבלת היתר בנייה',targetDate:'2026-12-01',done:false}]};}if(!d.staff){d={...d,staff:OFFICE_STAFF};}
```

Replace with:

```js
{id:uid(),title:'קבלת היתר בנייה',targetDate:'2026-12-01',done:false}]};}if(!d.fields){d={...d,fields:[]};}if(!d.staff){d={...d,staff:OFFICE_STAFF};}
```

This ensures the live data file (`data/project_hub_01.json`, which predates this feature and has no root `fields` key) gets `fields:[]` added automatically the next time the app loads it, without any manual JSON edit.

Do **not** touch the `!d.sheets` branch above this (the ancient pre-multi-sheet migration path, which already has its own unrelated `d.fields`/`delete d.fields` handling for a single legacy sheet) — that logic is for a different, older data shape and is untouched by this feature.

- [ ] **Step 3: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(fields): add project-wide fields array to data model"
```

---

### Task 2: Add `FieldsTab` component and wire it into `TemplateView`'s new tab

**Files:**
- Modify: `project_hub_01.html` (new `FieldsTab` function, and `TemplateView`'s tab list/content)

- [ ] **Step 1: Insert the `FieldsTab` component definition**

Find this exact text (the comment header immediately before `TemplateView`'s definition):

```js
══════════════════════════════════════ */function TemplateView({data,save}){
```

Replace with (note: this prepends a brand-new `FieldsTab` function right before the existing comment+`TemplateView` — the `══...` comment and `function TemplateView({data,save}){` at the end are unchanged from the original, just preceded by new code):

```js
function FieldsTab({data,save}){const fields=data.fields||[];const sheets=data.sheets||[];const[addingType,setAddingType]=useState(null);const[editField,setEditField]=useState(null);const addField=f=>{save({...data,fields:[...fields,{...f,id:uid()}]});setAddingType(null);};const updateField=f=>{save({...data,fields:fields.map(x=>x.id===f.id?f:x)});setEditField(null);};const deleteField=id=>{save({...data,fields:fields.filter(f=>f.id!==id)});setEditField(null);};const usageCount=fieldId=>sheets.filter(s=>!(s.hiddenCols||{})[fieldId]).length;return/*#__PURE__*/React.createElement("div",{style:{padding:'24px 20px',display:'flex',flexDirection:'column',gap:24,maxWidth:640}},/*#__PURE__*/React.createElement("div",null,/*#__PURE__*/React.createElement("div",{className:"sp-sec-lbl",style:{padding:'0 0 8px'}},"יצירת שדה חדש"),/*#__PURE__*/React.createElement("div",{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8}},FIELD_TYPES.map(ft=>/*#__PURE__*/React.createElement("button",{key:ft.id,onClick:()=>setAddingType(ft.id),style:{display:'flex',alignItems:'center',gap:8,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',fontSize:12,fontFamily:'inherit',cursor:'pointer',textAlign:'right',color:'var(--text)'}},/*#__PURE__*/React.createElement("span",{style:{fontSize:14}},ft.icon),ft.label)))),/*#__PURE__*/React.createElement("div",null,/*#__PURE__*/React.createElement("div",{className:"sp-sec-lbl",style:{padding:'0 0 8px'}},"שדות הפרויקט"),fields.length===0?/*#__PURE__*/React.createElement("div",{style:{color:'var(--text-3)',fontSize:12}},"עדיין אין שדות בפרויקט"):/*#__PURE__*/React.createElement("div",{style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,overflow:'hidden'}},fields.map((f,i)=>/*#__PURE__*/React.createElement("div",{key:f.id,className:"sp-field-row",style:{cursor:'pointer',borderTop:i>0?'1px solid var(--border)':'none'},onClick:()=>setEditField(f)},/*#__PURE__*/React.createElement("div",{className:"sp-ficon"},FIELD_TYPES.find(t=>t.id===f.type)?.icon||'○'),/*#__PURE__*/React.createElement("span",{className:"sp-fname"},f.title),/*#__PURE__*/React.createElement("span",{className:"sp-ftype"},`מוצג ב-${usageCount(f.id)}/${sheets.length} שלבים`))))),addingType&&/*#__PURE__*/React.createElement(AddFieldModal,{onSave:addField,onClose:()=>setAddingType(null),fieldToEdit:{type:addingType}}),editField&&/*#__PURE__*/React.createElement(EditFieldModal,{field:editField,isBuiltin:false,onSave:updateField,onDelete:deleteField,onClose:()=>setEditField(null)}));}/* ══════════════════════════════════════
   Template View — track/stage hierarchy editor
══════════════════════════════════════ */function TemplateView({data,save}){
```

What this does:
- **Create grid**: one button per `FIELD_TYPES` entry. Clicking sets `addingType` to that type's id, which opens `AddFieldModal` seeded via `fieldToEdit:{type:addingType}` — this needs no change to `AddFieldModal` itself, since its `type` state already initializes from `fieldToEdit?.type`, and its `handleSave`'s `{...(fieldToEdit||{}),title,type}` spread produces a clean new-field object (no stray `id`, since `fieldToEdit` here has none).
- **Project Fields list**: one row per `data.fields` entry, each showing `usageCount(f.id)` — the count of sheets whose `hiddenCols` does *not* hide that field id (mirrors the existing default-visible-unless-hidden mechanic used everywhere else in this app for custom-field columns). Clicking a row opens `EditFieldModal` for that field.
- `addField`/`updateField`/`deleteField` all read/write `data.fields` directly (root-level, via the `save` prop `TemplateView` already receives — this is the *whole app* `save`, not a per-sheet one).

- [ ] **Step 2: Add the third tab and wire its content**

Find this exact text (the tab-bar array/map plus the `activeTab==='general'`/`activeTab==='work'` content branches):

```js
[{id:'general',label:'כללי'},{id:'work',label:'סכימת עבודה'}].map(t=>/*#__PURE__*/React.createElement("button",{key:t.id,onClick:()=>setActiveTab(t.id),style:{padding:'9px 16px',fontSize:12,fontFamily:'inherit',border:'none',cursor:'pointer',background:'none',borderBottom:'2px solid',borderBottomColor:activeTab===t.id?'var(--accent)':'transparent',fontWeight:activeTab===t.id?700:400,color:activeTab===t.id?'var(--text)':'var(--text-2)'}},t.label))),/*#__PURE__*/React.createElement("div",{style:{flex:1,overflow:'auto',background:'var(--bg)'}},activeTab==='general'&&/*#__PURE__*/React.createElement("div",{style:{padding:24,color:'var(--text-3)',fontSize:13}},"—"),activeTab==='work'&&/*#__PURE__*/
```

Replace with:

```js
[{id:'general',label:'כללי'},{id:'work',label:'סכימת עבודה'},{id:'fields',label:'שדות'}].map(t=>/*#__PURE__*/React.createElement("button",{key:t.id,onClick:()=>setActiveTab(t.id),style:{padding:'9px 16px',fontSize:12,fontFamily:'inherit',border:'none',cursor:'pointer',background:'none',borderBottom:'2px solid',borderBottomColor:activeTab===t.id?'var(--accent)':'transparent',fontWeight:activeTab===t.id?700:400,color:activeTab===t.id?'var(--text)':'var(--text-2)'}},t.label))),/*#__PURE__*/React.createElement("div",{style:{flex:1,overflow:'auto',background:'var(--bg)'}},activeTab==='general'&&/*#__PURE__*/React.createElement("div",{style:{padding:24,color:'var(--text-3)',fontSize:13}},"—"),activeTab==='fields'&&/*#__PURE__*/React.createElement(FieldsTab,{data,save}),activeTab==='work'&&/*#__PURE__*/
```

- [ ] **Step 3: Check for syntax errors in the browser before moving on**

Start the `project-hub` launch config (serves `C:\Users\Omega\Database` on port 3403) and open `http://localhost:3403/project_hub_01.html`. Check the browser console: expect **no** Babel/React errors. If there's a syntax error, it will typically show as a red overlay or a console error mentioning the offending code — re-check the `FieldsTab` code from Step 1 for a mismatched brace/paren (the most likely mistake given its length) before proceeding.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(template): add שדות tab with field creation grid and project fields list"
```

---

### Task 3: Thread `projectFields` from `TrackView` through `ListView` to `SettingsPanel`

**Files:**
- Modify: `project_hub_01.html` (`TrackView`'s two `ListView` render calls, `ListView`'s signature and its `SettingsPanel` render call)

- [ ] **Step 1: Pass `projectFields` at both `ListView` call sites in `TrackView`**

Find this exact text:

```js
React.createElement(ListView,{data:combinedData,save:saveCombined,onOpenMeeting:onOpenMeeting,meetings:data.meetings})
```

Replace with:

```js
React.createElement(ListView,{data:combinedData,save:saveCombined,onOpenMeeting:onOpenMeeting,meetings:data.meetings,projectFields:data.fields||[]})
```

Find this exact text:

```js
React.createElement(ListView,{data:activeStage,save:patch=>saveSheet(activeStage.id,patch),onOpenMeeting:onOpenMeeting,meetings:data.meetings})
```

Replace with:

```js
React.createElement(ListView,{data:activeStage,save:patch=>saveSheet(activeStage.id,patch),onOpenMeeting:onOpenMeeting,meetings:data.meetings,projectFields:data.fields||[]})
```

Both of these are inside `TrackView`, which already has the whole app's root `data` in scope (it's what `data.meetings` already reads from in these same two lines) — `data.fields` here is the project-wide field list from Task 1, not `activeStage`/`combinedData`'s own (now-unused) `fields` key.

- [ ] **Step 2: Accept and forward `projectFields` in `ListView`**

Find this exact text:

```js
function ListView({data,save,onOpenMeeting,meetings}){
```

Replace with:

```js
function ListView({data,save,onOpenMeeting,meetings,projectFields=[]}){
```

Find this exact text:

```js
React.createElement(SettingsPanel,{data:data,save:save,onClose:()=>setShowSettings(false)})
```

Replace with:

```js
React.createElement(SettingsPanel,{data:data,save:save,onClose:()=>setShowSettings(false),projectFields:projectFields})
```

- [ ] **Step 3: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(list-view): thread projectFields prop to SettingsPanel"
```

---

### Task 4: Make `SettingsPanel`'s custom-fields section visibility-only

**Files:**
- Modify: `project_hub_01.html` (`function SettingsPanel(...)`)

- [ ] **Step 1: Accept the new `projectFields` prop**

Find this exact text:

```js
function SettingsPanel({data,save,onClose}){
```

Replace with:

```js
function SettingsPanel({data,save,onClose,projectFields=[]}){
```

- [ ] **Step 2: Drop the now-unused `showAddField` state**

Find this exact text:

```js
const[showAddField,setShowAddField]=useState(false);const[editField,setEditField]=useState(null);// {field, isBuiltin}
```

Replace with:

```js
const[editField,setEditField]=useState(null);// {field, isBuiltin} — builtin only now; custom-field create/edit/delete live in the Template "שדות" tab
```

- [ ] **Step 3: Read field definitions from `projectFields` instead of the sheet, and drop `addField`/`updateField`/`deleteField`**

Find this exact text:

```js
const fields=data.fields||[];const hiddenCols=data.hiddenCols||{};const addField=f=>{save({...data,fields:[...fields,{...f,id:uid()}]});setShowAddField(false);};const updateField=f=>{save({...data,fields:fields.map(x=>x.id===f.id?f:x)});setEditField(null);};const deleteField=id=>save({...data,fields:fields.filter(f=>f.id!==id)});const toggleCol=id=>save({...data,hiddenCols:{...hiddenCols,[id]:!hiddenCols[id]}});
```

Replace with:

```js
const fields=projectFields;const hiddenCols=data.hiddenCols||{};const toggleCol=id=>save({...data,hiddenCols:{...hiddenCols,[id]:!hiddenCols[id]}});
```

`data` here is still the current sheet (unchanged — `hiddenCols`/`toggleCol` remain per-sheet visibility exactly as before), but `fields` (the field *definitions* to list) now comes from the project-wide `projectFields` prop instead of the sheet's own `fields` key.

- [ ] **Step 4: Make the custom-fields rows visibility-only (remove per-row click-to-edit and delete)**

Find this exact text:

```js
fields.length>0&&/*#__PURE__*/React.createElement(React.Fragment,null,/*#__PURE__*/React.createElement("div",{className:"sp-sep"}),/*#__PURE__*/React.createElement("div",{className:"sp-sec-lbl"},"שדות מותאמים אישית"),fields.map(f=>/*#__PURE__*/React.createElement("div",{key:f.id,className:"sp-field-row",style:{cursor:'pointer'},onClick:()=>setEditField({field:f,isBuiltin:false})},/*#__PURE__*/React.createElement("div",{className:"sp-ficon"},FIELD_TYPES.find(t=>t.id===f.type)?.icon||'○'),/*#__PURE__*/React.createElement("span",{className:"sp-fname"},f.title),/*#__PURE__*/React.createElement("span",{className:"sp-ftype"},FIELD_TYPE_LABEL[f.type]||f.type),/*#__PURE__*/React.createElement("div",{className:"sp-faction",onClick:e=>e.stopPropagation()},/*#__PURE__*/React.createElement("button",{className:`sp-toggle${!hiddenCols[f.id]?' on':''}`,title:hiddenCols[f.id]?'הצג':'הסתר',onClick:()=>toggleCol(f.id)}),/*#__PURE__*/React.createElement("button",{className:"sp-fbtn",title:"מחק",onClick:()=>deleteField(f.id),style:{color:'#EF4444'}},"✕"))))),/*#__PURE__*/React.createElement("button",{className:"sp-add-btn",onClick:()=>setShowAddField(true)},/*#__PURE__*/React.createElement("span",{style:{fontSize:15,lineHeight:1}},"+")," הוסף שדה"))
```

Replace with:

```js
fields.length>0&&/*#__PURE__*/React.createElement(React.Fragment,null,/*#__PURE__*/React.createElement("div",{className:"sp-sep"}),/*#__PURE__*/React.createElement("div",{className:"sp-sec-lbl"},"שדות מותאמים אישית"),fields.map(f=>/*#__PURE__*/React.createElement("div",{key:f.id,className:"sp-field-row"},/*#__PURE__*/React.createElement("div",{className:"sp-ficon"},FIELD_TYPES.find(t=>t.id===f.type)?.icon||'○'),/*#__PURE__*/React.createElement("span",{className:"sp-fname"},f.title),/*#__PURE__*/React.createElement("span",{className:"sp-ftype"},FIELD_TYPE_LABEL[f.type]||f.type),/*#__PURE__*/React.createElement("div",{className:"sp-faction"},/*#__PURE__*/React.createElement("button",{className:`sp-toggle${!hiddenCols[f.id]?' on':''}`,title:hiddenCols[f.id]?'הצג':'הסתר',onClick:()=>toggleCol(f.id)})))),/*#__PURE__*/React.createElement("div",{style:{padding:'8px 16px',fontSize:11,color:'var(--text-3)'}},"ליצירה ועריכה של שדות — לשונית \"שדות\" בתבנית"))
```

This removes the per-row `onClick` (no more opening `EditFieldModal` from here for custom fields) and the "✕ מחק" delete button, keeping only the existing `sp-toggle` visibility switch. The "+ הוסף שדה" button is replaced with a plain hint line pointing at the new tab.

- [ ] **Step 5: Simplify the bottom modal-rendering block**

Find this exact text:

```js
showAddField&&/*#__PURE__*/React.createElement(AddFieldModal,{onSave:addField,onClose:()=>setShowAddField(false)}),editField&&/*#__PURE__*/React.createElement(EditFieldModal,{field:editField.field,isBuiltin:editField.isBuiltin,onSave:editField.isBuiltin?updated=>{save({...data,builtinConfig:{...(data.builtinConfig||{}),[updated.id]:updated}});setEditField(null);}:updateField,onDelete:!editField.isBuiltin?deleteField:null,onClose:()=>setEditField(null)}));}
```

Replace with:

```js
editField&&/*#__PURE__*/React.createElement(EditFieldModal,{field:editField.field,isBuiltin:editField.isBuiltin,onSave:updated=>{save({...data,builtinConfig:{...(data.builtinConfig||{}),[updated.id]:updated}});setEditField(null);},onDelete:null,onClose:()=>setEditField(null)}));}
```

`editField` can now only ever be set from the built-in fields section (the only remaining `setEditField(...)` call in this file, on the built-in rows, already sets `isBuiltin:true`) — so this collapses the ternary to the built-in-only path, which is unchanged behavior from before (the built-in path already passed `onDelete:null`).

- [ ] **Step 6: Check for syntax errors in the browser**

Reload `http://localhost:3403/project_hub_01.html`, open any track's stage/list view, click the settings gear icon, navigate to "שדות". Check the browser console for errors before proceeding.

- [ ] **Step 7: Commit**

```bash
git add project_hub_01.html
git commit -m "refactor(settings-panel): custom fields become visibility-only, definitions move to Template tab"
```

---

### Task 5: Manual verification in the browser preview

**Files:** none (verification only)

- [ ] **Step 1: Start the app and open the Template's שדות tab**

Use the `project-hub` launch config (serves `C:\Users\Omega\Database` on port 3403) and navigate to `/project_hub_01.html`. Open the sidebar's "תבנית" (Template) entry, then click the new "שדות" tab. Expected: it appears as a third tab after "כללי"/"סכימת עבודה", showing an empty "יצירת שדה חדש" grid of 7 type cards and "עדיין אין שדות בפרויקט" under "שדות הפרויקט" (since `data.fields` starts empty).

- [ ] **Step 2: Create one field of each type**

For each of the 7 cards (בחירה יחידה, בחירה מרובה, תאריך, אנשים, מספר, טקסט, טיימליין בר), click it, confirm `AddFieldModal` opens with that type pre-selected (check the type button's icon/label matches), fill in a name (e.g. "שדה בדיקה — <type>"), for the two select types add at least one option, and save. Expected: after all 7, the "שדות הפרויקט" list shows all 7, each with a usage badge reading `מוצג ב-6/6 שלבים` (or however many sheets currently exist — check via `git`/`data/project_hub_01.json` if the count looks off).

- [ ] **Step 3: Verify a project field is visible everywhere by default**

Open any stage/list view whose settings gear you can click, go to Settings → שדות. Expected: the "שדות מותאמים אישית" section lists the 7 fields created in Step 2 (read-only rows, no delete "✕" button), each with its `sp-toggle` switch **on** (since nothing has hidden them yet), and a hint line at the bottom reading "ליצירה ועריכה של שדות — לשונית..." instead of a "+ הוסף שדה" button.

- [ ] **Step 4: Verify the visibility toggle affects usage count**

In that same per-sheet settings panel, toggle one field's switch off (hide it on this sheet only). Close settings, go back to Template → שדות. Expected: that field's usage badge decremented by exactly 1 (e.g. `מוצג ב-5/6 שלבים`).

- [ ] **Step 5: Verify editing from the שדות tab**

In Template → שדות, click one of the fields in "שדות הפרויקט" (e.g. a single-select one). Expected: `EditFieldModal` opens with its current title/type/options; rename it and add one more option; save. Confirm the renamed title shows in the list, and (if that field is visible on some sheet) that the column header/options reflect the change there too.

- [ ] **Step 6: Verify deleting from the שדות tab**

Delete one field from `EditFieldModal` (its delete option). Expected: it disappears from the "שדות הפרויקט" list, and no longer renders as a column anywhere it was previously visible.

- [ ] **Step 7: Verify built-in fields are unaffected**

In any sheet's Settings → שדות, confirm the "שדות מובנים" (built-in) section still works exactly as before this change: clicking a built-in field (e.g. "עדכונים") still opens `EditFieldModal` for it, and its own visibility toggle still works.

- [ ] **Step 8: Check the browser console for errors**

Use the preview tooling's console-log check after the above interactions; expect no new errors.

No commit for this task — it's verification of the commits from Tasks 1–4. If any check fails, fix the relevant task's code and re-verify before moving on.
