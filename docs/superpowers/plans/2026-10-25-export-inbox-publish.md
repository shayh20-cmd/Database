# Export inbox and publishing to PUBLISH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD; commit per task.

**Goal:** Files exported from Revit/AutoCAD into one fixed folder on the PC (`Desktop\לתיוק`) are noticed by the PC helper, announced with a Windows notification, and published from a small Project Hub window into the project's PUBLISH (a SENT date folder and/or UPDATED with replacement), locally on the PC.

**Spec:** `docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md`, section "תיבת הייצוא ופרסום ל-PUBLISH". Builds on the deployed filing work (tasks for the PC agent with one-time tokens: pick/tree/open/file; folder map with areas publish/work/…; many roots; `filing.js`, `filing-ai.js`; `tools/file-helper/` Core, Run-Task.ps1, FileHelper-Agent.ps1, installer; the hub's `/api/filing-hub/*` session routes).

**Conventions:** CLAUDE.md. Bilingual (page: Hebrew in HTML + English in i18n-dict.js, no one-word keys that occur inside other text; agent texts: `$script:EN` in Core). `.ps1` UTF-8 with BOM, Windows PowerShell 5.1. Never push or deploy. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; add only your files. Never touch `%LOCALAPPDATA%\ProjectHub` (a live helper runs there) or run the agent/Run-Task/installer.

## Contracts (shared)

**Batch** (server, per person, in memory + a small `inbox` list in filing.json is not needed): `{ id, who, pc, files: [{ n, name, size, mtime }], at, status: 'new'|'published'|'dismissed', exp (24 h) }`.

Agent → server (Bearer pho_, through outlook.js like `filing-next`):
- `POST /api/outlook/inbox-batch` `{ pc, files: [{name, size, mtime}] }` → `{ id, url }` where `url` is the quick-window address `<base>/project_hub_01?quick=inbox&id=<id>`. A new batch replaces this person's previous `new` batch from the same PC (the inbox's current content is the truth; the agent always sends the full list of files currently in the inbox that are not yet acknowledged).

Hub page (signed-in session, `/api/filing-hub/*`):
- `GET inbox?id=` → `{ id, pc, files, guess: { projectId, code, name, why: 'code'|'none' }, projects: [{id, code, name}] (the person's projects for "החלף") }`. `guess` by matching a project code as a whole token at the start of / inside file names (split on `-_ .`), case-insensitive; the single project matched by most files wins; otherwise none.
- `POST inbox-propose` `{ id, projectId, files: [n…], sent: bool, updated: bool, text?, lang }` → `{ message, plan }` or the same status answers as map-propose (`needsFolder`, `agent: none|slow|failed`, `missing`, `ai: unavailable|failed`). The server asks the agent for the project tree (reuse the tree task), then Claude with the folder map (publish area), the guide, today's date (Israel), the selected files and the two checkboxes; Claude returns a plan in the existing plan schema extended with `files[].dests: [{ path, replace: bool }]` (one dest per target; `replace: true` for UPDATED: an existing file of the same name in that folder is moved to the `@ver` folder next to it (create `@ver` if missing) before the copy). Sanitize: every dest path relPath + inside the project + existing in the tree or created by a mkdir step; `replace` only on dests inside the publish area.
- `POST inbox-confirm` `{ id }` → `{ taskId }`: makes an `inbox` task for the same PC that announced the batch (fall back to any agent of the person) with the stored plan (never a plan from the page).
- `GET task?id=` (existing) → status; `inbox` result `{ files: [{name, dests: [savedAs…]}], error }` or `{ missing: true }`.
- `POST inbox-dismiss` `{ id }` → marks the batch dismissed (the files stay in the inbox).

Agent ← task `inbox` (token GET): `{ kind: 'inbox', root, folder, plan, files: [{n, name}], inbox: <the PC's inbox path is local — not sent> }`. The agent resolves the inbox path from its own config.

## Task 1: Server — batches, project guess, inbox-propose/confirm, the inbox task

