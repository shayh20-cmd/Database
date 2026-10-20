// Dependency-free tests. Run: node tests/mail-suggestions.test.js
// MIRROR of the mail-suggestions pure functions in project_hub_01.html — keep in sync.
const assert = require('node:assert');

// ---- mirrored logic (copy of the project_hub_01.html block between "MIRROR: tests/mail-suggestions.test.js" and "MIRROR end") ----
function mailSugGroups(items){const list=items||[];const by=s=>list.filter(i=>i.status===s);const kindOf=i=>(i.suggestion||{}).kind;const fresh=by('new');return{tasks:fresh.filter(i=>kindOf(i)==='task'||kindOf(i)==='update'),important:fresh.filter(i=>kindOf(i)==='important'),stale:by('stale'),failed:by('failed'),pending:by('pending')};}
function mailSugCount(d){return d&&d.summary?d.summary.new||0:0;}
function fmtMailWhen(iso){if(!iso)return'';const d=new Date(iso);if(isNaN(d))return'';const p=n=>String(n).padStart(2,'0');return p(d.getDate())+'.'+p(d.getMonth()+1)+' '+p(d.getHours())+':'+p(d.getMinutes());}
function fmtMailDay(iso){return/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8,10)+'.'+iso.slice(5,7):'';}
function nextMailScan(schedule,now){const sc=schedule||{};const days=sc.days||[];const times=(sc.times||[]).filter(t=>/^\d{2}:\d{2}$/.test(t)).slice().sort();if(!days.length||!times.length)return null;for(let off=0;off<=8;off++){const day=new Date(now.getFullYear(),now.getMonth(),now.getDate()+off);if(!days.includes(day.getDay()))continue;for(const t of times){const slot=new Date(day.getFullYear(),day.getMonth(),day.getDate(),+t.slice(0,2),+t.slice(3,5));if(slot>now)return slot;}}return null;}
function mailScanWhen(date,now){if(!date)return null;const p=n=>String(n).padStart(2,'0');const key=x=>x.getFullYear()+'-'+x.getMonth()+'-'+x.getDate();const tom=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);const day=key(date)===key(now)?'today':key(date)===key(tom)?'tomorrow':p(date.getDate())+'.'+p(date.getMonth()+1);return{day,time:p(date.getHours())+':'+p(date.getMinutes())};}
// ---- end mirror ----

const it = (id, status, kind) => ({ id, status, suggestion: kind ? { kind } : undefined });
const g = mailSugGroups([it('a', 'new', 'task'), it('b', 'new', 'update'), it('c', 'new', 'important'), it('d', 'stale', 'task'), it('e', 'failed'), it('f', 'pending'), it('g', 'accepted', 'task')]);
assert.deepStrictEqual(g.tasks.map(x => x.id), ['a', 'b']);
assert.deepStrictEqual(g.important.map(x => x.id), ['c']);
assert.deepStrictEqual([g.stale.length, g.failed.length, g.pending.length], [1, 1, 1]);
assert.deepStrictEqual(mailSugGroups(null).tasks, []);

assert.strictEqual(mailSugCount({ summary: { new: 3 } }), 3);
assert.strictEqual(mailSugCount(null), 0);

const local = new Date(2026, 9, 20, 9, 5);
assert.strictEqual(fmtMailWhen(local.toISOString()), '20.10 09:05');
assert.strictEqual(fmtMailWhen(''), '');
assert.strictEqual(fmtMailWhen('nonsense'), '');
assert.strictEqual(fmtMailDay('2026-10-27'), '27.10');
assert.strictEqual(fmtMailDay(''), '');

// nextMailScan / mailScanWhen — 2026-10-20 is a Tuesday (day 2)
const sched = { days: [0, 1, 2, 3, 4], times: ['08:00', '12:00', '16:00'] };
const at = (d, h, m) => new Date(2026, 9, d, h, m);
const same = (a, b) => assert.strictEqual(a && a.getTime(), b.getTime());
same(nextMailScan(sched, at(20, 9, 5)), at(20, 12, 0));          // a slot later today
same(nextMailScan(sched, at(20, 7, 0)), at(20, 8, 0));           // first slot today
same(nextMailScan(sched, at(20, 12, 0)), at(20, 16, 0));         // strictly after now
same(nextMailScan(sched, at(20, 17, 0)), at(21, 8, 0));          // wraps to tomorrow
same(nextMailScan(sched, at(22, 16, 30)), at(25, 8, 0));         // Thursday evening → Sunday (skips Fri, Sat)
same(nextMailScan({ days: [3], times: ['09:30'] }, at(21, 10, 0)), at(28, 9, 30)); // same weekday next week
same(nextMailScan({ days: [6], times: ['23:59', '00:00'] }, at(20, 9, 0)), at(24, 0, 0)); // unsorted times
assert.strictEqual(nextMailScan({ days: [], times: ['08:00'] }, at(20, 9, 0)), null);
assert.strictEqual(nextMailScan({ days: [1], times: [] }, at(20, 9, 0)), null);
assert.strictEqual(nextMailScan(null, at(20, 9, 0)), null);

assert.deepStrictEqual(mailScanWhen(at(20, 12, 0), at(20, 9, 5)), { day: 'today', time: '12:00' });
assert.deepStrictEqual(mailScanWhen(at(21, 8, 0), at(20, 23, 0)), { day: 'tomorrow', time: '08:00' });
assert.deepStrictEqual(mailScanWhen(at(25, 8, 5), at(20, 9, 0)), { day: '25.10', time: '08:05' });
assert.deepStrictEqual(mailScanWhen(new Date(2026, 10, 1, 8, 0), new Date(2026, 9, 31, 20, 0)), { day: 'tomorrow', time: '08:00' }); // across a month
assert.strictEqual(mailScanWhen(null, at(20, 9, 0)), null);

console.log('mail-suggestions: all passed');
