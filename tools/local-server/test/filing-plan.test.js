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

const plans = require('../filing-plan');

const CONV = [
  'PUBLISH', 'PUBLISH/4021-pub-@sent', 'PUBLISH/4021-pub-@sent/4021-pub-sent-2026', 'PUBLISH/4021-pub-@sent/4021-pub-sent-2026/4021-pub-2026,10,01',
  'PUBLISH/4021-pub-@sent/4021-pub-sent-2026/4021-pub-2026,10,01/PDF', 'PUBLISH/4021-pub-updated', 'PUBLISH/4021-pub-updated/4021-pub-updated-PDF',
  'CONSULTANTS', 'CONSULTANTS/4021-KONS', 'RECIEVE', 'PERMIT', 'EXEC', 'WORK'
];

test('filing-plan: the convention found in a tree — SENT archive, UPDATED of PDFs, split by type, the areas', () => {
  assert.deepStrictEqual(plans.autoSlots(CONV), {
    slots: { sent: 'PUBLISH/4021-pub-@sent', sentSplit: true, updated: 'PUBLISH/4021-pub-updated/4021-pub-updated-PDF' },
    areas: { publish: ['PUBLISH'], consultants: ['CONSULTANTS'], receive: ['RECIEVE'], permit: ['PERMIT'], exec: ['EXEC'] }
  });
  // day folders without type folders: SENT is kept together; day folders right in the archive count too
  const flat = ['P', 'P/X-pub-@sent', 'P/X-pub-@sent/X-pub-2026,09,30', 'P/X-pub-@sent/X-pub-2026,09,30/a'];
  assert.strictEqual(plans.autoSlots(flat).slots.sentSplit, false);
  // nothing by the convention: empty, split by default; areas one level down count, in any case
  assert.deepStrictEqual(plans.autoSlots(['old', 'old/Receive', 'x/y/permit']), { slots: { sent: '', sentSplit: true, updated: '' }, areas: { receive: ['old/Receive'] } });
  assert.deepStrictEqual(plans.autoSlots(null), { slots: { sent: '', sentSplit: true, updated: '' }, areas: {} });
});

const SLOTS = { sent: 'PUBLISH/4021-pub-@sent', sentSplit: true, updated: 'PUBLISH/4021-pub-updated/4021-pub-updated-PDF' };
const F = [{ n: 0, name: 'A-101.pdf' }, { n: 1, name: 'A-102.PDF' }, { n: 2, name: 'A-101.dwg' }, { n: 3, name: 'notes.txt' }];
const Y = 'PUBLISH/4021-pub-@sent/4021-pub-sent-2026';

test('filing-plan: the day folder of SENT — the year layer when in use (or nothing there yet), a day folder already there', () => {
  assert.deepStrictEqual(plans.sentFolder(CONV, SLOTS.sent, '4021', '2026-10-26'), { path: Y + '/4021-pub-2026,10,26', mkdir: [Y + '/4021-pub-2026,10,26'] });
  assert.deepStrictEqual(plans.sentFolder(CONV, SLOTS.sent, '4021', '2026-10-01'), { path: Y + '/4021-pub-2026,10,01', mkdir: [] });
  assert.deepStrictEqual(plans.sentFolder(CONV, SLOTS.sent, '4021', '2027-01-05'), {
    path: 'PUBLISH/4021-pub-@sent/4021-pub-sent-2027/4021-pub-2027,01,05',
    mkdir: ['PUBLISH/4021-pub-@sent/4021-pub-sent-2027', 'PUBLISH/4021-pub-@sent/4021-pub-sent-2027/4021-pub-2027,01,05']
  });
  // day folders right in the archive: no year layer
  const flat = ['P', 'P/S', 'P/S/X-pub-2026,09,30'];
  assert.deepStrictEqual(plans.sentFolder(flat, 'P/S', 'X', '2026-10-26'), { path: 'P/S/X-pub-2026,10,26', mkdir: ['P/S/X-pub-2026,10,26'] });
  // an empty archive: the convention, with the year layer; no code: no prefix
  assert.deepStrictEqual(plans.sentFolder(['S'], 'S', '', '2026-10-26'), { path: 'S/pub-sent-2026/pub-2026,10,26', mkdir: ['S/pub-sent-2026', 'S/pub-sent-2026/pub-2026,10,26'] });
});

test('filing-plan: publish — SENT by file type, UPDATED for PDFs only (replacing), through the inbox checks', () => {
  const r = plans.inboxPlan({ slots: SLOTS, tree: CONV, code: '4021', files: F, sent: true, updated: true, date: '2026-10-26' });
  const D = Y + '/4021-pub-2026,10,26';
  assert.deepStrictEqual(r.plan.steps.map(s => s.path), [D, D + '/PDF', D + '/DWG', D + '/DOCS']);
  assert.deepStrictEqual(r.plan.files, [
    { n: 0, name: 'A-101.pdf', dests: [{ path: D + '/PDF', replace: false }, { path: SLOTS.updated, replace: true }] },
    { n: 1, name: 'A-102.PDF', dests: [{ path: D + '/PDF', replace: false }, { path: SLOTS.updated, replace: true }] },
    { n: 2, name: 'A-101.dwg', dests: [{ path: D + '/DWG', replace: false }] },
    { n: 3, name: 'notes.txt', dests: [{ path: D + '/DOCS', replace: false }] }
  ]);
  assert.strictEqual(r.plan.mode, 'publish');
  assert.strictEqual(r.slotsMissing, undefined);
  // together: the day folder itself; a day folder that is there makes no steps
  const t = plans.inboxPlan({ slots: { ...SLOTS, sentSplit: false }, tree: CONV, code: '4021', files: F.slice(2, 3), sent: true, updated: false, date: '2026-10-01' });
  assert.deepStrictEqual([t.plan.steps, t.plan.files[0].dests], [[], [{ path: Y + '/4021-pub-2026,10,01', replace: false }]]);
  // an existing type folder is not made again
  const p = plans.inboxPlan({ slots: SLOTS, tree: CONV, code: '4021', files: F.slice(0, 1), sent: true, updated: false, date: '2026-10-01' });
  assert.deepStrictEqual(p.plan.steps, []);
});

test('filing-plan: publish — a target whose folder is not mapped, or not in the tree any more, gets nothing and says so', () => {
  const r = plans.inboxPlan({ slots: { sent: '', sentSplit: true, updated: 'PUBLISH/gone' }, tree: CONV, code: '4021', files: F.slice(0, 1), sent: true, updated: true, date: '2026-10-26' });
  assert.deepStrictEqual(r.slotsMissing, { sent: 'unmapped', updated: 'gone' });
  assert.deepStrictEqual([r.plan.files[0].dests, r.plan.steps], [[], []]);
  // a target not chosen is not reported
  assert.strictEqual(plans.inboxPlan({ slots: null, tree: CONV, code: '4021', files: F, sent: false, updated: false, date: '2026-10-26' }).slotsMissing, undefined);
});
