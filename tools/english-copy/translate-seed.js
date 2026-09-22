'use strict';
/* Translates the seed data's display-only fields in project_hub.en.html from
   Hebrew to English, at source.
 *
 * The runtime translator rewrites rendered text only, so the moment a seed row
 * is opened for editing its stored Hebrew shows through. Translating the source
 * fixes that -- but only for fields that are purely display. Values the code
 * compares with === , or uses as object keys, must stay exactly as they are.
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'D:\\Projects\\@Delta Office\\New folder\\Database';
process.chdir(ROOT);

global.window = {};
require(path.join(ROOT, 'i18n-dict.js'));
const DICT = global.window.I18N_HE_EN;

const EXCLUDE = new Set([
  // compared with === / !==
  '\u05dc\u05d9\u05d3\u05d9\u05e2\u05d4', '\u05ea\u05e0\u05d0\u05d9\u05dd \u05de\u05e7\u05d3\u05de\u05d9\u05dd',
  '\u05e0\u05d9\u05d4\u05d5\u05dc \u05e9\u05d5\u05d8\u05e3', '\u05e0\u05d9\u05d4\u05d5\u05dc \u05ea\u05db\u05e0\u05d5\u05df',
  '\u05d0\u05d9\u05e9\u05d5\u05e8\u05d9 \u05d4\u05d9\u05ea\u05e8', '\u05e0\u05d9\u05d4\u05d5\u05dc \u05d5\u05ea\u05d9\u05d0\u05d5\u05dd',
  '\u05dc\u05dc\u05d0 \u05e9\u05dd',
  // used as object keys
  '\u05d1\u05d9\u05e6\u05d5\u05e2', '\u05d4\u05d9\u05ea\u05e8', '\u05de\u05db\u05e8\u05d6',
  '\u05ea\u05db\u05e0\u05d5\u05df \u05e8\u05d0\u05e9\u05d5\u05e0\u05d9', '\u05e0\u05db\u05d7\u05d5',
  '\u05e8\u05e9\u05dd', '\u05ea\u05e4\u05d5\u05e6\u05d4', '\u05db\u05dc \u05e9\u05e0\u05d9 10'
]);

const HE = /[\u0590-\u05FF]/;
const keys = Object.keys(DICT).sort(function (a, b) { return b.length - a.length; });
const escaped = keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
const RX = new RegExp('(?<![\\u0590-\\u05FF])(?:' + escaped.join('|') + ')(?![\\u0590-\\u05FF])', 'g');

const FILE = 'project_hub.en.html';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

let translated = 0, skipped = 0, partial = 0;

s = s.replace(/\b(title|comment|note|description):'((?:[^'\\]|\\.)*)'/g, function (all, field, val) {
  if (!HE.test(val)) return all;
  if (EXCLUDE.has(val)) { skipped++; return all; }
  const out = val.replace(RX, function (m) {
    return Object.prototype.hasOwnProperty.call(DICT, m) ? DICT[m] : m;
  });
  if (out === val) return all;
  if (out.indexOf("'") !== -1) { skipped++; return all; }   // never inject a quote
  if (HE.test(out)) partial++;
  translated++;
  return field + ":'" + out + "'";
});

fs.writeFileSync(FILE, s);
console.log('translated ' + translated + ' display values');
console.log('skipped    ' + skipped + ' (sentinels, keys, or would inject a quote)');
console.log('partial    ' + partial + ' still contain some Hebrew');
console.log('size delta ' + (s.length - before.length) + ' bytes');
