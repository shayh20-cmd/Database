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
