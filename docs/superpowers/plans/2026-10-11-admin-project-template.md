# Admin (Management) Project Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second project type, "ניהול", whose tracks are categories, whose stages are small projects with משימות / באגים / רעיונות sections, with a development status cycle, a category board and a project-wide status table — and a converter for the existing AI Integration project.

**Architecture:** Everything reuses the existing model (project → track → stage sheet → section → task), so My Tasks, the planner, views, search and the Claude connector work unchanged. The new pure logic lives in one marked block in `project_hub_01.html` (`/* ═══ admin-logic ═══ */ … /* ═══ /admin-logic ═══ */`); the test extracts that block from the HTML and runs it, so test and app never drift. UI pieces are small components gated by `isAdminProject(data)`.

**Tech Stack:** Single-file app `project_hub_01.html` (pre-compiled React, `React.createElement`, CRLF line endings, very long lines), translations in `i18n-dict.js`, tests with `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-11-admin-project-template-design.md`

**Conventions every task follows**
- Edit `project_hub_01.html` with a small node script written to the session scratchpad: read the file, replace one exact anchor (assert it occurs exactly once), write it back. Normalize anchors with `const N=x=>x.replace(/\r?\n/g,"\r\n")`. Do not use the Edit tool on the long lines.
- After every edit, syntax-check all inline scripts:
  `node -e "const s=require('fs').readFileSync('project_hub_01.html','utf8');const re=/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;while((m=re.exec(s))){try{new Function(m[1])}catch(e){console.log('ERR',i,e.message)}i++}console.log('scripts',i)"` → expected `scripts 3`, no `ERR`.
- Run tests from the project root: `node --test tests/*.test.js` (currently 62 pass).
- New Hebrew UI strings get an English entry appended to the last `Object.assign` chunk of `i18n-dict.js` (before the final `\r\n});`), skipping keys that already exist.
- Work on branch `feat/admin-template`, created from an up-to-date master (`git fetch && git pull` first — other sessions push to master).

---

## File Structure

| File | Change |
|---|---|
| `project_hub_01.html` | New `admin-logic` block (pure functions); `createProject` picks the builder; `NewProjectModal` gets type + categories; `TrackView` gets "+ פרויקט" and the category board; `NihulHubView` hides architecture tabs; `App` shows `AdminOverview` on מבט על; CSS |
| `tests/admin-logic.test.js` | New — extracts the `admin-logic` block and tests it |
| `i18n-dict.js` | English for the new strings |
| `docs/superpowers/specs/2026-10-11-admin-project-template-design.md` | One correction (Task 5) |

---

### Task 1: Pure admin logic and its tests

**Files:**
- Modify: `project_hub_01.html` — insert the block immediately before `async function postJson(url, body) {`
- Create: `tests/admin-logic.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/admin-logic.test.js`:

```js
// Run: node --test tests/admin-logic.test.js
// Loads the admin-logic block straight from project_hub_01.html, so the test runs the app's own code.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'project_hub_01.html'), 'utf8');
const m = html.match(/\/\* ═══ admin-logic ═══ \*\/([\s\S]*?)\/\* ═══ \/admin-logic ═══ \*\//);
if (!m) throw new Error('admin-logic block not found in project_hub_01.html');
let n = 0;
const uid = () => 'id' + ++n;
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const CURRENT_USER = { id: 'st07', name: 'שי' };
const todayISO = () => '2026-10-11';
const L = new Function('uid', 'clone', 'CURRENT_USER', 'todayISO',
  m[1] + '\nreturn {ADMIN_STATUSES,ADMIN_SECTIONS,isAdminProject,parseCategories,makeAdminStage,addAdminStage,buildAdminProject,adminSummary,convertToAdmin};'
)(uid, clone, CURRENT_USER, todayISO);

const src = {
  staff: [{ id: 'st07', name: 'שי', role: 'אדריכל', email: 's@x', phone: '1' }],
  priorities: [{ id: 'high', label: 'גבוהה' }],
  projectInfoFields: [{ id: 'f1', label: 'לקוח', type: 'text' }],
  tracks: [{ id: 'licensing', label: 'מסלול רישוי', trackValue: 'licensing', stageOrder: ['x'] }],
  sheets: [{ id: 'x', name: 'תיק מידע', type: 'list', track: 'licensing', groups: [], tasks: [] }],
  disciplines: [{ id: 'ARCH', label: 'ARCH' }]
};
const meta = { id: 'p1', name: 'הטמעת AI', code: 'AI', color: '#2563EB', visibility: 'shared' };

test('parseCategories splits on commas, trims, drops empties and repeats', () => {
  assert.deepStrictEqual(L.parseCategories(' רוויט, DB ,,רוויט,עזרי תכנון '), ['רוויט', 'DB', 'עזרי תכנון']);
  assert.deepStrictEqual(L.parseCategories(''), []);
});

test('statuses keep the shared ids and add IDEA', () => {
  assert.deepStrictEqual(L.ADMIN_STATUSES.map(s => s.id), ['IDEA', 'N', 'I', 'R', 'C', 'S']);
  assert.strictEqual(L.ADMIN_STATUSES.find(s => s.id === 'I').label, 'בפיתוח');
});

test('makeAdminStage has the three sections and hides תחום and עדכונים', () => {
  const s = L.makeAdminStage('בוט סיכומים', 'cat-1');
  assert.strictEqual(s.type, 'list');
  assert.strictEqual(s.track, 'cat-1');
  assert.deepStrictEqual(s.groups.map(g => [g.name, g.adminKey]), [['משימות', 'tasks'], ['באגים', 'bugs'], ['רעיונות', 'ideas']]);
  assert.deepStrictEqual(s.hiddenCols, { __discipline: true, __owner_status: true });
});

test('buildAdminProject: a track and a board per category, no architecture tracks', () => {
  const doc = L.buildAdminProject(src, meta, ['רוויט', 'DB']);
  assert.strictEqual(doc.projectMeta.kind, 'admin');
  assert.strictEqual(doc.projectName, 'הטמעת AI');
  assert.deepStrictEqual(doc.tracks.map(t => t.label), ['ניהול תכנון', 'רוויט', 'DB']);
  assert.ok(!doc.tracks.some(t => t.trackValue === 'licensing'));
  const cats = doc.tracks.filter(t => t.trackValue);
  cats.forEach(t => {
    const boards = doc.sheets.filter(s => s.track === t.trackValue && s.type === 'dashboard');
    assert.strictEqual(boards.length, 1);
  });
  assert.strictEqual(doc.sheets.filter(s => s.type === 'list' && s.track == null).length, 1);
  assert.deepStrictEqual(doc.statuses.map(s => s.id), ['IDEA', 'N', 'I', 'R', 'C', 'S']);
  assert.strictEqual(doc.team.length, 1);
  assert.strictEqual(doc.team[0].access, 'manager');
  assert.strictEqual(doc.disciplines, undefined);
});

test('buildAdminProject with no categories makes one called כללי', () => {
  const doc = L.buildAdminProject(src, meta, []);
  assert.deepStrictEqual(doc.tracks.filter(t => t.trackValue).map(t => t.label), ['כללי']);
});

test('addAdminStage appends the stage and its id to the track order', () => {
  const doc = L.buildAdminProject(src, meta, ['רוויט']);
  const track = doc.tracks.find(t => t.label === 'רוויט');
  const { doc: next, id } = L.addAdminStage(doc, track, 'תוסף מספור');
  const st = next.sheets.find(s => s.id === id);
  assert.strictEqual(st.name, 'תוסף מספור');
  assert.strictEqual(st.track, track.trackValue);
  assert.ok(next.tracks.find(t => t.id === track.id).stageOrder.includes(id));
});

test('adminSummary counts per section and status, and finds the last change', () => {
  let doc = L.buildAdminProject(src, meta, ['רוויט']);
  const track = doc.tracks.find(t => t.label === 'רוויט');
  const r = L.addAdminStage(doc, track, 'תוסף');
  doc = r.doc;
  const st = doc.sheets.find(s => s.id === r.id);
  const [gT, gB, gI] = st.groups.map(g => g.id);
  st.tasks = [
    { id: 'a', groupId: gT, title: 'מסך הגדרות', statusId: 'I', activityLog: [{ at: 1000 }] },
    { id: 'b', groupId: gT, title: 'ייצוא', statusId: 'R' },
    { id: 'c', groupId: gT, title: 'גמור', statusId: 'C', done: true, activityLog: [{ at: 5000 }] },
    { id: 'd', groupId: gB, title: 'קורס בפתיחה', statusId: 'S' },
    { id: 'e', groupId: gI, title: 'תמיכה ב-IFC', statusId: 'IDEA' }
  ];
  const row = L.adminSummary(doc).find(x => x.sheetId === r.id);
  assert.strictEqual(row.category, 'רוויט');
  assert.strictEqual(row.trackId, track.id);
  assert.strictEqual(row.openTasks, 2);
  assert.strictEqual(row.bugs, 1);
  assert.strictEqual(row.ideas, 1);
  assert.strictEqual(row.dev, 1);
  assert.strictEqual(row.review, 1);
  assert.strictEqual(row.stuck, 1);
  assert.deepStrictEqual(row.inDev, ['מסך הגדרות']);
  assert.strictEqual(row.lastAt, 5000);
});

test('isAdminProject reads projectMeta.kind', () => {
  assert.strictEqual(L.isAdminProject({ projectMeta: { kind: 'admin' } }), true);
  assert.strictEqual(L.isAdminProject({ projectMeta: {} }), false);
  assert.strictEqual(L.isAdminProject(null), false);
});

test('convertToAdmin moves sheets into categories, files tasks by section, keeps every task', () => {
  const old = {
    projectMeta: { id: 'ai', name: 'AI Integration' },
    tracks: [{ id: 'ongoing', label: 'ניהול תכנון', trackValue: null, stageOrder: [] },
             { id: 'design', label: 'מסלול תכנון', trackValue: 'design', stageOrder: ['s1', 's2'] }],
    sheets: [
      { id: 's1', name: 'Revit tools', type: 'list', track: 'design',
        groups: [{ id: 'g1', name: 'כללי' }, { id: 'g2', name: 'Bugs' }],
        tasks: [{ id: 't1', groupId: 'g1', title: 'A', statusId: 'N' }, { id: 't2', groupId: 'g2', title: 'B', statusId: 'S' }] },
      { id: 's2', name: 'Skills', type: 'list', track: 'design', groups: [{ id: 'g3', name: 'כללי' }],
        tasks: [{ id: 't3', groupId: 'g3', title: 'C', statusId: 'I' }] },
      { id: 'home', name: 'משימות שוטפות', type: 'list', track: null, groups: [{ id: 'g4', name: 'כללי' }], tasks: [{ id: 't4', groupId: 'g4', title: 'D' }] }
    ]
  };
  const plan = {
    categories: [{ name: 'רוויט', sheetIds: ['s1'] }, { name: 'סקילים', sheetIds: ['s2'] }],
    sectionOf: { g2: 'bugs' }
  };
  const doc = L.convertToAdmin(old, plan);
  assert.strictEqual(doc.projectMeta.kind, 'admin');
  const s1 = doc.sheets.find(s => s.id === 's1');
  const revit = doc.tracks.find(t => t.label === 'רוויט');
  assert.strictEqual(s1.track, revit.trackValue);
  assert.deepStrictEqual(revit.stageOrder, ['s1']);
  assert.deepStrictEqual(s1.groups.map(g => g.adminKey), ['tasks', 'bugs', 'ideas']);
  const bugs = s1.groups.find(g => g.adminKey === 'bugs');
  assert.strictEqual(s1.tasks.find(t => t.id === 't2').groupId, bugs.id);
  const tasks = s1.groups.find(g => g.adminKey === 'tasks');
  assert.strictEqual(s1.tasks.find(t => t.id === 't1').groupId, tasks.id);
  assert.ok(!doc.tracks.some(t => t.trackValue === 'design'));
  const all = doc.sheets.flatMap(s => s.tasks || []).map(t => t.id).sort();
  assert.deepStrictEqual(all, ['t1', 't2', 't3', 't4']);
  assert.strictEqual(doc.sheets.find(s => s.id === 'home').track, null);
  assert.deepStrictEqual(doc.statuses.map(s => s.id), ['IDEA', 'N', 'I', 'R', 'C', 'S']);
});

test('convertToAdmin puts a list sheet the plan does not name into כללי', () => {
  const old = { projectMeta: {}, tracks: [{ id: 'design', label: 'x', trackValue: 'design', stageOrder: ['s1'] }],
    sheets: [{ id: 's1', name: 'Misc', type: 'list', track: 'design', groups: [{ id: 'g', name: 'כללי' }], tasks: [{ id: 't', groupId: 'g' }] }] };
  const doc = L.convertToAdmin(old, { categories: [], sectionOf: {} });
  const general = doc.tracks.find(t => t.label === 'כללי');
  assert.strictEqual(doc.sheets.find(s => s.id === 's1').track, general.trackValue);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/admin-logic.test.js`
