'use strict';
/* Last pass: `name:` fields in project_hub.en.html.
 *
 * Staff names matter beyond their own display, because the app derives avatar
 * initials from them in code -- so a name the runtime translator renders as
 * "Yonatan Meir" still produces the initials "ימ". Only translating the source
 * fixes that.
 *
 * `name:` also carries sheet and group names, two of which the code compares
 * with === . Those are in EXCLUDE and must survive byte-identical.
 */
const fs = require('fs');
const path = require('path');

const ROOT = 'D:\\Projects\\@Delta Office\\New folder\\Database';
process.chdir(ROOT);
global.window = {};
require(path.join(ROOT, 'i18n-dict.js'));
const DICT = global.window.I18N_HE_EN;

const EXCLUDE = new Set([
  '\u05dc\u05d9\u05d3\u05d9\u05e2\u05d4', '\u05ea\u05e0\u05d0\u05d9\u05dd \u05de\u05e7\u05d3\u05de\u05d9\u05dd',
  '\u05e0\u05d9\u05d4\u05d5\u05dc \u05e9\u05d5\u05d8\u05e3', '\u05e0\u05d9\u05d4\u05d5\u05dc \u05ea\u05db\u05e0\u05d5\u05df',
  '\u05d0\u05d9\u05e9\u05d5\u05e8\u05d9 \u05d4\u05d9\u05ea\u05e8', '\u05e0\u05d9\u05d4\u05d5\u05dc \u05d5\u05ea\u05d9\u05d0\u05d5\u05dd',
  '\u05dc\u05dc\u05d0 \u05e9\u05dd',
  '\u05d1\u05d9\u05e6\u05d5\u05e2', '\u05d4\u05d9\u05ea\u05e8', '\u05de\u05db\u05e8\u05d6',
  '\u05ea\u05db\u05e0\u05d5\u05df \u05e8\u05d0\u05e9\u05d5\u05e0\u05d9', '\u05e0\u05db\u05d7\u05d5',
  '\u05e8\u05e9\u05dd', '\u05ea\u05e4\u05d5\u05e6\u05d4', '\u05db\u05dc \u05e9\u05e0\u05d9 10'
]);

const HE = /[\u0590-\u05FF]/;
const keys = Object.keys(DICT).sort((a, b) => b.length - a.length);
const RX = new RegExp('(?<![\\u0590-\\u05FF])(?:' +
  keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  ')(?![\\u0590-\\u05FF])', 'g');

const FILE = 'project_hub.en.html';
let s = fs.readFileSync(FILE, 'utf8');

const FIELDS = /\b(name|initials|label|org|role|company|pm|assignee|recordedBy|topic|text|blocker)?:'((?:[^'\\]|\\.)*)'/g;
const WANTED = new Set(['name', 'initials', 'org', 'role', 'company', 'topic', 'text', 'blocker']);

let done = 0, kept = 0, partial = [];
s = s.replace(FIELDS, (all, field, val) => {
  if (!field || !WANTED.has(field)) return all;
  if (!HE.test(val)) return all;
  if (EXCLUDE.has(val)) { kept++; return all; }
  const out = val.replace(RX, m => Object.prototype.hasOwnProperty.call(DICT, m) ? DICT[m] : m);
  if (out === val || out.indexOf("'") !== -1) { if (out === val) partial.push(field + '=' + val); return all; }
  done++;
  return field + ":'" + out + "'";
});

fs.writeFileSync(FILE, s);
console.log('translated ' + done + ', kept ' + kept + ' excluded');
if (partial.length) console.log('no dictionary entry for: ' + partial.slice(0, 12).join(' | '));
