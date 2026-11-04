// calc-rules.js — the parking and הל"ת arithmetic, loaded as the real module.
// Expected numbers are worked by hand from the regulations' tables.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../calc-rules.js');

const sheet = (o) => Object.assign({ basis: 'main', zone: 'C', far: 0, rows: [] }, o);

test('parking: residential range per unit, zone ג', () => {
  const c = R.carRow({ type: '1.2', qty: 96 }, sheet());
  assert.deepStrictEqual([c.min, c.max], [96, 192]);
  assert.deepStrictEqual(c.refs, ['1.2']);
});

test('parking: maximum-only standard has no lower bound', () => {
  const c = R.carRow({ type: '3.1', qty: 1500 }, sheet({ basis: 'total' }));
  assert.strictEqual(c.noMin, true);
  assert.strictEqual(c.max, 20);                       // 1500 / 75, table 3א(1)
  assert.strictEqual(R.span(c.min, c.max, c.noMin, c.noMax), 'עד 20');
});

test('parking: commercial tiers are cumulative and switch with the area basis', () => {
  // main area, zone א: 2,000/50 + 8,000/100 + 2,000/150 = 40 + 80 + 13.3 → 134
  const main = R.carRow({ type: '2.1', qty: 12000 }, sheet({ zone: 'A' }));
  assert.strictEqual(main.max, 134);
  assert.deepStrictEqual(main.refs, ['2.1', '2.3']);
  // total area, zone א: 2,941/73 + 9,059/147 = 40.3 + 61.6 → 102
  const total = R.carRow({ type: '2.1', qty: 12000 }, sheet({ zone: 'A', basis: 'total' }));
  assert.strictEqual(total.max, 102);
  assert.deepStrictEqual(total.refs, ['2א(1)']);
});

test('parking: no mass transit picks the row by the plan\'s building rights', () => {
  const lo = R.carRow({ type: '3.1', qty: 1000 }, sheet({ zone: 'N', far: 100 }));
  assert.deepStrictEqual([lo.min, lo.max, lo.refs[0]], [20, 34, '3.2']);   // 1 per 30–50 m²
  const hi = R.carRow({ type: '3.1', qty: 1000 }, sheet({ zone: 'N', far: 150 }));
  assert.deepStrictEqual([hi.max, hi.refs[0]], [17, '3.3']);              // 1 per 60 m², maximum
});

test('parking: bicycles and motorcycles follow Parts C and D', () => {
  const sh = sheet({ basis: 'total' });
  assert.strictEqual(R.bikeRow({ type: '2.1', qty: 1250 }, sh).n, 3);      // 1250/460
  assert.deepStrictEqual(R.motoRow({ type: '1.2', qty: 96 }, sh), { min: 10, max: 20, c: R.MOTOS.res });
  assert.strictEqual(R.motoRow({ type: '1.2', qty: 8 }, sh).na, true);     // only above ten units
  assert.strictEqual(R.bikeRow({ type: '5.1', qty: 12 }, sh).n, null);     // needs the number of students
});

test('parking: a future station counts as zone ג', () => {
  assert.strictEqual(R.zoneForStation({ d: 200, planned: true }), 'C');
  assert.strictEqual(R.zoneForStation({ d: 450, planned: false }), 'B');
});

test('הל"ת: steps and "for every N more" including a part of N', () => {
  const rule = R.hltById('off').groups[0].fx.toilet;      // offices, men
  assert.strictEqual(R.stepCount(rule, 120), 4);
  assert.strictEqual(R.stepCount(rule, 131), 5);          // 4 + 1 for a part of 80
  assert.strictEqual(R.stepCount(rule, 290), 6);          // 4 + ceil(160/80)
});

test('הל"ת: offices split by gender with per-floor fixtures', () => {
  const x = R.hltRow({ type: 'off', qty: 240, men: 50, floors: 4 });
  assert.deepStrictEqual([x.groups[0].fx.toilet.c, x.groups[0].fx.urinal.c, x.groups[1].fx.toilet.c], [4, 2, 7]);
  assert.deepStrictEqual([x.extra.drink.c, x.extra.janitor.c, x.extra.ksink.c], [4, 4, 4]);
});

