// Run: node --test tests/meeting-logic.test.js
// Loads the meeting-logic block straight from project_hub_01.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'project_hub_01.html'), 'utf8');
const m = html.match(/\/\* ═══ meeting-logic ═══ \*\/([\s\S]*?)\/\* ═══ \/meeting-logic ═══ \*\//);
if (!m) throw new Error('meeting-logic block not found in project_hub_01.html');
let n = 0;
const uid = () => 'u' + ++n;
const L = new Function('uid', m[1] + '\nreturn {migrateMeeting,meetingRows,indentItem,outdentItem,moveItem,moveSectionTo,followUpMeeting,prevMeetingOf,photoAppendix,assigneeText,mtgDate,mtgNewItem,mergeParticipants};')(uid);

const old = { id: 'M1', date: '2026-09-28', trackId: null, participants: [{ id: 'p', name: 'דנה' }], items: [
  { id: 'a', number: '1', topic: 'לוחות זמנים' },
  { id: 'b', number: '1.1', topic: 'גנט מעקב', assignee: 'PM', dueDate: '2026-10-15', itemType: 'task', createdTaskTrackId: 's1' },
  { id: 'c', number: '1.1.1', topic: 'מיזוג' },
  { id: 'd', number: '2', topic: 'בטיחות', assignee: 'PM', dueDate: '2026-10-15' },
  { id: 'e', number: 'x', topic: 'בלי מספר' }
] };

test('migrateMeeting: whole numbers become topics, x.y items, x.y.z sub-items', () => {
  n = 0;
  const r = L.migrateMeeting(old);
  assert.deepStrictEqual(r.sections.map(s => s.title), ['לוחות זמנים', 'בטיחות']);
  const b = r.items.find(i => i.id === 'b');
  assert.strictEqual(b.sectionId, r.sections[0].id);
  assert.strictEqual(b.parentId, null);
  assert.strictEqual(b.itemType, 'task');
  assert.strictEqual(r.items.find(i => i.id === 'c').parentId, 'b');
});

test('migrateMeeting: a topic row with its own assignee/date also becomes its first item', () => {
  const r = L.migrateMeeting(old);
  const d = r.items.find(i => i.id === 'd');
  assert.strictEqual(d.sectionId, r.sections[1].id);
  assert.strictEqual(d.topic, 'בטיחות');
  assert.strictEqual(d.dueDate, '2026-10-15');
});

test('migrateMeeting: an unnumbered row goes under the last topic; new-format meetings are returned as is', () => {
  const r = L.migrateMeeting(old);
  assert.strictEqual(r.items.find(i => i.id === 'e').sectionId, r.sections[1].id);
  assert.strictEqual(L.migrateMeeting(r), r);
  const empty = L.migrateMeeting({ id: 'z', items: [{ id: 'q', number: '', topic: 'x' }] });
  assert.deepStrictEqual(empty.sections.map(s => s.title), ['כללי']);
});

test('migrateMeeting: old-format items added to an already-converted meeting are converted too', () => {
  const conv = L.migrateMeeting(old);
  const mixed = { ...conv, items: [...conv.items, { id: 'f', number: '3', topic: 'חדש מהקונקטור' }] };
  const r = L.migrateMeeting(mixed);
  assert.strictEqual(r.sections.length, 3);
  assert.ok(r.items.every(i => i.sectionId));
});

const conv = () => { n = 0; return L.migrateMeeting(old); };

test('meetingRows numbers topics, items and sub-items from the order', () => {
  const rows = L.meetingRows(conv());
  assert.deepStrictEqual(rows.map(r => r.number), ['1', '2']);
  assert.strictEqual(rows[0].items[0].number, '1.1');
  assert.strictEqual(rows[0].items[0].subs[0].number, '1.1.1');
  assert.deepStrictEqual(rows[1].items.map(x => x.number), ['2.1', '2.2']);
});

test('moveSectionTo renumbers', () => {
  const m2 = conv();
  const moved = { ...m2, sections: L.moveSectionTo(m2.sections, m2.sections[1].id, 0) };
  const rows = L.meetingRows(moved);
  assert.strictEqual(rows[0].section.title, 'בטיחות');
  assert.strictEqual(rows[1].items[0].number, '2.1');
});

test('indentItem makes an item a sub-item of the previous one (with its own subs); outdentItem undoes it', () => {
  const m2 = conv();
  const sec = m2.sections[1].id;
  const ind = L.indentItem(m2.items, 'e');
  assert.strictEqual(ind.find(i => i.id === 'e').parentId, 'd');
  assert.strictEqual(L.indentItem(m2.items, 'd'), m2.items, 'first item cannot indent');
  const out = L.outdentItem(ind, 'e');
  const rows = L.meetingRows({ ...m2, items: out });
  assert.deepStrictEqual(rows[1].items.map(x => x.item.id), ['d', 'e']);
  assert.ok(out.every(i => i.sectionId === sec || i.sectionId === m2.sections[0].id));
});

test('outdentItem: later siblings become sub-items of the outdented item, order kept', () => {
  const items = [
    { id: 'p', sectionId: 's', parentId: null }, { id: 'x', sectionId: 's', parentId: 'p' },
    { id: 'y', sectionId: 's', parentId: 'p' }, { id: 'z', sectionId: 's', parentId: 'p' }
  ];
  const out = L.outdentItem(items, 'y');
  const rows = L.meetingRows({ sections: [{ id: 's', title: '' }], items: out });
  assert.deepStrictEqual(rows[0].items.map(r => [r.item.id, r.subs.map(s => s.item.id)]), [['p', ['x']], ['y', ['z']]]);
});

test('moveItem swaps with the neighbouring sibling only', () => {
  const m2 = conv();
  const out = L.moveItem(m2.items, 'e', -1);
  assert.deepStrictEqual(L.meetingRows({ ...m2, items: out })[1].items.map(x => x.item.id), ['e', 'd']);
  assert.strictEqual(L.moveItem(m2.items, 'b', -1), m2.items);
});

test('followUpMeeting copies topics and items, marks carriedFrom from the first meeting, drops photos and links', () => {
  const m2 = conv();
  m2.items[0].photos = [{ id: 'ph', url: '/x.png' }];
  m2.items[1] = { ...m2.items[1], carriedFrom: { meetingId: 'M0', date: '2026-09-01' } };
  const f = L.followUpMeeting(m2, { id: 'M2', date: '2026-10-11' });
  assert.strictEqual(f.basedOnMeetingId, 'M1');
  assert.strictEqual(f.items.length, m2.items.length);
  assert.ok(f.items.every(i => i.photos.length === 0 && !i.itemType && !i.linkedRecordId));
  assert.deepStrictEqual(f.items[0].carriedFrom, { meetingId: 'M1', date: '2026-09-28' });
  assert.deepStrictEqual(f.items[1].carriedFrom, { meetingId: 'M0', date: '2026-09-01' });
  const sub = f.items.find(i => i.parentId);
  assert.ok(f.items.some(i => i.id === sub.parentId), 'sub-item points at the copied parent');
  assert.ok(f.items.every(i => f.sections.some(s => s.id === i.sectionId)));
  assert.notStrictEqual(f.participants[0].id, 'p');
});

test('prevMeetingOf picks the latest meeting of the same track', () => {
  const ms = [{ id: 'a', date: '2026-09-01', trackId: null }, { id: 'b', date: '2026-10-01', trackId: null }, { id: 'c', date: '2026-11-01', trackId: 't1' }];
  assert.strictEqual(L.prevMeetingOf(ms, null).id, 'b');
  assert.strictEqual(L.prevMeetingOf(ms, 't1').id, 'c');
  assert.strictEqual(L.prevMeetingOf(ms, 't2'), null);
});

test('photoAppendix letters photos in item order', () => {
  const m2 = conv();
  m2.items = m2.items.map(i => i.id === 'c' ? { ...i, photos: [{ id: 'p1', url: '1' }] } : i.id === 'd' ? { ...i, photos: [{ id: 'p2', url: '2' }, { id: 'p3', url: '3' }] } : i);
  assert.deepStrictEqual(L.photoAppendix(m2).map(a => [a.letter, a.number]), [["א'", '1.1.1'], ["ב'", '2.1'], ["ג'", '2.1']]);
});

test('assigneeText, mtgDate, mtgNewItem, mergeParticipants', () => {
  const lbl = id => ({ STRC: 'קונסטרוקציה' })[id] || id;
  assert.strictEqual(L.assigneeText({ assignee: 'STRC', person: 'יוסי' }, lbl), 'קונסטרוקציה – יוסי');
  assert.strictEqual(L.assigneeText({ assignee: null, person: 'יוסי' }, lbl), 'יוסי');
  assert.strictEqual(L.assigneeText({ assignee: 'לידיעה', person: '' }, lbl), 'לידיעה');
  assert.strictEqual(L.mtgDate('2026-10-15'), '15/10/2026');
  assert.strictEqual(L.mtgDate(''), '');
  const it = L.mtgNewItem('s', null);
  assert.deepStrictEqual([it.sectionId, it.parentId, it.topic, it.photos], ['s', null, '', []]);
  const merged = L.mergeParticipants([{ id: '1', name: 'דנה' }], [{ name: 'דנה' }, { name: 'יוסי', role: 'קונסטרוקטור' }]);
  assert.deepStrictEqual(merged.map(p => p.name), ['דנה', 'יוסי']);
  assert.ok(merged[1].id);
});
