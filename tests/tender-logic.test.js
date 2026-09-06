// Dependency-free smoke tests. Run: node tests/tender-logic.test.js
// MIRROR of the pure tender functions in project_hub_01.html — keep in sync.

// ---- mirrored logic (copy of the HTML block) ----
const EV_PERIOD = new Set(['progress', 'response', 'update']);
function latestEvent(cell) {
  const evs = (cell && cell.events) || [];
  if (!evs.length) return null;
  return [...evs].sort((a, b) => {
    if (a.date !== b.date) return (b.date || '').localeCompare(a.date || '');
    return (EV_PERIOD.has(a.status) ? 0 : 1) - (EV_PERIOD.has(b.status) ? 0 : 1);
  })[0];
}
function tenderCellStatus(cell) {
  if (cell && cell.statusOverride) return cell.statusOverride;
  const latest = latestEvent(cell);
  if (!latest || !latest.status) return 'N';
  const map = {
    missing: 'N',
    progress: 'I', sent: 'I', response: 'I', update: 'I', // update → בעבודה (the fix)
    comments: 'R',                                        // יש הערות → תקוע
    approved: 'C',                                        // מאושר → הסתיים
  };
  return map[latest.status] || 'N';
}
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  if (actual !== expected) { console.error(`FAIL ${name}: got ${actual}, want ${expected}`); failures++; }
  else console.log(`ok   ${name}`);
}

eq(tenderCellStatus({ events: [] }), 'N', 'empty → N');
eq(tenderCellStatus({}), 'N', 'no events field → N');
eq(tenderCellStatus({ events: [{ status: 'progress', date: '2026-01-01' }] }), 'I', 'progress → I');
eq(tenderCellStatus({ events: [{ status: 'sent', date: '2026-01-01' }] }), 'I', 'sent → I');
eq(tenderCellStatus({ events: [{ status: 'update', date: '2026-01-01' }] }), 'I', 'update → I (THE FIX)');
eq(tenderCellStatus({ events: [{ status: 'comments', date: '2026-01-01' }] }), 'R', 'comments → R (stuck)');
eq(tenderCellStatus({ events: [{ status: 'approved', date: '2026-01-01' }] }), 'C', 'approved → C');
// latest by date wins
eq(tenderCellStatus({ events: [
  { status: 'approved', date: '2026-01-01' },
  { status: 'comments', date: '2026-02-01' },
] }), 'R', 'latest date wins → R');
// override wins over derivation
eq(tenderCellStatus({ statusOverride: 'C', events: [{ status: 'comments', date: '2026-02-01' }] }), 'C', 'override wins');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
