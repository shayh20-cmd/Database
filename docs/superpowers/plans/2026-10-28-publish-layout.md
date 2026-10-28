# Per-project publish layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each project defines its SENT and UPDATED folder layout as a chain of levels (file type / year / day) with name patterns. Quick filing builds every file's exact path from that layout, with an optional description for the day folder, a type list (office-wide, editable per project) and a per-file override.

**Architecture:**
- A new pure module, `tools/local-server/filing-layout.js`, owns the layout:
  - the type list, patterns and levels, and cleaning them;
  - recognizing a layout from the folder tree.
- `filing-plan.js`:
  - `layoutFor`: the saved layout, else one recognized from the tree, else the convention;
  - `publishPlan`: the plan built from the layout.
- `filing.js`:
  - stores `map.publish` and the office type list (`filing.json` → `office.types`);
  - serves `office-types`;
  - `inbox-plan` uses `publishPlan`.
- `project_hub_01.html`: a "פרסום" section in Project settings → Project folders, and new controls in the filing window.

**Tech Stack:**
- Node (no build step), `node:test`.
- A single-file React page edited as `React.createElement` calls.
- i18n in `i18n-dict.js`.

**Spec:** `docs/superpowers/specs/2026-10-28-publish-layout-design.md`.

**One deliberate simplification of the spec:** the spec's `pick` (choosing an existing day folder) is folded into `desc`. A description equal to an existing folder's suffix builds the same name, and an existing folder of that name is reused, so a separate `pick` field adds nothing. The window still offers the existing descriptions (`days`) as suggestions.

**Conventions for whoever implements this:**
- **Editing the page.** `project_hub_01.html` is ~2 MB, with very long lines. Never read it whole: find code with Grep and edit by a unique string. New UI is written as `React.createElement` / `h(...)` calls.
- **Line endings.** The repo uses CRLF in the working copy (`core.autocrlf=true`). When a script edits a file, keep its line endings and, for `.ps1`, its BOM.
- **No backslash escapes in tool input.** Backslash escapes typed into tool input can arrive as literal characters (see memory `feedback_unicode_escapes_in_tools`). The code in this plan avoids them on purpose: `[0-9]` instead of `\d`, character checks instead of `\u0000` ranges. Keep it that way.
- **Bilingual.** Every new UI string is Hebrew in the source and has an English entry in `i18n-dict.js` (Task 8).
- **Running tests:** from `tools/local-server`: `node --test test/<file>.test.js`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `tools/local-server/filing-layout.js` | **Create** | `OFFICE_TYPES`, `cleanTypes`, `typeOfName`, `fill`, `okName`, `cleanDesc`, `cleanLevels`, `cleanPublish`, `detectLayout`. Pure; requires nothing. |
| `tools/local-server/test/filing-layout.test.js` | **Create** | Unit tests for the module above. |
| `tools/local-server/filing-plan.js` | Modify | `layoutFor` (saved / detected / convention), `publishPlan`. |
| `tools/local-server/test/filing-plan.test.js` | Modify | `publishPlan` / `layoutFor` tests; the "הצע" test loses `pdf_only`. |
| `tools/local-server/filing-ai.js` | Modify | `normalizeMap` keeps `publish`; the Claude publish prompt and `inboxProposal` follow "UPDATED takes every type". |
| `tools/local-server/filing.js` | Modify | `load()` keeps `office`; `officeTypes()`; routes `office-types`, `project`, `map`, `map-auto`, `inbox-plan`. |
| `tools/local-server/test/filing.test.js` | Modify | Integration tests; update the existing plan-in-code expectations. |
| `project_hub_01.html` | Modify | `fmPublishOf`, `fmFill`, `PublishLayoutBox` in `SettingsFoldersView`, and the `InboxBatch` publish controls. |
| `i18n-dict.js` | Modify | English for every new string. |
| `Deploy-Azure.ps1` | Modify | Add `filing-layout.js` to the server file list (memory `project-hub-deploy-file-list`). |

---

### Task 1: `filing-layout.js` — types, patterns, levels

**Files:**
- Create: `tools/local-server/filing-layout.js`
- Create: `tools/local-server/test/filing-layout.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tools/local-server/test/filing-layout.test.js`:

```js
'use strict';
// The publish layout of a project (filing-layout.js): the type list, patterns, levels, and what the tree shows.
// Run: node --test tools/local-server/test/filing-layout.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../filing-layout');
const rel = v => { const s = String(v == null ? '' : v).trim(); return s === '' ? '' : s.includes('..') ? null : s; };

test('filing-layout: the office type list, a file\'s type by extension, the rest type for the others', () => {
  assert.deepStrictEqual(L.OFFICE_TYPES.map(t => t.name), ['PDF', 'DWG', 'DWF', 'DOCS']);
  assert.strictEqual(L.typeOfName('A-101.pdf', L.OFFICE_TYPES), 'PDF');
  assert.strictEqual(L.typeOfName('Garmoshka.ZIP', L.OFFICE_TYPES), 'DWG');
  assert.strictEqual(L.typeOfName('a.dwf', L.OFFICE_TYPES), 'DWF');
  assert.strictEqual(L.typeOfName('notes.pptx', L.OFFICE_TYPES), 'DOCS');
  assert.strictEqual(L.typeOfName('no-extension', L.OFFICE_TYPES), 'DOCS');
});

test('filing-layout: cleanTypes — one rest type, names and extensions unique, bad lists refused', () => {
  const ok = L.cleanTypes([{ name: 'PDF', ext: ['PDF', '.pdf'] }, { name: 'CAD', ext: ['dwg', 'dxf'] }, { name: 'OTHER', ext: [], rest: true }]);
  assert.deepStrictEqual(ok, [{ name: 'PDF', ext: ['pdf'] }, { name: 'CAD', ext: ['dwg', 'dxf'] }, { name: 'OTHER', ext: [], rest: true }]);
  assert.strictEqual(L.cleanTypes([{ name: 'PDF', ext: ['pdf'] }]), null, 'no rest type');
  assert.strictEqual(L.cleanTypes([{ name: 'A', ext: [], rest: true }, { name: 'B', ext: [], rest: true }]), null, 'two rest types');
  assert.strictEqual(L.cleanTypes([{ name: 'PDF', ext: ['pdf'] }, { name: 'pdf', ext: ['x'] }, { name: 'R', ext: [], rest: true }]), null, 'same name twice');
  assert.strictEqual(L.cleanTypes([{ name: 'A', ext: ['pdf'] }, { name: 'B', ext: ['pdf'] }, { name: 'R', ext: [], rest: true }]), null, 'an extension in two types');
  assert.strictEqual(L.cleanTypes([{ name: 'A/B', ext: ['x'] }, { name: 'R', ext: [], rest: true }]), null, 'not a folder name');
  assert.strictEqual(L.cleanTypes('nope'), null);
});

test('filing-layout: fill, okName, cleanDesc', () => {
  assert.strictEqual(L.fill('{code}-pub-{type}-{yyyy},{mm},{dd}', { code: 'LDLI', type: 'PDF', yyyy: '2026', mm: '10', dd: '28' }), 'LDLI-pub-PDF-2026,10,28');
  assert.strictEqual(L.okName('LDLI-pub-PDF-2026'), true);
  for (const bad of ['', 'a/b', 'a:b', 'a?', 'a.', 'a ', '..', 'x'.repeat(151)]) assert.strictEqual(L.okName(bad), false, bad);
  assert.strictEqual(L.cleanDesc('  חניה זמנית  '), 'חניה זמנית');
  assert.strictEqual(L.cleanDesc('a/b:c*d'), 'abcd');
  assert.strictEqual(L.cleanDesc('x'.repeat(80)).length, 60);
  assert.strictEqual(L.cleanDesc('trailing dots...'), 'trailing dots');
  assert.strictEqual(L.cleanDesc(null), '');
});

test('filing-layout: cleanLevels — each kind once, its tokens in the pattern, a folder name after filling', () => {
  const lv = [{ kind: 'type', pattern: 'LDLI-pub-sent-{type}' }, { kind: 'year', pattern: 'LDLI-pub-{type}-{yyyy}' }, { kind: 'day', pattern: 'LDLI-pub-{type}-{yyyy},{mm},{dd}' }];
  assert.deepStrictEqual(L.cleanLevels(lv), { levels: lv });
  assert.deepStrictEqual(L.cleanLevels([]), { levels: [] });
  assert.deepStrictEqual(L.cleanLevels(null), { levels: [] });
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'year', pattern: 'X-pub-sent' }]), { error: 0 }, 'no {yyyy}');
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'day', pattern: 'X-{yyyy},{mm}' }]), { error: 0 }, 'no {dd}');
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'type', pattern: '{type}' }, { kind: 'type', pattern: 'x-{type}' }]), { error: 1 }, 'type twice');
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'type', pattern: 'a/{type}' }]), { error: 0 }, 'not a folder name');
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'month', pattern: '{mm}' }]), { error: 0 }, 'unknown kind');
});

test('filing-layout: cleanPublish — both targets, the types, the first bad level named', () => {
  const raw = {
    sent: { base: 'P/S', levels: [{ kind: 'day', pattern: 'X-pub-{yyyy},{mm},{dd}' }] },
    updated: { base: 'P/U', levels: [{ kind: 'type', pattern: 'X-pub-updated-{type}' }] },
    types: null
  };
  assert.deepStrictEqual(L.cleanPublish(raw, rel), { publish: raw });
  assert.deepStrictEqual(L.cleanPublish(null, rel), { publish: null });
  assert.deepStrictEqual(L.cleanPublish({ ...raw, sent: { base: '../x', levels: [] } }, rel).publish.sent.base, '');
  assert.deepStrictEqual(L.cleanPublish({ ...raw, updated: { base: 'P/U', levels: [{ kind: 'year', pattern: 'nope' }] } }, rel), { error: 'layout', target: 'updated', level: 0 });
  assert.deepStrictEqual(L.cleanPublish({ ...raw, types: [{ name: 'PDF', ext: ['pdf'] }] }, rel), { error: 'layout', target: 'types', level: -1 });
  assert.deepStrictEqual(L.cleanPublish({ ...raw, types: L.OFFICE_TYPES }, rel).publish.types, L.OFFICE_TYPES);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd tools/local-server && node --test test/filing-layout.test.js`
Expected: FAIL, with "Cannot find module '../filing-layout'".

- [ ] **Step 3: Write the module (types, patterns, levels)**

Create `tools/local-server/filing-layout.js`:

```js
'use strict';
/* The publish layout of a project: where SENT and UPDATED files go inside the project's folder, as a chain of levels
   (a folder per file type, per year, per day), each with a name pattern, and the type list that names the type
   folders. Pure: no file, no network, no other module. filing-plan.js builds the paths; filing.js keeps the layout in
   the project's map (map.publish) and the office's type list in filing.json (office.types).
   Spec: docs/superpowers/specs/2026-10-28-publish-layout-design.md */

const OFFICE_TYPES = [
  { name: 'PDF', ext: ['pdf'] },
  { name: 'DWG', ext: ['dwg', 'zip'] },
  { name: 'DWF', ext: ['dwf'] },
  { name: 'DOCS', ext: [], rest: true }
];
const KINDS = ['type', 'year', 'day'];
const NEEDS = { type: ['{type}'], year: ['{yyyy}'], day: ['{yyyy}', '{mm}', '{dd}'] };
const SAMPLE = { code: 'X', type: 'PDF', yyyy: '2026', mm: '01', dd: '02' };
// characters a Windows folder name cannot hold (the backslash by its code: no escape sequences in this file)
const BAD = new Set(['/', ':', '*', '?', '"', '<', '>', '|', String.fromCharCode(92)]);
const lc = s => String(s == null ? '' : s).toLowerCase();

/* a single folder name Windows accepts: not empty, at most 150 characters, no control or reserved character, not
   only dots, not ending in a dot or a space */
function okName(s) {
  const v = String(s == null ? '' : s);
  if (!v || v.length > 150) return false;
  if ([...v].some(c => BAD.has(c) || c.charCodeAt(0) < 32)) return false;
  if ([...v].every(c => c === '.')) return false;
  return !v.endsWith('.') && !v.endsWith(' ');
}
/* the day folder's description as typed in the window: reserved characters dropped, at most 60 characters, no dot or
   space at its end; '' when nothing is left */
function cleanDesc(v) {
  let s = [...String(v == null ? '' : v)].filter(c => !BAD.has(c) && c.charCodeAt(0) >= 32).join('').trim().slice(0, 60);
  while (s.endsWith('.') || s.endsWith(' ')) s = s.slice(0, -1);
  return s;
}
/* a pattern with its tokens filled in: {code} {type} {yyyy} {mm} {dd} */
function fill(pattern, v) {
  let s = String(pattern || '');
  for (const k of ['code', 'type', 'yyyy', 'mm', 'dd']) s = s.split('{' + k + '}').join(v[k] == null ? '' : String(v[k]));
  return s;
}
/* a type list: [{ name, ext: [..], rest? }], exactly one rest type (every extension not listed), names folder names of
   at most 20 characters and unique without case, extensions in lower case without a dot and in one type only.
   null when it breaks a rule */
function cleanTypes(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 12) return null;
  const names = new Set(), exts = new Set(), out = [];
  let rests = 0;
  for (const t of raw) {
    if (!t || typeof t !== 'object') return null;
    const name = String(t.name == null ? '' : t.name).trim();
    if (!okName(name) || name.length > 20 || names.has(lc(name))) return null;
    names.add(lc(name));
    const ext = [];
    for (const e of Array.isArray(t.ext) ? t.ext : []) {
      let x = lc(String(e == null ? '' : e).trim());
      while (x.startsWith('.')) x = x.slice(1);
      if (!x) continue;
      if (!okName(x) || x.length > 10) return null;
      if (ext.includes(x)) continue;
      if (exts.has(x)) return null;
      exts.add(x);
      ext.push(x);
    }
    if (t.rest === true) { rests++; out.push({ name, ext: [], rest: true }); } else out.push({ name, ext });
  }
  return rests === 1 ? out : null;
}
/* the type a file name falls under: the type listing its extension, else the rest type */
function typeOfName(name, types) {
  const n = String(name || '');
  const dot = n.lastIndexOf('.');
  const ext = dot > 0 ? lc(n.slice(dot + 1)) : '';
  const hit = ext && types.find(t => !t.rest && t.ext.includes(ext));
  if (hit) return hit.name;
  const rest = types.find(t => t.rest);
  return rest ? rest.name : 'DOCS';
}
/* a target's levels: at most 4, each kind once, its pattern holding its tokens and a folder name once filled.
   { levels } or { error: <index of the first bad level> } */
function cleanLevels(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 4) return { error: 4 };
  const seen = new Set(), levels = [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i] && typeof list[i] === 'object' ? list[i] : {};
    const kind = KINDS.includes(x.kind) ? x.kind : null;
    const pattern = typeof x.pattern === 'string' ? x.pattern.trim() : '';
    const good = kind && !seen.has(kind) && pattern && pattern.length <= 120 && NEEDS[kind].every(t => pattern.includes(t)) && okName(fill(pattern, SAMPLE));
    if (!good) return { error: i };
    seen.add(kind);
    levels.push({ kind, pattern });
  }
  return { levels };
}
/* the project's publish layout as saved: { sent: {base, levels}, updated: {base, levels}, types: [..] | null }.
   relPath: filing-ai's (a path inside the project, '' for none, null when it leaves it). { publish } or
   { error: 'layout', target: 'sent' | 'updated' | 'types', level } */
function cleanPublish(raw, relPath) {
  if (raw == null) return { publish: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'layout', target: 'sent', level: -1 };
  const out = {};
  for (const key of ['sent', 'updated']) {
    const t = raw[key] && typeof raw[key] === 'object' ? raw[key] : {};
    const lv = cleanLevels(t.levels);
    if (lv.error != null) return { error: 'layout', target: key, level: lv.error };
    out[key] = { base: relPath(t.base) || '', levels: lv.levels };
  }
  if (raw.types == null) out.types = null;
  else {
    out.types = cleanTypes(raw.types);
    if (!out.types) return { error: 'layout', target: 'types', level: -1 };
  }
  return { publish: out };
}

module.exports = { OFFICE_TYPES, KINDS, NEEDS, okName, cleanDesc, fill, cleanTypes, typeOfName, cleanLevels, cleanPublish };
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd tools/local-server && node --test test/filing-layout.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-layout.js tools/local-server/test/filing-layout.test.js
git commit -m "feat(filing): filing-layout.js — the type list, patterns and levels of a publish layout"
```

---

### Task 2: `detectLayout` — the layout the tree shows

**Files:**
- Modify: `tools/local-server/filing-layout.js`
- Modify: `tools/local-server/test/filing-layout.test.js`

- [ ] **Step 1: Write the failing tests** (append to `test/filing-layout.test.js`)

```js
const LDLI = 'LDLI-work/LDLI-publish/LDLI-pub-@sent';
const LDLI_TREE = [
  'LDLI-work', 'LDLI-work/LDLI-publish', LDLI,
  LDLI + '/LDLI-pub-sent-DOCS', LDLI + '/LDLI-pub-sent-DOCS/LDLI-pub-DOCS-2026', LDLI + '/LDLI-pub-sent-DOCS/LDLI-pub-DOCS-2026/LDLI-pub-DOCS-2026,10,19 - חניה זמנית',
  LDLI + '/LDLI-pub-sent-DWG', LDLI + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026', LDLI + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026/LDLI-pub-DWG-2026,10,25 - גרמושקה ליועץ בטיחות',
  LDLI + '/LDLI-pub-sent-PDF', LDLI + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2025', LDLI + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026',
  LDLI + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,01,12-01 - A4', LDLI + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,19 - חניה זמנית'
];

test('filing-layout: detectLayout — the Library\'s type, year, day', () => {
  assert.deepStrictEqual(L.detectLayout(LDLI_TREE, LDLI, L.OFFICE_TYPES), [
    { kind: 'type', pattern: 'LDLI-pub-sent-{type}' },
    { kind: 'year', pattern: 'LDLI-pub-{type}-{yyyy}' },
    { kind: 'day', pattern: 'LDLI-pub-{type}-{yyyy},{mm},{dd}' }
  ]);
});

test('filing-layout: detectLayout — the convention\'s year, day, type; unified; empty', () => {
  const S = 'PUBLISH/LDPB-pub-@sent';
  const conv = ['PUBLISH', S, S + '/LDPB-pub-sent-2026', S + '/LDPB-pub-sent-2026/LDPB-pub-2026,10,01', S + '/LDPB-pub-sent-2026/LDPB-pub-2026,10,01/PDF', S + '/LDPB-pub-sent-2026/LDPB-pub-2026,10,01/DWG'];
  assert.deepStrictEqual(L.detectLayout(conv, S, L.OFFICE_TYPES), [
    { kind: 'year', pattern: 'LDPB-pub-sent-{yyyy}' },
    { kind: 'day', pattern: 'LDPB-pub-{yyyy},{mm},{dd}' },
    { kind: 'type', pattern: '{type}' }
  ]);
  const unified = conv.slice(0, 4);
  assert.deepStrictEqual(L.detectLayout(unified, S, L.OFFICE_TYPES).map(l => l.kind), ['year', 'day']);
  assert.strictEqual(L.detectLayout(['PUBLISH', S], S, L.OFFICE_TYPES), null, 'an empty archive shows nothing');
  assert.strictEqual(L.detectLayout(['PUBLISH', S, S + '/misc'], S, L.OFFICE_TYPES), null, 'names that say nothing');
});

test('filing-layout: detectLayout — the most common pattern wins; the updated folders by type', () => {
  const U = 'P/X-pub-updated';
  assert.deepStrictEqual(L.detectLayout(['P', U, U + '/X-pub-updated-PDF', U + '/X-pub-updated-DWG', U + '/old-PDF'], U, L.OFFICE_TYPES), [{ kind: 'type', pattern: 'X-pub-updated-{type}' }]);
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd tools/local-server && node --test test/filing-layout.test.js`
Expected: FAIL, with "L.detectLayout is not a function".

- [ ] **Step 3: Implement `detectLayout`** (in `filing-layout.js`, above `module.exports`, and add it to the exports)

```js
const leafOf = p => p.slice(p.lastIndexOf('/') + 1);
// the folders directly inside dir
const kids = (tree, dir) => tree.filter(p => lc(p).startsWith(lc(dir) + '/') && !p.slice(dir.length + 1).includes('/'));
const DATE = /([0-9]{4}),([0-9]{2}),([0-9]{2})/;
const YEAR = /(^|[^0-9])((19|20)[0-9]{2})([^0-9]|$)/;
const SEP = ['-', '_', ' ', ','];
/* a type name in a folder name as a whole word (between separators or the ends): the name with {type} in its place,
   or null */
function withTypeToken(leaf, names) {
  const up = leaf.toUpperCase();
  for (const n of names) {
    const N = n.toUpperCase();
    let i = up.indexOf(N);
    while (i >= 0) {
      const before = i === 0 || SEP.includes(leaf[i - 1]);
      const after = i + N.length === leaf.length || SEP.includes(leaf[i + N.length]);
      if (before && after) return leaf.slice(0, i) + '{type}' + leaf.slice(i + N.length);
      i = up.indexOf(N, i + 1);
    }
  }
  return null;
}
/* what one folder name says: { kind, pattern } or null. A date first (YYYY,MM,DD — what follows it is a description
   or a number and is not part of the pattern), then a year, then a type name; a type name inside a date or a year
   name becomes {type} too */
function readName(leaf, names) {
  const typed = withTypeToken(leaf, names);
  const base = typed || leaf;
  const d = DATE.exec(base);
  if (d) return { kind: 'day', pattern: base.slice(0, d.index) + '{yyyy},{mm},{dd}' };
  const y = YEAR.exec(base);
  if (y) { const at = y.index + y[1].length; return { kind: 'year', pattern: base.slice(0, at) + '{yyyy}' + base.slice(at + 4) }; }
  if (typed) return { kind: 'type', pattern: typed };
  return null;
}
/* The levels a SENT or UPDATED folder shows, read from the tree under base: at each level, the kind and pattern most
   of its folders share (a kind already found is skipped); then down into the last folder of that pattern by name.
   Stops at a day level with no type folders under it, after 4 levels, or where nothing is recognized.
   null when nothing is. */
function detectLayout(tree, base, types) {
  const names = types.map(t => t.name);
  const list = (tree || []).filter(Boolean);
  const levels = [], used = new Set();
  let dir = base;
  for (let depth = 0; depth < 4 && dir; depth++) {
    const counts = new Map();
    for (const p of kids(list, dir)) {
      const r = readName(leafOf(p), names);
      if (!r || used.has(r.kind)) continue;
      const k = r.kind + '|' + r.pattern;
      const c = counts.get(k) || { r, paths: [] };
      c.paths.push(p);
      counts.set(k, c);
    }
    if (!counts.size) break;
    const best = [...counts.values()].sort((a, b) => b.paths.length - a.paths.length)[0];
    levels.push(best.r);
    used.add(best.r.kind);
    dir = best.paths.slice().sort().pop();
  }
  return levels.length ? levels : null;
}
```

