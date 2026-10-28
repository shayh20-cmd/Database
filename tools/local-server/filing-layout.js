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
  let s = [...String(v == null ? '' : v)].filter(c => !BAD.has(c) && c.charCodeAt(0) >= 32).join('').trim().slice(0, 60);
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
    for (const e of Array.isArray(t.ext) ? t.ext : []) {
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

module.exports = { OFFICE_TYPES, KINDS, NEEDS, okName, cleanDesc, fill, cleanTypes, typeOfName, cleanLevels, cleanPublish };
