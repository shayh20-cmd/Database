// Dependency-free smoke tests. Run: node tests/activity-log.test.js
// MIRROR of the activity-log pure functions in project_hub_01.html — keep in sync.

// ---- mirrored logic (copy of the project_hub_01.html block) ----
function uid(){ return Math.random().toString(36).slice(2,9); }
const CURRENT_USER_LABEL='Shay H.';
function fmtLogTime(ms){
  const d=new Date(ms);
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function describeTaskChanges(before,after,ctx){
  ctx=ctx||{};
  const lbl=(list,id)=>{const f=(list||[]).find(x=>x.id===id);return f?f.label:id;};
  const lines=[];
  if(after.statusId!==before.statusId){
    lines.push(`סטטוס שונה ל"${lbl(ctx.statuses,after.statusId)}"`);
  }else if(!!after.done!==!!before.done){
    lines.push(after.done?'סומן כהושלם':'סימון ההשלמה הוסר');
  }
  if(after.priority!==before.priority){
    lines.push(after.priority?`עדיפות שונתה ל"${lbl(ctx.priorities,after.priority)}"`:'עדיפות הוסרה');
  }
  if(after.discipline!==before.discipline){
    lines.push(after.discipline?`תחום שונה ל"${lbl(ctx.disciplines,after.discipline)}"`:'תחום הוסר');
  }
  if((after.title||'')!==(before.title||'')){
    lines.push((before.title||'').trim()?`כותרת שונתה ל"${after.title}"`:`כותרת הוגדרה: "${after.title}"`);
  }
  if((after.startDate||'')!==(before.startDate||'')||(after.dueDate||'')!==(before.dueDate||'')){
    lines.push('תאריכים עודכנו');
  }
  if((after.description||'')!==(before.description||'')){
    lines.push('תיאור עודכן');
  }
  if((after.comment||'')!==(before.comment||'')){
    lines.push('הערה עודכנה');
  }
  if(!!after.isPrinciple!==!!before.isPrinciple){
    lines.push(after.isPrinciple?'סומן כעקרון תכנון':'הוסר מעקרון תכנון');
  }
  const subBefore=(before.subtasks||[]).length,subAfter=(after.subtasks||[]).length;
  if(subAfter>subBefore)lines.push(subAfter-subBefore===1?'נוספה תת-משימה':`נוספו ${subAfter-subBefore} תתי-משימות`);
  else if(subAfter<subBefore)lines.push(subBefore-subAfter===1?'תת-משימה נמחקה':`${subBefore-subAfter} תתי-משימות נמחקו`);
  else if(JSON.stringify((before.subtasks||[]).map(x=>({id:x.id,title:x.title,done:x.done})))
        !==JSON.stringify((after.subtasks||[]).map(x=>({id:x.id,title:x.title,done:x.done}))))
    lines.push('תתי-משימות עודכנו');
  const attBefore=(before.attachments||[]).length,attAfter=(after.attachments||[]).length;
  if(attAfter>attBefore)lines.push(attAfter-attBefore===1?'קובץ צורף':`${attAfter-attBefore} קבצים צורפו`);
  else if(attAfter<attBefore)lines.push('קובץ הוסר');
  if(JSON.stringify(before.fieldValues||{})!==JSON.stringify(after.fieldValues||{})){
    lines.push('שדות מותאמים עודכנו');
  }
  if((after.assigneeId||'')!==(before.assigneeId||'')){
    lines.push('אחראי שונה');
  }
  return lines;
}
function buildActivityLogEntries(before,after,ctx){
  return describeTaskChanges(before,after,ctx).map(text=>({id:uid(),at:Date.now(),user:CURRENT_USER_LABEL,text}));
}
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) { console.error(`FAIL ${name}:\n  got  ${a}\n  want ${b}`); failures++; }
  else console.log(`ok   ${name}`);
}

const STATUSES=[{id:'I',label:'עבודה'},{id:'N',label:'לא התחיל'},{id:'C',label:'הושלם'}];
const PRIORITIES=[{id:'high',label:'גבוהה'},{id:'low',label:'נמוכה'}];
const DISCIPLINES=[{id:'ARCH',label:'ARCH'},{id:'ELEC',label:'ELEC'}];
const CTX={statuses:STATUSES,priorities:PRIORITIES,disciplines:DISCIPLINES};

const base = { id:'t1', title:'משימה', statusId:'N', priority:'', discipline:'',
  startDate:'', dueDate:'', description:'', comment:'', isPrinciple:false,
  subtasks:[], attachments:[], fieldValues:{}, assigneeId:'', done:false };

// no change at all
eq(describeTaskChanges(base, {...base}, CTX), [], 'identical task → no lines');

// status change collapses done/statusOverride noise into one line
eq(describeTaskChanges(base, {...base, statusId:'I', statusOverride:true}, CTX),
   ['סטטוס שונה ל"עבודה"'], 'status change → one line, not also a separate done line');
eq(describeTaskChanges(base, {...base, statusId:'C', done:true}, CTX),
   ['סטטוס שונה ל"הושלם"'], 'status→C does not also fire the standalone done line');

// done toggled on its own (no statusId change) still gets a line
eq(describeTaskChanges(base, {...base, done:true}, CTX), ['סומן כהושלם'], 'done toggled alone');
eq(describeTaskChanges({...base, done:true}, {...base, done:false}, CTX),
   ['סימון ההשלמה הוסר'], 'done cleared alone');