Files: `filing.js`, `filing-ai.js`, `outlook.js` (route list), `test/filing.test.js`.
- Implement the contracts; reuse treeOf, task/token machinery, writer/visibility checks (propose/confirm need write access to the project), relPath/cleanAreas.
- `filing-ai.js`: `inboxProposal(client, model, x)` — prompt with the publish area of the map (paths + note), the guide, the tree, today's date, the selected files (names), sent/updated flags, the person's optional text, lang; output `{ message (≤600, in lang), files: [{ name, dests: [{path, replace}] }], steps (mkdir only), mode: 'publish' }`. Tell Claude the Folder Manager convention as the default when the map/guide don't say otherwise: SENT = `<publish>\<CODE>-pub-@sent\<CODE>-pub-sent-<YYYY>\<CODE>-pub-<YYYY>,<MM>,<DD>\<TYPE>` with TYPE by extension (PDF, DWG, RVT, else DOCS); UPDATED = `<publish>\<CODE>-pub-updated\<CODE>-pub-updated-<TYPE>`; follow the project's real folders when they differ; projects are not uniform.
- Result handling: history log entries (mode 'publish'); batch status 'published'.
- Tests: guess by code (single, ambiguous, none); propose with a simulated agent tree + fake Claude → sanitized dests (outside/unknown paths dropped, replace outside publish dropped); confirm uses the stored plan; the agent gets the inbox task; result → history + batch published; viewer refused; a new batch from the same PC replaces the previous; dismiss.
- Commit: `feat(filing): the export inbox — batches, project guess, publishing proposals and tasks`.

## Task 2: PC helper — watch the inbox, notify, run the inbox task

