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
