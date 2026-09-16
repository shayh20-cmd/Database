# Piece 0 — Data Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `project_hub`'s data survivable — exportable, restorable, and loud instead of silent when the browser's storage quota runs out — without touching the compiled React tree.

**Architecture:** All browser code lives in one new sibling file, `data-safety.js`, loaded by a single added `<script src>` line in `project_hub.html`. This follows the pattern `i18n.js` already established in this repository: its header states it exists so "the precompiled React apps need no source changes." The logic is written as plain functions over an injected storage object, exported for Node so it can be tested without a browser. A second new file, `tools/unpack-export.js`, turns an export into real files on disk and the index that piece B's ETL consumes.

**Tech Stack:** Vanilla ES5-compatible JavaScript, no build step, no dependencies. Node 24's built-in `node:test` for tests. Classic `<script>` tags only — the file must stay double-clickable, so no ES modules.

## Global Constraints

- **`project_hub.html` is compiled output and cannot be reviewed by diff.** Commit `e40db13` added one badge and produced a 250,053-character diff. This plan changes exactly **one line** of it. Any task that wants a second line is wrong and should stop.
- **The file must stay double-clickable.** `file://` must work: classic scripts only, no ES modules, no `import`, no build step, no fetch of local resources.
- **`crypto.subtle` is not available on `file://` in every browser.** No hashing in browser code. SHA-256 is computed in Node, by `tools/unpack-export.js`.
- **Bytes never go in the database.** `db/migrations/002_files.sql` opens with the rule: "The database holds metadata and pointers. Bytes stay in SharePoint, BIM 360/ACC, or on the drives they are already on." Attachments follow it.
- **No dependencies.** Node's built-ins only. This repository has no `package.json` and this plan does not add one.
- Hebrew strings in the UI, matching the application. Hebrew text carries invisible bidirectional marks — never retype a Hebrew literal by hand, copy it.
- Commit message trailer on every commit: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|---|---|
| `data-safety.js` *(create)* | Everything that runs in the browser: the export builder, the import validator and applier, the quota guard, and the small UI that exposes them. Dual-context footer so Node can `require` it. |
| `data-safety.test.js` *(create)* | `node:test` suite over the pure functions, driven by a fake storage object. No browser, no DOM. |
| `project_hub.html` *(modify — one line)* | Load `data-safety.js` before React, so the quota guard is installed before the application's first write. |
| `tools/unpack-export.js` *(create)* | Node. Reads an export JSON, writes each attachment as a real file named by its SHA-256, and emits `index.json` shaped to `file` / `file_instance`. |
| `docs/superpowers/specs/2026-09-15-hub-on-kkarcdb-schema-design.md` *(modify)* | Correct the attachment decision: `file` rows, not a Supabase bucket. |

**Why a sibling file and not an appended block.** An earlier draft of this work (Task 1 of the schema plan) appended an inline `<script>` before `</body>`. That works for the export alone, but it runs *after* the application, so it cannot install a quota guard, and inline code cannot be tested from Node. One `<script src>` line placed before React solves both and keeps the diff smaller.

## Export format

Two versions ship in this plan. `validateExport` and `applyImport` accept both, forever — a backup taken on the afternoon of task 1 must still restore after task 5.

```jsonc
// formatVersion 1 — task 1
{
  "formatVersion": 1,
  "exportedAt": "2026-09-16T09:30:00.000Z",
  "schema": "pm_asana_v9",
  "data": { /* the blob, attachments still inline as data: URLs */ },
  "ui": { "expandedTasks": [], "sheetUi": {}, "ganttLabelW": null, "appLang": null }
}

// formatVersion 2 — task 5
{
  "formatVersion": 2,
  "exportedAt": "2026-09-16T17:00:00.000Z",
  "schema": "pm_asana_v9",
  "data": { /* the blob, every data: URL replaced by the string "ref:att-1" */ },
  "ui": { /* unchanged */ },
  "attachments": [
    { "ref": "att-1", "mime": "image/png", "name": "plan.png", "size": 20480, "b64": "iVBOR…" }
  ]
}
```

`ref` is a sequential, export-local identifier. It is **not** an identity — SHA-256 is, and it is computed in Node by `tools/unpack-export.js`.

---

## Task 1: The export

**Files:**
- Create: `data-safety.js`
- Create: `data-safety.test.js`
- Modify: `project_hub.html` — one line, before the React script tag

**Interfaces:**
- Consumes: nothing
- Produces:
  - `DataSafety.collectUi(storage)` → `{expandedTasks: array, sheetUi: object, ganttLabelW: string|null, appLang: string|null}`
  - `DataSafety.buildExport(storage, nowIso)` → the `formatVersion: 1` object above
  - `window.DataSafety` in the browser; `module.exports` in Node
  - A button reading `⬇ ייצוא נתונים` fixed to the bottom-start corner

- [ ] **Step 1: Write the failing test**

Create `data-safety.test.js`:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const DS = require('./data-safety.js');

/* A stand-in for window.localStorage: same surface, no browser. */
function fakeStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _dump() { return Object.fromEntries(map); }
  };
}

test('collectUi gathers the per-user keys', () => {
  const s = fakeStorage({
    'pm_asana_v9': '{"sheets":[]}',
    'pm_asana_v9_expanded_tasks': '["t1","t2"]',
    'pm_asana_v9_gantt_sheet1': '{"h":40}',
    'pm_gantt_label_w': '180',
    'appLang': 'he',
    'unrelated_key': 'x'
  });
  const ui = DS.collectUi(s);
  assert.deepStrictEqual(ui.expandedTasks, ['t1', 't2']);
  assert.deepStrictEqual(ui.sheetUi, { 'pm_asana_v9_gantt_sheet1': { h: 40 } });
  assert.strictEqual(ui.ganttLabelW, '180');
  assert.strictEqual(ui.appLang, 'he');
});

test('collectUi survives unparseable values', () => {
  const s = fakeStorage({ 'pm_asana_v9_gantt_x': 'not json', 'pm_asana_v9_expanded_tasks': '{{' });
  const ui = DS.collectUi(s);
  assert.deepStrictEqual(ui.expandedTasks, []);
  assert.deepStrictEqual(ui.sheetUi, { 'pm_asana_v9_gantt_x': null });
});

test('buildExport wraps the blob with its metadata', () => {
  const s = fakeStorage({ 'pm_asana_v9': '{"projectName":"X","sheets":[]}' });
  const e = DS.buildExport(s, '2026-09-16T09:30:00.000Z');
  assert.strictEqual(e.formatVersion, 1);
  assert.strictEqual(e.exportedAt, '2026-09-16T09:30:00.000Z');
  assert.strictEqual(e.schema, 'pm_asana_v9');
  assert.strictEqual(e.data.projectName, 'X');
});