Expected: FAIL with `admin-logic block not found in project_hub_01.html`.

- [ ] **Step 3: Insert the logic block**

Insert this block (CRLF line endings) immediately before the line `async function postJson(url, body) {` in `project_hub_01.html`:

```js
/* ═══ admin-logic ═══ */
/* פרויקט ניהול — a project of small projects. A category is a track, a small project is a stage
   (a list sheet) with משימות / באגים / רעיונות sections, and the statuses follow a development
   cycle. N / I / C / S keep their shared ids, so attention, My Tasks and automations work as is.
   tests/admin-logic.test.js runs this block straight from the file. */
const ADMIN_STATUSES = [{
  id: 'IDEA',
  label: 'רעיון',
  color: '#A78BFA'
}, {
  id: 'N',
  label: 'מתוכנן',
  color: 'var(--status-N)'
}, {
  id: 'I',
  label: 'בפיתוח',
  color: 'var(--status-I)'
}, {
  id: 'R',
  label: 'בבדיקה',
  color: 'var(--status-R)'
}, {
  id: 'C',
  label: 'הושלם',
  color: 'var(--status-C)'
}, {
  id: 'S',
  label: 'תקוע',
  color: 'var(--status-S)'
}];
const ADMIN_SECTIONS = [{
  key: 'tasks',
  name: 'משימות'
}, {
  key: 'bugs',
  name: 'באגים'
}, {
  key: 'ideas',
  name: 'רעיונות'
}];
const ADMIN_HIDDEN_HUB_TABS = ['principles', 'supervision', 'reviews'];
const isAdminProject = doc => !!(doc && doc.projectMeta && doc.projectMeta.kind === 'admin');
const parseCategories = str => [...new Set(String(str || '').split(',').map(x => x.trim()).filter(Boolean))];
const adminSections = () => ADMIN_SECTIONS.map(s => ({
  id: uid(),
  name: s.name,
  collapsed: false,
  adminKey: s.key
}));
function makeAdminStage(name, trackValue) {
  return {
    id: uid(),
    name,
    type: 'list',
    track: trackValue,
    groups: adminSections(),
    tasks: [],
    fields: [],
    hiddenCols: {
      __discipline: true,
      __owner_status: true
    },
    colOrder: [],
    views: []
  };
}
const adminCategoryTrack = name => {
  const tv = 'cat-' + uid();
  return {
    id: tv,
    label: name,
    trackValue: tv,
    stageOrder: []
  };
};
const adminBoard = track => ({
  id: uid(),
  name: 'דאשבורד',
  type: 'dashboard',
  track: track.trackValue,
  groups: [],
  tasks: []
});
/* a small project, added to a category; returns the new document and the stage's id */
function addAdminStage(doc, track, name) {
  const st = makeAdminStage(name, track.trackValue);
  return {
    id: st.id,
    doc: {
      ...doc,
      sheets: [...(doc.sheets || []), st],
      tracks: (doc.tracks || []).map(t => t.id === track.id ? {
        ...t,
        stageOrder: [...(t.stageOrder || []), st.id]
      } : t)
    }
  };
}
/* a new admin project: the office roster, priorities and info fields from the source — no
   architecture tracks, stages, disciplines or statuses */
function buildAdminProject(src, meta, categories) {
  const names = categories && categories.length ? categories : ['כללי'];
  const cats = names.map(adminCategoryTrack);
  const home = {
    id: uid(),
    name: 'משימות שוטפות',
    type: 'list',
    track: null,
    groups: adminSections(),
    tasks: [],
    fields: [],
    hiddenCols: {
      __discipline: true,
      __owner_status: true
    },
    colOrder: [],
    views: []
  };
  return {
    projectName: meta.name,
    projectMeta: {
      id: meta.id,
      code: meta.code,
      color: meta.color,
      visibility: meta.visibility,
      ownerId: CURRENT_USER.id,
      ownerName: CURRENT_USER.name,
      createdAt: todayISO(),
      kind: 'admin'
    },
    tracks: [{
      id: 'ongoing',
      label: 'ניהול תכנון',
      trackValue: null,
      stageOrder: []
    }, ...cats],
    sheets: [home, ...cats.map(adminBoard)],
    statuses: clone(ADMIN_STATUSES),
    priorities: clone(src.priorities),
    builtinConfig: {},
    fields: [],
    projectInfoFields: clone(src.projectInfoFields || []),
    projectInfo: {
      client: meta.client || '',
      location: meta.location || '',
      customFields: {}
    },
    staff: clone(src.staff || []),
    team: (src.staff || []).filter(st => st.id === CURRENT_USER.id).map(st => ({
      id: uid(),
      staffId: st.id,
      name: st.name,
      role: st.role,
      email: st.email,
      phone: st.phone,
      projectRole: '',
      access: 'manager'
    })),
    externalContacts: [],
    meetings: [],
    goals: [],
    milestones: [],
    licensingGoals: [],
    licensingMilestones: [],
    standalonePrinciples: [],
    automations: [],
    automationLog: [],
    inbox: [],
    projectNotepads: [],
    precondsRepaired: true,
    _ts: Date.now()
  };
}
const adminStatusOf = t => t.done ? 'C' : t.statusId || 'N';
/* one row per small project: what is open in each section, what is in development, the last change */
function adminSummary(doc) {
  const tracks = (doc && doc.tracks || []).filter(t => t.trackValue);
  const rows = [];
  tracks.forEach(t => {
    const order = t.stageOrder || [];
    const rank = s => {
      const i = order.indexOf(s.id);
      return i < 0 ? order.length : i;
    };
    (doc.sheets || []).filter(s => s.type === 'list' && s.track === t.trackValue).sort((a, b) => rank(a) - rank(b)).forEach(s => {
      const keyOf = gid => {
        const g = (s.groups || []).find(x => x.id === gid);
        return g && g.adminKey || 'tasks';
      };
      const open = (s.tasks || []).filter(x => adminStatusOf(x) !== 'C');
      const inSec = k => open.filter(x => keyOf(x.groupId) === k).length;
      const last = (s.tasks || []).flatMap(x => (x.activityLog || []).map(e => e.at || 0));
      rows.push({
        sheetId: s.id,
        name: s.name,
        trackId: t.id,
        trackValue: t.trackValue,
        category: t.label,
        openTasks: inSec('tasks'),
        bugs: inSec('bugs'),
        ideas: inSec('ideas'),
        dev: open.filter(x => adminStatusOf(x) === 'I').length,
        review: open.filter(x => adminStatusOf(x) === 'R').length,
        stuck: open.filter(x => adminStatusOf(x) === 'S').length,
        inDev: open.filter(x => adminStatusOf(x) === 'I').map(x => x.title || ''),
        lastAt: last.length ? Math.max(...last) : null
      });
    });
  });
  return rows;
}
/* turn an existing project into an admin one. plan.categories: [{name, sheetIds}] — which list
   sheets go to which category; plan.sectionOf: {groupId: 'tasks'|'bugs'|'ideas'} — where an old
   section's tasks go (default משימות). Track-less sheets (ניהול תכנון) stay; any other list sheet
   the plan doesn't name goes to כללי. Nothing is deleted. */
function convertToAdmin(doc, plan) {
  const cats = (plan.categories || []).map(c => ({
    track: adminCategoryTrack(c.name),
    sheetIds: c.sheetIds || []
  }));
  let general = null;
  const trackFor = sheet => {
    const hit = cats.find(c => c.sheetIds.includes(sheet.id));
    if (hit) return hit.track;
    if (!general) general = adminCategoryTrack('כללי');
    return general;
  };
  const sectionOf = plan.sectionOf || {};
  const sheets = [];
  (doc.sheets || []).forEach(s => {
    /* an old track's board holds no tasks — the categories get boards of their own */
    if (s.type === 'dashboard' && s.track != null) return;
    /* ניהול תכנון and any non-list sheet stay exactly as they are */
    if (s.type !== 'list' || s.track == null) {
      sheets.push(s);
      return;
    }
    const secs = adminSections();
    const byKey = k => secs.find(g => g.adminKey === k).id;
    const tr = trackFor(s);
    tr.stageOrder.push(s.id);
    sheets.push({
      ...s,
      track: tr.trackValue,
      groups: secs,
      tasks: (s.tasks || []).map(t => ({
        ...t,
        groupId: byKey(sectionOf[t.groupId] || 'tasks')
      })),
      hiddenCols: {
        ...(s.hiddenCols || {}),
        __discipline: true,
        __owner_status: true
      }
    });
  });
  const catTracks = [...cats.map(c => c.track), ...(general ? [general] : [])];
  const ongoing = (doc.tracks || []).find(t => t.trackValue == null) || {
    id: 'ongoing',
    label: 'ניהול תכנון',
    trackValue: null,
    stageOrder: []
  };
  return {
    ...doc,
    projectMeta: {
      ...(doc.projectMeta || {}),
      kind: 'admin'
    },
    tracks: [ongoing, ...catTracks],
    sheets: [...sheets, ...catTracks.map(adminBoard)],
    statuses: clone(ADMIN_STATUSES)
  };
}
/* ═══ /admin-logic ═══ */
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/admin-logic.test.js`
Expected: all 10 tests PASS. Then run the syntax check (expected `scripts 3`) and `node --test tests/*.test.js` (expected 72 pass, 0 fail).