test('הל"ת: shared toilets below the threshold', () => {
  const x = R.hltRow({ type: 'dine', qty: 25 });
  assert.strictEqual(x.groups.length, 1);
  assert.strictEqual(x.groups[0].g, 'shared');
  assert.strictEqual(x.groups[0].fx.toilet.c, 1);
});

test('הל"ת: retail public toilets by area, none below 100 m²', () => {
  assert.strictEqual(R.hltRow({ type: 'comP', qty: 80 }).groups[0].fx.toilet.c, 0);
  const x = R.hltRow({ type: 'comP', qty: 1500 });
  assert.deepStrictEqual([x.groups[0].fx.toilet.c, x.groups[1].fx.toilet.c, x.groups[0].fx.basin.c], [2, 4, 3]);
});

test('הל"ת: required vs proposed, urinals covered by extra toilets, floors checked', () => {
  const sh = { rows: [{ type: 'off', qty: 240, men: 50, floors: 2 }],
    plan: { floors: [
      { id: 'a', name: 'קרקע', fx: { toilet_m: 3, toilet_w: 4, urinal_m: 1, basin_m: 2, basin_w: 3, drink: 2, janitor: 1, ksink: 1 } },
      { id: 'b', name: 'קומה 1', fx: { toilet_m: 2, toilet_w: 3, basin_m: 2, basin_w: 3, drink: 2, ksink: 1 } },
    ] } };
  const c = R.planCheck(sh);
  const line = k => c.lines.find(l => l.c.k === k);
  assert.strictEqual(line('toilet_m').gap, 1);
  assert.strictEqual(line('urinal_m').st, 'ok');           // short 1, covered by the extra toilet
  assert.strictEqual(line('toilet_m').swap, 1);
  assert.deepStrictEqual(line('janitor').missing, ['קומה 1']);
  assert.strictEqual(line('janitor').st, 'bad');
  assert.strictEqual(c.entered, true);
});

test('הג"א towers: one area through the floors, a floor can differ or stay out', () => {
  let n = 0; const id = () => 'n' + (++n);
  const uses = [{ type: 'off', qty: 1000 }];   // 30 m²
  const tw = { id: 't', kind: 'mamam', area: 30 };
  let floors = [{ id: 'a', level: 0, uses, spaces: [] }, { id: 'b', level: 1, uses, spaces: [] }, { id: 'c', level: 2, uses, spaces: [] }];
  floors = ['a', 'b'].reduce((l, f) => R.hgaSetTowerFloor(l, tw, f, true, id), floors);
  const sh = over => ({ basis: 'main', towers: [tw], floors: over(floors) });
  const line = (s, i) => R.hgaCheckFloor(R.hgaSheet(s).resolved[i], s.basis).lines[0];
  assert.strictEqual(line(sh(f => f), 1).area, 30);
  assert.strictEqual(line(sh(f => f), 2).ok, false);                // not in the tower: nothing proposed
  tw.area = 35;
  assert.deepStrictEqual([line(sh(f => f), 0).area, line(sh(f => f), 1).area], [35, 35]);
  const differs = f => f.map(x => x.id === 'b' ? Object.assign({}, x, { spaces: [Object.assign({}, x.spaces[0], { area: 12 })] }) : x);
  assert.deepStrictEqual([line(sh(differs), 0).area, line(sh(differs), 1).area, line(sh(differs), 1).ok], [35, 12, false]);
  assert.strictEqual(R.hgaTotals(sh(differs)).area, 47);
  const out = R.hgaSetTowerFloor(floors, tw, 'a', false);
  assert.strictEqual(R.hgaPruneTowers([tw], out).length, 1);
  assert.strictEqual(R.hgaPruneTowers([tw], R.hgaSetTowerFloor(out, tw, 'b', false)).length, 0);
});

