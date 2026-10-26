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

const KP = 'CONSULTANTS/4021-KONS/4021-KONS-plans';
const RT = ['CONSULTANTS', 'CONSULTANTS/4021-KONS', KP, KP + '/4021-KONS-plans-v02', KP + '/4021-KONS-plans-v03', KP + '/4021-KONS-plans-@ver', 'CONSULTANTS/4021-KONS/4021-KONS-docs',
  'CONSULTANTS/4021-ELEC', 'CONSULTANTS/4021-ELEC/ELEC-V7', 'CONSULTANTS/4021-HVAC', 'CONSULTANTS/4021-HVAC/4021-HVAC-plans', 'CONSULTANTS/4021-HVAC/4021-HVAC-plans/גרסה 3',
  'CONSULTANTS/4021-WATER', 'CONSULTANTS/4021-WATER/w-v009', 'PERMIT', 'PERMIT/4021-permit-fire'];
const PF = [{ n: 0, name: 'K-101.pdf' }, { n: 1, name: 'K-102.dwg' }];
const cons = folder => ({ kind: 'consultant', folder, name: 'x' });

test('filing-plan: the next version follows the versions there — same name, one up, same digits', () => {
  assert.deepStrictEqual(plans.nextVersion(RT, 'CONSULTANTS/4021-KONS', '4021'), { dir: KP, make: false, name: '4021-KONS-plans-v04', editable: false, prev: KP + '/4021-KONS-plans-v03', ver: KP + '/4021-KONS-plans-@ver', verName: '4021-KONS-plans-@ver' });
  const e = plans.nextVersion(RT, 'CONSULTANTS/4021-ELEC', '4021');   // versions right in the consultant's folder, a capital V
  assert.deepStrictEqual([e.dir, e.name, e.prev, e.ver, e.verName], ['CONSULTANTS/4021-ELEC', 'ELEC-V8', 'CONSULTANTS/4021-ELEC/ELEC-V7', '', 'ELEC-@ver']);
  assert.strictEqual(plans.nextVersion(RT, 'CONSULTANTS/4021-WATER', '4021').name, 'w-v010');
  // folders there, none named …-vNN: the name is the person's to type, suggested by the convention
  assert.deepStrictEqual(plans.nextVersion(RT, 'CONSULTANTS/4021-HVAC', '4021'), { dir: 'CONSULTANTS/4021-HVAC/4021-HVAC-plans', make: false, name: '4021-HVAC-plans-v01', editable: true, prev: '', ver: '', verName: '' });
  // nothing yet: <code>-<consultant>-plans/…-v01, the plans folder made too
  assert.deepStrictEqual(plans.nextVersion(['C', 'C/4021-SAFE'], 'C/4021-SAFE', '4021'), { dir: 'C/4021-SAFE/4021-SAFE-plans', make: true, name: '4021-SAFE-plans-v01', editable: false, prev: '', ver: '', verName: '' });
});