// priority / discipline resolve through the label lists, and clearing reads distinctly
eq(describeTaskChanges(base, {...base, priority:'high'}, CTX), ['עדיפות שונתה ל"גבוהה"'], 'priority set');
eq(describeTaskChanges({...base, priority:'high'}, {...base, priority:''}, CTX), ['עדיפות הוסרה'], 'priority cleared');
eq(describeTaskChanges(base, {...base, discipline:'ELEC'}, CTX), ['תחום שונה ל"ELEC"'], 'discipline set');

// title: first title vs. a change to an existing one read differently
eq(describeTaskChanges({...base, title:''}, {...base, title:'חדש'}, CTX),
   ['כותרת הוגדרה: "חדש"'], 'title set from empty');
eq(describeTaskChanges(base, {...base, title:'אחר'}, CTX), ['כותרת שונתה ל"אחר"'], 'title changed');
eq(describeTaskChanges(base, {...base, title:'משימה'}, CTX), [], 'identical title → no line');

// dates collapse into one line regardless of which of the two changed
eq(describeTaskChanges(base, {...base, startDate:'2026-01-01'}, CTX), ['תאריכים עודכנו'], 'start date only');
eq(describeTaskChanges(base, {...base, dueDate:'2026-01-01'}, CTX), ['תאריכים עודכנו'], 'due date only');
eq(describeTaskChanges(base, {...base, startDate:'2026-01-01', dueDate:'2026-02-01'}, CTX),
   ['תאריכים עודכנו'], 'both dates at once → still one line');

eq(describeTaskChanges(base, {...base, description:'<p>hi</p>'}, CTX), ['תיאור עודכן'], 'description changed');
eq(describeTaskChanges(base, {...base, comment:'הערה'}, CTX), ['הערה עודכנה'], 'comment changed');
eq(describeTaskChanges(base, {...base, isPrinciple:true}, CTX), ['סומן כעקרון תכנון'], 'principle flagged');
eq(describeTaskChanges({...base, isPrinciple:true}, {...base, isPrinciple:false}, CTX),
   ['הוסר מעקרון תכנון'], 'principle unflagged');

// subtasks: count changes read as add/remove; same count but different content is generic
eq(describeTaskChanges(base, {...base, subtasks:[{id:'s1',title:'א',done:false}]}, CTX),
   ['נוספה תת-משימה'], 'one subtask added');
eq(describeTaskChanges(base, {...base, subtasks:[{id:'s1'},{id:'s2'}]}, CTX),
   ['נוספו 2 תתי-משימות'], 'two subtasks added at once');
eq(describeTaskChanges({...base, subtasks:[{id:'s1'},{id:'s2'}]}, {...base, subtasks:[{id:'s1'}]}, CTX),
   ['תת-משימה נמחקה'], 'one subtask removed');
eq(describeTaskChanges({...base, subtasks:[{id:'s1',title:'א',done:false}]},
                        {...base, subtasks:[{id:'s1',title:'א',done:true}]}, CTX),
   ['תתי-משימות עודכנו'], 'same count, a subtask field changed');
eq(describeTaskChanges({...base, subtasks:[{id:'s1',title:'א',done:false}]},
                        {...base, subtasks:[{id:'s1',title:'א',done:false}]}, CTX),
   [], 'identical subtasks → no line');

// attachments: same add/remove-count pattern
eq(describeTaskChanges(base, {...base, attachments:[{id:'a1'}]}, CTX), ['קובץ צורף'], 'one file added');
eq(describeTaskChanges(base, {...base, attachments:[{id:'a1'},{id:'a2'}]}, CTX),
   ['2 קבצים צורפו'], 'two files added at once');
eq(describeTaskChanges({...base, attachments:[{id:'a1'}]}, {...base, attachments:[]}, CTX),
   ['קובץ הוסר'], 'a file removed');

eq(describeTaskChanges(base, {...base, fieldValues:{f1:'x'}}, CTX), ['שדות מותאמים עודכנו'], 'custom field changed');
eq(describeTaskChanges(base, {...base, assigneeId:'st01'}, CTX), ['אחראי שונה'], 'assignee changed');

// several fields change in the same call → one line each, in a stable order
eq(describeTaskChanges(base, {...base, priority:'high', discipline:'ARCH', title:'חדש'}, CTX),
   ['עדיפות שונתה ל"גבוהה"', 'תחום שונה ל"ARCH"', 'כותרת שונתה ל"חדש"'],
   'multiple simultaneous field changes each get their own line');

// events[] is its own history (the עדכונים tab) — never double-logged here
eq(describeTaskChanges(base, {...base, events:[{id:'e1',status:'sent'}]}, CTX),
   [], 'events[] changes are not diffed by this log');

// fmtLogTime renders day.month.year · HH:MM in local time, zero-padded
{
  const d = new Date(2026, 8, 14, 9, 5); // 14 Sep 2026, 09:05 local — month is 0-indexed
  eq(fmtLogTime(d.getTime()), '14.09.2026 · 09:05', 'fmtLogTime pads day/month/hour/minute');
}

// buildActivityLogEntries wraps each line into a stamped, attributed record
{
  const entries = buildActivityLogEntries(base, {...base, priority:'high'}, CTX);
  eq(entries.length, 1, 'one changed field → one entry');
  eq(entries[0].text, 'עדיפות שונתה ל"גבוהה"', 'entry carries the description line');
  eq(entries[0].user, CURRENT_USER_LABEL, 'entry is attributed to the current user label');
  eq(typeof entries[0].id === 'string' && entries[0].id.length > 0, true, 'entry has an id');
  eq(typeof entries[0].at === 'number' && entries[0].at > 0, true, 'entry has a numeric timestamp');
}
{
  const entries = buildActivityLogEntries(base, {...base}, CTX);
  eq(entries, [], 'no field changes → no entries at all');
}

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
