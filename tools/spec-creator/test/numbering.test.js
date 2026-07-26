'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { assignNumbers, chapterCode, pad2, hebrewLetter } = require('../lib/numbering.js');

test('pad2 and chapterCode', () => {
  assert.strictEqual(pad2(5), '05');
  assert.strictEqual(pad2(12), '12');
  assert.strictEqual(chapterCode(5), '05');
  assert.strictEqual(chapterCode(12), '12');
  assert.strictEqual(chapterCode(41.5), '41.5');
});

test('hebrewLetter maps 1-22 and falls back to number', () => {
  assert.strictEqual(hebrewLetter(1), 'א');
  assert.strictEqual(hebrewLetter(3), 'ג');
  assert.strictEqual(hebrewLetter(22), 'ת');
  assert.strictEqual(hebrewLetter(23), '23');
});

test('top clauses numeric, children lettered, grandchildren numeric', () => {
  const subs = [
    { id: 's1', clauses: [
      { id: 'c1', children: [] },
      { id: 'c2', children: [
        { id: 'c2a', children: [ { id: 'g1', children: [] } ] },
        { id: 'c2b', children: [] },
      ] },
    ] },
    { id: 's2', clauses: [] },
  ];
  const m = assignNumbers(9, subs);
  assert.strictEqual(m['s1'], '09.01');
  assert.strictEqual(m['c1'], '09.01.01');
  assert.strictEqual(m['c2'], '09.01.02');
  assert.strictEqual(m['c2a'], '09.01.02 (א)');
  assert.strictEqual(m['c2b'], '09.01.02 (ב)');
  assert.strictEqual(m['g1'], '09.01.02 (א) (1)');
  assert.strictEqual(m['s2'], '09.02');
});
