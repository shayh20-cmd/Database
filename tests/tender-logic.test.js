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

// ---- mirrored: keys + counts ----
function cellKey(bId, cId, dId){ return `${bId}|${cId}|${dId}`; }
function tenderCounts(sheet){
  const out={ N:0, I:0, R:0, C:0, total:0 };
  const buildings=sheet.buildings||[], consultants=sheet.consultants||[], docTypes=sheet.docTypes||[];
  for(const b of buildings) for(const c of consultants) for(const d of docTypes){
    const cell=(sheet.cells||{})[cellKey(b.id,c.id,d.id)];
    if(cell&&cell.na)continue;              // "לא רלוונטי" excluded from all counts
    out.total++;
    out[tenderCellStatus(cell||{})]++;
  }
  return out;
}
// ---- end mirror ----

const sheetA={
  buildings:[{id:'b1',name:'מבנה'}],
  consultants:[{id:'arch',name:'אדריכלות'},{id:'str',name:'קונסטרוקציה'}],
  docTypes:[{id:'plans',name:'תכניות'},{id:'spec',name:'מפרט'}],
  cells:{
    'b1|arch|plans':{events:[{status:'approved',date:'2026-01-01'}]}, // C
    'b1|arch|spec' :{events:[{status:'comments',date:'2026-01-01'}]}, // R
    'b1|str|plans' :{events:[{status:'update',date:'2026-01-01'}]},   // I
    'b1|str|spec'  :{na:true},                                        // excluded
  },
};
const cnt=tenderCounts(sheetA);
eq(cnt.total, 3, 'counts.total excludes na');
eq(cnt.C, 1, 'counts.C');
eq(cnt.R, 1, 'counts.R');
eq(cnt.I, 1, 'counts.I');
eq(cnt.N, 0, 'counts.N (missing cell would be N, but here none)');

// ---- mirrored: pivot ----
const DIMS=['buildings','consultants','docTypes'];
function tenderPivot(sheet){
  const pivot=sheet.pivot||{rows:'consultants',cols:'docTypes'};
  const rows=pivot.rows, cols=pivot.cols;
  const third=DIMS.find(d=>d!==rows&&d!==cols);
  const items=dim=>sheet[dim]||[];
  const rowItems=items(rows), colItems=items(cols), thirdItems=items(third);
  const showSubs=thirdItems.length>1;
  const subsList=thirdItems.length?thirdItems:[{id:'__all__',name:''}];
  const colGroups=colItems.map(ci=>({id:ci.id,name:ci.name,subs:subsList}));
  function keyOf(rowItem,colGroup,sub){
    const pick={};
    pick[rows]=rowItem.id; pick[cols]=colGroup.id; pick[third]=sub.id;
    return tenderCellKey(pick.buildings,pick.consultants,pick.docTypes);
  }
  return {rowItems,colGroups,showSubs,keyOf};
}
function tenderCellKey(bId,cId,dId){ return `${bId}|${cId}|${dId}`; }
// ---- end mirror ----

const sheetB={
  buildings:[{id:'b1',name:'מבנה'}],
  consultants:[{id:'arch',name:'אדריכלות'}],
  docTypes:[{id:'plans',name:'תכניות'},{id:'spec',name:'מפרט'}],
  pivot:{rows:'consultants',cols:'docTypes'},
};
const pB=tenderPivot(sheetB);
eq(pB.rowItems.length, 1, 'pivot rowItems=consultants');
eq(pB.colGroups.length, 2, 'pivot colGroups=docTypes');
eq(pB.showSubs, false, 'single building → subs collapsed');
eq(pB.keyOf(pB.rowItems[0], pB.colGroups[0], pB.colGroups[0].subs[0]), 'b1|arch|plans', 'keyOf maps back to building|consultant|doctype');

const sheetC={
  buildings:[{id:'b1',name:'A'},{id:'b2',name:'B'}],
  consultants:[{id:'arch',name:'אדר'}],
  docTypes:[{id:'plans',name:'תכ'}],
  pivot:{rows:'buildings',cols:'consultants'},
};
const pC=tenderPivot(sheetC);
eq(pC.showSubs, false, 'third=docTypes has 1 item → no subs');
eq(pC.keyOf(pC.rowItems[1], pC.colGroups[0], pC.colGroups[0].subs[0]), 'b2|arch|plans', 'multi-building keyOf');

// ---- mirrored: tenderVisibleSheet ----
function tenderVisibleSheet(sheet){
  const f=sheet.filters||{};
  const keep=(dim,idField)=>{
    const ids=f[idField]||[];
    if(!ids.length)return sheet[dim]||[];
    return (sheet[dim]||[]).filter(x=>ids.includes(x.id));
  };
  return {...sheet,
    consultants:keep('consultants','consultantIds'),
    buildings:keep('buildings','buildingIds')};
}
// ---- end mirror ----

