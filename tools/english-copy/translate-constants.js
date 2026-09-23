'use strict';
/* Translates the remaining seed CONSTANTS in project_hub.en.html.
 *
 * These feed the Home, My-tasks and Portfolio views, and the app derives avatar
 * initials and status letters from them in code -- so the runtime translator,
 * which only rewrites rendered text, can never reach them.
 *
 * Only the regions listed in REGIONS are touched, and only quoted literals
 * inside them. Values in EXCLUDE are compared with === or used as object keys
 * and must survive byte-identical.
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

const REGIONS = ['PORTFOLIO_DATA', 'OFFICE_STAFF', 'MY_PROJECTS', 'MILESTONES_BY_PROJECT',
                 'PORTFOLIO_PHASES', 'CROSS_CUTTING_ITEMS', 'PROJ_TRACKS', 'NAV',
                 'ALL_PMS', 'ALL_STAGES', 'ALL_PRIOS', 'DISC_ORDER', 'SUB_ITEMS', 'ITEMS'];

const HE = /[\u0590-\u05FF]/;
const keys = Object.keys(DICT).sort((a, b) => b.length - a.length);
const RX = new RegExp('(?<![\\u0590-\\u05FF])(?:' +
  keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') +
  ')(?![\\u0590-\\u05FF])', 'g');

const FILE = 'project_hub.en.html';
let s = fs.readFileSync(FILE, 'utf8');

/* Find `const NAME=[` and walk to its balanced closing bracket, so nested
   objects and arrays inside the constant are included and nothing beyond it is. */
function regionOf(src, name) {
  const start = src.indexOf('const ' + name + '=[');
  if (start === -1) return null;
  let i = src.indexOf('[', start), depth = 0, inStr = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) return [start, i + 1]; }
  }
  return null;
}

let total = 0, skipped = 0;
for (const name of REGIONS) {
  const r = regionOf(s, name);
  if (!r) { console.log('  (no ' + name + ')'); continue; }
  const [a, b] = r;
  let n = 0;
  const body = s.slice(a, b).replace(/'((?:[^'\\]|\\.)*)'/g, (all, val) => {
    if (!HE.test(val)) return all;
    if (EXCLUDE.has(val)) { skipped++; return all; }
    const out = val.replace(RX, m => Object.prototype.hasOwnProperty.call(DICT, m) ? DICT[m] : m);
    if (out === val || out.indexOf("'") !== -1) return all;
    n++;
    return "'" + out + "'";
  });
  s = s.slice(0, a) + body + s.slice(b);
  total += n;
  console.log('  ' + name + ': ' + n + ' translated');
}

fs.writeFileSync(FILE, s);
console.log('total ' + total + ' translated, ' + skipped + ' excluded');
