'use strict';
/* Filing without Claude: the plans the export inbox window and the Outlook pane build in code, from the project's
   saved folder map (map.slots and its areas), its real tree (read by the helper on the PC) and the person's choices.
   Each plan has the shape Claude's plans have and goes through the same checks (sanitizeInboxPlan /
   sanitizeReceivePlan), so the PC runs it exactly as it runs Claude's. Claude stays behind "הצע".
   Spec: docs/superpowers/specs/2026-10-26-filing-without-ai-design.md */
const ai = require('./filing-ai');

const lc = s => String(s == null ? '' : s).toLowerCase();
const leafOf = p => p.slice(p.lastIndexOf('/') + 1);
// the folders directly inside dir ('' is the project's top)
const kids = (tree, dir) => tree.filter(p => dir === '' ? !p.includes('/') : lc(p).startsWith(lc(dir) + '/') && !p.slice(dir.length + 1).includes('/'));
// a folder of the tree, in the tree's own spelling (any case), or null
const inTree = (tree, p) => tree.find(t => lc(t) === lc(p)) || null;
const YEAR = /-sent-(\d{4})$/i;              // a year folder of the SENT archive: <code>-pub-sent-YYYY
const DAY = /(\d{4}),(\d{2}),(\d{2})$/;      // a day folder: <code>-pub-YYYY,MM,DD
const TYPES = ['PDF', 'DWG', 'RVT', 'DOCS'];

/* What the office's convention (Folder Manager) finds in a project's tree, for the map: the SENT archive (…-pub-@sent),
   the UPDATED folder of PDFs (…-pub-updated-PDF), whether SENT is split by file type (its day folders hold PDF / DWG /
   RVT / DOCS folders; split when there are no day folders yet), and the areas by their usual names, at the top or one
   level down. Only what is found is returned; the page fills empty fields with it and saves nothing by itself. */
const AREA_NAMES = { publish: ['publish'], consultants: ['consultants'], receive: ['recieve', 'receive'], permit: ['permit'], exec: ['exec'] };
function autoSlots(tree) {
  const list = (tree || []).filter(Boolean);
  const ending = suffix => list.find(p => lc(leafOf(p)).endsWith(suffix)) || '';
  const sent = ending('-pub-@sent');
  const updated = ending('-pub-updated-pdf');
  let sentSplit = true;
  if (sent) {
    const under = kids(list, sent);
    const days = [...under.filter(p => DAY.test(leafOf(p))), ...under.filter(p => YEAR.test(leafOf(p))).flatMap(y => kids(list, y).filter(p => DAY.test(leafOf(p))))];
    if (days.length) sentSplit = days.some(d => kids(list, d).some(k => TYPES.includes(leafOf(k).toUpperCase())));
  }
  const areas = {};
  for (const [k, names] of Object.entries(AREA_NAMES)) {
    const p = list.find(x => x.split('/').length <= 2 && names.includes(lc(leafOf(x))));
    if (p) areas[k] = [p];
  }
  return { slots: { sent, sentSplit, updated }, areas };
}

const pre = code => (code ? code + '-' : '');
const typeOf = name => { const m = /\.([^.]+)$/.exec(name); const x = m ? m[1].toUpperCase() : ''; return x === 'PDF' || x === 'DWG' || x === 'RVT' ? x : 'DOCS'; };
const isPdf = name => /\.pdf$/i.test(name);

/* The day's folder in the SENT archive and the folders to make for it, in order. The year layer (<code>-pub-sent-YYYY)
   is used when the archive has year folders, or nothing yet (the convention); when its day folders sit right in it,
   they keep doing so. A day folder that is already there (any name ending in YYYY,MM,DD) is used as it is. */
function sentFolder(tree, sent, code, date) {
  const [y, m, d] = date.split('-');
  const want = `${y},${m},${d}`;
  const under = kids(tree, sent);
  const years = under.filter(p => YEAR.test(leafOf(p)));
  const mkdir = [];
  let parent = sent;
  if (years.length || !under.some(p => DAY.test(leafOf(p)))) {
    const year = years.find(p => YEAR.exec(leafOf(p))[1] === y);
    parent = year || `${sent}/${pre(code)}pub-sent-${y}`;
    if (!year) mkdir.push(parent);
  }
  const day = mkdir.length ? null : kids(tree, parent).find(p => leafOf(p).endsWith(want));
  const path = day || `${parent}/${pre(code)}pub-${want}`;
  if (!day) mkdir.push(path);
  return { path, mkdir };
}

/* The publish plan: SENT into the day's folder (a folder per file type when the map says so), UPDATED for PDFs only,
   replacing a file of the same name there (the PC moves the old one to @ver). { plan, slotsMissing? } — a chosen target
   whose folder is not mapped ('unmapped') or no longer in the tree ('gone') gets no dests, and is reported. */
function inboxPlan({ slots, tree, code, files, sent, updated, date }) {
  const list = (tree || []).filter(Boolean);
  const s = slots || {};
  const missing = {};
  const target = (on, key) => {
    if (!on) return null;
    if (!s[key]) { missing[key] = 'unmapped'; return null; }
    const p = inTree(list, s[key]);
    if (!p) missing[key] = 'gone';
    return p;
  };
  const sentRoot = target(sent, 'sent'), upd = target(updated, 'updated');
  const steps = [], made = new Set();
  const mk = p => { if (!made.has(lc(p)) && !inTree(list, p)) { made.add(lc(p)); steps.push({ op: 'mkdir', path: p }); } };
  const day = sentRoot ? sentFolder(list, sentRoot, code, date) : null;
  if (day) day.mkdir.forEach(mk);
  const raw = { steps, files: [] };
  for (const f of files || []) {
    const dests = [];
    if (day) {
      const typed = `${day.path}/${typeOf(f.name)}`;
      const to = s.sentSplit === false ? day.path : inTree(list, typed) || typed;
      mk(to);
      dests.push({ path: to, replace: false });
    }
    if (upd && isPdf(f.name)) dests.push({ path: upd, replace: true });
    raw.files.push({ name: f.name, dests });
  }
  const plan = ai.sanitizeInboxPlan(raw, list, files, upd ? [upd] : [], null);
  return { plan, ...(Object.keys(missing).length ? { slotsMissing: missing } : {}) };
}

module.exports = { autoSlots, sentFolder, inboxPlan };
