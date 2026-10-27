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
const L = new Function('uid', m[1] + '\nreturn {migrateMeeting,meetingRows,indentItem,outdentItem,moveItem,moveSectionTo,followUpMeeting,prevMeetingOf,photoAppendix,assigneeText,mtgDate,mtgNewItem,mergeParticipants,orderItems,mtgPullOpenExec,mtgDaysSince,mtgTaskOf,mtgTaskChoices,mtgMeetingsOfTask};')(uid);

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

test('followUpMeeting keeps execRef on copied items while clearing task / record links', () => {
  const S2 = [{ id: 's', title: 'פריטים פתוחים' }];
  const ref = { itemId: 'x1', number: 'RFI-001', type: 'rfi' };
  const f = L.followUpMeeting({ id: 'M', date: '2026-10-01', sections: S2, items: [
    { id: 'a', sectionId: 's', parentId: null, topic: 'RFI-001 גובה תקרה', execRef: ref, itemType: 'task', createdTaskTrackId: 's1', linkedRecordId: 'r', linkedRecordKind: 'principle', photos: [] }
  ] }, { id: 'M2', date: '2026-10-14' });
  assert.deepStrictEqual(f.items[0].execRef, ref);
  assert.deepStrictEqual([f.items[0].itemType, f.items[0].createdTaskTrackId, f.items[0].linkedRecordId, f.items[0].linkedRecordKind], [null, null, null, null]);
  assert.strictEqual(L.mtgNewItem('s', null).execRef, null);
  const old = L.migrateMeeting({ id: 'O', items: [{ id: 'k', number: '1.1', topic: 'x', execRef: ref }] });
  assert.deepStrictEqual(old.items.find(i => i.id === 'k').execRef, ref);
});

test('mtgPullOpenExec adds a topic of open items, refreshes existing rows, keeps user rows, no duplicates', () => {
  const lbl = b => b ? b.party : '—';
  const e1 = { id: 'x1', type: 'rfi', number: 'RFI-001', title: 'גובה', discipline: 'STRC', ball: { party: 'architect' }, dueDate: '2026-10-20' };
  const e2 = { id: 'x2', type: 'issue', number: 'ISS-001', title: 'סדק', discipline: '', ball: { party: 'contractor' }, dueDate: '' };
  const blank = { id: 'b0', sectionId: 's0', parentId: null, topic: '', photos: [] };
  const p1 = L.mtgPullOpenExec({ sections: [{ id: 's0', title: '' }], items: [blank] }, [e1], lbl);
  assert.deepStrictEqual(p1.sections.map(x => x.title), ['פריטים פתוחים'], 'an untitled blank topic is reused');
  assert.strictEqual(p1.items.length, 1);
  assert.deepStrictEqual([p1.items[0].topic, p1.items[0].assignee, p1.items[0].person, p1.items[0].dueDate], ['RFI-001 גובה', 'STRC', 'architect', '2026-10-20']);
  assert.deepStrictEqual(p1.items[0].execRef, { itemId: 'x1', number: 'RFI-001', type: 'rfi', auto: { topic: 'RFI-001 גובה', person: 'architect', dueDate: '2026-10-20' } });
  const sid = p1.sections[0].id;
  const withUser = { ...p1, items: [...p1.items, { id: 'u', sectionId: sid, parentId: null, topic: 'שורה שלי', photos: [] }] };
  const p2 = L.mtgPullOpenExec(withUser, [{ ...e1, ball: { party: 'contractor' }, dueDate: '2026-11-01' }, e2], lbl);
  assert.strictEqual(p2.sections.length, 1);
  assert.deepStrictEqual(p2.items.map(i => i.topic), ['RFI-001 גובה', 'שורה שלי', 'ISS-001 סדק']);
  assert.deepStrictEqual([p2.items[0].id, p2.items[0].person, p2.items[0].dueDate], [p1.items[0].id, 'contractor', '2026-11-01']);
  assert.deepStrictEqual(p2.items[0].execRef.auto, { topic: 'RFI-001 גובה', person: 'contractor', dueDate: '2026-11-01' });
  const p3 = L.mtgPullOpenExec({ sections: [{ id: 'k', title: 'כללי' }], items: [{ id: 'z', sectionId: 'k', parentId: null, topic: 'a', photos: [] }] }, [e2], lbl);
  assert.deepStrictEqual(p3.sections.map(x => x.title), ['כללי', 'פריטים פתוחים'], 'a titled topic is not reused');
  assert.strictEqual(L.mtgDaysSince('2026-10-01T09:00:00Z', '2026-10-14'), 13);
});