test('filing-plan: receive — a consultant\'s plans as a new version, the current one to @ver when chosen', () => {
  const V4 = KP + '/4021-KONS-plans-v04';
  const r = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-KONS'), doc: 'plan', files: PF });
  assert.deepStrictEqual(r.plan.steps, [
    { op: 'mkdir', path: V4, from: '', to: '' },
    { op: 'move', path: '', from: KP + '/4021-KONS-plans-v03', to: KP + '/4021-KONS-plans-@ver/4021-KONS-plans-v03' }
  ]);
  assert.deepStrictEqual(r.plan.files.map(f => f.dests), [[{ path: V4, replace: false }], [{ path: V4, replace: false }]]);
  assert.deepStrictEqual(r.version, { name: '4021-KONS-plans-v04', editable: false, prev: KP + '/4021-KONS-plans-v03', hasVer: true, toVer: true });
  assert.strictEqual(r.problem, undefined);
  // the person unticks the move
  assert.deepStrictEqual(plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-KONS'), doc: 'plan', toVer: false, files: PF }).plan.steps.map(s => s.op), ['mkdir']);
  // no @ver folder there: off unless ticked; ticked → the @ver folder is made first
  const e = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-ELEC'), doc: 'plan', files: PF });
  assert.deepStrictEqual([e.plan.steps.map(s => s.op), e.version.toVer], [['mkdir'], false]);
  const et = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-ELEC'), doc: 'plan', toVer: true, files: PF });
  assert.deepStrictEqual(et.plan.steps.map(s => s.op + ' ' + (s.path || s.to)), ['mkdir CONSULTANTS/4021-ELEC/ELEC-V8', 'mkdir CONSULTANTS/4021-ELEC/ELEC-@ver', 'move CONSULTANTS/4021-ELEC/ELEC-@ver/ELEC-V7']);
});

test('filing-plan: receive — a typed version name where the versions are not …-vNN; no @ver then', () => {
  const H = 'CONSULTANTS/4021-HVAC/4021-HVAC-plans';
  const r = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-HVAC'), doc: 'plan', versionName: 'גרסה 4', toVer: true, files: PF });
  assert.deepStrictEqual([r.plan.steps.map(s => s.op + ' ' + s.path), r.plan.files[0].dests[0].path], [['mkdir ' + H + '/גרסה 4'], H + '/גרסה 4']);
  assert.deepStrictEqual(r.version, { name: '4021-HVAC-plans-v01', editable: true, prev: '', hasVer: false, toVer: false });
  // nothing typed: the suggestion; a bad or taken name: nothing to file, said
  assert.strictEqual(plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-HVAC'), doc: 'plan', files: PF }).plan.files[0].dests[0].path, H + '/4021-HVAC-plans-v01');
  for (const bad of ['a/b', '..', 'גרסה 3', 'x?']) {
    const b = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-HVAC'), doc: 'plan', versionName: bad, files: PF });
    assert.deepStrictEqual([b.problem, b.plan.files[0].dests, b.plan.steps], ['name', [], []], bad);
  }
  // a typed name is ignored where the name is not the person's to choose
  assert.strictEqual(plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-KONS'), doc: 'plan', versionName: 'mine', files: PF }).plan.files[0].dests[0].path, KP + '/4021-KONS-plans-v04');
});

test('filing-plan: receive — documents, a new consultant, another party; what is missing is said', () => {
  const d = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-KONS'), doc: 'doc', files: PF });
  assert.deepStrictEqual([d.plan.steps, d.plan.files[0].dests], [[], [{ path: 'CONSULTANTS/4021-KONS/4021-KONS-docs', replace: false }]]);
  const nd = plans.receivePlan({ tree: RT, code: '4021', from: cons('CONSULTANTS/4021-ELEC'), doc: 'doc', files: PF });
  assert.deepStrictEqual(nd.plan.steps.map(s => s.path), ['CONSULTANTS/4021-ELEC/4021-ELEC-docs']);
  const fresh = plans.receivePlan({ tree: ['C', 'C/4021-SAFE'], code: '4021', from: cons('C/4021-SAFE'), doc: 'plan', files: PF });
  assert.deepStrictEqual(fresh.plan.steps.map(s => s.path), ['C/4021-SAFE/4021-SAFE-plans', 'C/4021-SAFE/4021-SAFE-plans/4021-SAFE-plans-v01']);
  const o = plans.receivePlan({ tree: RT, code: '4021', from: { kind: 'other', folder: 'permit/4021-PERMIT-FIRE', name: 'fire' }, doc: '', files: PF });
  assert.deepStrictEqual([o.plan.steps, o.plan.files[1].dests], [[], [{ path: 'PERMIT/4021-permit-fire', replace: false }]]);
  const problem = x => plans.receivePlan({ tree: RT, code: '4021', files: PF, doc: 'plan', ...x }).problem;
  assert.strictEqual(problem({ from: null }), 'no_from');
  assert.strictEqual(problem({ from: { kind: 'consultant' } }), 'no_consultant');
  assert.strictEqual(problem({ from: { kind: 'consultant', folder: '', name: 'Electric · Volt' } }), 'consultant_folder');
  assert.strictEqual(problem({ from: cons('NOT/THERE') }), 'consultant_folder');
  assert.strictEqual(problem({ from: cons('CONSULTANTS/4021-KONS'), doc: '' }), 'no_doc');
  assert.strictEqual(problem({ from: { kind: 'other', folder: '' } }), 'other_folder');
});

test('filing-plan: the sender\'s address picks the consultant whose folder matched its register contact', () => {
  const contacts = [{ name: 'Avi', role: 'Electric', firm: 'Volt', emails: ['Avi@Volt.co.il'] }, { name: 'Dan', role: 'Water', firm: 'Aqua', emails: ['dan@aqua.co'] }];
  const options = { consultants: [{ label: 'KONS', folder: 'C/4021-KONS', contact: '' }, { label: 'ELEC', folder: 'C/4021-ELEC', contact: 'Electric · Volt' }, { label: 'Water · Aqua', folder: null, contact: 'Water · Aqua' }] };
  assert.strictEqual(plans.senderConsultant(options, contacts, 'avi@volt.co.il '), 1);
  assert.strictEqual(plans.senderConsultant(options, contacts, 'dan@aqua.co'), -1, 'a consultant without a folder is not picked');
  assert.strictEqual(plans.senderConsultant(options, contacts, 'nobody@x.com'), -1);
  assert.strictEqual(plans.senderConsultant(options, contacts, ''), -1);
});
