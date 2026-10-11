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
const build = taskStatusEff => new Function('uid', 'clone', 'CURRENT_USER', 'todayISO', 'taskStatusEff',
  m[1] + '\nreturn {ADMIN_STATUSES,ADMIN_SECTIONS,isAdminProject,parseCategories,makeAdminStage,addAdminStage,buildAdminProject,adminSummary,convertToAdmin};'
)(uid, clone, CURRENT_USER, todayISO, taskStatusEff);
const L = build(undefined);

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

test('buildAdminProject sets the migration flags and the home sheet has the three sections', () => {
  const doc = L.buildAdminProject(src, meta, ['רוויט']);
  assert.strictEqual(doc.singleStage, true);
  assert.strictEqual(doc.ongoingHome, true);
  assert.strictEqual(doc.tenderEv2, true);
  const home = doc.sheets.find(s => s.type === 'list' && s.track == null);
  assert.strictEqual(home.name, 'משימות שוטפות');
  assert.deepStrictEqual(home.groups.map(g => g.adminKey), ['tasks', 'bugs', 'ideas']);
});

test('convertToAdmin keeps a non-list sheet on a removed track visible under כללי', () => {
  const old = { projectMeta: {},
    tracks: [{ id: 'ongoing', label: 'ניהול תכנון', trackValue: null, stageOrder: [] },
             { id: 'tender', label: 'מסלול מכרז', trackValue: 'tender', stageOrder: [] }],
    sheets: [{ id: 'dw', name: 'סטים', type: 'drawset', track: 'tender', tasks: [{ id: 'dz' }] }] };
  const doc = L.convertToAdmin(old, { categories: [] });
  const general = doc.tracks.find(t => t.label === 'כללי');
  assert.ok(general);
  const dw = doc.sheets.find(s => s.id === 'dw');
  assert.strictEqual(dw.track, general.trackValue);
  assert.ok(!general.stageOrder.includes('dw'));
  assert.ok(doc.sheets.flatMap(s => s.tasks || []).some(t => t.id === 'dz'));
  assert.strictEqual(doc.singleStage, true);
  assert.strictEqual(doc.ongoingHome, true);
  assert.strictEqual(doc.tenderEv2, true);
});

test('convertToAdmin returns an admin project unchanged', () => {
  const adminDoc = L.buildAdminProject(src, meta, ['רוויט']);
  assert.strictEqual(L.convertToAdmin(adminDoc, { categories: [] }), adminDoc);
});

test('adminSummary: activity entries without at give lastAt null', () => {
  let doc = L.buildAdminProject(src, meta, ['רוויט']);
  const track = doc.tracks.find(t => t.label === 'רוויט');
  const r = L.addAdminStage(doc, track, 'תוסף');
  doc = r.doc;
  const st = doc.sheets.find(s => s.id === r.id);
  st.tasks = [{ id: 'a', groupId: st.groups[0].id, activityLog: [{ text: 'x' }, {}] }];
  assert.strictEqual(L.adminSummary(doc).find(x => x.sheetId === r.id).lastAt, null);
});

test('adminSummary uses the event-derived status when the app provides it', () => {
  const E = build(t => t.__eff || t.statusId);
  let doc = E.buildAdminProject(src, meta, ['רוויט']);
  const track = doc.tracks.find(t => t.label === 'רוויט');
  const r = E.addAdminStage(doc, track, 'תוסף');
  doc = r.doc;
  const st = doc.sheets.find(s => s.id === r.id);
  st.tasks = [{ id: 'a', groupId: st.groups[0].id, title: 'תהליך', statusId: 'N', __eff: 'I' }];
  const row = E.adminSummary(doc).find(x => x.sheetId === r.id);
  assert.strictEqual(row.dev, 1);
  assert.deepStrictEqual(row.inDev, ['תהליך']);
});
