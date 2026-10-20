// Dependency-free tests. Run: node tests/mail-suggestions.test.js
// MIRROR of the mail-suggestions pure functions in project_hub_01.html — keep in sync.
const assert = require('node:assert');

// ---- mirrored logic (copy of the project_hub_01.html block between "MIRROR: tests/mail-suggestions.test.js" and "MIRROR end") ----
function mailSugGroups(items){const list=items||[];const by=s=>list.filter(i=>i.status===s);const kindOf=i=>(i.suggestion||{}).kind;const fresh=by('new');return{tasks:fresh.filter(i=>kindOf(i)==='task'||kindOf(i)==='update'),important:fresh.filter(i=>kindOf(i)==='important'),stale:by('stale'),failed:by('failed'),pending:by('pending')};}
function mailSugCount(d){return d&&d.summary?d.summary.new||0:0;}
function fmtMailWhen(iso){if(!iso)return'';const d=new Date(iso);if(isNaN(d))return'';const p=n=>String(n).padStart(2,'0');return p(d.getDate())+'.'+p(d.getMonth()+1)+' '+p(d.getHours())+':'+p(d.getMinutes());}
function fmtMailDay(iso){return/^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8,10)+'.'+iso.slice(5,7):'';}
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

console.log('mail-suggestions: all passed');