const sheetD={
  buildings:[{id:'b1',name:'A'},{id:'b2',name:'B'}],
  consultants:[{id:'arch',name:'אדר'},{id:'str',name:'קונס'}],
  docTypes:[{id:'plans',name:'תכ'}],
  cells:{'b1|arch|plans':{events:[]}},
  filters:{consultantIds:['arch'],buildingIds:[],statuses:[]},
};
const vD=tenderVisibleSheet(sheetD);
eq(vD.consultants.length, 1, 'consultant filter narrows to 1');
eq(vD.consultants[0].id, 'arch', 'consultant filter keeps the selected id');
eq(vD.buildings.length, 2, 'empty building filter leaves buildings untouched');
eq(vD.cells, sheetD.cells, 'cells reference is untouched by filtering');

const sheetE={...sheetD, filters:{consultantIds:[],buildingIds:[],statuses:[]}};
const vE=tenderVisibleSheet(sheetE);
eq(vE.consultants.length, 2, 'no filters → all consultants pass through');
eq(vE.buildings.length, 2, 'no filters → all buildings pass through');

// ---- mirrored: tenderRemoveDim ----
const TENDER_FILTER_FIELD={consultants:'consultantIds',buildings:'buildingIds'};
function tenderRemoveDim(sheet, dim, id){
  const nextList=(sheet[dim]||[]).filter(x=>x.id!==id);
  const cells={};
  const bs=dim==='buildings'?nextList:(sheet.buildings||[]);
  const cs=dim==='consultants'?nextList:(sheet.consultants||[]);
  const ds=dim==='docTypes'?nextList:(sheet.docTypes||[]);
  for(const b of bs)for(const c of cs)for(const d of ds){
    const k=cellKey(b.id,c.id,d.id);
    if((sheet.cells||{})[k])cells[k]=sheet.cells[k];
  }
  const filterField=TENDER_FILTER_FIELD[dim];
  const filters=filterField&&sheet.filters&&sheet.filters[filterField]
    ?{...sheet.filters,[filterField]:sheet.filters[filterField].filter(x=>x!==id)}
    :sheet.filters;
  return {...sheet,[dim]:nextList,cells,filters};
}
// ---- end mirror ----

const sheetF={
  buildings:[{id:'b1',name:'A'}],
  consultants:[{id:'arch',name:'אדר'},{id:'str',name:'קונס'}],
  docTypes:[{id:'plans',name:'תכ'},{id:'spec',name:'מפ'}],
  cells:{
    'b1|arch|plans':{events:[{status:'approved',date:'2026-01-01'}]},
    'b1|arch|spec' :{events:[{status:'comments',date:'2026-01-01'}]},
    'b1|str|plans' :{events:[{status:'update',date:'2026-01-01'}]},
    'b1|str|spec'  :{na:true},
  },
};
const rF=tenderRemoveDim(sheetF, 'consultants', 'str');
eq(rF.consultants.length, 1, 'removeDim drops the removed consultant');
eq(rF.consultants[0].id, 'arch', 'removeDim keeps the remaining consultant');
eq(Object.keys(rF.cells).length, 2, 'removeDim drops both cells for the removed consultant');
eq(!!rF.cells['b1|arch|plans'], true, 'removeDim keeps surviving cell b1|arch|plans');
eq(!!rF.cells['b1|arch|spec'], true, 'removeDim keeps surviving cell b1|arch|spec');
eq(!!rF.cells['b1|str|plans'], false, 'removeDim purges b1|str|plans');
eq(!!rF.cells['b1|str|spec'], false, 'removeDim purges b1|str|spec (na cell too)');
eq(sheetF.consultants.length, 2, 'removeDim does not mutate the original sheet');

// ---- removeDim also strips the removed id from sheet.filters (consultants/buildings only) ----
const sheetG={
  buildings:[{id:'b1',name:'A'},{id:'b2',name:'B'}],
  consultants:[{id:'arch',name:'אדר'},{id:'str',name:'קונס'}],
  docTypes:[{id:'plans',name:'תכ'}],
  cells:{},
  filters:{consultantIds:['arch','str'],buildingIds:['b1'],statuses:[]},
};
const rG=tenderRemoveDim(sheetG, 'consultants', 'str');
eq(JSON.stringify(rG.filters.consultantIds), JSON.stringify(['arch']), 'removeDim strips removed id from filters.consultantIds');
eq(JSON.stringify(rG.filters.buildingIds), JSON.stringify(['b1']), 'removeDim leaves unrelated filters.buildingIds untouched');

const rH=tenderRemoveDim(sheetG, 'buildings', 'b1');
eq(JSON.stringify(rH.filters.buildingIds), JSON.stringify([]), 'removeDim strips removed id from filters.buildingIds');
eq(JSON.stringify(rH.filters.consultantIds), JSON.stringify(['arch','str']), 'removeDim leaves unrelated filters.consultantIds untouched');

// docTypes has no corresponding filter array — filters object passes through unchanged
const rI=tenderRemoveDim(sheetG, 'docTypes', 'plans');
eq(rI.filters, sheetG.filters, 'removeDim on docTypes leaves filters reference untouched (no filter array for docTypes)');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