test('הג"א towers: older sheets move over, same place and area being the same tower', () => {
  const sp = (id, area) => ({ id, name: '01', kind: 'mamam', area, systems: [50] });
  const s = R.hgaSheet({ basis: 'main', floors: [{ name: 'קומת קרקע', uses: [], spaces: [sp('x', 30)] }, { name: 'קומה 1', uses: [], spaces: [sp('y', 30)] }, { name: 'משרדים', uses: [], spaces: [sp('z', 20)] }] });
  assert.deepStrictEqual(s.floors.map(f => f.level), [0, 1, 2]);
  assert.deepStrictEqual(s.floors[2].name, 'משרדים');
  assert.deepStrictEqual(s.towers.map(t => [t.kind, t.area]), [['mamam', 30], ['mamam', 20]]);
  assert.deepStrictEqual(s.resolved.map(f => f.spaces[0].area), [30, 30, 20]);
  assert.deepStrictEqual(s.floors[1].spaces[0].systems, [50]);
  assert.deepStrictEqual(R.hgaSheet(s).towers, s.towers);          // a saved sheet stays as it is
});

test('הג"א floors: counts use the safety rules; a copied floor goes on top in the same towers', () => {
  let n = 0; const id = () => 'n' + (++n);
  const floors = R.safSetCounts([{ id: 'g', level: 0, uses: [{ id: 'u', type: 'off', qty: 100 }], spaces: [{ id: 's', kind: 'mamam', tower: 't', area: null }] }], 3, 1, level => ({ id: id(), level, name: R.safFloorName(level), uses: [], spaces: [] }));
  assert.deepStrictEqual(R.safFloorCounts(floors), { above: 3, below: 1 });
  assert.deepStrictEqual(floors.map(f => f.level), [-1, 0, 1, 2]);
  const c = R.hgaCopyFloorUp(floors, 1, id), top = c[c.length - 1];
  assert.deepStrictEqual([top.level, top.spaces[0].tower, top.spaces[0].id === 's', top.uses[0].id === 'u'], [3, 't', false, false]);
  assert.deepStrictEqual([R.hgaFloorHasData(floors[0]), R.hgaFloorHasData(floors[1])], [false, true]);
});

test('הג"א section: top floor first, one column per tower, the problems marked', () => {
  const sp = (t, area) => ({ id: t + area, kind: 'mamam', tower: t, area: area == null ? null : area });
  const fl = (level, qty, spaces) => ({ id: 'f' + level, level, name: 'קומה ' + level, uses: [{ type: 'off', qty }], spaces });
  const s = R.hgaSection({ basis: 'main', towers: [{ id: 'a', kind: 'mamam', area: 20 }, { id: 'b', kind: 'mamam', area: 18 }, { id: 'c', kind: 'mamam', area: 8 }],
    floors: [fl(0, 1000, [sp('a'), sp('b')]), fl(1, 2000, [sp('a'), sp('b')]), fl(2, 1000, [sp('a', 30), sp('c')])] }, undefined);
  assert.deepStrictEqual(s.rows.map(r => r.fl.level), [2, 1, 0]);
  assert.deepStrictEqual(s.cols.map(c => [c.no, c.max, c.bad, c.ok]), [[1, 30, true, false], [2, 18, true, false], [3, 10, true, false]]);
  const [top, mid, low] = s.rows;
  assert.deepStrictEqual(top.cells.map(c => c && [c.area, c.own, c.size, c.short]), [[30, true, false, true], null, [8, false, true, false]]);  // c is under the 10 m² minimum, which fails the floor
  assert.deepStrictEqual(mid.cells.map(c => c && c.short), [true, true, null]);                       // 38 of 60: no one space is at fault
  assert.deepStrictEqual([mid.bad.length, low.bad.length], [1, 0]);
  assert.deepStrictEqual(low.cells.map(c => c && c.short), [false, false, null]);
  assert.deepStrictEqual([low.cells[0].ok, mid.cells[0].ok, top.cells[2].ok], [true, false, false]);
  const one = R.hgaSection({ basis: 'main', towers: [{ id: 'a', kind: 'mamam', area: 20 }], floors: [fl(0, 200, [sp('a')]), fl(1, 300, [sp('a')])] }).cols[0];
  assert.deepStrictEqual([one.ok, one.bad], [true, false]);
});

