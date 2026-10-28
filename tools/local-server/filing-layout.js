'use strict';
/* The publish layout of a project: where SENT and UPDATED files go inside the project's folder, as a chain of levels
   (a folder per file type, per year, per day), each with a name pattern, and the type list that names the type
   folders. Pure: no file, no network, no other module. filing-plan.js builds the paths; filing.js keeps the layout in
   the project's map (map.publish) and the office's type list in filing.json (office.types).
   Spec: docs/superpowers/specs/2026-10-28-publish-layout-design.md */

const OFFICE_TYPES = [
  { name: 'PDF', ext: ['pdf'] },
  { name: 'DWG', ext: ['dwg', 'zip'] },
  { name: 'DWF', ext: ['dwf'] },
  { name: 'DOCS', ext: [], rest: true }
];
const KINDS = ['type', 'year', 'day'];
const NEEDS = { type: ['{type}'], year: ['{yyyy}'], day: ['{yyyy}', '{mm}', '{dd}'] };
const SAMPLE = { code: 'X', type: 'PDF', yyyy: '2026', mm: '01', dd: '02' };
// characters a Windows folder name cannot hold (the backslash by its code: no escape sequences in this file)
const BAD = new Set(['/', ':', '*', '?', '"', '<', '>', '|', String.fromCharCode(92)]);
const lc = s => String(s == null ? '' : s).toLowerCase();

/* a single folder name Windows accepts: not empty, at most 150 characters, no control or reserved character, not
   only dots, not ending in a dot or a space */
function okName(s) {
  const v = String(s == null ? '' : s);
  if (!v || v.length > 150) return false;
  if ([...v].some(c => BAD.has(c) || c.charCodeAt(0) < 32)) return false;
  if ([...v].every(c => c === '.')) return false;
  return !v.endsWith('.') && !v.endsWith(' ');
}
/* the day folder's description as typed in the window: reserved characters dropped, at most 60 characters, no dot or
   space at its end; '' when nothing is left */
function cleanDesc(v) {
  let s = [...String(v == null ? '' : v)].filter(c => !BAD.has(c) && c.charCodeAt(0) >= 32).join('').trim();
  s = [...s].slice(0, 60).join('');
  while (s.endsWith('.') || s.endsWith(' ')) s = s.slice(0, -1);
  return s;
}
/* a pattern with its tokens filled in: {code} {type} {yyyy} {mm} {dd} */
function fill(pattern, v) {
  let s = String(pattern || '');
  for (const k of ['code', 'type', 'yyyy', 'mm', 'dd']) s = s.split('{' + k + '}').join(v[k] == null ? '' : String(v[k]));
  return s;
}
/* a type list: [{ name, ext: [..], rest? }], exactly one rest type (every extension not listed), names folder names of
   at most 20 characters and unique without case, extensions in lower case without a dot and in one type only.
   null when it breaks a rule */
function cleanTypes(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 12) return null;
  const names = new Set(), exts = new Set(), out = [];
  let rests = 0;
  for (const t of raw) {
    if (!t || typeof t !== 'object') return null;
    const name = String(t.name == null ? '' : t.name).trim();
    if (!okName(name) || name.length > 20 || names.has(lc(name))) return null;
    names.add(lc(name));
    const ext = [];
    for (const e of t.rest === true ? [] : Array.isArray(t.ext) ? t.ext : []) {
      let x = lc(String(e == null ? '' : e).trim());
      while (x.startsWith('.')) x = x.slice(1);
      if (!x) continue;
      if (!okName(x) || x.length > 10) return null;
      if (ext.includes(x)) continue;
      if (exts.has(x)) return null;
      exts.add(x);
      ext.push(x);
    }
    if (t.rest === true) { rests++; out.push({ name, ext: [], rest: true }); } else out.push({ name, ext });
  }
  return rests === 1 ? out : null;
}
/* the type a file name falls under: the type listing its extension, else the rest type */
function typeOfName(name, types) {
  const n = String(name || '');
  const dot = n.lastIndexOf('.');
  const ext = dot > 0 ? lc(n.slice(dot + 1)) : '';
  const hit = ext && types.find(t => !t.rest && t.ext.includes(ext));
  if (hit) return hit.name;
  const rest = types.find(t => t.rest);
  return rest ? rest.name : 'DOCS';
}
/* a target's levels: at most 4, each kind once, its pattern holding its tokens and a folder name once filled.
   { levels } or { error: <index of the first bad level> } */
function cleanLevels(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 4) return { error: 4 };
  const seen = new Set(), levels = [];
  for (let i = 0; i < list.length; i++) {
    const x = list[i] && typeof list[i] === 'object' ? list[i] : {};
    const kind = KINDS.includes(x.kind) ? x.kind : null;
    const pattern = typeof x.pattern === 'string' ? x.pattern.trim() : '';
    const good = kind && !seen.has(kind) && pattern && pattern.length <= 120 && NEEDS[kind].every(t => pattern.includes(t)) && okName(fill(pattern, SAMPLE));
    if (!good) return { error: i };
    seen.add(kind);
    levels.push({ kind, pattern });
  }
  return { levels };
}
/* the project's publish layout as saved: { sent: {base, levels}, updated: {base, levels}, types: [..] | null }.
   relPath: filing-ai's (a path inside the project, '' for none, null when it leaves it). { publish } or
   { error: 'layout', target: 'sent' | 'updated' | 'types', level } */
