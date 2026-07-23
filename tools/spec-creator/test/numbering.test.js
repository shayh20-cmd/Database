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
