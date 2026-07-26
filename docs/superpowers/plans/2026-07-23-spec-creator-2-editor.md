# Spec Creator — Plan 2: Editor App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `spec_creator.html` — a single-file React app that creates a project spec from a PRESET (snapshot of the library), lets the user include/exclude chapters and sub-chapters, and edit the hierarchical clause tree, persisting to the local server.

**Architecture:** React 18 via Babel standalone (no build), Hebrew RTL, matching the `project_hub.html` pattern. The app's pure "brain" — clause numbering, snapshot-from-preset, and clause-tree operations — lives in small UMD modules under `tools/spec-creator/lib/` so it is unit-testable with `node:test` and also loadable in the browser via `<script>`. The React UI consumes those modules plus the `/api/spec-library` and `/api/spec-projects` routes from Plan 1.

**Tech Stack:** React 18 + Babel standalone (CDN as in project_hub), Heebo font, Node 24 `node:test` for the logic modules, the existing local-server for storage and preview.

**Reference:** design `docs/superpowers/specs/2026-07-23-spec-creator-design.md`; approved UI `spec_creator_mockup.html`; data `data/spec_library.json` (shape: `chapter={num,name,discipline,subChapters}`, `subChapter={id,title,clauses}`, `clause={id,text,kind,children}`, `preset={id,name,buildingType,selections:[{chapterNum,subChapterIds}]}`).

**Prereq:** Plan 1 merged (routes + seeded library exist).

---

## File Structure

- Create: `tools/spec-creator/lib/numbering.js` — derive display numbers from tree position.
- Create: `tools/spec-creator/lib/project.js` — `createProjectFromPreset` (snapshot).
- Create: `tools/spec-creator/lib/tree-ops.js` — immutable clause-tree operations.
- Create: `tools/spec-creator/test/*.test.js` — `node:test` unit tests for the three modules.
- Create: `spec_creator.html` — the app (loads the three lib modules + React).
- Modify: `.claude/launch.json` — add a `spec-creator` preview config (port 3404).

**UMD footer** used by every lib module (so the same file works in Node `require` and in the browser):

```js
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.<GlobalName> = api;
```

---

## Task 1: `numbering.js` — derive hierarchical numbers

**Files:**
- Create: `tools/spec-creator/lib/numbering.js`
- Create: `tools/spec-creator/test/numbering.test.js`

- [ ] **Step 1: Write the failing test**

Create `tools/spec-creator/test/numbering.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { assignNumbers, chapterCode, pad2 } = require('../lib/numbering.js');

test('pad2 and chapterCode', () => {
  assert.strictEqual(pad2(5), '05');
  assert.strictEqual(pad2(12), '12');
  assert.strictEqual(chapterCode(5), '05');
  assert.strictEqual(chapterCode(12), '12');
  assert.strictEqual(chapterCode(41.5), '41.5');
});

test('assigns hierarchical numbers by position', () => {
  const subs = [
    { id: 's1', clauses: [
      { id: 'c1', children: [] },
      { id: 'c2', children: [ { id: 'c2a', children: [] }, { id: 'c2b', children: [] } ] },
    ] },
    { id: 's2', clauses: [] },
  ];
  const m = assignNumbers(12, subs);
  assert.strictEqual(m['s1'], '12.01');
  assert.strictEqual(m['c1'], '12.01.01');
  assert.strictEqual(m['c2'], '12.01.02');
  assert.strictEqual(m['c2a'], '12.01.02.01');
  assert.strictEqual(m['c2b'], '12.01.02.02');
  assert.strictEqual(m['s2'], '12.02');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/spec-creator/test/numbering.test.js`
Expected: FAIL — cannot find module `../lib/numbering.js`.

- [ ] **Step 3: Implement the module**

Create `tools/spec-creator/lib/numbering.js`:

```js
'use strict';
(function () {
  function pad2(n) { return String(n).padStart(2, '0'); }
  function chapterCode(num) { return Number.isInteger(num) ? pad2(num) : String(num); }
  function numberClauseList(base, clauses, map) {
    (clauses || []).forEach(function (c, i) {
      const n = base + '.' + pad2(i + 1);
      map[c.id] = n;
      if (c.children && c.children.length) numberClauseList(n, c.children, map);
    });
  }
  function assignNumbers(chNum, subChapters) {
    const map = {};
    (subChapters || []).forEach(function (s, si) {
      const base = chapterCode(chNum) + '.' + pad2(si + 1);
      map[s.id] = base;
      numberClauseList(base, s.clauses, map);
    });
    return map;
  }
  const api = { pad2: pad2, chapterCode: chapterCode, assignNumbers: assignNumbers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecNumbering = api;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/spec-creator/test/numbering.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/spec-creator/lib/numbering.js tools/spec-creator/test/numbering.test.js
git commit -m "feat(spec-creator): add clause numbering module"
```