- [ ] **Step 5: Commit**

```bash
git add project_hub_01.html tests/admin-logic.test.js
git commit -m "feat: admin project logic — template, small projects, summary, converter"
```

---

### Task 2: Create an admin project from "צור חדש"

**Files:**
- Modify: `project_hub_01.html` — `createProject` (around the line `async function createProject(meta) {`) and `NewProjectModal`

- [ ] **Step 1: Let `createProject` choose the builder**

Replace the anchor
```js
  await postJson(`/api/hub-project/${id}`, buildProjectFromTemplate(src, full));
```
with
```js
  await postJson(`/api/hub-project/${id}`, meta.kind === 'admin' ? buildAdminProject(src, full, parseCategories(meta.categories)) : buildProjectFromTemplate(src, full));
```

- [ ] **Step 2: Add the type and categories state to the modal**

Replace the anchor
```js
  const [startDate, setStartDate] = useState('');
  const [tried, setTried] = useState(false);
```
(inside `function NewProjectModal`) with
```js
  const [startDate, setStartDate] = useState('');
  const [kind, setKind] = useState('arch');
  const [categories, setCategories] = useState('');
  const [tried, setTried] = useState(false);
```

- [ ] **Step 3: Send them to `createProject`**

Replace the anchor
```js
        location: loc.trim(),
        startDate
      });
      switchProject(id, 'overview');
```
with
```js
        location: loc.trim(),
        startDate,
        kind,
        categories
      });
      switchProject(id, 'overview');
```

