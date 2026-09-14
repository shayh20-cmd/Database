// Dependency-free smoke tests. Run: node tests/merge.test.js
// MIRROR of the merge helpers in project_hub_01.html — keep in sync.

// ---- mirrored logic (copy of the project_hub_01.html block) ----
/* ═══ Three-way merge (mirrored in tests/merge.test.js) ═══
   The document is read, held, and written whole, so a write from elsewhere — the
   capture window, another tab — is invisible to this one and would be overwritten.
   Merging against the version loaded tells an external addition apart from a
   deliberate deletion, which a "keep whatever the server has" merge cannot do. */
function deepEq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function isPlainObj(v){return v&&typeof v==='object'&&!Array.isArray(v);}
function isIdList(v){return Array.isArray(v)&&v.length>0&&v.every(x=>x&&typeof x==='object'&&typeof x.id==='string');}
function mergeById(base,mine,theirs){
  const baseArr=Array.isArray(base)?base:[];
  const baseIds=new Set(baseArr.map(x=>x&&x.id));
  const baseMap=new Map(baseArr.filter(x=>x&&x.id).map(x=>[x.id,x]));
  const mineIds=new Set(mine.map(x=>x.id));
  const theirMap=new Map(theirs.map(x=>[x.id,x]));
  const out=[];
  for(const m of mine){
    const t=theirMap.get(m.id);
    if(!t){ if(baseIds.has(m.id))continue; out.push(m); continue; }   // removed there, or added here
    out.push(mergeValue(baseMap.get(m.id),m,t));
  }
  for(const t of theirs){
    if(mineIds.has(t.id))continue;
    if(baseIds.has(t.id))continue;                                     // removed here
    out.push(t);                                                       // added there while we held the document
  }
  return out;
}
function mergeObjects(base,mine,theirs){
  const out={};
  const b=isPlainObj(base)?base:{};
  for(const k of new Set([...Object.keys(mine),...Object.keys(theirs)])){
    if(!(k in mine)){ if(k in b)continue; out[k]=theirs[k]; continue; }  // key removed here
    if(!(k in theirs)){ if(k in b)continue; out[k]=mine[k]; continue; }  // key removed there
    out[k]=mergeValue(b[k],mine[k],theirs[k]);
  }
  return out;
}
function mergeValue(base,mine,theirs){
  if(deepEq(mine,theirs))return mine;
  if(deepEq(mine,base))return theirs;    // untouched here, so take the other side
  if(deepEq(theirs,base))return mine;    // untouched there
  if(isIdList(mine)&&isIdList(theirs))return mergeById(base,mine,theirs);
  if(Array.isArray(mine)&&Array.isArray(theirs)&&!mine.length&&isIdList(theirs))return mergeById(base,mine,theirs);
  if(Array.isArray(mine)&&Array.isArray(theirs)&&!theirs.length&&isIdList(mine))return mergeById(base,mine,theirs);
  if(isPlainObj(mine)&&isPlainObj(theirs))return mergeObjects(base,mine,theirs);
  return mine;                           // a real conflict on one value: the active editor wins
}
function mergeDocs(base,mine,theirs){
  if(!theirs||typeof theirs!=='object')return mine;
  return mergeValue(base,mine,theirs);
}
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) { console.error(`FAIL ${name}:\n  got  ${a}\n  want ${b}`); failures++; }
  else console.log(`ok   ${name}`);
}

const doc = (tasks, extra) => Object.assign({ sheets:[{id:'s1', type:'list', tasks:tasks}] }, extra||{});
const ids = d => d.sheets[0].tasks.map(t => t.id);

// The case that started this: a capture lands while a tab holds the document.
{
  const base   = doc([{id:'t1', title:'א'}]);
  const mine   = doc([{id:'t1', title:'א'}]);                       // the tab changed something else
  mine.projectInfo = {description:'שונה בתוכנה'};
  const theirs = doc([{id:'t1', title:'א'}, {id:'t2', title:'נלכד'}]);
  const out = mergeDocs(base, mine, theirs);
  eq(ids(out), ['t1','t2'], 'external capture survives an unrelated in-app save');
  eq(out.projectInfo.description, 'שונה בתוכנה', 'the in-app edit is kept too');
}

