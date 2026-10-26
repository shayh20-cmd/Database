# Filing without Claude — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The export inbox window and the Outlook pane build filing plans in code — from the project's saved folder map, its real folder tree and the person's choices — so everyday publishing and receiving costs no Claude API calls; Claude stays behind a "הצע" button.

**Architecture:** A new pure module `tools/local-server/filing-plan.js` builds plans in exactly the shape Claude's plans have, and every plan goes through the existing sanitizers (`sanitizeInboxPlan`, `sanitizeReceivePlan`, `sanitizePlan`) so the helper on the PC runs it unchanged. The folder map gains `slots` (SENT archive, split by type or not, UPDATED folder of PDFs). New server routes (`inbox-plan`, `map-auto`, `filing-options`, `filing-plan`) call the module after the helper has read the tree. The Hub page (`SettingsFoldersView`, `InboxBatch`) and the Outlook pane switch from automatic Claude proposals to code plans.

**Tech Stack:** Node 22/24 (no build step), `node:test`; the Hub page is Babel-compiled React (`React.createElement`), edited in that form; the Outlook pane is plain JS.

**Spec:** `docs/superpowers/specs/2026-10-26-filing-without-ai-design.md`

**Working directory:** the worktree `C:\Users\Omega\Claude Projects\project-hub\.claude\worktrees\filing-without-ai` (branch `feat/filing-without-ai`). All paths below are relative to it.

**Two decisions taken while planning (differences from the spec, both small):**
- Saving the map checks `slots` paths with `relPath` only (inside the project), like the map's areas today — no tree check on save. The window reports a slot whose folder is not in the tree (`slotsMissing: 'gone'`).
- A target whose slot is missing is not disabled in the window; its plan simply has no dests for it and a warning line says why.

---

## File structure

| File | Responsibility |
|---|---|
| `tools/local-server/filing-plan.js` (new) | Pure plan builders: `autoSlots`, `sentFolder`, `inboxPlan`, `nextVersion`, `receivePlan`, `senderConsultant`. No I/O. |
| `tools/local-server/filing-ai.js` | `cleanSlots`, `normalizeMap` keeps `slots`, `contactText`, EXEC in `receiveOptions`; Claude's publish prompt follows the slots and PDF-only UPDATED. |
| `tools/local-server/filing.js` | Routes: `map` (PUT) saves `slots`; `map-auto`; `inbox-plan`; pane `filing-options` and `filing-plan`. |
| `tools/local-server/outlook.js` | Two new POST routes for the pane. |
| `tools/local-server/test/filing-plan.test.js` (new) | Unit tests of `filing-plan.js`. |
| `tools/local-server/test/filing.test.js` | New integration tests appended (server + stand-in agent). |
| `project_hub_01.html` | `SettingsFoldersView` slots section + auto fill; `InboxBatch` code plans, date, PDF-only UPDATED, 📂 per folder, Claude behind "הצע"; CSS. |
| `outlook/taskpane.html` | Filing card: who sent / plans or documents / version / @ver, plan built on the server; Claude conversation inside "הצע עם Claude". |
| `i18n-dict.js` | English for every new Hebrew string of the Hub page. |
| `tools/file-helper/README.md` | One paragraph: filing without Claude. |

Run all server tests with:

```bash
cd tools/local-server && node --test "test/*.test.js"
```

---

## Part A — server

### Task 1: Map slots, contact text and EXEC in `filing-ai.js`

**Files:**
- Modify: `tools/local-server/filing-ai.js` (`normalizeMap` ~line 41, `receiveOptions` ~line 438, `module.exports` ~line 618)
- Test: `tools/local-server/test/filing-plan.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `tools/local-server/test/filing-plan.test.js`:

```js
'use strict';
// Filing without Claude: the plans built in code (filing-plan.js) and the map's slots (filing-ai.js).
// Run: node --test tools/local-server/test/filing-plan.test.js
const test = require('node:test');
const assert = require('node:assert');
const ai = require('../filing-ai');

test('filing-ai: the map keeps its slots — paths inside the project, SENT split by type unless said otherwise', () => {
  assert.deepStrictEqual(ai.cleanSlots(null), { sent: '', sentSplit: true, updated: '' });
  assert.deepStrictEqual(ai.cleanSlots({ sent: 'PUBLISH\\X-pub-@sent\\', sentSplit: false, updated: '../out', nope: 1 }), { sent: 'PUBLISH/X-pub-@sent', sentSplit: false, updated: '' });
  const m = ai.normalizeMap({ areas: { publish: { paths: ['PUBLISH'], note: '' } }, slots: { sent: 'PUBLISH/S', updated: 'PUBLISH/U' } });
  assert.deepStrictEqual(m.slots, { sent: 'PUBLISH/S', sentSplit: true, updated: 'PUBLISH/U' });
  assert.deepStrictEqual(ai.normalizeMap({ areas: {} }).slots, { sent: '', sentSplit: true, updated: '' });
});

test('filing-ai: a register contact reads "role · firm" (the name when there is no firm)', () => {
  assert.strictEqual(ai.contactText({ name: 'Avi', role: 'Electric', firm: 'Volt' }), 'Electric · Volt');
  assert.strictEqual(ai.contactText({ name: 'Mira', role: '', firm: '' }), 'Mira');
  assert.strictEqual(ai.contactText({ name: '', role: '', firm: '' }), '');
});

