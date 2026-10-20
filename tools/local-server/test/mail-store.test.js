'use strict';
// Mail suggestions — one person's document (mail-store.js). Run: node --test tools/local-server/test/mail-store.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const S = require('../mail-store');

const NOW = '2026-10-20T08:00:00.000Z';
const DAY = 24 * 3600 * 1000;
const ago = days => new Date(Date.parse(NOW) - days * DAY).toISOString();
const mail = (id, extra) => ({ id, from: 'dan@example.com', fromName: 'דני', subject: 'חזית מערבית', received: '2026-10-20T09:14:00+03:00', body: 'x'.repeat(7000), attachments: ['a.pdf'], ...extra });
const TASK = { kind: 'task', title: 'לעדכן חזית', projectId: 'p1', taskId: '', taskTitle: '', due: '2026-10-27', reason: 'מבקשים תיקון' };

test('ingest: new messages wait as pending, seen ones count as duplicates', () => {
  let r = S.ingest({}, [mail('m1'), mail('m2')], NOW);
  assert.strictEqual(r.accepted, 2);
  r = S.ingest(r.doc, [mail('m2'), mail('m3'), { subject: 'no id' }], NOW);
  assert.deepStrictEqual([r.accepted, r.duplicates], [1, 1]);
  assert.deepStrictEqual(S.pendingIds(r.doc), ['m1', 'm2', 'm3']);
  assert.strictEqual(r.doc.items[0].mail.body.length, 6000);
  assert.deepStrictEqual(r.doc.items[0].mail.attachments, ['a.pdf']);
  assert.strictEqual(r.doc.stats.scanned, 3);
  assert.strictEqual(r.doc.stats.weekOf, '2026-10-18');
});

test('ingest: a single attachment sent as a string still becomes a list', () => {
  const r = S.ingest({}, [mail('m1', { attachments: 'plan.dwg' })], NOW);
  assert.deepStrictEqual(r.doc.items[0].mail.attachments, ['plan.dwg']);
});

test('applySuggestion keeps a 1,500-character excerpt and drops the body; ignore shows nothing', () => {
  let doc = S.ingest({}, [mail('m1'), mail('m2')], NOW).doc;
  doc = S.applySuggestion(doc, 'm1', TASK, NOW);
  doc = S.applySuggestion(doc, 'm2', { ...TASK, kind: 'ignore' }, NOW);
  const [a, b] = doc.items;
  assert.strictEqual(a.status, 'new');
  assert.strictEqual(a.mail.excerpt.length, 1500);
  assert.strictEqual(a.mail.body, undefined);
  assert.strictEqual(b.status, 'ignored');
  assert.strictEqual(doc.stats.suggested, 1);
  assert.deepStrictEqual(S.pendingIds(doc), []);
});

test('failAttempt: three failures make it failed; retry puts it back in the queue', () => {
  let doc = S.ingest({}, [mail('m1')], NOW).doc;
  doc = S.failAttempt(doc, 'm1', 'boom');
  doc = S.failAttempt(doc, 'm1', 'boom');
  assert.strictEqual(doc.items[0].status, 'pending');
  doc = S.failAttempt(doc, 'm1', 'boom');
  assert.strictEqual(doc.items[0].status, 'failed');
  const r = S.act(doc, 'm1', 'retry', null, NOW);
  assert.ok(r.ok);
  assert.strictEqual(r.doc.items[0].status, 'pending');
  assert.strictEqual(r.doc.items[0].attempts, 0);
});

test('act: accept and dismiss only an open suggestion; accept is counted', () => {
  let doc = S.ingest({}, [mail('m1'), mail('m2'), mail('m3')], NOW).doc;
  doc = S.applySuggestion(doc, 'm1', TASK, NOW);
  doc = S.applySuggestion(doc, 'm2', TASK, NOW);
  let r = S.act(doc, 'm1', 'accept', null, NOW);
  assert.ok(r.ok);
  assert.strictEqual(r.doc.items[0].status, 'accepted');
  assert.strictEqual(r.doc.stats.accepted, 1);
  r = S.act(r.doc, 'm1', 'dismiss', 'handled', NOW);
  assert.strictEqual(r.ok, false, 'already accepted');
  r = S.act(r.doc, 'm2', 'dismiss', 'handled', NOW);
  assert.strictEqual(r.doc.items[1].dismissReason, 'handled');
  assert.strictEqual(S.act(r.doc, 'm3', 'accept', null, NOW).ok, false, 'still pending');
  assert.strictEqual(S.act(r.doc, 'nope', 'accept', null, NOW).ok, false);
  assert.strictEqual(S.canAct({ status: 'new' }, 'accept'), true);
  assert.strictEqual(S.canAct({ status: 'pending' }, 'dismiss'), false);
});

