// Dependency-free smoke tests. Run: node tests/capture-logic.test.js
// MIRROR of the pure capture helpers in capture.html — keep in sync.

// ---- mirrored logic (copy of the capture.html block) ----
/* Hints are matched against whole words, never raw substrings: "אש" sits inside
   "מאשרת" and "מים" inside "ההסכמים", so substring matching guessed nonsense.
   A hint of 4+ chars may match a word prefix (קונסטרוקצ → קונסטרוקציה);
   shorter ones must equal the word outright. */
const DISC_HINTS = [
  ['STRC', ['קונסטרוקצ','בטון','יסודות','שלד']],
  ['ELEC', ['חשמל','תאורה','מתח']],
  ['PLUM', ['אינסטלצ','סניטר','ביוב','ניקוז','מים']],
  ['SAFE', ['בטיחות','כיבוי','מתזים','ספרינקלר']],
  ['HVAC', ['מיזוג','אוורור','vrf']],
  ['TRAF', ['תנועה','חניה','חנייה','חניון']],
  ['LAND', ['נוף','גינון']],
  ['ACSS', ['נגישות']],
];
function stemWord(w){
  // Hebrew clitic prefixes (ה ו ב ל כ מ ש) glue onto nouns: "לקונסטרוקציה" vs "קונסטרוקציה".
  return (w.length >= 4 && 'הובלכמש'.indexOf(w[0]) !== -1) ? w.slice(1) : w;
}
function variantsOf(text){
  // One entry per word, holding the word and its stem. Stripping is ambiguous —
  // "הדמיות" begins with ה as part of the word — so both forms stay comparable.
  const out = [];
  (text||'').split(/\s+/).forEach(raw => {
    const w = raw.replace(/[^\u0590-\u05FF0-9A-Za-z]/g, '');
    if (w.length < 3) return;
    const s = stemWord(w);
    out.push(s === w ? [w] : [w, s]);
  });
  return out;
}
function matchTasks(text, tasks){
  const qs = variantsOf(text);
  if (!qs.length) return [];
  return (tasks||[])
    .filter(t => !t.done)
    .map(t => {
      const ts = new Set();
      variantsOf(t.title).forEach(v => v.forEach(x => ts.add(x)));
      return {t:t, score: qs.filter(v => v.some(x => ts.has(x))).length};
    })
    .filter(x => x.score > 0)
    .sort((a,b) => b.score - a.score)   // most matching words first; ties keep list order
    .slice(0, 3)
    .map(x => x.t);
}
function guessDiscipline(text, disciplines){
  const has = id => (disciplines||[]).some(d => d.id === id);
  const words = [];
  variantsOf(text).forEach(v => v.forEach(w => words.push(w.toLowerCase())));
  for (const [id, hints] of DISC_HINTS) {
    if (!has(id)) continue;
    const hit = hints.some(h => words.some(w => w === h || (h.length >= 4 && w.indexOf(h) === 0)));
    if (hit) return id;
  }
  return has('ARCH') ? 'ARCH' : ((disciplines||[])[0]||{}).id || '';
}
function routeCapture({status, taskId, kind}){
  if (kind === 'principle') return 'principle';
  if (kind === 'task') return 'task';
  if (kind === 'update') return taskId ? 'update' : 'inbox';
  if (!status) return 'task';
  return taskId ? 'update' : 'inbox';
}
/* A sheet belongs to a track when its `track` equals the track's `trackValue`;
   both are null for the ongoing track. stageOrder is used only for ordering
   because it is incomplete in the real data — the tender track lists one sheet
   but owns two. */