function cleanPublish(raw, relPath) {
  if (raw == null) return { publish: null };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'layout', target: 'sent', level: -1 };
  const out = {};
  for (const key of ['sent', 'updated']) {
    const t = raw[key] && typeof raw[key] === 'object' ? raw[key] : {};
    const lv = cleanLevels(t.levels);
    if (lv.error != null) return { error: 'layout', target: key, level: lv.error };
    out[key] = { base: relPath(t.base) || '', levels: lv.levels };
  }
  if (raw.types == null) out.types = null;
  else {
    out.types = cleanTypes(raw.types);
    if (!out.types) return { error: 'layout', target: 'types', level: -1 };
  }
  return { publish: out };
}

const leafOf = p => p.slice(p.lastIndexOf('/') + 1);
// the folders directly inside dir
const kids = (tree, dir) => tree.filter(p => lc(p).startsWith(lc(dir) + '/') && !p.slice(dir.length + 1).includes('/'));
const DATE = /([0-9]{4}),([0-9]{2}),([0-9]{2})/;
const SEP = ['-', '_', ' ', ','];
/* the earliest type name in text as a whole word (between separators or the ends): the text with {type} in its
   place, or null */
function withTypeToken(text, names) {
  const up = text.toUpperCase();
  let best = null;
  for (const n of names) {
    const N = n.toUpperCase();
    let i = up.indexOf(N);
    while (i >= 0) {
      const before = i === 0 || SEP.includes(text[i - 1]);
      const after = i + N.length === text.length || SEP.includes(text[i + N.length]);
      if (before && after) { if (!best || i < best.i) best = { i, len: N.length }; break; }
      i = up.indexOf(N, i + 1);
    }
  }
  return best ? text.slice(0, best.i) + '{type}' + text.slice(best.i + best.len) : null;
}
// the start of the last year (19xx or 20xx between non-digits) in text, or -1
function lastYear(text) {
  const dig = c => c >= '0' && c <= '9';
  for (let i = text.length - 4; i >= 0; i--) {
    const w = text.slice(i, i + 4);
    if (!(w.startsWith('19') || w.startsWith('20')) || ![...w].every(dig)) continue;
    if ((i > 0 && dig(text[i - 1])) || (i + 4 < text.length && dig(text[i + 4]))) continue;
    return i;
  }
  return -1;
}
/* what one folder name says: { kind, pattern } or null. A date first, found on the raw name (YYYY,MM,DD — what
   follows it is a description or a number and is not part of the pattern; a type name counts only before it), then
   the last year, then a type name; a type name inside a date or a year name becomes {type} too */
function readName(leaf, names) {
  const d = DATE.exec(leaf);
  if (d) {
    const head = leaf.slice(0, d.index);
    return { kind: 'day', pattern: (withTypeToken(head, names) || head) + '{yyyy},{mm},{dd}' };
  }
  const typed = withTypeToken(leaf, names);
  const base = typed || leaf;
  const y = lastYear(base);
  if (y >= 0) return { kind: 'year', pattern: base.slice(0, y) + '{yyyy}' + base.slice(y + 4) };
  if (typed) return { kind: 'type', pattern: typed };
  return null;
}
/* The levels a SENT or UPDATED folder shows, read from the tree under base: at each level, the kind and pattern most
   common among its folders (a kind already found is skipped); then down into the fullest of the folders with that
   pattern (the most folders under it in the tree; on a tie the last by name), so an empty sibling does not cut the
   layout short. Stops at a day level with no type folders under it, after 4 levels, or where nothing is recognized.
   null when nothing is. */
function detectLayout(tree, base, types) {
  const names = (types || []).map(t => t.name);
  const list = (tree || []).filter(Boolean);
  let dir = String(base || '');
  while (dir.endsWith('/')) dir = dir.slice(0, -1);
  const levels = [], used = new Set();
  const size = p => list.filter(q => lc(q).startsWith(lc(p) + '/')).length;
  for (let depth = 0; depth < 4 && dir; depth++) {
    const counts = new Map();
    for (const p of kids(list, dir)) {
      const r = readName(leafOf(p), names);
      if (!r || used.has(r.kind)) continue;
      const k = r.kind + '|' + r.pattern;
      const c = counts.get(k) || { r, paths: [] };
      c.paths.push(p);
      counts.set(k, c);
    }
    if (!counts.size) break;
    const best = [...counts.values()].sort((x, y) => y.paths.length - x.paths.length)[0];
    levels.push(best.r);
    used.add(best.r.kind);
    let next = null, most = -1;
    for (const p of best.paths.slice().sort()) { const n = size(p); if (n >= most) { next = p; most = n; } }
    dir = next;
  }
  return levels.length ? levels : null;
}

module.exports = { OFFICE_TYPES, KINDS, NEEDS, okName, cleanDesc, fill, cleanTypes, typeOfName, cleanLevels, cleanPublish, detectLayout };
