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