Change the export line to:

```js
module.exports = { OFFICE_TYPES, KINDS, NEEDS, okName, cleanDesc, fill, cleanTypes, typeOfName, cleanLevels, cleanPublish, detectLayout };
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd tools/local-server && node --test test/filing-layout.test.js`
Expected: PASS (8 tests). In LDLI, `LDLI-pub-PDF-2026,01,12-01 - A4` reads as day pattern `LDLI-pub-{type}-{yyyy},{mm},{dd}` (the `-01 - A4` after the date is dropped), so it counts with the others.

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-layout.js tools/local-server/test/filing-layout.test.js
git commit -m "feat(filing): detectLayout — the levels and patterns a SENT/UPDATED folder shows"
```

---

### Task 3: `layoutFor` and `publishPlan`

**Files:**
- Modify: `tools/local-server/filing-plan.js`
- Modify: `tools/local-server/test/filing-plan.test.js`

- [ ] **Step 1: Write the failing tests** (append to `test/filing-plan.test.js`; add `const L = require('../filing-layout');` and `const plans = require('../filing-plan');` at the top if they are not there yet)

```js
const P = 'LDLI-work/LDLI-publish';
const SENT = P + '/LDLI-pub-@sent', UPD = P + '/LDLI-pub-updated';
const LIB_TREE = ['LDLI-work', P, SENT, SENT + '/LDLI-pub-sent-PDF', SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026',
  SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,19 - חניה זמנית',
  SENT + '/LDLI-pub-sent-DWG', SENT + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026',
  SENT + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026/LDLI-pub-DWG-2026,10,19 - חניה זמנית',
  UPD, UPD + '/LDLI-pub-updated-PDF', UPD + '/LDLI-pub-updated-DWG'];
const LIB_LAYOUT = {
  sent: { base: SENT, levels: [{ kind: 'type', pattern: 'LDLI-pub-sent-{type}' }, { kind: 'year', pattern: 'LDLI-pub-{type}-{yyyy}' }, { kind: 'day', pattern: 'LDLI-pub-{type}-{yyyy},{mm},{dd}' }] },
  updated: { base: UPD, levels: [{ kind: 'type', pattern: 'LDLI-pub-updated-{type}' }] }
};
const lib = over => plans.publishPlan({ layout: LIB_LAYOUT, types: L.OFFICE_TYPES, tree: LIB_TREE, code: 'LDLI', files: [{ n: 0, name: 'K-0.pdf' }, { n: 1, name: 'Sheet.zip' }, { n: 2, name: 'notes.pptx' }], sent: true, updated: false, date: '2026-10-28', desc: '', ...over });