test('housekeep: unhandled goes stale after 14 days; handled is removed after 30', () => {
  const doc = { seen: ['a', 'b', 'c'], items: [
    { id: 'a', status: 'new', createdAt: ago(15), triagedAt: ago(15), mail: {} },
    { id: 'b', status: 'accepted', createdAt: ago(40), triagedAt: ago(40), handledAt: ago(31), mail: {} },
    { id: 'c', status: 'ignored', createdAt: ago(31), triagedAt: ago(31), mail: {} },
    { id: 'd', status: 'stale', createdAt: ago(31), triagedAt: ago(31), mail: {} },
    { id: 'e', status: 'new', createdAt: ago(1), triagedAt: ago(1), mail: {} }
  ] };
  const out = S.housekeep(doc, Date.parse(NOW));
  assert.deepStrictEqual(out.items.map(i => i.id + ':' + i.status), ['a:stale', 'e:new']);
  assert.deepStrictEqual(out.seen, ['a', 'b', 'c'], 'seen ids stay, so nothing comes back');
});

test('forPage hides ignored items and raw bodies, and adds the note a task gets', () => {
  let doc = S.ingest({}, [mail('m1'), mail('m2'), mail('m3')], NOW).doc;
  doc = S.applySuggestion(doc, 'm1', TASK, NOW);
  doc = S.applySuggestion(doc, 'm2', { ...TASK, kind: 'ignore' }, NOW);
  const page = S.forPage(doc, NOW);
  assert.deepStrictEqual(page.items.map(i => i.id), ['m1', 'm3']);
  assert.ok(page.items.every(i => i.mail.body === undefined));
  assert.strictEqual(page.items[0].note, 'מהמייל: דני <dan@example.com>\nנושא: חזית מערבית\nהתקבל: 20.10.2026');
  assert.deepStrictEqual(page.summary, { new: 1, pending: 1, failed: 0, week: { weekOf: '2026-10-18', scanned: 3, suggested: 1, accepted: 0 } });
});

test('mailFileOf: one file per person, whatever the case of the address', () => {
  const a = S.mailFileOf('/d', 'Dana@KKARC.com');
  assert.strictEqual(a, S.mailFileOf('/d', ' dana@kkarc.com'));
  assert.strictEqual(path.dirname(a), path.normalize('/d'));
  assert.match(path.basename(a), /^[0-9a-f]{32}\.json$/);
  assert.notStrictEqual(S.mailFileOf('/d', null), a);
});

test('failAttempt: a failed item keeps only a 1,500-character excerpt', () => {
  let doc = S.ingest({}, [mail('m1')], NOW).doc;
  for (let i = 0; i < 3; i++) doc = S.failAttempt(doc, 'm1', 'boom');
  assert.strictEqual(doc.items[0].mail.body, undefined);
  assert.strictEqual(doc.items[0].mail.excerpt.length, 1500);
});

test('ingest: at most 200 pending per person; the oldest become failed with "queue full"', () => {
  const many = n => Array.from({ length: n }, (_, i) => mail('q' + i));
  const r = S.ingest({}, many(205), NOW);
  assert.strictEqual(S.pendingIds(r.doc).length, 200);
  const failed = r.doc.items.filter(i => i.status === 'failed');
  assert.deepStrictEqual(failed.map(i => i.id), ['q0', 'q1', 'q2', 'q3', 'q4']);
  assert.ok(failed.every(i => i.lastError === 'queue full' && i.mail.body === undefined && i.mail.excerpt.length === 1500));
});

test('ingest: an id that still has an item is a duplicate even after it left `seen`; trimming keeps such ids', () => {
  const doc = { seen: Array.from({ length: 2000 }, (_, i) => 's' + i), items: [{ id: 'old', status: 'new', createdAt: NOW, mail: {} }, { id: 's0', status: 'new', createdAt: NOW, mail: {} }] };
  const r = S.ingest(doc, [mail('old'), mail('fresh')], NOW);
  assert.deepStrictEqual([r.accepted, r.duplicates], [1, 1]);
  assert.strictEqual(r.doc.seen.length, 2000);
  assert.ok(r.doc.seen.includes('s0'), 's0 still has an item');
  assert.ok(r.doc.seen.includes('fresh'));
  assert.ok(!r.doc.seen.includes('s1'));
});

test('housekeep: failed and pending items are removed 30 days after they arrived', () => {
  const doc = { seen: [], items: [
    { id: 'f', status: 'failed', createdAt: ago(31), mail: {} },
    { id: 'p', status: 'pending', createdAt: ago(31), mail: {} },
    { id: 'p2', status: 'pending', createdAt: ago(5), mail: {} }
  ] };
  assert.deepStrictEqual(S.housekeep(doc, Date.parse(NOW)).items.map(i => i.id), ['p2']);
});

