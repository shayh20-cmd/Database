# English Translation Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Hebrew⇄English toggle across the three dashboards without adding any per-modification token cost to future feature work.

**Architecture:** Source files stay Hebrew-only. A runtime engine (`i18n.js`) translates the rendered DOM via a `MutationObserver` and a HE→EN dictionary, flipping `dir` to `ltr`. This plan commits the existing working engine, splits the churning dictionary out of the stable engine, adds an extractor script so new strings can't be silently forgotten, and stops user-entered data from being translated.

**Tech Stack:** Vanilla ES5-style JS (no build, no bundler), React 18 UMD precompiled to `React.createElement`, Node ≥18 for the extractor and its tests, `npx serve` for local preview.

**Spec:** [docs/superpowers/specs/2026-08-17-english-translation-design.md](../specs/2026-08-17-english-translation-design.md)

## Global Constraints

- **No build step, no bundler, no `package.json` dependencies.** Every file must run as-is in a browser or under bare `node`. The extractor uses only Node built-ins (`fs`, `path`, `assert`).
- **Engine JS must stay ES5-compatible in style** — `var`, `function`, no arrow functions or template literals in `i18n.js`/`i18n-dict.js`, matching the existing file.
- **Never write English into the three HTML files.** All English lives in `i18n-dict.js`. This is the entire point of the design.
- **Dictionary entry count is 1,457 with zero empty values** at the start of this work. Task 2 must preserve that exactly.
- **Repo root is `D:\Projects\@Delta Office\New folder\Database`.** Note the spaces and `@` — always quote paths in shell commands.
- Preview server: launch config name `database`, port 3400, serves the repo root.

## Verified facts (established before writing this plan — do not re-derive)

- The engine already works: toggling produces `dir=ltr`, translates chrome, and restores Hebrew **exactly** on toggle-back (originals cached in `node.__i18nHe`).
- User data renders as its **own whole text node**, not concatenated with chrome text. Confirmed: task title `אישור מעבדה לבנייה ירוקה` occupies a single text node under `.name-text`.
- Live DOM audit of `project_hub.html` classified every Hebrew text node by parent class:
  - **User data:** `.name-text` (task titles, 23 nodes), `.cmt` (notes, 15), `.proj-name` (1), `.sb-proj-btn` (project names, 4)
  - **Chrome:** `.sb-item`, `.sb-sub-item`, `.sb-section-label`, `.sb-create`, `.btn-tb`, `.btn-share`, `.btn-add-main`, `.add-task-btn`
  - **Deliberately left translating:** `.pill` (priority/discipline labels). These are UI vocabulary that happens to be user-editable. Translating them is correct for the common case; a user who renames a priority to a string matching a dictionary key will see it translated. Accepted.
- `i18n.js` structure: dictionary is lines 19–1486 (`var HE_EN = {` plus `Object.assign` chunks at 665 and 1040); engine begins at line 1488 (`/* ── Engine ── */`).
- `<script src="i18n.js">` appears once per file: `home_dashboard.html:1006`, `planning_dashboard.html:5760`, `project_hub.html:1212`.

---

## File Structure

| File | Responsibility | Churn |
|---|---|---|
| `i18n-dict.js` *(create)* | `HE_EN` map only, on `window`. Grows with every feature. | High |
| `i18n.js` *(rewrite to engine-only)* | Observer, regex, toggle button, dir flip, skip rules. | Low |
| `tools/i18n-extract.js` *(create)* | Reports Hebrew source strings missing from the dictionary. | Low |
| `tools/i18n-extract.test.js` *(create)* | Zero-dependency assert tests for the extractor's pure logic. | Low |
| `home_dashboard.html`, `planning_dashboard.html`, `project_hub.html` *(modify)* | One added `<script>` tag each. | — |

---

## Task 1: Get the existing work into git

The entire 1,457-entry dictionary is currently untracked. Nothing else in this plan is safe until it is committed.

**Files:**
- Commit (untracked): `i18n.js`, `planning_dashboard.html`
- Commit (modified): `home_dashboard.html`, `project_hub.html`
- Commit (new): `docs/superpowers/specs/2026-08-17-english-translation-design.md`, `docs/superpowers/plans/2026-08-17-english-translation.md`

