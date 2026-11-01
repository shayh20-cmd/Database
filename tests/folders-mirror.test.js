// Run: node --test tests/folders-mirror.test.js
// The folders page (Settings → Project folders) names the folder a SENT file goes to — the type rows' "תיווצר" marker
// and the example line — with a copy of the layout engine's rules: the folders-layout block of project_hub_01.html.
// This test loads that block straight from the page and checks it against the server's own publishPlan
// (tools/local-server/filing-plan.js) over a set of trees and layouts, so the two cannot drift apart unnoticed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'project_hub_01.html'), 'utf8');
const m = html.match(/\/\* ═══ folders-layout ═══ \*\/([\s\S]*?)\/\* ═══ \/folders-layout ═══ \*\//);
if (!m) throw new Error('folders-layout block not found in project_hub_01.html');
const plan = require('../tools/local-server/filing-plan');
const L = require('../tools/local-server/filing-layout');

const DATE = '2026-10-28';
const fmFill = (pattern, v) => ['code', 'type', 'yyyy', 'mm', 'dd'].reduce((s, k) => s.split('{' + k + '}').join(v[k] == null ? '' : String(v[k])), String(pattern || ''));
const pageAt = date => new Function('fmFill', 'FM_DATES', 'fmToday', m[1] + '\nreturn { fmSentPath, fmTypeDirOf, fmTopVersion };')(fmFill, ['year-day', 'day', 'none'], () => date);
const page = pageAt(DATE);

const types = L.OFFICE_TYPES;
const B = 'W/P/LDLI-pub-@sent';
const LIB_TYPES = ['PDF', 'DWG', 'DWF', 'DOCS'];
const LIB = ['W', 'W/P', B, ...LIB_TYPES.flatMap(t => [B + '/LDLI-pub-sent-' + t, B + '/LDLI-pub-sent-' + t + '/LDLI-pub-' + t + '-2026'])];
const TREES = {
  'by type, dated': ['W', 'W/P', B, B + '/LDLI-pub-sent-PDF', B + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2025', B + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2025/LDLI-pub-PDF-2025,03,04', B + '/LDLI-pub-sent-DWG'],
  convention: ['W', 'W/P', B, B + '/LDLI-pub-sent-2025', B + '/LDLI-pub-sent-2025/LDLI-pub-2025,01,02', B + '/LDLI-pub-sent-2025/LDLI-pub-2025,01,02/PDF'],
  'empty archive': ['W', 'W/P', B],
  // the Library: a year folder under each type folder, read without its day folders (a helper reading 5 levels deep)
  // and with them
  'library, no day folders': LIB,
  'library, day folders': [...LIB, B + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,19 - חניה זמנית', B + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,02,24- תכניות לדורון']
};
const TARGETS = {
  'picked, on top': { base: B, byType: true, typeDirs: { PDF: B + '/LDLI-pub-sent-PDF' }, typeAt: 'top', date: 'year-day' },
  'inside the day': { base: B, byType: true, typeDirs: {}, typeAt: 'day', date: 'year-day' },
  'together, day only': { base: B, byType: false, typeDirs: {}, typeAt: 'top', date: 'day' },
  'no date folders': { base: B, byType: true, typeDirs: { PDF: B + '/LDLI-pub-sent-PDF' }, typeAt: 'top', date: 'none' },
  'picked, not in the tree': { base: B, byType: true, typeDirs: { PDF: B + '/new/PDF-here', DWG: B.toUpperCase() + '/LDLI-pub-sent-DWG' }, typeAt: 'top', date: 'year-day' },
  'picked outside the base': { base: B, byType: true, typeDirs: { PDF: 'W/elsewhere-PDF' }, typeAt: 'top', date: 'day' },
  'picked outside the base, in the tree': { base: B, byType: true, typeDirs: { PDF: 'W/P', DWG: B + '/LDLI-pub-sent-DWG' }, typeAt: 'top', date: 'year-day' },
  'year folders picked': { base: B, byType: true, typeDirs: Object.fromEntries(LIB_TYPES.map(t => [t, B + '/LDLI-pub-sent-' + t + '/LDLI-pub-' + t + '-2026'])), typeAt: 'top', date: 'year-day' },
  'a year folder picked for PDF only': { base: B, byType: true, typeDirs: { PDF: B + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026' }, typeAt: 'top', date: 'year-day' },
  'a year folder picked, day only': { base: B, byType: true, typeDirs: { PDF: B + '/LDLI-pub-sent-PDF/LDLI-pub-PDF-2026' }, typeAt: 'top', date: 'day' }
};

test('folders page: the SENT folder it names is the one publishPlan files to', () => {
  let n = 0;
  for (const date of [DATE, '2027-01-05']) {
    const at = pageAt(date);
    for (const [tn, tree] of Object.entries(TREES)) {
      for (const [ln, t] of Object.entries(TARGETS)) {
        for (const [type, name] of [['PDF', 'a.pdf'], ['DWG', 'b.dwg'], ['DOCS', 'c.txt']]) {
          const r = plan.publishPlan({ layout: { sent: t, updated: { base: '', byType: false, typeDirs: {} } }, types, tree, code: 'LDLI', files: [{ n: 0, name }], sent: true, updated: false, date });
          const server = r.plan.files[0].dests[0] && r.plan.files[0].dests[0].path;
          assert.strictEqual(at.fmSentPath(tree, t, types, type, 'LDLI'), server, `${date} / ${tn} / ${ln} / ${type}`);
          n++;
        }
      }
    }
  }
  assert.strictEqual(n, 2 * 5 * 10 * 3);
});

test('folders page: a year folder picked as the type folder — the Library example line', () => {
  const t = TARGETS['year folders picked'];
  const P = B + '/LDLI-pub-sent-PDF';
  assert.strictEqual(page.fmSentPath(TREES['library, no day folders'], t, types, 'PDF', 'LDLI'), P + '/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,28');
  assert.strictEqual(page.fmSentPath(TREES['library, day folders'], t, types, 'PDF', 'LDLI'), P + '/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,28');
  assert.strictEqual(pageAt('2027-01-05').fmSentPath(TREES['library, no day folders'], t, types, 'PDF', 'LDLI'), P + '/LDLI-pub-PDF-2027/LDLI-pub-PDF-2027,01,05');
  assert.strictEqual(page.fmSentPath(TREES['library, no day folders'], TARGETS['picked, on top'], types, 'PDF', 'LDLI'), P + '/LDLI-pub-PDF-2026/LDLI-pub-PDF-2026,10,28', 'the day named after the year folder');
});

test('folders page: a picked type folder inside the base is used even when missing; outside the base it is not', () => {
  const tree = TREES['by type, dated'];
  const t = TARGETS['picked, not in the tree'];
  assert.strictEqual(page.fmTypeDirOf(tree, t, 'PDF', types), B + '/new/PDF-here');
  assert.strictEqual(page.fmTypeDirOf(tree, t, 'DWG', types), B + '/LDLI-pub-sent-DWG', 'in the tree, in its spelling');
  assert.strictEqual(page.fmTypeDirOf(tree, TARGETS['picked outside the base'], 'PDF', types), B + '/PDF', 'outside the base and missing: not used (base/<type>)');
  assert.strictEqual(page.fmTypeDirOf(tree, TARGETS['picked outside the base, in the tree'], 'PDF', types), B + '/LDLI-pub-sent-PDF', 'outside the base, in the tree: not used either (named like the DWG folder)');
});

test('folders page: a consultant folder\'s newest plan version', () => {
  const C = 'W/C/X-elec';
  assert.strictEqual(page.fmTopVersion(['W', 'W/C', C, C + '/X-elec-plans', C + '/X-elec-plans/X-elec-plans-v02', C + '/X-elec-plans/X-elec-plans-v10', C + '/X-elec-plans/X-elec-@ver'], C), 'X-elec-plans-v10');
  assert.strictEqual(page.fmTopVersion(['W', 'W/C', C, C + '/a-v3'], C), 'a-v3', 'versions in the folder itself');
  assert.strictEqual(page.fmTopVersion(['W', 'W/C', C], C), '');
});