test('housekeep: a stale item is removed 30 days after it went stale', () => {
  let doc = { seen: [], items: [{ id: 'a', status: 'new', createdAt: ago(40), triagedAt: ago(40), mail: {} }] };
  doc = S.housekeep(doc, Date.parse(NOW));
  assert.strictEqual(doc.items[0].status, 'stale');
  assert.strictEqual(doc.items[0].staleAt, NOW);
  assert.strictEqual(S.housekeep(doc, Date.parse(NOW) + 29 * DAY).items.length, 1, 'only 29 days stale');
  assert.strictEqual(S.housekeep(doc, Date.parse(NOW) + 31 * DAY).items.length, 0);
});

test('topNew: the newest open suggestions first, for the notification', () => {
  let doc = S.ingest({}, [mail('m1'), mail('m2'), mail('m3'), mail('m4')], NOW).doc;
  doc = S.applySuggestion(doc, 'm1', { ...TASK, title: 'ראשונה' }, '2026-10-20T08:00:00.000Z');
  doc = S.applySuggestion(doc, 'm2', { ...TASK, kind: 'important', title: 'חשוב' }, '2026-10-20T09:00:00.000Z');
  doc = S.applySuggestion(doc, 'm3', { ...TASK, kind: 'ignore' }, '2026-10-20T10:00:00.000Z');
  assert.deepStrictEqual(S.topNew(doc, 3), [{ kind: 'important', title: 'חשוב' }, { kind: 'task', title: 'ראשונה' }]);
  assert.deepStrictEqual(S.topNew(doc, 1), [{ kind: 'important', title: 'חשוב' }]);
  assert.deepStrictEqual(S.topNew({}, 3), []);
});

test('schedule: the default, saving, and what is rejected', () => {
  assert.deepStrictEqual(S.scheduleOf({}), { days: [0, 1, 2, 3, 4], times: ['08:00', '12:00', '16:00'] });
  const a = S.scheduleOf(null); a.days.push(9);
  assert.deepStrictEqual(S.scheduleOf({}).days, [0, 1, 2, 3, 4], 'the default is never shared');
  const ok = S.normSchedule({ days: [3, 1, 3, 0], times: ['9:05', '08:00', '9:05', '23:59', '0:00'] });
  assert.deepStrictEqual(ok, { ok: true, schedule: { days: [0, 1, 3], times: ['00:00', '08:00', '09:05', '23:59'] } });
  assert.deepStrictEqual(S.normSchedule({ days: [], times: [] }), { ok: true, schedule: { days: [], times: [] } });
  assert.strictEqual(S.normSchedule({ days: [0], times: Array.from({ length: 12 }, (_, i) => i + ':00') }).ok, true);
  for (const bad of [null, 'x', 7, [], {}, { days: [0] }, { times: [] }, { days: 'a', times: [] }, { days: [7], times: [] }, { days: [-1], times: [] },
    { days: [1.5], times: [] }, { days: ['1'], times: [] }, { days: [0], times: ['24:00'] }, { days: [0], times: ['8:60'] }, { days: [0], times: ['8'] },
    { days: [0], times: ['08:00:00'] }, { days: [0], times: [800] }, { days: [0], times: 'x' },
    { days: [0], times: Array.from({ length: 13 }, (_, i) => i + ':00') }]) {
    const r = S.normSchedule(bad);
    assert.strictEqual(r.ok, false, JSON.stringify(bad));
    assert.ok(typeof r.error === 'string' && r.error);
  }
  const d = S.setSchedule({ items: [] }, ok.schedule);
  assert.deepStrictEqual(S.scheduleOf(d), ok.schedule);
});

test('schedule and lastScanAt: markRan, forPage.scan, and every rebuild of the document keeps them', () => {
  assert.strictEqual(S.forPage({}, NOW).scan.lastScanAt, null);
  assert.deepStrictEqual(S.forPage({}, NOW).scan.schedule, S.scheduleOf({}));
  let doc = S.setSchedule({}, { days: [2], times: ['07:30'] });
  doc = S.markRan(doc, NOW);
  assert.deepStrictEqual(S.forPage(doc, NOW).scan, { schedule: { days: [2], times: ['07:30'] }, lastScanAt: NOW });
  const keeps = d => { assert.deepStrictEqual(d.schedule, { days: [2], times: ['07:30'] }); assert.strictEqual(d.lastScanAt, NOW); };
  const r = S.ingest(doc, [mail('m1')], NOW); keeps(r.doc);
  keeps(S.applySuggestion(r.doc, 'm1', TASK, NOW));
  keeps(S.failAttempt(r.doc, 'm1', 'e'));
  keeps(S.housekeep(r.doc, Date.parse(NOW)));
  keeps(S.act(S.applySuggestion(r.doc, 'm1', TASK, NOW), 'm1', 'dismiss', '', NOW).doc);
});