test('buildExport reports absent data as null rather than inventing it', () => {
  const e = DS.buildExport(fakeStorage({}), '2026-09-16T09:30:00.000Z');
  assert.strictEqual(e.data, null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run in `D:\Projects\@Delta Office\New folder\Database`:

```bash
node --test data-safety.test.js
```

Expected: FAIL — `Cannot find module './data-safety.js'`

- [ ] **Step 3: Write the minimal implementation**

Create `data-safety.js`:

```javascript
/* ─────────────────────────────────────────────────────────────
   data-safety.js — export, restore, and quota protection for
   project_hub.html.

   Loaded as a classic script BEFORE React, so the quota guard is
   in place before the application's first write. Touches no part
   of the compiled React tree: project_hub.html is Babel output
   whose diffs cannot be reviewed, so this file reaches the data
   through localStorage only.

   Also requireable from Node, which is how it is tested.
   ───────────────────────────────────────────────────────────── */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.DataSafety = api;
    if (typeof document !== 'undefined') api._boot(root.localStorage, document);
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'pm_asana_v9';
  var EXPANDED_KEY = 'pm_asana_v9_expanded_tasks';
  var UI_PREFIX = 'pm_asana_v9_';

  function readJson(storage, key, fallback) {
    try {
      var raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /* The per-user keys the schema splits out into hub_user_pref. Collected by
     prefix rather than by a fixed list, because the sheet-scoped keys are
     minted at runtime from a sheet id. */
  function collectUi(storage) {
    var sheetUi = {};
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i);
      if (k && k.indexOf(UI_PREFIX) === 0 && k !== EXPANDED_KEY) {
        sheetUi[k] = readJson(storage, k, null);
      }
    }
    var expanded = readJson(storage, EXPANDED_KEY, []);
    return {
      expandedTasks: Array.isArray(expanded) ? expanded : [],
      sheetUi: sheetUi,
      ganttLabelW: storage.getItem('pm_gantt_label_w'),
      appLang: storage.getItem('appLang')
    };
  }

  function buildExport(storage, nowIso) {
    return {
      formatVersion: 1,
      exportedAt: nowIso,
      schema: KEY,
      data: readJson(storage, KEY, null),
      ui: collectUi(storage)
    };
  }

  function _boot() { /* filled in at step 5 */ }

  return {
    KEY: KEY,
    collectUi: collectUi,
    buildExport: buildExport,
    _boot: _boot
  };
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test data-safety.test.js
```

Expected: PASS — `# pass 4`, `# fail 0`

- [ ] **Step 5: Add the browser half**

Replace the `function _boot() { /* filled in at step 5 */ }` line in `data-safety.js` with:

```javascript
  function download(storage, doc, filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  function exportNow(storage, doc) {
    var payload = buildExport(storage, new Date().toISOString());
    if (!payload.data) { alert('אין נתונים לייצוא'); return; }
    var name = 'project_hub_export_' + new Date().toISOString().slice(0, 10) + '.json';
    download(storage, doc, name, JSON.stringify(payload, null, 2));
  }

  var BTN_STYLE = [
    'position:fixed', 'z-index:99999', 'padding:8px 14px', 'border-radius:8px',
    'font:600 13px system-ui,sans-serif', 'cursor:pointer',
    'box-shadow:0 2px 8px rgba(0,0,0,.25)'
  ];

  function makeButton(doc, id, label, title, extraStyle) {
    var b = doc.createElement('button');
    b.id = id;
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.setAttribute('style', BTN_STYLE.concat(extraStyle).join(';'));
    return b;
  }

  function mount(storage, doc) {
    if (doc.getElementById('ds-export-btn')) return;
    var b = makeButton(doc, 'ds-export-btn', '⬇ ייצוא נתונים',
      'הורדת כל נתוני הפרויקט כקובץ JSON',
      ['bottom:16px', 'inset-inline-start:16px', 'border:1px solid #2563EB',
       'background:#2563EB', 'color:#fff']);
    b.addEventListener('click', function () { exportNow(storage, doc); });
    doc.body.appendChild(b);
  }

  function _boot(storage, doc) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { mount(storage, doc); });
    } else {
      mount(storage, doc);
    }
  }
```

And extend the returned object to expose what later tasks and the console need:

```javascript
  return {
    KEY: KEY,
    collectUi: collectUi,
    buildExport: buildExport,
    exportNow: exportNow,
    makeButton: makeButton,
    _boot: _boot
  };
```

- [ ] **Step 6: Re-run the tests — the browser half must not have broken the Node half**

```bash
node --test data-safety.test.js
```

Expected: PASS — `# pass 4`, `# fail 0`

- [ ] **Step 7: Confirm the insertion anchor is unique**

```bash
grep -c '<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>' project_hub.html
```

Expected: `1`

- [ ] **Step 8: Add the one line to `project_hub.html`**

Insert `<script src="data-safety.js"></script>` on its own line **immediately before** the React script tag (currently line 9). Before React, so the quota guard added in task 3 is installed before the application's first write.

```bash
node -e "const fs=require('fs');const p='project_hub.html';const a='<script src=\"https://unpkg.com/react@18/umd/react.production.min.js\"></script>';let s=fs.readFileSync(p,'utf8');if(s.split(a).length!==2)throw new Error('anchor not unique');fs.writeFileSync(p,s.replace(a,'<script src=\"data-safety.js\"></script>\n'+a));console.log('inserted');"
```

Expected: `inserted`

- [ ] **Step 9: Verify the diff is exactly one line**

```bash
git diff --stat project_hub.html
```

Expected: `1 file changed, 1 insertion(+)`. **If it says anything else, stop and revert** — the compiled tree has been disturbed.

- [ ] **Step 10: Verify it works in the browser**

Open `project_hub.html`. In the console:

```javascript
var e = DataSafety.buildExport(localStorage, new Date().toISOString());
console.log(e.formatVersion, e.schema, !!e.data, Object.keys(e.data).length);
```

Expected: `1 pm_asana_v9 true` and a key count of 10 or more.

Then click `⬇ ייצוא נתונים`. A file downloads. Open it in a text editor: the first line is `{` and it contains `"schema": "pm_asana_v9"`.

- [ ] **Step 11: Verify the application is undisturbed**

Reload. Confirm the task list renders, a task expands, the language toggle still appears, and the console shows no new errors.

- [ ] **Step 12: Commit**

```bash
git add data-safety.js data-safety.test.js project_hub.html
git commit -m "feat(project_hub): export every local record to a file

The application has no export, so a cleared cache destroys the project.
This adds one, in a sibling script loaded before React rather than inside
the page: project_hub.html is Babel output whose diffs cannot be reviewed,
so the change to it is a single line and everything else is testable from
Node.

It captures the per-user UI keys alongside the blob, by prefix rather than
by a fixed list, because the sheet-scoped ones are minted at runtime.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 13: Take a backup now, before going further**

Open the file, click the button, and put the result somewhere that is not this browser. **Every remaining task in this plan can be redone; the data cannot.** Do not continue until a file exists outside the browser profile.

---

## Task 2: Restore

An export nobody can restore is a file, not a backup.

**Files:**
- Modify: `data-safety.js`
- Modify: `data-safety.test.js`

**Interfaces:**
- Consumes: `DataSafety.buildExport` from task 1
- Produces:
  - `DataSafety.validateExport(parsed)` → `{ok: boolean, errors: string[], version: number|null}`
  - `DataSafety.applyImport(storage, parsed)` → `{keysWritten: number}`; throws if `validateExport` would reject
  - `DataSafety.describeImport(parsed)` → a Hebrew one-line summary used in the confirmation
  - A button reading `⬆ שחזור מקובץ`

A restore **replaces** the blob. It does not merge. Merging two divergent copies of nested task trees with event chains is a research project, not a safety net, and a half-merged project is worse than either input.

- [ ] **Step 1: Write the failing tests**

Append to `data-safety.test.js`:

```javascript
test('validateExport accepts a well-formed v1 file', () => {
  const e = DS.buildExport(fakeStorage({ 'pm_asana_v9': '{"sheets":[]}' }), 'now');
  const v = DS.validateExport(e);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.version, 1);
  assert.deepStrictEqual(v.errors, []);
});

test('validateExport rejects a file from somewhere else', () => {
  const v = DS.validateExport({ formatVersion: 1, schema: 'something_else', data: {} });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('schema')));
});

test('validateExport rejects a file with no data', () => {
  const v = DS.validateExport({ formatVersion: 1, schema: 'pm_asana_v9', data: null });
  assert.strictEqual(v.ok, false);
});

test('validateExport rejects a format from the future', () => {
  const v = DS.validateExport({ formatVersion: 99, schema: 'pm_asana_v9', data: {} });
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(e => e.includes('99')));
});