- [ ] **Step 4: Render the choice at the top of the form body**

Replace the anchor
```js
/*#__PURE__*/React.createElement("div", {
    className: "af-body np-body"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "af-label",
    htmlFor: "np-name"
  }, "שם הפרויקט *"),
```
with
```js
/*#__PURE__*/React.createElement("div", {
    className: "af-body np-body"
  }, React.createElement("div", null, React.createElement("div", {
    className: "af-label"
  }, "סוג פרויקט"), React.createElement("div", {
    className: "np-kind",
    role: "radiogroup",
    "aria-label": "סוג פרויקט"
  }, [['arch', 'אדריכלות', 'מסלולי תכנון, רישוי, מכרז וביצוע'], ['admin', 'ניהול', 'קטגוריות ופרויקטים קטנים: משימות, באגים, רעיונות']].map(([id, label, desc]) => React.createElement("button", {
    key: id,
    type: "button",
    role: "radio",
    "aria-checked": kind === id,
    className: 'np-kind-opt' + (kind === id ? ' on' : ''),
    onClick: () => setKind(id)
  }, React.createElement("span", {
    className: "np-kind-lbl"
  }, label), React.createElement("span", {
    className: "np-kind-desc"
  }, desc)))), kind === 'admin' && React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, React.createElement("label", {
    className: "af-label",
    htmlFor: "np-cats"
  }, "קטגוריות"), React.createElement("input", {
    id: "np-cats",
    className: "af-input",
    value: categories,
    placeholder: "רוויט, DB, עזרי תכנון, סקילים, אדמיניסטרציה",
    onChange: e => setCategories(e.target.value)
  }), React.createElement("div", {
    className: "np-hint"
  }, "מופרדות בפסיקים. כל קטגוריה היא מסלול, ובתוכה מוסיפים פרויקטים קטנים."))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("label", {
    className: "af-label",
    htmlFor: "np-name"
  }, "שם הפרויקט *"),
```

- [ ] **Step 5: CSS**

Insert before `.mtp-mode{`:
```css
.np-kind{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.np-kind-opt{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);cursor:pointer;font-family:inherit;text-align:start;}
.np-kind-opt.on{border-color:var(--accent);background:rgba(37,99,235,.06);}
.np-kind-lbl{font-size:13px;font-weight:600;color:var(--text);}
.np-kind-desc{font-size:11px;color:var(--text-3);}
.np-hint{font-size:11px;color:var(--text-3);margin-top:4px;}
```

- [ ] **Step 6: i18n**

Append to `i18n-dict.js`:
`"סוג פרויקט":"Project type"`, `"אדריכלות":"Architecture"` (skip if present), `"ניהול":"Management"` (skip if present), `"מסלולי תכנון, רישוי, מכרז וביצוע":"Design, licensing, tender and construction tracks"`, `"קטגוריות ופרויקטים קטנים: משימות, באגים, רעיונות":"Categories of small projects: tasks, bugs, ideas"`, `"קטגוריות":"Categories"`, `"מופרדות בפסיקים. כל קטגוריה היא מסלול, ובתוכה מוסיפים פרויקטים קטנים.":"Comma-separated. Each category is a track; small projects are added inside it."`.

- [ ] **Step 7: Verify**

Syntax check (expected `scripts 3`), `node --test tests/*.test.js` (72 pass). In the browser (preview `project-hub`, a separate tab): צור חדש → פרויקט חדש → choose ניהול, categories "רוויט, DB", name "בדיקת ניהול", visibility פרטי → create. Expected: the new project opens; the sidebar shows tracks רוויט and DB under it; `GET /api/hub-project/<id>` returns `projectMeta.kind === 'admin'`. Delete the test project afterwards only with the user's approval (it is local test data — ask).

- [ ] **Step 8: Commit**

```bash
git add project_hub_01.html i18n-dict.js
git commit -m "feat: choose a management project in צור חדש"
```

---

### Task 3: "+ פרויקט" in a category

**Files:**
- Modify: `project_hub_01.html` — `TrackView`

- [ ] **Step 1: State for the inline name field**

Replace the anchor
```js
const[activeStageId,setActiveStageId]=useState(()=>screenGet(screenKey('stage',trackId)));
```
with
```js
const[activeStageId,setActiveStageId]=useState(()=>screenGet(screenKey('stage',trackId)));/* פרויקט ניהול: the name of a small project being added, null when the field is closed */const[admNew,setAdmNew]=useState(null);const admAdd=()=>{const name=(admNew||'').trim();if(!name||!activeTrack){setAdmNew(null);return;}const r=addAdminStage(data,activeTrack,name);save(r.doc);setActiveStageId(r.id);setAdmNew(null);};
```

- [ ] **Step 2: Show the tab bar in admin projects and add the button**

Replace the anchor
```js
activeView==='list'&&!isOngoing&&visibleStages.length>1&&/*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:2,padding:'8px 16px 0',background:'var(--surface)',borderBottom:'1px solid var(--border)',flexShrink:0}},visibleStages.map(
```
with
```js
activeView==='list'&&!isOngoing&&(visibleStages.length>1||isAdminProject(data))&&/*#__PURE__*/React.createElement("div",{style:{display:'flex',gap:2,padding:'8px 16px 0',background:'var(--surface)',borderBottom:'1px solid var(--border)',flexShrink:0}},visibleStages.map(
```
Then replace the end of that bar, the anchor
```js
},s.type==='dashboard'?/*#__PURE__*/React.createElement(React.Fragment,null,/*#__PURE__*/React.createElement(Ic,{n:"overview"})," "):'',s.name))),
```
with
```js
},s.type==='dashboard'?/*#__PURE__*/React.createElement(React.Fragment,null,/*#__PURE__*/React.createElement(Ic,{n:"overview"})," "):'',s.name)),isAdminProject(data)&&myOfficeRole()!=='viewer'&&(admNew==null?React.createElement("button",{type:"button",className:"adm-add-stage",onClick:()=>setAdmNew('')},"+ פרויקט"):React.createElement("input",{className:"af-input adm-new-stage",autoFocus:true,value:admNew,placeholder:"שם הפרויקט הקטן",onChange:e=>setAdmNew(e.target.value),onBlur:admAdd,onKeyDown:e=>{if(e.key==='Enter')admAdd();if(e.key==='Escape')setAdmNew(null);}}))),
```

