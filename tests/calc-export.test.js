// Run: node --test tests/calc-export.test.js — tests the real calc-export.js, no mirror.
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const R = require('../calc-rules.js');
const X = require('../calc-export.js');

const L = {
  ZONE_INFO: { A: ['א', 'a'], B: ['ב', 'b'], C: ['ג', 'c'], N: ['ללא', 'n'] },
  BASES: { main: 'שטח עיקרי', total: 'שטח כולל' },
  G_LABEL: { m: 'גברים', w: 'נשים', u: 'דו-תכליתי', shared: 'משותף' },
  PCOL_LABEL: { m: 'גברים', w: 'נשים', x: 'משותף' },
  SPLIT_NOTE: { none: '—', area: 'לפי שטח', sport: 'קבוע', pool: 'קבוע' },
};
const ctx = { R, T: R.fill, L, project: 'אולם ספורט', dir: 'rtl' };
const head = { no: 2, date: '2026-11-04', by: 'א"ב' };

const SHEETS = {
  parking: { ...head, basis: 'main', zone: 'N', far: 100, rows: [{ id: 'a', type: '1.2', qty: 96 }] },
  hlt: { ...head, rows: [{ id: 'a', type: 'off', qty: 500 }], plan: { floors: [{ id: 'f', name: 'קומת קרקע', fx: {} }] } },
  hga: { ...head, basis: 'main', vent: { m2pp: 0.4, flow: 6 }, towers: [{ id: 't', kind: 'mamam', area: 20 }],
    floors: [{ id: 'g', level: 0, name: 'קומת קרקע', uses: [{ id: 'u', type: 'off', qty: 1000 }], spaces: [{ id: 's', kind: 'mamam', tower: 't', area: null, systems: [50] }] }] },
  safety: { ...head, height: 'high', sprinklers: true, stairs: [{ id: 'a', w: 1.2, prot: true, levels: [0, 1] }],
    floors: [{ id: 'g', level: 0, name: 'קומת קרקע', corridor: 'res', spaces: [{ id: 's', use: 'b41', area: 1000 }], exits: [{ door: 1.1 }, { door: 1.1 }] }, { id: 'h', level: 1, name: 'קומה 1', corridor: 'res', spaces: [], exits: [] }] },
};

/* the files of a stored zip */
function unzip(bytes) {
  const b = Buffer.from(bytes), files = {};
  let at = 0;
  while (b.readUInt32LE(at) === 0x04034b50) {
    const size = b.readUInt32LE(at + 18), nameLen = b.readUInt16LE(at + 26), extra = b.readUInt16LE(at + 28);
    const name = b.toString('utf8', at + 30, at + 30 + nameLen), start = at + 30 + nameLen + extra;
    assert.strictEqual(b.readUInt16LE(at + 8), 0, name + ' is stored');
    assert.strictEqual(zlib.crc32 ? zlib.crc32(b.subarray(start, start + size)) : b.readUInt32LE(at + 14), b.readUInt32LE(at + 14), name + ' crc');
    files[name] = b.toString('utf8', start, start + size);
    at = start + size;
  }
  return files;
}

for (const kind of Object.keys(SHEETS)) {
  test(`${kind}: a report, a page and a workbook`, () => {
    const rep = X.reportFor(kind, SHEETS[kind], ctx);
    assert.ok(rep.sections.length > 0);
    assert.ok(rep.details.some(d => d[1] === '04/11/2026'));
    const html = X.toHtml(rep);
    assert.match(html, /size:A4 portrait/);
    assert.match(html, /dir="rtl"/);
    assert.ok(html.includes('אולם ספורט'));
    assert.doesNotMatch(html, /undefined|NaN|\[object/);
    const f = unzip(X.toXlsx(rep)), sheet = f['xl/worksheets/sheet1.xml'];
    assert.match(sheet, /paperSize="9"/);
    assert.match(sheet, /fitToWidth="1" fitToHeight="0"/);
    assert.match(sheet, /rightToLeft="1"/);
    assert.doesNotMatch(sheet, /undefined|NaN|\[object/);
    assert.ok(f['xl/styles.xml'] && f['xl/workbook.xml'] && f['[Content_Types].xml']);
  });
}

test('numbers stay numbers in Excel, and text is escaped', () => {
  const rep = { title: 'a<b', project: '', no: 1, dir: 'ltr', details: [], sections: [{ title: 'x & y', tables: [{ head: ['h'], rows: [[12.5], ['"q"']] }] }] };
  const s = unzip(X.toXlsx(rep))['xl/worksheets/sheet1.xml'];
  assert.match(s, /<v>12\.5<\/v>/);
  assert.ok(s.includes('a&lt;b') && s.includes('x &amp; y') && s.includes('&quot;q&quot;'));
  assert.doesNotMatch(s, /rightToLeft/);
});

test('a problem shows in the report: a floor short of area, a flight under its minimum', () => {
  const rep = X.reportFor('hga', { ...SHEETS.hga, towers: [{ id: 't', kind: 'mamam', area: 12 }] }, ctx);
  const row = rep.sections[0].tables[0].rows[0];
  assert.strictEqual(rep.sections[0].verdict.tone, 'bad');
  assert.strictEqual(row[row.length - 1].tone, 'bad');
  const saf = X.reportFor('safety', { ...SHEETS.safety, stairs: [{ id: 'a', w: 0.5, levels: [0, 1] }] }, ctx);
  const sec = saf.sections.find(s => s.verdict);
  assert.ok(sec.tables[0].rows.some(r => r[4] && r[4].tone === 'bad'));
});

test('the file name has nothing a file system refuses', () => {
  assert.strictEqual(X.fileName({ project: 'a/b', title: 'הג"א', no: 3 }), 'a b - הג א - 3');
});