test('filing-ai: EXEC folders are offered with the receive and permit ones', () => {
  const tree = ['EXEC', 'EXEC/X-exec-rfi', 'EXEC/X-exec-submittals', 'RECEIVE', 'RECEIVE/X-receive-pm'];
  const o = ai.receiveOptions({ map: { areas: { receive: { paths: ['RECEIVE'], note: '' }, exec: { paths: ['EXEC'], note: '' } } }, tree, contacts: [], code: 'X' });
  assert.deepStrictEqual(o.others, [
    { label: 'receive-pm', folder: 'RECEIVE/X-receive-pm', area: 'receive' },
    { label: 'exec-rfi', folder: 'EXEC/X-exec-rfi', area: 'exec' },
    { label: 'exec-submittals', folder: 'EXEC/X-exec-submittals', area: 'exec' }
  ]);
  assert.strictEqual(o.unmapped.others, false);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test tools/local-server/test/filing-plan.test.js`
Expected: FAIL — `ai.cleanSlots is not a function`.

- [ ] **Step 3: Implement**

In `tools/local-server/filing-ai.js`, replace `normalizeMap`:

```js
/* A saved map as it is read today: old keys migrated, the seven areas cleaned (paths inside the project) */
function normalizeMap(map) {
  if (!map || typeof map !== 'object' || !map.areas) return map || null;
  return { ...map, areas: cleanAreas(map.areas, rel => rel || null) };
}
```

with:

```js
/* A saved map as it is read today: old keys migrated, the seven areas cleaned (paths inside the project), and the
   slots that filing without Claude goes by (cleanSlots) */
function normalizeMap(map) {
  if (!map || typeof map !== 'object' || !map.areas) return map || null;
  return { ...map, areas: cleanAreas(map.areas, rel => rel || null), slots: cleanSlots(map.slots) };
}
/* The map's slots for filing without Claude (filing-plan.js): the SENT archive, whether SENT is split into a folder per
   file type, and the UPDATED folder of PDFs — paths inside the project, '' when not mapped. */
function cleanSlots(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const path = v => relPath(v) || '';
  return { sent: path(r.sent), sentSplit: r.sentSplit !== false, updated: path(r.updated) };
}
```

(`relPath` is a function declaration further down the file, so it is hoisted.)

In `receiveOptions`, replace the line that builds `text`:

```js
    const text = [String(c.role || '').trim(), String(c.firm || '').trim() || String(c.name || '').trim()].filter(Boolean).join(' · ').replace(/[\r\n]+/g, ' ').slice(0, 120);
```

with:

```js
    const text = contactText(c);
```

and add above `function receiveOptions`:

```js
/* A register contact as the window shows it: "role · firm", the name when there is no firm */
const contactText = c => [String(c.role || '').trim(), String(c.firm || '').trim() || String(c.name || '').trim()].filter(Boolean).join(' · ').replace(/[\r\n]+/g, ' ').slice(0, 120);
```

In `receiveOptions`, replace:

```js
  const rp = (areas.receive && areas.receive.paths) || [], pp = (areas.permit && areas.permit.paths) || [];
  const others = [
    ...under(rp).map(folder => ({ label: short(folder), folder, area: 'receive' })),
    ...under(pp).map(folder => ({ label: short(folder), folder, area: 'permit' }))
  ].filter((x, i, a) => a.findIndex(y => y.folder.toLowerCase() === x.folder.toLowerCase()) === i);
  const noOthers = !rp.length && !pp.length;
```

with:

```js
  const rp = (areas.receive && areas.receive.paths) || [], pp = (areas.permit && areas.permit.paths) || [], ep = (areas.exec && areas.exec.paths) || [];
  const others = [
    ...under(rp).map(folder => ({ label: short(folder), folder, area: 'receive' })),
    ...under(pp).map(folder => ({ label: short(folder), folder, area: 'permit' })),
    ...under(ep).map(folder => ({ label: short(folder), folder, area: 'exec' }))
  ].filter((x, i, a) => a.findIndex(y => y.folder.toLowerCase() === x.folder.toLowerCase()) === i);
  const noOthers = !rp.length && !pp.length && !ep.length;
```

Update the comment above `receiveOptions` ("others = the folders directly under the receive and permit areas") to say "receive, permit and exec areas".

In `module.exports`, add `cleanSlots, contactText` to the second line:

```js
  cleanAreas, cleanSlots, contactText, mapContent, mapProposal, sanitizeInboxPlan, inboxContent, inboxProposal, receiveOptions, sanitizeReceivePlan, receiveContent, receiveProposal
```

- [ ] **Step 4: Run the tests**

Run: `node --test tools/local-server/test/filing-plan.test.js` → PASS.
Run: `node --test tools/local-server/test/filing.test.js` → PASS (no existing expectation changes: the existing maps have no `exec`, and saved maps are compared with what the server returns).

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-ai.js tools/local-server/test/filing-plan.test.js
git commit -m "feat(filing): map slots for filing without Claude; EXEC folders offered on receive"
```

---

### Task 2: `autoSlots` — the convention found in the tree

**Files:**
- Create: `tools/local-server/filing-plan.js`
- Test: `tools/local-server/test/filing-plan.test.js`

- [ ] **Step 1: Write the failing test** (append to `filing-plan.test.js`)

```js
const plans = require('../filing-plan');

const CONV = [
  'PUBLISH', 'PUBLISH/4021-pub-@sent', 'PUBLISH/4021-pub-@sent/4021-pub-sent-2026', 'PUBLISH/4021-pub-@sent/4021-pub-sent-2026/4021-pub-2026,10,01',
  'PUBLISH/4021-pub-@sent/4021-pub-sent-2026/4021-pub-2026,10,01/PDF', 'PUBLISH/4021-pub-updated', 'PUBLISH/4021-pub-updated/4021-pub-updated-PDF',
  'CONSULTANTS', 'CONSULTANTS/4021-KONS', 'RECIEVE', 'PERMIT', 'EXEC', 'WORK'
];

test('filing-plan: the convention found in a tree — SENT archive, UPDATED of PDFs, split by type, the areas', () => {
  assert.deepStrictEqual(plans.autoSlots(CONV), {
    slots: { sent: 'PUBLISH/4021-pub-@sent', sentSplit: true, updated: 'PUBLISH/4021-pub-updated/4021-pub-updated-PDF' },
    areas: { publish: ['PUBLISH'], consultants: ['CONSULTANTS'], receive: ['RECIEVE'], permit: ['PERMIT'], exec: ['EXEC'] }
  });
  // day folders without type folders: SENT is kept together; day folders right in the archive count too
  const flat = ['P', 'P/X-pub-@sent', 'P/X-pub-@sent/X-pub-2026,09,30', 'P/X-pub-@sent/X-pub-2026,09,30/a'];
  assert.strictEqual(plans.autoSlots(flat).slots.sentSplit, false);
  // nothing by the convention: empty, split by default; areas one level down count, in any case
  assert.deepStrictEqual(plans.autoSlots(['old', 'old/Receive', 'x/y/permit']), { slots: { sent: '', sentSplit: true, updated: '' }, areas: { receive: ['old/Receive'] } });
  assert.deepStrictEqual(plans.autoSlots(null), { slots: { sent: '', sentSplit: true, updated: '' }, areas: {} });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tools/local-server/test/filing-plan.test.js`
Expected: FAIL — `Cannot find module '../filing-plan'`.

- [ ] **Step 3: Implement** — create `tools/local-server/filing-plan.js`:

```js
'use strict';
/* Filing without Claude: the plans the export inbox window and the Outlook pane build in code, from the project's
   saved folder map (map.slots and its areas), its real tree (read by the helper on the PC) and the person's choices.
   Each plan has the shape Claude's plans have and goes through the same checks (sanitizeInboxPlan /
   sanitizeReceivePlan), so the PC runs it exactly as it runs Claude's. Claude stays behind "הצע".
   Spec: docs/superpowers/specs/2026-10-26-filing-without-ai-design.md */
const ai = require('./filing-ai');

const lc = s => String(s == null ? '' : s).toLowerCase();
const leafOf = p => p.slice(p.lastIndexOf('/') + 1);
// the folders directly inside dir ('' is the project's top)
const kids = (tree, dir) => tree.filter(p => dir === '' ? !p.includes('/') : lc(p).startsWith(lc(dir) + '/') && !p.slice(dir.length + 1).includes('/'));
// a folder of the tree, in the tree's own spelling (any case), or null
const inTree = (tree, p) => tree.find(t => lc(t) === lc(p)) || null;
const YEAR = /-sent-(\d{4})$/i;              // a year folder of the SENT archive: <code>-pub-sent-YYYY
const DAY = /(\d{4}),(\d{2}),(\d{2})$/;      // a day folder: <code>-pub-YYYY,MM,DD
const TYPES = ['PDF', 'DWG', 'RVT', 'DOCS'];

/* What the office's convention (Folder Manager) finds in a project's tree, for the map: the SENT archive (…-pub-@sent),
   the UPDATED folder of PDFs (…-pub-updated-PDF), whether SENT is split by file type (its day folders hold PDF / DWG /
   RVT / DOCS folders; split when there are no day folders yet), and the areas by their usual names, at the top or one
   level down. Only what is found is returned; the page fills empty fields with it and saves nothing by itself. */
const AREA_NAMES = { publish: ['publish'], consultants: ['consultants'], receive: ['recieve', 'receive'], permit: ['permit'], exec: ['exec'] };
function autoSlots(tree) {
  const list = (tree || []).filter(Boolean);
  const ending = suffix => list.find(p => lc(leafOf(p)).endsWith(suffix)) || '';
  const sent = ending('-pub-@sent');
  const updated = ending('-pub-updated-pdf');
  let sentSplit = true;
  if (sent) {
    const under = kids(list, sent);
    const days = [...under.filter(p => DAY.test(leafOf(p))), ...under.filter(p => YEAR.test(leafOf(p))).flatMap(y => kids(list, y).filter(p => DAY.test(leafOf(p))))];
    if (days.length) sentSplit = days.some(d => kids(list, d).some(k => TYPES.includes(leafOf(k).toUpperCase())));
  }
  const areas = {};
  for (const [k, names] of Object.entries(AREA_NAMES)) {
    const p = list.find(x => x.split('/').length <= 2 && names.includes(lc(leafOf(x))));
    if (p) areas[k] = [p];
  }
  return { slots: { sent, sentSplit, updated }, areas };
}

module.exports = { autoSlots };
```

- [ ] **Step 4: Run the test** → `node --test tools/local-server/test/filing-plan.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-plan.js tools/local-server/test/filing-plan.test.js
git commit -m "feat(filing): find the SENT archive, UPDATED and the areas by the office convention"
```

---

### Task 3: The publish plan — `sentFolder` and `inboxPlan`

**Files:**
- Modify: `tools/local-server/filing-plan.js`
- Test: `tools/local-server/test/filing-plan.test.js`

- [ ] **Step 1: Write the failing tests** (append)

```js
const SLOTS = { sent: 'PUBLISH/4021-pub-@sent', sentSplit: true, updated: 'PUBLISH/4021-pub-updated/4021-pub-updated-PDF' };
const F = [{ n: 0, name: 'A-101.pdf' }, { n: 1, name: 'A-102.PDF' }, { n: 2, name: 'A-101.dwg' }, { n: 3, name: 'notes.txt' }];
const Y = 'PUBLISH/4021-pub-@sent/4021-pub-sent-2026';

test('filing-plan: the day folder of SENT — the year layer when in use (or nothing there yet), a day folder already there', () => {
  assert.deepStrictEqual(plans.sentFolder(CONV, SLOTS.sent, '4021', '2026-10-26'), { path: Y + '/4021-pub-2026,10,26', mkdir: [Y + '/4021-pub-2026,10,26'] });
  assert.deepStrictEqual(plans.sentFolder(CONV, SLOTS.sent, '4021', '2026-10-01'), { path: Y + '/4021-pub-2026,10,01', mkdir: [] });
  assert.deepStrictEqual(plans.sentFolder(CONV, SLOTS.sent, '4021', '2027-01-05'), {
    path: 'PUBLISH/4021-pub-@sent/4021-pub-sent-2027/4021-pub-2027,01,05',
    mkdir: ['PUBLISH/4021-pub-@sent/4021-pub-sent-2027', 'PUBLISH/4021-pub-@sent/4021-pub-sent-2027/4021-pub-2027,01,05']
  });
  // day folders right in the archive: no year layer
  const flat = ['P', 'P/S', 'P/S/X-pub-2026,09,30'];
  assert.deepStrictEqual(plans.sentFolder(flat, 'P/S', 'X', '2026-10-26'), { path: 'P/S/X-pub-2026,10,26', mkdir: ['P/S/X-pub-2026,10,26'] });
  // an empty archive: the convention, with the year layer; no code: no prefix
  assert.deepStrictEqual(plans.sentFolder(['S'], 'S', '', '2026-10-26'), { path: 'S/pub-sent-2026/pub-2026,10,26', mkdir: ['S/pub-sent-2026', 'S/pub-sent-2026/pub-2026,10,26'] });
});

test('filing-plan: publish — SENT by file type, UPDATED for PDFs only (replacing), through the inbox checks', () => {
  const r = plans.inboxPlan({ slots: SLOTS, tree: CONV, code: '4021', files: F, sent: true, updated: true, date: '2026-10-26' });
  const D = Y + '/4021-pub-2026,10,26';
  assert.deepStrictEqual(r.plan.steps.map(s => s.path), [D, D + '/PDF', D + '/DWG', D + '/DOCS']);
  assert.deepStrictEqual(r.plan.files, [
    { n: 0, name: 'A-101.pdf', dests: [{ path: D + '/PDF', replace: false }, { path: SLOTS.updated, replace: true }] },
    { n: 1, name: 'A-102.PDF', dests: [{ path: D + '/PDF', replace: false }, { path: SLOTS.updated, replace: true }] },
    { n: 2, name: 'A-101.dwg', dests: [{ path: D + '/DWG', replace: false }] },
    { n: 3, name: 'notes.txt', dests: [{ path: D + '/DOCS', replace: false }] }
  ]);
  assert.strictEqual(r.plan.mode, 'publish');
  assert.strictEqual(r.slotsMissing, undefined);
  // together: the day folder itself; a day folder that is there makes no steps
  const t = plans.inboxPlan({ slots: { ...SLOTS, sentSplit: false }, tree: CONV, code: '4021', files: F.slice(2, 3), sent: true, updated: false, date: '2026-10-01' });
  assert.deepStrictEqual([t.plan.steps, t.plan.files[0].dests], [[], [{ path: Y + '/4021-pub-2026,10,01', replace: false }]]);
  // an existing type folder is not made again
  const p = plans.inboxPlan({ slots: SLOTS, tree: CONV, code: '4021', files: F.slice(0, 1), sent: true, updated: false, date: '2026-10-01' });
  assert.deepStrictEqual(p.plan.steps, []);
});

test('filing-plan: publish — a target whose folder is not mapped, or not in the tree any more, gets nothing and says so', () => {
  const r = plans.inboxPlan({ slots: { sent: '', sentSplit: true, updated: 'PUBLISH/gone' }, tree: CONV, code: '4021', files: F.slice(0, 1), sent: true, updated: true, date: '2026-10-26' });
  assert.deepStrictEqual(r.slotsMissing, { sent: 'unmapped', updated: 'gone' });
  assert.deepStrictEqual([r.plan.files[0].dests, r.plan.steps], [[], []]);
  // a target not chosen is not reported
  assert.strictEqual(plans.inboxPlan({ slots: null, tree: CONV, code: '4021', files: F, sent: false, updated: false, date: '2026-10-26' }).slotsMissing, undefined);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tools/local-server/test/filing-plan.test.js`
Expected: FAIL — `plans.sentFolder is not a function`.

- [ ] **Step 3: Implement** — in `filing-plan.js`, before `module.exports`:

```js
const pre = code => (code ? code + '-' : '');
const typeOf = name => { const m = /\.([^.]+)$/.exec(name); const x = m ? m[1].toUpperCase() : ''; return x === 'PDF' || x === 'DWG' || x === 'RVT' ? x : 'DOCS'; };
const isPdf = name => /\.pdf$/i.test(name);

/* The day's folder in the SENT archive and the folders to make for it, in order. The year layer (<code>-pub-sent-YYYY)
   is used when the archive has year folders, or nothing yet (the convention); when its day folders sit right in it,
   they keep doing so. A day folder that is already there (any name ending in YYYY,MM,DD) is used as it is. */
function sentFolder(tree, sent, code, date) {
  const [y, m, d] = date.split('-');
  const want = `${y},${m},${d}`;
  const under = kids(tree, sent);
  const years = under.filter(p => YEAR.test(leafOf(p)));
  const mkdir = [];
  let parent = sent;
  if (years.length || !under.some(p => DAY.test(leafOf(p)))) {
    const year = years.find(p => YEAR.exec(leafOf(p))[1] === y);
    parent = year || `${sent}/${pre(code)}pub-sent-${y}`;
    if (!year) mkdir.push(parent);
  }
  const day = mkdir.length ? null : kids(tree, parent).find(p => leafOf(p).endsWith(want));
  const path = day || `${parent}/${pre(code)}pub-${want}`;
  if (!day) mkdir.push(path);
  return { path, mkdir };
}

/* The publish plan: SENT into the day's folder (a folder per file type when the map says so), UPDATED for PDFs only,
   replacing a file of the same name there (the PC moves the old one to @ver). { plan, slotsMissing? } — a chosen target
   whose folder is not mapped ('unmapped') or no longer in the tree ('gone') gets no dests, and is reported. */
function inboxPlan({ slots, tree, code, files, sent, updated, date }) {
  const list = (tree || []).filter(Boolean);
  const s = slots || {};
  const missing = {};
  const target = (on, key) => {
    if (!on) return null;
    if (!s[key]) { missing[key] = 'unmapped'; return null; }
    const p = inTree(list, s[key]);
    if (!p) missing[key] = 'gone';
    return p;
  };
  const sentRoot = target(sent, 'sent'), upd = target(updated, 'updated');
  const steps = [], made = new Set();
  const mk = p => { if (!made.has(lc(p)) && !inTree(list, p)) { made.add(lc(p)); steps.push({ op: 'mkdir', path: p }); } };
  const day = sentRoot ? sentFolder(list, sentRoot, code, date) : null;
  if (day) day.mkdir.forEach(mk);
  const raw = { steps, files: [] };
  for (const f of files || []) {
    const dests = [];
    if (day) {
      const typed = `${day.path}/${typeOf(f.name)}`;
      const to = s.sentSplit === false ? day.path : inTree(list, typed) || typed;
      mk(to);
      dests.push({ path: to, replace: false });
    }
    if (upd && isPdf(f.name)) dests.push({ path: upd, replace: true });
    raw.files.push({ name: f.name, dests });
  }
  const plan = ai.sanitizeInboxPlan(raw, list, files, upd ? [upd] : [], null);
  return { plan, ...(Object.keys(missing).length ? { slotsMissing: missing } : {}) };
}
```

Change `module.exports` to:

```js
module.exports = { autoSlots, sentFolder, inboxPlan };
```

- [ ] **Step 4: Run the tests** → `node --test tools/local-server/test/filing-plan.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-plan.js tools/local-server/test/filing-plan.test.js
git commit -m "feat(filing): publish plan in code — SENT by day (split or together), UPDATED for PDFs"
```

---

### Task 4: The receive plan — `nextVersion`, `receivePlan`, `senderConsultant`

**Files:**
- Modify: `tools/local-server/filing-plan.js`
- Test: `tools/local-server/test/filing-plan.test.js`

- [ ] **Step 1: Write the failing tests** (append)

```js
const KP = 'CONSULTANTS/4021-KONS/4021-KONS-plans';
const RT = ['CONSULTANTS', 'CONSULTANTS/4021-KONS', KP, KP + '/4021-KONS-plans-v02', KP + '/4021-KONS-plans-v03', KP + '/4021-KONS-plans-@ver', 'CONSULTANTS/4021-KONS/4021-KONS-docs',
  'CONSULTANTS/4021-ELEC', 'CONSULTANTS/4021-ELEC/ELEC-V7', 'CONSULTANTS/4021-HVAC', 'CONSULTANTS/4021-HVAC/4021-HVAC-plans', 'CONSULTANTS/4021-HVAC/4021-HVAC-plans/גרסה 3',
  'CONSULTANTS/4021-WATER', 'CONSULTANTS/4021-WATER/w-v009', 'PERMIT', 'PERMIT/4021-permit-fire'];
const PF = [{ n: 0, name: 'K-101.pdf' }, { n: 1, name: 'K-102.dwg' }];
const cons = folder => ({ kind: 'consultant', folder, name: 'x' });

test('filing-plan: the next version follows the versions there — same name, one up, same digits', () => {
  assert.deepStrictEqual(plans.nextVersion(RT, 'CONSULTANTS/4021-KONS', '4021'), { dir: KP, make: false, name: '4021-KONS-plans-v04', editable: false, prev: KP + '/4021-KONS-plans-v03', ver: KP + '/4021-KONS-plans-@ver', verName: '4021-KONS-plans-@ver' });
  const e = plans.nextVersion(RT, 'CONSULTANTS/4021-ELEC', '4021');   // versions right in the consultant's folder, a capital V
  assert.deepStrictEqual([e.dir, e.name, e.prev, e.ver, e.verName], ['CONSULTANTS/4021-ELEC', 'ELEC-V8', 'CONSULTANTS/4021-ELEC/ELEC-V7', '', 'ELEC-@ver']);
  assert.strictEqual(plans.nextVersion(RT, 'CONSULTANTS/4021-WATER', '4021').name, 'w-v010');
  // folders there, none named …-vNN: the name is the person's to type, suggested by the convention
  assert.deepStrictEqual(plans.nextVersion(RT, 'CONSULTANTS/4021-HVAC', '4021'), { dir: 'CONSULTANTS/4021-HVAC/4021-HVAC-plans', make: false, name: '4021-HVAC-plans-v01', editable: true, prev: '', ver: '', verName: '' });
  // nothing yet: <code>-<consultant>-plans/…-v01, the plans folder made too
  assert.deepStrictEqual(plans.nextVersion(['C', 'C/4021-SAFE'], 'C/4021-SAFE', '4021'), { dir: 'C/4021-SAFE/4021-SAFE-plans', make: true, name: '4021-SAFE-plans-v01', editable: false, prev: '', ver: '', verName: '' });
});

test('filing-plan: receive — a consultant\'s plans as a new version, the current one to @ver when chosen', () => {
  const V4 = KP + '/4021-KONS-plans-v04';
  const r = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-KONS'), doc: 'plan', files: PF });
  assert.deepStrictEqual(r.plan.steps, [
    { op: 'mkdir', path: V4, from: '', to: '' },
    { op: 'move', path: '', from: KP + '/4021-KONS-plans-v03', to: KP + '/4021-KONS-plans-@ver/4021-KONS-plans-v03' }
  ]);
  assert.deepStrictEqual(r.plan.files.map(f => f.dests), [[{ path: V4, replace: false }], [{ path: V4, replace: false }]]);
  assert.deepStrictEqual(r.version, { name: '4021-KONS-plans-v04', editable: false, prev: KP + '/4021-KONS-plans-v03', hasVer: true, toVer: true });
  assert.strictEqual(r.problem, undefined);
  // the person unticks the move
  assert.deepStrictEqual(plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-KONS'), doc: 'plan', toVer: false, files: PF }).plan.steps.map(s => s.op), ['mkdir']);
  // no @ver folder there: off unless ticked; ticked → the @ver folder is made first
  const e = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-ELEC'), doc: 'plan', files: PF });
  assert.deepStrictEqual([e.plan.steps.map(s => s.op), e.version.toVer], [['mkdir'], false]);
  const et = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-ELEC'), doc: 'plan', toVer: true, files: PF });
  assert.deepStrictEqual(et.plan.steps.map(s => s.op + ' ' + (s.path || s.to)), ['mkdir CONSULTANTS/4021-ELEC/ELEC-V8', 'mkdir CONSULTANTS/4021-ELEC/ELEC-@ver', 'move CONSULTANTS/4021-ELEC/ELEC-@ver/ELEC-V7']);
});

test('filing-plan: receive — a typed version name where the versions are not …-vNN; no @ver then', () => {
  const H = 'CONSULTANTS/4021-HVAC/4021-HVAC-plans';
  const r = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-HVAC'), doc: 'plan', versionName: 'גרסה 4', toVer: true, files: PF });
  assert.deepStrictEqual([r.plan.steps.map(s => s.op + ' ' + s.path), r.plan.files[0].dests[0].path], [['mkdir ' + H + '/גרסה 4'], H + '/גרסה 4']);
  assert.deepStrictEqual(r.version, { name: '4021-HVAC-plans-v01', editable: true, prev: '', hasVer: false, toVer: false });
  // nothing typed: the suggestion; a bad or taken name: nothing to file, said
  assert.strictEqual(plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-HVAC'), doc: 'plan', files: PF }).plan.files[0].dests[0].path, H + '/4021-HVAC-plans-v01');
  for (const bad of ['a/b', '..', 'גרסה 3', 'x?']) {
    const b = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-HVAC'), doc: 'plan', versionName: bad, files: PF });
    assert.deepStrictEqual([b.problem, b.plan.files[0].dests, b.plan.steps], ['name', [], []], bad);
  }
  // a typed name is ignored where the name is not the person's to choose
  assert.strictEqual(plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-KONS'), doc: 'plan', versionName: 'mine', files: PF }).plan.files[0].dests[0].path, KP + '/4021-KONS-plans-v04');
});

test('filing-plan: receive — documents, a new consultant, another party; what is missing is said', () => {
  const d = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-KONS'), doc: 'doc', files: PF });
  assert.deepStrictEqual([d.plan.steps, d.plan.files[0].dests], [[], [{ path: 'CONSULTANTS/4021-KONS/4021-KONS-docs', replace: false }]]);
  const nd = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-ELEC'), doc: 'doc', files: PF });
  assert.deepStrictEqual(nd.plan.steps.map(s => s.path), ['CONSULTANTS/4021-ELEC/4021-ELEC-docs']);
  const fresh = plans.receivePlan({ tree: ['C', 'C/4021-SAFE'], code: '4021', from: cons('C/4021-SAFE'), doc: 'plan', files: PF });
  assert.deepStrictEqual(fresh.plan.steps.map(s => s.path), ['C/4021-SAFE/4021-SAFE-plans', 'C/4021-SAFE/4021-SAFE-plans/4021-SAFE-plans-v01']);
  const o = plans.receivePlan({ tree: RT, code: '4021', from: { kind: 'other', folder: 'permit/4021-PERMIT-FIRE', name: 'fire' }, doc: '', files: PF });
  assert.deepStrictEqual([o.plan.steps, o.plan.files[1].dests], [[], [{ path: 'PERMIT/4021-permit-fire', replace: false }]]);
  const problem = x => plans.receivePlan({ tree: RT, code: '4021', files: PF, doc: 'plan', ...x }).problem;
  assert.strictEqual(problem({ from: null }), 'no_from');
  assert.strictEqual(problem({ from: { kind: 'consultant' } }), 'no_consultant');
  assert.strictEqual(problem({ from: { kind: 'consultant', folder: '', name: 'Electric · Volt' } }), 'consultant_folder');
  assert.strictEqual(problem({ from: cons('NOT/THERE') }), 'consultant_folder');
  assert.strictEqual(problem({ from: cons('CONSULTANTS/4021-KONS'), doc: '' }), 'no_doc');
  assert.strictEqual(problem({ from: { kind: 'other', folder: '' } }), 'other_folder');
});

test('filing-plan: the sender\'s address picks the consultant whose folder matched its register contact', () => {
  const contacts = [{ name: 'Avi', role: 'Electric', firm: 'Volt', emails: ['Avi@Volt.co.il'] }, { name: 'Dan', role: 'Water', firm: 'Aqua', emails: ['dan@aqua.co'] }];
  const options = { consultants: [{ label: 'KONS', folder: 'C/4021-KONS', contact: '' }, { label: 'ELEC', folder: 'C/4021-ELEC', contact: 'Electric · Volt' }, { label: 'Water · Aqua', folder: null, contact: 'Water · Aqua' }] };
  assert.strictEqual(plans.senderConsultant(options, contacts, 'avi@volt.co.il '), 1);
  assert.strictEqual(plans.senderConsultant(options, contacts, 'dan@aqua.co'), -1, 'a consultant without a folder is not picked');
  assert.strictEqual(plans.senderConsultant(options, contacts, 'nobody@x.com'), -1);
  assert.strictEqual(plans.senderConsultant(options, contacts, ''), -1);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tools/local-server/test/filing-plan.test.js`
Expected: FAIL — `plans.nextVersion is not a function`.

- [ ] **Step 3: Implement** — in `filing-plan.js`, before `module.exports`:

```js
const VERSION = /^(.*)-(v)(\d{1,4})$/i; // as filing-ai's VERSION (and the PC's), with the v kept as written
const isVersion = p => VERSION.test(leafOf(p)) && !/@ver/i.test(leafOf(p));
// a consultant's short name, as receiveOptions shows it: the folder's name without the project code in front
const shortOf = (folder, code) => { const l = leafOf(folder); return code && lc(l).startsWith(lc(code) + '-') && l.length > code.length + 1 ? l.slice(code.length + 1) : l; };

/* Where a consultant's next plan version goes: its …-plans folder (or the consultant's folder itself when the versions
   sit there), the next name after the highest …-vNN there (same name, same v, at least the same digits), the version
   it follows (prev) and the @ver folder next to the versions (ver; verName: the one to make when there is none).
   No versions but other folders there: the name is the person's to type (editable), suggested by the convention.
   Nothing yet: <code>-<consultant>-plans/…-v01, the plans folder made too (make). */
function nextVersion(tree, folder, code) {
  const plansDir = kids(tree, folder).find(p => /-plans$/i.test(leafOf(p))) || null;
  let dir = plansDir;
  let versions = plansDir ? kids(tree, plansDir).filter(isVersion) : [];
  if (!versions.length && kids(tree, folder).some(isVersion)) { dir = folder; versions = kids(tree, folder).filter(isVersion); }
  if (!dir) {
    const conv = `${pre(code)}${shortOf(folder, code)}-plans`;
    return { dir: `${folder}/${conv}`, make: true, name: `${conv}-v01`, editable: false, prev: '', ver: '', verName: '' };
  }
  const ver = kids(tree, dir).find(p => /@ver/i.test(leafOf(p))) || '';
  if (!versions.length) {
    const others = kids(tree, dir).filter(p => !/@ver/i.test(leafOf(p)));
    return { dir, make: false, name: `${leafOf(dir)}-v01`, editable: others.length > 0, prev: '', ver, verName: '' };
  }
  const top = versions.map(p => ({ p, m: VERSION.exec(leafOf(p)) })).sort((a, b) => Number(b.m[3]) - Number(a.m[3]))[0];
  const num = String(Number(top.m[3]) + 1).padStart(top.m[3].length, '0');
  return { dir, make: false, name: `${top.m[1]}-${top.m[2]}${num}`, editable: false, prev: top.p, ver, verName: ver ? leafOf(ver) : `${top.m[1]}-@ver` };
}

/* The receive plan, from who sent the files (from: { kind: 'consultant' | 'other', folder, name }) and, for a consultant,
   doc 'plan' (a new version folder) or 'doc' (its …-docs folder, made when missing); another party's files go into its
   folder as it is. versionName: the typed name, used only where the name is the person's to choose; toVer: move the
   current version to @ver (undefined: when an @ver folder is there). { plan, version?, problem? } — problem names what
   is missing ('no_from', 'no_consultant', 'consultant_folder', 'no_doc', 'other_folder', 'name'), and then nothing is
   filed. Nothing is replaced; the only move is the current version into the @ver next to it. */
const nameOk = n => { const r = ai.relPath(n); return !!r && !r.includes('/'); };
function receivePlan({ tree, code, from, doc, versionName, toVer, files }) {
  const list = (tree || []).filter(Boolean);
  const plan = (steps, to) => ai.sanitizeReceivePlan({ steps, files: (files || []).map(f => ({ name: f.name, dests: to ? [{ path: to }] : [] })) }, list, files);
  const none = problem => ({ plan: plan([], null), problem });
  if (!from) return none('no_from');
  const folder = from.folder ? inTree(list, from.folder) : null;
  if (from.kind === 'other') return folder ? { plan: plan([], folder) } : none('other_folder');
  if (!folder) return none(from.folder || from.name ? 'consultant_folder' : 'no_consultant');
  if (doc === 'doc') {
    const docs = kids(list, folder).find(p => /-docs$/i.test(leafOf(p)));
    const to = docs || `${folder}/${pre(code)}${shortOf(folder, code)}-docs`;
    return { plan: plan(docs ? [] : [{ op: 'mkdir', path: to }], to) };
  }
  if (doc !== 'plan') return none('no_doc');
  const v = nextVersion(list, folder, code);
  const typed = String(versionName || '').trim();
  const name = v.editable && typed ? typed : v.name;
  const version = { name: v.name, editable: v.editable, prev: v.prev, hasVer: !!v.ver };
  if (!nameOk(name) || inTree(list, `${v.dir}/${name}`)) return { ...none('name'), version: { ...version, toVer: false } };
  const to = `${v.dir}/${name}`;
  const steps = [];
  if (v.make) steps.push({ op: 'mkdir', path: v.dir });
  steps.push({ op: 'mkdir', path: to });
  const move = !!v.prev && !v.editable && (toVer === undefined ? !!v.ver : toVer === true);
  if (move) {
    const ver = v.ver || `${v.dir}/${v.verName}`;
    if (!v.ver) steps.push({ op: 'mkdir', path: ver });
    steps.push({ op: 'move', from: v.prev, to: `${ver}/${leafOf(v.prev)}` });
  }
  return { plan: plan(steps, to), version: { ...version, toVer: move } };
}

/* The consultant the sender is: the register contact with the sender's address, and the consultant folder that contact
   was matched to (receiveOptions); -1 when none. */
function senderConsultant(options, contacts, email) {
  const e = lc(email).trim();
  if (!e || !options || !Array.isArray(options.consultants)) return -1;
  const c = (contacts || []).find(x => (x.emails || []).some(y => lc(y).trim() === e));
  if (!c) return -1;
  const text = lc(ai.contactText(c));
  return options.consultants.findIndex(x => x.folder && x.contact && lc(x.contact) === text);
}
```

Change `module.exports` to:

```js
module.exports = { autoSlots, sentFolder, inboxPlan, nextVersion, receivePlan, senderConsultant };
```

- [ ] **Step 4: Run the tests** → `node --test tools/local-server/test/filing-plan.test.js` → PASS.

  If the `'גרסה 3'` case of the bad names fails: it must fail because a folder of that name exists (`inTree`), not because of `relPath` — check the tree constant `RT` holds `CONSULTANTS/4021-HVAC/4021-HVAC-plans/גרסה 3`.

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-plan.js tools/local-server/test/filing-plan.test.js
git commit -m "feat(filing): receive plan in code — consultant versions as they are named, @ver by choice, documents, other parties"
```

---

### Task 5: Hub routes — map slots, `map-auto`, `inbox-plan`

**Files:**
- Modify: `tools/local-server/filing.js` (require ~line 36; `HUB_METHOD` ~line 720; inbox section ~lines 826–885; `map-propose` block ~line 889; `map` PUT ~lines 960–968)
- Test: `tools/local-server/test/filing.test.js` (append)

- [ ] **Step 1: Write the failing integration tests** — append to `tools/local-server/test/filing.test.js`:

```js
/* ── filing without Claude (filing-plan.js): the map's slots, the convention filled in, the window's plans in code ── */
const NC_TREE = [...PUB_TREE, 'PUBLISH/LDPB-pub-@sent/LDPB-pub-sent-2026/LDPB-pub-2026,10,01', 'PUBLISH/LDPB-pub-@sent/LDPB-pub-sent-2026/LDPB-pub-2026,10,01/PDF', ...RCV_TREE.filter(p => p !== 'PUBLISH'), 'EXEC', 'EXEC/LDPB-exec-rfi'];
const NC_SLOTS = { sent: 'PUBLISH/LDPB-pub-@sent', sentSplit: true, updated: 'PUBLISH/LDPB-pub-updated/LDPB-pub-updated-PDF' };

test('filing hub: the map keeps its slots; the convention is filled in from the tree, without Claude', async (t) => {
  const { base, data, keyOf, agent } = await start(t, 4061, {});
  const hub = async (route, body, method) => {
    const r = await fetch(base + '/api/filing-hub/' + route, { method: method || (body ? 'POST' : 'GET'), headers: { 'x-ms-client-principal': principal('dana@kkarc.com'), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  fs.writeFileSync(path.join(data, 'filing.json'), JSON.stringify({ projects: { pabc123: { folder: FOLDER, root: ROOT, guide: '', log: [] } } }));
  const dana = await keyOf('dana@kkarc.com');
  // saved with the areas; read back by the Hub page and the pane
  const saved = await hub('map', { projectId: 'pabc123', areas: { publish: { paths: ['PUBLISH'], note: '' } }, slots: { ...NC_SLOTS, sentSplit: false, updated: '..\\x' } }, 'PUT');
  assert.strictEqual(saved.status, 200);
  assert.deepStrictEqual(saved.body.map.slots, { sent: NC_SLOTS.sent, sentSplit: false, updated: '' });
  assert.deepStrictEqual((await hub('project?project=pabc123')).body.map.slots, saved.body.map.slots);
  // a save without slots (an older page) keeps them
  const again = await hub('map', { projectId: 'pabc123', areas: { publish: { paths: ['PUBLISH'], note: 'x' } } }, 'PUT');
  assert.deepStrictEqual(again.body.map.slots, saved.body.map.slots);
  // the convention: a mapping session, the tree from the PC, no Claude (none is configured here)
  const sid = (await hub('map-session', { projectId: 'pabc123' })).body.id;
  assert.strictEqual((await hub('map-auto?id=nope', {})).status, 404);
  const asking = hub('map-auto?id=' + sid, {});
  const a = await agent(dana);
  assert.strictEqual(a.got.kind, 'tree');
  await a.result({ tree: NC_TREE });
  const auto = (await asking).body;
  assert.deepStrictEqual(auto.auto.slots, NC_SLOTS);
  assert.deepStrictEqual(auto.auto.areas, { publish: ['PUBLISH'], receive: ['RECEIVE'], exec: ['EXEC'] });
  assert.strictEqual(auto.tree.length, NC_TREE.length);
});

test('filing inbox: the window\'s plan in code — publish to SENT and UPDATED, receive a consultant\'s version; confirmed as Claude\'s', async (t) => {
  const { base, data, keyOf, call, agent } = await start(t, 4062, {}); // no ANTHROPIC_API_KEY: Claude is not there at all
  const hubAs = email => async (route, body) => {
    const r = await fetch(base + '/api/filing-hub/' + route, { method: body ? 'POST' : 'GET', headers: { 'x-ms-client-principal': principal(email), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const hub = hubAs('dana@kkarc.com');
  const map = { ...RCV_MAP, areas: { ...RCV_MAP.areas, exec: { paths: ['EXEC'], note: '' } }, slots: NC_SLOTS, updatedBy: 'דנה', updatedAt: 'T' };
  fs.writeFileSync(path.join(data, 'filing.json'), JSON.stringify({ projects: { pabc123: { folder: FOLDER, root: ROOT, guide: '', log: [], map } } }));
  const dana = await keyOf('dana@kkarc.com'), ron = await keyOf('ron@kkarc.com');
  const id = (await call(dana, '/api/outlook/inbox-batch', { pc: 'PC1', files: [{ name: 'LDPB-A-101.pdf', size: 1, mtime: '' }, { name: 'LDPB-A-101.dwg', size: 1, mtime: '' }] })).body.id;

  // a viewer may not plan
  const rb = (await call(ron, '/api/outlook/inbox-batch', { pc: 'PC5', files: [{ name: 'a.pdf', size: 1, mtime: '' }] })).body.id;
  assert.strictEqual((await hubAs('ron@kkarc.com')('inbox-plan', { id: rb, projectId: 'pabc123', files: [0], sent: true })).status, 403);
  // publish: the tree from the PC that announced the batch, then the plan; a bad date is today's
  const planning = hub('inbox-plan', { id, projectId: 'pabc123', files: [0, 1], sent: true, updated: true, date: '2026-10-01' });
  await (await agent(dana)).result({ tree: NC_TREE });
  const p1 = await planning;
  assert.strictEqual(p1.status, 200);
  const D1 = 'PUBLISH/LDPB-pub-@sent/LDPB-pub-sent-2026/LDPB-pub-2026,10,01';
  assert.deepStrictEqual(p1.body.plan, {
    files: [
      { n: 0, name: 'LDPB-A-101.pdf', dests: [{ path: D1 + '/PDF', replace: false }, { path: NC_SLOTS.updated, replace: true }] },
      { n: 1, name: 'LDPB-A-101.dwg', dests: [{ path: D1 + '/DWG', replace: false }] }
    ],
    steps: [{ op: 'mkdir', path: D1 + '/DWG', from: '', to: '' }], mode: 'publish', projectId: 'pabc123'
  });
  const israel = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()).split('-');
  const p2 = await hub('inbox-plan', { id, projectId: 'pabc123', files: [1], sent: true, updated: false, date: 'yesterday' });
  assert.ok(p2.body.plan.files[0].dests[0].path.endsWith(`LDPB-pub-${israel.join(',')}/DWG`), JSON.stringify(p2.body.plan));

  // receive: a consultant's new version, the previous one to @ver (the default when an @ver folder is there)
  const V3 = SP + '/LDPB-structural-plans-v03', V4 = SP + '/LDPB-structural-plans-v04';
  const r1 = await hub('inbox-plan', { id, projectId: 'pabc123', files: [0, 1], mode: 'receive', from: { kind: 'consultant', folder: 'CONS/LDPB-structural', name: 'structural' }, doc: 'plan' });
  assert.deepStrictEqual(r1.body.version, { name: 'LDPB-structural-plans-v04', editable: false, prev: V3, hasVer: true, toVer: true });
  assert.deepStrictEqual(r1.body.plan.steps.map(s => s.op), ['mkdir', 'move']);
  assert.strictEqual(r1.body.plan.from, 'structural');
  const r2 = await hub('inbox-plan', { id, projectId: 'pabc123', files: [0], mode: 'receive', from: { kind: 'consultant', folder: 'CONS/LDPB-structural', name: 'structural' }, doc: 'plan', toVer: false });
  assert.deepStrictEqual(r2.body.plan.steps.map(s => s.op), ['mkdir']);
  const r3 = await hub('inbox-plan', { id, projectId: 'pabc123', files: [0], mode: 'receive', from: null });
  assert.deepStrictEqual([r3.body.problem, r3.body.plan.files[0].dests], ['no_from', []]);
  assert.deepStrictEqual((await hub('inbox-confirm', { id })).body, { error: 'no_plan' }, 'a plan with nothing to file is not confirmed');

  // the plan again, confirmed: the PC gets it as it would get Claude's
  const r4 = await hub('inbox-plan', { id, projectId: 'pabc123', files: [0, 1], mode: 'receive', from: { kind: 'consultant', folder: 'CONS/LDPB-structural', name: 'structural' }, doc: 'plan' });
  const task = (await hub('inbox-confirm', { id })).body.taskId;
  const a = await agent(dana);
  assert.deepStrictEqual([a.id, a.got.kind, a.got.plan], [task, 'inbox', r4.body.plan]);
  await a.result({ files: [{ name: 'LDPB-A-101.pdf', dests: ['LDPB-A-101.pdf'] }, { name: 'LDPB-A-101.dwg', dests: ['LDPB-A-101.dwg'] }], notInInbox: [], error: null });
  const log = JSON.parse(fs.readFileSync(path.join(data, 'filing.json'), 'utf8')).projects.pabc123.log;
  assert.deepStrictEqual(log.map(l => [l.file, l.dest, l.mode, l.from]), [['LDPB-A-101.pdf', V4, 'receive', 'structural'], ['LDPB-A-101.dwg', V4, 'receive', 'structural']]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test --test-name-pattern="without Claude|in code" tools/local-server/test/filing.test.js`
Expected: FAIL — `map.slots` is undefined (first test) and `inbox-plan` answers 404 (second).

- [ ] **Step 3: Implement** — in `tools/local-server/filing.js`:

After `const ai = require('./filing-ai');` add:

```js
const plans = require('./filing-plan');
```

In `HUB_METHOD`, add the two routes:

```js
  const HUB_METHOD = {
    project: 'GET', task: 'GET', pick: 'POST', open: 'POST', 'map-session': 'POST', 'map-propose': 'POST', 'map-auto': 'POST', map: 'PUT', guide: 'PUT',
    inbox: 'GET', 'inbox-options': 'GET', 'inbox-latest': 'GET', 'inbox-open': 'GET', 'pick-source': 'POST', 'inbox-propose': 'POST', 'inbox-plan': 'POST', 'inbox-confirm': 'POST', 'inbox-dismiss': 'POST'
  };
```

In the inbox section, change the comment line `// inbox-propose: the selected files, …` to:

```js
      // inbox-propose (Claude) and inbox-plan (code, filing-plan.js): the selected files, the chosen targets (publish) or
      // who sent them (receive); Claude also gets the person's instruction, the code the day of SENT, a typed version
      // name and the @ver choice
```

Inside that block's `try`, replace:

```js
        if (!client) { sendJson(res, 200, { ai: 'unavailable' }); return; }
        let out;
        const files = ns.sort((x, y) => x - y).map(n => ({ n, name: fileOf(n).name }));
        const guide = String(pr.guide || '').trim() || DEFAULT_GUIDE;
```

with:

```js
        const files = ns.sort((x, y) => x - y).map(n => ({ n, name: fileOf(n).name }));
        if (route === 'inbox-plan') {
          let out;
          if (receive) {
            const inTree = from && from.folder && h.tree.find(q => q.toLowerCase() === from.folder.toLowerCase());
            if (from) from.folder = inTree || '';
            out = plans.receivePlan({ tree: h.tree, code: project.code, from, doc, versionName: oneLine(body.versionName, 120), toVer: typeof body.toVer === 'boolean' ? body.toVer : undefined, files });
            out.plan.from = (from && from.name) || '';
          } else {
            const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) && !Number.isNaN(Date.parse(body.date)) ? body.date : israelToday();
            const map = ai.normalizeMap(pr.map);
            out = plans.inboxPlan({ slots: map && map.slots, tree: h.tree, code: project.code, files, sent: body.sent === true, updated: body.updated === true, date });
          }
          if (b.status !== 'new' || b.taskId || b.h !== h) { sendJson(res, 409, { error: 'changed' }); return; }
          out.plan.projectId = project.id;
          b.plan = out.plan;
          sendJson(res, 200, { plan: out.plan, ...(out.version ? { version: out.version } : {}), ...(out.slotsMissing ? { slotsMissing: out.slotsMissing } : {}), ...(out.problem ? { problem: out.problem } : {}) });
          return;
        }
        if (!client) { sendJson(res, 200, { ai: 'unavailable' }); return; }
        let out;
        const guide = String(pr.guide || '').trim() || DEFAULT_GUIDE;
```

(`inbox-confirm` refuses a plan with no dests — `!b.plan.files.some(x => x.dests.length)` — so a plan with a `problem` is never sent to the PC.)

After the whole `if (route === 'map-propose') { … }` block, add:

```js
    // the office's convention found in the session's tree (filing-plan.autoSlots), for the map: no Claude, nothing saved
    if (route === 'map-auto') {
      const m = maps.get(url.searchParams.get('id') || '');
      if (!m || m.who !== who) { sendJson(res, 404, { error: 'no_session' }); return; }
      if (m.busy) { sendJson(res, 409, { error: 'busy' }); return; }
      const mine = {};
      m.busy = mine;
      const release = () => { if (m.busy === mine) m.busy = false; };
      m.exp = Date.now() + TTL;
      try {
        const pr = known(m.projectId);
        if (!pr.folder) { sendJson(res, 200, { needsFolder: true }); return; }
        const no = await treeOf(m, pr, res, release, { mapId: m.id });
        if (no === 'gone') return;
        if (no) { sendJson(res, 200, no); return; }
        sendJson(res, 200, { auto: plans.autoSlots(m.tree), tree: m.tree });
      } finally {
        release();
      }
      return;
    }
```

Replace the end of `handleHub` (the `map` PUT):

```js
    const areas = ai.cleanAreas(body.areas, rel => rel || false);
    if (!areas) { sendJson(res, 400, { error: 'path' }); return; }
    const map = { areas, updatedBy: mcp.whoAmI(p.email, p.name).name, updatedAt: new Date().toISOString() };
    const d = load();
    projectOf(d, project.id).map = map;
    writeJsonAtomic(STORE, d);
    sendJson(res, 200, { map });
```

with:

```js
    const areas = ai.cleanAreas(body.areas, rel => rel || false);
    if (!areas) { sendJson(res, 400, { error: 'path' }); return; }
    const d = load();
    const pd = projectOf(d, project.id);
    // the slots for filing without Claude: as sent, or kept when a page that does not know them saves the areas
    const slots = ai.cleanSlots(body.slots !== undefined ? body.slots : (pd.map || {}).slots);
    const map = { areas, slots, updatedBy: mcp.whoAmI(p.email, p.name).name, updatedAt: new Date().toISOString() };
    pd.map = map;
    writeJsonAtomic(STORE, d);
    sendJson(res, 200, { map });
```

- [ ] **Step 4: Run the tests**

Run: `node --test --test-name-pattern="without Claude|in code" tools/local-server/test/filing.test.js` → PASS.
Run: `node --test tools/local-server/test/filing.test.js` → PASS (all).

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing.js tools/local-server/test/filing.test.js
git commit -m "feat(filing): Hub routes for filing without Claude — map slots, convention fill, inbox-plan"
```

---

### Task 6: Pane routes — `filing-options` and `filing-plan`

**Files:**
- Modify: `tools/local-server/filing.js` (`handlePane`, "the routes of one filing" — after `if (f.taskId) …` ~line 448)
- Modify: `tools/local-server/outlook.js:282` (`POST_ROUTES`)
- Test: `tools/local-server/test/filing.test.js` (append)

- [ ] **Step 1: Write the failing test** (append)

```js
test('filing: the pane\'s plan in code — who sent it (the sender\'s consultant first), the next version, confirmed and filed', async (t) => {
  const { base, data, keyOf, call, agent, contacts } = await start(t, 4063, {}); // no Claude
  const map = { ...RCV_MAP, slots: NC_SLOTS, updatedBy: 'דנה', updatedAt: 'T' };
  fs.writeFileSync(path.join(data, 'filing.json'), JSON.stringify({ projects: { pabc123: { folder: FOLDER, root: ROOT, guide: '', log: [], map } } }));
  assert.strictEqual((await contacts('dana@kkarc.com', 'reg-77', [{ name: 'Avi', role: 'Electric', firm: 'Volt', emails: ['avi@volt.co.il'] }])).status, 200);
  const dana = await keyOf('dana@kkarc.com');
  const mail = { ...MAIL, from: { name: 'Avi', email: 'Avi@Volt.co.il' } };
  const f = (await call(dana, '/api/outlook/filing', { projectId: 'pabc123', mail, files: [{ name: 'E-1.pdf', size: 5 }, { name: 'E-2.pdf', size: 5 }] })).body.id;
  assert.strictEqual((await call(dana, '/api/outlook/filing-options?id=' + f, null, 'GET')).status, 405);
  // the options: the tree is read on the PC; the sender's address picks the electric consultant
  const asking = call(dana, '/api/outlook/filing-options?id=' + f, {});
  await (await agent(dana)).result({ tree: [...RCV_TREE, 'CONS/LDPB-electric/LDPB-electric-plans', 'CONS/LDPB-electric/LDPB-electric-plans/LDPB-electric-plans-v01'] });
  const o = (await asking).body;
  assert.deepStrictEqual(o.consultants.map(x => x.folder), ['CONS/LDPB-structural', 'CONS/LDPB-electric']);
  assert.strictEqual(o.sender, 1);
  // the plan: v02, nothing to move (no @ver there unless ticked); the pane's shape — one folder per file
  const V2 = 'CONS/LDPB-electric/LDPB-electric-plans/LDPB-electric-plans-v02';
  const p = (await call(dana, '/api/outlook/filing-plan?id=' + f, { from: { kind: 'consultant', folder: 'CONS/LDPB-electric', name: 'electric' }, doc: 'plan' })).body;
  assert.deepStrictEqual(p, {
    plan: { files: [{ n: 0, name: 'E-1.pdf', dest: V2 }, { n: 1, name: 'E-2.pdf', dest: V2 }], steps: [{ op: 'mkdir', path: V2, from: '', to: '' }], mode: 'new-version' },
    version: { name: 'LDPB-electric-plans-v02', editable: false, prev: 'CONS/LDPB-electric/LDPB-electric-plans/LDPB-electric-plans-v01', hasVer: false, toVer: false }
  });
  const none = (await call(dana, '/api/outlook/filing-plan?id=' + f, { from: null })).body;
  assert.deepStrictEqual([none.problem, none.plan.files.map(x => x.dest)], ['no_from', [null, null]]);
  assert.deepStrictEqual((await call(dana, '/api/outlook/filing-confirm?id=' + f, {})).body, { error: 'no_plan' });
  // planned again and confirmed: the PC files the plan
  await call(dana, '/api/outlook/filing-plan?id=' + f, { from: { kind: 'consultant', folder: 'CONS/LDPB-electric', name: 'electric' }, doc: 'plan' });
  const task = (await call(dana, '/api/outlook/filing-confirm?id=' + f, {})).body.taskId;
  const a = await agent(dana);
  assert.deepStrictEqual([a.id, a.got.kind, a.got.plan.files.map(x => x.dest)], [task, 'file', [V2, V2]]);
  await a.result({ files: [{ name: 'E-1.pdf', dest: V2, savedAs: 'E-1.pdf' }, { name: 'E-2.pdf', dest: V2, savedAs: 'E-2.pdf' }] });
  const log = JSON.parse(fs.readFileSync(path.join(data, 'filing.json'), 'utf8')).projects.pabc123.log;
  assert.deepStrictEqual(log.map(l => [l.file, l.dest, l.mode]), [['E-1.pdf', V2, 'new-version'], ['E-2.pdf', V2, 'new-version']]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test --test-name-pattern="pane's plan in code" tools/local-server/test/filing.test.js`
Expected: FAIL — the POST to `filing-options` answers `{ error: 'Not found' }` (the route does not exist yet), so `o.consultants` is undefined. (The GET already answers 405: an unlisted pane route defaults to POST.)

- [ ] **Step 3: Implement**

In `tools/local-server/outlook.js`, add the two routes to `POST_ROUTES` (after `'/api/outlook/filing-propose'`):

```js
'/api/outlook/filing-propose', '/api/outlook/filing-options', '/api/outlook/filing-plan', '/api/outlook/filing-confirm',
```

In `tools/local-server/filing.js` `handlePane`, after:

```js
    const body = await json(req);
    if (over()) { sendJson(res, 410, { error: 'expired' }); return; }
    if (f.taskId) { sendJson(res, 409, { error: 'confirmed' }); return; }
```

add:

```js
    /* filing without Claude: the choices of who sent the files (filing-options: the project's consultants and other
       folders, and the consultant the sender is), and the plan built in code from them (filing-plan, filing-plan.js) —
       in the pane's shape, one folder per file, as Claude's plan in the pane has. The tree is the filing's, read once. */
    if (route === 'filing-options' || route === 'filing-plan') {
      if (f.busy) { sendJson(res, 409, { error: 'busy' }); return; }
      const mine = {};
      f.busy = mine;
      const release = () => { if (f.busy === mine) f.busy = false; };
      try {
        const pr = known(f.projectId);
        if (!pr.folder) { sendJson(res, 200, { needsFolder: true }); return; }
        const no = await treeOf(f, pr, res, release, { filingId: f.id });
        if (no === 'gone') return;
        if (no) { sendJson(res, 200, no); return; }
        if (route === 'filing-options') {
          const contacts = contactsOf(f.person, f.projectId);
          const o = ai.receiveOptions({ map: ai.normalizeMap(pr.map), tree: f.tree, contacts, code: f.project.code });
          sendJson(res, 200, { ...o, sender: plans.senderConsultant(o, contacts, f.mail.fromEmail) });
          return;
        }
        const fr = body.from && typeof body.from === 'object' && (body.from.kind === 'consultant' || body.from.kind === 'other') ? body.from : null;
        const from = fr ? { kind: fr.kind, folder: ai.relPath(fr.folder) || '', name: oneLine(fr.name, 120).trim() } : null;
        const doc = body.doc === 'plan' || body.doc === 'doc' ? body.doc : '';
        const out = plans.receivePlan({ tree: f.tree, code: f.project.code, from, doc, versionName: oneLine(body.versionName, 120), toVer: typeof body.toVer === 'boolean' ? body.toVer : undefined, files: f.files.map((x, n) => ({ n, name: x.name })) });
        const raw = { files: out.plan.files.map(x => ({ name: x.name, dest: x.dests.length ? x.dests[0].path : null })), steps: out.plan.steps, mode: doc === 'plan' ? 'new-version' : 'existing' };
        const { why, ...plan } = ai.sanitizePlan(raw, f.tree, f.files.map(x => x.name));
        f.plan = plan;
        sendJson(res, 200, { plan, ...(out.version ? { version: out.version } : {}), ...(out.problem ? { problem: out.problem } : {}) });
      } finally {
        release();
      }
      return;
    }
```

- [ ] **Step 4: Run the tests**

Run: `node --test --test-name-pattern="pane's plan in code" tools/local-server/test/filing.test.js` → PASS.
Run: `cd tools/local-server && node --test "test/*.test.js"` → PASS (all).

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing.js tools/local-server/outlook.js tools/local-server/test/filing.test.js
git commit -m "feat(filing): pane routes for filing without Claude — options with the sender's consultant, plan in code"
```

---

### Task 7: Claude's publish prompt follows the slots; UPDATED stays PDF-only

**Files:**
- Modify: `tools/local-server/filing-ai.js` (`INBOX_SYSTEM` ~line 308, `inboxContent` ~line 386, `inboxProposal` ~line 409)
- Test: `tools/local-server/test/filing-plan.test.js` (append)

- [ ] **Step 1: Write the failing tests** (append)

```js
test('filing-ai: "הצע" on publish — the prompt carries the slots, and a replace of a file that is not a PDF is dropped', async () => {
  const x = {
    project: { code: 'X', name: 'n' }, map: { areas: { publish: { paths: ['P'], note: '' } }, slots: { sent: 'P/S', sentSplit: false, updated: 'P/U' } },
    guide: '', tree: ['P', 'P/S', 'P/U'], today: '2026-10-26', files: [{ n: 0, name: 'a.pdf' }, { n: 1, name: 'a.dwg' }], sent: true, updated: true, text: '', lang: 'he'
  };
  assert.match(ai.inboxContent(x), /\nSlots: SENT archive P\/S \(all files together\); UPDATED \(PDF only\) P\/U\n/);
  assert.match(ai.inboxContent({ ...x, map: { areas: {} } }), /\nSlots: \(none\)\n/);
  const client = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
    message: 'm', mode: 'publish', steps: [], files: [{ name: 'a.pdf', dests: [{ path: 'P/U', replace: true }] }, { name: 'a.dwg', dests: [{ path: 'P/U', replace: true }, { path: 'P/S', replace: false }] }]
  }) }] }) } };
  const out = await ai.inboxProposal(client, 'claude-haiku-5-5', x);
  assert.deepStrictEqual(out.plan.files.map(f => f.dests), [[{ path: 'P/U', replace: true }], [{ path: 'P/S', replace: false }]]);
  assert.strictEqual(out.replaceStripped, 'pdf_only');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tools/local-server/test/filing-plan.test.js`
Expected: FAIL — no `Slots:` line.

- [ ] **Step 3: Implement** — in `tools/local-server/filing-ai.js`:

In `INBOX_SYSTEM`, after the line starting `'Unless the map, its note or the guide say otherwise, the office\'s convention …'`, add a line:

```js
  'The "Slots:" line, when it names folders, is the office\'s own choice and wins over the convention: SENT goes into a day folder (CODE-pub-YYYY,MM,DD, inside a CODE-pub-sent-YYYY year folder when the archive has those) of the SENT archive it names, with a sub-folder per TYPE only when it says "by file type"; UPDATED is the one folder it names, and only PDF files go there (other files are not put in UPDATED at all).',
```

In `inboxContent`, after the `'Today: ' + line(x.today),` line, add:

```js
    'Slots: ' + slotsLine(x.map),
```

and above `function inboxContent` add:

```js
// the map's slots on one line for the publish prompt: what the office chose for SENT and UPDATED
function slotsLine(map) {
  const s = cleanSlots(map && map.slots);
  if (!s.sent && !s.updated) return '(none)';
  return [s.sent ? `SENT archive ${strip(s.sent)} (${s.sentSplit ? 'by file type' : 'all files together'})` : '', s.updated ? `UPDATED (PDF only) ${strip(s.updated)}` : ''].filter(Boolean).join('; ');
}
```

In `inboxProposal`, replace:

```js
  const notes = {};
  const plan = sanitizeInboxPlan(raw, x.tree, x.files, publish, notes);
  return { message, plan, ...(notes.replaceStripped ? { replaceStripped: notes.replaceStripped } : {}) };
```

with:

```js
  const notes = {};
  const plan = sanitizeInboxPlan(raw, x.tree, x.files, publish, notes);
  // UPDATED is for PDFs only: a replace of any other file goes (the window says so under Claude's words)
  for (const f of plan.files) {
    if (/\.pdf$/i.test(f.name) || !f.dests.some(d => d.replace)) continue;
    f.dests = f.dests.filter(d => !d.replace);
    notes.replaceStripped = 'pdf_only';
  }
  if (!plan.files.some(f => f.dests.length)) plan.steps = [];
  return { message, plan, ...(notes.replaceStripped ? { replaceStripped: notes.replaceStripped } : {}) };
```

- [ ] **Step 4: Run the tests**

Run: `node --test tools/local-server/test/filing-plan.test.js` → PASS.
Run: `node --test tools/local-server/test/filing.test.js` → PASS. The existing inbox test expects `replaceStripped: 'outside'` for a `.dwg` replace in `WORK/DWG`; the sanitizer already dropped that replace (outside the publish area), so `pdf_only` is not set and the expectation holds. If it fails, the order of the two checks is wrong: the PDF filter must run after `sanitizeInboxPlan`.

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/filing-ai.js tools/local-server/test/filing-plan.test.js
git commit -m "feat(filing): Claude's publish follows the map's slots; UPDATED stays PDF-only"
```

---

## Part B — the Hub page (`project_hub_01.html`)

Notes for every task in this part:
- The page is Babel-compiled React. Locate code with Grep and edit by unique string; never read the file whole (~1.9 MB).
- Hebrew is the source language: every new Hebrew string goes into `i18n-dict.js` (Task 10). Data (paths, file names, version names) carries `data-i18n-skip` or goes through `asTyped()`.
- Start the local preview with `.claude/launch.json` → `project-hub` (port 3000) for the browser checks in Task 11.

### Task 8: Settings → project folders: the slots and "מלא אוטומטית"

**Files:**
- Modify: `project_hub_01.html` (helpers after `fmAreasOf` ~line 16028; `SettingsFoldersView` ~lines 17156–17641; CSS line ~2269)

- [ ] **Step 1: Helpers.** After the `fmAreasOf` definition (ends `  return out;\n};` right before `async function fmCall`), add:

```js
// the map's slots for filing without Claude: the SENT archive, SENT split by file type or not, the UPDATED folder of PDFs
const fmSlotsOf = map => {
  const s = map && map.slots || {};
  return {
    sent: String(s.sent || ''),
    sentSplit: s.sentSplit !== false,
    updated: String(s.updated || '')
  };
};
```

and after `const fmLang = () => …;` add:

```js
// today in Israel, YYYY-MM-DD (the server's SENT day unless the person picks another)
const fmToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem'
}).format(new Date());
```

- [ ] **Step 2: State.** In `SettingsFoldersView`, replace

```js
  const [areas, setAreas] = useState(fmEmpty);
```

with

```js
  const [areas, setAreas] = useState(fmEmpty);
  const [slots, setSlots] = useState(() => fmSlotsOf(null));
  const [filling, setFilling] = useState(false);
```

- [ ] **Step 3: Load, save, discard.** Replace

```js
      setAreas(fmAreasOf(p.map));
      setGuide(p.guide || '');
```

with

```js
      setAreas(fmAreasOf(p.map));
      setSlots(fmSlotsOf(p.map));
      setGuide(p.guide || '');
```

Replace

```js
    fmCall('map', {
      projectId,
      areas
    }, 'PUT').then(r => {
```

with

```js
    fmCall('map', {
      projectId,
      areas,
      slots
    }, 'PUT').then(r => {
```

Replace

```js
      setAreas(fmAreasOf(r.map));
      setDirty(false);
      setMapMsg(say('המפה נשמרה'));
```

with

```js
      setAreas(fmAreasOf(r.map));
      setSlots(fmSlotsOf(r.map));
      setDirty(false);
      setMapMsg(say('המפה נשמרה'));
```

Replace

```js
    setAreas(fmAreasOf(info && info.map));
    setDirty(false);
```

with

```js
    setAreas(fmAreasOf(info && info.map));
    setSlots(fmSlotsOf(info && info.map));
    setDirty(false);
```

- [ ] **Step 4: Auto fill.** After the end of `mapIt` (the line `  };` that follows `setMapMsg(e.message === 'busy' ? say('בקשה קודמת עדיין בטיפול. רגע…') : failMsg(e));\n    });`), add:

```js

  /* filling the map by the office's convention, without Claude: the helper reads the tree, the server finds the SENT
     archive, the UPDATED folder of PDFs and the areas by their usual names (map-auto); only empty fields are filled,
     and nothing is saved until "שמור מפה" */
  const autoFill = async again => {
    if (!w || filling) return;
    setFilling(true);
    setMapMsg(say('קורא את התיקיות במחשב…'));
    try {
      if (!session.current) session.current = (await fmCall('map-session', {
        projectId,
        lang: fmLang()
      })).id;
      const r = await fmCall('map-auto?id=' + encodeURIComponent(session.current), {});
      if (!live.current) return;
      setFilling(false);
      if (r.needsFolder) return setMapMsg(say('בחר קודם את תיקיית הפרויקט.'));
      if (r.agent === 'none') return setMapMsg(say(FM_HELPER_OFF));
      if (r.agent === 'slow') return setMapMsg(say('עוזר התיוק לא הספיק לקרוא את התיקיות. נסה שוב.'));
      if (r.agent === 'failed') return setMapMsg(say('קריאת התיקיות במחשב לא הצליחה. נסה שוב.'));
      if (r.missing) return setMapMsg(say(FM_NOT_HERE));
      if (Array.isArray(r.tree)) setTree(r.tree);
      const a = r.auto || {
        slots: {},
        areas: {}
      };
      let n = 0;
      const s = {
        ...slots
      };
      if (!s.sent && a.slots.sent) {
        s.sent = a.slots.sent;
        s.sentSplit = a.slots.sentSplit !== false;
        n++;
      }
      if (!s.updated && a.slots.updated) {
        s.updated = a.slots.updated;
        n++;
      }
      const ar = {
        ...areas
      };
      Object.keys(a.areas || {}).forEach(k => {
        if (ar[k] && !ar[k].paths.length) {
          ar[k] = {
            ...ar[k],
            paths: a.areas[k].slice()
          };
          n++;
        }
      });
      if (n) {
        setSlots(s);
        setAreas(ar);
        setDirty(true);
      }
      setMapMsg(n ? say(n === 1 ? 'מולא שדה אחד לפי המוסכמה — בדוק ושמור' : 'מולאו {n} שדות לפי המוסכמה — בדוק ושמור', {
        n
      }) : say('לא נמצאו תיקיות חדשות לפי המוסכמה'));
    } catch (e) {
      if (!live.current) return;
      setFilling(false);
      if (e.message === 'no_session' && !again) {
        session.current = null;
        return autoFill(true);
      }
      setMapMsg(e.message === 'busy' ? say('בקשה קודמת עדיין בטיפול. רגע…') : failMsg(e));
    }
  };
```

- [ ] **Step 5: Auto fill on the first folder pick.** In `pick`, replace

```js
        if (r && r.picked) {
          setInfo(p => ({
            ...p,
            folder: r.picked,
            root: r.root || ''
          }));
          setHint(null);
        } else if (r && r.missing) setHint(say(FM_NOT_HERE));else if (r) setHint(null);
      }
    })).catch(e => {
      setPicking(false);
      setHint(failMsg(e));
    });
  };
  const open = rel => {
```

with

```js
        if (r && r.picked) {
          setInfo(p => ({
            ...p,
            folder: r.picked,
            root: r.root || ''
          }));
          setHint(null);
          session.current = null; // another folder: its tree is read again
          const s = info && info.map && info.map.slots;
          if (!(s && (s.sent || s.updated))) autoFill();
        } else if (r && r.missing) setHint(say(FM_NOT_HERE));else if (r) setHint(null);
      }
    })).catch(e => {
      setPicking(false);
      setHint(failMsg(e));
    });
  };
  const open = rel => {
```

(`autoFill` is a `const` declared after `pick`; it is only called later, from the callback, so it is defined by then.)

- [ ] **Step 6: Render the slots.** After `  const saved = info.map && info.map.updatedAt;` add:

```js
  // filing without Claude: the SENT archive (split by file type or not) and the UPDATED folder of PDFs, chosen from the tree
  const slotRow = (key, label) => {
    const v = slots[key];
    return /*#__PURE__*/React.createElement("div", {
      className: "fm-slot"
    }, /*#__PURE__*/React.createElement("span", {
      className: "fm-slot-l"
    }, label), /*#__PURE__*/React.createElement("span", {
      className: "fm-path",
      dir: "auto",
      "data-i18n-skip": "",
      title: v ? fmSlash(v) : undefined
    }, v ? fmSlash(v) : '—'), has && v && /*#__PURE__*/React.createElement("button", {
      className: "fm-ico",
      title: "פתח בסייר הקבצים",
      disabled: opening,
      onClick: () => open(v)
    }, "📂"), w && v && /*#__PURE__*/React.createElement("button", {
      className: "fm-ico fm-x",
      title: "הסר",
      onClick: () => {
        setSlots(s => ({
          ...s,
          [key]: ''
        }));
        setDirty(true);
      }
    }, "✕"), w && tree && /*#__PURE__*/React.createElement("select", {
      className: "fm-pick",
      value: "",
      onChange: e => {
        const p = e.target.value;
        if (!p) return;
        setSlots(s => ({
          ...s,
          [key]: p
        }));
        setDirty(true);
      }
    }, /*#__PURE__*/React.createElement("option", {
      value: ""
    }, "בחר מהעץ"), tree.map(t => /*#__PURE__*/React.createElement("option", {
      key: t,
      value: t,
      "data-i18n-skip": ""
    }, fmSlash(t)))));
  };
  const split = on => {
    setSlots(s => ({
      ...s,
      sentSplit: on
    }));
    setDirty(true);
  };
  const slotsBox = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "sp-sec-lbl fm-head"
  }, /*#__PURE__*/React.createElement("span", null, "תיוק בלי Claude")), /*#__PURE__*/React.createElement("div", {
    className: "fm-msg fm-slot-note"
  }, "לפי השדות האלה מתייקים בלי Claude ובלי עלות. CONSULTANTS, RECEIVE, PERMIT ו-EXEC נלקחים מהמפה למעלה."), slotRow('sent', 'ארכיון SENT'), /*#__PURE__*/React.createElement("div", {
    className: "fm-slot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "fm-slot-l"
  }), /*#__PURE__*/React.createElement("label", {
    className: "fm-radio"
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "fm-split",
    checked: slots.sentSplit,
    disabled: !w,
    onChange: () => split(true)
  }), /*#__PURE__*/React.createElement("span", null, "לפי סוג קובץ (PDF / DWG / RVT / DOCS)")), /*#__PURE__*/React.createElement("label", {
    className: "fm-radio"
  }, /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: "fm-split",
    checked: !slots.sentSplit,
    disabled: !w,
    onChange: () => split(false)
  }), /*#__PURE__*/React.createElement("span", null, "מאוחד"))), slotRow('updated', 'UPDATED (PDF בלבד)'), w && has && !tree && /*#__PURE__*/React.createElement("div", {
    className: "fm-msg fm-slot-note"
  }, "כדי לבחור מהעץ: מלא אוטומטית, או מפה עם Claude."));
