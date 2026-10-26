'use strict';
// Filing without Claude: the plans built in code (filing-plan.js) and the map's slots (filing-ai.js).
// Run: node --test tools/local-server/test/filing-plan.test.js
const test = require('node:test');
const assert = require('node:assert');
const ai = require('../filing-ai');

test('filing-ai: the map keeps its slots — paths inside the project, SENT split by type unless said otherwise', () => {
  assert.deepStrictEqual(ai.cleanSlots(null), { sent: '', sentSplit: true, updated: '' });
  assert.deepStrictEqual(ai.cleanSlots({ sent: 'PUBLISH\\X-pub-@sent\\', sentSplit: false, updated: '../out', nope: 1 }), { sent: 'PUBLISH/X-pub-@sent', sentSplit: false, updated: '' });
  const m = ai.normalizeMap({ areas: { publish: { paths: ['PUBLISH'], note: '' } }, slots: { sent: 'PUBLISH/S', updated: 'PUBLISH/U' } });
  assert.deepStrictEqual(m.slots, { sent: 'PUBLISH/S', sentSplit: true, updated: 'PUBLISH/U' });
  assert.deepStrictEqual(ai.normalizeMap({ areas: {} }).slots, { sent: '', sentSplit: true, updated: '' });
});

test('filing-ai: a register contact reads "role · firm" (the name when there is no firm)', () => {
  assert.strictEqual(ai.contactText({ name: 'Avi', role: 'Electric', firm: 'Volt' }), 'Electric · Volt');
  assert.strictEqual(ai.contactText({ name: 'Mira', role: '', firm: '' }), 'Mira');
  assert.strictEqual(ai.contactText({ name: '', role: '', firm: '' }), '');
});

test('filing-ai: EXEC folders are offered with the receive and permit ones', () => {
  const tree = ['EXEC', 'EXEC/X-exec-rfi', 'EXEC/X-exec-submittals', 'RECEIVE', 'RECEIVE/X-receive-pm'];
  const o = ai.receiveOptions({ map: { areas: { receive: { paths: ['RECEIVE'], note: '' }, exec: { paths: ['EXEC'], note: '' } } }, tree, contacts: [], code: 'X' });
  assert.deepStrictEqual(o.others, [
    { label: 'receive-pm', folder: 'RECEIVE/X-receive-pm', area: 'receive' },
    { label: 'exec-rfi', folder: 'EXEC/X-exec-rfi', area: 'exec' },
    { label: 'exec-submittals', folder: 'EXEC/X-exec-submittals', area: 'exec' }
  ]);
  assert.strictEqual(o.unmapped.others, false);
});
