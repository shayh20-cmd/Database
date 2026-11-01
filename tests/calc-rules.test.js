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