```

Then put `slotsBox` before the actions row. Replace

```js
  }), w && /*#__PURE__*/React.createElement("div", {
    className: "fm-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "sp-btn-sm",
    disabled: busy || !has,
```

with

```js
  }), slotsBox, w && /*#__PURE__*/React.createElement("div", {
    className: "fm-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "sp-btn-sm",
    disabled: busy || !has,
```

and add the button next to "מפה עם Claude" — replace

```js
  }, conv.length ? 'מפה מחדש עם Claude' : 'מפה את התיקיות עם Claude'), /*#__PURE__*/React.createElement("span", {
```

with

```js
  }, conv.length ? 'מפה מחדש עם Claude' : 'מפה את התיקיות עם Claude'), /*#__PURE__*/React.createElement("button", {
    className: "sp-btn-sm",
    disabled: filling || !has,
    title: has ? undefined : 'בחר קודם את תיקיית הפרויקט.',
    onClick: () => autoFill()
  }, "מלא אוטומטית"), /*#__PURE__*/React.createElement("span", {
```

- [ ] **Step 7: CSS.** Find the unique text `.ib-in{padding-inline-start:20px;}` (start of the style line ~2269) and replace it with:

```
.fm-slot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:3px 16px;}.fm-slot-l{width:140px;flex-shrink:0;font-size:12px;font-weight:700;color:var(--text-2);}.fm-slot-note{padding:0 16px 4px;}.fm-radio{display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;}.ib-in{padding-inline-start:20px;}
```

- [ ] **Step 8: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(hub): project folders — SENT archive, split or together, UPDATED of PDFs; fill by the convention"
```

---

### Task 9: The export inbox window builds plans in code (`InboxBatch`)

**Files:**
- Modify: `project_hub_01.html` (`IB_*` constants ~line 16054; `InboxBatch` ~lines 16074–16909; CSS line ~2269)

- [ ] **Step 1: Problems the code can name.** After the `IB_STRIPPED` line add:

```js
// what the code's plan could not do, named by the server (filing-plan.js receivePlan)
const IB_PROBLEM = {
  no_from: 'בחר ממי הקבצים.',
  no_consultant: 'בחר יועץ.',
  consultant_folder: 'ליועץ הזה אין עדיין תיקייה בפרויקט — בחר "תיקייה אחרת מהעץ".',
  no_doc: 'בחר תכנית חדשה או מסמך של יועץ.',
  other_folder: 'בחר תיקייה.',
  name: 'שם תיקיית הגרסה לא תקין, או שתיקייה בשם הזה כבר קיימת.'
};
```

Also replace the comment block above `IB_NO_REPLACE` (it begins `/* One batch (InboxBatch, inside QuickInbox below)`) — change its third and fourth lines from "and Claude's plan for them, asked again (debounced) on every change — the server keeps no instruction, so the instruction goes with every proposal." to:

```
   and the plan for them, built in code on the server (inbox-plan, filing-plan.js) on every change — Claude only on
   "הצע", with the person's instruction (inbox-propose).
```

and in `IB_STRIPPED`'s comment add that `'pdf_only'` (Claude put a non-PDF in UPDATED) shows `IB_STRIPPED` too.

- [ ] **Step 2: State.** Replace

```js
  const [updated, setUpdated] = useState(true);
```

with

```js
  const [updated, setUpdated] = useState(true);
  const [date, setDate] = useState(fmToday); // SENT's day folder, today in Israel unless the person picks another
```

Replace

```js
  const [treePick, setTreePick] = useState('');
```

with

```js
  const [treePick, setTreePick] = useState('');
  const [verName, setVerName] = useState(''); // a consultant's new version folder, typed where its versions are not …-vNN
  const [toVer, setToVer] = useState(null); // move the current version to @ver: null = as the server proposes
```

- [ ] **Step 3: One request at a time, to the code or to Claude.** Replace

```js
  const propose = () => {
    const r = run.current;
    if (!live.current) return;
    if (r.running) {
      r.again = true;
      return;
    }
    const w = wish.current;
    if (!w) return;
    r.running = true;
    r.again = false;
    setBusy(true);
    setMsg(say('Claude בודק לאן הקבצים הולכים — זה יכול לקחת עד דקה…'));
    const end = () => {
      r.running = false;
      if (!live.current) return;
      if (r.again) {
        propose();
        return;
      }
      setBusy(false);
    };
    fmCall('inbox-propose', w.mode === 'receive' ? {
      id,
      projectId: w.projectId,
      files: w.files,
      mode: 'receive',
      from: w.from,
      doc: w.doc || undefined,
      text: w.text || undefined,
      lang: fmLang()
    } : {
      id,
      projectId: w.projectId,
      files: w.files,
      sent: w.sent,
      updated: w.updated,
      text: w.text || undefined,
      lang: fmLang()
    }).then(x => {
```

with

```js
  const propose = viaClaude => {
    const r = run.current;
    if (!live.current) return;
    if (r.running) {
      r.again = true;
      r.claude = r.claude || !!viaClaude;
      return;
    }
    const w = wish.current;
    if (!w) return;
    r.running = true;
    r.again = false;
    r.claude = false;
    setBusy(true);
    setMsg(say(viaClaude ? 'Claude בודק לאן הקבצים הולכים — זה יכול לקחת עד דקה…' : 'בונה את התוכנית…'));
    const end = () => {
      r.running = false;
      if (!live.current) return;
      if (r.again) {
        propose(r.claude);
        return;
      }
      setBusy(false);
    };
    const body = w.mode === 'receive' ? {
      id,
      projectId: w.projectId,
      files: w.files,
      mode: 'receive',
      from: w.from,
      doc: w.doc || undefined,
      lang: fmLang()
    } : {
      id,
      projectId: w.projectId,
      files: w.files,
      sent: w.sent,
      updated: w.updated,
      lang: fmLang()
    };
    // the code's plan: the day of SENT, a typed version name and the @ver choice go with it; "הצע": Claude, with the
    // person's instruction
    if (viaClaude) body.text = w.text || undefined;else Object.assign(body, w.mode === 'receive' ? {
      versionName: w.verName || undefined,
      toVer: w.toVer == null ? undefined : w.toVer
    } : {
      date: w.date
    });
    fmCall(viaClaude ? 'inbox-propose' : 'inbox-plan', body).then(x => {
```

Replace

```js
        setProp({
          message: x.message || '',
          plan: x.plan || {
            files: [],
            steps: []
          },
          stripped: x.replaceStripped || ''
        });
```

with

```js
        setProp({
          message: x.message || '',
          plan: x.plan || {
            files: [],
            steps: []
          },
          stripped: x.replaceStripped || '',
          ai: !!viaClaude,
          version: x.version || null,
          slotsMissing: x.slotsMissing || null,
          problem: x.problem || ''
        });
```

Replace

```js
        r.retried = true;
        r.again = true;
```

with

```js
        r.retried = true;
        r.again = true;
        r.claude = !!viaClaude;
```

In `publish`'s `catch`, replace `        propose(); // the plan went (the server restarted): ask again` with `        propose(false); // the plan went (the server restarted): ask again`.

- [ ] **Step 4: Claude's guess keeps its plan.** In `applyGuess`, replace

```js
    guessKey.current = JSON.stringify({
      ...w,
      from: f.from,
      doc: f.doc
    });
```

with

```js
    const { text, ...choices } = w; // the window's own wish carries no instruction (it asks the code)
    guessKey.current = JSON.stringify({
      ...choices,
      from: f.from,
      doc: f.doc
    });
```

- [ ] **Step 5: A new version for another consultant.** After the effect that resets the choices on another project (it ends `    setGuessed(false);\n  }, [projectId]);`), add:

```js
  // another consultant, project or kind of file: its own next version, proposed again
  useEffect(() => {
    setVerName('');
    setToVer(null);
  }, [projectId, kind, cons, doc, treePick]);
```

- [ ] **Step 6: The plan on every change, from the code.** Replace

```js
    if (mode === 'publish' && !sent && !updated && !instr) {
      wish.current = null;
      setProp(null);
      setMsg(say('סמן SENT או UPDATED, או כתוב לאן.'));
      return;
    }
    const w = mode === 'receive' ? {
      projectId,
      files: sel.slice().sort((a, b) => a - b),
      mode,
      from: fromNow.from,
      doc: fromNow.doc,
      text: instr
    } : {
      projectId,
      files: sel.slice().sort((a, b) => a - b),
      mode,
      sent,
      updated,
      text: instr
    };
```

with

```js
    if (mode === 'publish' && !sent && !updated) {
      wish.current = null;
      setProp(null);
      setMsg(say('סמן SENT או UPDATED.'));
      return;
    }
    const w = mode === 'receive' ? {
      projectId,
      files: sel.slice().sort((a, b) => a - b),
      mode,
      from: fromNow.from,
      doc: fromNow.doc,
      verName,
      toVer
    } : {
      projectId,
      files: sel.slice().sort((a, b) => a - b),
      mode,
      sent,
      updated,
      date
    };
```

Replace

```js
    const t = setTimeout(propose, 600);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [info && info.id, projectId, sel.join(','), sent, updated, instr, ask, mode, JSON.stringify(fromNow)]); // inputs are locked outside edit
```

with

```js
    const t = setTimeout(() => propose(false), 400);
    timers.current.push(t);
    return () => clearTimeout(t);
  }, [info && info.id, projectId, sel.join(','), sent, updated, date, verName, toVer, ask, mode, JSON.stringify(fromNow)]); // inputs are locked outside edit
  // "הצע": Claude, with the person's instruction, for the choices as they are now
  const suggest = () => {
    const w = wish.current;
    if (!w || phase !== 'edit') return;
    const text = draft.trim();
    setInstr(text);
    wish.current = {
      ...w,
      text
    };
    propose(true);
  };
```

- [ ] **Step 7: 📂 for every folder.** Replace

```js
  const openFolder = () => {
    if (opening || !done) return;
    setOpening(true);
    setMsg(say('פותח את התיקייה במחשב…'));
    fmCall('open', {
      projectId,
      rel: done.rel || '',
      lang: fmLang()
```

with

```js
  const openFolder = rel => {
    if (opening) return;
    setOpening(true);
    setMsg(say('פותח את התיקייה במחשב…'));
    fmCall('open', {
      projectId,
      rel: rel || '',
      lang: fmLang()
```

Replace

```js
        // 📂 opens the folder of the first saved copy (the server's dests are aligned with their paths, null: not saved)
        let rel = '';
        for (const f of files) {
          const i = (f.dests || []).findIndex(Boolean);
          if (i >= 0 && f.paths && f.paths[i] != null) {
            rel = f.paths[i];
            break;
          }
        }
        setDone({
          count: files.filter(f => f.all).length,
          receive: mode === 'receive',
          rel,
```

with

```js
        // 📂 for every folder a copy was saved in (the server's dests are aligned with their paths, null: not saved)
        const rels = [];
        for (const f of files) (f.dests || []).forEach((v, i) => {
          const p = v && f.paths ? f.paths[i] : null;
          if (p != null && !rels.some(x => x.toLowerCase() === p.toLowerCase())) rels.push(p);
        });
        setDone({
          count: files.filter(f => f.all).length,
          receive: mode === 'receive',
          rels,
```

Replace (the end of the done view)

```js
    n: done.left
  })) : null, h("button", {
    type: "button",
    className: "np-btn",
    disabled: opening,
    title: "פתח בסייר הקבצים",
    onClick: openFolder
  }, "📂"), h("button", {
    type: "button",
    className: "np-btn",
    onClick: closeWin
  }, "סגור"))));
```

with

```js
    n: done.left
  })) : null, h("button", {
    type: "button",
    className: "np-btn",
    onClick: closeWin
  }, "סגור")), done.rels.length ? h("ul", {
    className: "ib-sub ib-dirs",
    dir: "ltr",
    "data-i18n-skip": ""
  }, done.rels.map(p => h("li", {
    key: p
  }, h("button", {
    type: "button",
    className: "ib-open",
    disabled: opening,
    title: tx('פתח בסייר הקבצים'),
    onClick: () => openFolder(p)
  }, "📂"), fmSlash(p)))) : null));
```

- [ ] **Step 8: The version box, the slot hints, the non-PDF count.** After `  const op = opts && opts.consultants ? opts : null;` add:

```js
  const nonPdf = sel.map(n => info.files.find(f => f.n === n)).filter(f => f && !/\.pdf$/i.test(f.name)).length;
  // a target the code could not place: its folder is not in the project's map, or no longer in the project's tree
  const slotHint = k => {
    const s = prop && prop.slotsMissing && prop.slotsMissing[k];
    if (!s) return null;
    return h("div", {
      className: "ib-hint ib-warn",
      "data-i18n-skip": ""
    }, tx(s === 'gone' ? k === 'sent' ? 'ארכיון ה-SENT שבמפה לא נמצא בתיקיות — עדכן בהגדרות הפרויקט ← תיקיות הפרויקט' : 'תיקיית ה-UPDATED שבמפה לא נמצאה בתיקיות — עדכן בהגדרות הפרויקט ← תיקיות הפרויקט' : k === 'sent' ? 'אין ארכיון SENT במפה — מפה בהגדרות הפרויקט ← תיקיות הפרויקט' : 'אין תיקיית UPDATED במפה — מפה בהגדרות הפרויקט ← תיקיות הפרויקט'));
  };
  // a consultant's new plan version: its name (typed where the versions there are not …-vNN) and the move to @ver
  const ver = mode === 'receive' && kind === 'consultant' && doc === 'plan' && prop && prop.version;
  const versionBox = !ver ? null : h("div", {
    className: "ib-from"
  }, ver.editable ? h(React.Fragment, null, h("div", {
    className: "ib-sub-lbl"
  }, "שם תיקיית הגרסה החדשה:"), h("input", {
    className: "af-input",
    dir: "ltr",
    value: verName,
    placeholder: ver.name,
    disabled: locked,
    "data-i18n-skip": "",
    onChange: e => setVerName(e.target.value)
  }), h("div", {
    className: "ib-hint"
  }, "שמות הגרסאות כאן אינם בצורה …-vNN, ולכן ההעברה ל-@ver מושבתת.")) : h("div", {
    className: "ib-opt",
    "data-i18n-skip": ""
  }, tx('גרסה חדשה: {v}', {
    v: asTyped(ver.name)
  })), ver.prev && !ver.editable ? h("label", {
    className: "ib-opt"
  }, h("input", {
    type: "checkbox",
    checked: !!ver.toVer,
    disabled: locked,
    onChange: e => setToVer(e.target.checked)
  }), h("span", {
    "data-i18n-skip": ""
  }, tx('העבר את הגרסה הקיימת ({v}) ל-@ver', {
    v: asTyped(leafOf(ver.prev))
  }))) : null);
```

- [ ] **Step 9: EXEC among the other parties.** Replace

```js
  }), h("span", null, "גורם אחר (רשות, מנהל פרויקט, ספק…)")), kind === 'other' ? h(React.Fragment, null, h("select", {
```

with

```js
  }), h("span", null, "רשות, קבלן או גורם אחר")), kind === 'other' ? h(React.Fragment, null, h("select", {
```

Replace `  }, tx('בחר תיקייה…')), ['receive', 'permit', 'top'].map(a => {` with `  }, tx('בחר תיקייה…')), ['receive', 'permit', 'exec', 'top'].map(a => {`, and replace `      label: a === 'receive' ? 'Receive' : 'Permit'` with `      label: a === 'receive' ? 'Receive' : a === 'exec' ? 'Exec' : 'Permit'`.

- [ ] **Step 10: SENT with a date, UPDATED for PDFs.** Replace

```js
  }, ibName(f.name, code))))), fromBox, mode === 'publish' ? h("label", {
    className: "ib-opt"
  }, h("input", {
    type: "checkbox",
    checked: sent,
    disabled: locked,
    onChange: e => setSent(e.target.checked)
  }), h("span", null, "PUBLISH-SENT עם תאריך היום")) : null, mode === 'publish' ? h("label", {
    className: "ib-opt"
  }, h("input", {
    type: "checkbox",
    checked: updated,
    disabled: locked,
    onChange: e => setUpdated(e.target.checked)
  }), h("span", null, "PUBLISH-UPDATED (כולל החלפה של קבצים באותו שם)")) : null, mode === 'publish' && updated ? h("div", {
    className: "ib-hint"
  }, "קובץ ישן באותו שם עובר ל-@ver ולא נמחק") : null, mode === 'receive' ? h("div", {
```

with

```js
  }, ibName(f.name, code))))), fromBox, versionBox, mode === 'publish' ? h("div", {
    className: "ib-opt"
  }, h("label", {
    className: "ib-opt"
  }, h("input", {
    type: "checkbox",
    checked: sent,
    disabled: locked,
    onChange: e => setSent(e.target.checked)
  }), h("span", null, "SENT, בתאריך")), h("input", {
    type: "date",
    className: "af-input ib-date",
    value: date,
    disabled: locked || !sent,
    onChange: e => setDate(e.target.value || fmToday())
  })) : null, mode === 'publish' ? slotHint('sent') : null, mode === 'publish' ? h("label", {
    className: "ib-opt"
  }, h("input", {
    type: "checkbox",
    checked: updated,
    disabled: locked,
    onChange: e => setUpdated(e.target.checked)
  }), h("span", null, "UPDATED (PDF בלבד, מחליף קובץ באותו שם)")) : null, mode === 'publish' ? slotHint('updated') : null, mode === 'publish' && updated ? h("div", {
    className: "ib-hint",
    "data-i18n-skip": ""
  }, (nonPdf ? tx(nonPdf === 1 ? 'קובץ אחד שאינו PDF יישמר רק ב-SENT' : '{n} קבצים שאינם PDF יישמרו רק ב-SENT', {
    n: nonPdf
  }) + ' · ' : '') + tx('קובץ ישן באותו שם עובר ל-@ver ולא נמחק')) : null, mode === 'receive' ? h("div", {
```

- [ ] **Step 11: The problem line.** Replace `  }, "שום קובץ לא מוחלף: קובץ בשם שכבר קיים נשמר בשם אחר.") : null, line(notice), line(msg), plan ? h("div", {` with:

```js
  }, "שום קובץ לא מוחלף: קובץ בשם שכבר קיים נשמר בשם אחר.") : null, line(notice), line(msg), prop && prop.problem ? h("div", {
    className: "ib-hint ib-warn"
  }, IB_PROBLEM[prop.problem] || prop.problem) : null, plan ? h("div", {
```

and replace `  }, prop.stripped === 'no_map' ? IB_NO_REPLACE : IB_STRIPPED) : null, mk.length ? h("div", {` — it stays as is (`'pdf_only'` and `'outside'` both show `IB_STRIPPED`). No edit.

- [ ] **Step 12: 📂 next to each target folder that exists.** Replace

```js
  }, fmSlash(d.path), d.replace ? h("span", {
    className: "ib-rep"
  }, tx('מחליף קובץ קיים')) : null))) : h("div", {
```

with

```js
  }, fmSlash(d.path), d.replace ? h("span", {
    className: "ib-rep"
  }, tx('מחליף קובץ קיים')) : null, mk.some(s => s.path.toLowerCase() === d.path.toLowerCase()) ? null : h("button", {
    type: "button",
    className: "ib-open",
    disabled: opening,
    title: tx('פתח בסייר הקבצים'),
    onClick: () => openFolder(d.path)
  }, "📂")))) : h("div", {
```

- [ ] **Step 13: Claude behind "הצע".** Replace

```js
  }, mode === 'receive' ? tx('לא יתויק') : tx('לא יפורסם')))))) : null, h("div", {
    className: "ib-ask"
  }, h("input", {
    className: "af-input",
    value: draft,
    dir: "auto",
    disabled: locked,
    placeholder: mode === 'receive' ? "הוראה ל-Claude (לא חובה), למשל: זו גרסה 5 של הקונסטרוקציה" : "הוראה ל-Claude (לא חובה), למשל: ה-DWG ל-Work",
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter' && draft.trim() !== instr) setInstr(draft.trim());
    }
  }), h("button", {
    type: "button",
    className: "np-btn",
    disabled: locked || draft.trim() === instr,
    onClick: () => setInstr(draft.trim())
  }, "שלח")), h("div", {
```

with

```js
  }, mode === 'receive' ? tx('לא יתויק') : tx('לא יפורסם')))))) : null, h("details", {
    className: "ib-claude"
  }, h("summary", null, "הצע עם Claude (לרוב לא צריך)"), h("div", {
    className: "ib-ask"
  }, h("input", {
    className: "af-input",
    value: draft,
    dir: "auto",
    disabled: locked,
    placeholder: mode === 'receive' ? "הוראה ל-Claude (לא חובה), למשל: זו גרסה 5 של הקונסטרוקציה" : "הוראה ל-Claude (לא חובה), למשל: ה-DWG ל-Work",
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => {
      if (e.key === 'Enter') suggest();
    }
  }), h("button", {
    type: "button",
    className: "np-btn",
    disabled: locked || busy || !wish.current,
    onClick: suggest
  }, "הצע"))), h("div", {
```

- [ ] **Step 14: CSS.** Replace the unique text `.ib-in{padding-inline-start:20px;}` (after Task 8 it is preceded by `.fm-radio{…}`) with:

```
.ib-in{padding-inline-start:20px;}.ib-date{width:auto;padding:2px 6px;font-size:12px;}.ib-open{border:none;background:none;cursor:pointer;padding:0 4px;font-size:12px;}.ib-open:disabled{opacity:.5;cursor:default;}.ib-dirs{margin-top:6px;text-align:left;}.ib-claude>summary{cursor:pointer;font-size:12px;color:var(--text-3);}.ib-claude[open]>summary{margin-bottom:6px;}
```

- [ ] **Step 15: Check that nothing else still calls the old names.**

Run: `grep -n "propose()" project_hub_01.html` → no hit inside `InboxBatch` (lines 16074–16930). Run: `grep -n "done.rel\b" project_hub_01.html` → no hit.

- [ ] **Step 16: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(hub): export inbox window — plans in code (SENT dated, UPDATED for PDFs, consultant versions), Claude on הצע"
```

---

### Task 10: English for the Hub page (`i18n-dict.js`)

**Files:**
- Modify: `i18n-dict.js` (the last `Object.assign(HE_EN, { … });` chunk, before `window.I18N_HE_EN = HE_EN;`)

- [ ] **Step 1: List what is still untranslated.**

Run: `node tools/i18n-extract.js`
Expected: the new strings of Tasks 8–9 are listed.

- [ ] **Step 2: Add the entries.** Append to the last chunk (after the final entry, keeping the comma rules of the file) every string the tool listed, from this table (skip any the tool did not list — it already exists):

```js
"תיוק בלי Claude": "Filing without Claude",
"לפי השדות האלה מתייקים בלי Claude ובלי עלות. CONSULTANTS, RECEIVE, PERMIT ו-EXEC נלקחים מהמפה למעלה.": "These fields let filing run without Claude, at no cost. CONSULTANTS, RECEIVE, PERMIT and EXEC come from the map above.",
"ארכיון SENT": "SENT archive",
"לפי סוג קובץ (PDF / DWG / RVT / DOCS)": "By file type (PDF / DWG / RVT / DOCS)",
"מאוחד": "All together",
"UPDATED (PDF בלבד)": "UPDATED (PDF only)",
"בחר מהעץ": "Choose from the tree",
"כדי לבחור מהעץ: מלא אוטומטית, או מפה עם Claude.": "To choose from the tree: fill automatically, or map with Claude.",
"מלא אוטומטית": "Fill automatically",
"קורא את התיקיות במחשב…": "Reading the folders on your computer…",
"מולא שדה אחד לפי המוסכמה — בדוק ושמור": "One field filled by the convention — check and save",
"מולאו {n} שדות לפי המוסכמה — בדוק ושמור": "{n} fields filled by the convention — check and save",
"לא נמצאו תיקיות חדשות לפי המוסכמה": "No new folders found by the convention",
"בונה את התוכנית…": "Building the plan…",
"סמן SENT או UPDATED.": "Tick SENT or UPDATED.",
"SENT, בתאריך": "SENT, dated",
"UPDATED (PDF בלבד, מחליף קובץ באותו שם)": "UPDATED (PDF only, replaces a file of the same name)",
"קובץ אחד שאינו PDF יישמר רק ב-SENT": "One file that is not a PDF will be saved in SENT only",
"{n} קבצים שאינם PDF יישמרו רק ב-SENT": "{n} files that are not PDFs will be saved in SENT only",
"קובץ ישן באותו שם עובר ל-@ver ולא נמחק": "An older file of the same name moves to @ver and is not deleted",
"ארכיון ה-SENT שבמפה לא נמצא בתיקיות — עדכן בהגדרות הפרויקט ← תיקיות הפרויקט": "The SENT archive in the map is not among the folders — update it in Project settings → Project folders",
"תיקיית ה-UPDATED שבמפה לא נמצאה בתיקיות — עדכן בהגדרות הפרויקט ← תיקיות הפרויקט": "The UPDATED folder in the map is not among the folders — update it in Project settings → Project folders",
"אין ארכיון SENT במפה — מפה בהגדרות הפרויקט ← תיקיות הפרויקט": "No SENT archive in the map — map it in Project settings → Project folders",
"אין תיקיית UPDATED במפה — מפה בהגדרות הפרויקט ← תיקיות הפרויקט": "No UPDATED folder in the map — map it in Project settings → Project folders",
"שם תיקיית הגרסה החדשה:": "Name of the new version folder:",
"שמות הגרסאות כאן אינם בצורה …-vNN, ולכן ההעברה ל-@ver מושבתת.": "The versions here are not named …-vNN, so moving to @ver is off.",
"גרסה חדשה: {v}": "New version: {v}",
"העבר את הגרסה הקיימת ({v}) ל-@ver": "Move the current version ({v}) to @ver",
"הצע עם Claude (לרוב לא צריך)": "Suggest with Claude (usually not needed)",
"הצע": "Suggest",
"רשות, קבלן או גורם אחר": "An authority, the contractor or another party",
"בחר ממי הקבצים.": "Choose who sent the files.",
"בחר יועץ.": "Choose a consultant.",
"ליועץ הזה אין עדיין תיקייה בפרויקט — בחר \"תיקייה אחרת מהעץ\".": "This consultant has no folder in the project yet — choose \"Another folder from the tree\".",
"בחר תכנית חדשה או מסמך של יועץ.": "Choose a new plan or a consultant document.",
"בחר תיקייה.": "Choose a folder.",
"שם תיקיית הגרסה לא תקין, או שתיקייה בשם הזה כבר קיימת.": "The version folder's name is not valid, or a folder of that name already exists."
```

- [ ] **Step 3: Check.**

Run: `node tools/i18n-extract.js` → none of the strings above listed.
Run: `node tools/i18n-extract.test.js` → passes.
Run: `node -e "require('./i18n-dict.js')"` is not possible (browser file) — instead open the page in Task 11 and check the console has no syntax error.

- [ ] **Step 4: Commit**

```bash
git add i18n-dict.js
git commit -m "i18n(filing): English for filing without Claude"
```

---

### Task 11: Browser check of the Hub page against a stand-in helper

**Files:**
- Create (not committed): `C:\Users\Omega\AppData\Local\Temp\claude\C--Users-Omega-Claude-Projects-project-hub\0e6eeb4f-4741-469c-b9e9-352481ed3223\scratchpad\fake-agent.js`

- [ ] **Step 1: The stand-in helper.** Write the script below. It plays the PC's helper against the local server: announces an export inbox batch, answers every `tree` task with a sample tree, and records `inbox` / `open` tasks.

```js
// Plays the filing helper on the PC for a browser check (local server only). Usage:
//   node fake-agent.js http://localhost:3000 <pho_ key>
const [base, key] = process.argv.slice(2);
const TREE = ['PUBLISH', 'PUBLISH/4021-pub-@sent', 'PUBLISH/4021-pub-@sent/4021-pub-sent-2026', 'PUBLISH/4021-pub-updated', 'PUBLISH/4021-pub-updated/4021-pub-updated-PDF',
  'CONSULTANTS', 'CONSULTANTS/4021-KONS', 'CONSULTANTS/4021-KONS/4021-KONS-plans', 'CONSULTANTS/4021-KONS/4021-KONS-plans/4021-KONS-plans-v03', 'CONSULTANTS/4021-KONS/4021-KONS-plans/4021-KONS-plans-@ver',
  'CONSULTANTS/4021-HVAC', 'CONSULTANTS/4021-HVAC/4021-HVAC-plans', 'CONSULTANTS/4021-HVAC/4021-HVAC-plans/גרסה 3', 'RECIEVE', 'RECIEVE/4021-receive-pm', 'PERMIT', 'PERMIT/4021-permit-fire', 'EXEC', 'EXEC/4021-exec-rfi'];
const call = async (path, body, auth = true) => {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(auth ? { Authorization: 'Bearer ' + key } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => null);
};
(async () => {
  const b = await call('/api/outlook/inbox-batch', { pc: 'PC1', files: [{ name: '4021-A-101.pdf', size: 10, mtime: '' }, { name: '4021-A-101.dwg', size: 10, mtime: '' }, { name: '4021-S-12.pdf', size: 10, mtime: '' }] });
  console.log('window:', b.url.replace(/^https?:\/\/[^/]+/, base));
  for (;;) {
    const { task } = await call('/api/outlook/filing-next?pc=PC1');
    if (!task) continue;
    const got = await call('/api/filing/' + task.token, null, false);
    console.log('task', got.kind, got.plan ? JSON.stringify(got.plan) : got.rel || '');
    const result = got.kind === 'tree' ? { tree: TREE } : got.kind === 'inbox' ? { files: got.plan.files.filter(f => f.dests.length).map(f => ({ name: f.name, dests: f.dests.map(() => f.name) })), notInInbox: [], error: null } : got.kind === 'open' ? {} : { cancelled: true };
    await call('/api/filing/' + task.token + '/result', result, false);
  }
})();
```

- [ ] **Step 2: Start the server and the stand-in.** Start the preview `project-hub` (`.claude/launch.json`). In the page: Settings → (a project with code `4021`, or set one) → Project folders → choose the folder (the stand-in answers `pick` with `{ cancelled: true}`, so instead write `data/filing.json` for that project: `{ "projects": { "<id>": { "folder": "4021 test", "root": "", "guide": "", "log": [] } } }`). Get a key: `curl -s -X POST http://localhost:3000/api/outlook-connection` → `key`. Run `node fake-agent.js http://localhost:3000 <key>` in the background.

- [ ] **Step 3: Check the settings screen.** Project folders → "מלא אוטומטית": the SENT archive, UPDATED and CONSULTANTS / RECEIVE / PERMIT / EXEC fill in; the message says how many; "שמור מפה" saves; reload shows them. Switch "מאוחד", save, reload. Switch the language to English: every new label is English, paths stay as typed, layout flips LTR.

- [ ] **Step 4: Check the window.** Open the window URL the stand-in printed.
  - Publish: the plan appears within a second with no "Claude" message; the DWG goes to `…/DWG`, the PDFs to `…/PDF` and to UPDATED with "מחליף קובץ קיים"; the hint says one file is not a PDF. Change the date → the day folder follows. Untick UPDATED → its dests go. "אשר ופרסם" → the stand-in prints the `inbox` task with the plan; the done view lists a 📂 per folder; 📂 sends an `open` task.
  - Receive: "קבצים שהתקבלו" → consultant KONS, "תכנית חדשה" → "גרסה חדשה: 4021-KONS-plans-v04" and the @ver box ticked; untick → the move line goes. Consultant HVAC → the name field appears with the hint, no @ver box. Another party → EXEC group listed.
  - "הצע עם Claude": with no Anthropic key locally the window says Claude is not available — the code plan is untouched until the choices change.
  - `read_console_messages` shows no errors. Take a screenshot of the publish plan and the receive version box.

- [ ] **Step 5: Stop the stand-in and the preview.** Nothing to commit.

---

## Part C — the Outlook pane (`outlook/taskpane.html`)

### Task 12: The filing card files without Claude

**Files:**
- Modify: `outlook/taskpane.html` (card HTML ~lines 203–245; `HE_EN` ~line 349; filing JS ~lines 899–1258; wiring ~line 1440)

- [ ] **Step 1: The card.** Replace

```html
    <div id="fileList" style="display:flex;flex-direction:column;gap:4px;margin-block-start:8px"></div>
    <div class="row" style="margin-block-start:6px;flex-wrap:nowrap">
      <input id="fText" class="grow" data-i18n-skip>
      <button class="primary" type="button" id="fPropose" data-t="הצע">הצע</button>
    </div>
    <div class="conv" id="fConv" data-i18n-skip></div>
    <div class="row" id="fConfirmRow" style="margin-block-start:6px" hidden>
      <button class="primary" type="button" id="fOk" data-t="אשר ותייק">אשר ותייק</button>
      <button type="button" id="fCancel" data-t="ביטול">ביטול</button>
    </div>
    <div class="row" id="fFixRow" style="margin-block-start:6px;flex-wrap:nowrap" hidden>
      <input id="fFix" class="grow" data-i18n-skip>
      <button type="button" id="fFixGo" data-t="שלח">שלח</button>
    </div>
```

with

```html
    <div id="fileList" style="display:flex;flex-direction:column;gap:4px;margin-block-start:8px"></div>
    <!-- without Claude: who sent the files, plans or documents, the new version; the server builds the plan in code -->
    <div id="fForm" style="display:flex;flex-direction:column;gap:6px;margin-block-start:8px">
      <label for="fFrom" data-t="ממי:">ממי:</label>
      <select id="fFrom" data-i18n-skip></select>
      <div class="row" id="fDocRow" hidden>
        <label style="display:flex;gap:4px;align-items:center"><input type="radio" name="fDoc" value="plan" style="width:auto" checked> <span data-t="תכניות (גרסה חדשה)">תכניות (גרסה חדשה)</span></label>
        <label style="display:flex;gap:4px;align-items:center"><input type="radio" name="fDoc" value="doc" style="width:auto"> <span data-t="מסמכים">מסמכים</span></label>
      </div>
      <div id="fVerRow" style="display:flex;flex-direction:column;gap:4px" hidden>
        <div class="hint" id="fVerText" data-i18n-skip></div>
        <input id="fVerName" dir="ltr" data-i18n-skip hidden>
        <div class="hint" id="fVerHint" data-t="שמות הגרסאות כאן אינם בצורה …-vNN, ולכן ההעברה ל-@ver מושבתת." hidden>שמות הגרסאות כאן אינם בצורה …-vNN, ולכן ההעברה ל-@ver מושבתת.</div>
        <label id="fToVerRow" style="display:flex;gap:4px;align-items:center" hidden><input type="checkbox" id="fToVer" style="width:auto"> <span id="fToVerText" data-i18n-skip></span></label>
      </div>
      <ul class="plan" id="fPlan" data-i18n-skip></ul>
      <div class="hint" id="fFormState"></div>
    </div>
    <div class="row" id="fConfirmRow" style="margin-block-start:6px" hidden>
      <button class="primary" type="button" id="fOk" data-t="אשר ותייק">אשר ותייק</button>
      <button type="button" id="fCancel" data-t="ביטול">ביטול</button>
    </div>
    <details id="fClaude" style="margin-block-start:6px">
      <summary class="hint" style="cursor:pointer" data-t="הצע עם Claude (לרוב לא צריך)">הצע עם Claude (לרוב לא צריך)</summary>
      <div class="row" style="margin-block-start:6px;flex-wrap:nowrap">
        <input id="fText" class="grow" data-i18n-skip>
        <button type="button" id="fPropose" data-t="הצע">הצע</button>
      </div>
      <div class="conv" id="fConv" data-i18n-skip></div>
      <div class="row" id="fFixRow" style="margin-block-start:6px;flex-wrap:nowrap" hidden>
        <input id="fFix" class="grow" data-i18n-skip>
        <button type="button" id="fFixGo" data-t="שלח">שלח</button>
      </div>
    </details>
```

- [ ] **Step 2: English.** In `HE_EN`, after `'הצע': 'Suggest',` add:

```js
  'ממי:': 'From:',
  'תכניות (גרסה חדשה)': 'Plans (new version)',
  'מסמכים': 'Documents',
  'שמות הגרסאות כאן אינם בצורה …-vNN, ולכן ההעברה ל-@ver מושבתת.': 'The versions here are not named …-vNN, so moving to @ver is off.',
  'הצע עם Claude (לרוב לא צריך)': 'Suggest with Claude (usually not needed)',
  'בחר…': 'Choose…',
  'קורא את התיקיות במחשב…': 'Reading the folders on your computer…',
  'עוזר התיוק לא הספיק לקרוא את התיקיות. נסה שוב.': 'The filing helper did not read the folders in time. Try again.',
  'קריאת התיקיות במחשב לא הצליחה. נסה שוב.': 'Reading the folders on your computer failed. Try again.',
  'יועצים': 'Consultants',
  'רשות, קבלן ואחרים': 'Authorities, the contractor and others',
  'אין לו תיקייה עדיין': 'no folder yet',
  'שם תיקיית הגרסה החדשה:': 'Name of the new version folder:',
  'גרסה חדשה: {v}': 'New version: {v}',
  'העבר את הגרסה הקיימת ({v}) ל-@ver': 'Move the current version ({v}) to @ver',
  'בונה את התוכנית…': 'Building the plan…',
  'סמן קובץ': 'Tick a file',
  'פתח בסייר הקבצים': 'Open in File Explorer',
  'בחר ממי הקבצים.': 'Choose who sent the files.',
  'בחר יועץ.': 'Choose a consultant.',
  'ליועץ הזה אין עדיין תיקייה בפרויקט.': 'This consultant has no folder in the project yet.',
  'בחר תכניות או מסמכים.': 'Choose plans or documents.',
  'בחר תיקייה.': 'Choose a folder.',
  'שם תיקיית הגרסה לא תקין, או שתיקייה בשם הזה כבר קיימת.': 'The version folder\'s name is not valid, or a folder of that name already exists.',
```

(Leave out any key that already exists in `HE_EN` — search first.)

- [ ] **Step 3: The code-plan functions.** After `function keyLabel(k) { … }` (line ~921) add:

```js
/* ── filing without Claude: who sent the files (a consultant — plans or documents — or another party's folder), and the
   server builds the plan in code from the project's tree (filing-options, filing-plan); "הצע" (Claude) stays for the rest ── */
var fOpts = null, fPlanTimer = null, fVerTouched = false;
var F_PROBLEM = {
  no_from: 'בחר ממי הקבצים.',
  no_consultant: 'בחר יועץ.',
  consultant_folder: 'ליועץ הזה אין עדיין תיקייה בפרויקט.',
  no_doc: 'בחר תכניות או מסמכים.',
  other_folder: 'בחר תיקייה.',
  name: 'שם תיקיית הגרסה לא תקין, או שתיקייה בשם הזה כבר קיימת.'
};
function fFormState(t) { $('fFormState').textContent = t || ''; }
function docChoice() { var r = document.querySelector('input[name="fDoc"]:checked'); return r ? r.value : 'plan'; }
function fromChoice() {
  var v = $('fFrom').value, o = fOpts;
  if (!v || !o) return null;
  if (v.indexOf('c:') === 0) { var c = o.consultants[+v.slice(2)]; return c ? { kind: 'consultant', folder: c.folder || '', name: c.label } : null; }
  var folder = v.slice(2), x = (o.others || []).find(function (y) { return y.folder === folder; });
  return { kind: 'other', folder: folder, name: x ? x.label : folder };
}
function fillFrom(o) {
  var s = $('fFrom');
  s.innerHTML = '';
  s.appendChild(new Option(tx('בחר…'), ''));
  var g1 = document.createElement('optgroup'); g1.label = tx('יועצים');
  o.consultants.forEach(function (c, i) {
    var opt = new Option(c.label + (c.contact && c.contact !== c.label ? ' · ' + c.contact : '') + (c.folder ? '' : ' — ' + tx('אין לו תיקייה עדיין')), 'c:' + i);
    opt.disabled = !c.folder;
    g1.appendChild(opt);
  });
  if (g1.children.length) s.appendChild(g1);
  var g2 = document.createElement('optgroup'); g2.label = tx('רשות, קבלן ואחרים');
  (o.others || []).forEach(function (x) { g2.appendChild(new Option(x.label, 'o:' + x.folder)); });
  if (g2.children.length) s.appendChild(g2);
  if (o.sender >= 0) s.value = 'c:' + o.sender;
  $('fDocRow').hidden = !(fromChoice() && fromChoice().kind === 'consultant');
}
// the tree's answers (as for a proposal): no folder, no helper, the folder not on this PC; true when the tree was read
function treeOk(r) {
  if (r.needsFolder) { fFormState(''); needFolder(); return false; }
  if (r.agent) { fFormState(tx(r.agent === 'none' ? HELPER_OFF : r.agent === 'slow' ? 'עוזר התיוק לא הספיק לקרוא את התיקיות. נסה שוב.' : 'קריאת התיקיות במחשב לא הצליחה. נסה שוב.')); return false; }
  if (r.missing) { fFormState(''); folderMissing(); return false; }
  return true;
}
/* a filing for the ticked attachments, named only: the helper saves them from classic Outlook on the PC, and what it
   cannot give is uploaded on confirm (needUpload) — so nothing goes through the server unless it must. A new filing
   when the ticked files changed. */
function readyFiling() {
  var keys = filingKeys(), sig = keys.join('|');
  if (fJob && fJob.sig === sig) return Promise.resolve(fJob);
  var named = keys.map(function (k) { var a = currentMail.attachments.find(function (x) { return 'att:' + x.id === k; }); return { name: a.name, size: a.size || 0, outlookId: a.id }; });
  return api('/api/outlook/filing', { projectId: fProj.pid, mail: mailRef(currentMail, true), files: named, lang: lang }).then(function (j) {
    fJob = { id: j.id, sig: sig, proposed: false, local: keys, pending: keys.length };
    fTurns = []; fPlan = null; fGuideAdd = ''; fOpts = null;
    return fJob;
  });
}
function schedulePlan() { clearTimeout(fPlanTimer); fPlanTimer = setTimeout(planFiling, 350); }
function planFiling() {
  if (!fProj || !fProj.canWrite || fBusy || fFiling) return;
  var gen = fGen;
  if (!filingKeys().length) { fPlan = null; renderPlan(null); fFormState(tx('סמן קובץ')); renderConv(); return; }
  fFormState(fOpts ? tx('בונה את התוכנית…') : tx('קורא את התיקיות במחשב…'));
  readyFiling().then(function (job) {
    if (gen !== fGen || fOpts) return true;
    return api('/api/outlook/filing-options?id=' + encodeURIComponent(job.id), {}).then(function (o) {
      if (gen !== fGen || !treeOk(o)) return false;
      fOpts = o; fillFrom(o);
      return true;
    });
  }).then(function (go) {
    if (!go || gen !== fGen || !fJob) return null;
    var from = fromChoice();
    var body = { from: from, doc: from && from.kind === 'consultant' ? docChoice() : '' };
    if (!$('fVerName').hidden && $('fVerName').value.trim()) body.versionName = $('fVerName').value.trim();
    if (fVerTouched) body.toVer = $('fToVer').checked;
    return api('/api/outlook/filing-plan?id=' + encodeURIComponent(fJob.id), body);
  }).then(function (r) {
    if (!r || gen !== fGen || !treeOk(r)) return;
    fFormState(r.problem ? tx(F_PROBLEM[r.problem] || r.problem) : '');
    fPlan = r.plan || null;
    fJob.proposed = true;
    renderVersion(r.version);
    renderPlan(fPlan);
    renderConv();
  }).catch(function (e) {
    if (gen !== fGen) return;
    fFormState('');
    if (e.message === 'busy') { schedulePlan(); return; }
    if (/^(expired|no_filing|confirmed)$/.test(e.message)) { fJob = null; fOpts = null; schedulePlan(); return; }
    fail(e);
  });
}
function renderVersion(v) {
  var show = !!v && !$('fDocRow').hidden && docChoice() === 'plan';
  $('fVerRow').hidden = !show;
  if (!show) return;
  $('fVerText').textContent = v.editable ? tx('שם תיקיית הגרסה החדשה:') : tx('גרסה חדשה: {v}', { v: iso(v.name) });
  $('fVerName').hidden = !v.editable;
  $('fVerName').placeholder = v.name;
  $('fVerHint').hidden = !v.editable;
  $('fToVerRow').hidden = !(v.prev && !v.editable);
  if (v.prev) $('fToVerText').textContent = tx('העבר את הגרסה הקיימת ({v}) ל-@ver', { v: iso(v.prev.split('/').pop()) });
  $('fToVer').checked = !!v.toVer;
}
// the plan's lines, and a 📂 for each target folder that is already there
function renderPlan(plan) {
  var ul = $('fPlan');
  ul.innerHTML = '';
  if (!plan) return;
  planLines(plan).forEach(function (l) { ul.appendChild(el('li', l)); });
  var made = (plan.steps || []).filter(function (s) { return s.op === 'mkdir'; }).map(function (s) { return s.path.toLowerCase(); });
  var seen = {};
  (plan.files || []).forEach(function (f) {
    if (f.dest === null) return;
    var k = f.dest.toLowerCase();
    if (seen[k] || made.indexOf(k) >= 0) return;
    seen[k] = true;
    var li = el('li'), b = el('button', '📂');
    b.type = 'button'; b.className = 'sm'; b.title = tx('פתח בסייר הקבצים');
    b.onclick = function () { openFolder(f.dest); };
    li.appendChild(b); li.appendChild(document.createTextNode(' ' + iso(where(f.dest))));
    ul.appendChild(li);
  });
}
```

- [ ] **Step 4: Opening the card starts the code plan.** In `openFiling`, replace

```js
  fProj = null; fJob = null; fTurns = []; fPlan = null; fGuideAdd = '';
  $('fText').value = ''; $('fFix').value = ''; $('fGuide').value = ''; $('fGuide').placeholder = '';
```

with

```js
  fProj = null; fJob = null; fTurns = []; fPlan = null; fGuideAdd = ''; fOpts = null; fVerTouched = false;
  $('fText').value = ''; $('fFix').value = ''; $('fGuide').value = ''; $('fGuide').placeholder = '';
  $('fFrom').innerHTML = ''; $('fVerName').value = ''; $('fDocRow').hidden = true; $('fVerRow').hidden = true;
  $('fClaude').open = false; renderPlan(null); fFormState('');
```

and replace

```js
    $('fMapNone').hidden = mapped;
    renderFolder();
  }).catch(fail);
```

with

```js
    $('fMapNone').hidden = mapped;
    renderFolder();
    if (p.canWrite && p.folder) schedulePlan();
  }).catch(fail);
```

- [ ] **Step 5: Claude's conversation only when there is one; 📂 per folder after filing.** In `renderConv`, replace `  $('fFixRow').hidden = !open;` with `  $('fFixRow').hidden = !(open && fTurns.length);`.

In `showFiled`, replace

```js
  if (n) {
    var b = el('button', tx('📂 פתח')); b.type = 'button'; b.className = 'sm'; b.style.alignSelf = 'start';
    b.onclick = function () { openFolder(files[0].dest); };
    box.appendChild(b);
  }
  renderConv();
```

with

```js
  var dirs = [];
  files.forEach(function (f) { if (dirs.indexOf(f.dest) < 0) dirs.push(f.dest); });
  dirs.forEach(function (d) {
    var b = el('button', tx('📂 פתח') + ' ' + iso(where(d))); b.type = 'button'; b.className = 'sm'; b.style.alignSelf = 'start';
    b.setAttribute('data-i18n-skip', '');
    b.onclick = function () { openFolder(d); };
    box.appendChild(b);
  });
  renderPlan(null);
  renderConv();
```

In `pickFolder`, plan again once a folder is picked — replace

```js
        if (r && r.picked) { fProj.folder = r.picked; fProj.root = r.root || ''; fHint(''); }
        else if (r && r.missing) folderMissing();
        else if (r) fHint('');
        renderFolder();
```

with

```js
        if (r && r.picked) { fProj.folder = r.picked; fProj.root = r.root || ''; fHint(''); fJob = null; fOpts = null; }
        else if (r && r.missing) folderMissing();
        else if (r) fHint('');
        renderFolder();
        if (r && r.picked) schedulePlan();
```

- [ ] **Step 6: Wiring.** After `  $('fCancel').onclick = clearResult;` add:

```js
  $('fileList').onchange = schedulePlan;
  $('fFrom').onchange = function () { $('fDocRow').hidden = !(fromChoice() && fromChoice().kind === 'consultant'); fVerTouched = false; $('fVerName').value = ''; schedulePlan(); };
  [].forEach.call(document.querySelectorAll('input[name="fDoc"]'), function (r) { r.onchange = function () { fVerTouched = false; $('fVerName').value = ''; schedulePlan(); }; });
  $('fVerName').oninput = schedulePlan;
  $('fToVer').onchange = function () { fVerTouched = true; schedulePlan(); };
```

- [ ] **Step 7: Check the Claude path still reuses the filing.** Read `proposeFiling` (~line 1053): with `fJob` set by `readyFiling` and the same ticked files, `fresh` is false and it goes straight to `filing-propose` on the same filing — correct (its files are named; confirm falls back to `needUpload`). No edit.

- [ ] **Step 8: Check in the demo pane.** With the local server running (HTTPS entry `outlook-addin` in `.claude/launch.json`, or `--https-port 3443`), open `https://localhost:3443/outlook/taskpane?demo`, paste a local key, choose a project with a mapped folder, click "תייק בתיקיית הפרויקט" while `fake-agent.js` (Task 11) runs: "ממי" fills, the plan lines appear, "אשר ותייק" shows; with a consultant chosen the version line and the @ver box appear. "הצע עם Claude" opens the old conversation. No console errors.

- [ ] **Step 9: Commit**

```bash
git add outlook/taskpane.html
git commit -m "feat(outlook): filing card files without Claude — who sent it, the next version, @ver; Claude on הצע"
```

---

## Part D — wrap-up

### Task 13: Docs and the full run

**Files:**
- Modify: `tools/file-helper/README.md` (first section)

- [ ] **Step 1: README.** After the first paragraph of `tools/file-helper/README.md` (the one ending "…ומאשרים."), add:

```markdown
**בלי Claude (ברירת המחדל):** בחלון תיבת הייצוא ובחלונית התוסף התוכנית נבנית בשרת בקוד (`tools/local-server/filing-plan.js`),
מהמפה של הפרויקט (הגדרות הפרויקט ← תיקיות הפרויקט: ארכיון SENT, חלוקה לפי סוג קובץ או מאוחד, UPDATED של PDF, והתחומים)
ומעץ התיקיות שהעוזר קורא. פרסום: SENT בתיקיית התאריך, UPDATED ל-PDF בלבד. קבלה: יועץ — תיקיית גרסה חדשה לפי הגרסאות
הקיימות ובחירה אם להעביר את הקודמת ל-@ver, או תיקיית ה-docs שלו; רשות, קבלן ואחרים — תת-התיקייה שנבחרה. Claude נקרא רק
בלחיצה על "הצע". התוכניות עוברות את אותן בדיקות, והעוזר מבצע אותן בדיוק כמו תוכנית של Claude.
```

- [ ] **Step 2: Full test run.**

Run: `cd tools/local-server && node --test "test/*.test.js"` → all pass.
Run: `node --test "tests/*.test.js" "tools/spec-creator/test/*.test.js"` → all pass.
Run: `node tools/i18n-extract.test.js` and `node tools/i18n-extract.js` → pass, nothing new listed.

- [ ] **Step 3: Commit**

```bash
git add tools/file-helper/README.md
git commit -m "docs(filing): filing without Claude in the helper's README"
```

- [ ] **Step 4: Before any deploy.** Other sessions push to `master` in parallel: merge `origin/master` into the branch first, run the tests again, and deploy only with the user's go-ahead (`.\Deploy-Azure.ps1 -Name kkarc-hub -CodeOnly`, then check `/api/version`). The PC helper does not change, so installed helpers need no update.