test('mtgPullOpenExec keeps what the user edited on a pulled row and refreshes the rest', () => {
  const lbl = b => b ? b.party : '—';
  const e1 = { id: 'x1', type: 'rfi', number: 'RFI-001', title: 'גובה', discipline: '', ball: { party: 'architect' }, dueDate: '2026-10-20' };
  const p1 = L.mtgPullOpenExec({ sections: [], items: [] }, [e1], lbl);
  const edited = { ...p1, items: p1.items.map(it => ({ ...it, topic: 'RFI-001 גובה — לבדוק מול הקונסטרוקטור' })) };
  const p2 = L.mtgPullOpenExec(edited, [{ ...e1, title: 'גובה תקרה', ball: { party: 'contractor' }, dueDate: '2026-11-01' }], lbl);
  assert.strictEqual(p2.items.length, 1);
  assert.strictEqual(p2.items[0].topic, 'RFI-001 גובה — לבדוק מול הקונסטרוקטור', 'user-edited topic is kept');
  assert.deepStrictEqual([p2.items[0].person, p2.items[0].dueDate], ['contractor', '2026-11-01'], 'untouched fields still update');
  assert.deepStrictEqual(p2.items[0].execRef.auto, { topic: 'RFI-001 גובה', person: 'contractor', dueDate: '2026-11-01' }, 'auto keeps the last generated topic');
  const f = L.followUpMeeting({ id: 'M', date: '2026-10-01', sections: p2.sections, items: p2.items }, { id: 'M2', date: '2026-10-14' });
  assert.deepStrictEqual(f.items[0].execRef, p2.items[0].execRef, 'follow-up keeps execRef with auto');
});

// ── display order (array order must follow display order) ──
const S = [{ id: 's', title: '' }];
const it = (id, parentId) => ({ id, sectionId: 's', parentId: parentId || null });
const shape = items => L.meetingRows({ sections: S, items }).flatMap(r => r.items.map(x => [x.item.id, x.subs.map(y => y.item.id)]));

test('orderItems: sections order, each top-level item followed by its subs, orphans at the end of their section', () => {
  const items = [
    { id: 'b1', sectionId: 'B', parentId: 'b' }, { id: 'x', sectionId: 'X', parentId: null },
    { id: 'a1', sectionId: 'A', parentId: 'a' }, { id: 'b', sectionId: 'B', parentId: null },
    { id: 'o', sectionId: 'A', parentId: 'gone' }, { id: 'a', sectionId: 'A', parentId: null },
    { id: 'c', sectionId: 'A', parentId: 'b' }, { id: 'a2', sectionId: 'A', parentId: 'a' }
  ];
  assert.deepStrictEqual(L.orderItems(items, [{ id: 'A' }, { id: 'B' }]).map(i => i.id), ['a', 'a1', 'a2', 'o', 'c', 'b', 'b1', 'x']);
});

test('indentItem: an item indented under a top item with subs lands after those subs', () => {
  assert.deepStrictEqual(shape(L.indentItem([it('d'), it('e'), it('d1', 'd')], 'e')), [['d', ['d1', 'e']]]);
});

test('moveItem carries sub-items; indent after a move keeps the order', () => {
  const moved = L.moveItem([it('a'), it('a1', 'a'), it('b'), it('b1', 'b')], 'b', -1);
  assert.deepStrictEqual(shape(moved), [['b', ['b1']], ['a', ['a1']]]);
  assert.deepStrictEqual(shape(L.indentItem(moved, 'a')), [['b', ['b1', 'a', 'a1']]]);
});

test('indentItem then outdentItem restores the item to its place', () => {
  const ind = L.indentItem([it('p'), it('q'), it('r'), it('p1', 'p')], 'q');
  assert.deepStrictEqual(shape(L.outdentItem(ind, 'q')), [['p', ['p1']], ['q', []], ['r', []]]);
});

test('outdentItem places the item right after its parent block', () => {
  assert.deepStrictEqual(shape(L.outdentItem([it('p'), it('q'), it('x', 'p'), it('y', 'p')], 'y')), [['p', ['x']], ['y', []], ['q', []]]);
});

test('migrateMeeting: old rows added to a converted meeting map to the existing topics', () => {
  n = 0;
  const conv0 = L.migrateMeeting({ id: 'M', items: [{ id: 't1', number: '1', topic: 'T1' }, { id: 'i1', number: '1.1', topic: 'I1' }, { id: 't2', number: '2', topic: 'T2' }] });
  const r = L.migrateMeeting({ ...conv0, items: [...conv0.items, { id: 'n2', number: '1.2', topic: 'N2' }, { id: 'n3', number: '1.1.1', topic: 'N3' }] });
  assert.strictEqual(r.sections.length, 2);
  const rows = L.meetingRows(r);
  assert.deepStrictEqual(rows[0].items.map(x => [x.item.id, x.subs.map(y => y.item.id)]), [['i1', ['n3']], ['n2', []]]);
  assert.deepStrictEqual(rows[1].items, []);
});