---

## Task 2: `project.js` — snapshot from preset

**Files:**
- Create: `tools/spec-creator/lib/project.js`
- Create: `tools/spec-creator/test/project.test.js`

- [ ] **Step 1: Write the failing test**

Create `tools/spec-creator/test/project.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createProjectFromPreset } = require('../lib/project.js');

const lib = {
  chapters: [
    { num: 12, name: 'אלומיניום', discipline: 'ARCH', subChapters: [
      { id: 'a', title: 'כללי', clauses: [ { id: 'x', text: 't', kind: 'paragraph', children: [] } ] },
      { id: 'b', title: 'קיר מסך', clauses: [] },
    ] },
    { num: 8, name: 'חשמל', discipline: 'ELEC', subChapters: [ { id: 'c', title: 'כללי', clauses: [] } ] },
  ],
  presets: [ { id: 'p1', name: 'מבנה ציבור', buildingType: 'מבנה ציבור',
    selections: [ { chapterNum: 12, subChapterIds: ['a'] } ] } ],
};

test('snapshot copies all chapters, marks included per preset', () => {
  const proj = createProjectFromPreset(lib, 'p1', { name: 'פרויקט', date: '2026-07-23', revision: '01' });
  assert.strictEqual(proj.chapters.length, 2);
  const ch12 = proj.chapters.find(c => c.num === 12);
  assert.strictEqual(ch12.included, true);
  assert.strictEqual(ch12.subChapters.find(s => s.id === 'a').included, true);
  assert.strictEqual(ch12.subChapters.find(s => s.id === 'b').included, false);
  assert.strictEqual(proj.chapters.find(c => c.num === 8).included, false);
  assert.strictEqual(proj.name, 'פרויקט');
});

test('deep copy — editing the project does not mutate the library', () => {
  const proj = createProjectFromPreset(lib, 'p1', { name: 'x' });
  proj.chapters[0].subChapters[0].clauses[0].text = 'CHANGED';
  assert.strictEqual(lib.chapters[0].subChapters[0].clauses[0].text, 't');
});

test('throws on unknown preset', () => {
  assert.throws(() => createProjectFromPreset(lib, 'nope', {}));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/spec-creator/test/project.test.js`
Expected: FAIL — cannot find module `../lib/project.js`.

- [ ] **Step 3: Implement the module**

Create `tools/spec-creator/lib/project.js`:

```js
'use strict';
(function () {
  function genId() { return Math.random().toString(36).slice(2, 12); }
  function deepCopy(x) { return JSON.parse(JSON.stringify(x || [])); }

  function createProjectFromPreset(library, presetId, meta) {
    const preset = (library.presets || []).find(function (p) { return p.id === presetId; });
    if (!preset) throw new Error('preset not found: ' + presetId);
    const selMap = {};
    preset.selections.forEach(function (s) { selMap[s.chapterNum] = new Set(s.subChapterIds); });
    const chapters = library.chapters.map(function (ch) {
      const sel = selMap[ch.num];
      const included = !!sel;
      return {
        num: ch.num, name: ch.name, discipline: ch.discipline, included: included,
        subChapters: ch.subChapters.map(function (s) {
          return { id: s.id, title: s.title,
                   included: included && sel.has(s.id),
                   clauses: deepCopy(s.clauses) };
        }),
      };
    });
    return {
      id: genId(), name: (meta && meta.name) || '', date: (meta && meta.date) || '',
      revision: (meta && meta.revision) || '',
      buildingType: (meta && meta.buildingType) || preset.buildingType || '',
      presetId: presetId, meta: (meta && meta.meta) || {}, chapters: chapters,
    };
  }

  const api = { createProjectFromPreset: createProjectFromPreset, genId: genId, deepCopy: deepCopy };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecProject = api;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/spec-creator/test/project.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/spec-creator/lib/project.js tools/spec-creator/test/project.test.js
git commit -m "feat(spec-creator): add createProjectFromPreset snapshot module"
```

---

## Task 3: `tree-ops.js` — clause-tree operations

