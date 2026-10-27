'use strict';
// Run: node --test tests/list-export.test.js — tests the real list-export.js, no mirror.
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const LX = require('../list-export.js');

/* the zip is stored (no compression), so its local entries read straight off */
function unzip(bytes) {
  const buf = Buffer.from(bytes);
  const out = {};
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const crc = buf.readUInt32LE(at + 14), size = buf.readUInt32LE(at + 18);
    const nameLen = buf.readUInt16LE(at + 26), extra = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 30, at + 30 + nameLen);
    const data = buf.subarray(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size);
    out[name] = { text: data.toString('utf8'), crc, data };
    at += 30 + nameLen + extra + size;
  }
  assert.strictEqual(buf.readUInt32LE(buf.length - 22), 0x06054b50, 'ends with the central directory record');
  return out;
}

const model = (over = {}) => ({
  title: 'אולם ספורט לוד', date: '27.10.2026', subtitle: 'רשימת משימות · 3 משימות', sheetName: 'משימות', rtl: true,
  fileName: 'x', pageLabel: 'עמוד {p} מתוך {n}',
  columns: [{ label: 'שם המשימה', kind: 'name' }, { label: 'סטטוס', kind: 'status' }, { label: 'הערות', kind: 'comment' }],
  rows: [
    { type: 'section', label: 'גבוהה', depth: 0, count: 2 },
    { type: 'task', cells: ['תיאום <חשמל> & "מים"', 'בעבודה', 'שורה\u0007 עם תו בקרה'] },
    { type: 'task', sub: true, cells: ['תת־משימה', 'בוצע', ''] },
  ],
  ...over,
});

test('crc32 matches zlib', () => {
  const b = Buffer.from('Project Hub — ייצוא');
  assert.strictEqual(LX.crc32(b), zlib.crc32(b));
});

test('colName counts like Excel', () => {
  assert.deepStrictEqual([0, 25, 26, 27, 51, 52, 701, 702].map(LX.colName), ['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
});

test('the workbook holds the five parts, each with a correct checksum', () => {
  const parts = unzip(LX.buildXlsx(model(), 'portrait'));
  assert.deepStrictEqual(Object.keys(parts).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
  for (const [name, p] of Object.entries(parts)) assert.strictEqual(LX.crc32(p.data), p.crc, name);
});

test('a Hebrew sheet: right to left, A4, header row repeating, frozen under the header', () => {
  const parts = unzip(LX.buildXlsx(model(), 'portrait'));
  const sheet = parts['xl/worksheets/sheet1.xml'].text;
  assert.match(sheet, /<sheetView rightToLeft="1"/);
  assert.match(sheet, /<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"\/>/);
  assert.match(sheet, /<pane ySplit="4" topLeftCell="A5"/);
  assert.match(parts['xl/workbook.xml'].text, /<definedName name="_xlnm.Print_Titles" localSheetId="0">'משימות'!\$4:\$4<\/definedName>/);
  assert.match(parts['xl/styles.xml'].text, /readingOrder="2"/);
});

test('cell text is escaped, control characters dropped; the section row spans the table', () => {
  const sheet = unzip(LX.buildXlsx(model(), 'landscape'))['xl/worksheets/sheet1.xml'].text;
  assert.match(sheet, /orientation="landscape"/);
  assert.ok(sheet.includes('תיאום &lt;חשמל&gt; &amp; &quot;מים&quot;'));
  assert.ok(sheet.includes('שורה עם תו בקרה'));
  assert.ok(sheet.includes('גבוהה (2)'));
  assert.match(sheet, /<mergeCell ref="A5:C5"\/>/);
  assert.match(sheet, /<c r="A7" s="8"/, 'a subtask name is indented');
  assert.match(sheet, /<c r="B6" s="5"/, 'the status is centred');
});

test('an English sheet is left to right with an explicit reading order', () => {
  const parts = unzip(LX.buildXlsx(model({ rtl: false, sheetName: 'Tasks' }), 'portrait'));
  assert.doesNotMatch(parts['xl/worksheets/sheet1.xml'].text, /rightToLeft/);
  assert.match(parts['xl/styles.xml'].text, /readingOrder="1"/);
  assert.doesNotMatch(parts['xl/styles.xml'].text, /readingOrder="2"/);
});

test('a sheet name loses the characters Excel refuses and stays within 31', () => {
  const wb = unzip(LX.buildXlsx(model({ sheetName: 'a/b:c*d?[e]' + 'x'.repeat(40) }), 'portrait'))['xl/workbook.xml'].text;
  const name = wb.match(/<sheet name="([^"]*)"/)[1];
  assert.ok(!/[\[\]:*?\/\\]/.test(name));
  assert.ok(name.length <= 31);
});

test('the print page: A4 in the chosen orientation, header repeating, page count in the language', () => {
  const html = LX.buildPrintHtml(model(), 'landscape');
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /@page\{size:A4 landscape/);
  assert.match(html, /thead\{display:table-header-group\}/);
  assert.match(html, /content:"עמוד " counter\(page\) " מתוך " counter\(pages\)/);
  assert.ok(html.includes('<td colspan="3">גבוהה <span class="n">(2)</span></td>'));
  assert.ok(html.includes('תיאום &lt;חשמל&gt; &amp; &quot;מים&quot;'));
  assert.match(LX.buildPrintHtml(model({ rtl: false }), 'portrait'), /<html lang="en" dir="ltr">[\s\S]*size:A4 portrait/);
});

test('safeFileName keeps Hebrew and drops what Windows refuses', () => {
  assert.strictEqual(LX.safeFileName('אולם: ספורט/לוד - רשימת משימות - 27.10.2026'), 'אולם ספורט לוד - רשימת משימות - 27.10.2026');
  assert.strictEqual(LX.safeFileName(''), 'export');
});