test('הג"א: institutional space by % of the floor area, switching with the basis', () => {
  const fl = { uses: [{ type: 'off', qty: 1200 }, { type: 'bank', qty: 300 }], spaces: [{ id: 'a', name: '01', kind: 'mamam', area: 38 }] };
  const main = R.hgaCheckFloor(fl, 'main').lines[0];          // 3% × 1200 + 2% × 300 = 42
  assert.deepStrictEqual([main.reqArea, main.reqCount, main.gap, main.ok], [42, 0, -4, false]);
  const total = R.hgaCheckFloor(fl, 'total').lines[0];        // 1.8% × 1200 + 1.2% × 300 = 25.2
  assert.deepStrictEqual([total.reqArea, total.ok], [25.2, true]);
});

test('הג"א: the 10 m² minimum and the 60 m² maximum per space', () => {
  const small = R.hgaFloor({ uses: [{ type: 'off', qty: 200 }] }, 'main').req.mamam;   // 6 → 10
  assert.deepStrictEqual([small.area, small.minApplied], [10, true]);
  const big = R.hgaFloor({ uses: [{ type: 'off', qty: 3000 }] }, 'main').req.mamam;     // 90 m², however it divides
  assert.deepStrictEqual([big.area, big.count], [90, 0]);
  const over = R.hgaCheckFloor({ uses: [{ type: 'off', qty: 3000 }], spaces: [{ name: 'A', kind: 'mamam', area: 90 }] }, 'main').lines[0];
  assert.deepStrictEqual(over.tooBig, ['A']);
  const fl = sp => R.hgaCheckFloor({ uses: [{ type: 'off', qty: 3000 }], spaces: sp.map((area, i) => ({ name: 's' + i, kind: 'mamam', area })) }, 'main').lines[0];
  assert.strictEqual(fl([60, 30]).ok, true);                                            // the total and the sizes hold, any split
  assert.strictEqual(fl([40, 30, 20]).ok, true);
  assert.deepStrictEqual([fl([85, 5]).ok, fl([55, 30, 5]).tooSmall], [false, ['s2']]);  // a space under the 10 m² minimum
  assert.deepStrictEqual([fl([]).minEach, fl([]).maxEach], [10, 60]);
});

test('הג"א: housing and education', () => {
  const r = R.hgaFloor({ uses: [{ type: 'res_mamad', qty: 4 }, { type: 'res_mamak_big', qty: 6 }] }, 'main').req;
  assert.deepStrictEqual([r.mamad.count, r.mamad.area, r.mamak.count, r.mamak.area], [4, 36, 2, 30]);
  const e = R.hgaFloor({ uses: [{ type: 'sch1', qty: 8 }, { type: 'sch11', qty: 2 }] }, 'main').req.edu;
  assert.deepStrictEqual([e.area, e.count], [135, 0]);                                  // 8×15 + 2×7.5, split freely
});

test('הג"א: ventilation people, flow and systems', () => {
  const v = R.hgaVent({ area: 38.17, systems: [50] }, { m2pp: 0.4, flow: 6 });
  assert.deepStrictEqual([v.people, v.flow, v.cap, v.ok], [96, 576, 50, false]);
  assert.deepStrictEqual(R.hgaSuggest(96), [100]);
  assert.deepStrictEqual(R.hgaSuggest(120), [66, 66]);
  assert.strictEqual(R.hgaVent({ area: 38.17, systems: [50, 50] }).ok, true);
});

const SAF = (floors, o) => Object.assign({ height: 'high', residential: false, sprinklers: true, floors }, o);

test('בטיחות: occupancy by factor, exits from a room, door and panic hardware', () => {
  const x = R.safSpace({ use: 'a3a', area: 450, factor: 1 }, SAF([]));
  assert.deepStrictEqual([x.occ, x.exits, x.horiz, x.doorReq, x.panic], [450, 2, 2.25, 1.1, true]);   // 450 × 0.5 cm; each door ≥ 1.10
  const doors = (n, w) => R.safSpaceCheck({ use: 'a3a', area: 450, factor: 1, doors: n, doorW: w, panic: true }, SAF([])).issues.map(i => i.k);
  assert.deepStrictEqual(doors(2, 1.1), ['total']);                                           // 2.20 < 2.25
  assert.deepStrictEqual(doors(2, 1.2), []);
  assert.strictEqual(R.safSpace({ use: 'b41', area: 200 }, SAF([])).occ, 20);
  assert.strictEqual(R.safSpace({ use: 'a3', area: 600, factor: 0.5 }, SAF([])).occ, 800);  // a factor below the range is raised to 0.75
  assert.strictEqual(R.safSpace({ use: 'a6', qty: 30 }, SAF([])).occ, 60);                    // 0.50 m of bench per person
  assert.strictEqual(R.safSpace({ use: 'i39', area: 30, qty: 5 }, SAF([])).exits, 2);         // hazardous over 20 m²
});