Files: `FileHelper.Core.ps1`, `FileHelper-Agent.ps1`, `Run-Task.ps1`, `Install-FileHelper.ps1`, `Uninstall-FileHelper.ps1`, `README.md`, `test/FileHelper.Core.Tests.ps1`.
- Config `inbox` (default `[Environment]::GetFolderPath('Desktop')\לתיוק`, created at install). Installer asks nothing new; prints the inbox path (HE/EN). Registers `projecthub-inbox:` (HKCU) that opens the URL after the scheme in a Chrome/Edge `--app` window, like `projecthub-mail:` in tools/mail-scan/Install-MailScan.ps1 (copy that pattern: find Chrome, else Edge); the toast's button launches `projecthub-inbox:<url-encoded url>` — validate the URL starts with the configured hub before launching (a vbs/ps wrapper, like run-hidden.vbs's argument checks). Uninstall removes the key.
- Agent loop: the long-poll stays; between polls (and at least every 5 s — run the inbox check on a timer / in the loop with short long-poll timeouts if needed; keep it simple: check the inbox before each poll and use a shorter poll timeout, e.g. pass `wait=10` if the server supports it — otherwise accept checks every ≤25 s and say so) Core `Get-InboxState($dir, $prev)`: files (not folders, not hidden/temp: skip `~$*`, `*.tmp`, `*.part`, zero-byte) with size+mtime; "settled" = the set and sizes unchanged for ≥10 s and no file locked (try open read with FileShare.None? — use `[IO.File]::Open(..., 'Open', 'Read', 'None')` in try/catch). When settled and different from the last announced set → POST inbox-batch → toast (reuse Scan-Mail.ps1's Show-Toast approach) "N קבצים חדשים בתיבת הייצוא" / English, with "פתח" → `projecthub-inbox:` + URL. Don't re-announce the same set.
- Run-Task `inbox`: resolve the project dir (Resolve-ProjectDir), Core `Invoke-InboxTask($projectDir, $inboxDir, $task)`: pre-check every dest (Resolve-InProject) and every source (inside the inbox, exists); then mkdir steps; for each file, for each dest: if `replace` and a same-name file exists → move it into `<dest>\..\<leaf>-@ver`? — no: into `@ver` next to the dest folder: `<parent of dest>\<dest leaf>-@ver` if such a folder exists, else `<dest>\@ver` (create) — pick one rule, document it, test it; then copy the file in (free name when not replacing). After all dests of a file succeed, delete the source from the inbox (it now lives in the project — this is the one deletion allowed: the user's own inbox copy after a verified copy). Result `{ files: [{name, dests: [savedAs…]}], error }`.
- Tests: inbox state (temp/hidden/zero-byte skipped, settle timing with injected clock), the replace rule, pre-check failure → nothing done, a partial failure keeps the source in the inbox, success removes the source.
- Commit: `feat(file-helper): watch the export inbox, notify, publish on request`.

## Task 3: Project Hub — the quick inbox window

Files: `project_hub_01.html`, `i18n-dict.js`.
- `?quick=inbox&id=` opens a compact window (find how `?quick=mail` works and mirror it): title "תיבת הייצוא — N קבצים"; the project chip (guess, "זוהה מקוד הקבצים") + "החלף" (select of the person's projects); the file list with checkboxes (code highlighted when it matches the project code; data, LTR); two checkboxes "PUBLISH-SENT עם תאריך היום" and "PUBLISH-UPDATED (כולל החלפה של קבצים באותו שם)" with the small hint "קובץ ישן באותו שם עובר ל-@ver ולא נמחק"; on any change → inbox-propose (debounced) → Claude's sentence + a short plan list (paths with `\`); optional instruction input + שלח; "אשר ופרסם" → inbox-confirm → poll task → "פורסמו N קבצים" + 📂 (open task); "ביטול" → inbox-dismiss and close. Status texts as in the filing card (not running, missing, Claude unavailable). Hebrew + English, RTL/LTR.
- Verify in the project-hub preview with a batch created through the agent route (use a local key / a test call) — mock what needs the agent.
- Commit: `feat(hub): the export inbox window — files, project, SENT/UPDATED, publish`.

## Task 4: Review, PR, deploy (with the user's go-ahead), reinstall the helper on the user's PC (keeps the key; registers projecthub-inbox:), check with the user.

## Review fixes (contracts as changed)

- An inbox task that ends without a result frees its batch. Once the PC takes it, it lives `FILING_INBOX_TTL_MS`
  (60 min) from then, and a result that arrives after it expired is still taken (history, batch).
- Result `{ files: [{ n, name, dests: [savedAs|null, aligned with the plan], paths, all }], notInInbox: [names], error }`.
  Files that left the inbox (`all`, or `notInInbox`) leave the batch; the batch is `published` only when none is left.
  The PC skips a source that is no longer in the inbox and reports it instead of failing the task.
- `GET /api/outlook/inbox-batch?pc=` → `{ id|null }` (the PC's open batch): the agent asks when it starts and every
  5 minutes while the inbox holds files, and announces again when there is none (a notification only the first time
  after a start). `GET /api/filing-hub/inbox-latest?pc=` → `{ id|null }`: the window whose batch is gone switches to it.
  The window's address carries `&pc=`.
- `inbox-propose` adds `replaceStripped: 'no_map'|'outside'` when a replace was dropped; the window says so under
  Claude's words. Names the server would change are left out of a batch; a 400 to the agent counts as announced.
- The lock test runs only when something is to be announced, and opens with `FileShare.Read`.

## חזרה לחלון ולשונית תיוק (follow-up, 2026-10-25)

- Toast: `launch` and "Open" carry the window's https address itself (`Get-HubPageUrl` checks it is the hub's); Windows
  opens it in the default browser. `projecthub-inbox:`, `Open-Inbox.ps1`, `open-inbox.vbs` and `Find-AppBrowser` are
  gone; the installer deletes the old files and the HKCU key, the uninstaller still deletes the key.
- `GET /api/filing-hub/inbox-open` → `[{ id, pc, files: n, at }]`: the person's open export-inbox batches, newest first
  (not chosen folders). The sidebar's "תיבת הייצוא (N)" (InboxNavBadge) asks on load, every 5 min and on focus (≤ 1/min).
- The quick window's third tab "תיוק קבצים" (`?quick=file`): QuickInbox `inTab` → the newest open batch (a select when
  more), or "אין כרגע קבצים שמחכים בתיבת הייצוא". `?quick=inbox` without `id` → the PC's newest (inbox-latest).
  Replaces the planned Start-menu shortcut: the quick window is in the Start menu already (tools/quick-access).
- `POST /api/filing-hub/pick-source` `{ lang }` → `{ taskId }` (writers only), a `pick-source` task for any agent of the
  person: folder picker; result `{ source: <id the PC keeps the path under>, folder: <name>, files }` →
  the server makes a batch `{ source, folder }` (task result `{ id, files, folder }`). `GET inbox` adds
  `source: bool, folder, move`; the `inbox` task adds `source` and `move: !source`. The PC copies from a chosen
  folder and never deletes there (Get-InboxTaskSource ignores `move` for a source); an unknown source is an error.
  Batches of a chosen folder replace only the same PC's earlier chosen-folder batch, never the inbox's.