**Interfaces:**
- Produces: a clean working tree on branch `English-translate` containing the working baseline engine.

- [ ] **Step 1: Confirm you are on the right branch**

```bash
git rev-parse --abbrev-ref HEAD
```

Expected output: `English-translate`. If not, stop and ask — do not switch branches.

- [ ] **Step 2: Record the dictionary baseline**

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('i18n.js','utf8');const c=s.slice(s.indexOf('var HE_EN'),s.indexOf('/* ── Engine ── */'))+';module.exports=HE_EN;';const m=new module.constructor();m._compile(c,'d.js');const k=Object.keys(m.exports);console.log('entries',k.length,'empty',k.filter(x=>!m.exports[x]).length);"
```

Expected output exactly: `entries 1457 empty 0`

Write that number down. Task 2 Step 5 checks against it.

- [ ] **Step 3: Stage the i18n work and the docs**

Stage deliberately — do **not** use `git add -A`. `.claude/settings.local.json` and `.claude/launch.json` carry unrelated local changes and must stay out.

```bash
git add i18n.js planning_dashboard.html home_dashboard.html project_hub.html docs/superpowers/specs/2026-08-17-english-translation-design.md docs/superpowers/plans/2026-08-17-english-translation.md
```

- [ ] **Step 4: Verify nothing unrelated got staged**

```bash
git status --short
```

Expected: the six files above appear staged (`A` or `M` in column 1). `.claude/launch.json` and `.claude/settings.local.json` must still show ` M` (unstaged). If they are staged, run `git restore --staged .claude/`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(i18n): add runtime Hebrew-to-English translation layer

Adds i18n.js: a MutationObserver-based engine that translates rendered
DOM text through a 1,457-entry HE->EN dictionary and flips dir to ltr,
so the precompiled React sources stay Hebrew-only.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Split the dictionary from the engine

**Files:**
- Create: `i18n-dict.js`
- Modify: `i18n.js` (remove lines 19–1486, add a global lookup)
- Modify: `home_dashboard.html:1006`, `planning_dashboard.html:5760`, `project_hub.html:1212`

**Interfaces:**
- Produces: `window.I18N_HE_EN` — a plain object, Hebrew string → English string. `i18n.js` reads it at boot and throws a clear console error if absent.

- [ ] **Step 1: Generate `i18n-dict.js` mechanically**

Do **not** hand-copy 1,467 lines — transcription will corrupt entries. Slice the file programmatically:

```bash
node -e "
const fs=require('fs');
const s=fs.readFileSync('i18n.js','utf8');
const start=s.indexOf('/* ── Dictionary: Hebrew → English ── */');
const end=s.indexOf('/* ── Engine ── */');
if(start<0||end<0) throw new Error('markers not found');
const body=s.slice(start,end).trim();
const header='/* ─────────────────────────────────────────────────────────────\n   i18n-dict.js — Hebrew → English dictionary.\n   Loaded before i18n.js, which reads window.I18N_HE_EN.\n\n   ADDING STRINGS: run \`node tools/i18n-extract.js\` to list Hebrew\n   strings present in the HTML but missing here, then append them to\n   the last Object.assign chunk below.\n\n   Do NOT put English into the HTML files — it all belongs here.\n   ───────────────────────────────────────────────────────────── */\n(function () {\n\'use strict\';\n\n';
const footer='\n\nwindow.I18N_HE_EN = HE_EN;\n})();\n';
fs.writeFileSync('i18n-dict.js', header+body+footer);
console.log('wrote i18n-dict.js');
"
```

Expected output: `wrote i18n-dict.js`

- [ ] **Step 2: Verify the extracted dictionary parses and is complete**

```bash
node --check i18n-dict.js && node -e "
global.window={};
require('./i18n-dict.js');
const k=Object.keys(window.I18N_HE_EN);
console.log('entries',k.length,'empty',k.filter(x=>!window.I18N_HE_EN[x]).length);
"
```

Expected output ends with exactly: `entries 1457 empty 0`

If the count differs from Task 1 Step 2, **stop** — the slice boundaries are wrong. Do not proceed.

- [ ] **Step 3: Strip the dictionary out of `i18n.js`**

```bash
node -e "
const fs=require('fs');
const s=fs.readFileSync('i18n.js','utf8');
const start=s.indexOf('/* ── Dictionary: Hebrew → English ── */');
const end=s.indexOf('/* ── Engine ── */');
const out=s.slice(0,start)+
'/* ── Dictionary (loaded from i18n-dict.js) ── */\n'+
'var HE_EN = window.I18N_HE_EN;\n'+
'if (!HE_EN) {\n'+
'  console.error(\'[i18n] i18n-dict.js must be loaded before i18n.js — translation disabled.\');\n'+
'  return;\n'+
'}\n\n'+
s.slice(end);
fs.writeFileSync('i18n.js', out);
console.log('engine trimmed to', out.split('\n').length, 'lines');
"
```

Expected output: `engine trimmed to 1xx lines` (roughly 175).

The `return` is valid here — the engine body is inside the top-level `(function () { ... })()` IIFE that begins at line 11.

- [ ] **Step 4: Update the header comment in `i18n.js`**

Replace the line `   Shared by: home_dashboard.html, planning_dashboard.html,` block's closing so it documents the new dependency. Open `i18n.js` and change the opening comment to read:

```js
/* ─────────────────────────────────────────────────────────────
   i18n.js — runtime Hebrew ⇄ English translation + RTL/LTR flip
   Shared by: home_dashboard.html, planning_dashboard.html,
              project_hub.html

   REQUIRES i18n-dict.js to be loaded FIRST (provides window.I18N_HE_EN).

   Adds a floating language-toggle button (top corner) and
   translates all rendered text via a MutationObserver, so the
   precompiled React apps need no source changes.
   Pages may tune the button position with:
     :root { --lang-toggle-top: <px>; --lang-toggle-end: <px>; }
   ───────────────────────────────────────────────────────────── */
