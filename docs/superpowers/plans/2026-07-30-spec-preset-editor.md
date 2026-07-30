# Spec Preset Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **⚙ ניהול תבניות** (Manage Templates) screen to Spec Creator that lets the architect create/duplicate/delete/rename PRESETs and toggle relevance down to the clause / sub-clause level.

**Architecture:** A preset gains one field — `excludedClauseIds[]` (a blacklist). Clause inclusion = "sub-chapter is in the whitelist AND neither the clause nor any ancestor is in the blacklist". Pure, immutable logic lives in a new UMD file `preset-ops.js` (node-tested); React components in `spec_creator.html` render the library as a tri-state checkbox tree and save via the existing `/api/spec-library` route.

**Tech Stack:** Vanilla UMD JS (pure logic), React 18 (single-file HTML via Babel standalone), `node:test`, existing Node local-server.

**Spec:** `docs/superpowers/specs/2026-07-30-spec-preset-editor-design.md`

---

## File Structure

- **Create** `tools/spec-creator/lib/preset-ops.js` — pure tri-state resolvers + toggles + preset CRUD. Exposes `window.SpecPreset`.
- **Create** `tools/spec-creator/test/preset-ops.test.js` — node tests for the above.
- **Modify** `tools/spec-creator/lib/project.js` — prune `excludedClauseIds` when snapshotting a project.
- **Modify** `tools/spec-creator/test/project.test.js` — add prune tests.
- **Modify** `spec_creator.html` — script include + cache-bust, `persistLibrary` wiring, gear button, `PresetManager` / `PresetTreeEditor` / `ClauseNode` / `TriCheck` components, CSS.

No server changes — `/api/spec-library` already exists in the `APPS` map.

---

### Task 1: Pure preset logic — `preset-ops.js`

**Files:**
- Create: `tools/spec-creator/lib/preset-ops.js`
- Test: `tools/spec-creator/test/preset-ops.test.js`

- [ ] **Step 1: Write the failing test**