test('applyImport round-trips an export', () => {
  const source = fakeStorage({
    'pm_asana_v9': '{"projectName":"X"}',
    'pm_asana_v9_expanded_tasks': '["t1"]',
    'pm_asana_v9_gantt_s1': '{"h":40}',
    'pm_gantt_label_w': '180',
    'appLang': 'en'
  });
  const e = DS.buildExport(source, 'now');
  const target = fakeStorage({});
  DS.applyImport(target, e);
  assert.deepStrictEqual(target._dump(), source._dump());
});

test('applyImport clears blob keys the export does not carry', () => {
  const target = fakeStorage({ 'pm_asana_v9': '{"old":1}', 'pm_asana_v9_gantt_stale': '{}' });
  const e = DS.buildExport(fakeStorage({ 'pm_asana_v9': '{"new":1}' }), 'now');
  DS.applyImport(target, e);
  assert.strictEqual(target.getItem('pm_asana_v9_gantt_stale'), null);
  assert.deepStrictEqual(JSON.parse(target.getItem('pm_asana_v9')), { new: 1 });
});

test('applyImport refuses an invalid file rather than half-writing it', () => {
  const target = fakeStorage({ 'pm_asana_v9': '{"keep":1}' });
  assert.throws(() => DS.applyImport(target, { formatVersion: 1, schema: 'wrong', data: {} }));
  assert.deepStrictEqual(JSON.parse(target.getItem('pm_asana_v9')), { keep: 1 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test data-safety.test.js
```

Expected: FAIL — `DS.validateExport is not a function`

- [ ] **Step 3: Implement validation and application**

Add to `data-safety.js`, before `_boot`:

```javascript
  var SUPPORTED_VERSIONS = [1];

  function validateExport(parsed) {
    var errors = [];
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, errors: ['הקובץ אינו JSON תקין'], version: null };
    }
    var version = typeof parsed.formatVersion === 'number' ? parsed.formatVersion : 1;
    if (SUPPORTED_VERSIONS.indexOf(version) === -1) {
      errors.push('גרסת קובץ שאינה נתמכת: ' + version);
    }
    if (parsed.schema !== KEY) {
      errors.push('schema שגוי: ' + String(parsed.schema) + ' (מצופה ' + KEY + ')');
    }
    if (!parsed.data || typeof parsed.data !== 'object') {
      errors.push('הקובץ אינו מכיל נתונים');
    }
    return { ok: errors.length === 0, errors: errors, version: errors.length ? null : version };
  }

  function describeImport(parsed) {
    var d = (parsed && parsed.data) || {};
    var sheets = Array.isArray(d.sheets) ? d.sheets : [];
    var tasks = sheets.reduce(function (n, s) {
      return n + ((s && Array.isArray(s.tasks)) ? s.tasks.length : 0);
    }, 0);
    return 'פרויקט: ' + (d.projectName || '—') +
           ' · גיליונות: ' + sheets.length +
           ' · משימות: ' + tasks +
           ' · יוצא בתאריך: ' + (parsed.exportedAt || '—');
  }

  /* Replaces the blob outright. Stale sheet-scoped UI keys are removed first,
     because they are keyed by sheet id and a restored project's ids will not
     match the ones already sitting in this browser. */
  function applyImport(storage, parsed) {
    var v = validateExport(parsed);
    if (!v.ok) throw new Error(v.errors.join('; '));

    var stale = [];
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i);
      if (k && (k === KEY || k.indexOf(UI_PREFIX) === 0)) stale.push(k);
    }
    stale.forEach(function (k) { storage.removeItem(k); });

    var written = 0;
    storage.setItem(KEY, JSON.stringify(parsed.data)); written++;

    var ui = parsed.ui || {};
    if (Array.isArray(ui.expandedTasks)) {
      storage.setItem(EXPANDED_KEY, JSON.stringify(ui.expandedTasks)); written++;
    }
    Object.keys(ui.sheetUi || {}).forEach(function (k) {
      if (ui.sheetUi[k] === null) return;
      storage.setItem(k, JSON.stringify(ui.sheetUi[k])); written++;
    });
    if (ui.ganttLabelW != null) { storage.setItem('pm_gantt_label_w', ui.ganttLabelW); written++; }
    if (ui.appLang != null) { storage.setItem('appLang', ui.appLang); written++; }

    return { keysWritten: written };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test data-safety.test.js
```

Expected: PASS — `# pass 11`, `# fail 0`

- [ ] **Step 5: Add the restore button**

Inside `mount`, after the export button is appended:

```javascript
    var r = makeButton(doc, 'ds-import-btn', '⬆ שחזור מקובץ',
      'טעינת קובץ ייצוא — הנתונים הקיימים יוחלפו',
      ['bottom:16px', 'inset-inline-start:150px', 'border:1px solid #64748B',
       'background:#fff', 'color:#334155']);
    r.addEventListener('click', function () { importPrompt(storage, doc); });
    doc.body.appendChild(r);
```

And add `importPrompt` beside `exportNow`:

```javascript
  function importPrompt(storage, doc) {
    var inp = doc.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try {
          parsed = JSON.parse(String(reader.result));
        } catch (e) {
          alert('הקובץ אינו JSON תקין');
          return;
        }
        var v = validateExport(parsed);
        if (!v.ok) { alert('הקובץ נדחה:\n' + v.errors.join('\n')); return; }
        if (!confirm('שחזור יחליף את כל הנתונים בדפדפן זה.\n\n' +
                     describeImport(parsed) + '\n\nלהמשיך?')) return;
        try {
          applyImport(storage, parsed);
        } catch (e) {
          alert('השחזור נכשל: ' + e.message);
          return;
        }
        alert('השחזור הושלם. הדף ייטען מחדש.');
        location.reload();
      };
      reader.readAsText(f);
    });
    inp.click();
  }
```

Extend the returned object:

```javascript
  return {
    KEY: KEY,
    collectUi: collectUi,
    buildExport: buildExport,
    exportNow: exportNow,
    validateExport: validateExport,
    describeImport: describeImport,
    applyImport: applyImport,
    importPrompt: importPrompt,
    makeButton: makeButton,
    _boot: _boot
  };
```

- [ ] **Step 6: Re-run the tests**

```bash
node --test data-safety.test.js
```

Expected: PASS — `# pass 11`, `# fail 0`

- [ ] **Step 7: Verify the round trip in a browser**

With the backup from task 1 step 13 to hand:

1. Open `project_hub.html`, note the project name and the number of tasks in the first sheet
2. Click `⬇ ייצוא נתונים`
3. Rename a task to `RESTORE TEST`
4. Click `⬆ שחזור מקובץ`, choose the file from step 2
5. Read the confirmation — it must name the project and a plausible task count — and accept
6. The page reloads and `RESTORE TEST` is gone

- [ ] **Step 8: Verify a bad file is refused**

Click `⬆ שחזור מקובץ` and choose any other JSON file — `i18n-dict.js` renamed to `.json` will do. Expected: an alert naming the wrong `schema`, and the project unchanged after a reload.

- [ ] **Step 9: Commit**

```bash
git add data-safety.js data-safety.test.js
git commit -m "feat(project_hub): restore a project from an export file

An export nobody can restore is a file, not a backup.

Restore replaces rather than merges: merging two divergent copies of nested
task trees with their event chains is a research project, and a half-merged
project is worse than either input. The confirmation names the project,
sheet and task counts so it is possible to tell which copy is about to win.

Stale sheet-scoped UI keys are cleared first, because they are keyed by
sheet id and a restored project's ids will not match this browser's.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The quota guard

Today `save()` calls `localStorage.setItem` with no `try`/`catch` ([project_hub.html:1213](../../../project_hub.html)). When the quota is reached the write throws, React state has already been updated, and the user sees their change on screen while nothing is persisted. The loss is discovered on the next reload.

**Files:**
- Modify: `data-safety.js`
- Modify: `data-safety.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `DataSafety.isQuotaError(err)` → boolean
  - `DataSafety.estimateBytes(storage)` → number — UTF-16 bytes across all keys
  - `DataSafety.installGuard(storage, onQuota)` → `{uninstall: function}`; wraps `setItem` so a quota failure calls `onQuota(key, err)` and then rethrows
  - A fixed banner that appears on quota failure and does not dismiss itself

`onQuota` runs *before* the rethrow, so the warning reaches the screen even though the application's own call stack is about to unwind.

- [ ] **Step 1: Write the failing tests**

Append to `data-safety.test.js`:

```javascript
function quotaError(name, code) {
  const e = new Error('quota');
  e.name = name;
  if (code !== undefined) e.code = code;
  return e;
}

test('isQuotaError recognises every browser spelling', () => {
  assert.strictEqual(DS.isQuotaError(quotaError('QuotaExceededError')), true);
  assert.strictEqual(DS.isQuotaError(quotaError('NS_ERROR_DOM_QUOTA_REACHED')), true);
  assert.strictEqual(DS.isQuotaError(quotaError('SomethingElse', 22)), true);
  assert.strictEqual(DS.isQuotaError(quotaError('SomethingElse', 1014)), true);
});

test('isQuotaError does not swallow unrelated failures', () => {
  assert.strictEqual(DS.isQuotaError(new TypeError('nope')), false);
  assert.strictEqual(DS.isQuotaError(null), false);
});

test('estimateBytes counts keys and values as UTF-16', () => {
  const s = fakeStorage({ ab: 'cd' });
  assert.strictEqual(DS.estimateBytes(s), 8);
});

test('installGuard reports a quota failure and still rethrows', () => {
  const s = fakeStorage({});
  s.setItem = () => { throw quotaError('QuotaExceededError'); };
  const seen = [];
  DS.installGuard(s, (key) => seen.push(key));
  assert.throws(() => s.setItem('pm_asana_v9', 'x'), /quota/);
  assert.deepStrictEqual(seen, ['pm_asana_v9']);
});

test('installGuard leaves successful writes alone', () => {
  const s = fakeStorage({});
  const seen = [];
  DS.installGuard(s, (key) => seen.push(key));
  s.setItem('k', 'v');
  assert.strictEqual(s.getItem('k'), 'v');
  assert.deepStrictEqual(seen, []);
});

test('installGuard does not intercept errors that are not about quota', () => {
  const s = fakeStorage({});
  s.setItem = () => { throw new TypeError('broken'); };
  const seen = [];
  DS.installGuard(s, (key) => seen.push(key));
  assert.throws(() => s.setItem('k', 'v'), TypeError);
  assert.deepStrictEqual(seen, []);
});

test('uninstall restores the original setItem', () => {
  const s = fakeStorage({});
  const original = s.setItem;
  const handle = DS.installGuard(s, () => {});
  assert.notStrictEqual(s.setItem, original);
  handle.uninstall();
  assert.strictEqual(s.setItem, original);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test data-safety.test.js
```

Expected: FAIL — `DS.isQuotaError is not a function`

- [ ] **Step 3: Implement the guard**

Add to `data-safety.js`, before `_boot`:

```javascript
  /* Browsers disagree on how a full store announces itself: Chrome and Safari
     raise QuotaExceededError with legacy code 22, Firefox raises
     NS_ERROR_DOM_QUOTA_REACHED with code 1014. All four are the same event. */
  function isQuotaError(err) {
    if (!err) return false;
    return err.name === 'QuotaExceededError' ||
           err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
           err.code === 22 || err.code === 1014;
  }

  /* An estimate, not a measurement: browsers count UTF-16 code units and none
     of them expose the limit. Two bytes per character of both key and value is
     the figure that matches observed behaviour. */
  function estimateBytes(storage) {
    var total = 0;
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i);
      if (k == null) continue;
      var v = storage.getItem(k);
      total += (k.length + (v ? v.length : 0)) * 2;
    }
    return total;
  }

  /* Wraps setItem so a quota failure is announced before the application's
     stack unwinds. The error is rethrown untouched: swallowing it would leave
     the caller believing the write succeeded, which is the present bug in a
     quieter form. */
  function installGuard(storage, onQuota) {
    /* The unbound original is kept for restoration and a bound copy for
       calling, so uninstall() puts back the exact function that was there
       rather than a wrapper around it. */
    var original = storage.setItem;
    var call = original.bind(storage);
    storage.setItem = function (key, value) {
      try {
        return call(key, value);
      } catch (err) {
        if (isQuotaError(err)) {
          try { onQuota(key, err); } catch (ignored) { /* never mask the real error */ }
        }
        throw err;
      }
    };
    return {
      uninstall: function () { storage.setItem = original; }
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test data-safety.test.js
```

Expected: PASS — `# pass 18`, `# fail 0`

- [ ] **Step 5: Add the banner and install the guard at boot**

Add beside `exportNow`:

```javascript
  function showQuotaBanner(storage, doc) {
    if (doc.getElementById('ds-quota-banner')) return;
    var mb = (estimateBytes(storage) / 1048576).toFixed(1);
    var bar = doc.createElement('div');
    bar.id = 'ds-quota-banner';
    bar.setAttribute('style', [
      'position:fixed', 'top:0', 'inset-inline:0', 'z-index:100000',
      'padding:12px 16px', 'background:#B91C1C', 'color:#fff',
      'font:600 14px system-ui,sans-serif', 'display:flex', 'gap:12px',
      'align-items:center', 'justify-content:center', 'flex-wrap:wrap',
      'box-shadow:0 2px 12px rgba(0,0,0,.35)'
    ].join(';'));
    bar.appendChild(doc.createTextNode(
      'אחסון הדפדפן מלא (' + mb + 'MB). השינוי האחרון לא נשמר — יש לייצא את הנתונים עכשיו.'
    ));
    var b = makeButton(doc, 'ds-quota-export', '⬇ ייצוא עכשיו', 'הורדת הנתונים',
      ['position:static', 'border:1px solid #fff', 'background:#fff', 'color:#B91C1C']);
    b.addEventListener('click', function () { exportNow(storage, doc); });
    bar.appendChild(b);
    doc.body.appendChild(bar);
  }
```

The banner has no dismiss control. A warning that can be clicked away is one that will be, and the next write will fail just as silently.

Replace `_boot` with:

```javascript
  function _boot(storage, doc) {
    /* Installed immediately, not on DOMContentLoaded: this file loads before
       React, and the application's first write must already be covered. */
    installGuard(storage, function () {
      if (doc.body) showQuotaBanner(storage, doc);
    });
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { mount(storage, doc); });
    } else {
      mount(storage, doc);
    }
  }
```

Extend the returned object with `isQuotaError`, `estimateBytes`, `installGuard` and `showQuotaBanner`.

- [ ] **Step 6: Add a usage reading to the export button's tooltip**

So the limit is visible before it is hit. Inside `mount`, after the export button is created:

```javascript
    b.title = 'הורדת כל נתוני הפרויקט כקובץ JSON — ' +
              (estimateBytes(storage) / 1048576).toFixed(1) + 'MB בשימוש';
```

- [ ] **Step 7: Re-run the tests**

```bash
node --test data-safety.test.js
```

Expected: PASS — `# pass 18`, `# fail 0`

- [ ] **Step 8: Verify the banner appears, using a disposable copy**

**Do this in a browser profile whose data you have already exported.** Open `project_hub.html` and in the console fill the store until it fails:

```javascript
try { var s=''; for (var i=0;i<400;i++) s+='x'.repeat(65536); localStorage.setItem('ds_fill', s); }
catch (e) { console.log('threw:', e.name); }
```

Expected: the red banner appears across the top naming a size in MB, and the console logs `threw: QuotaExceededError`. Click `⬇ ייצוא עכשיו` and confirm a file downloads **while the store is full** — this is the case that matters, and it works because the export builds its payload in memory and never writes to storage.

Then clean up:

```javascript
localStorage.removeItem('ds_fill'); location.reload();
```

Expected: the banner is gone and the project renders.

- [ ] **Step 9: Verify the tooltip**

Hover `⬇ ייצוא נתונים`. Expected: a tooltip ending `MB בשימוש` with a plausible figure.

- [ ] **Step 10: Commit**

```bash
git add data-safety.js data-safety.test.js
git commit -m "feat(project_hub): make a full storage quota loud instead of silent

save() writes to localStorage with no catch, so when the store fills the
write throws after React state has already changed: the edit is on screen,
nothing is persisted, and the loss is found on the next reload.

Wrapping setItem announces the failure before the application's stack
unwinds, then rethrows untouched — swallowing it would restore the same bug
in a quieter form. The banner has no dismiss control on purpose, and its
export button works while the store is full because the payload is built in
memory.

All four browser spellings of the quota error are recognised; Firefox uses
NS_ERROR_DOM_QUOTA_REACHED and code 1014 where Chrome uses 22.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Correct the attachment decision in the schema spec

The schema spec says attachment bytes go to a Supabase Storage bucket. That contradicts KkarcDB's founding rule about files and must be corrected before anything is built on it.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-hub-on-kkarcdb-schema-design.md`

**Interfaces:**
- Consumes: nothing
- Produces: the decision that task 5 and task 6 implement, and that piece B's migration `010` will follow

- [ ] **Step 1: Find the two places that say it**

```bash
grep -n "hub-attachments\|storage_key\|Supabase Storage" docs/superpowers/specs/2026-09-15-hub-on-kkarcdb-schema-design.md
```

Expected: the `hub_attachment` row of the project-level table, and the "Data flow" diagram's note about a service key.

- [ ] **Step 2: Replace the `hub_attachment` row**

The row currently reads:

> `hub_attachment` | `task_id`, `filename`, `mime_type`, `size_bytes`, `storage_key`, `uploaded_by_person_id`, `uploaded_at` | Bytes go to a Supabase Storage bucket `hub-attachments`; the row keeps the object key. This is the one Supabase feature beyond Postgres and Auth that the design adopts.

Replace it with:

> `hub_attachment` | `task_id`, `file_id` → `file`, `uploaded_by_person_id`, `uploaded_at`, `caption` | **Bytes never go in the database.** An attachment is a `file` row — identified by `content_hash`, located by `file_instance` — exactly as every other file in the register is. `filename`, `mime_type` and `size_bytes` are not duplicated here; they belong to `file` and `file_instance`.

- [ ] **Step 3: Replace the Supabase Storage leg of the data-flow diagram**

Replace:

```
                                          │
                                          └─▶ Supabase Storage (attachments), via service key held by the API
```

with:

```
                                          │
                                          └─▶ the firm's own file storage (attachments), recorded as file + file_instance rows
```

- [ ] **Step 4: Record the correction in the Decisions table**

Add a row to the "Decisions taken" table at the top of the spec:

> | Attachments | **`file` rows pointing at the firm's own storage**, never bytes in the database | `db/migrations/002_files.sql` opens with the rule this design had broken: "The database holds metadata and pointers. Bytes stay in SharePoint, BIM 360/ACC, or on the drives they are already on." An attachment is a file like any other; giving it a second, parallel storage model would mean two answers to "where is this file?" and only one of them indexed. |

- [ ] **Step 5: Note the open question the correction leaves**

Add to the spec's "Open questions" section:

> - **Which storage location attachments land in.** They are `file` rows, so the *model* is settled; the `storage_location` row they point at is not. SharePoint is the likely answer and needs the Graph app registration `CLAUDE.md` names as the long-lead item. Until it exists, an attachment can be a `file` row with a `local_drive` instance, which is honest — `storage_is_reachable()` already reports such a file as index-only rather than openable.

- [ ] **Step 6: Verify nothing still points at the bucket**

```bash
grep -rn "hub-attachments\|Supabase Storage" docs/superpowers/specs/ docs/superpowers/plans/
```

Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-09-15-hub-on-kkarcdb-schema-design.md
git commit -m "docs(specs): attachments are file rows, not bytes in a bucket

The schema design put attachment bytes in a Supabase Storage bucket. That
contradicts the rule 002_files.sql opens with -- the database holds metadata
and pointers, bytes stay where they already are -- and would have given the
register two answers to 'where is this file?', only one of them indexed.

An attachment becomes a file row identified by content_hash and located by
file_instance, like every other file. Which storage_location it points at is
left open: that needs the Graph app registration, and until it exists a
local_drive instance is the honest record, which storage_is_reachable()
already reports as index-only rather than openable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Lift attachments out of the exported blob

**Files:**
- Modify: `data-safety.js`
- Modify: `data-safety.test.js`

**Interfaces:**
- Consumes: `buildExport`, `validateExport`, `applyImport` from tasks 1–2
- Produces:
  - `DataSafety.parseDataUrl(str)` → `{mime: string, b64: string}` or `null`
  - `DataSafety.extractAttachments(data)` → `{data: object, attachments: array}` — a **deep copy** with every `data:` URL replaced by `"ref:att-N"`
  - `DataSafety.inlineAttachments(data, attachments)` → the inverse
  - `buildExport` now emits `formatVersion: 2` with a top-level `attachments` array
  - `applyImport` re-inlines attachments for a v2 file, so a v2 export restores into an application that knows nothing about refs

The walk is **generic** — every string value anywhere in the blob is examined. Attachments reach the blob by two routes today (`task.attachments[].data` from a file picker, and `<img src="data:…">` inlined into `task.description` by `execCommand('insertImage')`), and hard-coding those paths would miss the third route someone adds next month. Subtasks nest three deep and meeting items carry their own text, so a path-based walk is the fragile choice here.

- [ ] **Step 1: Write the failing tests**

Append to `data-safety.test.js`:

```javascript
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUg==';
const PNG_URL = 'data:image/png;base64,' + PNG_B64;

test('parseDataUrl splits a base64 data URL', () => {
  assert.deepStrictEqual(DS.parseDataUrl(PNG_URL), { mime: 'image/png', b64: PNG_B64 });
});

test('parseDataUrl ignores everything else', () => {
  assert.strictEqual(DS.parseDataUrl('https://example.com/a.png'), null);
  assert.strictEqual(DS.parseDataUrl('data:text/plain,hello'), null); // not base64
  assert.strictEqual(DS.parseDataUrl(42), null);
  assert.strictEqual(DS.parseDataUrl(null), null);
});

test('extractAttachments lifts a file-picker attachment and leaves a ref', () => {
  const blob = { sheets: [{ tasks: [{ id: 't1', attachments: [
    { id: 'a1', name: 'plan.png', size: 17, type: 'image/png', data: PNG_URL }
  ] }] }] };
  const out = DS.extractAttachments(blob);
  assert.strictEqual(out.data.sheets[0].tasks[0].attachments[0].data, 'ref:att-1');
  assert.strictEqual(out.attachments.length, 1);
  assert.deepStrictEqual(out.attachments[0],
    { ref: 'att-1', mime: 'image/png', name: 'plan.png', size: 17, b64: PNG_B64 });
});

test('extractAttachments lifts an image inlined in description HTML', () => {
  const blob = { sheets: [{ tasks: [
    { id: 't1', description: '<p>לפני</p><img src="' + PNG_URL + '"><p>אחרי</p>' }
  ] }] };
  const out = DS.extractAttachments(blob);
  assert.ok(out.data.sheets[0].tasks[0].description.includes('src="ref:att-1"'));
  assert.ok(!out.data.sheets[0].tasks[0].description.includes('base64'));
  assert.ok(out.data.sheets[0].tasks[0].description.includes('לפני'));
  assert.strictEqual(out.attachments[0].mime, 'image/png');
  assert.strictEqual(out.attachments[0].name, null);
});

test('extractAttachments reaches attachments nested three subtasks deep', () => {
  const blob = { sheets: [{ tasks: [{ subtasks: [{ subtasks: [{ subtasks: [
    { id: 's3', description: '<img src="' + PNG_URL + '">' }
  ] }] }] }] }] };
  const out = DS.extractAttachments(blob);
  assert.strictEqual(out.attachments.length, 1);
});

test('extractAttachments gives one ref per distinct payload, not per occurrence', () => {
  const blob = { a: { data: PNG_URL }, b: { data: PNG_URL } };
  const out = DS.extractAttachments(blob);
  assert.strictEqual(out.attachments.length, 1);
  assert.strictEqual(out.data.a.data, 'ref:att-1');
  assert.strictEqual(out.data.b.data, 'ref:att-1');
});

test('extractAttachments does not mutate its input', () => {
  const blob = { sheets: [{ tasks: [{ attachments: [{ data: PNG_URL }] }] }] };
  const before = JSON.stringify(blob);
  DS.extractAttachments(blob);
  assert.strictEqual(JSON.stringify(blob), before);
});

test('inlineAttachments is the exact inverse of extractAttachments', () => {
  const blob = {
    sheets: [{ tasks: [
      { id: 't1', description: '<img src="' + PNG_URL + '">',
        attachments: [{ id: 'a1', name: 'p.png', size: 17, type: 'image/png', data: PNG_URL }] }
    ] }]
  };
  const out = DS.extractAttachments(blob);
  assert.deepStrictEqual(DS.inlineAttachments(out.data, out.attachments), blob);
});

test('inlineAttachments leaves a ref alone when its payload is missing', () => {
  const restored = DS.inlineAttachments({ x: { data: 'ref:att-9' } }, []);
  assert.strictEqual(restored.x.data, 'ref:att-9');
});

test('buildExport now emits version 2 with the attachments lifted out', () => {
  const s = fakeStorage({ 'pm_asana_v9': JSON.stringify(
    { sheets: [{ tasks: [{ attachments: [{ data: PNG_URL }] }] }] }) });
  const e = DS.buildExport(s, 'now');
  assert.strictEqual(e.formatVersion, 2);
  assert.strictEqual(e.attachments.length, 1);
  assert.ok(JSON.stringify(e.data).indexOf('base64') === -1);
});

test('validateExport still accepts a version 1 file taken before this task', () => {
  const v = DS.validateExport({ formatVersion: 1, schema: 'pm_asana_v9', data: { sheets: [] } });
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.version, 1);
});

test('applyImport re-inlines attachments so the application sees data URLs', () => {
  const s = fakeStorage({ 'pm_asana_v9': JSON.stringify(
    { sheets: [{ tasks: [{ attachments: [{ data: PNG_URL }] }] }] }) });
  const e = DS.buildExport(s, 'now');
  const target = fakeStorage({});
  DS.applyImport(target, e);
  const back = JSON.parse(target.getItem('pm_asana_v9'));
  assert.strictEqual(back.sheets[0].tasks[0].attachments[0].data, PNG_URL);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test data-safety.test.js
```

Expected: FAIL — `DS.parseDataUrl is not a function`

- [ ] **Step 3: Implement extraction and its inverse**

Add to `data-safety.js`, before `buildExport`:

```javascript
  var DATA_URL_RE = /^data:([^;,]+);base64,([A-Za-z0-9+/=]*)$/;
  var EMBEDDED_RE = /data:([^;,"')\s]+);base64,([A-Za-z0-9+/=]+)/g;

  function parseDataUrl(str) {
    if (typeof str !== 'string') return null;
    var m = DATA_URL_RE.exec(str);
    return m ? { mime: m[1], b64: m[2] } : null;
  }

  /* Walks every string in the blob rather than the two paths attachments use
     today. They arrive by a file picker (task.attachments[].data) and by
     execCommand('insertImage') writing an <img src> into task.description; a
     path-based walk would miss the third route and would have to be revisited
     every time the tree changes. Subtasks nest three deep. */
  function extractAttachments(data) {
    var list = [];
    var byPayload = {};

    function refFor(mime, b64, sibling) {
      var dedupeKey = mime + '|' + b64;
      if (byPayload[dedupeKey]) return byPayload[dedupeKey];
      var ref = 'att-' + (list.length + 1);
      byPayload[dedupeKey] = ref;
      list.push({
        ref: ref,
        mime: mime,
        name: (sibling && typeof sibling.name === 'string') ? sibling.name : null,
        size: (sibling && typeof sibling.size === 'number') ? sibling.size : null,
        b64: b64
      });
      return ref;
    }

    function walk(node, parent) {
      if (typeof node === 'string') {
        var whole = parseDataUrl(node);
        if (whole) return 'ref:' + refFor(whole.mime, whole.b64, parent);
        if (node.indexOf('base64,') === -1) return node;
        /* An HTML fragment may carry several. lastIndex is reset because the
           regex is module-level and /g regexes carry state between calls. */
        EMBEDDED_RE.lastIndex = 0;
        return node.replace(EMBEDDED_RE, function (_all, mime, b64) {
          return 'ref:' + refFor(mime, b64, null);
        });
      }
      if (Array.isArray(node)) return node.map(function (v) { return walk(v, parent); });
      if (node && typeof node === 'object') {
        var out = {};
        Object.keys(node).forEach(function (k) { out[k] = walk(node[k], node); });
        return out;
      }
      return node;
    }

    return { data: data === null ? null : walk(data, null), attachments: list };
  }

  function inlineAttachments(data, attachments) {
    var byRef = {};
    (attachments || []).forEach(function (a) {
      byRef['ref:' + a.ref] = 'data:' + a.mime + ';base64,' + a.b64;
    });
    var refRe = /ref:att-\d+/g;

    function walk(node) {
      if (typeof node === 'string') {
        if (byRef[node]) return byRef[node];
        if (node.indexOf('ref:att-') === -1) return node;
        refRe.lastIndex = 0;
        return node.replace(refRe, function (r) { return byRef[r] || r; });
      }
      if (Array.isArray(node)) return node.map(walk);
      if (node && typeof node === 'object') {
        var out = {};
        Object.keys(node).forEach(function (k) { out[k] = walk(node[k]); });
        return out;
      }
      return node;
    }

    return data === null ? null : walk(data);
  }
```

- [ ] **Step 4: Move `buildExport` to version 2**

Replace `buildExport` with:

```javascript
  function buildExport(storage, nowIso) {
    var lifted = extractAttachments(readJson(storage, KEY, null));
    return {
      formatVersion: 2,
      exportedAt: nowIso,
      schema: KEY,
      data: lifted.data,
      ui: collectUi(storage),
      attachments: lifted.attachments
    };
  }
```

- [ ] **Step 5: Accept version 2 on the way back in**

In `validateExport`, change:

```javascript
  var SUPPORTED_VERSIONS = [1];
```

to:

```javascript
  var SUPPORTED_VERSIONS = [1, 2];
```

In `applyImport`, replace the line that writes the blob:

```javascript
    storage.setItem(KEY, JSON.stringify(parsed.data)); written++;
```

with:

```javascript
    /* A v1 file has its attachments inline already; a v2 file has them lifted
       out, and the application knows nothing about refs, so they go back. */
    var blob = (v.version >= 2)
      ? inlineAttachments(parsed.data, parsed.attachments)
      : parsed.data;
    storage.setItem(KEY, JSON.stringify(blob)); written++;
```

Extend the returned object with `parseDataUrl`, `extractAttachments` and `inlineAttachments`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
node --test data-safety.test.js
```

Expected: PASS — `# pass 30`, `# fail 0`

- [ ] **Step 7: Verify in a browser that an export shrinks and restores**

Open `project_hub.html`. Attach a file to any task, and paste an image into a task description. Then in the console:

```javascript
var e = DataSafety.buildExport(localStorage, new Date().toISOString());
console.log('version', e.formatVersion,
            'attachments', e.attachments.length,
            'blob has base64:', JSON.stringify(e.data).indexOf('base64') !== -1);
```

Expected: `version 2`, an attachment count of 2 or more, and `blob has base64: false`.

- [ ] **Step 8: Verify the round trip still restores the images**

Click `⬇ ייצוא נתונים`, delete the task you attached the file to, then `⬆ שחזור מקובץ` and choose the file. Expected: the task returns, its attachment downloads correctly, and the pasted image renders in the description.

- [ ] **Step 9: Verify a version 1 file still restores**

Restore the backup taken at task 1 step 13 — a `formatVersion: 1` file. Expected: it is accepted and the project loads. Then restore the current export again to get back.

- [ ] **Step 10: Commit**

```bash
git add data-safety.js data-safety.test.js
git commit -m "feat(project_hub): lift attachments out of the exported blob

Attachments reach the blob as base64 by two routes -- a file picker writing
task.attachments[].data, and execCommand('insertImage') inlining an <img src>
into task.description -- and both make the export unreadable and the ETL's
job harder.

The walk is generic over every string in the blob rather than over those two
paths, because subtasks nest three deep and the next route to appear would
otherwise be missed silently. Identical payloads share one ref, so an image
pasted into four tasks is carried once.

Export is now formatVersion 2. Version 1 files still restore: a backup taken
this afternoon has to keep working. Restoring a v2 file re-inlines the
payloads, because the application knows nothing about refs.

SHA-256 is deliberately not computed here: crypto.subtle is unavailable
outside a secure context and this file is opened by double-clicking.
tools/unpack-export.js computes it, which is where file.content_hash is
needed anyway.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `tools/unpack-export.js`

Turns an export into real files on disk and the index piece B's ETL reads. This is where SHA-256 is computed and where the `file` / `file_instance` shape is honoured.

**Files:**
- Create: `tools/unpack-export.js`
- Create: `tools/unpack-export.test.js`

**Interfaces:**
- Consumes: a `formatVersion: 2` export from task 5
- Produces:
  - `unpack(exportObj)` → `{files: [{contentHash, sizeBytes, mimeType, filename, bytes}], index: [...]}`
  - CLI: `node tools/unpack-export.js <export.json> <out-dir>` writes `<out-dir>/files/<sha256><ext>` and `<out-dir>/index.json`
  - `index.json` entries: `{contentHash, sizeBytes, mimeType, filename, ref}` — the columns of `file`, plus `filename` for `file_instance` and `ref` so the ETL can find which task pointed at it

- [ ] **Step 1: Write the failing tests**

Create `tools/unpack-export.test.js`:

```javascript
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { unpack, extensionFor } = require('./unpack-export.js');

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUg==';
const PNG_SHA = crypto.createHash('sha256').update(Buffer.from(PNG_B64, 'base64')).digest('hex');

test('extensionFor maps the mime types attachments actually arrive as', () => {
  assert.strictEqual(extensionFor('image/png'), '.png');
  assert.strictEqual(extensionFor('image/jpeg'), '.jpg');
  assert.strictEqual(extensionFor('application/pdf'), '.pdf');
  assert.strictEqual(extensionFor('application/octet-stream'), '.bin');
  assert.strictEqual(extensionFor('something/unknown'), '.bin');
});

test('unpack identifies a file by the SHA-256 of its bytes', () => {
  const out = unpack({
    formatVersion: 2, schema: 'pm_asana_v9', data: {},
    attachments: [{ ref: 'att-1', mime: 'image/png', name: 'plan.png', size: 17, b64: PNG_B64 }]
  });
  assert.strictEqual(out.files.length, 1);
  assert.strictEqual(out.files[0].contentHash, PNG_SHA);
  assert.strictEqual(out.files[0].mimeType, 'image/png');
  assert.strictEqual(out.files[0].filename, 'plan.png');
});

test('unpack takes size from the bytes, not from the exported claim', () => {
  const out = unpack({
    formatVersion: 2, schema: 'pm_asana_v9', data: {},
    attachments: [{ ref: 'att-1', mime: 'image/png', name: 'p.png', size: 999999, b64: PNG_B64 }]
  });
  assert.strictEqual(out.files[0].sizeBytes, Buffer.from(PNG_B64, 'base64').length);
});

test('unpack names a description image after its hash when it has no filename', () => {
  const out = unpack({
    formatVersion: 2, schema: 'pm_asana_v9', data: {},
    attachments: [{ ref: 'att-1', mime: 'image/png', name: null, size: null, b64: PNG_B64 }]
  });
  assert.strictEqual(out.files[0].filename, PNG_SHA + '.png');
});

test('unpack writes one file per distinct hash but indexes every ref', () => {
  const out = unpack({
    formatVersion: 2, schema: 'pm_asana_v9', data: {},
    attachments: [
      { ref: 'att-1', mime: 'image/png', name: 'a.png', size: 17, b64: PNG_B64 },
      { ref: 'att-2', mime: 'image/png', name: 'b.png', size: 17, b64: PNG_B64 }
    ]
  });
  assert.strictEqual(out.files.length, 1);
  assert.strictEqual(out.index.length, 2);
  assert.deepStrictEqual(out.index.map(e => e.contentHash), [PNG_SHA, PNG_SHA]);
});

test('unpack refuses a version 1 export rather than silently finding nothing', () => {
  assert.throws(
    () => unpack({ formatVersion: 1, schema: 'pm_asana_v9', data: {} }),
    /formatVersion 2/
  );
});

test('unpack handles an export with no attachments at all', () => {
  const out = unpack({ formatVersion: 2, schema: 'pm_asana_v9', data: {}, attachments: [] });
  assert.deepStrictEqual(out.files, []);
  assert.deepStrictEqual(out.index, []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test tools/unpack-export.test.js
```

Expected: FAIL — `Cannot find module './unpack-export.js'`

- [ ] **Step 3: Implement it**

Create `tools/unpack-export.js`:

```javascript
'use strict';
/* unpack-export.js — turns a project_hub export into real files plus the index
   the ETL reads.
 *
 * Bytes never go in the database: db/migrations/002_files.sql holds metadata
 * and pointers only. So an attachment becomes a file on disk, identified by
 * the SHA-256 of its contents exactly as every other file in the register is,
 * and index.json carries the columns of `file` and `file_instance`.
 *
 * Usage: node tools/unpack-export.js <export.json> <out-dir>
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* Deliberately short. An attachment whose type is not here is stored as .bin
   rather than guessed at: the mime type is kept on the row, so nothing is
   lost, and a wrong extension is worse than an honest one. */
const EXTENSIONS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'text/plain': '.txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
};

function extensionFor(mime) {
  return EXTENSIONS[mime] || '.bin';
}

function unpack(exportObj) {
  if (!exportObj || exportObj.formatVersion !== 2) {
    throw new Error('expected an export with formatVersion 2; got ' +
      (exportObj ? exportObj.formatVersion : 'nothing'));
  }

  const files = [];
  const index = [];
  const seen = new Map();

  (exportObj.attachments || []).forEach((a) => {
    const bytes = Buffer.from(a.b64, 'base64');
    const contentHash = crypto.createHash('sha256').update(bytes).digest('hex');
    const ext = extensionFor(a.mime);
    /* Size comes from the bytes. The exported `size` is what the browser
       reported at upload and is not evidence about what is actually here. */
    const entry = {
      contentHash,
      sizeBytes: bytes.length,
      mimeType: a.mime,
      filename: a.name || (contentHash + ext),
      ref: a.ref
    };
    index.push(entry);

    if (!seen.has(contentHash)) {
      seen.set(contentHash, true);
      files.push({ ...entry, bytes, storedAs: contentHash + ext });
    }
  });

  return { files, index };
}

function main(argv) {
  const [src, outDir] = argv;
  if (!src || !outDir) {
    console.error('Usage: node tools/unpack-export.js <export.json> <out-dir>');
    process.exitCode = 1;
    return;
  }

  const exportObj = JSON.parse(fs.readFileSync(src, 'utf8'));
  const { files, index } = unpack(exportObj);

  const filesDir = path.join(outDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });
  files.forEach((f) => fs.writeFileSync(path.join(filesDir, f.storedAs), f.bytes));

  fs.writeFileSync(
    path.join(outDir, 'index.json'),
    JSON.stringify({ source: path.basename(src), exportedAt: exportObj.exportedAt, entries: index }, null, 2)
  );

  const total = files.reduce((n, f) => n + f.sizeBytes, 0);
  console.log(`${index.length} attachment(s), ${files.length} distinct file(s), ` +
              `${(total / 1048576).toFixed(2)} MB → ${outDir}`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { unpack, extensionFor };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test tools/unpack-export.test.js
```

Expected: PASS — `# pass 7`, `# fail 0`

- [ ] **Step 5: Run it against a real export**

Using the export taken at task 5 step 7:

```bash
node tools/unpack-export.js "<path to your export.json>" "C:\Users\danie\AppData\Local\Temp\hub-unpack"
```

Expected: a line reporting the attachment count, the distinct file count and a size in MB.

- [ ] **Step 6: Verify the files are real**

```bash
ls "C:\Users\danie\AppData\Local\Temp\hub-unpack\files"
```

Expected: files named by a 64-character hex hash with a sensible extension. Open one of the images — it must render. Then confirm the hash is the content:

```bash
node -e "const c=require('crypto'),f=require('fs'),p=require('path');const d='C:/Users/danie/AppData/Local/Temp/hub-unpack/files';f.readdirSync(d).forEach(n=>{const h=c.createHash('sha256').update(f.readFileSync(p.join(d,n))).digest('hex');console.log(h===n.split('.')[0]?'ok':'MISMATCH',n);});"
```

Expected: every line begins `ok`.

- [ ] **Step 7: Commit**

```bash
git add tools/unpack-export.js tools/unpack-export.test.js
git commit -m "feat(tools): unpack an export into real files and their index

Attachments are files, so they are written as files: named by the SHA-256 of
their contents, which is how the register identifies every other file, and
indexed with the columns of file and file_instance so the ETL has nothing to
invent.

Size is measured from the bytes rather than trusted from the export, where it
is only what the browser reported at upload. Identical payloads are written
once and indexed twice, which is the same de-duplication the file table does.

An unrecognised mime type is stored .bin rather than guessed at; the type is
on the row, and a wrong extension is worse than an honest one.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Take the real export

**Files:** none

This is the step the rest of the plan exists to enable, and the only one that cannot be redone.

- [ ] **Step 1: Confirm the tests pass and the tree is clean**

```bash
node --test data-safety.test.js && node --test tools/unpack-export.test.js && git status --short
```

Expected: both suites pass; `git status` reports no uncommitted changes to `data-safety.js`, `tools/` or `project_hub.html`.

- [ ] **Step 2: Confirm the diff to the compiled file is still one line**

```bash
git log --oneline -- project_hub.html | head -3
git diff HEAD~6 --stat -- project_hub.html
```

Expected: one insertion. If the compiled tree was modified at any point in this plan, find out where and why before collecting data.

- [ ] **Step 3: Collect an export from every browser holding project data**

For each person and each machine:

1. Open `project_hub.html`
2. Click `⬇ ייצוא נתונים`
3. Name the file so the source is recoverable: `project_hub_export_<person>_<machine>_YYYY-MM-DD.json`
4. Put it in `D:\Coding\KkarcDB\tools\hub-import\in\`

Do not skip a machine because you believe its copy is stale. A stale copy is evidence about what changed, and this plan's whole purpose is that nothing has to be believed.

- [ ] **Step 4: Check each file before trusting it**

For every collected file:

```bash
node -e "const f=require('fs');const e=JSON.parse(f.readFileSync(process.argv[1],'utf8'));const s=(e.data&&e.data.sheets)||[];console.log(process.argv[1].split(/[\\\\/]/).pop(),'| v'+e.formatVersion,'|',e.exportedAt,'| sheets',s.length,'| tasks',s.reduce((n,x)=>n+((x.tasks||[]).length),0),'| attachments',(e.attachments||[]).length);" "<path to the file>"
```

Expected: `v2`, a recent timestamp, and non-zero sheet and task counts. **A file reporting 0 tasks did not capture anything — go back to that machine.**

- [ ] **Step 5: Unpack each one**

```bash
node tools/unpack-export.js "<path to the file>" "D:\Coding\KkarcDB\tools\hub-import\in\<person>-<machine>"
```

Expected: a report line per file. Keep the output — piece B consumes it.

- [ ] **Step 6: Store a copy somewhere that is not a developer machine**

The exports are now the only record of this data outside individual browser profiles. Put a copy where the firm's backups reach.

---

## Done, and what follows

At the end of this plan:

- `project_hub` exports and restores, and a full quota announces itself instead of losing edits quietly
- The compiled React tree is **one line** different from where it started
- Attachments are separable from the blob, identified by content hash, and written as real files with an index shaped to `file` / `file_instance`
- The schema spec no longer claims bytes go in a Supabase bucket
- A real export exists off the machines that made it

What this plan does **not** do, by design: it does not move attachments out of the running application's `localStorage`. That needs `loadData()` to become asynchronous ([project_hub.html:786](../../../project_hub.html)), which means editing the compiled tree. It belongs to piece C, where attachments get a `storage_location` and the browser stops holding bytes at all.

**Next:** piece A, the decompile — whose plan should be written against the amended target layout in [2026-09-16-hub-frontend-roadmap.md](../specs/2026-09-16-hub-frontend-roadmap.md), not the original one in the restructure spec.

## Self-review

**Spec coverage.** The roadmap lists four items for piece 0: JSON export (task 1), import (task 2), quota-error handling (task 3), attachments out of the blob (tasks 5 and 6, scoped to the export rather than the running application, with the reason stated above and in the roadmap's piece C).

**No placeholders.** Every step carries the code or the command it needs. The one `/* filled in at step 5 */` marker in task 1 step 3 is replaced by task 1 step 5 within the same task, and is written that way so the Node half can be tested before the browser half exists.

**Verified, not asserted.** The extraction, unpack and quota-guard functions in tasks 3, 5 and 6 were run against the tests printed here before this plan was saved: 9 pass, 7 pass, 7 pass. That exercise found one real bug — `installGuard` stored a *bound* copy of `setItem` as `original`, so `uninstall()` restored a wrapper rather than the function it replaced — which is fixed in the code above. The browser-only parts (the buttons, the banner, `FileReader`, the download) are not covered by these tests and are verified by hand in each task's steps.

**Type consistency.** `collectUi` is named the same in tasks 1, 2 and 5. `buildExport(storage, nowIso)` keeps its signature when it moves to version 2. `validateExport` returns `{ok, errors, version}` in tasks 2 and 5, and `applyImport` reads `v.version` from it. `extractAttachments` returns `{data, attachments}` and `unpack` consumes that `attachments` array's `{ref, mime, name, size, b64}` shape unchanged. Test counts accumulate: 4 → 11 → 18 → 30 in `data-safety.test.js`, 7 in `tools/unpack-export.test.js`.
