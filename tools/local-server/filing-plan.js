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

module.exports = { autoSlots };