Create `tools/spec-creator/test/preset-ops.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/preset-ops.js');

function chapter() {
  return { num: 9, name: 'טיח', discipline: 'ARCH', subChapters: [
    { id: 's1', title: 'כללי', clauses: [
      { id: 'c1', text: 'תכולות', kind: 'heading', children: [
        { id: 'c1a', text: 'א', kind: 'paragraph', children: [] },
        { id: 'c1b', text: 'ב', kind: 'paragraph', children: [] },
      ] },
      { id: 'c2', text: 'תקן', kind: 'standard', children: [] },
    ] },
    { id: 's2', title: 'ביצוע', clauses: [] },
  ] };
}
function preset() {
  return { id: 'p', name: 'ת', buildingType: '',
    selections: [ { chapterNum: 9, subChapterIds: ['s1', 's2'] } ], excludedClauseIds: [] };
}
const c1 = () => chapter().subChapters[0].clauses[0];

test('resolveClauseState: leaf on, parent all-on is on', () => {
  assert.strictEqual(P.resolveClauseState(preset(), chapter().subChapters[0].clauses[1]), 'on');
  assert.strictEqual(P.resolveClauseState(preset(), c1()), 'on');
});

test('resolveClauseState: one excluded child makes parent partial, both makes off', () => {
  let pr = P.toggleClause(preset(), c1().children[0], false); // exclude c1a
  assert.strictEqual(P.resolveClauseState(pr, c1()), 'partial');
  pr = P.toggleClause(pr, c1().children[1], false);           // exclude c1b too
  assert.strictEqual(P.resolveClauseState(pr, c1()), 'off');
});

test('toggleClause off excludes only the subtree root, not descendants', () => {
  const pr = P.toggleClause(preset(), c1(), false);
  assert.deepStrictEqual(pr.excludedClauseIds, ['c1']);
  assert.strictEqual(P.resolveClauseState(pr, c1()), 'off');
});

test('toggleClause on a parent clears its whole subtree from the blacklist', () => {
  let pr = P.toggleClause(preset(), c1().children[0], false);
  pr = P.toggleClause(pr, c1().children[1], false);
  assert.deepStrictEqual(pr.excludedClauseIds.sort(), ['c1a', 'c1b']);
  pr = P.toggleClause(pr, c1(), true); // turn parent back on
  assert.deepStrictEqual(pr.excludedClauseIds, []);
  assert.strictEqual(P.resolveClauseState(pr, c1()), 'on');
});

test('toggleClause is immutable', () => {
  const orig = preset();
  P.toggleClause(orig, c1(), false);
  assert.deepStrictEqual(orig.excludedClauseIds, []);
});

test('resolveSubChapterState: included+all-on = on, empty-but-included = on, not included = off', () => {
  assert.strictEqual(P.resolveSubChapterState(preset(), 9, chapter().subChapters[0]), 'on');
  assert.strictEqual(P.resolveSubChapterState(preset(), 9, chapter().subChapters[1]), 'on');
  const off = P.toggleSubChapter(preset(), 9, 's1', false);
  assert.strictEqual(P.resolveSubChapterState(off, 9, chapter().subChapters[0]), 'off');
});

test('toggleSubChapter removes empty selection entry', () => {
  let pr = P.toggleSubChapter(preset(), 9, 's1', false);
  assert.deepStrictEqual(pr.selections[0].subChapterIds, ['s2']);
  pr = P.toggleSubChapter(pr, 9, 's2', false);
  assert.deepStrictEqual(pr.selections, []);
});

test('resolveChapterState: all on, partial, off', () => {
  assert.strictEqual(P.resolveChapterState(preset(), chapter()), 'on');
  const partial = P.toggleSubChapter(preset(), 9, 's2', false);
  assert.strictEqual(P.resolveChapterState(partial, chapter()), 'partial');
  const off = P.toggleChapter(preset(), chapter(), false);
  assert.strictEqual(P.resolveChapterState(off, chapter()), 'off');
});

test('toggleChapter on selects every sub-chapter id', () => {
  const off = P.toggleChapter(preset(), chapter(), false);
  const on = P.toggleChapter(off, chapter(), true);
  assert.deepStrictEqual(on.selections[0].subChapterIds.sort(), ['s1', 's2']);
});

test('createPreset is empty; duplicatePreset deep-copies with a new id', () => {
  const np = P.createPreset('חדש', 'מגורים');
  assert.deepStrictEqual(np.selections, []);
  assert.deepStrictEqual(np.excludedClauseIds, []);
  assert.ok(np.id);
  const dup = P.duplicatePreset(preset(), 'עותק');
  assert.notStrictEqual(dup.id, 'p');
  assert.strictEqual(dup.name, 'עותק');
  dup.selections[0].subChapterIds.push('zzz');
  assert.deepStrictEqual(preset().selections[0].subChapterIds, ['s1', 's2']); // original untouched
});

test('backward compat: preset without excludedClauseIds behaves as empty blacklist', () => {
  const legacy = { id: 'l', name: 'x', buildingType: '', selections: [ { chapterNum: 9, subChapterIds: ['s1'] } ] };
  assert.strictEqual(P.resolveClauseState(legacy, c1()), 'on');
  const pr = P.toggleClause(legacy, c1(), false);
  assert.deepStrictEqual(pr.excludedClauseIds, ['c1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/spec-creator/test/preset-ops.test.js`
Expected: FAIL — `Cannot find module '../lib/preset-ops.js'`.

- [ ] **Step 3: Write the implementation**

Create `tools/spec-creator/lib/preset-ops.js`:

```js
'use strict';
(function () {
  function genId() { return Math.random().toString(36).slice(2, 12); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function exSet(preset) { return new Set((preset && preset.excludedClauseIds) || []); }

  function selFor(preset, chapterNum) {
    return ((preset && preset.selections) || []).find(function (s) { return s.chapterNum === chapterNum; }) || null;
  }
  function subIncluded(preset, chapterNum, subId) {
    var s = selFor(preset, chapterNum);
    return !!(s && s.subChapterIds.indexOf(subId) !== -1);
  }
  function subtreeIds(clause) {
    var ids = [clause.id];
    (clause.children || []).forEach(function (c) { ids = ids.concat(subtreeIds(c)); });
    return ids;
  }

  // Local tri-state for a clause (self + descendants), ignoring ancestor context.
  function resolveClauseState(preset, clause) {
    var ex = exSet(preset);
    if (ex.has(clause.id)) return 'off';
    var kids = clause.children || [];
    if (!kids.length) return 'on';
    var states = kids.map(function (k) { return resolveClauseState(preset, k); });
    if (states.every(function (s) { return s === 'on'; })) return 'on';
    if (states.every(function (s) { return s === 'off'; })) return 'off';
    return 'partial';
  }
  function resolveSubChapterState(preset, chapterNum, subChapter) {
    if (!subIncluded(preset, chapterNum, subChapter.id)) return 'off';
    var clauses = subChapter.clauses || [];
    if (!clauses.length) return 'on';
    var states = clauses.map(function (c) { return resolveClauseState(preset, c); });
    if (states.every(function (s) { return s === 'on'; })) return 'on';
    if (states.every(function (s) { return s === 'off'; })) return 'off';
    return 'partial';
  }
  function resolveChapterState(preset, chapter) {
    var subs = chapter.subChapters || [];
    if (!subs.length) return 'off';
    var states = subs.map(function (s) { return resolveSubChapterState(preset, chapter.num, s); });
    if (states.every(function (s) { return s === 'on'; })) return 'on';
    if (states.every(function (s) { return s === 'off'; })) return 'off';
    return 'partial';
  }

  function toggleClause(preset, clause, on) {
    var ids = subtreeIds(clause);
    var ex = exSet(preset);
    ids.forEach(function (id) { ex.delete(id); }); // clear subtree either way
    if (!on) ex.add(clause.id);                    // exclude only the root
    var next = clone(preset);
    next.excludedClauseIds = Array.from(ex);
    return next;
  }
  function toggleSubChapter(preset, chapterNum, subId, on) {
    var next = clone(preset);
    next.selections = next.selections || [];
    var s = next.selections.find(function (x) { return x.chapterNum === chapterNum; });
    if (on) {
      if (!s) { s = { chapterNum: chapterNum, subChapterIds: [] }; next.selections.push(s); }
      if (s.subChapterIds.indexOf(subId) === -1) s.subChapterIds.push(subId);
    } else if (s) {
      s.subChapterIds = s.subChapterIds.filter(function (id) { return id !== subId; });
      if (!s.subChapterIds.length) {
        next.selections = next.selections.filter(function (x) { return x.chapterNum !== chapterNum; });
      }
    }
    return next;
  }
  function toggleChapter(preset, chapter, on) {
    var next = clone(preset);
    next.selections = (next.selections || []).filter(function (x) { return x.chapterNum !== chapter.num; });
    if (on) {
      next.selections.push({ chapterNum: chapter.num,
        subChapterIds: (chapter.subChapters || []).map(function (s) { return s.id; }) });
    }
    return next;
  }

  function createPreset(name, buildingType) {
    return { id: genId(), name: name || '', buildingType: buildingType || '',
             selections: [], excludedClauseIds: [] };
  }
  function duplicatePreset(preset, newName) {
    var c = clone(preset);
    c.id = genId();
    c.name = newName != null ? newName : preset.name;
    c.selections = c.selections || [];
    c.excludedClauseIds = c.excludedClauseIds || [];
    return c;
  }

  var api = { resolveClauseState: resolveClauseState, resolveSubChapterState: resolveSubChapterState,
              resolveChapterState: resolveChapterState, toggleClause: toggleClause,
              toggleSubChapter: toggleSubChapter, toggleChapter: toggleChapter,
              createPreset: createPreset, duplicatePreset: duplicatePreset,
              subtreeIds: subtreeIds, genId: genId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecPreset = api;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/spec-creator/test/preset-ops.test.js`
Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tools/spec-creator/lib/preset-ops.js tools/spec-creator/test/preset-ops.test.js
git commit -m "feat(spec-creator): pure preset tri-state logic (preset-ops.js)"
```

---

### Task 2: Prune excluded clauses when snapshotting — `project.js`

**Files:**
- Modify: `tools/spec-creator/lib/project.js`
- Test: `tools/spec-creator/test/project.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tools/spec-creator/test/project.test.js`:

```js
test('createProjectFromPreset prunes excluded clauses (and their subtree)', () => {
  const l = {
    chapters: [ { num: 1, name: 'x', discipline: 'ARCH', subChapters: [
      { id: 'a', title: 'כללי', clauses: [
        { id: 'k1', text: 'keep', kind: 'paragraph', children: [] },
        { id: 'd1', text: 'drop', kind: 'paragraph', children: [
          { id: 'd1a', text: 'child', kind: 'paragraph', children: [] } ] },
      ] } ] } ],
    presets: [ { id: 'p', name: 'n', buildingType: 'b',
      selections: [ { chapterNum: 1, subChapterIds: ['a'] } ], excludedClauseIds: ['d1'] } ],
  };
  const proj = createProjectFromPreset(l, 'p', {});
  const cls = proj.chapters[0].subChapters[0].clauses;
  assert.deepStrictEqual(cls.map(c => c.id), ['k1']); // d1 and its child d1a are gone
});