```

- [ ] **Step 5: Syntax-check the engine**

```bash
node --check i18n.js
```

Expected: no output (success). A non-zero exit means the slice broke a brace — re-read the top and bottom of `i18n.js`.

- [ ] **Step 6: Add the dict `<script>` tag to all three HTML files**

The tag must come **before** `i18n.js` in each file.

```bash
node -e "
const fs=require('fs');
for (const f of ['home_dashboard.html','planning_dashboard.html','project_hub.html']) {
  let s=fs.readFileSync(f,'utf8');
  if (s.includes('i18n-dict.js')) { console.log(f,'already has it'); continue; }
  const before='<script src=\"i18n.js\"></script>';
  if (!s.includes(before)) throw new Error('tag not found in '+f);
  s=s.replace(before,'<script src=\"i18n-dict.js\"></script>'+before);
  fs.writeFileSync(f,s);
  console.log(f,'updated');
}
"
```

Expected output: three lines each ending `updated`.

- [ ] **Step 7: Verify in the browser**

Start the preview server (launch config `database`), open `http://localhost:3400/project_hub.html`, and run in the console:

```js
({ dictLoaded: !!window.I18N_HE_EN,
   entries: Object.keys(window.I18N_HE_EN || {}).length,
   toggle: !!document.getElementById('lang-toggle') })
```

Expected: `{ dictLoaded: true, entries: 1457, toggle: true }`

Then click the toggle and confirm `document.documentElement.dir === 'ltr'` and the sidebar reads English. Click again and confirm Hebrew returns. Check the console is free of errors.

- [ ] **Step 8: Commit**