test('filing-plan: publishPlan — the Library\'s layout, a description, the folders made once', () => {
  const D = SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,28 - לוחות';
  const out = lib({ desc: 'לוחות' });
  assert.deepStrictEqual(out.plan.files.map(f => [f.type, f.dests.map(d => d.path)]), [
    ['PDF', [D]],
    ['DWG', [SENT + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026/LDLI-pub-DWG-2026,10,28 - לוחות']],
    ['DOCS', [SENT + '/LDLI-pub-sent-DOCS/LDLI-pub-DOCS-2026/LDLI-pub-DOCS-2026,10,28 - לוחות']]
  ]);
  assert.deepStrictEqual(out.plan.steps.map(s => s.path), [
    D,
    SENT + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026/LDLI-pub-DWG-2026,10,28 - לוחות',
    SENT + '/LDLI-pub-sent-DOCS', SENT + '/LDLI-pub-sent-DOCS/LDLI-pub-DOCS-2026', SENT + '/LDLI-pub-sent-DOCS/LDLI-pub-DOCS-2026/LDLI-pub-DOCS-2026,10,28 - לוחות'
  ]);
  assert.deepStrictEqual(out.days, []);
  assert.strictEqual(lib({}).plan.files[0].dests[0].path, SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,28', 'no description: the date only');
});

test('filing-plan: publishPlan — an existing day folder by its description; the days offered', () => {
  const out = lib({ date: '2026-10-19', desc: 'חניה זמנית', files: [{ n: 0, name: 'K-0.pdf' }] });
  assert.deepStrictEqual(out.plan.files[0].dests, [{ path: SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,19 - חניה זמנית', replace: false }]);
  assert.deepStrictEqual(out.plan.steps, []);
  assert.deepStrictEqual(lib({ date: '2026-10-19' }).days, ['חניה זמנית']);
});

test('filing-plan: publishPlan — a type changed for one file, a folder of the tree for one file, a folder that is not there', () => {
  const out = lib({ typeOf: { 0: 'DWG' }, dests: { 2: SENT + '/LDLI-pub-sent-PDF' } });
  assert.strictEqual(out.plan.files[0].type, 'DWG');
  assert.ok(out.plan.files[0].dests[0].path.startsWith(SENT + '/LDLI-pub-sent-DWG/'));
  assert.deepStrictEqual(out.plan.files[2].dests, [{ path: SENT + '/LDLI-pub-sent-PDF', replace: false }]);
  const bad = lib({ dests: { 1: 'NOT/THERE' } });
  assert.deepStrictEqual([bad.plan.files[1].dests, bad.plan.files[1].problem], [[], 'dest']);
  assert.strictEqual(lib({ typeOf: { 0: 'NOPE' } }).plan.files[0].type, 'PDF', 'a type not in the list is ignored');
});

test('filing-plan: publishPlan — UPDATED by type, replacing; a missing target said', () => {
  const out = lib({ sent: false, updated: true });
  assert.deepStrictEqual(out.plan.files.map(f => f.dests), [
    [{ path: UPD + '/LDLI-pub-updated-PDF', replace: true }],
    [{ path: UPD + '/LDLI-pub-updated-DWG', replace: true }],
    [{ path: UPD + '/LDLI-pub-updated-DOCS', replace: true }]
  ]);
  assert.deepStrictEqual(out.plan.steps.map(s => s.path), [UPD + '/LDLI-pub-updated-DOCS']);
  const none = plans.publishPlan({ layout: { sent: { base: '', levels: [] }, updated: { base: 'GONE', levels: [] } }, types: L.OFFICE_TYPES, tree: LIB_TREE, code: 'LDLI', files: [{ n: 0, name: 'a.pdf' }], sent: true, updated: true, date: '2026-10-28', desc: '' });
  assert.deepStrictEqual(none.slotsMissing, { sent: 'unmapped', updated: 'gone' });
});

test('filing-plan: layoutFor — saved, recognized from the tree, the convention; UPDATED by type from an old slot', () => {
  const map = { areas: {}, slots: { sent: SENT, sentSplit: true, updated: UPD + '/LDLI-pub-updated-PDF' }, publish: null };
  const got = plans.layoutFor(map, LIB_TREE, L.OFFICE_TYPES);
  assert.strictEqual(got.from, 'detected');
  assert.deepStrictEqual(got.layout.sent, LIB_LAYOUT.sent);
  assert.deepStrictEqual(got.layout.updated, LIB_LAYOUT.updated);
  assert.deepStrictEqual(plans.layoutFor({ ...map, publish: { ...LIB_LAYOUT, types: null } }, [], L.OFFICE_TYPES).from, 'saved');
  const conv = plans.layoutFor({ areas: {}, slots: { sent: 'P/X-pub-@sent', sentSplit: false, updated: '' } }, ['P', 'P/X-pub-@sent'], L.OFFICE_TYPES);
  assert.strictEqual(conv.from, 'convention');
  assert.deepStrictEqual(conv.layout.sent.levels, [{ kind: 'year', pattern: '{code}-pub-sent-{yyyy}' }, { kind: 'day', pattern: '{code}-pub-{yyyy},{mm},{dd}' }]);
  const empty = plans.layoutFor({ areas: {} }, LIB_TREE, L.OFFICE_TYPES);
  assert.strictEqual(empty.layout.sent.base, SENT, 'no slots: the convention\'s folder names found in the tree (autoSlots)');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `cd tools/local-server && node --test test/filing-plan.test.js`
Expected: FAIL, with "plans.publishPlan is not a function".

- [ ] **Step 3: Implement** (in `filing-plan.js`; add `const L = require('./filing-layout');` under `const ai = require('./filing-ai');`)

Add above `module.exports`:

```js
/* The publish layout to build with: the one saved in the map (map.publish), else the one the tree shows under the
   map's SENT / UPDATED folders (filing-layout.detectLayout; those folders found by the convention's names when the
   map has none), else the convention (year, day, then a folder per type unless the map says "together").
   An UPDATED folder whose name ends in a type name (…-updated-PDF, from before layouts) stands for its parent with a
   level per type. { layout: { sent, updated }, from: 'saved' | 'detected' | 'convention' } */
const CONVENTION_SENT = [{ kind: 'year', pattern: '{code}-pub-sent-{yyyy}' }, { kind: 'day', pattern: '{code}-pub-{yyyy},{mm},{dd}' }, { kind: 'type', pattern: '{type}' }];
function layoutFor(map, tree, types) {
  const list = (tree || []).filter(Boolean);
  const saved = map && map.publish;
  if (saved && (saved.sent.base || saved.updated.base)) return { layout: { sent: saved.sent, updated: saved.updated }, from: 'saved' };
  const s = (map && map.slots) || {};
  const auto = autoSlots(list).slots;
  const sentBase = s.sent || auto.sent;
  let levels = sentBase ? L.detectLayout(list, inTree(list, sentBase) || sentBase, types) : null;
  const from = levels ? 'detected' : 'convention';
  if (!levels) levels = s.sent && s.sentSplit === false ? CONVENTION_SENT.slice(0, 2) : CONVENTION_SENT.slice();
  const upd = s.updated || auto.updated;
  let updated = { base: upd, levels: [] };
  if (upd && upd.includes('/')) {
    const leaf = leafOf(upd);
    const hit = types.map(t => t.name).find(n => lc(leaf).endsWith('-' + lc(n)));
    if (hit) updated = { base: upd.slice(0, upd.lastIndexOf('/')), levels: [{ kind: 'type', pattern: leaf.slice(0, leaf.length - hit.length) + '{type}' }] };
  }
  return { layout: { sent: { base: sentBase, levels }, updated }, from };
}

/* The publish plan from a layout: each file into SENT (base, then a folder per level, the day's with " - <desc>" when
   one was typed; existing folders of the same name used as they are, the missing ones made once, in order) and into
   UPDATED (its levels, replacing a file of the same name — the PC moves the old one to @ver). typeOf { n: type }
   changes one file's type; dests { n: path } puts one file's SENT copy into a folder of the tree instead (not in the
   tree: problem 'dest'). Returns { plan, days, slotsMissing? } — days: the descriptions of the date's day folders that
   are there already, of every type, for the window to offer. */
function publishPlan({ layout, types, tree, code, files, sent, updated, date, desc, typeOf = {}, dests = {} }) {
  const list = (tree || []).filter(Boolean);
  const [yyyy, mm, dd] = date.split('-');
  const missing = {};
  const baseOf = (on, key) => {
    if (!on) return null;
    const b = layout[key] && layout[key].base;
    if (!b) { missing[key] = 'unmapped'; return null; }
    const p = inTree(list, b);
    if (!p) missing[key] = 'gone';
    return p;
  };
  const sentBase = baseOf(sent, 'sent'), updBase = baseOf(updated, 'updated');
  const steps = [], made = new Set();
  const mk = p => { if (!inTree(list, p) && !made.has(lc(p))) { made.add(lc(p)); steps.push({ op: 'mkdir', path: p }); } };
  const walk = (base, levels, type, withDesc) => {
    let dir = base;
    for (const lv of levels) {
      let name = L.fill(lv.pattern, { code, type, yyyy, mm, dd });
      if (lv.kind === 'day' && withDesc && desc) name += ' - ' + desc;
      const p = dir + '/' + name;
      dir = inTree(list, p) || p;
      mk(dir);
    }
    return dir;
  };
  const days = new Set();
  if (sentBase) for (const t of types) {
    let dir = sentBase;
    for (const lv of layout.sent.levels) {
      const name = L.fill(lv.pattern, { code, type: t.name, yyyy, mm, dd });
      if (lv.kind === 'day') {
        for (const k of kids(list, dir)) { const l = leafOf(k); if (lc(l).startsWith(lc(name) + ' - ')) days.add(l.slice(name.length + 3)); }
        break;
      }
      const p = inTree(list, dir + '/' + name);
      if (!p) break;
      dir = p;
    }
  }
  const raw = { steps, files: [] }, kinds = [], problems = {}, updDirs = [];
  for (const f of files || []) {
    const type = typeOf[f.n] && types.some(t => t.name === typeOf[f.n]) ? typeOf[f.n] : L.typeOfName(f.name, types);
    const ds = [];
    if (sent && dests[f.n] != null) {
      const p = inTree(list, dests[f.n]);
      if (p) ds.push({ path: p, replace: false }); else problems[f.n] = 'dest';
    } else if (sentBase) ds.push({ path: walk(sentBase, layout.sent.levels, type, true), replace: false });
    if (updBase) {
      const p = walk(updBase, layout.updated.levels, type, false);
      ds.push({ path: p, replace: true });
      if (!updDirs.some(x => lc(x) === lc(p))) updDirs.push(p);
    }
    raw.files.push({ name: f.name, dests: ds });
    kinds.push(type);
  }
  const plan = ai.sanitizeInboxPlan(raw, list, files, updDirs, null);
  plan.files.forEach((f, i) => { f.type = kinds[i]; if (problems[f.n]) f.problem = problems[f.n]; });
  return { plan, days: [...days].sort(), ...(Object.keys(missing).length ? { slotsMissing: missing } : {}) };
}
```

Change the export line to:

```js
module.exports = { autoSlots, sentFolder, inboxPlan, nextVersion, receivePlan, senderConsultant, layoutFor, publishPlan };
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd tools/local-server && node --test test/filing-plan.test.js test/filing-layout.test.js`
Expected: PASS. If the step-order assertion in the first test fails, the order must be: walk file 0's levels, then file 1's, then file 2's. That is the order `mk` sees them.

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-plan.js tools/local-server/test/filing-plan.test.js
git commit -m "feat(filing): publishPlan and layoutFor — paths from the project's layout, a description, per-file changes"
```

---

### Task 4: `filing-ai.js` — the map keeps `publish`; "הצע" follows UPDATED by type

**Files:**
- Modify: `tools/local-server/filing-ai.js`
- Modify: `tools/local-server/test/filing-plan.test.js` (the existing "הצע" on publish test)

- [ ] **Step 1: Update the tests**

In `test/filing-plan.test.js`, replace the test `'filing-ai: "הצע" on publish — the prompt carries the slots, and a replace of a file that is not a PDF is dropped'` with:

```js
test('filing-ai: "הצע" on publish — the prompt carries the slots; UPDATED takes every type; the map keeps its layout', async () => {
  const x = {
    project: { code: 'X', name: 'n' }, map: { areas: { publish: { paths: ['P'], note: '' } }, slots: { sent: 'P/S', sentSplit: false, updated: 'P/U' } },
    guide: '', tree: ['P', 'P/S', 'P/U'], today: '2026-10-26', files: [{ n: 0, name: 'a.pdf' }, { n: 1, name: 'a.dwg' }], sent: true, updated: true, text: '', lang: 'he'
  };
  assert.match(ai.inboxContent(x), /\nSlots: SENT archive P\/S \(all files together\); UPDATED P\/U\n/);
  assert.match(ai.inboxContent({ ...x, map: { areas: {} } }), /\nSlots: \(none\)\n/);
  const client = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
    message: 'm', mode: 'publish', steps: [], files: [{ name: 'a.pdf', dests: [{ path: 'P/U', replace: true }] }, { name: 'a.dwg', dests: [{ path: 'P/U', replace: true }, { path: 'P/S', replace: false }] }]
  }) }] }) } };
  const out = await ai.inboxProposal(client, 'claude-haiku-5-5', x);
  assert.deepStrictEqual(out.plan.files.map(f => f.dests), [[{ path: 'P/U', replace: true }], [{ path: 'P/U', replace: true }, { path: 'P/S', replace: false }]]);
  assert.strictEqual(out.replaceStripped, undefined);
  const lay = { sent: { base: 'P/S', levels: [{ kind: 'day', pattern: 'X-pub-{yyyy},{mm},{dd}' }] }, updated: { base: '', levels: [] }, types: null };
  assert.deepStrictEqual(ai.normalizeMap({ areas: {}, publish: lay }).publish, lay);
  assert.strictEqual(ai.normalizeMap({ areas: {}, publish: { sent: { base: 'P', levels: [{ kind: 'day', pattern: 'bad' }] } } }).publish, null);
  assert.strictEqual(ai.normalizeMap({ areas: {} }).publish, null);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd tools/local-server && node --test test/filing-plan.test.js`
Expected: FAIL. The prompt still says "UPDATED (PDF only)", and `pdf_only` is still set.

- [ ] **Step 3: Implement**

In `filing-ai.js`:

1. At the top, after the existing `require` lines, add: `const layout = require('./filing-layout');`
2. Replace `normalizeMap`:

```js
function normalizeMap(map) {
  if (!map || typeof map !== 'object' || !map.areas) return map || null;
  return { ...map, areas: cleanAreas(map.areas, rel => rel || null), slots: cleanSlots(map.slots), publish: layout.cleanPublish(map.publish, relPath).publish || null };
}
```

3. In `slotsLine`, replace `s.updated ? \`UPDATED (PDF only) ${strip(s.updated)}\` : ''` with `s.updated ? \`UPDATED ${strip(s.updated)}\` : ''`.
4. In `INBOX_SYSTEM`, find the line starting `'Unless the map, its note or the guide say otherwise, the office\'s convention (Folder Manager) is,`. Replace `UPDATED (PDF files only) = <publish folder>/CODE-pub-updated/CODE-pub-updated-PDF.` with `UPDATED = <publish folder>/CODE-pub-updated/CODE-pub-updated-TYPE.`. Replace `(PDF, DWG, RVT, otherwise DOCS)` with `(PDF; DWG for dwg and zip; DWF; otherwise DOCS)`.
5. In the `'The "Slots:" line, …'` line, replace `UPDATED is the one folder it names, and only PDF files go there (other files are not put in UPDATED at all).` with `UPDATED is the folder it names, or, when that folder's name ends in a TYPE, the folder of each file's own TYPE next to it.`.
6. In `inboxProposal`, delete these lines:

```js
  // UPDATED is for PDFs only: a replace of any other file goes (the window says so under Claude's words)
  for (const f of plan.files) {
    if (/\.pdf$/i.test(f.name) || !f.dests.some(d => d.replace)) continue;
    f.dests = f.dests.filter(d => !d.replace);
    notes.replaceStripped = 'pdf_only';
  }
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd tools/local-server && node --test test/filing-plan.test.js test/filing-layout.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-ai.js tools/local-server/test/filing-plan.test.js
git commit -m "feat(filing): the map keeps its publish layout; Claude's UPDATED takes every type"
```

---

### Task 5: `filing.js` — the office type list, the map, map-auto, project, inbox-plan

**Files:**
- Modify: `tools/local-server/filing.js`
- Modify: `tools/local-server/test/filing.test.js`

- [ ] **Step 1: Write the failing test** (append to `test/filing.test.js`, port 4066)

```js
test('filing hub: the office type list, the layout in the map, map-auto, and the window\'s plan by layout', async (t) => {
  const { base, data, keyOf, call, agent } = await start(t, 4066, {});
  const as = email => async (route, body, method) => {
    const r = await fetch(base + '/api/filing-hub/' + route, { method: method || (body ? 'POST' : 'GET'), headers: { 'x-ms-client-principal': principal(email), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const hub = as('dana@kkarc.com');
  const S = 'PUBLISH/LDPB-pub-@sent', U = 'PUBLISH/LDPB-pub-updated';
  const tree = ['PUBLISH', S, S + '/LDPB-pub-sent-PDF', S + '/LDPB-pub-sent-PDF/LDPB-pub-PDF-2026', S + '/LDPB-pub-sent-PDF/LDPB-pub-PDF-2026/LDPB-pub-PDF-2026,10,19 - חניה', U, U + '/LDPB-pub-updated-PDF'];
  fs.writeFileSync(path.join(data, 'filing.json'), JSON.stringify({ projects: { pabc123: { folder: FOLDER, root: ROOT, guide: '', log: [], map: { areas: { publish: { paths: ['PUBLISH'], note: '' } }, slots: { sent: S, sentSplit: true, updated: U + '/LDPB-pub-updated-PDF' } } } } }));
  const dana = await keyOf('dana@kkarc.com');

  // the office's list: the default, kept by a writer only, checked
  assert.deepStrictEqual((await hub('office-types')).body.types.map(x => x.name), ['PDF', 'DWG', 'DWF', 'DOCS']);
  const mine = [{ name: 'PDF', ext: ['pdf'] }, { name: 'CAD', ext: ['dwg', 'zip'] }, { name: 'OTHER', ext: [], rest: true }];
  assert.strictEqual((await as('ron@kkarc.com')('office-types', { types: mine }, 'PUT')).status, 403);
  assert.deepStrictEqual((await hub('office-types', { types: [{ name: 'PDF', ext: ['pdf'] }] }, 'PUT')).body, { error: 'types' });
  assert.deepStrictEqual((await hub('office-types', { types: mine }, 'PUT')).body.types, mine);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(data, 'filing.json'), 'utf8')).office.types, mine);
  const pr = (await hub('project?project=pabc123')).body;
  assert.deepStrictEqual([pr.code, pr.types.map(x => x.name), pr.officeTypes.map(x => x.name)], ['LDPB', ['PDF', 'CAD', 'OTHER'], ['PDF', 'CAD', 'OTHER']]);

  // the window, with no layout saved: recognized from the tree; a description; the days of the date; the type names
  const id = (await call(dana, '/api/outlook/inbox-batch', { pc: 'PC1', files: [{ name: 'LDPB-A-1.pdf', size: 1, mtime: '' }, { name: 'LDPB-A-1.zip', size: 1, mtime: '' }] })).body.id;
  const planning = hub('inbox-plan', { id, projectId: 'pabc123', files: [0, 1], sent: true, updated: true, date: '2026-10-19', desc: 'חניה' });
  await (await agent(dana)).result({ tree });
  const p1 = (await planning).body;
  assert.strictEqual(p1.layoutFrom, 'detected');
  assert.deepStrictEqual(p1.days, ['חניה']);
  assert.deepStrictEqual(p1.types, ['PDF', 'CAD', 'OTHER']);
  assert.deepStrictEqual(p1.plan.files.map(f => [f.type, f.dests.map(d => d.path)]), [
    ['PDF', [S + '/LDPB-pub-sent-PDF/LDPB-pub-PDF-2026/LDPB-pub-PDF-2026,10,19 - חניה', U + '/LDPB-pub-updated-PDF']],
    ['CAD', [S + '/LDPB-pub-sent-CAD/LDPB-pub-CAD-2026/LDPB-pub-CAD-2026,10,19 - חניה', U + '/LDPB-pub-updated-CAD']]
  ]);
  assert.ok(Array.isArray(p1.folders) && p1.folders.includes(S + '/LDPB-pub-sent-PDF'), 'the SENT folders, for "שנה"');
  // one file's type and one file's folder changed in the window
  const p2 = (await hub('inbox-plan', { id, projectId: 'pabc123', files: [0, 1], sent: true, updated: false, date: '2026-10-19', desc: '', typeOf: { 1: 'PDF' }, dests: { 0: S + '/LDPB-pub-sent-PDF' } })).body;
  assert.deepStrictEqual(p2.plan.files.map(f => f.dests[0].path), [S + '/LDPB-pub-sent-PDF', S + '/LDPB-pub-sent-PDF/LDPB-pub-PDF-2026/LDPB-pub-PDF-2026,10,19']);

  // the layout saved in the map: checked, kept, used
  const lay = { sent: { base: S, levels: [{ kind: 'day', pattern: 'LDPB-{yyyy},{mm},{dd}' }] }, updated: { base: U, levels: [{ kind: 'type', pattern: 'LDPB-pub-updated-{type}' }] }, types: null };
  const areas = { publish: { paths: ['PUBLISH'], note: '' } };
  assert.deepStrictEqual((await hub('map', { projectId: 'pabc123', areas, publish: { ...lay, sent: { base: S, levels: [{ kind: 'year', pattern: 'nope' }] } } }, 'PUT')).body, { error: 'layout', target: 'sent', level: 0 });
  assert.deepStrictEqual((await hub('map', { projectId: 'pabc123', areas, publish: lay }, 'PUT')).body.map.publish, lay);
  assert.deepStrictEqual((await hub('map', { projectId: 'pabc123', areas }, 'PUT')).body.map.publish, lay, 'a save without publish keeps it');
  const p3 = (await hub('inbox-plan', { id, projectId: 'pabc123', files: [0], sent: true, updated: false, date: '2026-10-28', desc: '' })).body;
  assert.deepStrictEqual([p3.layoutFrom, p3.plan.files[0].dests[0].path], ['saved', S + '/LDPB-2026,10,28']);

  // map-auto: the layout the tree shows, for the page to fill in
  const ms = (await hub('map-session', { projectId: 'pabc123' })).body.id;
  const auto = hub('map-auto?id=' + ms, {});
  await (await agent(dana)).result({ tree });
  assert.deepStrictEqual((await auto).body.auto.publish.sent.levels.map(l => l.kind), ['type', 'year', 'day']);
});
```

In the existing test `'filing inbox: the window\'s plan in code — publish to SENT and UPDATED, …'`:
- UPDATED now takes every type. Replace the `assert.deepStrictEqual(p1.body.plan, {...})` block with:

```js
  const U1 = 'PUBLISH/LDPB-pub-updated';
  assert.deepStrictEqual(p1.body.plan, {
    files: [
      { n: 0, name: 'LDPB-A-101.pdf', type: 'PDF', dests: [{ path: D1 + '/PDF', replace: false }, { path: NC_SLOTS.updated, replace: true }] },
      { n: 1, name: 'LDPB-A-101.dwg', type: 'DWG', dests: [{ path: D1 + '/DWG', replace: false }, { path: U1 + '/LDPB-pub-updated-DWG', replace: true }] }
    ],
    steps: [{ op: 'mkdir', path: D1 + '/DWG', from: '', to: '' }, { op: 'mkdir', path: U1 + '/LDPB-pub-updated-DWG', from: '', to: '' }], mode: 'publish', projectId: 'pabc123'
  });
```

- The PR #49 assertion `assert.deepStrictEqual([p3.plan, p3.body.slotsMissing], [p1.body.plan, undefined])` stays as it is: a map without slots now goes through `layoutFor` → `autoSlots`, which gives the same plan.

- [ ] **Step 2: Run them and see them fail**

Run: `cd tools/local-server && node --test test/filing.test.js`
Expected: FAIL. `office-types` returns 404; the plan has no `type`.

- [ ] **Step 3: Implement** (in `filing.js`)

1. Add `const layout = require('./filing-layout');` next to `const plans = require('./filing-plan');`.
2. Make `load()` keep the office part. After the `budget` line add: `if (d && d.office && typeof d.office === 'object') o.office = d.office;`
3. After `known` / `projectOf`, add:

```js
  // the office's type list (Settings → the publish section of a project): filing.json's office.types, else the default
  const officeTypes = () => layout.cleanTypes((load().office || {}).types) || layout.OFFICE_TYPES;
  const typesOf = map => (map && map.publish && map.publish.types) || officeTypes();
```

4. `HUB_METHOD`: add `'office-types': 'GET'`. Replace the method check line `if (req.method !== HUB_METHOD[route]) { sendJson(res, 405, …); return; }` with:

```js
    // office-types: GET reads the list, PUT keeps it
    const allowed = route === 'office-types' && req.method === 'PUT' ? 'PUT' : HUB_METHOD[route];
    if (req.method !== allowed) { sendJson(res, 405, { error: 'Method not allowed' }); return; }
```

5. In the `project` route, replace its `sendJson(res, 200, {...})` with:

```js
      const map = ai.normalizeMap(pr.map);
      sendJson(res, 200, { folder: pr.folder || '', root: pr.root || '', code: g.project.code || '', map, types: typesOf(map), officeTypes: officeTypes(), guide: pr.guide || '', defaultGuide: DEFAULT_GUIDE, canWrite: writer(p) });
```

6. Right after the `task` route, add:

```js
    if (route === 'office-types') {
      if (req.method === 'GET') { sendJson(res, 200, { types: officeTypes(), canWrite: writer(p) }); return; }
      if (!writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
      const types = layout.cleanTypes((await json(req)).types);
      if (!types) { sendJson(res, 400, { error: 'types' }); return; }
      const d = load();
      d.office = { ...(d.office || {}), types };
      writeJsonAtomic(STORE, d);
      sendJson(res, 200, { types });
      return;
    }
```

7. In the `map-auto` route, replace `sendJson(res, 200, { auto: plans.autoSlots(m.tree), tree: m.tree });` with:

```js
        const a = plans.autoSlots(m.tree);
        const lay = plans.layoutFor({ slots: a.slots }, m.tree, typesOf(ai.normalizeMap(pr.map))).layout;
        sendJson(res, 200, { auto: { ...a, publish: lay }, tree: m.tree });
```

8. In the map save (after `const slots = ai.cleanSlots(...)`), add:

```js
    // the publish layout: as sent (checked), or kept when a page that does not know it saves the areas
    const pub = body.publish !== undefined ? layout.cleanPublish(body.publish, ai.relPath) : { publish: (ai.normalizeMap(pd.map) || {}).publish || null };
    if (pub.error) { sendJson(res, 400, { error: 'layout', target: pub.target, level: pub.level }); return; }
```

Then change `const map = { areas, slots, updatedBy: …` to `const map = { areas, slots, publish: pub.publish, updatedBy: …`.

9. In `inbox-plan`'s publish branch, replace everything from `const map = ai.normalizeMap(pr.map);` through `out = plans.inboxPlan({ slots, tree: h.tree, … });` (including the PR #49 `set` / `auto` / `slots` lines) with:

```js
            const map = ai.normalizeMap(pr.map);
            const types = typesOf(map);
            const { layout: lay, from: layoutFrom } = plans.layoutFor(map, h.tree, types);
            const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
            const typeOf = {}, dests = {};
            for (const [k, v] of Object.entries(obj(body.typeOf))) if (/^[0-9]{1,3}$/.test(k) && typeof v === 'string') typeOf[k] = v;
            for (const [k, v] of Object.entries(obj(body.dests))) { const q = ai.relPath(v); if (/^[0-9]{1,3}$/.test(k) && q) dests[k] = q; }
            out = plans.publishPlan({ layout: lay, types, tree: h.tree, code: project.code, files, sent: body.sent === true, updated: body.updated === true, date, desc: layout.cleanDesc(body.desc), typeOf, dests });
            const under = b => (b ? h.tree.filter(q => q.toLowerCase() === b.toLowerCase() || q.toLowerCase().startsWith(b.toLowerCase() + '/')) : []);
            Object.assign(out, { layoutFrom, types: types.map(x => x.name), folders: under(lay.sent.base).slice(0, 800) });
```

10. In the same route's response, replace `sendJson(res, 200, { plan: out.plan, …` with:

```js
          sendJson(res, 200, { plan: out.plan, ...(out.version ? { version: out.version } : {}), ...(out.slotsMissing ? { slotsMissing: out.slotsMissing } : {}), ...(out.problem ? { problem: out.problem } : {}), ...(out.layoutFrom ? { layoutFrom: out.layoutFrom, days: out.days, types: out.types, folders: out.folders } : {}) });
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `cd tools/local-server && node --test test/filing.test.js test/filing-plan.test.js test/filing-layout.test.js test/installers.test.js`
Expected: PASS for all.

Saved maps now carry `publish: null`. The existing assertions that compare a whole map (`body.map` from `project`, from `/api/outlook/filing-project`, and the saved one) compare like with like, so they keep passing. If any assertion builds a map object by hand and compares it to a saved one, add `publish: null` to that object.

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing.js tools/local-server/test/filing.test.js
git commit -m "feat(filing): office type list, the layout in the map, map-auto's layout, inbox-plan by layout"
```

---

### Task 6: Project settings — the "פרסום" section

**Files:**
- Modify: `project_hub_01.html` (near `fmSlotsOf`, and in `SettingsFoldersView`)

- [ ] **Step 1: Add the helpers after `fmSlotsOf`** (anchor: the line `async function fmCall(route, body, method) {`; insert before it)

```js
// the map's publish layout for the page: SENT and UPDATED, each { base, levels: [{ kind, pattern }] }, and the
// project's own type list (null: the office's)
const fmPublishOf = map => {
  const p = map && map.publish;
  const t = x => ({
    base: String(x && x.base || ''),
    levels: Array.isArray(x && x.levels) ? x.levels.map(l => ({
      kind: l.kind,
      pattern: String(l.pattern || '')
    })) : []
  });
  return {
    sent: t(p && p.sent),
    updated: t(p && p.updated),
    types: p && Array.isArray(p.types) ? p.types.map(x => ({
      name: x.name,
      ext: (x.ext || []).slice(),
      ...(x.rest ? {
        rest: true
      } : {})
    })) : null
  };
};
const FM_KINDS = [['type', 'סוג קובץ'], ['year', 'שנה'], ['day', 'יום']];
const FM_NEEDS = {
  type: ['{type}'],
  year: ['{yyyy}'],
  day: ['{yyyy}', '{mm}', '{dd}']
};
const FM_DEFAULT_PATTERN = {
  type: '{type}',
  year: '{code}-pub-sent-{yyyy}',
  day: '{code}-pub-{yyyy},{mm},{dd}'
};
const fmFill = (pattern, v) => ['code', 'type', 'yyyy', 'mm', 'dd'].reduce((s, k) => s.split('{' + k + '}').join(v[k] == null ? '' : String(v[k])), String(pattern || ''));
// what is wrong with a level, said in the page ('' when nothing)
const fmLevelError = (lv, all) => {
  if (!lv.pattern.trim()) return tx('תבנית ריקה');
  const miss = FM_NEEDS[lv.kind].filter(t => !lv.pattern.includes(t));
  if (miss.length) return tx('לתבנית חסר {t}', {
    t: miss.join(' ')
  });
  if (all.filter(x => x.kind === lv.kind).length > 1) return tx('אותה רמה פעמיים');
  if (/[\/:*?"<>|]/.test(lv.pattern)) return tx('תו שאסור בשם תיקייה');
  return '';
};
const fmTypesLine = types => (types || []).map(t => t.rest ? t.name + ': ' + tx('כל השאר') : t.name + ': ' + t.ext.join(', ')).join(' · ');
```

(The regex `/[\/:*?"<>|]/` holds one backslash, escaping `/` in a regex literal. If the editor collapses it, use `/[/:*?"<>|]/`, which is equivalent in JS.)

- [ ] **Step 2: Add the `PublishLayoutBox` component** (insert before `function SettingsFoldersView({`)

```js
/* Project settings → Project folders → פרסום: where SENT and UPDATED files go — each a folder of the tree and a chain
   of levels (a folder per file type, year or day), with a preview — and the type list (the office's, or the project's
   own). Edits go through onChange and are saved with the map ("שמור מפה"); the office's list is saved at once. */
function PublishLayoutBox({
  value,
  onChange,
  w,
  has,
  tree,
  code,
  officeTypes,
  onOfficeTypes,
  open,
  opening
}) {
  const h = React.createElement;
  const [editOffice, setEditOffice] = useState(null); // the office's list while it is edited here
  const [officeMsg, setOfficeMsg] = useState('');
  const types = value.types || officeTypes || [];
  const today = fmToday().split('-');
  const set = (key, x) => onChange({
    ...value,
    [key]: x
  });
  const preview = key => {
    const t = value[key];
    if (!t.base) return '—';
    const vals = {
      code,
      type: 'PDF',
      yyyy: today[0],
      mm: today[1],
      dd: today[2]
    };
    return fmSlash([t.base, ...t.levels.map(l => fmFill(l.pattern, vals) + (key === 'sent' && l.kind === 'day' ? ' - ' + tx('<תיאור>') : ''))].join('/'));
  };
  const target = (key, label) => {
    const t = value[key];
    const move = (i, d) => {
      const lv = t.levels.slice();
      const j = i + d;
      if (j < 0 || j >= lv.length) return;
      [lv[i], lv[j]] = [lv[j], lv[i]];
      set(key, {
        ...t,
        levels: lv
      });
    };
    const edit = (i, x) => set(key, {
      ...t,
      levels: t.levels.map((l, k) => k === i ? {
        ...l,
        ...x
      } : l)
    });
    const free = FM_KINDS.map(k => k[0]).filter(k => !t.levels.some(l => l.kind === k));
    return h("div", {
      className: "fm-pub"
    }, h("div", {
      className: "fm-slot"
    }, h("span", {
      className: "fm-slot-l"
    }, label), h("span", {
      className: "fm-path",
      dir: "auto",
      "data-i18n-skip": "",
      title: t.base ? fmSlash(t.base) : undefined
    }, t.base ? fmSlash(t.base) : '—'), has && t.base ? h("button", {
      className: "fm-ico",
      title: "פתח בסייר הקבצים",
      disabled: opening,
      onClick: () => open(t.base)
    }, "📂") : null, w && t.base ? h("button", {
      className: "fm-ico fm-x",
      title: "הסר",
      onClick: () => set(key, {
        ...t,
        base: ''
      })
    }, "✕") : null, w && tree ? h("select", {
      className: "fm-pick",
      value: "",
      onChange: e => e.target.value && set(key, {
        ...t,
        base: e.target.value
      })
    }, h("option", {
      value: ""
    }, "בחר מהעץ"), tree.map(p => h("option", {
      key: p,
      value: p,
      "data-i18n-skip": ""
    }, fmSlash(p)))) : null), t.levels.map((l, i) => {
      const err = fmLevelError(l, t.levels);
      return h("div", {
        key: i,
        className: 'fm-level' + (err ? ' bad' : '')
      }, h("span", {
        className: "fm-level-n"
      }, i + 1), h("select", {
        className: "fm-pick",
        value: l.kind,
        disabled: !w,
        onChange: e => edit(i, {
          kind: e.target.value
        })
      }, FM_KINDS.map(([k, lbl]) => h("option", {
        key: k,
        value: k
      }, lbl))), h("input", {
        className: "af-input fm-pattern",
        dir: "ltr",
        "data-i18n-skip": "",
        value: l.pattern,
        disabled: !w,
        onChange: e => edit(i, {
          pattern: e.target.value
        })
      }), w ? h("button", {
        className: "fm-ico",
        title: "למעלה",
        disabled: i === 0,
        onClick: () => move(i, -1)
      }, "↑") : null, w ? h("button", {
        className: "fm-ico",
        title: "למטה",
        disabled: i === t.levels.length - 1,
        onClick: () => move(i, 1)
      }, "↓") : null, w ? h("button", {
        className: "fm-ico fm-x",
        title: "הסר",
        onClick: () => set(key, {
          ...t,
          levels: t.levels.filter((x, k) => k !== i)
        })
      }, "✕") : null, err ? h("div", {
        className: "fm-level-err"
      }, err) : null);
    }), w && free.length ? h("button", {
      className: "np-btn fm-add-level",
      onClick: () => set(key, {
        ...t,
        levels: [...t.levels, {
          kind: free[0],
          pattern: FM_DEFAULT_PATTERN[free[0]]
        }]
      })
    }, "+ רמה") : null, h("div", {
      className: "fm-preview"
    }, h("span", null, tx('קובץ PDF מהיום ←')), " ", h("span", {
      dir: "ltr",
      "data-i18n-skip": ""
    }, preview(key))));
  };
  // the type list editor: the project's own (in the map) or the office's (saved at once)
  const typeEditor = (list, change, save) => h("div", {
    className: "fm-types-ed"
  }, list.map((t, i) => h("div", {
    key: i,
    className: "fm-type-row"
  }, h("input", {
    className: "af-input fm-type-name",
    dir: "ltr",
    "data-i18n-skip": "",
    value: t.name,
    onChange: e => change(list.map((x, k) => k === i ? {
      ...x,
      name: e.target.value
    } : x))
  }), t.rest ? h("span", {
    className: "fm-type-rest"
  }, "כל השאר") : h("input", {
    className: "af-input fm-type-ext",
    dir: "ltr",
    "data-i18n-skip": "",
    value: t.ext.join(', '),
    placeholder: "pdf, dwg",
    onChange: e => change(list.map((x, k) => k === i ? {
      ...x,
      ext: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
    } : x))
  }), t.rest ? null : h("button", {
    className: "fm-ico fm-x",
    title: "הסר",
    onClick: () => change(list.filter((x, k) => k !== i))
  }, "✕"))), h("div", {
    className: "fm-types-act"
  }, h("button", {
    className: "np-btn",
    onClick: () => change([...list.filter(x => !x.rest), {
      name: '',
      ext: []
    }, ...list.filter(x => x.rest)])
  }, "+ סוג"), save || null));
  const saveOffice = () => {
    setOfficeMsg('');
    fmCall('office-types', {
      types: editOffice
    }, 'PUT').then(r => {
      onOfficeTypes(r.types);
      setEditOffice(null);
    }).catch(e => setOfficeMsg(e.message === 'types' ? tx('הרשימה לא תקינה: שם לכל סוג, בלי כפילויות, וסיומת בסוג אחד בלבד') : e.message));
  };
  return h(React.Fragment, null, h("div", {
    className: "sp-sec-lbl fm-head"
  }, h("span", null, "פרסום")), h("div", {
    className: "fm-msg fm-slot-note"
  }, "מבנה התיקיות של SENT ו-UPDATED בפרויקט הזה: התיקייה, ואחריה רמה לכל תיקייה בדרך — לפי סוג קובץ, שנה או יום. \"מלא אוטומטית\" מזהה אותו מהתיקיות הקיימות."), target('sent', 'SENT'), target('updated', 'UPDATED'), h("div", {
    className: "fm-slot fm-types"
  }, h("span", {
    className: "fm-slot-l"
  }, "סוגי קבצים"), h("span", {
    "data-i18n-skip": "",
    dir: "ltr"
  }, fmTypesLine(types)), h("span", {
    className: "fm-types-src"
  }, value.types ? tx('של הפרויקט') : tx('של המשרד'))), w ? h("div", {
    className: "fm-types-act"
  }, value.types ? h("button", {
    className: "np-btn",
    onClick: () => set('types', null)
  }, "חזור לרשימת המשרד") : h("button", {
    className: "np-btn",
    onClick: () => set('types', types.map(x => ({
      ...x,
      ext: x.ext.slice()
    })))
  }, "התאם לפרויקט"), !editOffice ? h("button", {
    className: "np-btn",
    onClick: () => setEditOffice((officeTypes || []).map(x => ({
      ...x,
      ext: x.ext.slice()
    })))
  }, "ערוך את רשימת המשרד") : null) : null, w && value.types ? typeEditor(value.types, list => set('types', list)) : null, w && editOffice ? h(React.Fragment, null, h("div", {
    className: "fm-msg"
  }, "רשימת המשרד — לכל הפרויקטים שאין להם רשימה משלהם:"), typeEditor(editOffice, setEditOffice, h(React.Fragment, null, h("button", {
    className: "np-btn primary",
    onClick: saveOffice
  }, "שמור את רשימת המשרד"), h("button", {
    className: "np-btn",
    onClick: () => setEditOffice(null)
  }, "ביטול"))), officeMsg ? h("div", {
    className: "fm-level-err",
    "data-i18n-skip": ""
  }, officeMsg) : null) : null);
}
```

- [ ] **Step 3: Wire it into `SettingsFoldersView`**

1. After `const [slots, setSlots] = useState(() => fmSlotsOf(null));` add:

```js
  const [publish, setPublish] = useState(() => fmPublishOf(null));
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const [officeTypes, setOfficeTypes] = useState(null);
```

2. Wherever the component calls `setSlots(fmSlotsOf(X))`, add `setPublish(fmPublishOf(X));` right after it, with the same `X`. There are four places: the load (`fmSlotsOf(p.map)`), after save (`fmSlotsOf(r.map)`), in `discard` (`fmSlotsOf(info && info.map)`), and any other — Grep `setSlots(fmSlotsOf(` inside the component. In the load, also add `setOfficeTypes(p.officeTypes || null);` next to `setPublish`.
3. In `autoFill`, after the `if (!s.updated && a.slots.updated) {…}` block, add:

```js
      const pb = {
        ...publishRef.current
      };
      ['sent', 'updated'].forEach(k => {
        const got = a.publish && a.publish[k];
        if (got && got.base && !pb[k].base && !pb[k].levels.length) {
          pb[k] = {
            base: got.base,
            levels: got.levels.map(l => ({
              ...l
            }))
          };
          n++;
        }
      });
```

   In `if (n) { setSlots(s); setAreas(ar); setDirty(true); }`, add `setPublish(pb);`.
4. In `saveMap`, change the body `{ projectId, areas, slots }` to:

```js
      projectId,
      areas,
      slots,
      publish: publish.sent.base || publish.updated.base || publish.types ? publish : null
```

   In its `.catch`, before the `path` message, handle `layout`: `setMapMsg(e.message === 'layout' ? say('אחת הרמות בפרסום אינה תקינה — תקן את המסומן באדום.') : e.message === 'path' ? …)`.
5. Replace `slotsBox` in the render (the `}), slotsBox, w && /*#__PURE__*/React.createElement("div", {` occurrence) with:

```js
  }), /*#__PURE__*/React.createElement(PublishLayoutBox, {
    value: publish,
    onChange: v => {
      setPublish(v);
      setDirty(true);
    },
    w,
    has,
    tree,
    code: info && info.code || '',
    officeTypes,
    onOfficeTypes: setOfficeTypes,
    open,
    opening
  }), w && /*#__PURE__*/React.createElement("div", {
```

   Then delete the now unused `slotRow`, `split` and `slotsBox` definitions. Keep the `slots` state: it is still saved and used by the Outlook pane.
6. CSS: find `.fm-slot{` in the `<style>` block and add after its rule:

```css
.fm-pub{margin:6px 0 10px;}
.fm-level{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:4px 0;padding-inline-start:18px;}
.fm-level-n{font-size:11px;color:var(--text-3);min-width:12px;}
.fm-pattern{flex:1 1 220px;min-width:0;font-family:ui-monospace,Consolas,monospace;font-size:12px;}
.fm-level.bad .fm-pattern{border-color:#DC2626;}
.fm-level-err{flex-basis:100%;font-size:12px;color:#DC2626;padding-inline-start:18px;}
.fm-add-level{margin-inline-start:18px;font-size:12px;}
.fm-preview{font-size:12px;color:var(--text-2);margin:4px 0 0;padding-inline-start:18px;word-break:break-all;}
.fm-types-src{font-size:12px;color:var(--text-3);}
.fm-types-act{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;}
.fm-types-ed{display:flex;flex-direction:column;gap:4px;margin:4px 0;}
.fm-type-row{display:flex;gap:6px;align-items:center;}
.fm-type-name{width:90px;}
.fm-type-ext{flex:1 1 160px;min-width:0;}
.fm-type-rest{font-size:12px;color:var(--text-3);}
```

- [ ] **Step 4: Check it in the browser** (the full check is in Task 9). Open Project settings → Project folders of a project with a folder. Then:
  - The "פרסום" section renders, with no console errors.
  - "מלא אוטומטית" fills SENT/UPDATED and their levels.
  - The preview updates while you type.
  - A bad pattern shows red.
  - "שמור מפה" keeps the layout.

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(project-hub): the publish section — SENT/UPDATED levels with patterns, preview, type lists"
```

---

### Task 7: The filing window — description, types, per-file folder, 📂 after filing

**Files:**
- Modify: `project_hub_01.html` (`InboxBatch`)

- [ ] **Step 1: State.** After `const [date, setDate] = useState(fmToday);` add:

```js
  const [desc, setDesc] = useState(''); // the day folder's description (optional), added to its name
  const [typeOf, setTypeOf] = useState({}); // { n: type } — a type changed for one file
  const [overrides, setOverrides] = useState({}); // { n: path } — a folder of the tree for one file's SENT copy
  const [picking, setPicking] = useState(null); // n of the file whose folder is being chosen
```

- [ ] **Step 2: Send them with the plan.**
  - In the publish `wish` object (`sent,\n      updated,\n      date\n    };`), change it to `sent,\n      updated,\n      date,\n      desc,\n      typeOf,\n      dests: overrides\n    };`.
  - In `propose`, change the publish part of the `Object.assign(body, …)` from `{ date: w.date }` to `{ date: w.date, desc: w.desc || undefined, typeOf: w.typeOf, dests: w.dests }`.
  - In the effect's dependency array (`[info && info.id, projectId, sel.join(','), sent, updated, date, …]`), add `desc, JSON.stringify(typeOf), JSON.stringify(overrides)`.
  - When the project changes, reset the per-file choices. In the effect that runs on `projectId` (or where `setProjectId` is called by the person), add `setTypeOf({}); setOverrides({}); setPicking(null);`.

- [ ] **Step 3: Keep what the server sends.** In `setProp({...})` inside `propose`, after `slotsMissing: x.slotsMissing || null,` add:

```js
          days: Array.isArray(x.days) ? x.days : [],
          types: Array.isArray(x.types) ? x.types : [],
          folders: Array.isArray(x.folders) ? x.folders : [],
          layoutFrom: x.layoutFrom || '',
