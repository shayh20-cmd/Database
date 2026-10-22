# The project's folder map in Project Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD; commit per task.

**Goal:** A "📁 תיקיות הפרויקט" view in the project settings of Project Hub: the project's root \ folder, a table of seven areas (publish, consultants, receive, permit, export, design, docs) each with folder(s), a short "how it is built" note and 📂, filled in by Claude from the real folder tree with targeted questions the user answers in free text. Saved per project; filing uses it.

**Spec:** `docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md`, section "מפת התיקיות ב-Project Hub". Builds on the deployed filing (PR #33, #34): `tools/local-server/filing.js` (tasks pick/tree/open/file for the PC agent, filing.json per project `{folder, root, guide, log}`), `filing-ai.js`, the agent in `tools/file-helper/` (unchanged here).

**Conventions:** CLAUDE.md. Bilingual: Project Hub page texts stay Hebrew in `project_hub_01.html`, English in `i18n-dict.js` (last Object.assign chunk); run `node tools/i18n-extract.js`. Folder names and notes are data (`data-i18n-skip`). The page is compiled React (`React.createElement`), ~1.3 MB: grep and edit by unique strings, never read it whole. Never push or deploy. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; add only your files.

## Areas

`publish` PUBLISH · `consultants` יועצים · `receive` נכנסים · `permit` רשויות (GARM) · `export` ייצוא (Revit/CAD) · `design` תכנון · `docs` מסמכי פרויקט. Stored: `map: { areas: { <key>: { paths: [rel…], note } }, updatedBy, updatedAt }` in filing.json under the Hub project. `paths` are relPath-checked, each must be inside the project; `note` ≤ 300 chars.

## Task 1: Server — map storage, mapping with Claude, routes for the Hub page

Files: `filing.js`, `filing-ai.js`, `server.js` (route under the sign-in gate), `test/filing.test.js`.

- `filing-ai.js`: `mapProposal(client, model, x)` with `x = { project, guide, tree, map (current), turns, lang }` → JSON `{ areas: { key: { paths: [..], note } } (all seven keys; paths [] when not found), questions: [string] (0–4, only what is unclear), message }`; sanitized: paths through relPath and must exist in the tree; unknown keys dropped. Same data-tag hygiene as `propose` (`<guide>`, tree lines; the person's turns are the only instructions).
- `filing.js`: map stored on the project; `filing-project` (pane) returns `map` too; the filing `propose` passes the map to Claude (`propose` x gets `map`; `filing-ai` adds a "Folder map" block before the guide — update userContent + a unit test).
- Hub routes (signed-in session, `server.js` → `filing.handleHub(req, res, url, user)`; the person = `user`, the agent owner key `who` = the user's email in cloud, `'local'` locally — check how outlook.js maps a key's `who` to a person and mirror it so tasks reach the same agent):
  - `GET /api/filing-hub/project?project=` → `{ folder, root, map, guide, canWrite }`
  - `POST /api/filing-hub/pick` `{projectId, lang}` → `{ taskId }`; `POST /api/filing-hub/open` `{projectId, rel?, lang}` → `{ taskId }`; `GET /api/filing-hub/task?id=` → as the pane's filing-task
  - `POST /api/filing-hub/map-session` `{projectId, lang}` → `{ id }` (a mapping session: tree task like propose's, turns); `POST /api/filing-hub/map-propose?id=` `{text?}` → `{ areas, questions, message }` or `{ needsFolder | agent:'none'|'slow'|'failed' | missing | ai:'unavailable'|'failed' }` (reuse the tree wait)
  - `PUT /api/filing-hub/map` `{projectId, areas}` → `{ map }` (writer; validated as above, paths must be inside the project — relPath; no tree check needed for a manual save)
  - `PUT /api/filing-hub/guide` `{projectId, guide}` → `{ guide }` (writer)
- Tests: routes need sign-in (401 without); viewer refused on pick/map/guide; map-propose with a simulated agent tree and fake Claude returns sanitized areas/questions; a correction includes earlier turns; saving the map and reading it back through both `filing-hub/project` and the pane's `filing-project`; filing propose prompt contains the map block.
- Commit: `feat(filing): the project's folder map — mapped with Claude, saved per project, used in filing`.

## Task 2: Project Hub — "📁 תיקיות הפרויקט" in the project settings

Files: `project_hub_01.html` (SettingsPanel: new menu item + view), `i18n-dict.js`.

- Menu item after "אוטומציות": icon 📁, "תיקיות הפרויקט". The view (in the panel; compact, RTL/LTR safe, logical CSS):
  - root \ folder row + 📂 + "שנה" / "בחר תיקייה" (pick task; poll `filing-hub/task` every 1.5 s; picks up to 12 min; "עוזר התיוק לא פועל במחשב הזה" after 15 s not handed + the install command; missing → "לא מוצאת את תיקיית הפרויקט במחשב הזה").
  - The areas table: area name (translated), folder path(s) shown with `\` (data), note (data, editable inline), 📂 per path (open task with rel), and a manual "בחר מהעץ" per row only when a mapping session has a tree (a simple select of the tree's paths is enough).
  - "מפה את התיקיות עם Claude" → map-session + map-propose; shows Claude's message and numbered questions; a free-text answer box + "שלח" → map-propose with text; the table updates from each answer (unsaved until "שמור מפה"); "שמור מפה" → PUT map (writers only; viewers see read-only).
  - The guide (collapsible textarea + שמור) like the pane.
- Which project: the settings panel's current project — find how SettingsPanel knows its project id (data/registry; grep how other settings views call per-project APIs) and use the Hub project id the filing store uses (same ids as `/api/outlook/projects` list: `ph01` or the registry id).
- Every new Hebrew text gets an English entry in `i18n-dict.js`; run `node tools/i18n-extract.js` — nothing new may be listed.
- Verify in the `project-hub` preview: the menu item, the view renders (without an agent: pick shows the not-running text after 15 s), English/LTR, console clean.
- Commit: `feat(hub): the project's folders in the project settings — root, areas, mapping with Claude`.

## Task 3: Outlook pane — link when there is no map

Files: `outlook/taskpane.html`.

- In the filing card, when `filing-project` returns no map (or empty areas): a line "אין עדיין מפת תיקיות לפרויקט — מפה אותה ב-Project Hub" with a link opening the hub (`/project_hub_01` — check how the pane links to the hub elsewhere; the project settings can't be deep-linked unless the page supports it — check, otherwise link to the hub and say "הגדרות הפרויקט ← תיקיות הפרויקט"). HE_EN entries.
- Commit: `feat(outlook): point to the project's folder map when there is none`.

## Task 4: Review, PR, deploy (with the user's go-ahead), check with the user.