- [ ] **Step 3: CSS**

Insert before `.mtp-mode{`:
```css
.adm-add-stage{padding:6px 12px;font-size:12px;font-family:inherit;border:none;background:none;color:var(--accent);cursor:pointer;border-radius:6px 6px 0 0;}
.adm-add-stage:hover{background:var(--bg);}
.adm-new-stage{width:180px;height:28px;font-size:12px;align-self:center;margin-inline-start:4px;}
```

- [ ] **Step 4: i18n** — append `"+ פרויקט":"+ Project"`, `"שם הפרויקט הקטן":"Small project name"`.

- [ ] **Step 5: Verify**

Syntax check, tests (72 pass). Browser: in "בדיקת ניהול" → רוויט → "+ פרויקט" → type "תוסף מספור" → Enter. Expected: a new tab "תוסף מספור" opens with sections משימות / באגים / רעיונות and the תחום / עדכונים columns hidden; the status menu shows רעיון, מתוכנן, בפיתוח, בבדיקה, הושלם, תקוע. Escape on an empty field closes it without adding.

- [ ] **Step 6: Commit**

```bash
git add project_hub_01.html i18n-dict.js
git commit -m "feat: add a small project inside a category"
```

---

### Task 4: Hide architecture-only tabs in admin projects

**Files:**
- Modify: `project_hub_01.html` — `NihulHubView` tab bar

- [ ] **Step 1: Filter the tabs**

Replace the anchor
```js
CROSS_CUTTING_ITEMS.map(t=>/*#__PURE__*/React.createElement("button",{key:t.id,onClick:()=>setActiveTab(t.id),
```
with
```js
CROSS_CUTTING_ITEMS.filter(t=>!isAdminProject(data)||!ADMIN_HIDDEN_HUB_TABS.includes(t.id)).map(t=>/*#__PURE__*/React.createElement("button",{key:t.id,onClick:()=>setActiveTab(t.id),
```

- [ ] **Step 2: Fall back if a hidden tab was the saved one**

Replace the anchor
```js
const[activeTab,setActiveTab]=useState(firstHub&&firstHub.tab||screenGet('hub:'+ACTIVE_PROJECT_ID)||'ongoing');
```
with
```js
const[activeTab,setActiveTabRaw]=useState(()=>{const t=firstHub&&firstHub.tab||screenGet('hub:'+ACTIVE_PROJECT_ID)||'ongoing';return isAdminProject(data)&&ADMIN_HIDDEN_HUB_TABS.includes(t)?'ongoing':t;});const setActiveTab=t=>setActiveTabRaw(isAdminProject(data)&&ADMIN_HIDDEN_HUB_TABS.includes(t)?'ongoing':t);
```

- [ ] **Step 3: Verify**

