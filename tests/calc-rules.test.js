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

test('הג"א: institutional space by % of the floor area, switching with the basis', () => {
  const fl = { uses: [{ type: 'off', qty: 1200 }, { type: 'bank', qty: 300 }], spaces: [{ id: 'a', name: '01', kind: 'mamam', area: 38 }] };
  const main = R.hgaCheckFloor(fl, 'main').lines[0];          // 3% × 1200 + 2% × 300 = 42
  assert.deepStrictEqual([main.reqArea, main.reqCount, main.gap, main.ok], [42, 1, -4, false]);
  const total = R.hgaCheckFloor(fl, 'total').lines[0];        // 1.8% × 1200 + 1.2% × 300 = 25.2
  assert.deepStrictEqual([total.reqArea, total.ok], [25.2, true]);
});

test('הג"א: the 10 m² minimum and the 60 m² maximum per space', () => {
  const small = R.hgaFloor({ uses: [{ type: 'off', qty: 200 }] }, 'main').req.mamam;   // 6 → 10
  assert.deepStrictEqual([small.area, small.minApplied], [10, true]);
  const big = R.hgaFloor({ uses: [{ type: 'off', qty: 3000 }] }, 'main').req.mamam;     // 90 m² → 2 spaces
  assert.strictEqual(big.count, 2);
  const over = R.hgaCheckFloor({ uses: [{ type: 'off', qty: 3000 }], spaces: [{ name: 'A', kind: 'mamam', area: 90 }] }, 'main').lines[0];
  assert.deepStrictEqual(over.tooBig, ['A']);
});

test('הג"א: housing and education', () => {
  const r = R.hgaFloor({ uses: [{ type: 'res_mamad', qty: 4 }, { type: 'res_mamak_big', qty: 6 }] }, 'main').req;
  assert.deepStrictEqual([r.mamad.count, r.mamad.area, r.mamak.count, r.mamak.area], [4, 36, 2, 30]);
  const e = R.hgaFloor({ uses: [{ type: 'sch1', qty: 8 }, { type: 'sch11', qty: 2 }] }, 'main').req.edu;
  assert.deepStrictEqual([e.area, e.count], [135, 2]);                                  // 8×15 + 2×7.5, max 90 per space
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
  assert.deepStrictEqual([x.occ, x.exits, x.doorReq, x.panic], [450, 2, 1.13, true]);   // 450 × 0.5 cm / 2 = 1.125 → 1.13 > 1.10
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
  assert.strictEqual(thin.lines.filter(l => l.k === 'exit' && !l.ok).length, 1);              // 0.90 is under the 3.2.2.2 minimum
  const ground = R.safCheck(SAF([{ name: '0', level: 0, spaces: [{ use: 'b41', area: 2000 }], exits: [{ kind: 'level', door: 0.6, panic: true }, { kind: 'level', door: 1.2, panic: true }] }])).floors[0];
  assert.deepStrictEqual(ground.lines.filter(l => !l.ok).map(l => l.k), ['exit']);            // 200 people: 1.00 m total, but 0.60 < 1.10
});