```bash
git add i18n.js i18n-dict.js home_dashboard.html planning_dashboard.html project_hub.html
git commit -m "refactor(i18n): split dictionary into i18n-dict.js

Separates the high-churn 1,457-entry dictionary from the stable ~175-line
engine so adding strings never pulls the engine into the edit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Build the extractor with tests

**Files:**
- Create: `tools/i18n-extract.js`
- Create: `tools/i18n-extract.test.js`

**Interfaces:**
- Produces, exported from `tools/i18n-extract.js` via `module.exports`:
  - `extractHebrewLiterals(source: string) => string[]` — quoted literals containing ≥1 Hebrew char, de-duplicated, source order.
  - `loadDict(dictSource: string) => Object` — evaluates an `i18n-dict.js` source string and returns the `HE_EN` map.
  - `buildTranslator(dict: Object) => (s: string) => string` — replicates the engine's replacement exactly (longest-key-first alternation with Hebrew-boundary lookarounds).
  - `findUntranslated(sources: {file, text}[], dict: Object) => {file, items: {literal, residual}[]}[]`
- The CLI entry point runs only under `require.main === module`, so tests can import the functions without side effects.

> **Critical design note — do not "simplify" this to an exact key lookup.**
> The engine translates by **substring** replacement, so a source literal like
> `"תכנית קומות רלוונטיות 1:100"` is fully handled by the dictionary key
> `"תכנית קומות רלוונטיות"` even though the full literal is not a key.
> Measured against the real tree: an exact-match check reports **330**
> "missing" strings, while only **12** actually still render Hebrew after the
> engine runs. An exact-match tool would send you on a 330-string translation
> errand that is already done. The tool must therefore answer the only question
> that matters: *after the engine runs, what still shows Hebrew?*

- [ ] **Step 1: Write the failing test**

Create `tools/i18n-extract.test.js`:

```js
'use strict';
const assert = require('assert');
const { extractHebrewLiterals, loadDict, buildTranslator, findUntranslated } = require('./i18n-extract.js');

/* extractHebrewLiterals */
assert.deepStrictEqual(
  extractHebrewLiterals(`createElement('div',null,'שלום')`),
  ['שלום'],
  'single-quoted Hebrew literal'
);
assert.deepStrictEqual(
  extractHebrewLiterals(`const a="עברית", b='עוד';`),
  ['עברית', 'עוד'],
  'mixed quote styles'
);
assert.deepStrictEqual(
  extractHebrewLiterals(`const x='plain ascii'; const y="123";`),
  [],
  'ignores literals with no Hebrew'
);
assert.deepStrictEqual(
  extractHebrewLiterals(`'שלום' + 'שלום'`),
  ['שלום'],
  'de-duplicates'
);
assert.deepStrictEqual(
  extractHebrewLiterals(`'אמר "שלום" לו'`),
  ['אמר "שלום" לו'],
  'double quotes nested inside single quotes stay intact'
);
assert.deepStrictEqual(
  extractHebrewLiterals("`שלום ${name}`"),
  ['שלום ${name}'],
  'template literals are captured verbatim'
);

/* loadDict */
const dictSrc = `
(function () {
var HE_EN = { "שלום": "Hello", "עולם": "World" };
Object.assign(HE_EN, { "עוד": "More" });
window.I18N_HE_EN = HE_EN;
})();
`;
const dict = loadDict(dictSrc);
assert.deepStrictEqual(
  Object.keys(dict).sort(),
  ['עולם', 'עוד', 'שלום'].sort(),
  'collects keys across var and Object.assign chunks'
);
assert.strictEqual(dict['שלום'], 'Hello', 'values survive');

/* buildTranslator — must mirror the engine's substring behaviour */
const tr = buildTranslator(dict);
assert.strictEqual(tr('שלום'), 'Hello', 'exact key');
assert.strictEqual(tr('שלום עולם'), 'Hello World', 'two keys in one string');
assert.strictEqual(
  tr('שלום 1:100'),
  'Hello 1:100',
  'a longer literal is covered by a shorter key — THE case exact-matching gets wrong'
);
assert.strictEqual(tr('חדש'), 'חדש', 'unknown text is left alone');

/* findUntranslated */
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: `'שלום 1:100'` }], dict),
  [],
  'a literal fully covered by substring keys is NOT reported'
);
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: `'שלום' 'חדש'` }], dict),
  [{ file: 'a.html', items: [{ literal: 'חדש', residual: 'חדש' }] }],
  'reports only literals that still contain Hebrew after translation'
);
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: `'שלום'` }], dict),
  [],
  'files with nothing missing are omitted entirely'
);
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: `'שלום חדש'` }], dict),
  [{ file: 'a.html', items: [{ literal: 'שלום חדש', residual: 'Hello חדש' }] }],
  'residual shows which part is still Hebrew'
);

