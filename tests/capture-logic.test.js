// Dependency-free smoke tests. Run: node tests/capture-logic.test.js
// MIRROR of the pure capture helpers in capture.html — keep in sync.

// ---- mirrored logic (copy of the capture.html block) ----
const DISC_HINTS = [
  ['STRC', /קונסטרוקצ|בטון|יסודות|שלד/],
  ['ELEC', /חשמל|תאורה|מתח/],
  ['PLUM', /אינסטלצ|סניטר|ביוב|מים/],
  ['SAFE', /בטיחות|כיבוי|מתזים|אש/],
  ['HVAC', /מיזוג|אוורור|VRF/],
  ['TRAF', /תנועה|חניה|חנייה/],
  ['LAND', /נוף|גינון|פיתוח שטח/],
  ['ACSS', /נגישות/],
];
function guessDiscipline(text, disciplines){
  const has = id => (disciplines||[]).some(d => d.id === id);
  for (const [id, re] of DISC_HINTS) if (re.test(text||'') && has(id)) return id;
  return has('ARCH') ? 'ARCH' : ((disciplines||[])[0]||{}).id || '';
}
function matchTasks(text, tasks){
  const words = (text||'').split(/s+/).filter(w => w.length >= 3);
  if (!words.length) return [];
  return (tasks||[])
    .filter(t => !t.done && words.some(w => (t.title||'').includes(w)))
    .slice(0, 3);
}
function routeCapture({status, taskId, kind}){
  if (kind === 'principle') return 'principle';
  if (kind === 'task') return 'task';
  if (kind === 'update') return taskId ? 'update' : 'inbox';
  if (!status) return 'task';
  return taskId ? 'update' : 'inbox';
}
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  if (actual !== expected) { console.error(`FAIL ${name}: got ${actual}, want ${expected}`); failures++; }
  else console.log(`ok   ${name}`);
}

const DISCS = [{id:'ARCH'},{id:'STRC'},{id:'ELEC'},{id:'PLUM'},{id:'SAFE'},{id:'HVAC'}];

// guessDiscipline — keyword → discipline id, falling back to ARCH
eq(guessDiscipline('שלחתי תכניות לקונסטרוקציה', DISCS), 'STRC', 'guess: קונסטרוקציה → STRC');
eq(guessDiscipline('תיאום עם חברת חשמל', DISCS), 'ELEC', 'guess: חשמל → ELEC');
eq(guessDiscipline('בדיקת אינסטלציה', DISCS), 'PLUM', 'guess: אינסטלציה → PLUM');
eq(guessDiscipline('יועץ בטיחות ביקש', DISCS), 'SAFE', 'guess: בטיחות → SAFE');
eq(guessDiscipline('מיזוג אוויר', DISCS), 'HVAC', 'guess: מיזוג → HVAC');
eq(guessDiscipline('משהו כללי לגמרי', DISCS), 'ARCH', 'guess: no keyword → ARCH');
eq(guessDiscipline('', DISCS), 'ARCH', 'guess: empty → ARCH');
// a guess is only returned if that discipline actually exists in the project
eq(guessDiscipline('קונסטרוקציה', [{id:'ARCH'}]), 'ARCH', 'guess: unknown discipline falls back');

// matchTasks — substring match on words of 3+ chars, capped at 3, skips done tasks
const TASKS = [
  {id:'1', title:'תכנון קונסטרוקציה ראשוני'},
  {id:'2', title:'תיאום חברת חשמל'},
  {id:'3', title:'להעביר תכנית ללולה'},
  {id:'4', title:'תכנון קונסטרוקציה מפורט'},
  {id:'5', title:'תכנון קונסטרוקציה סופי'},
  {id:'6', title:'משימה שהושלמה', done:true},
];
eq(matchTasks('קונסטרוקציה', TASKS).length, 3, 'match: capped at 3');
eq(matchTasks('חשמל', TASKS)[0].id, '2', 'match: finds by word');
eq(matchTasks('', TASKS).length, 0, 'match: empty query → none');
eq(matchTasks('אב', TASKS).length, 0, 'match: query under 3 chars → none');
eq(matchTasks('שהושלמה', TASKS).length, 0, 'match: skips done tasks');
eq(matchTasks('קונסטרוקציה', []).length, 0, 'match: no tasks → none');

// routeCapture — the status decides what gets created
eq(routeCapture({status:'sent', taskId:'1'}), 'update', 'route: status + task → update');
eq(routeCapture({status:'sent', taskId:null}), 'inbox', 'route: status, no task → inbox');
eq(routeCapture({status:null, taskId:null}), 'task', 'route: no status → new task');
eq(routeCapture({status:null, taskId:'1'}), 'task', 'route: no status still means a new task');
eq(routeCapture({status:'sent', taskId:'1', kind:'principle'}), 'principle', 'route: explicit kind wins');
eq(routeCapture({status:null, taskId:null, kind:'update'}), 'inbox', 'route: forced update without a task → inbox');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