```

- [ ] **Step 4: The SENT row and UPDATED.** Replace the `h("input", { type: "date", className: "af-input ib-date", … }))` element's closing `)) : null, mode === 'publish' ? slotHint('sent') : null,` sequence with the date input followed by the description:

```js
  }), h("input", {
    className: "af-input ib-desc",
    dir: "auto",
    "data-i18n-skip": "",
    list: 'ib-days-' + id,
    value: desc,
    maxLength: 60,
    disabled: locked || !sent,
    placeholder: tx('תיאור לתיקיית היום (רשות)'),
    onChange: e => setDesc(e.target.value)
  }), h("datalist", {
    id: 'ib-days-' + id
  }, (prop && prop.days || []).map(d => h("option", {
    key: d,
    value: d
  })))) : null, mode === 'publish' && sent && prop && prop.days && prop.days.length ? h("div", {
    className: "ib-hint",
    "data-i18n-skip": ""
  }, prop.days.includes(desc.trim()) ? tx('תיקייה קיימת מאותו יום: {d}', {
    d: asTyped(desc.trim())
  }) : tx('יש כבר תיקיות מהיום: {d} — בחר מהרשימה, או כתוב תיאור חדש', {
    d: prop.days.map(asTyped).join(', ')
  })) : null, mode === 'publish' ? slotHint('sent') : null,
