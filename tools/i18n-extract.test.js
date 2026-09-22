'use strict';
const assert = require('assert');
const { extractHebrewLiterals, unescapeLiteral, loadDict, buildTranslator, findUntranslated } = require('./i18n-extract.js');

/* extractHebrewLiterals */
assert.deepStrictEqual(
  extractHebrewLiterals(`createElement('div',null,'שלום')`),
  ['שלום'],
  'single-quoted Hebrew literal'
);
assert.deepStrictEqual(
  extractHebrewLiterals(`const a="עברית", b='עוד';`),
  ['עברית', 'עוד'],
  'mixed quote styles'
);
assert.deepStrictEqual(
  extractHebrewLiterals(`const x='plain ascii'; const y="123";`),
  [],
  'ignores literals with no Hebrew'
);
assert.deepStrictEqual(
  extractHebrewLiterals(`'שלום' + 'שלום'`),
  ['שלום'],
  'de-duplicates'
);
assert.deepStrictEqual(
  extractHebrewLiterals(`'אמר "שלום" לו'`),
  ['אמר "שלום" לו'],
  'double quotes nested inside single quotes stay intact'
);
assert.deepStrictEqual(
  extractHebrewLiterals("`שלום ${name}`"),
  ['שלום ${name}'],
  'template literals are captured verbatim'
);

/* loadDict */
const dictSrc = `
(function () {
var HE_EN = { "שלום": "Hello", "עולם": "World" };
Object.assign(HE_EN, { "עוד": "More" });
window.I18N_HE_EN = HE_EN;
})();
`;
const dict = loadDict(dictSrc);
assert.deepStrictEqual(
  Object.keys(dict).sort(),
  ['עולם', 'עוד', 'שלום'].sort(),
  'collects keys across var and Object.assign chunks'
);
assert.strictEqual(dict['שלום'], 'Hello', 'values survive');

/* buildTranslator — must mirror the engine's substring behaviour */
const tr = buildTranslator(dict);
assert.strictEqual(tr('שלום'), 'Hello', 'exact key');
assert.strictEqual(tr('שלום עולם'), 'Hello World', 'two keys in one string');
assert.strictEqual(
  tr('שלום 1:100'),
  'Hello 1:100',
  'a longer literal is covered by a shorter key — THE case exact-matching gets wrong'
);
assert.strictEqual(tr('חדש'), 'חדש', 'unknown text is left alone');

/* findUntranslated */
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: `'שלום 1:100'` }], dict),
  [],
  'a literal fully covered by substring keys is NOT reported'
);
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: `'שלום' 'חדש'` }], dict),
  [{ file: 'a.html', items: [{ literal: 'חדש', residual: 'חדש' }] }],
  'reports only literals that still contain Hebrew after translation'
);
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: `'שלום'` }], dict),
  [],
  'files with nothing missing are omitted entirely'
);
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: `'שלום חדש'` }], dict),
  [{ file: 'a.html', items: [{ literal: 'שלום חדש', residual: 'Hello חדש' }] }],
  'residual shows which part is still Hebrew'
);

/* unescapeLiteral — 39 real dictionary keys contain a `"` written as \" in
   source. Without decoding, an extracted literal can never match them. */
assert.strictEqual(unescapeLiteral('\\"'), '"', 'escaped double quote');
assert.strictEqual(unescapeLiteral("\\'"), "'", 'escaped single quote');
assert.strictEqual(unescapeLiteral('a\\\\b'), 'a\\b', 'escaped backslash');
assert.strictEqual(unescapeLiteral('a\\nb'), 'a\nb', 'newline escape');
assert.strictEqual(unescapeLiteral('\\u05e9'), 'ש', 'unicode escape');
assert.strictEqual(unescapeLiteral('plain'), 'plain', 'no escapes untouched');

/* the real-world case: ` מ\"ר` (sqm) must extract as ` מ"ר`, not ` מ\"ר` */
assert.deepStrictEqual(
  extractHebrewLiterals('const u = " מ\\"ר";'),
  [' מ"ר'],
  'literal with an escaped quote decodes to the real character'
);

/* and once decoded it must match a dictionary key containing that character */
const qDict = loadDict('window.I18N_HE_EN = { \' מ"ר\': " sqm" };');
assert.deepStrictEqual(
  findUntranslated([{ file: 'a.html', text: 'const u = " מ\\"ר";' }], qDict),
  [],
  'escaped-quote literal is recognised as already translated'
);

console.log('ALL TESTS PASSED');
