'use strict';
// The publish layout of a project (filing-layout.js): the type list, patterns, levels, and what the tree shows.
// Run: node --test tools/local-server/test/filing-layout.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../filing-layout');
const rel = v => { const s = String(v == null ? '' : v).trim(); return s === '' ? '' : s.includes('..') ? null : s; };

test('filing-layout: the office type list, a file\'s type by extension, the rest type for the others', () => {
  assert.deepStrictEqual(L.OFFICE_TYPES.map(t => t.name), ['PDF', 'DWG', 'DWF', 'DOCS']);
  assert.strictEqual(L.typeOfName('A-101.pdf', L.OFFICE_TYPES), 'PDF');
  assert.strictEqual(L.typeOfName('Garmoshka.ZIP', L.OFFICE_TYPES), 'DWG');
  assert.strictEqual(L.typeOfName('a.dwf', L.OFFICE_TYPES), 'DWF');
  assert.strictEqual(L.typeOfName('notes.pptx', L.OFFICE_TYPES), 'DOCS');
  assert.strictEqual(L.typeOfName('no-extension', L.OFFICE_TYPES), 'DOCS');
});

test('filing-layout: cleanTypes — one rest type, names and extensions unique, bad lists refused', () => {
  const ok = L.cleanTypes([{ name: 'PDF', ext: ['PDF', '.pdf'] }, { name: 'CAD', ext: ['dwg', 'dxf'] }, { name: 'OTHER', ext: [], rest: true }]);
  assert.deepStrictEqual(ok, [{ name: 'PDF', ext: ['pdf'] }, { name: 'CAD', ext: ['dwg', 'dxf'] }, { name: 'OTHER', ext: [], rest: true }]);
  assert.strictEqual(L.cleanTypes([{ name: 'PDF', ext: ['pdf'] }]), null, 'no rest type');
  assert.strictEqual(L.cleanTypes([{ name: 'A', ext: [], rest: true }, { name: 'B', ext: [], rest: true }]), null, 'two rest types');
  assert.strictEqual(L.cleanTypes([{ name: 'PDF', ext: ['pdf'] }, { name: 'pdf', ext: ['x'] }, { name: 'R', ext: [], rest: true }]), null, 'same name twice');
  assert.strictEqual(L.cleanTypes([{ name: 'A', ext: ['pdf'] }, { name: 'B', ext: ['pdf'] }, { name: 'R', ext: [], rest: true }]), null, 'an extension in two types');
  assert.strictEqual(L.cleanTypes([{ name: 'A/B', ext: ['x'] }, { name: 'R', ext: [], rest: true }]), null, 'not a folder name');
  assert.strictEqual(L.cleanTypes('nope'), null);
});

test('filing-layout: fill, okName, cleanDesc', () => {
  assert.strictEqual(L.fill('{code}-pub-{type}-{yyyy},{mm},{dd}', { code: 'LDLI', type: 'PDF', yyyy: '2026', mm: '10', dd: '28' }), 'LDLI-pub-PDF-2026,10,28');
  assert.strictEqual(L.okName('LDLI-pub-PDF-2026'), true);
  for (const bad of ['', 'a/b', 'a:b', 'a?', 'a.', 'a ', '..', 'x'.repeat(151)]) assert.strictEqual(L.okName(bad), false, bad);
  assert.strictEqual(L.cleanDesc('  חניה זמנית  '), 'חניה זמנית');
  assert.strictEqual(L.cleanDesc('a/b:c*d'), 'abcd');
  assert.strictEqual(L.cleanDesc('x'.repeat(80)).length, 60);
  assert.strictEqual(L.cleanDesc('trailing dots...'), 'trailing dots');
  assert.strictEqual(L.cleanDesc(null), '');
});

test('filing-layout: cleanLevels — each kind once, its tokens in the pattern, a folder name after filling', () => {
  const lv = [{ kind: 'type', pattern: 'LDLI-pub-sent-{type}' }, { kind: 'year', pattern: 'LDLI-pub-{type}-{yyyy}' }, { kind: 'day', pattern: 'LDLI-pub-{type}-{yyyy},{mm},{dd}' }];
  assert.deepStrictEqual(L.cleanLevels(lv), { levels: lv });
  assert.deepStrictEqual(L.cleanLevels([]), { levels: [] });
  assert.deepStrictEqual(L.cleanLevels(null), { levels: [] });
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'year', pattern: 'X-pub-sent' }]), { error: 0 }, 'no {yyyy}');
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'day', pattern: 'X-{yyyy},{mm}' }]), { error: 0 }, 'no {dd}');
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'type', pattern: '{type}' }, { kind: 'type', pattern: 'x-{type}' }]), { error: 1 }, 'type twice');
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'type', pattern: 'a/{type}' }]), { error: 0 }, 'not a folder name');
  assert.deepStrictEqual(L.cleanLevels([{ kind: 'month', pattern: '{mm}' }]), { error: 0 }, 'unknown kind');
});

test('filing-layout: cleanPublish — both targets, the types, the first bad level named', () => {
  const raw = {
    sent: { base: 'P/S', levels: [{ kind: 'day', pattern: 'X-pub-{yyyy},{mm},{dd}' }] },
    updated: { base: 'P/U', levels: [{ kind: 'type', pattern: 'X-pub-updated-{type}' }] },
    types: null
  };
  assert.deepStrictEqual(L.cleanPublish(raw, rel), { publish: raw });
  assert.deepStrictEqual(L.cleanPublish(null, rel), { publish: null });
  assert.deepStrictEqual(L.cleanPublish({ ...raw, sent: { base: '../x', levels: [] } }, rel).publish.sent.base, '');
  assert.deepStrictEqual(L.cleanPublish({ ...raw, updated: { base: 'P/U', levels: [{ kind: 'year', pattern: 'nope' }] } }, rel), { error: 'layout', target: 'updated', level: 0 });
  assert.deepStrictEqual(L.cleanPublish({ ...raw, types: [{ name: 'PDF', ext: ['pdf'] }] }, rel), { error: 'layout', target: 'types', level: -1 });
  assert.deepStrictEqual(L.cleanPublish({ ...raw, types: L.OFFICE_TYPES }, rel).publish.types, L.OFFICE_TYPES);
});