test('בטיחות: exits from a floor, widths per exit and the corridor minimum', () => {
  const c = R.safCheck(SAF([{ name: '0', level: 0, corridor: 'pub', spaces: [{ use: 'a3a', area: 450, factor: 1 }, { use: 'a12', area: 60 }, { use: 'b41', area: 200 }] }]));
  const f = c.floors[0].f;
  assert.deepStrictEqual([f.occ, f.exits, f.horizPer, f.stairPer, f.corrReq, f.panic], [476, 2, 1.19, 1.9, 1.3, true]);
  const big = R.safFloor({ spaces: [{ use: 'a3', area: 600, factor: 0.75 }] }, SAF([]));
  assert.strictEqual(big.exits, 3);                                                            // 800 people
  const small = R.safFloor({ short30: true, spaces: [{ use: 'b41', area: 250 }] }, SAF([]));
  assert.deepStrictEqual([small.exits, small.single], [1, 'small']);                           // 25 people, short travel
  assert.strictEqual(R.safFloor({ spaces: [{ use: 'b41', area: 250 }] }, SAF([], { height: 'tower' })).exits, 2);
});

test('בטיחות: stairs keep the largest floor they serve on the way down', () => {
  const c = R.safCheck(SAF([
    { name: '1', level: 1, spaces: [{ use: 'b41', area: 1200 }], exits: [{ kind: 'stair', door: 0.9, stair: 1.1 }, { kind: 'stair', door: 0.9, stair: 1.1 }] },
    { name: '2', level: 2, spaces: [{ use: 'b41', area: 3500 }], exits: [{ kind: 'stair', door: 0.9, stair: 1.4, panic: true }, { kind: 'stair', door: 0.9, stair: 1.4, panic: true }] },
  ]));
  const [f1, f2] = c.floors;
  assert.deepStrictEqual([f1.f.stairTot, f1.f.stairGov, f2.f.stairGov], [0.96, 2.8, 2.8]);   // 350 × 0.8 cm carried down
  assert.strictEqual(f1.lines.find(l => l.k === 'stairSum').ok, false);                       // 2 × 1.10 < 2.80
  assert.strictEqual(f2.bad, 0);
});

test('בטיחות: the total width may be split unevenly; each exit keeps its minimum', () => {
  const fl = stairs => ({ name: '1', level: 1, spaces: [{ use: 'b41', area: 3500 }],
    exits: stairs.map(w => ({ kind: 'stair', door: 0.9, stair: w, panic: true })) });
  const ok = R.safCheck(SAF([fl([1.2, 1.6])])).floors[0];
  assert.deepStrictEqual([ok.f.stairGov, ok.bad], [2.8, 0]);                                  // 1.20 + 1.60 = 2.80
  const thin = R.safCheck(SAF([fl([0.9, 1.9])])).floors[0];
  assert.strictEqual(thin.lines.find(l => l.k === 'stairSum').ok, true);
  assert.strictEqual(thin.lines.filter(l => l.k === 'stair' && !l.ok).length, 1);             // 0.90 is under the 3.2.2.2 minimum
  const flights = R.safCheck(SAF([{ name: '1', level: 1, spaces: [{ use: 'b41', area: 3500 }], exits: [{ door: 0.9, panic: true }, { door: 0.9, panic: true }], stairs: [{ w: 1.4 }, { w: 1.4 }] }])).floors[0];
  assert.strictEqual(flights.bad, 0);                                                          // stairs kept apart from the doors
  const none = R.safCheck(SAF([{ name: '1', level: 1, spaces: [{ use: 'b41', area: 3500 }], exits: [{ door: 0.9, panic: true }, { door: 0.9, panic: true }] }])).floors[0];
  assert.strictEqual(none.lines.find(l => l.k === 'stairSum').ok, false);                     // a floor above the exit level needs stairs
  const ground = R.safCheck(SAF([{ name: '0', level: 0, spaces: [{ use: 'b41', area: 2000 }], exits: [{ kind: 'level', door: 0.6, panic: true }, { kind: 'level', door: 1.2, panic: true }] }])).floors[0];
  assert.deepStrictEqual(ground.lines.filter(l => !l.ok).map(l => l.k), ['exit']);            // 200 people: 1.00 m total, but 0.60 < 1.10
});

