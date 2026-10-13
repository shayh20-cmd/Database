// Run: node --test tests/history.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createHistory, MASS_DELETE } = require('../tools/local-server/history');

function setup() {
  const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-hist-'));
  const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; } };
  const writeJsonAtomic = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d)); };
  const h = createHistory({ DATA_DIR, readJson, writeJsonAtomic });
  const file = path.join(DATA_DIR, 'proj.json');
  const save = (oldDoc, newDoc, who = 'איילה') => { fs.writeFileSync(file, JSON.stringify(oldDoc)); h.beforeSave('ph01', file, oldDoc, newDoc, who); };
  return { DATA_DIR, h, save };
}
const task = (id, title, extra = {}) => ({ id, title, groupId: 'g1', subtasks: [], ...extra });
const doc = tasks => ({
  tracks: [{ id: 'licensing', label: 'מסלול רישוי', trackValue: 'licensing' }],
  sheets: [{ id: 's1', name: 'תנאים מקדימים', type: 'list', track: 'licensing', groups: [{ id: 'g1', name: 'אישורים' }], tasks }]
});

test('a removed task goes to the archive with where it was and who saved', () => {
  const { h, save } = setup();
  save(doc([task('a', 'אישור כיבוי אש'), task('b', 'תיאום חשמל')]), doc([task('b', 'תיאום חשמל')]));
  const items = h.readArchive('ph01');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].id, 'a');
  assert.strictEqual(items[0].task.title, 'אישור כיבוי אש');
  assert.strictEqual(items[0].stage, 'תנאים מקדימים');
  assert.strictEqual(items[0].track, 'מסלול רישוי');
  assert.strictEqual(items[0].group, 'אישורים');
  assert.strictEqual(items[0].deletedBy, 'איילה');
});

test('a removed subtask is kept with its parent; a removed parent keeps its subtasks inside', () => {
  const { h, save } = setup();
  const sub = { id: 'x', title: 'תת' };
  save(doc([task('a', 'אב', { subtasks: [sub] })]), doc([task('a', 'אב')]));
  assert.deepStrictEqual(h.readArchive('ph01').map(r => [r.id, r.parentId]), [['x', 'a']]);
  const { h: h2, save: save2 } = setup();
  save2(doc([task('a', 'אב', { subtasks: [sub] })]), doc([]));
  const items = h2.readArchive('ph01');
  assert.deepStrictEqual(items.map(r => r.id), ['a']);
  assert.strictEqual(items[0].task.subtasks.length, 1);
});

test('a blank row that was added and removed is not archived', () => {
  const { h, save } = setup();
  save(doc([task('a', '  ')]), doc([]));
  assert.strictEqual(h.readArchive('ph01').length, 0);
});

test('a task that comes back leaves the archive', () => {
  const { h, save } = setup();
  save(doc([task('a', 'א')]), doc([]));
  assert.strictEqual(h.readArchive('ph01').length, 1);
  save(doc([]), doc([task('a', 'א')]));
  assert.strictEqual(h.readArchive('ph01').length, 0);
});

test('a task moved to another stage is not archived', () => {
  const { h, save } = setup();
  const two = t1 => ({ ...doc(t1), sheets: [...doc(t1).sheets, { id: 's2', name: 'בקרת תכן', type: 'list', track: 'licensing', groups: [], tasks: [] }] });
  const before = two([task('a', 'א')]);
  const after = two([]);
  after.sheets[1].tasks = [task('a', 'א')];
  save(before, after);
  assert.strictEqual(h.readArchive('ph01').length, 0);
});

test('a large removal is backed up first and logged', () => {
  const { DATA_DIR, h, save } = setup();
  const many = Array.from({ length: MASS_DELETE }, (_, i) => task('t' + i, 'משימה ' + i));
  save(doc(many), doc([]));
  const backups = h.listBackups('ph01');
  assert.ok(backups.some(b => /before-mass-delete/.test(b.name)));
  const log = fs.readFileSync(path.join(DATA_DIR, 'backups', 'ph01', 'mass-deletions.log'), 'utf8').trim().split('\n');
  assert.strictEqual(JSON.parse(log[0]).count, MASS_DELETE);
  assert.strictEqual(h.readArchive('ph01').length, MASS_DELETE);
});

test('backups are taken at most once per interval for ordinary saves', () => {
  const { h, save } = setup();
  save(doc([task('a', 'א')]), doc([task('a', 'א'), task('b', 'ב')]));
  save(doc([task('a', 'א'), task('b', 'ב')]), doc([task('a', 'א'), task('b', 'ב2')]));
  assert.strictEqual(h.listBackups('ph01').length, 1);
});

test('purge removes archived tasks for good', () => {
  const { h, save } = setup();
  save(doc([task('a', 'א'), task('b', 'ב')]), doc([]));
  assert.strictEqual(h.purge('ph01', ['a']), 1);
  assert.deepStrictEqual(h.readArchive('ph01').map(r => r.id), ['b']);
});
