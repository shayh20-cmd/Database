#!/usr/bin/env node
'use strict';
/* Reports Hebrew that would still render untranslated in English mode.
   Zero dependencies. Run from the repo root:  node tools/i18n-extract.js

   IMPORTANT: the engine translates by SUBSTRING, so a literal like
   "תכנית קומות רלוונטיות 1:100" is fully covered by the shorter key
   "תכנית קומות רלוונטיות". Checking for exact dictionary keys instead
   reports ~330 false gaps against ~12 real ones. Do not "simplify" this
   to a key lookup. */

const fs = require('fs');
const path = require('path');

const HEBREW = /[֐-׿]/;
const FILES = ['home_dashboard.html', 'planning_dashboard.html', 'project_hub.html', 'project_hub_01.html'];
// Strings deliberately absent from the dictionary (seed data, dev-only, single letters).
const IGNORE = new Set((() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-ignore.json'), 'utf8')); } catch { return []; } })());
const DICT = 'i18n-dict.js';

/* Decode the JS escapes a source literal carries, so extracted text matches the
   DECODED dictionary keys. 39 keys contain a real `"` written as \" in source;
   without this they could never match. */
const SIMPLE = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };
function unescapeLiteral(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') { out += raw[i]; continue; }
    const c = raw[++i];
    if (c === undefined) break;
    if (c === 'u') {
      if (raw[i + 1] === '{') {
        const end = raw.indexOf('}', i);
        out += String.fromCodePoint(parseInt(raw.slice(i + 2, end), 16));
        i = end;
      } else {
        out += String.fromCharCode(parseInt(raw.substr(i + 1, 4), 16));
        i += 4;
      }
    } else if (c === 'x') {
      out += String.fromCharCode(parseInt(raw.substr(i + 1, 2), 16));
      i += 2;
    } else if (Object.prototype.hasOwnProperty.call(SIMPLE, c)) {
      out += SIMPLE[c];
    } else {
      out += c; /* \" \' \` \\ and any other escaped char */
    }
  }
  return out;
}

/* Walks character by character so quotes nested inside a differently quoted
   literal ("שלום" within '...') don't terminate it early. A regex cannot do
   this reliably across three quote styles with escapes. */
function extractHebrewLiterals(source) {
  const found = [];
  const seen = new Set();
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      let raw = '';
      while (j < source.length) {
        if (source[j] === '\\') { raw += source[j] + source[j + 1]; j += 2; continue; }
        if (source[j] === quote) break;
        if (source[j] === '\n' && quote !== '`') { raw = null; break; }
        raw += source[j];
        j++;
      }
      if (raw === null) { i++; continue; }  /* unterminated: resume past the quote */
      const text = unescapeLiteral(raw);
      if (HEBREW.test(text) && !seen.has(text)) { seen.add(text); found.push(text); }
      i = j + 1;
      continue;
    }
    i++;
  }
  return found;
}

/* Evaluate i18n-dict.js in a throwaway context to get the real map. The file is
   our own source, and evaluating it is far more robust than regex-scraping keys
   (which breaks on ternaries like `cond ? 'עברית' : 'x'`, where the string is
   also followed by a colon). */
function loadDict(dictSource) {
  const fn = new Function('window', dictSource + '\nreturn window.I18N_HE_EN;');
  return fn({}) || {};
}

/* Mirrors i18n.js buildRegex()/tr() exactly: longest key first, with Hebrew
   boundary lookarounds so a key never matches inside a larger Hebrew word.
   If the engine's matching ever changes, change it here too. */
function buildTranslator(dict) {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  if (!keys.length) return s => s;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(
    '(?<![\\u0590-\\u05FF])(?:' + keys.map(esc).join('|') + ')(?![\\u0590-\\u05FF])',
    'g'
  );
  return s => s.replace(rx, m => (Object.prototype.hasOwnProperty.call(dict, m) ? dict[m] : m));
}

/* A literal is a gap only if Hebrew SURVIVES translation. `residual` is the
   post-translation text, which shows exactly which fragment is still missing. */
function findUntranslated(sources, dict) {
  const tr = buildTranslator(dict);
  const out = [];
  for (const { file, text } of sources) {
    const items = [];
    for (const literal of extractHebrewLiterals(text)) {
      const residual = tr(literal);
      if (HEBREW.test(residual)) items.push({ literal, residual });
    }
    if (items.length) out.push({ file, items });
  }
  return out;
}

function main() {
  const root = process.cwd();
  const dictPath = path.join(root, DICT);
  if (!fs.existsSync(dictPath)) {
    console.error('Cannot find ' + DICT + ' — run this from the repo root.');
    process.exit(2);
  }
  const dict = loadDict(fs.readFileSync(dictPath, 'utf8'));
  const sources = FILES
    .filter(f => fs.existsSync(path.join(root, f)))
    .map(f => ({ file: f, text: fs.readFileSync(path.join(root, f), 'utf8') }));

  const gaps = findUntranslated(sources, dict).map(g => ({ ...g, items: g.items.filter(i => !IGNORE.has(i.literal)) })).filter(g => g.items.length);
  const total = gaps.reduce((n, g) => n + g.items.length, 0);

  console.log('Dictionary: ' + Object.keys(dict).length + ' entries');
  if (!total) {
    console.log('Nothing renders as Hebrew in English mode. All covered.');
    return;
  }
  console.log('\n' + total + ' literal(s) still contain Hebrew after translation.\n');
  console.log('"residual" is what would actually render in English mode — the Hebrew');
  console.log('left in it is the real gap. Some hits are non-UI (Hebrew code comments,');
  console.log('minified template-literal fragments) — skip those.\n');
  console.log('Append genuine strings to the last Object.assign chunk in ' + DICT + ':\n');
  for (const g of gaps) {
    console.log('/* ' + g.file + ' */');
    for (const it of g.items) {
      if (it.residual !== it.literal) console.log('  // renders as: ' + JSON.stringify(it.residual));
      console.log('  ' + JSON.stringify(it.literal) + ': "",');
    }
    console.log('');
  }
  process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { extractHebrewLiterals, unescapeLiteral, loadDict, buildTranslator, findUntranslated };
