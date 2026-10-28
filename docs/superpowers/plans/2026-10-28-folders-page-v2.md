# Project folders page v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the pattern/levels publish editor with folder picking:
- main folders for every area;
- PUBLISH with SENT and UPDATED, each with a folder per file type and a simple date choice;
- CONSULTANTS as it is today;
- a Windows folder picker inside the project.

**Spec:** `docs/superpowers/specs/2026-10-28-folders-page-v2-design.md` — read it first; it is the behavior reference.

**Architecture:**
- The layout engine (filing-layout.js / filing-plan.js) gains a v2 shape, `{ base, byType, typeDirs, date }`. The PR #50 `levels` shape keeps working.
- A new helper task, `pick-sub`, returns a folder path relative to the project.
- The settings page is rebuilt around folder lists.

**Conventions:**
- **Editing the page.** `project_hub_01.html` is ~2 MB and is edited as `React.createElement` calls. Grep, never read whole.
- **Bilingual.** Hebrew in the HTML; English in `i18n-dict.js` (last `Object.assign` chunk). Text built in code goes through `tx()`. Data carries `data-i18n-skip`. Keys must not be fragments or bare common words.
- **No backslash escapes in tool input.** Use `[0-9]`, character checks, `String.fromCharCode(92)`.
- **`.ps1` files** are UTF-8 with BOM and CRLF. Keep both.
- **Commits.** Each one ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests:**
  - `cd tools/local-server && node --test "test/*.test.js"` (4 known date-dependent mail/mcp failures);
  - `node --test "tests/*.test.js"`;
  - `node tools/i18n-extract.test.js`;
  - `powershell -NoProfile -ExecutionPolicy Bypass -File tools\file-helper\test\FileHelper.Core.Tests.ps1`.

---

### Task A: layout v2 in the engine (server only)

**Files:** `tools/local-server/filing-layout.js`, `filing-plan.js`, `filing-ai.js`, `filing.js` (map-auto only), `test/filing-layout.test.js`, `test/filing-plan.test.js`, `test/filing.test.js`.

- [ ] **`cleanPublish` accepts the v2 shape per target** (TDD):
  - `byType` (boolean);
  - `typeDirs`: object of type name → `relPath`, dropping bad paths and names that are not valid folder names (`okName`, ≤20 characters);
  - `date` on `sent`: `'year-day'` | `'day'` | `'none'`, defaulting to `'year-day'`;
  - `base` as before.

  A target that carries `levels` and no `byType` stays in the old shape, cleaned as today. Tests cover v2 kept, bad typeDirs entries dropped, a bad date falling back to the default, and the old shape unchanged.
- [ ] **`publishPlan` builds v2 paths** (spec "בניית הנתיב"), with old-shape targets on the existing code path:
  - **The type folder:**
    - `typeDirs[type]` if it is in the tree;
    - else a name derived from another chosen type folder whose leaf contains that type's name as a whole word (reuse filing-layout's `withTypeToken` logic: export a small helper);
    - else `base/<type>`.
    - Without `byType`, the folder is `base`.
  - **Date levels (SENT):**
    - with `'none'`, none;
    - otherwise run `detectLayout` under each existing type folder (or under `base` without byType), take the first `year`/`day` patterns found, and turn type names into `{type}`;
    - if nothing is found, use the convention: year `{code}-pub-sent-{yyyy}`, day `{code}-pub-{yyyy},{mm},{dd}`;
    - with `'day'`, only the day level.
  - **The description** is appended to the day folder's name as today. `days` (existing descriptions) is computed from the same folders.
  - **UPDATED:** the type folder only, with `replace: true`.

  Tests, on the Library tree from the existing tests:
  - byType with typeDirs for PDF and DWG gives the PDF path, the DWG path, and a derived DOCS path (`…/LDLI-pub-sent-DOCS`, new);
  - unified (`byType: false`);
  - each of the date modes;
  - the convention date on an empty archive;
  - UPDATED by type with replace;
  - an old `levels` layout gives the same result as before.
- [ ] **`layoutFor` without a saved layout returns v2:**
  - `base` from slots or autoSlots as today;
  - `byType` true when kids of `base` contain type names, with `typeDirs` filled from those kids;
  - `date` from what `detectLayout` finds (year and day → `'year-day'`; day only → `'day'`; none → `'year-day'`).

  A saved v2 or old layout is used per target, as today. `map-auto` returns this v2 shape in `auto.publish`. Update the tests that expected the levels shape from map-auto and layoutFor.
- [ ] **`inboxContent`'s `Layout:` line describes v2 when saved:** `SENT <base> (by type: PDF → <dir>, DWG → <dir>; date: year then day)`. Update the INBOX_SYSTEM sentence about the Layout line to match: Claude builds the date folders by the names already in the tree (or the convention) and never adds a description. Test it.
- [ ] Run all server tests, then commit: "feat(filing): publish layout v2 — a folder per type and a date choice".

### Task B: `pick-sub` — the Windows folder picker inside the project

**Files:** `tools/file-helper/FileHelper.Core.ps1`, `Run-Task.ps1`, `test/FileHelper.Core.Tests.ps1`, `tools/local-server/filing.js`, `test/filing.test.js`, `tools/file-helper/README.md`.