console.log('ALL TESTS PASSED');
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node tools/i18n-extract.test.js
```

Expected: `Error: Cannot find module './i18n-extract.js'`

- [ ] **Step 3: Write the implementation**

Create `tools/i18n-extract.js`:

```js
#!/usr/bin/env node
'use strict';
/* Reports Hebrew strings present in the dashboards but missing from i18n-dict.js.
   Zero dependencies. Run from the repo root:  node tools/i18n-extract.js */

const fs = require('fs');
const path = require('path');

const HEBREW = /[\u0590-\u05FF]/;
const FILES = ['home_dashboard.html', 'planning_dashboard.html', 'project_hub.html'];
const DICT = 'i18n-dict.js';

/* Walks the source character by character so quotes nested inside a differently
   quoted literal ("שלום" within '...') don't terminate it early. A regex cannot
   do this reliably across three quote styles with escapes. */
function extractHebrewLiterals(source) {
  const found = [];
  const seen = new Set();
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let buf = '';
      while (j < source.length) {
        if (source[j] === '\\') { buf += source[j] + source[j + 1]; j += 2; continue; }
        if (source[j] === quote) break;
        if (source[j] === '\n' && quote !== '`') { buf = null; break; }
        buf += source[j];
        j++;
      }
      if (buf === null) { i++; continue; }  /* unterminated: resume past the quote */
      if (HEBREW.test(buf) && !seen.has(buf)) { seen.add(buf); found.push(buf); }
      i = j + 1;
      continue;
    }
    i++;
  }
  return found;
}

/* Evaluate i18n-dict.js in a throwaway context to get the real map. The file is
   our own source, and evaluating it is far more robust than regex-scraping keys
   (which breaks on ternaries like `cond ? 'עברית' : 'x'`, where the string is
   also followed by a colon). */
function loadDict(dictSource) {
  const sandbox = { window: {} };
  const fn = new Function('window', dictSource + '\nreturn window.I18N_HE_EN;');
  return fn(sandbox.window) || {};
}

/* Mirrors i18n.js buildRegex()/tr() exactly: longest key first, with Hebrew
   boundary lookarounds so a key never matches inside a larger Hebrew word.
   If the engine's matching ever changes, change it here too. */
function buildTranslator(dict) {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  if (!keys.length) return s => s;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(
    '(?<![\\u0590-\\u05FF])(?:' + keys.map(esc).join('|') + ')(?![\\u0590-\\u05FF])',
    'g'
  );
  return s => s.replace(rx, m => (Object.prototype.hasOwnProperty.call(dict, m) ? dict[m] : m));
}

/* A literal is a gap only if Hebrew SURVIVES translation. `residual` is the
   post-translation text, which shows exactly which fragment is still missing. */
function findUntranslated(sources, dict) {
  const tr = buildTranslator(dict);
  const out = [];
  for (const { file, text } of sources) {
    const items = [];
    for (const literal of extractHebrewLiterals(text)) {
      const residual = tr(literal);
      if (HEBREW.test(residual)) items.push({ literal, residual });
    }
    if (items.length) out.push({ file, items });
  }
  return out;
}