// The trap: a naive "keep whatever the server has" merge makes deletion impossible.
{
  const base   = doc([{id:'t1'}, {id:'t2'}]);
  const mine   = doc([{id:'t1'}]);            // deleted t2 in the app
  const theirs = doc([{id:'t1'}, {id:'t2'}]); // server still has it
  eq(ids(mergeDocs(base, mine, theirs)), ['t1'], 'a deliberate delete is not resurrected');
}
{
  const base   = doc([{id:'t1'}, {id:'t2'}]);
  const mine   = doc([{id:'t1'}, {id:'t2'}]);
  const theirs = doc([{id:'t1'}]);            // deleted elsewhere
  eq(ids(mergeDocs(base, mine, theirs)), ['t1'], 'a delete made elsewhere is honoured');
}

// Updates appended from two sides at once must both survive.
{
  const base   = doc([{id:'t1', events:[{id:'e1'}]}]);
  const mine   = doc([{id:'t1', events:[{id:'e1'},{id:'e2'}]}]);
  const theirs = doc([{id:'t1', events:[{id:'e1'},{id:'e3'}]}]);
  const out = mergeDocs(base, mine, theirs);
  eq(out.sheets[0].tasks[0].events.map(e=>e.id), ['e1','e2','e3'], 'updates from both sides are kept');
}

// Field-level: whoever actually changed a field wins; an untouched field takes theirs.
{
  const base   = doc([{id:'t1', title:'ישן', description:''}]);
  const mine   = doc([{id:'t1', title:'שיניתי', description:''}]);
  const theirs = doc([{id:'t1', title:'ישן', description:'<img>'}]);   // capture added a screenshot
  const out = mergeDocs(base, mine, theirs).sheets[0].tasks[0];
  eq(out.title, 'שיניתי', 'my field change wins');
  eq(out.description, '<img>', 'a field I never touched takes the other side');
}
{
  const base   = doc([{id:'t1', title:'ישן'}]);
  const mine   = doc([{id:'t1', title:'שלי'}]);
  const theirs = doc([{id:'t1', title:'שלהם'}]);
  eq(mergeDocs(base, mine, theirs).sheets[0].tasks[0].title, 'שלי', 'a true conflict goes to the active editor');
}

// The inbox is the collection the capture window writes most.
{
  const base   = {inbox:[]};
  const mine   = {inbox:[]};
  const theirs = {inbox:[{id:'i1', text:'נלכד'}]};
  eq(mergeDocs(base, mine, theirs).inbox.map(i=>i.id), ['i1'], 'a captured inbox item survives');
}
{
  const base   = {inbox:[{id:'i1'}]};
  const mine   = {inbox:[]};                    // assigned it, so it left the inbox
  const theirs = {inbox:[{id:'i1'}]};
  eq(mergeDocs(base, mine, theirs).inbox, [], 'assigning an inbox item is not undone');
}

// Principles and nothing-changed cases.
{
  const base   = {standalonePrinciples:[{id:'p1'}]};
  const mine   = {standalonePrinciples:[{id:'p1'}]};
  const theirs = {standalonePrinciples:[{id:'p1'},{id:'p2'}]};
  eq(mergeDocs(base, mine, theirs).standalonePrinciples.map(p=>p.id), ['p1','p2'], 'a captured principle survives');
}
{
  const base = doc([{id:'t1'}]), mine = doc([{id:'t1'}]), theirs = doc([{id:'t1'}]);
  eq(mergeDocs(base, mine, theirs), mine, 'identical documents merge to themselves');
}
{
  const base = doc([{id:'t1'}]);
  const mine = doc([{id:'t1'},{id:'t2'}]);
  eq(ids(mergeDocs(base, mine, null)), ['t1','t2'], 'no server document leaves mine alone');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