test('migrateMeeting: rows are processed in numeric order; invalid numbers last', () => {
  n = 0;
  const r = L.migrateMeeting({ id: 'M', items: [{ id: 'z', number: 'x', topic: 'Z' }, { id: 'e', number: '1.1', topic: 'early' }, { id: 'u', number: '10', topic: 'T10' }, { id: 't', number: '1', topic: 'T1' }, { id: 'w', number: '2', topic: 'T2' }] });
  assert.deepStrictEqual(r.sections.map(s => s.title), ['T1', 'T2', 'T10']);
  assert.strictEqual(r.items.find(i => i.id === 'e').sectionId, r.sections[0].id);
  assert.strictEqual(r.items.find(i => i.id === 'z').sectionId, r.sections[2].id);
});

test('migrateMeeting: a new-format meeting out of display order gets its items ordered', () => {
  const m0 = { id: 'M', sections: S, items: [it('a'), it('b'), it('a1', 'a')] };
  const r = L.migrateMeeting(m0);
  assert.notStrictEqual(r, m0);
  assert.deepStrictEqual(r.items.map(i => i.id), ['a', 'a1', 'b']);
  assert.strictEqual(L.migrateMeeting(r), r);
});

test('followUpMeeting skips items of missing topics and subs of missing parents', () => {
  n = 0;
  const f = L.followUpMeeting({ id: 'M', sections: S, items: [it('a'), { id: 'g', sectionId: 'ghost', parentId: null }, it('o', 'gone'), it('a1', 'a')] }, { id: 'M2', date: '2026-10-11' });
  assert.strictEqual(f.items.length, 2);
  assert.ok(f.items.every(i => f.sections.some(s => s.id === i.sectionId)));
});

test('mergeParticipants trims and dedupes; mtgDate takes a full ISO; assigneeText falls back to the id', () => {
  const merged = L.mergeParticipants([{ id: '1', name: 'דנה ' }], [{ name: ' דנה' }, { name: 'יוסי ' }, { name: 'יוסי' }, { name: '  ' }]);
  assert.deepStrictEqual(merged.map(p => p.name), ['דנה ', 'יוסי']);
  assert.strictEqual(L.mtgDate('2026-10-15T09:00:00.000Z'), '15/10/2026');
  assert.strictEqual(L.assigneeText({ assignee: 'GONE', person: '' }, () => undefined), 'GONE');
});

test('only one migrateMeeting: the legacy normaliser is normalizeMeeting and migrateData uses it', () => {
  assert.strictEqual((html.match(/function migrateMeeting\(/g) || []).length, 1);
  assert.strictEqual((html.match(/function normalizeMeeting\(/g) || []).length, 1);
  assert.match(html, /function normalizeMeeting\(m\)\{return\{\.\.\.m,recordedBy:/);
  assert.ok(html.includes('d.meetings.map(normalizeMeeting)'));
  assert.ok(!html.includes('d.meetings.map(migrateMeeting)'));
});

test('task links: choices open first and filtered by title; meetings that link a task; migration keeps links', () => {
  const sheets = [
    { id: 's1', type: 'list', name: 'שוטף', tasks: [{ id: 'a', title: 'תיאום חשמל', done: true }, { id: 'b', title: 'תיאום מיזוג' }] },
    { id: 's2', type: 'phase', tasks: [{ id: 'z', title: 'תיאום' }] },
    { id: 's3', type: 'list', name: 'רישוי', tasks: [{ id: 'c', title: 'הגשה לוועדה' }] }
  ];
  assert.deepStrictEqual(L.mtgTaskChoices(sheets, '').map(c => c.taskId), ['b', 'c', 'a']);
  assert.deepStrictEqual(L.mtgTaskChoices(sheets, 'תיאום').map(c => c.taskId), ['b', 'a']);
  assert.strictEqual(L.mtgTaskChoices(sheets, '', { pathOf: s => 'מסלול › ' + s.name })[0].path, 'מסלול › שוטף');
  const ms = [{ id: 'm1', items: [{ id: 'i1', linkedTaskId: 'b' }] }, { id: 'm2', items: [{ id: 'i2', createdTaskId: 'b' }, { id: 'i3', linkedTaskId: 'b' }] }, { id: 'm3', items: [] }];
  assert.deepStrictEqual(L.mtgMeetingsOfTask(ms, 'b').map(m => m.id), ['m1', 'm2']);
  assert.deepStrictEqual(L.mtgMeetingsOfTask(ms, null), []);
  const old = { id: 'm', items: [{ id: 'x', number: '1', topic: 'נושא' }, { id: 'y', number: '1.1', topic: 'סעיף', linkedTaskId: 'b', itemType: 'update' }] };
  const mig = L.migrateMeeting(old);
  assert.strictEqual(mig.items.find(it => it.id === 'y').linkedTaskId, 'b');
});
