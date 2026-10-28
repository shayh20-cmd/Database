'use strict';
// Filing without Claude: the plans built in code (filing-plan.js) and the map's slots (filing-ai.js).
// Run: node --test tools/local-server/test/filing-plan.test.js
const test = require('node:test');
const assert = require('node:assert');
const ai = require('../filing-ai');
const L = require('../filing-layout');

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

test('filing-ai: "הצע" on publish — the prompt carries the slots, and a replace of a file that is not a PDF is dropped', async () => {
  const x = {
    project: { code: 'X', name: 'n' }, map: { areas: { publish: { paths: ['P'], note: '' } }, slots: { sent: 'P/S', sentSplit: false, updated: 'P/U' } },
    guide: '', tree: ['P', 'P/S', 'P/U'], today: '2026-10-26', files: [{ n: 0, name: 'a.pdf' }, { n: 1, name: 'a.dwg' }], sent: true, updated: true, text: '', lang: 'he'
  };
  assert.match(ai.inboxContent(x), /\nSlots: SENT archive P\/S \(all files together\); UPDATED \(PDF only\) P\/U\n/);
  assert.match(ai.inboxContent({ ...x, map: { areas: {} } }), /\nSlots: \(none\)\n/);
  const client = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
    message: 'm', mode: 'publish', steps: [], files: [{ name: 'a.pdf', dests: [{ path: 'P/U', replace: true }] }, { name: 'a.dwg', dests: [{ path: 'P/U', replace: true }, { path: 'P/S', replace: false }] }]
  }) }] }) } };
  const out = await ai.inboxProposal(client, 'claude-haiku-5-5', x);
  assert.deepStrictEqual(out.plan.files.map(f => f.dests), [[{ path: 'P/U', replace: true }], [{ path: 'P/S', replace: false }]]);
  assert.strictEqual(out.replaceStripped, 'pdf_only');
});

test('filing-plan: receive — toVer follows the real plan (@ver already holds the name; v9999), and mixed stems', () => {
  const base = ['C', 'C/4021-KONS', 'C/4021-KONS/4021-KONS-plans'];
  const D = 'C/4021-KONS/4021-KONS-plans';
  const from = { kind: 'consultant', folder: 'C/4021-KONS', name: 'x' };
  // (a) the @ver folder already holds a folder named like the previous version: the move is not made
  const a = plans.receivePlan({ tree: [...base, D + '/4021-KONS-plans-v03', D + '/4021-KONS-plans-@ver', D + '/4021-KONS-plans-@ver/4021-KONS-plans-v03'], code: '4021', from, doc: 'plan', toVer: true, files: PF });
  assert.deepStrictEqual(a.plan.steps.map(s => s.op), ['mkdir']);
  assert.strictEqual(a.version.toVer, false);
  assert.strictEqual(a.version.verBlocked, true);
  // (b) v9999 -> v10000 is no version name: no move and no empty @ver folder
  const b = plans.receivePlan({ tree: [...base, D + '/4021-KONS-plans-v9999'], code: '4021', from, doc: 'plan', toVer: true, files: PF });
  assert.deepStrictEqual(b.plan.steps.map(s => [s.op, s.path]), [['mkdir', D + '/4021-KONS-plans-v10000']]);
  assert.strictEqual(b.version.toVer, false);
  assert.strictEqual(b.version.verBlocked, undefined);
  // versions named like the folder are the line; an old naming counts only when none is
  const m = plans.nextVersion([...base, D + '/4021-KONS-plans-v03', D + '/old-v12'], 'C/4021-KONS', '4021');
  assert.deepStrictEqual([m.name, m.prev], ['4021-KONS-plans-v04', D + '/4021-KONS-plans-v03']);
});

const P = 'LDLI-work/LDLI-publish';
const SENT = P + '/LDLI-pub-@sent', UPD = P + '/LDLI-pub-updated';
const LIB_TREE = ['LDLI-work', P, SENT, SENT + '/LDLI-pub-sent-PDF', SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026',
  SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,19 - חניה זמנית',
  SENT + '/LDLI-pub-sent-DWG', SENT + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026',
  SENT + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026/LDLI-pub-DWG-2026,10,19 - חניה זמנית',
  UPD, UPD + '/LDLI-pub-updated-PDF', UPD + '/LDLI-pub-updated-DWG'];
const LIB_LAYOUT = {
  sent: { base: SENT, levels: [{ kind: 'type', pattern: 'LDLI-pub-sent-{type}' }, { kind: 'year', pattern: 'LDLI-pub-{type}-{yyyy}' }, { kind: 'day', pattern: 'LDLI-pub-{type}-{yyyy},{mm},{dd}' }] },
  updated: { base: UPD, levels: [{ kind: 'type', pattern: 'LDLI-pub-updated-{type}' }] }
};
const lib = over => plans.publishPlan({ layout: LIB_LAYOUT, types: L.OFFICE_TYPES, tree: LIB_TREE, code: 'LDLI', files: [{ n: 0, name: 'K-0.pdf' }, { n: 1, name: 'Sheet.zip' }, { n: 2, name: 'notes.pptx' }], sent: true, updated: false, date: '2026-10-28', desc: '', ...over });