test('createProjectFromPreset without excludedClauseIds keeps every clause', () => {
  const proj = createProjectFromPreset(lib, 'p1', {});
  const subA = proj.chapters.find(c => c.num === 12).subChapters.find(s => s.id === 'a');
  assert.strictEqual(subA.clauses.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tools/spec-creator/test/project.test.js`
Expected: FAIL — the prune test finds `['k1','d1']` instead of `['k1']` (excludedClauseIds not yet honored).

- [ ] **Step 3: Implement the prune**

In `tools/spec-creator/lib/project.js`, add a helper above `createProjectFromPreset` (after `deepCopy`):

```js
  function pruneExcluded(clauses, ex) {
    const out = [];
    (clauses || []).forEach(function (c) {
      if (ex.has(c.id)) return;                       // dropping a node drops its whole subtree
      c.children = pruneExcluded(c.children, ex);
      out.push(c);
    });
    return out;
  }
```

Then, inside `createProjectFromPreset`, after the `preset` lookup add:

```js
    const ex = new Set(preset.excludedClauseIds || []);
```

and change the sub-chapter mapping's clauses line from:

```js
                   clauses: deepCopy(s.clauses) };
```

to:

```js
                   clauses: pruneExcluded(deepCopy(s.clauses), ex) };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tools/spec-creator/test/project.test.js`
Expected: PASS — all tests (old + new) pass.

- [ ] **Step 5: Bump the cache-bust for project.js in the HTML**

In `spec_creator.html`, change line ~172 from:

```html
<script src="tools/spec-creator/lib/project.js?v=2"></script>
```

to:

```html
<script src="tools/spec-creator/lib/project.js?v=3"></script>
```

- [ ] **Step 6: Commit**

```bash
git add tools/spec-creator/lib/project.js tools/spec-creator/test/project.test.js spec_creator.html
git commit -m "feat(spec-creator): prune excluded clauses when creating a project"
```

---

### Task 3: Manager shell — script include, save wiring, gear button, preset list

**Files:**
- Modify: `spec_creator.html`

- [ ] **Step 1: Include `preset-ops.js`**

In `spec_creator.html`, immediately after the `tree-ops.js` include (line ~173) add:

```html
<script src="tools/spec-creator/lib/preset-ops.js?v=1"></script>
```

- [ ] **Step 2: Add `persistLibrary` + `managing` state in `App`**

In `App()`, after the `saveTimer` ref (line ~191) add a second timer ref and a `managing` state next to `wizard`:

```js
  const [managing, setManaging] = useState(false);
  const libSaveTimer = useRef(null);
```

After the `persist` callback (ends ~line 206) add:

```js
  const persistLibrary = useCallback((next) => {
    setLibrary(next);
    clearTimeout(libSaveTimer.current);
    libSaveTimer.current = setTimeout(() => apiPost('spec-library', { ...next, _ts: Date.now() }), 400);
  }, []);
```

- [ ] **Step 3: Route to the manager**

In `App()`'s render, just before the final `return <ProjectsView .../>` (line ~219), add:

```js
  if (managing) {
    return <PresetManager library={library} onChange={persistLibrary} onClose={() => setManaging(false)} />;
  }
```

and add the `onManage` prop to the `ProjectsView` element:

```js
  return <ProjectsView projects={projects} library={library} wizard={wizard}
                       setWizard={setWizard} onManage={() => setManaging(true)}
                       onOpen={setActiveId}
                       onCreate={(proj) => { persist({ items: [...projects.items, proj] }); setWizard(false); setActiveId(proj.id); }} />;
```

- [ ] **Step 4: Add the gear button in `ProjectsView`**

Change the `ProjectsView` signature to accept `onManage` and render the button next to "פרויקט חדש". Replace the line:

```js
      {!wizard && <button className="btn primary" onClick={() => setWizard(true)}>＋ פרויקט חדש</button>}
```

with:

```js
      {!wizard && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn primary" onClick={() => setWizard(true)}>＋ פרויקט חדש</button>
          <button className="btn" onClick={onManage}>⚙ ניהול תבניות</button>
        </div>
      )}