- [ ] **Core:** `Get-SubPickResult([string]$ProjectDir, [string]$Picked)` returns:
  - `@{ cancelled = $true }` when nothing was picked;
  - `@{ outside = $true }` when the pick isn't inside `$ProjectDir` (compare full paths with `Test-SameFolder` / prefix, case-insensitive, after `ConvertTo-SharePath`);
  - `@{ rel = '' }` for the project folder itself;
  - otherwise `@{ rel = 'a/b' }`, with forward slashes.

  `Test-TaskKind` gets `'pick-sub'`. Write the PS tests (temp dirs: inside, outside, the project folder itself, cancel) without typing backslashes (use `Join-Path`).
- [ ] **Run-Task:**
  - `'pick-sub'`: `$dir = Resolve-TaskDir`, and `{ missing = $true }` when it is null;
  - start in `$dir` joined with `$task.start` when that exists (with `ConvertTo-RelPath` validation), else `$dir`;
  - `Show-FolderPicker $start $start (T 'בחר תיקייה בתוך תיקיית הפרויקט')`, adding the EN entry `'Choose a folder inside the project folder'` to `$script:EN`;
  - `Get-SubPickResult $dir $picked`.

  It does not create folders (`-NewFolder` off).
- [ ] **Server:**
  - HUB_METHOD `'pick-sub': 'POST'`, writers only. Body `{ projectId, start, lang }`; `start` is validated with `ai.relPath`, defaulting to `''`.
  - `makeTask('pick-sub', { …x, extra: { start } })`. The token GET includes `start`. Opening extends exp by PICK, as for `pick`.
  - Result branch: `cancelled`; `missing`; `outside`; otherwise `rel` through `ai.relPath`, which must not be null; null gives 400.

  Integration test: route, task kind, token GET with `start`, results rel / outside / cancelled, a bad rel giving 400, a viewer getting 403.
- [ ] **README:** one paragraph on "סייר" in the project settings.
- [ ] Run the tests, then commit: "feat(filing): pick a folder inside the project on the PC (pick-sub)".

### Task C: the new folders page

**Files:** `project_hub_01.html` (SettingsFoldersView, PublishLayoutBox and helpers, CSS).

Build it per the spec's "הדף החדש" and the approved mockup.
- [ ] **Main folders:**
  - one row per FOLDER_AREAS area: the name, a short description (existing `desc`), the path (the first of `areas[k].paths`, `—` when empty), and a select of the whole tree that sets `paths[0]` (keeping any other stored paths);
  - "סייר" (pick-sub with `start` = the current path or `''`), 📂 open, ✕ clear;
  - no note input on screen; notes stay in state and are saved unchanged;
  - "מלא אוטומטית" and "מפה עם Claude" stay at the top, as today.
- [ ] **PUBLISH section** (shown when areas.publish has a path):
  - **SENT and UPDATED cards:**
    - the base, with a select filtered to folders under the PUBLISH path, plus "סייר" with start = the PUBLISH path;
    - a "תיקייה נפרדת לכל סוג קובץ" checkbox;
    - when checked, one row per type in the type list in use: a select filtered to folders under that target's base, "סייר" with start = base, and a marker "תיווצר: <derived name>" when empty;
    - SENT has the date radio (שנה ואז יום / יום בלבד / בלי) and an example line ("דוגמה, PDF מהיום: …"), built client-side with the same rules as the server where possible: chosen typeDir or derived name, then the year/day names from the tree (port the small detection or show "השמות נלקחים מהתיקיות הקיימות" when unsure);
    - UPDATED has the "@ver" note.
  - **Type list:** one line with "ערוך", reusing the existing editor (office / project).
  - **Old layouts:** a stored PR #50 layout (`levels`) loads as v2, as the spec says. Save writes v2 only.
- [ ] **CONSULTANTS section:** an explanation line, and a read-only list of the tree folders directly under the consultants path (name, and the highest `-vNN` under its plans folder if easy, else the name only).
- [ ] **"סייר" flow:** POST `pick-sub`, poll `task?id=` every 1.5 s, apply `result.rel` to the field.
  - `outside` → "התיקייה שנבחרה לא בתוך תיקיית הפרויקט".
  - `missing` → FM_NOT_HERE.
  - `cancelled` → nothing.
  - Not handed within 15 s → FM_HELPER_OFF.
  - A cancel within 2 s of handing, with no `opened` → "עדכן את עוזר התיוק — הורד והתקן שוב", since an old helper doesn't know the kind (check what taskState exposes: `opened`, `cancelled`).
- [ ] **Remove** the old levels UI (`fm-level`, pattern inputs, FM_KINDS usage) if unused; keep helpers still used.
- [ ] **Save sends:**
  - `areas`, with notes kept;
  - `slots` (unchanged logic);
  - `publish`, in v2. The null-only-when-nothing-loaded rule stays.

  Server 400s show messages as today.
- [ ] Run `node --check` on the extracted script and `node --test "tests/*.test.js"`, then commit: "feat(project-hub): project folders page v2 — main folders, PUBLISH by folders, CONSULTANTS".

### Task D: English, deploy list, browser check

- [ ] **i18n:** English for every new Hebrew string from Tasks B–C (the helper's `$script:EN` too); run the extractor and its test.
- [ ] **Deploy-Azure.ps1:** confirm nothing new is needed (no new server module) with the MISSING check.
- [ ] **Browser check** against a stand-in helper (Library tree), in Hebrew and English:
  - the main folders and their lists;
  - "סייר" (the stand-in answers pick-sub with a rel);
  - SENT/UPDATED type rows and filtered lists;
  - the date modes and the example line;
  - save, then reload;
  - the filing window publishes to the expected paths (`…/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-<today>`, a DOCS folder derived, UPDATED per type).

  Restore the main repo's launch.json afterwards.
- [ ] Commit any fixes separately.
