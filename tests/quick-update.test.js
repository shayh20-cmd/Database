// Dependency-free smoke tests. Run: node tests/quick-update.test.js
// MIRROR of the pure quick-update helpers in project_hub_01.html — keep in sync.

// ---- mirrored logic (copy of the HTML block) ----
const EV_PERIOD = new Set(['progress', 'response', 'update']);
function getNextSuggestedStatus(lastStatus){
  if(!lastStatus) return 'progress';
  const map = {missing:'progress',progress:'sent',sent:'response',response:'sent',comments:'progress',approved:'progress'};
  return map[lastStatus] || 'progress';
}
function latestUpdateOf(events){
  const evs = events || [];
  if(!evs.length) return null;
  return evs.map((e,i)=>({e,i})).sort((a,b)=>{
    if(a.e.date !== b.e.date) return (b.e.date||'').localeCompare(a.e.date||'');
    const cls = (EV_PERIOD.has(a.e.status)?0:1) - (EV_PERIOD.has(b.e.status)?0:1);
    if(cls) return cls;
    return b.i - a.i;
  })[0].e;
}
function suggestedStatusFor(events){
  return getNextSuggestedStatus(latestUpdateOf(events)?.status);
}
function appendUpdate(events, rec){
  return [...(events||[]), rec];
}
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  if (actual !== expected) { console.error(`FAIL ${name}: got ${actual}, want ${expected}`); failures++; }
  else console.log(`ok   ${name}`);
}

// latestUpdateOf — newest date wins; on a tie an open (period) status outranks a milestone
eq(latestUpdateOf([]), null, 'latest: no events → null');
eq(latestUpdateOf(undefined), null, 'latest: undefined → null');
eq(latestUpdateOf([{id:'a',status:'sent',date:'2026-01-01'}]).id, 'a', 'latest: single event');
eq(latestUpdateOf([
  {id:'a',status:'sent',date:'2026-01-01'},
  {id:'b',status:'progress',date:'2026-02-01'},
]).id, 'b', 'latest: newest date wins');
eq(latestUpdateOf([
  {id:'a',status:'sent',date:'2026-03-01'},
  {id:'b',status:'progress',date:'2026-03-01'},
]).id, 'b', 'latest: same date → period status outranks milestone');

// same date + same class → the later-appended one wins (append is now the universal insertion order)
eq(latestUpdateOf([
  {id:'a',status:'progress',date:'2026-03-01'},
  {id:'b',status:'response',date:'2026-03-01'},
]).id, 'b', 'latest: same date, both period → later-appended wins');
eq(latestUpdateOf([
  {id:'a',status:'sent',date:'2026-03-01'},
  {id:'b',status:'approved',date:'2026-03-01'},
]).id, 'b', 'latest: same date, both milestone → later-appended wins');
eq(latestUpdateOf([
  {id:'a',status:'sent',date:'2026-03-01'},
  {id:'b',status:'progress',date:'2026-03-01'},
  {id:'c',status:'approved',date:'2026-03-01'},
]).id, 'b', 'latest: same date → period still beats milestone regardless of position');

// suggestedStatusFor — the NEXT step, never a repeat of the current one
eq(suggestedStatusFor([]), 'progress', 'suggest: no events → progress');
eq(suggestedStatusFor([{id:'a',status:'progress',date:'2026-01-01'}]), 'sent', 'suggest: progress → sent');
eq(suggestedStatusFor([{id:'a',status:'sent',date:'2026-01-01'}]), 'response', 'suggest: sent → response');
eq(suggestedStatusFor([{id:'a',status:'response',date:'2026-01-01'}]), 'sent', 'suggest: response → sent');
eq(suggestedStatusFor([{id:'a',status:'comments',date:'2026-01-01'}]), 'progress', 'suggest: comments → progress');
eq(suggestedStatusFor([{id:'a',status:'approved',date:'2026-01-01'}]), 'progress', 'suggest: approved → progress');
eq(suggestedStatusFor([{id:'a',status:'missing',date:'2026-01-01'}]), 'progress', 'suggest: missing → progress');
eq(suggestedStatusFor([
  {id:'a',status:'progress',date:'2026-01-01'},
  {id:'b',status:'sent',date:'2026-02-01'},
]), 'response', 'suggest: reads the latest event, not the first');

// appendUpdate — always appends, never prepends, never mutates
const base = [{id:'a',status:'sent',date:'2026-01-01'}];
const out = appendUpdate(base, {id:'b',status:'progress',date:'2026-02-01'});
eq(out.length, 2, 'append: length grows');
eq(out[1].id, 'b', 'append: new record goes last');
eq(base.length, 1, 'append: source array not mutated');
eq(appendUpdate(undefined, {id:'z'}).length, 1, 'append: undefined events → single-item array');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