```

  - Replace the UPDATED label text `"UPDATED (PDF בלבד, מחליף קובץ באותו שם)"` with `"UPDATED (מחליף קובץ באותו שם)"`.
  - Replace the whole `mode === 'publish' && updated ? h("div", { className: "ib-hint", … }, (!nonPdf ? '' : …) + tx('קובץ ישן באותו שם עובר ל-@ver ולא נמחק')) : null` expression with:

```js
mode === 'publish' && updated ? h("div", {
    className: "ib-hint"
  }, tx('קובץ ישן באותו שם עובר ל-@ver ולא נמחק')) : null
```

  - Delete the now unused `const nonPdf = …` line.
  - After `slotHint('updated')`, add the layout note:

```js
, mode === 'publish' && prop && (prop.layoutFrom === 'detected' || prop.layoutFrom === 'convention') ? h("div", {
    className: "ib-hint"
  }, "המבנה זוהה מהתיקיות. לשמירה: הגדרות הפרויקט ← תיקיות הפרויקט ← פרסום") : null
```

- [ ] **Step 5: Each file's type and folder.** In the plan's file list (`plan.files.map((f, i) => h("li", { key: i }, h("div", { className: "ib-pname", dir: "ltr" }, f.name), …`), replace `h("div", { className: "ib-pname", dir: "ltr" }, f.name)` with:

```js
h("div", {
    className: "ib-prow"
  }, h("span", {
    className: "ib-pname",
    dir: "ltr"
  }, f.name), mode === 'publish' && prop.types && prop.types.length ? h("select", {
    className: "fm-pick ib-type",
    value: f.type || '',
    disabled: locked,
    title: tx('סוג הקובץ'),
    onChange: e => setTypeOf(m => ({
      ...m,
      [f.n]: e.target.value
    }))
  }, prop.types.map(t => h("option", {
    key: t,
    value: t
  }, t))) : null, mode === 'publish' && sent ? overrides[f.n] != null ? h("button", {
    type: "button",
    className: "ib-link",
    disabled: locked,
    onClick: () => setOverrides(m => {
      const o = {
        ...m
      };
      delete o[f.n];
      return o;
    })
  }, "בטל שינוי") : h("button", {
    type: "button",
    className: "ib-link",
    disabled: locked,
    onClick: () => setPicking(picking === f.n ? null : f.n)
  }, "שנה") : null), picking === f.n ? h("select", {
    className: "fm-pick ib-dest-pick",
    value: "",
    "data-i18n-skip": "",
    onChange: e => {
      const v = e.target.value;
      if (!v) return;
      setOverrides(m => ({
        ...m,
        [f.n]: v
      }));
      setPicking(null);
    }
  }, h("option", {
    value: ""
  }, tx('בחר תיקייה ל-SENT של הקובץ הזה')), (prop.folders || []).map(p => h("option", {
    key: p,
    value: p
  }, fmSlash(p)))) : null, f.problem === 'dest' ? h("div", {
    className: "ib-hint ib-warn"
  }, "התיקייה שנבחרה כבר לא נמצאת — בחר שוב") : null
```

- [ ] **Step 6: 📂 after filing, labelled.** In the done view, replace the `done.rels.length ? h("ul", { className: "ib-sub ib-dirs", … }, done.rels.map(p => h("li", { key: p }, h("button", { type: "button", className: "ib-open", …}, "📂"), fmSlash(p)))) : null` expression with:

```js
done.rels.length ? h("div", {
    className: "ib-sub"
  }, h("div", {
    className: "ib-sub-lbl"
  }, done.rels.length === 1 ? tx('התיקייה שתויקו אליה הקבצים:') : tx('התיקיות שתויקו אליהן הקבצים:')), h("ul", {
    className: "ib-dirs",
    dir: "ltr",
    "data-i18n-skip": ""
  }, done.rels.map(p => h("li", {
    key: p
  }, h("button", {
    type: "button",
    className: "np-btn ib-open-btn",
    disabled: opening,
    onClick: () => openFolder(p)
  }, "📂 ", tx('פתח')), " ", fmSlash(p))))) : null
```

  Then check why the list was empty in the Library publish of 28.10:
  - In the browser check (Task 9), publish with the stand-in helper and run `javascript_tool` on the done state. Did `r.files[i].paths` arrive?
  - **If it's empty:** log `r` in `done:` and fix the cause. The suspects:
    - a result with `dests` but no `paths` (the server builds `paths` in the `t.kind === 'inbox'` result branch);
    - QuickInbox replacing the window when the helper announces the inbox again right after the files left it (`show(nid)` / a new `key`).

    If it's the second, keep the done view: in QuickInbox, don't switch `id` while the current window's phase is `done`. Pass an `onDoneChange` flag up, or ignore `look()` results while `doneRef.current` is set.
  - Add a regression check for what you found to the Task 9 browser script.

- [ ] **Step 7: CSS.** Find `.ib-dirs` (or `.ib-open`) in the `<style>` block and add:

```css
.ib-desc{flex:1 1 160px;min-width:0;}
.ib-prow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
.ib-type{font-size:12px;padding:1px 4px;}
.ib-link{background:none;border:none;color:var(--accent,#2563EB);cursor:pointer;font-size:12px;padding:0;}
.ib-dest-pick{width:100%;margin:4px 0;}
.ib-open-btn{font-size:12px;padding:2px 8px;}
```

- [ ] **Step 8: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(project-hub): filing window — day folder description, type per file, a folder per file, labelled open buttons"
```

---

### Task 8: English for every new string

**Files:**
- Modify: `i18n-dict.js` (append to the last `Object.assign` chunk, before its closing `});`)

- [ ] **Step 1: Add the entries**

```js
"פרסום": "Publishing",
"מבנה התיקיות של SENT ו-UPDATED בפרויקט הזה: התיקייה, ואחריה רמה לכל תיקייה בדרך — לפי סוג קובץ, שנה או יום. \"מלא אוטומטית\" מזהה אותו מהתיקיות הקיימות.": "The folder layout of SENT and UPDATED in this project: the folder, then a level for each folder on the way — by file type, year or day. \"Fill in automatically\" recognizes it from the existing folders.",
"סוג קובץ": "File type",
"שנה": "Year",
"יום": "Day",
"+ רמה": "+ Level",
"למעלה": "Up",
"למטה": "Down",
"קובץ PDF מהיום ←": "A PDF from today →",
"<תיאור>": "<description>",
"תבנית ריקה": "Empty pattern",
"לתבנית חסר {t}": "The pattern is missing {t}",
"אותה רמה פעמיים": "The same level twice",
"תו שאסור בשם תיקייה": "A character not allowed in a folder name",
"כל השאר": "Everything else",
"סוגי קבצים": "File types",
"של הפרויקט": "This project's",
"של המשרד": "The office's",
"חזור לרשימת המשרד": "Back to the office list",
"התאם לפרויקט": "Customize for this project",
"ערוך את רשימת המשרד": "Edit the office list",
"רשימת המשרד — לכל הפרויקטים שאין להם רשימה משלהם:": "The office list — for every project without its own:",
"+ סוג": "+ Type",
"שמור את רשימת המשרד": "Save the office list",
"הרשימה לא תקינה: שם לכל סוג, בלי כפילויות, וסיומת בסוג אחד בלבד": "The list is not valid: a name for each type, no duplicates, and each extension in one type only",
"אחת הרמות בפרסום אינה תקינה — תקן את המסומן באדום.": "One of the publishing levels is not valid — fix what is marked in red.",
"תיאור לתיקיית היום (רשות)": "Description for the day folder (optional)",
"תיקייה קיימת מאותו יום: {d}": "An existing folder from that day: {d}",
"יש כבר תיקיות מהיום: {d} — בחר מהרשימה, או כתוב תיאור חדש": "There are already folders from that day: {d} — pick from the list, or type a new description",
"UPDATED (מחליף קובץ באותו שם)": "UPDATED (replaces a file of the same name)",
"המבנה זוהה מהתיקיות. לשמירה: הגדרות הפרויקט ← תיקיות הפרויקט ← פרסום": "The layout was recognized from the folders. To save it: Project settings → Project folders → Publishing",
"סוג הקובץ": "File type",
"בטל שינוי": "Undo change",
"בחר תיקייה ל-SENT של הקובץ הזה": "Choose a SENT folder for this file",
"התיקייה שנבחרה כבר לא נמצאת — בחר שוב": "The chosen folder is no longer there — choose again",
"התיקייה שתויקו אליה הקבצים:": "The folder the files were filed to:",
"התיקיות שתויקו אליהן הקבצים:": "The folders the files were filed to:",
"פתח": "Open"
```

Some keys may already exist ("שנה", "יום", "פתח", "למעלה", "למטה", "סוג קובץ", "בטל שינוי"). Before appending, check each with `grep -F '"<key>":' i18n-dict.js` and skip any that is there. A key that repeats inside one `Object.assign` call is a syntax-valid duplicate, but keep the dictionary clean.

- [ ] **Step 2: Run the extractor and its test**

Run: `node tools/i18n-extract.js | grep -E "פרסום|תבנית|רמה|תיאור|סוגי|רשימת המשרד|תויקו"`
Expected: no output (all translated).
Run: `node tools/i18n-extract.test.js`
Expected: `ALL TESTS PASSED`.

- [ ] **Step 3: Commit**

```bash
git add i18n-dict.js
git commit -m "i18n: the publish section and the filing window's new controls"
```

---

### Task 9: Deploy list, full tests, browser check

**Files:**
- Modify: `Deploy-Azure.ps1`

- [ ] **Step 1: Add the new server module to the deploy list.** In `Deploy-Azure.ps1`, find `"filing.js", "filing-ai.js", "filing-plan.js",` and make it `"filing.js", "filing-ai.js", "filing-plan.js", "filing-layout.js",`. Then check that nothing is missing:

```bash
grep -rhoE "require\('\./[a-z-]+'\)" tools/local-server/*.js | sort -u | sed "s/require('.\///;s/')//" | while read m; do grep -q "\"$m.js\"" Deploy-Azure.ps1 || echo "MISSING $m"; done
```

Expected: no output.

- [ ] **Step 2: Run every suite**

```bash
cd tools/local-server && node --test "test/*.test.js"
```

Expected: all pass, except the date-dependent tests in `mail.test.js` / `mcp.test.js` that already fail on master (check that the failing names are only those).

```bash
node --test "tests/*.test.js" "tools/spec-creator/test/*.test.js"
```

```bash
node tools/i18n-extract.test.js
```

- [ ] **Step 3: Browser check against a stand-in helper.**
  - **Setup:**
    - Add a temporary `filing-wt` entry to the **main repo's** `.claude/launch.json`: absolute paths to this worktree's `server.js` and root, port 3460, `env.DATA_DIR` in the scratchpad. Restore the file afterwards.
    - Seed `filing.json` with the project `ph01` mapped to a folder.
    - Run a stand-in helper script that answers `tree` with the Library tree from Task 3 and `inbox` with each file's names.
  - **The publish section** (Project settings → Project folders):
    - "מלא אוטומטית" fills type ← year ← day;
    - the preview line;
    - a bad pattern turns red, and save is refused with the message;
    - save, then reload: the layout is kept;
    - "התאם לפרויקט" then "חזור לרשימת המשרד";
    - the office list editor saves.
  - **The filing window** (`/project_hub_01?quick=inbox&id=…`):
    - each file's path follows the layout;
    - a description typed is in the path;
    - an existing day's description is offered, and the hint says it exists;
    - a type changed moves the path;
    - "שנה" picks a folder and "בטל שינוי" undoes it;
    - UPDATED adds a path per type;
    - publish, then the done view lists the folders with "📂 פתח".
  - **Both languages:** switch to English (`localStorage.appLang = 'en'`) and check the same screens read in English and LTR.
  - **Console:** no errors.

- [ ] **Step 4: Commit**

```bash
git add Deploy-Azure.ps1
git commit -m "chore(deploy): ship filing-layout.js"
```

---

## Self-review notes

- **Spec coverage:**

  | Spec item | Task |
  |---|---|
  | Data model (`publish`, types) | 1, 4, 5 |
  | `detectLayout` | 2 |
  | `publishPlan` / migration | 3 |
  | Server routes | 5 |
  | Settings UI | 6 |
  | Window UI and 📂 | 7 |
  | i18n | 8 |
  | Tests and browser check | 1–5, 9 |

  `pick` is folded into `desc`, as stated at the top.
- **Names used across tasks:** `cleanPublish(raw, relPath)` → `{ publish } | { error, target, level }`; `layoutFor(map, tree, types)` → `{ layout, from }`; `publishPlan({...})` → `{ plan, days, slotsMissing? }`; the route adds `layoutFrom`, `types` (names) and `folders`. The page reads `prop.days`, `prop.types`, `prop.folders`, `prop.layoutFrom`, `f.type` and `f.problem`.