function main() {
  const root = process.cwd();
  const dictPath = path.join(root, DICT);
  if (!fs.existsSync(dictPath)) {
    console.error('Cannot find ' + DICT + ' — run this from the repo root.');
    process.exit(2);
  }
  const dict = loadDict(fs.readFileSync(dictPath, 'utf8'));
  const sources = FILES
    .filter(f => fs.existsSync(path.join(root, f)))
    .map(f => ({ file: f, text: fs.readFileSync(path.join(root, f), 'utf8') }));

  const gaps = findUntranslated(sources, dict);
  const total = gaps.reduce((n, g) => n + g.items.length, 0);

  console.log('Dictionary: ' + Object.keys(dict).length + ' entries');
  if (!total) {
    console.log('Nothing renders as Hebrew in English mode. All covered.');
    return;
  }
  console.log('\n' + total + ' literal(s) still contain Hebrew after translation.\n');
  console.log('"residual" is what would actually render in English mode — the Hebrew');
  console.log('left in it is the real gap. Some hits are non-UI (Hebrew code comments,');
  console.log('minified template-literal fragments) — skip those.\n');
  console.log('Append genuine strings to the last Object.assign chunk in ' + DICT + ':\n');
  for (const g of gaps) {
    console.log('/* ' + g.file + ' */');
    for (const it of g.items) {
      if (it.residual !== it.literal) console.log('  // renders as: ' + JSON.stringify(it.residual));
      console.log('  ' + JSON.stringify(it.literal) + ': "",');
    }
    console.log('');
  }
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { extractHebrewLiterals, loadDict, buildTranslator, findUntranslated };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node tools/i18n-extract.test.js
```

Expected output: `ALL TESTS PASSED`

- [ ] **Step 5: Run the extractor against the real tree**

```bash
node tools/i18n-extract.js
```

Expected: `Dictionary: 1457 entries`, then **roughly 12 items, all from `project_hub.html`** — `home_dashboard.html` and `planning_dashboard.html` should report nothing. This was measured against the real tree before this plan was written.

The 12, verbatim:

| Literal | Verdict |
|---|---|
| `"א"` `"ב"` `"ג"` `"ד"` `"ה"` `"ו"` `"ש"` | Genuine — stage labels (`שלב א׳`). Safe to add: the engine's boundary lookarounds stop a single-letter key from matching inside a word. |
| `"מ- "` | Genuine — a `from-` prefix fragment. |
| `" מ\"ר"` | Genuine — the `sqm` unit suffix. |
| `"עדכון ≥${fEventDays}י"` | Genuine but **composed at runtime**. Add the static part (`"עדכון ≥"`) rather than the whole literal. |
| `` "}},xy?`${xy.elapsed}/${xy.total}`:g.targetDate?`${…" `` ×2 | **False positive.** A backtick inside minified code starts what the scanner reads as a literal. Ignore. |

If you instead see a number in the **hundreds**, the tool has regressed to exact-key matching — re-read the Critical design note above. If you see thousands, `extractHebrewLiterals` is broken.

Do **not** translate anything as part of this task. This step only proves the tool reports the right shape of result.

- [ ] **Step 6: Commit**

```bash
git add tools/i18n-extract.js tools/i18n-extract.test.js
git commit -m "feat(i18n): add extractor for untranslated Hebrew strings

node tools/i18n-extract.js diffs Hebrew literals in the dashboards
against i18n-dict.js and prints only what is missing, so adding a
feature costs one translation pass over new strings rather than a
re-scan of the whole tree.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Stop translating user-entered data

**Files:**
- Modify: `i18n.js` (the `skip()` function and a new constant)

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the split engine.
- Produces: `USER_DATA_SEL` — a CSS selector string; any element matching it, or descending from one, is left untranslated.

A class-based selector is used rather than per-site `data-i18n-skip` attributes because user data renders through a small number of shared container classes; tagging ~100 individual `createElement` call sites would be far more invasive and easy to get wrong.

- [ ] **Step 1: Add the selector constant**

In `i18n.js`, immediately after the `var ATTRS = [...]` line, add:

```js
/* Containers that render user-entered data (task titles, project names, notes).
   Their contents are never translated — a project named in Hebrew is a proper
   noun and should stay Hebrew even in English mode.
   When adding a component that renders stored data, add its class here or put
   data-i18n-skip on the element. */
var USER_DATA_SEL = '.name-text,.cmt,.proj-name,.sb-proj-btn';
```

- [ ] **Step 2: Extend `skip()` to honour it**

Find this function in `i18n.js`:

```js
function skip(node) {
  var el = node.nodeType === 3 ? node.parentElement : node;
  if (!el) return false;
  if (el.closest && el.closest('#lang-toggle,[data-i18n-skip],[contenteditable="true"],script,style')) return true;
  var tag = el.tagName;
  return tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT';
}
```

Replace the `el.closest(...)` line with:

```js
  if (el.closest && el.closest('#lang-toggle,[data-i18n-skip],[contenteditable="true"],script,style,' + USER_DATA_SEL)) return true;
```

- [ ] **Step 3: Syntax-check**

```bash
node --check i18n.js
```

Expected: no output.

- [ ] **Step 4: Verify user data is protected but chrome still translates**

Serve the repo, open `http://localhost:3400/project_hub.html`, click the language toggle to English, then run in the console:

```js
({
  chrome_shouldBeEnglish: document.querySelector('.sb-section-label')?.textContent,
  projName_shouldBeHebrew: document.querySelector('.proj-name')?.textContent,
  taskTitles_shouldBeHebrew: [...document.querySelectorAll('.name-text')].slice(0,3).map(e => e.textContent),
  dir: document.documentElement.dir
})
```

Expected:
- `chrome_shouldBeEnglish` → `"My projects"`
- `projName_shouldBeHebrew` → `"ספריית לוד"` (**not** `"Lod Library"`)
- `taskTitles_shouldBeHebrew` → Hebrew strings such as `"מעקב לוחות זמנים"` (**not** `"Schedule tracking"`)
- `dir` → `"ltr"`

Before this task those same selectors returned `"Lod Library"` and `"Schedule tracking"`, so this check genuinely distinguishes fixed from unfixed.

- [ ] **Step 5: Verify the rename case from the spec**

Still in English mode, rename a task to a string that exists as a dictionary key, then confirm it does not translate:

```js
(() => {
  const el = document.querySelector('.name-text');
  const original = el.textContent;
  el.textContent = 'מעקב לוחות זמנים';
  return new Promise(r => setTimeout(() => {
    const after = el.textContent;
    el.textContent = original;
    r({ after, stillHebrew: after === 'מעקב לוחות זמנים' });
  }, 150));
})()
```

Expected: `{ after: 'מעקב לוחות זמנים', stillHebrew: true }`

This exercises the `MutationObserver` path specifically — a `characterData` mutation inside a protected container must be ignored. If `stillHebrew` is `false`, `skip()` is not being consulted on the observer path.

- [ ] **Step 6: Reset language state**

```js
document.getElementById('lang-toggle').click();
localStorage.removeItem('appLang');
```

- [ ] **Step 7: Commit**

```bash
git add i18n.js
git commit -m "fix(i18n): never translate user-entered data

Project names, task titles and notes are proper nouns and must survive
the English toggle unchanged. Adds a class-based skip selector rather
than tagging ~100 individual render sites.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Full end-to-end verification

**Files:** none modified — this task only verifies.

- [ ] **Step 1: Static checks**

```bash
node --check i18n.js && node --check i18n-dict.js && node --check tools/i18n-extract.js && node tools/i18n-extract.test.js
```

Expected: ends with `ALL TESTS PASSED`.

- [ ] **Step 2: Dictionary integrity unchanged since Task 1**

```bash
node -e "global.window={};require('./i18n-dict.js');const k=Object.keys(window.I18N_HE_EN);console.log('entries',k.length,'empty',k.filter(x=>!window.I18N_HE_EN[x]).length);"
```

Expected exactly: `entries 1457 empty 0`

- [ ] **Step 3: Verify all three pages in the browser**

For each of `home_dashboard.html`, `planning_dashboard.html`, `project_hub.html` at `http://localhost:3400/`:

1. Load the page. Confirm no console errors.
2. Confirm the 🌐 toggle button is visible and not overlapping page chrome.
3. Toggle to English — confirm `dir="ltr"` and that navigation, buttons, and column headers are English.
4. Toggle back — confirm Hebrew is restored and `dir="rtl"`.
5. Reload while in English — confirm the page loads English with **no flash of RTL** (the `<head>` script handles this).

- [ ] **Step 4: Record known-imperfect layout**

English mode ships with some chrome positioned on the wrong side — 158 physical `left`/`right` CSS declarations remain unconverted, and many are intentional (JS-computed Gantt bar coordinates). This is out of scope per the spec.

While on each page in English mode, note any visibly broken element and append a short list to the spec's "Out of scope" section as input for the follow-up RTL audit. Do not fix them here.

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "docs(i18n): record LTR layout issues for follow-up RTL audit

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

If Step 4 produced no notes, skip this commit.

---

## Follow-up work (not in this plan)

1. **RTL→LTR CSS audit** — 158 physical `left`/`right` declarations across the three files, against 85 already converted. Requires judgment: Gantt bar positioning in `project_hub.html` is computed in JS and must stay physical.
2. **Translate the extractor's real backlog** — Task 3 Step 5 will surface genuine missing strings. Working through them is its own pass.
3. **English seed dataset** — if all-English demos are wanted, select an English sample dataset at seed time rather than translating user content.