**Files:**
- Create: `tools/spec-creator/lib/tree-ops.js`
- Create: `tools/spec-creator/test/tree-ops.test.js`

All operations are **immutable**: they deep-clone the input and return a new tree, so React state updates are safe.

- [ ] **Step 1: Write the failing test**

Create `tools/spec-creator/test/tree-ops.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/tree-ops.js');

function tree() {
  return [
    { id: 'a', text: 'A', kind: 'paragraph', children: [] },
    { id: 'b', text: 'B', kind: 'paragraph', children: [
      { id: 'b1', text: 'B1', kind: 'paragraph', children: [] },
      { id: 'b2', text: 'B2', kind: 'paragraph', children: [] },
    ] },
    { id: 'c', text: 'C', kind: 'paragraph', children: [] },
  ];
}

test('locate finds nested nodes', () => {
  assert.strictEqual(T.locate(tree(), 'b2').index, 1);
  assert.strictEqual(T.locate(tree(), 'x'), null);
});

test('move down swaps within sibling list and is immutable', () => {
  const src = tree();
  const out = T.move(src, 'a', 1);
  assert.deepStrictEqual(out.map(n => n.id), ['b', 'a', 'c']);
  assert.deepStrictEqual(src.map(n => n.id), ['a', 'b', 'c']); // original untouched
});

test('move keeps children with their parent', () => {
  const out = T.move(tree(), 'b', -1);
  assert.deepStrictEqual(out.map(n => n.id), ['b', 'a', 'c']);
  assert.strictEqual(out[0].children.length, 2);
});

test('move at boundary is a no-op', () => {
  assert.deepStrictEqual(T.move(tree(), 'a', -1).map(n => n.id), ['a', 'b', 'c']);
});

test('addAfter inserts a sibling and returns its id', () => {
  const { tree: out, newId } = T.addAfter(tree(), 'a', 'paragraph');
  assert.deepStrictEqual(out.map(n => n.id), ['a', newId, 'b', 'c']);
});

test('addChild appends a child under a parent', () => {
  const { tree: out, newId } = T.addChild(tree(), 'b', 'paragraph');
  const b = out.find(n => n.id === 'b');
  assert.strictEqual(b.children[b.children.length - 1].id, newId);
});

test('remove deletes a nested node', () => {
  const out = T.remove(tree(), 'b1');
  assert.strictEqual(out.find(n => n.id === 'b').children.length, 1);
});

test('setText updates text immutably', () => {
  const src = tree();
  const out = T.setText(src, 'a', 'NEW');
  assert.strictEqual(out[0].text, 'NEW');
  assert.strictEqual(src[0].text, 'A');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/spec-creator/test/tree-ops.test.js`
Expected: FAIL — cannot find module `../lib/tree-ops.js`.

- [ ] **Step 3: Implement the module**

Create `tools/spec-creator/lib/tree-ops.js`:

```js
'use strict';
(function () {
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function genId() { return Math.random().toString(36).slice(2, 12); }

  function locate(clauses, id) {
    for (let i = 0; i < clauses.length; i++) {
      if (clauses[i].id === id) return { list: clauses, index: i };
      if (clauses[i].children) {
        const r = locate(clauses[i].children, id);
        if (r) return r;
      }
    }
    return null;
  }
  function move(clauses, id, dir) {
    const c = clone(clauses);
    const loc = locate(c, id);
    if (!loc) return c;
    const j = loc.index + dir;
    if (j < 0 || j >= loc.list.length) return c;
    const it = loc.list.splice(loc.index, 1)[0];
    loc.list.splice(j, 0, it);
    return c;
  }
  function addAfter(clauses, id, kind) {
    const c = clone(clauses);
    const nc = { id: genId(), text: '', kind: kind || 'paragraph', children: [] };
    if (id === null) { c.push(nc); return { tree: c, newId: nc.id }; }
    const loc = locate(c, id);
    if (!loc) { c.push(nc); } else { loc.list.splice(loc.index + 1, 0, nc); }
    return { tree: c, newId: nc.id };
  }
  function addChild(clauses, parentId, kind) {
    const c = clone(clauses);
    const loc = locate(c, parentId);
    const nc = { id: genId(), text: '', kind: kind || 'paragraph', children: [] };
    if (loc) {
      const p = loc.list[loc.index];
      p.children = p.children || [];
      p.children.push(nc);
    }
    return { tree: c, newId: nc.id };
  }
  function remove(clauses, id) {
    const c = clone(clauses);
    const loc = locate(c, id);
    if (loc) loc.list.splice(loc.index, 1);
    return c;
  }
  function setText(clauses, id, text) {
    const c = clone(clauses);
    const loc = locate(c, id);
    if (loc) loc.list[loc.index].text = text;
    return c;
  }

  const api = { locate: locate, move: move, addAfter: addAfter, addChild: addChild,
                remove: remove, setText: setText, genId: genId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SpecTree = api;
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/spec-creator/test/tree-ops.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/spec-creator/lib/tree-ops.js tools/spec-creator/test/tree-ops.test.js
git commit -m "feat(spec-creator): add clause-tree operations module"
```