```

(Update the destructured props: `function ProjectsView({ projects, library, wizard, setWizard, onManage, onOpen, onCreate }) {`.)

- [ ] **Step 5: Add the `PresetManager` component**

Add this component near `ProjectsView` (before `Wizard`):

```js
function PresetManager({ library, onChange, onClose }) {
  const presets = library.presets || [];
  const [selId, setSelId] = useState((presets[0] || {}).id || null);
  const sel = presets.find(p => p.id === selId) || null;

  const setPresets = (next) => onChange({ ...library, presets: next });
  const updatePreset = (p) => setPresets(presets.map(x => x.id === p.id ? p : x));
  const addPreset = () => {
    const p = window.SpecPreset.createPreset('תבנית חדשה', '');
    setPresets([...presets, p]); setSelId(p.id);
  };
  const dupPreset = () => {
    if (!sel) return;
    const p = window.SpecPreset.duplicatePreset(sel, sel.name + ' (עותק)');
    setPresets([...presets, p]); setSelId(p.id);
  };
  const delPreset = (id) => {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    if (selId === id) setSelId((next[0] || {}).id || null);
  };

  return (
    <div className="pv">
      <div className="pm-head">
        <h1>ניהול תבניות</h1>
        <button className="btn" onClick={onClose}>← פרויקטים</button>
      </div>
      <div className="preset-mgr">
        <div className="preset-list">
          {presets.map(p => (
            <div key={p.id} className={'preset-item' + (p.id === selId ? ' active' : '')}
                 onClick={() => setSelId(p.id)}>
              <span className="pi-name">{p.name || '(ללא שם)'}</span>
              <button className="pi-del" onClick={(e) => { e.stopPropagation(); delPreset(p.id); }}>מחק</button>
            </div>
          ))}
          <div className="preset-actions">
            <button className="btn" onClick={addPreset}>＋ תבנית</button>
            <button className="btn" onClick={dupPreset} disabled={!sel}>שכפל</button>
          </div>
        </div>
        <div className="preset-editor">
          {sel ? (
            <div>
              <label className="pe-label">שם התבנית</label>
              <input className="pe-input" value={sel.name || ''}
                     onChange={(e) => updatePreset({ ...sel, name: e.target.value })} />
              <label className="pe-label">סוג מבנה</label>
              <input className="pe-input" value={sel.buildingType || ''}
                     onChange={(e) => updatePreset({ ...sel, buildingType: e.target.value })} />
              <PresetTreeEditor library={library} preset={sel} onChange={updatePreset} />
            </div>
          ) : <p className="pe-empty">אין תבניות — צור תבנית חדשה.</p>}
        </div>
      </div>
    </div>
  );
}
```

> Note: `PresetTreeEditor` is defined in Task 4. Until then, temporarily stub it so the shell renders — add `function PresetTreeEditor() { return <div className="pt-todo">עץ הספרייה — Task 4</div>; }` just below `PresetManager`. Task 4 replaces this stub.

- [ ] **Step 6: Add manager CSS**

In the `<style>` block of `spec_creator.html`, append:

```css
.pm-head { display: flex; justify-content: space-between; align-items: center; }
.preset-mgr { display: flex; gap: 16px; margin-top: 16px; align-items: flex-start; }
.preset-list { width: 240px; flex: 0 0 240px; }
.preset-item { display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 8px 10px; border: 1px solid #d9dee5; border-radius: 8px; margin-bottom: 6px; cursor: pointer; }
.preset-item.active { border-color: #2d6cdf; background: #eef3fe; }
.preset-item .pi-del { border: 0; background: transparent; color: #b23; cursor: pointer; font-size: 12px; }
.preset-actions { display: flex; gap: 8px; margin-top: 8px; }
.preset-editor { flex: 1 1 auto; min-width: 0; }
.pe-label { display: block; font-size: 12px; color: #667; margin: 8px 0 4px; }
.pe-input { width: 320px; max-width: 100%; padding: 6px 8px; border: 1px solid #d9dee5; border-radius: 6px; }
.pe-empty { color: #889; }
```

- [ ] **Step 7: Verify the shell in the browser**

Use the Browser pane:
1. `preview_start` with `{ name: "spec-creator" }`.
2. `navigate` to `http://localhost:3404/spec_creator.html`, tabId from step 1.
3. `read_console_messages` `{ onlyErrors: true }` → expect no errors.
4. `read_page` → confirm the `⚙ ניהול תבניות` button appears next to `＋ פרויקט חדש`.
5. `find` the gear button and `computer` left_click it.
6. `read_page` → confirm the "ניהול תבניות" heading, the preset list showing "מבנה ציבור", the name/building-type inputs, and the Task-4 stub text render.
7. Click `＋ תבנית`, then `read_page` → a new "תבנית חדשה" appears and is selected. Click its "מחק" → it disappears.

Expected: manager opens, list add/duplicate/delete work, no console errors.

- [ ] **Step 8: Commit**

```bash
git add spec_creator.html
git commit -m "feat(spec-creator): preset manager shell — gear button, list, save wiring"
```

---

### Task 4: Tri-state library tree — `PresetTreeEditor`, `ClauseNode`, `TriCheck`

**Files:**
- Modify: `spec_creator.html`

- [ ] **Step 1: Replace the stub with the tree components**

In `spec_creator.html`, remove the temporary `function PresetTreeEditor() { ... Task 4 ... }` stub and add these three components (order: `TriCheck`, `ClauseNode`, `PresetTreeEditor`):

```js
function TriCheck({ state, disabled, onChange }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = (state === 'partial'); }, [state]);
  return <input type="checkbox" ref={ref} disabled={!!disabled}
                checked={state === 'on'}
                onChange={(e) => onChange(e.target.checked)} />;
}

function ClauseNode({ clause, preset, depth, ancestorOff, onChange }) {
  const P = window.SpecPreset;
  const [open, setOpen] = useState(true);
  const state = ancestorOff ? 'off' : P.resolveClauseState(preset, clause);
  const kids = clause.children || [];
  const childOff = ancestorOff || state === 'off';
  return (
    <div className="pt-clause">
      <div className="pt-row" style={{ paddingInlineStart: (depth * 18) + 'px' }}>
        <TriCheck state={state} disabled={ancestorOff}
                  onChange={(on) => onChange(P.toggleClause(preset, clause, on))} />
        {kids.length
          ? <span className="pt-caret" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</span>
          : <span className="pt-caret sp"></span>}
        <span className={'pt-text' + (state === 'off' ? ' off' : '')}>{clause.text || '(סעיף ריק)'}</span>
      </div>
      {open && kids.map(k => (
        <ClauseNode key={k.id} clause={k} preset={preset} depth={depth + 1}
                    ancestorOff={childOff} onChange={onChange} />
      ))}
    </div>
  );
}

function PresetTreeEditor({ library, preset, onChange }) {
  const P = window.SpecPreset;
  const [open, setOpen] = useState({});
  const toggleOpen = (k) => setOpen(o => ({ ...o, [k]: !o[k] }));
  return (
    <div className="ptree">
      {library.chapters.map(ch => {
        const chState = P.resolveChapterState(preset, ch);
        const chOpen = open['c' + ch.num];
        return (
          <div key={ch.num} className="pt-chap">
            <div className="pt-row">
              <TriCheck state={chState} onChange={(on) => onChange(P.toggleChapter(preset, ch, on))} />
              <span className="pt-caret" onClick={() => toggleOpen('c' + ch.num)}>{chOpen ? '▾' : '▸'}</span>
              <span className="pt-num">{window.SpecNumbering.chapterCode(ch.num)}</span>
              <span className={'pt-name' + (ch.discipline === 'ARCH' ? ' arch' : '')}>{ch.name}</span>
            </div>
            {chOpen && ch.subChapters.map(s => {
              const subState = P.resolveSubChapterState(preset, ch.num, s);
              const subOpen = open['s' + s.id];
              return (
                <div key={s.id} className="pt-sub">
                  <div className="pt-row" style={{ paddingInlineStart: '18px' }}>
                    <TriCheck state={subState}
                              onChange={(on) => onChange(P.toggleSubChapter(preset, ch.num, s.id, on))} />
                    {s.clauses.length
                      ? <span className="pt-caret" onClick={() => toggleOpen('s' + s.id)}>{subOpen ? '▾' : '▸'}</span>
                      : <span className="pt-caret sp"></span>}
                    <span className="pt-name">{s.title}</span>
                  </div>
                  {subOpen && s.clauses.map(cl => (
                    <ClauseNode key={cl.id} clause={cl} preset={preset} depth={2}
                                ancestorOff={subState === 'off'} onChange={onChange} />
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add tree CSS**

Append to the `<style>` block:

```css
.ptree { margin-top: 12px; border: 1px solid #e6e9ee; border-radius: 8px; padding: 6px 4px; max-height: 60vh; overflow: auto; }
.pt-row { display: flex; align-items: center; gap: 6px; padding: 2px 4px; }
.pt-row input[type=checkbox] { cursor: pointer; }
.pt-caret { width: 14px; display: inline-block; text-align: center; color: #99a; cursor: pointer; user-select: none; }
.pt-caret.sp { cursor: default; }
.pt-num { font-variant-numeric: tabular-nums; color: #556; font-size: 13px; }
.pt-name { font-size: 14px; }
.pt-name.arch { font-weight: 600; color: #1b4fb0; }
.pt-text { font-size: 13px; color: #333; }
.pt-text.off { color: #aab; text-decoration: line-through; }
```

- [ ] **Step 3: Verify tri-state behavior in the browser**

Use the Browser pane (reuse the running server; reload the page first — `navigate` to the URL again):
1. `read_console_messages` `{ onlyErrors: true }` → no errors.
2. Open ניהול תבניות, select "מבנה ציבור". `read_page` → chapters render with checked boxes.
3. Expand a chapter caret, then a sub-chapter caret → clauses render (some with their own carets/children).
4. Uncheck a single leaf clause via `computer` left_click on its checkbox; `read_page` → its parent chapter/sub-chapter checkbox should now be indeterminate (verify with `javascript_tool`: `document.querySelectorAll('.ptree input:indeterminate').length` > 0).
5. Uncheck a parent clause → its children rows show struck-through text and disabled checkboxes.
6. `read_network_requests` `{ urlPattern: "spec-library" }` → confirm a POST fired (debounced save) after the toggle.

Expected: tri-state renders correctly, ancestor-off disables/greys descendants, edits POST to `/api/spec-library`.

- [ ] **Step 4: Confirm the round-trip creates a correct project**

1. Reload the page (fresh library load from disk proves the save persisted).
2. Open ניהול תבניות → confirm the clause you unchecked is still unchecked.
3. Go back to פרויקטים, create a new project from the edited preset (wizard → choose the preset → צור פרויקט).
4. In the editor, open the affected chapter/sub-chapter and `read_page` → confirm the excluded clause is absent from the project.

Expected: the excluded clause does not appear in a newly created project; existing projects are unchanged.

- [ ] **Step 5: Take a screenshot for the user**

`computer` `{ action: "screenshot" }` of the open preset tree editor (display the Browser pane first if needed). Share it as proof.

- [ ] **Step 6: Commit**

```bash
git add spec_creator.html
git commit -m "feat(spec-creator): tri-state library tree for preset editing"
```

---

## Self-Review (author checklist — completed)

- **Spec coverage:** data model `excludedClauseIds` (Task 1) · resolvers + toggles + CRUD (Task 1) · `createProjectFromPreset` prune (Task 2) · `PresetManager`/`PresetList`/gear button/save flow (Task 3) · `PresetTreeEditor`/`ClauseNode`/tri-state + ancestor-off (Task 4) · edge cases: delete last preset → empty message (Task 3 Step 5), delete preset with projects → allowed (projects are snapshots), legacy preset without field (Task 1 test), empty name → placeholder (Task 3 render). All spec sections mapped.
- **Placeholder scan:** none — every code step contains complete code; the only intentional temporary is the Task 3 stub, explicitly replaced in Task 4 Step 1.
- **Type consistency:** `window.SpecPreset` API names (`resolveClauseState`, `resolveSubChapterState`, `resolveChapterState`, `toggleClause`, `toggleSubChapter`, `toggleChapter`, `createPreset`, `duplicatePreset`) are identical across Tasks 1, 3, 4. `preset.excludedClauseIds` / `selections[].subChapterIds` consistent across Tasks 1–2. Component props (`library`, `preset`, `onChange`, `ancestorOff`, `depth`, `state`) consistent between `PresetTreeEditor`/`ClauseNode`/`TriCheck`.
