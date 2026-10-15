// Run: node --test tests/exec-logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'project_hub_01.html'), 'utf8');
const m = html.match(/\/\* ═══ exec-logic ═══ \*\/([\s\S]*?)\/\* ═══ \/exec-logic ═══ \*\//);
if (!m) throw new Error('exec-logic block not found in project_hub_01.html');
let n = 0;
const uid = () => 'x' + ++n;
const L = new Function('uid', m[1] + '\nreturn {EXEC_TYPES,EXEC_PARTIES,execIsClosed,execNextNumber,execWorkdays,execNewItem,execRespond,execSetBall,execAddRevision,execDecide,execWaiting,execBallDays,execCounts,execBallSplit,execForMe,execLogRows,execPartyLabel,execAddWorkdays,execBumpSeq,execSetStatus,execDecideChange,execChangeSummary,finishStatus,finishFromSubmittal,finishCategories,finishNoteForChange,finishUnlinkItem,execSortToggle,execSortRows};')(uid);

const T0 = '2026-10-04T08:00:00.000Z'; // Sunday
const mk = (over = {}) => L.execNewItem(over.items || [], { type: 'rfi', title: 'גובה תקרה', description: 'שאלה', openedBy: { party: 'contractor', name: 'דנה' }, ballTo: { party: 'architect', name: '' }, ...over }, T0);

test('numbering is per type and per project', () => {
  const a = mk();
  assert.strictEqual(a.number, 'RFI-001');
  const b = L.execNewItem([a], { type: 'rfi', title: 'b', openedBy: { party: 'contractor' } }, T0);
  assert.strictEqual(b.number, 'RFI-002');
  const s = L.execNewItem([a, b], { type: 'submittal', title: 's', openedBy: { party: 'contractor' } }, T0);
  assert.strictEqual(s.number, 'SUB-001');
  assert.deepStrictEqual(s.revisions.map(r => r.label), ['A']);
  assert.strictEqual(s.status, 'submitted');
});

test('workdays count Sunday–Thursday only', () => {
  assert.strictEqual(L.execWorkdays('2026-10-04', '2026-10-11'), 5); // Sun → next Sun
  assert.strictEqual(L.execWorkdays('2026-10-08', '2026-10-11'), 1); // Thu → Sun (Fri, Sat skipped)
  assert.strictEqual(L.execWorkdays('2026-10-11', '2026-10-11'), 0);
  assert.strictEqual(L.execWorkdays('2026-10-12T10:00:00Z', '2026-10-11'), 0);
});

test('new item: opening response, ball history, first status', () => {
  const a = mk();
  assert.strictEqual(a.status, 'pending');
  assert.strictEqual(a.responses.length, 1);
  assert.strictEqual(a.responses[0].kind, 'open');
  assert.deepStrictEqual(a.ballHistory.map(h => h.party), ['architect']);
});

test('respond moves the ball and records history; same ball is not duplicated', () => {
  let a = mk();
  a = L.execRespond(a, { party: 'architect', name: 'שי', body: 'בודקים', ballTo: { party: 'consultant', name: 'אקוסטיקה' } }, '2026-10-06T08:00:00Z');
  assert.deepStrictEqual(a.ball, { party: 'consultant', name: 'אקוסטיקה' });
  a = L.execRespond(a, { party: 'consultant', name: 'אקוסטיקה', body: 'עוד' , ballTo: { party: 'consultant', name: 'אקוסטיקה' } }, '2026-10-07T08:00:00Z');
  assert.strictEqual(a.ballHistory.length, 2);
  a = L.execRespond(a, { party: 'architect', body: 'תשובה', kind: 'answer', ballTo: { party: 'contractor', name: 'דנה' } }, '2026-10-08T08:00:00Z');
  assert.strictEqual(a.status, 'answered');
  a = L.execRespond(a, { party: 'architect', kind: 'close' }, '2026-10-11T08:00:00Z');
  assert.strictEqual(a.status, 'closed');
  assert.strictEqual(a.ball, null);
  assert.ok(a.closedAt);
  assert.ok(L.execIsClosed(a));
});

test('issue: first reply sets in_progress; close resolves; reopen returns to open', () => {
  let i = L.execNewItem([], { type: 'issue', title: 'התנגשות', openedBy: { party: 'supervisor', name: 'רון' }, ballTo: { party: 'architect' } }, T0);
  assert.strictEqual(i.number, 'ISS-001');
  i = L.execRespond(i, { party: 'architect', body: 'מטפלים' }, T0);
  assert.strictEqual(i.status, 'in_progress');
  i = L.execRespond(i, { party: 'architect', kind: 'close' }, T0);
  assert.strictEqual(i.status, 'resolved');
  i = L.execRespond(i, { party: 'contractor', kind: 'reopen', ballTo: { party: 'architect' } }, T0);
  assert.strictEqual(i.status, 'open');
  assert.strictEqual(i.closedAt, null);
  assert.strictEqual(i.ball.party, 'architect');
});

test('submittal rounds: reject → resubmit (Rev B) → approve with notes closes it', () => {
  let s = L.execNewItem([], { type: 'submittal', title: 'HPL', openedBy: { party: 'contractor' }, ballTo: { party: 'architect' } }, T0);
  s = L.execDecide(s, { decision: 'rejected', notes: 'חסר פרט', name: 'שי' }, '2026-10-06T08:00:00Z');
  assert.strictEqual(s.status, 'rejected');
  assert.strictEqual(s.ball.party, 'contractor');
  assert.strictEqual(s.revisions[0].decision, 'rejected');
  s = L.execAddRevision(s, { party: 'contractor', name: 'דנה', files: [] }, '2026-10-08T08:00:00Z');
  assert.deepStrictEqual(s.revisions.map(r => r.label), ['A', 'B']);
  assert.strictEqual(s.status, 'submitted');
  assert.strictEqual(s.ball.party, 'architect');
  s = L.execDecide(s, { decision: 'approved_notes', notes: 'לתקן גוון', name: 'שי' }, '2026-10-11T08:00:00Z');
  assert.ok(L.execIsClosed(s));
  assert.strictEqual(s.ball, null);
});

test('waiting days: current holder and per party', () => {
  let a = mk(); // ball → architect at Sun 4/10
  a = L.execRespond(a, { party: 'architect', body: '', ballTo: { party: 'contractor', name: 'דנה' } }, '2026-10-06T08:00:00Z'); // Tue
  assert.strictEqual(L.execWaiting(a, '2026-10-11'), 3); // Tue→Sun: Wed, Thu, Sun
  const per = L.execBallDays(a, '2026-10-11');
  assert.deepStrictEqual(per.map(p => [p.party, p.days]), [['contractor', 3], ['architect', 2]]);
});

test('counts, ball split, my items and log order', () => {
  const r1 = mk(); // rfi, ball architect since 4/10
  const r2 = L.execRespond(L.execNewItem([r1], { type: 'rfi', title: 'b', openedBy: { party: 'contractor' }, ballTo: { party: 'architect' }, dueDate: '2026-10-20' }, '2026-10-09T08:00:00Z'), { party: 'architect', ballTo: { party: 'contractor' } }, '2026-10-11T08:00:00Z');
  const s1 = L.execNewItem([], { type: 'submittal', title: 's', openedBy: { party: 'contractor' }, ballTo: { party: 'architect' }, ownerId: 'st07' }, T0);
  const i1 = L.execNewItem([], { type: 'issue', title: 'i', openedBy: { party: 'supervisor' }, ballTo: { party: 'consultant', name: 'מיזוג' } }, '2026-09-01T08:00:00Z');
  const closed = L.execRespond(L.execNewItem([], { type: 'issue', title: 'c', openedBy: { party: 'supervisor' } }, T0), { party: 'architect', kind: 'close' }, T0);
  const items = [r1, r2, s1, i1, closed];
  const c = L.execCounts(items, '2026-10-14');
  assert.strictEqual(c.rfiOpen, 2);
  assert.strictEqual(c.rfiLate, 1);       // r1 waiting 8 workdays > 7
  assert.strictEqual(c.subPending, 1);
  assert.strictEqual(c.issuesLate, 1);    // i1 open > 14 workdays
  assert.strictEqual(c.mine, 2);          // r1, s1 (ball architect)
  assert.deepStrictEqual(L.execBallSplit(items), { architect: 2, contractor: 1, supervisor: 0, consultant: 1 });
  assert.deepStrictEqual(L.execForMe(items, 'st07', false).map(x => x.id), [s1.id]);
  assert.deepStrictEqual(L.execForMe(items, 'zz', true).map(x => x.id), [r1.id]);
  const rows = L.execLogRows(items, 'all', '2026-10-14');
  assert.strictEqual(rows[rows.length - 1].id, closed.id, 'closed last');
  assert.strictEqual(rows[0].id, i1.id, 'longest waiting first');
  assert.deepStrictEqual(L.execLogRows(items, 'rfi', '2026-10-14').map(x => x.type), ['rfi', 'rfi']);
  assert.strictEqual(L.execPartyLabel({ party: 'consultant', name: 'מיזוג' }), 'יועץ מיזוג');
  assert.strictEqual(L.execPartyLabel({ party: 'contractor', name: 'דנה' }), 'קבלן · דנה');
  assert.strictEqual(L.execPartyLabel(null), '—');
});

test('add workdays skips Friday and Saturday', () => {
  assert.strictEqual(L.execAddWorkdays('2026-10-08', 1), '2026-10-11'); // Thu → Sun
  assert.strictEqual(L.execAddWorkdays('2026-10-04', 7), '2026-10-13'); // Sun + 7 workdays
  assert.strictEqual(L.execAddWorkdays('2026-10-09T10:00:00Z', 0), '2026-10-09');
  assert.strictEqual(L.execAddWorkdays('', 3), '');
  assert.strictEqual(L.execWorkdays('2026-10-04', L.execAddWorkdays('2026-10-04', 10)), 10);
});

test('a decided revision is never overwritten: deciding twice keeps the first decision', () => {
  let s = L.execNewItem([], { type: 'submittal', title: 'HPL', openedBy: { party: 'contractor' }, ballTo: { party: 'architect' } }, T0);
  s = L.execDecide(s, { decision: 'approved', notes: '', name: 'שי' }, '2026-10-06T08:00:00Z');
  const again = L.execDecide(s, { decision: 'rejected', notes: 'שינוי דעה', name: 'רון' }, '2026-10-07T08:00:00Z');
  assert.strictEqual(again, s, 'returned unchanged');
  assert.strictEqual(again.revisions[0].decision, 'approved');
  assert.strictEqual(again.revisions[0].decidedBy, 'שי');
});

test('reopening a decided submittal awaits resubmission (Rev B) and keeps the Rev A decision', () => {
  let s = L.execNewItem([], { type: 'submittal', title: 'HPL', openedBy: { party: 'contractor' }, ballTo: { party: 'architect' } }, T0);
  s = L.execDecide(s, { decision: 'approved', notes: 'ok', name: 'שי' }, '2026-10-06T08:00:00Z');
  assert.ok(L.execIsClosed(s));
  s = L.execRespond(s, { kind: 'reopen', party: 'architect', name: 'שי', ballTo: { party: 'architect' } }, '2026-10-07T08:00:00Z');
  assert.strictEqual(s.status, 'rejected');
  assert.strictEqual(s.closedAt, null);
  assert.strictEqual(s.ball.party, 'contractor');
  assert.strictEqual(s.revisions.length, 1);
  assert.deepStrictEqual([s.revisions[0].decision, s.revisions[0].notes, s.revisions[0].decidedBy], ['approved', 'ok', 'שי']);
  assert.strictEqual(L.execDecide(s, { decision: 'rejected', name: 'x' }, '2026-10-07T09:00:00Z'), s, 'no decision on an already decided revision');
  s = L.execAddRevision(s, { party: 'contractor', name: 'דנה' }, '2026-10-08T08:00:00Z');
  assert.deepStrictEqual(s.revisions.map(r => [r.label, r.decision]), [['A', 'approved'], ['B', null]]);
  assert.strictEqual(s.status, 'submitted');
  s = L.execDecide(s, { decision: 'approved_notes', notes: 'גוון', name: 'שי' }, '2026-10-11T08:00:00Z');
  assert.deepStrictEqual(s.revisions.map(r => r.decision), ['approved', 'approved_notes']);
});

test('numbers are never reused: the per-type counter survives deleting the highest item', () => {
  const a = L.execNewItem([], { type: 'rfi', title: 'a', openedBy: { party: 'contractor' } }, T0);
  let seq = L.execBumpSeq({}, a);
  const b = L.execNewItem([a], { type: 'rfi', title: 'b', openedBy: { party: 'contractor' } }, T0, seq);
  seq = L.execBumpSeq(seq, b);
  assert.strictEqual(b.number, 'RFI-002');
  assert.deepStrictEqual(seq, { rfi: 2 });
  const c = L.execNewItem([a], { type: 'rfi', title: 'c', openedBy: { party: 'contractor' } }, T0, seq); // RFI-002 deleted
  assert.strictEqual(c.number, 'RFI-003');
  assert.strictEqual(L.execNewItem([a], { type: 'issue', title: 'i', openedBy: { party: 'architect' } }, T0, seq).number, 'ISS-001');
  assert.deepStrictEqual(L.execNextNumber([a, b], 'rfi', { rfi: 1 }), { seq: 3, number: 'RFI-003' }, 'existing items win over a stale counter');
  assert.deepStrictEqual(L.execNextNumber([a], 'rfi'), { seq: 2, number: 'RFI-002' }, 'no counter yet');
  assert.deepStrictEqual(L.execBumpSeq(undefined, a), { rfi: 1 });
  assert.deepStrictEqual(L.execBumpSeq({ rfi: 5, issue: 2 }, a), { rfi: 5, issue: 2 });
});

test('manual status change is recorded in the thread and moves the ball', () => {
  let i = L.execNewItem([], { type: 'issue', title: 'x', openedBy: { party: 'architect' }, ballTo: { party: 'contractor' } }, T0);
  i = L.execSetStatus(i, 'resolved', { name: 'שי' }, '2026-10-06T08:00:00Z');
  assert.strictEqual(i.status, 'resolved');
  assert.strictEqual(i.closedAt, '2026-10-06T08:00:00Z');
  assert.strictEqual(i.ball, null);
  const last = i.responses[i.responses.length - 1];
  assert.deepStrictEqual([last.kind, last.party, last.name, last.body], ['status', 'architect', 'שי', 'סטטוס שונה ל־נפתר']);
  i = L.execSetStatus(i, 'in_progress', { name: 'שי' }, '2026-10-07T08:00:00Z');
  assert.strictEqual(i.closedAt, null);
  assert.deepStrictEqual(i.ball, { party: 'architect', name: '' });
  assert.strictEqual(i.responses.length, 3);
  const r = L.execNewItem([], { type: 'rfi', title: 'r', openedBy: { party: 'contractor' }, ballTo: { party: 'consultant', name: 'מיזוג' } }, T0);
  const r2 = L.execSetStatus(r, 'answered', { name: 'שי' }, T0);
  assert.deepStrictEqual(r2.ball, { party: 'consultant', name: 'מיזוג' }, 'open → open keeps the ball');
  assert.strictEqual(L.execSetStatus(r2, 'answered', { name: 'שי' }, T0), r2, 'same status: unchanged');
  const s = L.execNewItem([], { type: 'submittal', title: 's', openedBy: { party: 'contractor' } }, T0);
  assert.strictEqual(L.execSetStatus(s, 'approved', { name: 'שי' }, T0), s, 'submittals change status only through rounds');
});

test('ball history and links entries carry ids (merged per entry)', () => {
  let a = mk();
  a = L.execRespond(a, { party: 'architect', ballTo: { party: 'contractor' } }, '2026-10-06T08:00:00Z');
  assert.ok(a.ballHistory.length === 2 && a.ballHistory.every(h => typeof h.id === 'string'));
  assert.strictEqual(new Set(a.ballHistory.map(h => h.id)).size, 2);
});

// ── Round 2: change requests and finishes ──
const mkChg = (over = {}) => L.execNewItem(over.items || [], { type: 'change', title: 'ריצוף לובי', tenderSpec: 'אבן טבעית', tenderRef: '11.02.010', proposed: 'פורצלן 60/120', saving: '45000', openedBy: { party: 'contractor', name: 'דנה' }, ballTo: { party: 'architect', name: '' }, ...over }, T0);

test('change: numbering CHG-001, fields, first status', () => {
  const c = mkChg();
  assert.strictEqual(c.number, 'CHG-001');
  assert.strictEqual(c.status, 'requested');
  assert.strictEqual(c.tenderSpec, 'אבן טבעית');
  assert.strictEqual(c.tenderRef, '11.02.010');
  assert.strictEqual(c.proposed, 'פורצלן 60/120');
  assert.strictEqual(c.saving, 45000);
  assert.strictEqual(c.approvedText, '');
  assert.deepStrictEqual(c.revisions, []);
  const c2 = mkChg({ items: [c], saving: 'abc' });
  assert.strictEqual(c2.number, 'CHG-002');
  assert.strictEqual(c2.saving, 0);
  const r = L.execNewItem([], { type: 'rfi', title: 'r' }, T0);
  assert.ok(!('tenderSpec' in r) && !('approvedText' in r));
});

test('change: reply moves requested → in_review', () => {
  let c = mkChg();
  c = L.execRespond(c, { party: 'architect', body: 'בודקים', ballTo: { party: 'consultant', name: 'כמאי' } }, '2026-10-05T08:00:00Z');
  assert.strictEqual(c.status, 'in_review');
});

test('change: decide approved defaults approvedText to proposed, closes, ball null', () => {
  let c = mkChg();
  c = L.execDecideChange(c, { decision: 'approved', notes: 'בכפוף לדוגמה', name: 'שי', files: [{ id: 'f', url: 'u', name: 'n' }] }, '2026-10-07T08:00:00Z');
  assert.strictEqual(c.status, 'approved');
  assert.strictEqual(c.approvedText, 'פורצלן 60/120');
  assert.strictEqual(c.closedAt, '2026-10-07T08:00:00Z');
  assert.strictEqual(c.ball, null);
  assert.ok(L.execIsClosed(c));
  const last = c.responses[c.responses.length - 1];
  assert.strictEqual(last.kind, 'decision');
  assert.strictEqual(last.body, 'בכפוף לדוגמה');
  assert.strictEqual(last.files.length, 1);
  assert.strictEqual(c.ballHistory[c.ballHistory.length - 1].party, null);
  const c2 = L.execDecideChange(mkChg(), { decision: 'approved_cond', approvedText: 'פורצלן 80/160', notes: 'x' }, T0);
  assert.strictEqual(c2.approvedText, 'פורצלן 80/160');
});

test('change: decide rejected clears approvedText and closes; deciding twice is a no-op', () => {
  let c = mkChg();
  c = L.execDecideChange(c, { decision: 'rejected', approvedText: 'משהו', notes: 'לא תואם' }, '2026-10-07T08:00:00Z');
  assert.strictEqual(c.status, 'rejected');
  assert.strictEqual(c.approvedText, '');
  assert.ok(c.closedAt);
  assert.ok(L.execIsClosed(c));
  const again = L.execDecideChange(c, { decision: 'approved' }, '2026-10-08T08:00:00Z');
  assert.strictEqual(again, c);
  const rfi = mk();
  assert.strictEqual(L.execDecideChange(rfi, { decision: 'approved' }, T0), rfi);
});

test('change: reopen → requested and clears approvedText', () => {
  let c = L.execDecideChange(mkChg(), { decision: 'approved' }, '2026-10-07T08:00:00Z');
  c = L.execRespond(c, { party: 'architect', kind: 'reopen', ballTo: { party: 'architect' } }, '2026-10-08T08:00:00Z');
  assert.strictEqual(c.status, 'requested');
  assert.strictEqual(c.approvedText, '');
  assert.strictEqual(c.closedAt, null);
  assert.ok(!L.execIsClosed(c));
});

test('change summary sums savings; counts and log rows', () => {
  const a = mkChg({ saving: 10000 });
  const b = L.execDecideChange(mkChg({ items: [a], saving: 20000 }), { decision: 'approved' }, T0);
  const c = L.execDecideChange(mkChg({ items: [a, b], saving: 30000 }), { decision: 'approved_cond', notes: 'x' }, T0);
  const d = L.execDecideChange(mkChg({ items: [a, b, c], saving: 40000 }), { decision: 'rejected', notes: 'x' }, T0);
  const r = mk();
  const sum = L.execChangeSummary([a, b, c, d, r]);
  assert.deepStrictEqual(sum, { count: 4, pending: 1, proposed: 100000, approved: 50000, rejected: 1, rejectedSum: 40000 });
  assert.deepStrictEqual(L.execChangeSummary([]), { count: 0, pending: 0, proposed: 0, approved: 0, rejected: 0, rejectedSum: 0 });
  assert.strictEqual(L.execLogRows([a, r], 'all', '2026-10-10').length, 2);
  assert.deepStrictEqual(L.execLogRows([a, r], 'change', '2026-10-10').map(i => i.id), [a.id]);
  assert.deepStrictEqual(L.execForMe([a], 's1', true).map(i => i.id), [a.id]);
  assert.strictEqual(L.execCounts([a], '2026-10-10').rfiOpen, 0);
});

const mkSub = () => L.execNewItem([], { type: 'submittal', title: 'אריח חזית', specSection: '14.01', discipline: 'arch', files: [{ id: 'a1', url: 'ua', name: 'revA.pdf' }], openedBy: { party: 'contractor' }, ballTo: { party: 'architect' } }, T0);

test('finishStatus: by linked submittal or by approvedAt', () => {
  let s = mkSub();
  const row = { id: 'r1', submittalId: s.id };
  assert.strictEqual(L.finishStatus(row, [s]), 'pending');
  const ok = L.execDecide(s, { decision: 'approved_notes', notes: 'n', name: 'שי' }, '2026-10-06T08:00:00Z');
  assert.strictEqual(L.finishStatus(row, [ok]), 'approved');
  assert.strictEqual(L.finishStatus(row, []), 'pending');
  assert.strictEqual(L.finishStatus({ id: 'r2', approvedAt: '2026-10-01' }, []), 'approved');
  assert.strictEqual(L.finishStatus({ id: 'r3', approvedAt: '' }, []), 'pending');
});

test('finishFromSubmittal takes fields from the last decided revision', () => {
  let s = mkSub();
  s = L.execDecide(s, { decision: 'rejected', notes: 'גוון שגוי', name: 'רון' }, '2026-10-05T08:00:00Z');
  s = L.execAddRevision(s, { files: [{ id: 'b1', url: 'ub', name: 'revB.pdf' }] }, '2026-10-06T08:00:00Z');
  s = L.execDecide(s, { decision: 'approved', notes: 'מאושר', name: 'שי', files: [{ id: 'd1', url: 'ud', name: 'stamp.pdf' }] }, '2026-10-07T08:00:00Z');
  const f = L.finishFromSubmittal(s);
  assert.ok(typeof f.id === 'string' && f.id);
  assert.strictEqual(f.element, 'אריח חזית');
  assert.strictEqual(f.approvedAt, '2026-10-07');
  assert.strictEqual(f.approvedBy, 'שי');
  assert.strictEqual(f.notes, 'מאושר');
  assert.deepStrictEqual(f.files.map(x => x.id), ['b1', 'd1']);
  assert.strictEqual(f.submittalId, s.id);
  assert.strictEqual(f.changeId, null);
  assert.strictEqual(f.image, null);
  assert.strictEqual(f.specSection, '14.01');
  assert.strictEqual(f.discipline, 'arch');
  for (const k of ['category', 'location', 'material', 'finish', 'color', 'colorHex', 'supplier']) assert.strictEqual(f[k], '');
});

test('finishCategories: unique non-empty, first-appearance order', () => {
  assert.deepStrictEqual(L.finishCategories([{ category: 'ריצוף' }, { category: '' }, { category: 'חזיתות' }, { category: 'ריצוף' }, {}]), ['ריצוף', 'חזיתות']);
  assert.deepStrictEqual(L.finishCategories(null), []);
});

test('change: the decision line records the decision and what was approved; manual status change is ignored', () => {
  const c = L.execDecideChange(mkChg(), { decision: 'approved_cond', approvedText: 'פורצלן 80/160', notes: 'בכפוף לדוגמה' }, T0);
  const last = c.responses[c.responses.length - 1];
  assert.strictEqual(last.decision, 'approved_cond');
  assert.strictEqual(last.approvedText, 'פורצלן 80/160');
  const r = L.execDecideChange(mkChg(), { decision: 'rejected', notes: 'x' }, T0);
  assert.strictEqual(r.responses[r.responses.length - 1].approvedText, '');
  const open = mkChg();
  assert.strictEqual(L.execSetStatus(open, 'approved', { name: 'שי' }, T0), open, 'changes are decided only through execDecideChange');
});

// ── Round 2 review: finishes links survive deletes and reopened changes ──
test('finishStatus: a link to a deleted submittal falls back to approvedAt', () => {
  assert.strictEqual(L.finishStatus({ id: 'r1', submittalId: 'gone', approvedAt: '2026-10-07' }, []), 'approved');
  assert.strictEqual(L.finishStatus({ id: 'r2', submittalId: 'gone', approvedAt: '' }, []), 'pending');
  const s = mkSub(); // linked and still pending: the link wins over approvedAt
  assert.strictEqual(L.finishStatus({ id: 'r3', submittalId: s.id, approvedAt: '2026-10-07' }, [s]), 'pending');
});

test('finishNoteForChange appends once, then replaces the line for the same change', () => {
  assert.strictEqual(L.finishNoteForChange('', 'CHG-001', 'פורצלן'), 'שונה לפי CHG-001: פורצלן');
  assert.strictEqual(L.finishNoteForChange(null, 'CHG-001', 'פורצלן'), 'שונה לפי CHG-001: פורצלן');
  const a = L.finishNoteForChange('הערה קיימת', 'CHG-001', 'פורצלן');
  assert.strictEqual(a, 'הערה קיימת\nשונה לפי CHG-001: פורצלן');
  const b = L.finishNoteForChange(a + '\nשונה לפי CHG-002: אחר', 'CHG-001', 'גרניט');
  assert.strictEqual(b, 'הערה קיימת\nשונה לפי CHG-001: גרניט\nשונה לפי CHG-002: אחר');
  assert.strictEqual(L.finishNoteForChange(b, 'CHG-001', 'גרניט'), b, 'idempotent');
  // CHG-001 does not match CHG-0010
  assert.strictEqual(L.finishNoteForChange('שונה לפי CHG-0010: x', 'CHG-001', 'y'), 'שונה לפי CHG-0010: x\nשונה לפי CHG-001: y');
  // duplicates from before the fix collapse into one line
  assert.strictEqual(L.finishNoteForChange('שונה לפי CHG-001: a\nשונה לפי CHG-001: b', 'CHG-001', 'c'), 'שונה לפי CHG-001: c');
});

test('finishUnlinkItem clears submittalId / changeId pointing at a deleted item', () => {
  const rows = [{ id: 'a', submittalId: 's1', changeId: 'c1' }, { id: 'b', submittalId: 's2', changeId: 's1' }, { id: 'c', submittalId: null, changeId: null }];
  const out = L.finishUnlinkItem(rows, 's1');
  assert.deepStrictEqual(out.rows.map(r => [r.submittalId, r.changeId]), [[null, 'c1'], ['s2', null], [null, null]]);
  assert.strictEqual(out.count, 2);
  assert.strictEqual(out.rows[2], rows[2], 'untouched rows keep identity');
  assert.deepStrictEqual(L.finishUnlinkItem(null, 's1'), { rows: [], count: 0 });
});

test('header clicks build a sort hierarchy: add, flip, drop', () => {
  let s = L.execSortToggle([], 'due');
  assert.deepStrictEqual(s, [{ key: 'due', dir: 'asc' }]);
  s = L.execSortToggle(s, 'ball');
  assert.deepStrictEqual(s.map(x => x.key), ['due', 'ball']);
  s = L.execSortToggle(s, 'due');
  assert.deepStrictEqual(s, [{ key: 'due', dir: 'desc' }, { key: 'ball', dir: 'asc' }]);
  s = L.execSortToggle(s, 'due');
  assert.deepStrictEqual(s, [{ key: 'ball', dir: 'asc' }]);
});

test('multi-level sort: second key breaks ties, empties last both ways, stable otherwise', () => {
  const rows = [{ id: 1, p: 'קבלן', d: '2026-10-20' }, { id: 2, p: 'אדריכל', d: '' }, { id: 3, p: 'קבלן', d: '2026-10-10' }, { id: 4, p: 'אדריכל', d: '2026-10-12' }];
  const v = (r, k) => k === 'party' ? r.p : r.d;
  assert.deepStrictEqual(L.execSortRows(rows, [{ key: 'party', dir: 'asc' }, { key: 'due', dir: 'asc' }], v).map(r => r.id), [4, 2, 3, 1]);
  assert.deepStrictEqual(L.execSortRows(rows, [{ key: 'due', dir: 'desc' }], v).map(r => r.id), [1, 4, 3, 2]);
  assert.deepStrictEqual(L.execSortRows(rows, [{ key: 'party', dir: 'desc' }], v).map(r => r.id), [1, 3, 2, 4]);
  assert.strictEqual(L.execSortRows(rows, [], v), rows);
  const nums = [{ n: 10 }, { n: 9 }, { n: null }, { n: 100 }];
  assert.deepStrictEqual(L.execSortRows(nums, [{ key: 'n', dir: 'asc' }], r => r.n).map(r => r.n), [9, 10, 100, null]);
});