function sameTrack(a, b){ return (a == null ? null : a) === (b == null ? null : b); }
function listSheetsOfTrack(doc, trackId){
  const t = ((doc||{}).tracks||[]).find(x => x.id === trackId);
  if (!t) return [];
  const order = t.stageOrder || [];
  const rank = id => { const i = order.indexOf(id); return i < 0 ? 999 : i; };
  return ((doc||{}).sheets||[])
    .filter(s => s.type === 'list' && sameTrack(s.track, t.trackValue))
    .sort((a,b) => rank(a.id) - rank(b.id));
}
function defaultLocation(doc){
  // a loose task belongs in the no-track list sheet — "משימות שוטפות".
  // A project without one (its list moved into a track) falls back to the first
  // track that has a list sheet, or the window opens on a track that can't save.
  const tracks = (doc||{}).tracks || [];
  const loose = tracks.find(t => sameTrack(t.trackValue, null));
  const track = [loose].concat(tracks).find(t => t && listSheetsOfTrack(doc, t.id).length)
             || loose || tracks[0];
  const sheet = track ? listSheetsOfTrack(doc, track.id)[0] : null;
  return { trackId: track ? track.id : null, stageId: sheet ? sheet.id : null };
}
function locateTask(doc, taskId){
  if (!taskId) return null;
  const sheets = (doc||{}).sheets || [];
  for (const s of sheets) {
    if ((s.tasks||[]).some(t => t.id === taskId)) {
      const track = ((doc||{}).tracks||[]).find(t => sameTrack(t.trackValue, s.track));
      return { trackId: track ? track.id : null, stageId: s.id,
               stageName: s.name || '', trackLabel: track ? (track.label||'') : '' };
    }
  }
  return null;
}
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  if (actual !== expected) { console.error(`FAIL ${name}: got ${actual}, want ${expected}`); failures++; }
  else console.log(`ok   ${name}`);
}

const DISCS = [{id:'ARCH'},{id:'STRC'},{id:'ELEC'},{id:'PLUM'},{id:'SAFE'},{id:'HVAC'}];
const DISCS2 = DISCS.concat([{id:'TRAF'},{id:'LAND'},{id:'ACSS'}]);

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
// hints match whole words — these all matched the wrong discipline as raw substrings
eq(guessDiscipline('סוכם שהעירייה מאשרת את החניה', DISCS2), 'TRAF', 'guess: אש inside מאשרת is not SAFE');
eq(guessDiscipline('ראש הצוות ביקש עדכון', DISCS2), 'ARCH', 'guess: אש inside ראש is not SAFE');
eq(guessDiscipline('חתמנו על ההסכמים מול היועצים', DISCS2), 'ARCH', 'guess: מים inside ההסכמים is not PLUM');
// and the real hits still land
eq(guessDiscipline('בעיה במערכת כיבוי אש', DISCS2), 'SAFE', 'guess: כיבוי is SAFE');
eq(guessDiscipline('ניקוז מים בחניון', DISCS2), 'PLUM', 'guess: ניקוז is PLUM');
eq(guessDiscipline('נגישות לכיסא גלגלים', DISCS2), 'ACSS', 'guess: נגישות is ACSS');
eq(guessDiscipline('תיאום לקונסטרוקציה', DISCS2), 'STRC', 'guess: prefix hint matches an inflected word');

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
eq((matchTasks('חשמל', TASKS)[0]||{}).id, '2', 'match: finds by word');
eq(matchTasks('', TASKS).length, 0, 'match: empty query → none');
eq(matchTasks('אב', TASKS).length, 0, 'match: query under 3 chars → none');
eq(matchTasks('שהושלמה', TASKS).length, 0, 'match: skips done tasks');
eq(matchTasks('קונסטרוקציה', []).length, 0, 'match: no tasks → none');
// Hebrew clitic prefixes: without stemming these both miss the right task and offer wrong ones
eq((matchTasks('שלחתי תכניות לקונסטרוקציה', TASKS)[0]||{}).id, '1', 'match: ל-prefix still finds the task');
eq((matchTasks('קיבלתי הערות על ההדמיות', [{id:'h', title:'הדמיות'}])[0]||{}).id, 'h', 'match: ה-prefix still finds the task');
eq(matchTasks('סגור', [{id:'x', title:'לסגור חוזה'}]).length, 1, 'match: query stem equals title stem');
// a query word must equal a whole title word, not sit inside one
eq(matchTasks('נון', [{id:'x', title:'תכנון ראשוני'}]).length, 0, 'match: no mid-word substring hits');
// more matching words wins
eq((matchTasks('תיאום חברת חשמל', TASKS)[0]||{}).id, '2', 'match: best-scoring task ranks first');
// splits on whitespace: each word is matched separately, so a phrase still finds a task
eq((matchTasks('סיכמנו את תיאום חברת חשמל מול הרשות', TASKS)[0]||{}).id, '2', 'match: multi-word query splits into words');
eq(matchTasks('בדקתי חשמל וגם קונסטרוקציה', TASKS).length, 3, 'match: words from several tasks, still capped');