test('safety floors: a copy is the next floor up; moving a floor renumbers the list', () => {
  const fl = [{ name: 'קומת קרקע', level: 0 }, { name: 'קומה 1', level: 1 }, { name: 'גג טכני', level: 2 }, { name: 'קומה 3', level: 3 }];
  assert.strictEqual(R.safNextLevel(fl), 4);
  assert.strictEqual(R.safNextLevel([{ level: -2 }, { level: -1 }]), 0);
  assert.strictEqual(R.safFloorName(11), 'קומה 11');
  const moved = R.safMoveFloor(fl, 3, 1);
  assert.deepStrictEqual(moved.map(f => f.level), [0, 1, 2, 3]);
  assert.deepStrictEqual(moved.map(f => f.name), ['קומת קרקע', 'קומה 1', 'קומה 2', 'גג טכני']);  // a typed name stays
  const down = R.safMoveFloor(fl, 0, 1);
  assert.deepStrictEqual(down.map(f => f.name), ['קומת קרקע', 'קומה 1', 'גג טכני', 'קומה 3']);
  const gone = R.safRemoveFloor(fl, 1);
  assert.deepStrictEqual(gone.map(f => f.level), [0, 1, 2]);
  assert.deepStrictEqual(gone.map(f => f.name), ['קומת קרקע', 'גג טכני', 'קומה 2']);
  assert.deepStrictEqual(R.safRemoveFloor([{ level: -2 }, { level: -1 }, { level: 0 }], 1).map(f => f.level), [-1, 0]);
  // default names are stored in Hebrew and shown in the page's language
  const en = (k, o) => ({ 'קומת קרקע': 'Ground floor', 'קומה {n}': 'Floor ' + (o && o.n) })[k];
  assert.strictEqual(R.safFloorLabel({ name: 'קומה 2', level: 2 }, en), 'Floor 2');
  assert.strictEqual(R.safFloorLabel({ name: 'Ground floor', level: 0 }, k => k), 'קומת קרקע');
  assert.strictEqual(R.safFloorLabel({ name: 'גג טכני', level: 2 }, en), 'גג טכני');
  // a basement keeps the list's levels: only the places change
  const low = R.safMoveFloor([{ name: 'קומה -1', level: -1 }, { name: 'קומת קרקע', level: 0 }, { name: 'Floor 1', level: 1 }], 2, 0);
  assert.deepStrictEqual(low.map(f => f.level), [-1, 0, 1]);
  assert.deepStrictEqual(low.map(f => f.name), ['קומה -1', 'קומת קרקע', 'קומה 1']);
});

test('safety floors: counts above and below ground, and copying onto other floors', () => {
  const make = level => ({ name: R.safFloorName(level), level });
  const fl = [{ name: 'קומת קרקע', level: 0 }, { name: 'קומה 1', level: 1 }];
  assert.deepStrictEqual(R.safFloorCounts(fl), { above: 2, below: 0 });
  const more = R.safSetCounts(fl, 3, 2, make);
  assert.deepStrictEqual(more.map(f => f.level), [-2, -1, 0, 1, 2]);
  assert.strictEqual(more[3], fl[1]);                                       // a kept floor is the same floor
  assert.deepStrictEqual(R.safFloorCounts(more), { above: 3, below: 2 });
  assert.deepStrictEqual(R.safSetCounts(more, 1, 1, make).map(f => f.level), [-1, 0]);  // the top and the deepest go
  assert.strictEqual(R.safFloorHasData({ spaces: [], exits: [] }), false);
  assert.strictEqual(R.safFloorHasData({ corridorW: 1.5 }), true);
  let id = 0;
  const list = [{ id: 'a', name: 'א', level: 0, corridorW: 1.5, spaces: [{ id: 's', use: 'b41' }] }, { id: 'b', name: 'ב', level: 1, short30: true, spaces: [] }, { id: 'c', name: 'ג', level: 2 }];
  const out = R.safCopyFloor(list, 0, [1], () => 'n' + (++id));
  assert.deepStrictEqual([out[1].id, out[1].name, out[1].level, out[1].corridorW, out[1].short30], ['b', 'ב', 1, 1.5, undefined]);
  assert.deepStrictEqual(out[1].spaces, [{ id: 'n1', use: 'b41' }]);
  assert.strictEqual(list[0].spaces[0].id, 's');                            // the source is untouched
  assert.strictEqual(out[2], list[2]);
});

