# Project Hub 01 (New Blank Project) — Design Spec

## Goal

Create a second, fully independent Project Hub instance — technical name `project_hub_01`, displayed inside the app as "אולם ספورט לוד" — that reuses `project_hub.html`'s exact structure (tracks, stages, sheet groupings/columns/views, all app logic) but starts with zero task/contact/team content, ready for a genuinely new project. `project_hub.html` (ספריית לוד) and its data are completely untouched.

## Non-goals (deferred)

- General multi-project switching inside a single file (the sidebar's "+ צור חדש" button, the 4 other placeholder sidebar entries) — explicitly deferred; this is a standalone-file duplication, not a multi-project architecture change.
- Any change to `project_hub.html`, `data/project_hub.json`, or ספריית לוד's live data.

## Naming

- File: `project_hub_01.html` (served at `/project_hub_01` via the existing static server, no `launch.json` changes needed)
- API endpoint: `/api/project-hub-01` → `data/project_hub_01.json`
- `STORAGE_KEY` (legacy-localStorage-migration key, unused in practice for a brand-new file, but must be distinct so it can never collide with `project_hub.html`'s key if both are ever opened in the same browser/origin): `'pm_asana_v9_ph01'`
- Displayed project name (`data.projectName`, page `<title>`, header, and the sidebar's "MY_PROJECTS" active entry): "אולם ספورט לוד"

## What's copied verbatim (template/logic)

Everything in `project_hub.html` except the specific edits below: all components, all styling, the undo/redo system, the local-server persistence pattern (this file was already migrated off `localStorage` — see [2026-07-02-local-file-persistence-design.md](2026-07-02-local-file-persistence-design.md)), the File System Access API fallback, the `TemplateView` editor.

## What changes: template shape, sourced from the current live `data/project_hub.json`

`makeDefaultData()` (currently ~1000+ lines of hardcoded ספריית לוד demo tasks) is replaced with a much smaller function returning a blank-content version of the *current live* structure — not the old hardcoded demo seed, which is stale relative to the real, in-use template shape. Concretely, built from `data/project_hub.json` as of 2026-07-02:

**Tracks (kept exactly, including stage-order links):**
```json
[
  {"id":"ongoing","label":"מסלול תכנון","trackValue":null,"stageOrder":["xbgf63v"]},
  {"id":"licensing","label":"מסלול רישוי","trackValue":"licensing","stageOrder":["ablpu3h","9tg8vlt","ncxn6wr"]},
  {"id":"tender","label":"מסלول מכרז","trackValue":"tender","stageOrder":[]},
  {"id":"execution","label":"מסלول ביצוע","trackValue":"execution","stageOrder":[]}
]
```

(`xbgf63v` = משימות שוטפות, `ablpu3h` = תיק מידע, `9tg8vlt` = תנאים מקדימים, `ncxn6wr` = בקרת תכן — matching the sheet `id`s below. `ivae54t`/דאשבורד isn't referenced by any track's `stageOrder` in the live data either — it's kept in `sheets` regardless, mirroring the current structure exactly rather than inventing new semantics.)

**Sheets (kept: id, name, type, groups, fields, hiddenCols, colOrder, views — cleared: tasks → `[]`):**
- דאשבורד (0 tasks, no groups)
- משימות שוטפות (groups: ניהול פרויקט, תיאום ותקשורת)
- תיק מידע (groups: מסמכי תיק מידע)
- תנאים מקדימים (groups: אישורי היתר, ניהול ותיאום)
- בקרת תכן (groups: כללי)

Sheet `id`s are preserved exactly as in the live data so they keep matching the `stageOrder` references above.

**Cleared to empty (project-specific content, not template):**
- `licensingMilestones: []`, `licensingGoals: []`
- `projectInfo`: `{description:'', client:'', location:'', phase:'', area:''}` (empty strings, same field shape)
- `team: []`, `goals: []`, `milestones: []`, `externalContacts: []`, `consultants: []`, `staff: []`, `meetings: []`

**Kept as-is (structural config, not content):**
- `builtinConfig` (e.g. `{__owner_status:{delayThreshold:30}}`)
- `combinedView` (the "מבט מאוחד" cross-sheet view config: columns, filters, group-by state)
- `precondsRepaired: true`

**Changed:**
- `projectName: 'אולם ספورט לוד'`

## Rebranding edits in `project_hub_01.html`

- `<title>` and the `<h1>`/header project-name text: "אולם ספورט לוד" (this is also just `data.projectName`, already covered above, driving the dynamic header — the static `<title>` tag needs its own edit)
- Sidebar `MY_PROJECTS` array: the entry with `id:'lod'` (currently the only `active:true` entry, badge "LDLI", name "ספריית לוד") is replaced with an "אולם ספورט לוד" entry (new id, new badge code, `active:true`); the other 4 existing placeholder entries are left as-is (still inactive decoration, unchanged from `project_hub.html`'s current sidebar). The `isActive` check hardcoded to `p.id==='lod'` in the `Sidebar` component is updated to match the new active project's id.

## Server change

`tools/local-server/server.js`'s `APPS` map gets one new entry:
```javascript
'project-hub-01': path.join(DATA_DIR, 'project_hub_01.json')
```
No other server changes — routing, atomic writes, static serving all already generic.

## Testing / verification

Manual, via the preview tools (no automated test harness in this repo, consistent with prior work):
1. Load `/project_hub_01`, confirm it renders with "אולם ספورט לוד" branding, the same 4 tracks/5 sheets structure, and zero tasks/contacts/team/goals/milestones anywhere.
2. Confirm `project_hub.html` (`/project_hub`) is completely unaffected — still shows ספריית לוד with all its real data.
3. Add a task in `project_hub_01`, reload, confirm it persists to `data/project_hub_01.json` and `data/project_hub.json` is untouched.

## Out of scope (this spec)

- Making "+ צור חדש" actually create new projects dynamically (would require real multi-project architecture — deferred per Non-goals).
- Activating any of the other 4 placeholder sidebar projects.