// routeCapture — the status decides what gets created
eq(routeCapture({status:'sent', taskId:'1'}), 'update', 'route: status + task → update');
eq(routeCapture({status:'sent', taskId:null}), 'inbox', 'route: status, no task → inbox');
eq(routeCapture({status:null, taskId:null}), 'task', 'route: no status → new task');
eq(routeCapture({status:null, taskId:'1'}), 'task', 'route: no status still means a new task');
eq(routeCapture({status:'sent', taskId:'1', kind:'principle'}), 'principle', 'route: explicit kind wins');
eq(routeCapture({status:null, taskId:null, kind:'update'}), 'inbox', 'route: forced update without a task → inbox');


// ---- location helpers ----
// mirrors the real shape: ongoing carries trackValue null and owns the no-track sheet
const DOC = {
  tracks: [
    {id:'ongoing',   trackValue:null,        label:'מסלול תכנון', stageOrder:['s1']},
    {id:'licensing', trackValue:'licensing', label:'מסלול רישוי', stageOrder:['s3','s2']},
    {id:'tender',    trackValue:'tender',    label:'מסלול מכרז',  stageOrder:[]},
    {id:'execution', trackValue:'execution', label:'מסלול ביצוע', stageOrder:[]},
  ],
  sheets: [
    {id:'s0', type:'dashboard', track:'licensing', name:'דאשבורד'},
    {id:'s1', type:'list', track:null,        name:'משימות שוטפות', tasks:[{id:'t1',title:'א'}]},
    {id:'s2', type:'list', track:'licensing',  name:'תיק מידע',     tasks:[{id:'t2',title:'ב'}]},
    {id:'s3', type:'list', track:'licensing',  name:'תנאים מקדימים',tasks:[]},
    {id:'s4', type:'tender', track:'tender',   name:'מכרז'},
    {id:'s5', type:'list', track:'tender',     name:'משימות',       tasks:[{id:'t3',title:'ג'}]},
  ],
};

eq(listSheetsOfTrack(DOC,'ongoing').length, 1, 'stages: ongoing has one list sheet');
eq(listSheetsOfTrack(DOC,'ongoing')[0].id, 's1', 'stages: the no-track sheet belongs to ongoing');
eq(listSheetsOfTrack(DOC,'licensing').map(s=>s.id).join(','), 's3,s2', 'stages: stageOrder decides order');
// the tender track lists no stageOrder but owns a list sheet — it must still be offered
eq(listSheetsOfTrack(DOC,'tender').map(s=>s.id).join(','), 's5', 'stages: found by track, not by stageOrder');
eq(listSheetsOfTrack(DOC,'tender').length, 1, 'stages: the tender-type sheet is not a task list');
eq(listSheetsOfTrack(DOC,'execution').length, 0, 'stages: a track with no list sheet has none');
eq(listSheetsOfTrack(DOC,'nope').length, 0, 'stages: unknown track → none');
eq(listSheetsOfTrack({},'ongoing').length, 0, 'stages: empty doc → none');

eq(defaultLocation(DOC).trackId, 'ongoing', 'default: lands on the ongoing track');
eq(defaultLocation(DOC).stageId, 's1', 'default: lands on משימות שוטפות');
eq(defaultLocation({}).stageId, null, 'default: empty doc → nothing');
// the loose list moved into a track: the ongoing track is empty, so skip it
const MOVED = { tracks: DOC.tracks, sheets: DOC.sheets.filter(s => !sameTrack(s.track, null)) };
eq(defaultLocation(MOVED).trackId, 'licensing', 'default: no loose list → first track with a stage');
eq(defaultLocation(MOVED).stageId, 's3', 'default: no loose list → that track’s first stage (by stageOrder)');

eq((locateTask(DOC,'t2')||{}).stageId, 's2', 'locate: finds the task’s sheet');
eq((locateTask(DOC,'t2')||{}).trackId, 'licensing', 'locate: reports its track');
eq((locateTask(DOC,'t2')||{}).stageName, 'תיק מידע', 'locate: reports the stage name');
eq((locateTask(DOC,'t1')||{}).trackId, 'ongoing', 'locate: null track resolves to ongoing');
eq((locateTask(DOC,'t3')||{}).stageId, 's5', 'locate: finds a task in the tender track');
eq(locateTask(DOC,'nope'), null, 'locate: unknown task → null');
eq(locateTask(DOC,null), null, 'locate: no task → null');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
