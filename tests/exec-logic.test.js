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
const L = new Function('uid', m[1] + '\nreturn {EXEC_TYPES,EXEC_PARTIES,execIsClosed,execNextNumber,execWorkdays,execNewItem,execRespond,execSetBall,execAddRevision,execDecide,execWaiting,execBallDays,execCounts,execBallSplit,execForMe,execLogRows,execPartyLabel,execAddWorkdays,execBumpSeq,execSetStatus};')(uid);

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