test('safety: when protected stairs are required', () => {
  const refs = (sh, below) => R.safProtectedStairs(sh, below).map(r => r.ref);
  assert.deepStrictEqual(refs({ height: 'low' }, 0), []);
  assert.deepStrictEqual(refs({ height: 'high' }, 0), ['3.7.1.2']);
  assert.deepStrictEqual(refs({ height: 'tower' }, 0), ['3.7.1.3']);
  assert.deepStrictEqual(refs({ height: 'low', deepBelow: true }, 1), ['3.2.3.3']);
  assert.deepStrictEqual(refs({ height: 'low', deepBelow: true }, 0), []);          // the mark means nothing with no floors below ground
  assert.deepStrictEqual(refs({ height: 'tower', deepBelow: true }, 2), ['3.7.1.3', '3.2.3.3']);
});

test('safety floors: the number comes from the place in the list', () => {
  const list = R.safRenumber([{ name: 'קומה 5', level: 5 }, { name: 'גג טכני', level: 7 }, { name: 'קומת קרקע', level: 0 }, { name: 'קומה -2', level: -2 }]);
  assert.deepStrictEqual(list.map(f => f.level), [-1, 0, 1, 2]);
  assert.deepStrictEqual(list.map(f => f.name), ['קומה -1', 'קומת קרקע', 'קומה 1', 'גג טכני']);
  assert.deepStrictEqual(R.safRenumber([{}, {}, {}]).map(f => f.level), [0, 1, 2]);  // no levels yet
  assert.strictEqual(R.safFloorNick({ name: 'גג טכני' }), 'גג טכני');
  assert.strictEqual(R.safFloorNick({ name: 'קומה 3', level: 2 }), '');             // a number typed as a name isn't a nickname
});

test('safety stairs: a flight belongs to the building', () => {
  const old = { floors: [{ level: 0, stairs: [{ id: 'a', w: 1.5 }] }, { level: 1, stairs: [{ id: 'b', w: 1.5 }, { id: 'c', w: 1.2 }] }, { level: 2, stairs: [{ id: 'd', w: 1.1 }, { id: 'e', w: 1.2 }] }] };
  assert.deepStrictEqual(R.safFlights(old), [{ id: 'a', w: 1.5, levels: [0, 1] }, { id: 'c', w: 1.2, levels: [1, 2] }, { id: 'd', w: 1.1, levels: [2] }]);  // same place and width: one flight
  const sh = SAF([{ level: 0, spaces: [] }, { level: 1, spaces: [{ use: 'b41', area: 300 }] }]);
  sh.stairs = [{ id: 'x', w: 1.5, levels: [0, 1] }, { id: 'y', w: 1.2, levels: [1] }];
  const c = R.safCheck(sh);
  assert.deepStrictEqual(c.floors.map(o => o.stairs.map(st => st.id)), [['x'], ['x', 'y']]);
  assert.deepStrictEqual(R.safFlightsWithout([{ id: 'x', levels: [0, 1, 2] }, { id: 'y', levels: [1] }, { id: 'z', levels: [-2, -1] }], 1).map(f => f.levels), [[0, 1], [-2, -1]]);
  assert.deepStrictEqual(R.safFlightsWithout([{ id: 'z', levels: [-2, -1, 0] }], -1).map(f => f.levels), [[-1, 0]]);
});