---

## Task 4: App shell — storage, projects list, new-project wizard

**Files:**
- Create: `spec_creator.html`
- Modify: `.claude/launch.json`

- [ ] **Step 1: Add the preview launch config**

In `.claude/launch.json`, add to the `configurations` array:

```json
{
  "name": "spec-creator",
  "runtimeExecutable": "node",
  "runtimeArgs": ["C:\\Users\\Omega\\Database\\tools\\local-server\\server.js", "C:\\Users\\Omega\\Database", "--port", "3404"],
  "port": 3404,
  "autoPort": true
}
```

- [ ] **Step 2: Create the app shell**

Create `spec_creator.html`. Copy the entire `<style>…</style>` block from `spec_creator_mockup.html` into the `<head>` (same class names are reused). Then use this body + scripts:

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>מחולל מפרטים ג2</title>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<!-- PASTE the <style>…</style> block from spec_creator_mockup.html here -->
<style>
  /* additions for the projects view */
  .pv{max-width:900px;margin:40px auto;padding:0 20px}
  .pv h1{font-size:24px;font-weight:800;margin:0 0 16px}
  .proj-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;box-shadow:var(--shadow)}
  .proj-card:hover{background:#f6f8fb}
  .proj-card .meta{color:var(--muted);font-size:12.5px}
  .wizard{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;box-shadow:var(--shadow)}
  .wizard label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin:10px 0 3px}
  .wizard input,.wizard select{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-family:inherit;font-size:14px;background:#fbfcfe}
</style>
</head>
<body>
<div id="root"></div>
<script src="tools/spec-creator/lib/numbering.js"></script>
<script src="tools/spec-creator/lib/project.js"></script>
<script src="tools/spec-creator/lib/tree-ops.js"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<!-- NOTE: type MUST be a type Babel's auto-runner ignores (NOT text/babel or text/jsx —
     Babel standalone auto-executes both, which would double-mount React). We compile it
     ourselves in the bootstrap script below, forcing the classic runtime so JSX becomes
     React.createElement (the automatic runtime injects an ES import that breaks UMD React). -->
<script id="app-src" type="text/babel-app">
const { useState, useEffect, useRef, useCallback } = React;

// ---------- storage ----------
async function apiGet(name) { const r = await fetch('/api/' + name); return r.json(); }
async function apiPost(name, data) {
  await fetch('/api/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}

function App() {
  const [library, setLibrary] = useState(null);
  const [projects, setProjects] = useState({ items: [] });
  const [activeId, setActiveId] = useState(null);
  const [wizard, setWizard] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const lib = await apiGet('spec-library');
      const pr = await apiGet('spec-projects');
      setLibrary(lib && lib.chapters ? lib : { chapters: [], presets: [] });
      setProjects(pr && pr.items ? pr : { items: [] });
    })();
  }, []);

  // debounced persistence of projects
  const persist = useCallback((next) => {
    setProjects(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => apiPost('spec-projects', { ...next, _ts: Date.now() }), 400);
  }, []);

  const updateProject = useCallback((proj) => {
    persist({ items: projects.items.map(p => p.id === proj.id ? proj : p) });
  }, [projects, persist]);

  if (!library) return <div style={{ padding: 40 }}>טוען…</div>;

  const active = projects.items.find(p => p.id === activeId);
  if (active) {
    return <Editor project={active} library={library}
                   onChange={updateProject} onBack={() => setActiveId(null)} />;
  }
  return <ProjectsView projects={projects} library={library} wizard={wizard}
                       setWizard={setWizard}
                       onOpen={setActiveId}
                       onCreate={(proj) => { persist({ items: [...projects.items, proj] }); setWizard(false); setActiveId(proj.id); }} />;
}