Syntax check, tests. Browser: "בדיקת ניהול" → ניהול תכנון shows רשימה, גאנט, ישיבות, אבני דרך (no פיקוח, עקרונות תכנון, בדיקות). אולם ספורט לוד still shows all of them.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat: management projects hide the architecture-only tabs"
```

---

### Task 5: Category board

**Files:**
- Modify: `project_hub_01.html` — new component before `function DashboardView(`; `TrackView` dashboard branch
- Modify: `docs/superpowers/specs/2026-10-11-admin-project-template-design.md` — section 3

- [ ] **Step 1: Add the component**

Insert before `function DashboardView({`:

```js
/* פרויקט ניהול — the board of a category: a card per small project with what is open, what is in
   development, what waits for review or is stuck, and when it last changed */
function AdminCategoryBoard({
  data,
  trackValue,
  onOpenStage
}) {
  const h = React.createElement;
  const rows = adminSummary(data).filter(r => r.trackValue === trackValue);
  const when = at => at ? fmtDateFull(new Date(at).toISOString().slice(0, 10)) : '—';
  if (!rows.length) return h("div", {
    className: "adm-empty"
  }, "אין עדיין פרויקטים בקטגוריה. \"+ פרויקט\" בשורת הלשוניות מוסיף אחד.");
  return h("div", {
    className: "adm-board"
  }, rows.map(r => h("button", {
    key: r.sheetId,
    type: "button",
    className: 'adm-card' + (r.stuck ? ' has-stuck' : ''),
    onClick: () => onOpenStage(r.sheetId)
  }, h("div", {
    className: "adm-card-t",
    "data-i18n-skip": ""
  }, r.name), h("div", {
    className: "adm-nums"
  }, [['openTasks', 'משימות'], ['bugs', 'באגים'], ['ideas', 'רעיונות']].map(([k, label]) => h("span", {
    key: k,
    className: 'adm-num adm-' + k
  }, h("b", null, r[k]), label))), h("div", {
    className: "adm-dev"
  }, h("span", {
    className: "adm-dev-l"
  }, "בפיתוח עכשיו"), r.inDev.length ? h("span", {
    "data-i18n-skip": ""
  }, r.inDev.slice(0, 3).join(' · '), r.inDev.length > 3 ? tx(' + עוד {n}', {
    n: r.inDev.length - 3
  }) : '') : h("span", {
    className: "adm-none"
  }, "—")), h("div", {
    className: "adm-foot"
  }, r.review > 0 && h("span", {
    className: "adm-tag review"
  }, tx('{n} בבדיקה', {
    n: r.review
  })), r.stuck > 0 && h("span", {
    className: "adm-tag stuck"
  }, tx('{n} תקועות', {
    n: r.stuck
  })), h("span", {
    className: "adm-when"
  }, tx('עדכון אחרון: {d}', {
    d: when(r.lastAt)
  }))))));
}
```

- [ ] **Step 2: Use it for a category's dashboard tab**

Replace the anchor
```js
!isOngoing&&activeStage&&activeStage.type==='dashboard'&&/*#__PURE__*/React.createElement(DashboardView,{data:data,save:save,onSwitchSheet:setActiveStageId}),
```
with
```js
!isOngoing&&activeStage&&activeStage.type==='dashboard'&&(isAdminProject(data)?React.createElement(AdminCategoryBoard,{data,trackValue:activeTrack&&activeTrack.trackValue,onOpenStage:setActiveStageId}):/*#__PURE__*/React.createElement(DashboardView,{data:data,save:save,onSwitchSheet:setActiveStageId})),
```

- [ ] **Step 3: CSS**

Insert before `.mtp-mode{`:
```css
.adm-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;padding:24px;}
.adm-card{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);text-align:start;font-family:inherit;cursor:pointer;color:var(--text);}
.adm-card:hover{border-color:var(--accent);}
.adm-card.has-stuck{border-inline-start:3px solid #DC2626;}
.adm-card-t{font-size:14px;font-weight:700;}
.adm-nums{display:flex;gap:12px;font-size:11.5px;color:var(--text-3);}
.adm-num b{display:block;font-size:18px;color:var(--text);}
.adm-bugs b{color:#DC2626;}.adm-ideas b{color:#7C3AED;}
.adm-dev{display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--text-2);}
.adm-dev-l{font-size:11px;color:var(--text-3);}
.adm-none{color:var(--text-3);}
.adm-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.adm-tag{font-size:11px;padding:1px 7px;border-radius:6px;}
.adm-tag.review{background:rgba(37,99,235,.08);color:var(--accent);}
.adm-tag.stuck{background:rgba(220,38,38,.1);color:#DC2626;}
.adm-when{margin-inline-start:auto;font-size:11px;color:var(--text-3);}
.adm-empty{padding:40px 24px;text-align:center;color:var(--text-3);font-size:13px;}
```

- [ ] **Step 4: i18n** — append `"אין עדיין פרויקטים בקטגוריה. \"+ פרויקט\" בשורת הלשוניות מוסיף אחד.":"No projects in this category yet. \"+ Project\" in the tab bar adds one."`, `"בפיתוח עכשיו":"In development now"`, `" + עוד {n}":" + {n} more"`, `"{n} בבדיקה":"{n} in review"`, `"{n} תקועות":"{n} stuck"`, `"עדכון אחרון: {d}":"Last change: {d}"`, `"באגים":"Bugs"`, `"רעיונות":"Ideas"` (skip existing keys).

- [ ] **Step 5: Correct the spec**

In section 3 of the spec, replace the sentence `אבני הדרך והגאנט נשארים מתחת לכרטיסים.` with `אבני הדרך נמצאות בלשונית אבני דרך של ניהול תכנון, והגאנט בלשונית גאנט; הדאשבורד של קטגוריה מציג רק את הכרטיסים.`

- [ ] **Step 6: Verify**

Syntax check, tests. Browser: in רוויט add a task in each section of "תוסף מספור", set one to בפיתוח and one to תקוע, open the דאשבורד tab. Expected: one card with משימות/באגים/רעיונות counts, the בפיתוח task's title under "בפיתוח עכשיו", a red "1 תקועות" tag and a red start border; clicking the card opens the small project's tab.

- [ ] **Step 7: Commit**

```bash
git add project_hub_01.html i18n-dict.js docs/superpowers/specs/2026-10-11-admin-project-template-design.md
git commit -m "feat: category board for management projects"
```

---

### Task 6: Status table on מבט על

**Files:**
- Modify: `project_hub_01.html` — new component after `AdminCategoryBoard`; `App` overview branch

- [ ] **Step 1: Add the component**

Insert right after the closing `}` of `AdminCategoryBoard`:

```js
/* פרויקט ניהול — מבט על: every small project in one table, grouped by category */
function AdminOverview({
  data,
  onOpenStage
}) {
  const h = React.createElement;
  const rows = adminSummary(data);
  const cats = [...new Set(rows.map(r => r.trackId))];
  const when = at => at ? fmtDateFull(new Date(at).toISOString().slice(0, 10)) : '—';
  const cols = [['dev', 'בפיתוח'], ['review', 'בבדיקה'], ['bugs', 'באגים פתוחים'], ['ideas', 'רעיונות'], ['stuck', 'תקועות']];
  return h("div", {
    className: "adm-ov"
  }, h("h2", {
    className: "adm-ov-t"
  }, "תמונת מצב"), !rows.length ? h("div", {
    className: "adm-empty"
  }, "אין עדיין פרויקטים קטנים. פותחים קטגוריה בסיידבר ומוסיפים \"+ פרויקט\".") : h("table", {
    className: "adm-table"
  }, h("thead", null, h("tr", null, h("th", null, "פרויקט"), cols.map(([k, l]) => h("th", {
    key: k
  }, l)), h("th", null, "עדכון אחרון"))), cats.map(tid => {
    const list = rows.filter(r => r.trackId === tid);
    return h("tbody", {
      key: tid
    }, h("tr", {
      className: "adm-cat-row"
    }, h("td", {
      colSpan: cols.length + 2,
      "data-i18n-skip": ""
    }, list[0].category)), list.map(r => h("tr", {
      key: r.sheetId,
      className: "adm-row",
      onClick: () => onOpenStage(r.trackId, r.sheetId)
    }, h("td", {
      "data-i18n-skip": ""
    }, r.name), cols.map(([k]) => h("td", {
      key: k,
      className: 'adm-c adm-c-' + k + (r[k] ? '' : ' zero')
    }, r[k])), h("td", {
      className: "adm-when"
    }, when(r.lastAt)))));
  })));
}
```

- [ ] **Step 2: Show it on מבט על in admin projects**

Replace the anchor
```js
track==='overview'&&/*#__PURE__*/React.createElement(OverviewPage,{data:data,save:save,onNavigateToTasks:()=>setTrack('ongoing'),onNavigateToData:()=>setTrack('data')}),
```
with
```js
track==='overview'&&(isAdminProject(data)?React.createElement(AdminOverview,{data,onOpenStage:(trackId,sheetId)=>{screenSet('stage:'+ACTIVE_PROJECT_ID+':'+trackId,sheetId);screenSet('view:'+ACTIVE_PROJECT_ID+':'+trackId,'list');setTrack(trackId);}}):/*#__PURE__*/React.createElement(OverviewPage,{data:data,save:save,onNavigateToTasks:()=>setTrack('ongoing'),onNavigateToData:()=>setTrack('data')})),
```

- [ ] **Step 3: CSS**

Insert before `.mtp-mode{`:
```css
.adm-ov{padding:24px;max-width:1000px;margin:0 auto;width:100%;box-sizing:border-box;overflow:auto;}
.adm-ov-t{font-size:16px;font-weight:700;margin:0 0 14px;}
.adm-table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;font-size:13px;}
.adm-table th{text-align:start;font-weight:500;font-size:11.5px;color:var(--text-3);padding:8px 12px;border-bottom:1px solid var(--border);}
.adm-table td{padding:8px 12px;border-top:1px solid var(--border);}
.adm-cat-row td{background:var(--bg);font-weight:700;font-size:12.5px;}
.adm-row{cursor:pointer;}.adm-row:hover td{background:var(--row-hover);}
.adm-c{text-align:center;font-weight:600;}.adm-c.zero{color:var(--text-4,var(--text-3));font-weight:400;}
.adm-c-stuck:not(.zero),.adm-c-bugs:not(.zero){color:#DC2626;}
.adm-c-dev:not(.zero){color:var(--accent);}
```

- [ ] **Step 4: i18n** — append `"תמונת מצב"` (skip, exists), `"אין עדיין פרויקטים קטנים. פותחים קטגוריה בסיידבר ומוסיפים \"+ פרויקט\".":"No small projects yet. Open a category in the sidebar and use \"+ Project\"."`, `"באגים פתוחים":"Open bugs"`, `"תקועות":"Stuck"`, `"בבדיקה":"In review"`, `"בפיתוח":"In development"`, `"עדכון אחרון":"Last change"`, `"פרויקט":"Project"` (skip existing keys).

- [ ] **Step 5: Verify**

Syntax check, tests. Browser: "בדיקת ניהול" → מבט על. Expected: a table with a רוויט row group and the "תוסף מספור" row with the same counts as its card; clicking the row opens רוויט on the "תוסף מספור" tab. אולם ספורט לוד's מבט על is unchanged.

- [ ] **Step 6: Commit**

```bash
git add project_hub_01.html i18n-dict.js
git commit -m "feat: status table on מבט על for management projects"
```

---

### Task 7: Full check, merge and deploy

- [ ] **Step 1:** `node tools/i18n-extract.js` — none of the strings added in Tasks 2–6 should be listed as untranslated.
- [ ] **Step 2:** `node --test tests/*.test.js` → 72 pass, 0 fail. Syntax check → `scripts 3`.
- [ ] **Step 3:** Browser regression on אולם ספורט לוד: מבט על, מסלול רישוי דאשבורד (gantt + cards), ניהול תכנון tabs, המשימות שלי מסך תכנון — all as before; no console errors.
- [ ] **Step 4:** Ask the user before removing the local "בדיקת ניהול" project.
- [ ] **Step 5:** With the user's go-ahead: `git fetch && git merge origin/master` (resolve conflicts if another session pushed), push, open a PR, merge, `git checkout master && git pull`, then `.\Deploy-Azure.ps1 -Name kkarc-hub -CodeOnly` from PowerShell in the project folder.

---

### Task 8: Convert AI Integration (live data — needs the user)

This task changes a live project. Every step that writes needs the user's explicit approval.

- [ ] **Step 1:** Ask the user to sign in to https://kkarc-hub.azurewebsites.net in the browser pane.
- [ ] **Step 2:** In the signed-in tab, read the project: find its id with `MY_PROJECTS.find(p => p.code === 'AI' || /AI Integration/.test(p.name))`, then `await fetch(projectEndpointOf(id)).then(r => r.json())`. List every list sheet (id, name, track), its groups (id, name) and task counts.
- [ ] **Step 3:** Show the user a mapping table: each sheet → category (רוויט / DB / עזרי תכנון / סקילים / אדמיניסטרציה / other), each group → משימות / באגים / רעיונות. Ask about anything unclear. Build `plan = {categories:[{name, sheetIds}], sectionOf:{groupId:key}}` from the answers.
- [ ] **Step 4:** Back up: download the current JSON to `C:\Users\Omega\Claude Projects\project-hub\backups\ai-integration-<date>.json` (create `backups/` if needed; it is git-ignored — check `.gitignore`, add `backups/` if missing). Confirm the file is written and non-empty.
- [ ] **Step 5:** Show the user the result of `convertToAdmin(doc, plan)` (categories, small projects, task counts per section; total task count equals the original). On approval, open the project in the app and save through the app: in the console, `PROJECT_OPS.save(convertToAdmin(PROJECT_OPS.data, plan))` while that project is the active one (this goes through the app's save, so it is undoable and runs the normal write path).
- [ ] **Step 6:** Verify in the UI: sidebar categories, each small project's sections, מבט על table, and that the project's tasks still appear in המשימות שלי.