test('filing-plan: publishPlan — the Library\'s layout, a description, the folders made once', () => {
  const D = SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,28 - לוחות';
  const out = lib({ desc: 'לוחות' });
  assert.deepStrictEqual(out.plan.files.map(f => [f.type, f.dests.map(d => d.path)]), [
    ['PDF', [D]],
    ['DWG', [SENT + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026/LDLI-pub-DWG-2026,10,28 - לוחות']],
    ['DOCS', [SENT + '/LDLI-pub-sent-DOCS/LDLI-pub-DOCS-2026/LDLI-pub-DOCS-2026,10,28 - לוחות']]
  ]);
  assert.deepStrictEqual(out.plan.steps.map(s => s.path), [
    D,
    SENT + '/LDLI-pub-sent-DWG/LDLI-pub-DWG-2026/LDLI-pub-DWG-2026,10,28 - לוחות',
    SENT + '/LDLI-pub-sent-DOCS', SENT + '/LDLI-pub-sent-DOCS/LDLI-pub-DOCS-2026', SENT + '/LDLI-pub-sent-DOCS/LDLI-pub-DOCS-2026/LDLI-pub-DOCS-2026,10,28 - לוחות'
  ]);
  assert.deepStrictEqual(out.days, []);
  assert.strictEqual(lib({}).plan.files[0].dests[0].path, SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,28', 'no description: the date only');
});

test('filing-plan: publishPlan — an existing day folder by its description; the days offered', () => {
  const out = lib({ date: '2026-10-19', desc: 'חניה זמנית', files: [{ n: 0, name: 'K-0.pdf' }] });
  assert.deepStrictEqual(out.plan.files[0].dests, [{ path: SENT + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,19 - חניה זמנית', replace: false }]);
  assert.deepStrictEqual(out.plan.steps, []);
  assert.deepStrictEqual(lib({ date: '2026-10-19' }).days, ['חניה זמנית']);
});

test('filing-plan: publishPlan — a type changed for one file, a folder of the tree for one file, a folder that is not there', () => {
  const out = lib({ typeOf: { 0: 'DWG' }, dests: { 2: SENT + '/LDLI-pub-sent-PDF' } });
  assert.strictEqual(out.plan.files[0].type, 'DWG');
  assert.ok(out.plan.files[0].dests[0].path.startsWith(SENT + '/LDLI-pub-sent-DWG/'));
  assert.deepStrictEqual(out.plan.files[2].dests, [{ path: SENT + '/LDLI-pub-sent-PDF', replace: false }]);
  const bad = lib({ dests: { 1: 'NOT/THERE' } });
  assert.deepStrictEqual([bad.plan.files[1].dests, bad.plan.files[1].problem], [[], 'dest']);
  assert.strictEqual(lib({ typeOf: { 0: 'NOPE' } }).plan.files[0].type, 'PDF', 'a type not in the list is ignored');
});

test('filing-plan: publishPlan — UPDATED by type, replacing; a missing target said', () => {
  const out = lib({ sent: false, updated: true });
  assert.deepStrictEqual(out.plan.files.map(f => f.dests), [
    [{ path: UPD + '/LDLI-pub-updated-PDF', replace: true }],
    [{ path: UPD + '/LDLI-pub-updated-DWG', replace: true }],
    [{ path: UPD + '/LDLI-pub-updated-DOCS', replace: true }]
  ]);
  assert.deepStrictEqual(out.plan.steps.map(s => s.path), [UPD + '/LDLI-pub-updated-DOCS']);
  const none = plans.publishPlan({ layout: { sent: { base: '', levels: [] }, updated: { base: 'GONE', levels: [] } }, types: L.OFFICE_TYPES, tree: LIB_TREE, code: 'LDLI', files: [{ n: 0, name: 'a.pdf' }], sent: true, updated: true, date: '2026-10-28', desc: '' });
  assert.deepStrictEqual(none.slotsMissing, { sent: 'unmapped', updated: 'gone' });
});

test('filing-plan: layoutFor — saved, recognized from the tree, the convention; UPDATED by type from an old slot', () => {
  const map = { areas: {}, slots: { sent: SENT, sentSplit: true, updated: UPD + '/LDLI-pub-updated-PDF' }, publish: null };
  const got = plans.layoutFor(map, LIB_TREE, L.OFFICE_TYPES);
  assert.strictEqual(got.from, 'detected');
  assert.deepStrictEqual(got.layout.sent, LIB_LAYOUT.sent);
  assert.deepStrictEqual(got.layout.updated, LIB_LAYOUT.updated);
  assert.deepStrictEqual(plans.layoutFor({ ...map, publish: { ...LIB_LAYOUT, types: null } }, [], L.OFFICE_TYPES).from, 'saved');
  const conv = plans.layoutFor({ areas: {}, slots: { sent: 'P/X-pub-@sent', sentSplit: false, updated: '' } }, ['P', 'P/X-pub-@sent'], L.OFFICE_TYPES);
  assert.strictEqual(conv.from, 'convention');
  assert.deepStrictEqual(conv.layout.sent.levels, [{ kind: 'year', pattern: '{code}-pub-sent-{yyyy}' }, { kind: 'day', pattern: '{code}-pub-{yyyy},{mm},{dd}' }]);
  const empty = plans.layoutFor({ areas: {} }, LIB_TREE, L.OFFICE_TYPES);
  assert.strictEqual(empty.layout.sent.base, SENT, 'no slots: the convention\'s folder names found in the tree (autoSlots)');
});