function ProjectsView({ projects, library, wizard, setWizard, onOpen, onCreate }) {
  return (
    <div className="pv">
      <h1>מחולל מפרטים ג2</h1>
      {!wizard && <button className="btn primary" onClick={() => setWizard(true)}>＋ פרויקט חדש</button>}
      {wizard && <Wizard library={library} onCancel={() => setWizard(false)} onCreate={onCreate} />}
      <div style={{ marginTop: 18 }}>
        {projects.items.map(p => (
          <div key={p.id} className="proj-card" onClick={() => onOpen(p.id)}>
            <div><b>{p.name || '(ללא שם)'}</b> <span className="meta"> · {p.buildingType}</span></div>
            <div className="meta">{p.date} · מהדורה {p.revision}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Wizard({ library, onCancel, onCreate }) {
  const [f, setF] = useState({ name: '', date: new Date().toISOString().slice(0, 10), revision: '01',
    presetId: (library.presets[0] || {}).id || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const create = () => {
    const preset = library.presets.find(p => p.id === f.presetId);
    const proj = window.SpecProject.createProjectFromPreset(library, f.presetId,
      { name: f.name, date: f.date, revision: f.revision, buildingType: preset ? preset.buildingType : '' });
    onCreate(proj);
  };
  return (
    <div className="wizard">
      <label>שם הפרויקט</label><input value={f.name} onChange={set('name')} placeholder="לדוגמה: מרכז קהילתי נווה יהושע" />
      <label>תאריך</label><input type="date" value={f.date} onChange={set('date')} />
      <label>מהדורה</label><input value={f.revision} onChange={set('revision')} />
      <label>סוג מבנה (PRESET)</label>
      <select value={f.presetId} onChange={set('presetId')}>
        {library.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={create} disabled={!f.presetId}>צור פרויקט</button>
        <button className="btn" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}

// Editor is built in Tasks 5-6; temporary shell so the app runs end-to-end now:
function Editor({ project, onBack }) {
  return (
    <div style={{ padding: 24 }}>
      <button className="btn" onClick={onBack}>← חזרה</button>
      <h1 style={{ fontSize: 22 }}>{project.name}</h1>
      <p className="mini">{project.chapters.filter(c => c.included).length} פרקים כלולים · העורך ייבנה במשימות 5-6.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
<script>
  // Compile the JSX app ourselves with the classic runtime so it works with UMD React.
  (function () {
    var src = document.getElementById('app-src').textContent;
    var out = Babel.transform(src, { presets: [['react', { runtime: 'classic' }]] }).code;
    (0, eval)(out);
  })();
</script>
</body>
</html>
```

- [ ] **Step 3: Start the preview and verify project creation persists**

1. `preview_start` with `{ name: "spec-creator" }`.
2. `navigate` to `http://localhost:3404/spec_creator.html`.
3. `read_console_messages` — confirm no errors (React/Babel loaded, libs loaded).
4. Click **＋ פרויקט חדש**, fill name "בדיקה", keep PRESET "מבנה ציבור", click **צור פרויקט**.
5. `screenshot` — confirm the Editor shell shows "בדיקה" and a chapter count > 0.
6. Reload the page (`navigate` again). `read_page` — confirm the "בדיקה" card appears in the projects list (persisted to server).
7. `read_network_requests` for `/api/spec-projects` — confirm a POST occurred with 200.

Fix any console errors before proceeding.

- [ ] **Step 4: Commit**

```bash
git add spec_creator.html .claude/launch.json
git commit -m "feat(spec-creator): app shell with projects list and new-project wizard"
```

---

## Task 5: ChapterTree sidebar

**Files:**
- Modify: `spec_creator.html` (replace the temporary `Editor` with the real editor layout + `ChapterTree`)

- [ ] **Step 1: Implement the editor layout and ChapterTree**

Replace the temporary `Editor` function in `spec_creator.html` with:

```jsx
function Editor({ project, library, onChange, onBack }) {
  const firstIncluded = project.chapters.find(c => c.included) || project.chapters[0];
  const [activeChap, setActiveChap] = useState(firstIncluded ? firstIncluded.num : null);
  const [activeSub, setActiveSub] = useState(null);

  const setChapter = (num, patch) =>
    onChange({ ...project, chapters: project.chapters.map(c => c.num === num ? { ...c, ...patch } : c) });
  const setSub = (num, subId, patch) =>
    setChapter(num, { subChapters: project.chapters.find(c => c.num === num).subChapters.map(
      s => s.id === subId ? { ...s, ...patch } : s) });

  const chap = project.chapters.find(c => c.num === activeChap);
  const sub = chap && chap.subChapters.find(s => s.id === activeSub);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><span className="logo">מ</span> מחולל מפרטים ג2</div>
        <div className="proj-meta">
          <div className="field"><label>שם הפרויקט</label><div className="val">{project.name}</div></div>
          <div className="field"><label>מהדורה</label><div className="val">{project.revision}</div></div>
          <div className="preset-badge">◆ {project.buildingType}</div>
        </div>
        <div className="actions"><button className="btn" onClick={onBack}>← פרויקטים</button></div>
      </div>
      <div className="body">
        <ChapterTree project={project} activeChap={activeChap} activeSub={activeSub}
          onToggleChapter={(num, val) => setChapter(num, { included: val })}
          onToggleSub={(num, subId, val) => setSub(num, subId, { included: val })}
          onSelect={(num, subId) => { setActiveChap(num); setActiveSub(subId); }}
          onAddSub={(num) => {
            const nc = project.chapters.find(c => c.num === num);
            const newSub = { id: window.SpecTree.genId(), title: 'תת-פרק חדש', included: true, clauses: [] };
            setChapter(num, { subChapters: [...nc.subChapters, newSub] });
            setActiveChap(num); setActiveSub(newSub.id);
          }} />
        <main className="editor">
          {sub
            ? <ClauseEditor chap={chap} sub={sub}
                onChangeClauses={(clauses) => setSub(chap.num, sub.id, { clauses })}
                onChangeTitle={(title) => setSub(chap.num, sub.id, { title })} />
            : <div style={{ padding: 30, color: 'var(--muted)' }}>בחר תת-פרק מהעץ מימין.</div>}
        </main>
      </div>
    </div>
  );
}

function ChapterTree({ project, activeChap, activeSub, onToggleChapter, onToggleSub, onSelect, onAddSub }) {
  const [open, setOpen] = useState({});
  return (
    <aside className="sidebar">
      <div className="side-head"><h2>פרקים ותתי-פרקים</h2><p>סמן מה כלול. פרקי אדריכלות מודגשים.</p></div>
      <div className="legend"><span><i className="dot arch"></i> אדריכלות</span><span><i className="dot other"></i> אחר</span></div>
      <div className="tree">
        {project.chapters.map(c => {
          const isArch = c.discipline === 'ARCH';
          const isOpen = open[c.num];
          return (
            <div key={c.num} className={'chap' + (isArch ? '' : ' other') + (isOpen ? ' open' : '')}>
              <div className="chap-row" onClick={() => setOpen({ ...open, [c.num]: !isOpen })}>
                <span className="caret">▸</span>
                <span className="chap-num">{window.SpecNumbering.chapterCode(c.num)}</span>
                <span className="chap-name">{c.name}</span>
                <span className="count">{c.included ? c.subChapters.filter(s => s.included).length : '—'}</span>
              </div>
              {isOpen && (
                <div className="subs">
                  {c.subChapters.map(s => (
                    <div key={s.id} className={'sub-row' + (s.id === activeSub ? ' active' : '') + (s.included ? '' : ' off')}
                         onClick={() => onSelect(c.num, s.id)}>
                      <span className={'tog' + (s.included ? ' on' : '')}
                            onClick={(e) => { e.stopPropagation(); onToggleSub(c.num, s.id, !s.included); }}></span>
                      <span className="sub-name">{s.title}</span>
                    </div>
                  ))}
                  <div className="add-sub" onClick={() => onAddSub(c.num)}>＋ הוסף תת-פרק</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
```

Note: `ClauseEditor` is added in Task 6; add a temporary stub above `ReactDOM` so the file runs now:

```jsx
function ClauseEditor({ sub }) {
  return <div style={{ padding: 24 }}><h1 style={{ fontSize: 20 }}>{sub.title}</h1>
    <p className="mini">{sub.clauses.length} סעיפים · העורך ייבנה במשימה 6.</p></div>;
}
```

- [ ] **Step 2: Verify in the browser**

1. Ensure preview running; `navigate` to `http://localhost:3404/spec_creator.html`, open the "בדיקה" project.
2. `screenshot` — confirm the sidebar shows chapters, ARCH chapters with green numbers, others greyed.
3. Click chapter 12 to expand; `screenshot` — confirm sub-chapters appear with toggles.
4. Click a sub-chapter toggle off; `read_page` — confirm it shows the `off` (struck-through) state and the chapter count decremented.
5. Reload; confirm the toggle state persisted (server round-trip).

Fix any errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add spec_creator.html
git commit -m "feat(spec-creator): chapter tree sidebar with include toggles"
```

---

## Task 6: ClauseEditor — hierarchical clause editing

**Files:**
- Modify: `spec_creator.html` (replace the `ClauseEditor` stub with the real component)

- [ ] **Step 1: Implement ClauseEditor**

Replace the `ClauseEditor` stub with:

```jsx
function ClauseEditor({ chap, sub, onChangeClauses, onChangeTitle }) {
  const numbers = window.SpecNumbering.assignNumbers(chap.num, chap.subChapters);
  const base = numbers[sub.id] || '';

  const op = (fn) => onChangeClauses(fn(sub.clauses));

  const renderClause = (c, depth) => {
    const isHeading = c.kind === 'heading';
    const isStd = c.kind === 'standard';
    return (
      <React.Fragment key={c.id}>
        <div className={'clause' + (isHeading ? ' kind-heading' : '') + (isStd ? ' kind-standard' : '') + (c.children && c.children.length ? ' parent' : '')}>
          <div className="reorder">
            <span className="grip">⋮⋮</span>
            <button className="mv" onClick={() => op(t => window.SpecTree.move(t, c.id, -1))}>▲</button>
            <button className="mv" onClick={() => op(t => window.SpecTree.move(t, c.id, 1))}>▼</button>
          </div>
          <div className="num">{numbers[c.id]}</div>
          <div className="body-col">
            {c.children && c.children.length ? <span className="parent-tag">מכיל תתי-סעיפים</span> : null}
            <div className="txt" contentEditable suppressContentEditableWarning
                 onBlur={(e) => op(t => window.SpecTree.setText(t, c.id, e.currentTarget.innerText))}>
              {c.text}
            </div>
            <div className="tools">
              <span className="tbtn" onClick={() => op(t => window.SpecTree.addChild(t, c.id, 'paragraph').tree)}>＋ תת-סעיף</span>
              <span className="tbtn danger" onClick={() => op(t => window.SpecTree.remove(t, c.id))}>מחק</span>
            </div>
          </div>
        </div>
        {c.children && c.children.length ?
          <div className="subclauses">{c.children.map(cc => renderClause(cc, depth + 1))}</div> : null}
      </React.Fragment>
    );
  };

  return (
    <div>
      <div className="crumbs">פרק {chap.num} — {chap.name} ⟵ <b>{sub.title}</b></div>
      <div className="ed-title">
        <h1 contentEditable suppressContentEditableWarning
            onBlur={(e) => onChangeTitle(e.currentTarget.innerText)}>{sub.title}</h1>
        {chap.discipline === 'ARCH' ? <span className="tag">אדריכלות</span> : null}
      </div>
      <p className="ed-sub">{base} · {sub.clauses.length} סעיפים</p>
      <div className="ed-toolbar">
        <span className="chip" onClick={() => op(t => window.SpecTree.addAfter(t, null, 'paragraph').tree)}>＋ סעיף</span>
        <span className="chip" onClick={() => op(t => window.SpecTree.addAfter(t, null, 'standard').tree)}>＋ תקן (ת"י)</span>
      </div>
      <div className="doc">
        {sub.clauses.map(c => renderClause(c, 0))}
        <div className="add-clause top" onClick={() => op(t => window.SpecTree.addAfter(t, null, 'paragraph').tree)}>＋ הוסף סעיף</div>
      </div>
    </div>
  );
}
```

Note on `contentEditable`: text is committed on **blur** (not every keystroke) to avoid caret jumps from re-render. The `onBlur` handler reads `innerText` and updates via `setText`.

- [ ] **Step 2: Verify in the browser**

1. `navigate` to the app, open "בדיקה", expand chapter 12, select the "כללי ותכולות עבודה" (or first) sub-chapter.
2. `screenshot` — confirm clauses render with numbers like `12.01.01`, and any clause with children shows the "מכיל תתי-סעיפים" tag with indented sub-clauses.
3. Click **▼** on the first clause; `read_page` — confirm order changed and numbers re-derived.
4. Click a clause's text, type an edit, click elsewhere (blur); reload the page; confirm the edited text persisted.
5. Click **＋ סעיף**; confirm a new empty clause appears at the end with the next number.
6. `read_console_messages` — no errors.

Fix any errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add spec_creator.html
git commit -m "feat(spec-creator): hierarchical clause editor with reorder and numbering"
```

---

## Task 7: Print-to-PDF view and end-to-end verification

**Files:**
- Modify: `spec_creator.html` (add a print view + button and print CSS)

- [ ] **Step 1: Add the print view**

Add print CSS inside the `<style>` (screen hides `.printable`, print hides the app chrome):

```css
.printable{display:none}
@media print{
  .topbar,.sidebar,.ed-toolbar,.reorder,.tools,.add-clause,.add-sub{display:none !important}
  .printable{display:block}
  .app,.body,.editor{display:block;height:auto;overflow:visible}
  body{background:#fff}
}
```

Add a **⎙ הדפסה / PDF** button to the editor `topbar` actions:

```jsx
<button className="btn" onClick={() => window.print()}>⎙ הדפסה / PDF</button>
```

Add a `PrintDoc` component that renders the whole included spec (chapters → included sub-chapters → clauses with numbers), and render it once inside `Editor` (after the `.body` div):

```jsx
function PrintDoc({ project }) {
  return (
    <div className="printable">
      <h1 style={{ textAlign: 'center' }}>{project.name}</h1>
      <p style={{ textAlign: 'center' }}>מפרט טכני (ג2) · מהדורה {project.revision} · {project.date}</p>
      {project.chapters.filter(c => c.included).map(c => {
        const numbers = window.SpecNumbering.assignNumbers(c.num, c.subChapters);
        const subs = c.subChapters.filter(s => s.included);
        if (!subs.length) return null;
        return (
          <section key={c.num}>
            <h2>פרק {window.SpecNumbering.chapterCode(c.num)} – {c.name}</h2>
            {subs.map(s => (
              <div key={s.id}>
                <h3>{numbers[s.id]} {s.title}</h3>
                {renderPrintClauses(s.clauses, numbers)}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
function renderPrintClauses(clauses, numbers) {
  return clauses.map(c => (
    <div key={c.id} style={{ marginRight: 16 }}>
      <p><b>{numbers[c.id]}</b> {c.text}</p>
      {c.children && c.children.length ? renderPrintClauses(c.children, numbers) : null}
    </div>
  ));
}
```

Wire `<PrintDoc project={project} />` just before the closing `</div>` of the `.app` in `Editor`.

- [ ] **Step 2: End-to-end verification**

1. `navigate` to the app; open "בדיקה".
2. Toggle a couple of sub-chapters off in chapter 12.
3. Edit one clause's text.
4. `read_page` after `window.print()` is not screenshot-able directly; instead verify the print DOM: run `javascript_tool` → `document.querySelector('.printable h2') !== null` returns true, and `document.querySelectorAll('.printable section').length` equals the number of included chapters with included sub-chapters.
5. Reload; confirm all edits + toggles persisted via `/api/spec-projects`.
6. `read_console_messages` — no errors.

- [ ] **Step 3: Run the full logic test suite**

Run: `node --test tools/spec-creator/test/numbering.test.js tools/spec-creator/test/project.test.js tools/spec-creator/test/tree-ops.test.js`
Expected: PASS (13 tests total).

- [ ] **Step 4: Commit**

```bash
git add spec_creator.html
git commit -m "feat(spec-creator): print-to-PDF spec view"
```

---

## Self-Review Notes

- **Spec coverage:** wizard (name/date/revision/building-type→PRESET) → Task 4. Snapshot semantics → Task 2. ChapterTree include/exclude + discipline highlight + add sub-chapter → Task 5. Hierarchical ClauseEditor with reorder + auto-numbering + add/delete + sub-clauses → Tasks 1,3,6. Storage via `/api/spec-projects` → Task 4. PDF print → Task 7. DOCX import/export → deferred to Plan 3 (out of scope here).
- **Placeholder scan:** temporary `Editor`/`ClauseEditor` stubs in Tasks 4/5 are explicitly replaced in Tasks 5/6 (labelled as such, with the replacement code given) — not placeholders left in the final product.
- **Type consistency:** `clause={id,text,kind,children}` used identically across numbering, tree-ops, project, and the React components. `window.SpecNumbering` / `window.SpecProject` / `window.SpecTree` global names match the UMD footers. Project shape `{id,name,date,revision,buildingType,presetId,meta,chapters:[{num,name,discipline,included,subChapters:[{id,title,included,clauses}]}]}` matches Task 2's output and design §3.
- **Known follow-ups (Plan 3+):** drag-to-reorder (Task 6 ships ▲▼ only; the grip is visual), "save back to library", DOCX import/export.
```
