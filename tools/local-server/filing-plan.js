'use strict';
/* Filing without Claude: the plans the export inbox window and the Outlook pane build in code, from the project's
   saved folder map (map.slots and its areas), its real tree (read by the helper on the PC) and the person's choices.
   Each plan has the shape Claude's plans have and goes through the same checks (sanitizeInboxPlan /
   sanitizeReceivePlan), so the PC runs it exactly as it runs Claude's. Claude stays behind "הצע".
   Spec: docs/superpowers/specs/2026-10-26-filing-without-ai-design.md */
const ai = require('./filing-ai');
const L = require('./filing-layout');

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

/* The map's stored slots (map.slots) with the convention's finds (autoSlots) where nothing is stored: a stored folder
   wins, and its "together / by type" with it. */
function withAuto(stored, auto) {
  const s = stored || {}, a = auto || {};
  return { sent: s.sent || a.sent || '', sentSplit: s.sent ? s.sentSplit !== false : a.sentSplit !== false, updated: s.updated || a.updated || '' };
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

const VERSION = /^(.*)-(v)(\d{1,4})$/i; // as filing-ai's VERSION (and the PC's), with the v kept as written
const isVersion = p => VERSION.test(leafOf(p)) && !/@ver/i.test(leafOf(p));
// a consultant's short name, as receiveOptions shows it: the folder's name without the project code in front
const shortOf = (folder, code) => { const l = leafOf(folder); return code && lc(l).startsWith(lc(code) + '-') && l.length > code.length + 1 ? l.slice(code.length + 1) : l; };

/* Where a consultant's next plan version goes: its …-plans folder (or the consultant's folder itself when the versions
   sit there), the next name after the highest …-vNN there (same name, same v, at least the same digits), the version
   it follows (prev) and the @ver folder next to the versions (ver; verName: the one to make when there is none).
   No versions but other folders there: the name is the person's to type (editable), suggested by the convention.
   Nothing yet: <code>-<consultant>-plans/…-v01, the plans folder made too (make). */
function nextVersion(tree, folder, code) {
  const plansDir = kids(tree, folder).find(p => /-plans$/i.test(leafOf(p))) || null;
  let dir = plansDir;
  let versions = plansDir ? kids(tree, plansDir).filter(isVersion) : [];
  if (!versions.length && kids(tree, folder).some(isVersion)) { dir = folder; versions = kids(tree, folder).filter(isVersion); }
  if (!dir) {
    const conv = `${pre(code)}${shortOf(folder, code)}-plans`;
    return { dir: `${folder}/${conv}`, make: true, name: `${conv}-v01`, editable: false, prev: '', ver: '', verName: '' };
  }
  const ver = kids(tree, dir).find(p => /@ver/i.test(leafOf(p))) || '';
  if (!versions.length) {
    const others = kids(tree, dir).filter(p => !/@ver/i.test(leafOf(p)));
    return { dir, make: false, name: `${leafOf(dir)}-v01`, editable: others.length > 0, prev: '', ver, verName: '' };
  }
  // versions named like the folder are the line; others (an old naming) count only when none is
  const all = versions.map(p => ({ p, m: VERSION.exec(leafOf(p)) }));
  const own = all.filter(x => lc(x.m[1]) === lc(leafOf(dir)));
  const top = (own.length ? own : all).sort((a, b) => Number(b.m[3]) - Number(a.m[3]))[0];
  const num = String(Number(top.m[3]) + 1).padStart(top.m[3].length, '0');
  return { dir, make: false, name: `${top.m[1]}-${top.m[2]}${num}`, editable: false, prev: top.p, ver, verName: ver ? leafOf(ver) : `${top.m[1]}-@ver` };
}

/* The receive plan, from who sent the files (from: { kind: 'consultant' | 'other', folder, name }) and, for a consultant,
   doc 'plan' (a new version folder) or 'doc' (its …-docs folder, made when missing); another party's files go into its
   folder as it is. versionName: the typed name, used only where the name is the person's to choose; toVer: move the
   current version to @ver (undefined: when an @ver folder is there). { plan, version?, problem? } — problem names what
   is missing ('no_from', 'no_consultant', 'consultant_folder', 'no_doc', 'other_folder', 'name'), and then nothing is
   filed. Nothing is replaced; the only move is the current version into the @ver next to it. */
const nameOk = n => { const r = ai.relPath(n); return !!r && !r.includes('/'); };
function receivePlan({ tree, code, from, doc, versionName, toVer, files }) {
  const list = (tree || []).filter(Boolean);
  const plan = (steps, to) => ai.sanitizeReceivePlan({ steps, files: (files || []).map(f => ({ name: f.name, dests: to ? [{ path: to }] : [] })) }, list, files);
  const none = problem => ({ plan: plan([], null), problem });
  if (!from) return none('no_from');
  const folder = from.folder ? inTree(list, from.folder) : null;
  if (from.kind === 'other') return folder ? { plan: plan([], folder) } : none('other_folder');
  if (!folder) return none(from.folder || from.name ? 'consultant_folder' : 'no_consultant');
  if (doc === 'doc') {
    const docs = kids(list, folder).find(p => /-docs$/i.test(leafOf(p)));
    const to = docs || `${folder}/${pre(code)}${shortOf(folder, code)}-docs`;
    return { plan: plan(docs ? [] : [{ op: 'mkdir', path: to }], to) };
  }
  if (doc !== 'plan') return none('no_doc');
  const v = nextVersion(list, folder, code);
  const typed = String(versionName || '').trim();
  const name = v.editable && typed ? typed : v.name;
  const version = { name: v.name, editable: v.editable, prev: v.prev, hasVer: !!v.ver };
  if (!nameOk(name) || inTree(list, `${v.dir}/${name}`)) return { ...none('name'), version: { ...version, toVer: false } };
  const to = `${v.dir}/${name}`;
  const steps = [];
  if (v.make) steps.push({ op: 'mkdir', path: v.dir });
  steps.push({ op: 'mkdir', path: to });
  const wanted = !!v.prev && !v.editable && (toVer === undefined ? !!v.ver : toVer === true);
  // the sanitizer drops a move into a name already there, or to a name that is no version any more (v9999 -> v10000)
  const verFolder = v.ver || `${v.dir}/${v.verName}`;
  const blocked = wanted && !!v.ver && !!inTree(list, `${v.ver}/${leafOf(v.prev)}`);
  const move = wanted && !blocked && VERSION.test(name);
  if (move) {
    if (!v.ver) steps.push({ op: 'mkdir', path: verFolder });
    steps.push({ op: 'move', from: v.prev, to: `${verFolder}/${leafOf(v.prev)}` });
  }
  const out = plan(steps, to);
  return { plan: out, version: { ...version, toVer: out.steps.some(x => x.op === 'move'), ...(blocked ? { verBlocked: true } : {}) } };
}

/* The consultant the sender is: the register contact with the sender's address, and the consultant folder that contact
   was matched to (receiveOptions); -1 when none. */
function senderConsultant(options, contacts, email) {
  const e = lc(email).trim();
  if (!e || !options || !Array.isArray(options.consultants)) return -1;
  const c = (contacts || []).find(x => (x.emails || []).some(y => lc(y).trim() === e));
  if (!c) return -1;
  const text = lc(ai.contactText(c));
  return options.consultants.findIndex(x => x.folder && x.contact && lc(x.contact) === text);
}

/* The publish layout to build with, each target on its own: SENT (or UPDATED) as saved in the map (map.publish) when
   its base is saved; else the one the tree shows under the map's SENT / UPDATED folder (filing-layout.detectLayout;
   that folder found by the convention's names when the map has none), else the convention (year, day, then a folder
   per type unless the map says "together"). An UPDATED folder whose name ends in a type name (…-updated-PDF, from
   before layouts) stands for its parent with a level per type.
   { layout: { sent, updated }, from } — from describes SENT, the target the window's note is about: 'saved' when SENT
   is the saved one, else 'detected' or 'convention' (a saved UPDATED alone does not make it 'saved'). */
const CONVENTION_SENT = [{ kind: 'year', pattern: '{code}-pub-sent-{yyyy}' }, { kind: 'day', pattern: '{code}-pub-{yyyy},{mm},{dd}' }, { kind: 'type', pattern: '{type}' }];
function layoutFor(map, tree, types) {
  const list = (tree || []).filter(Boolean);
  const saved = (map && map.publish) || {};
  const part = x => (x && typeof x === 'object' ? { base: x.base || '', levels: Array.isArray(x.levels) ? x.levels : [] } : { base: '', levels: [] });
  const savedSent = part(saved.sent), savedUpd = part(saved.updated);
  const s = (map && map.slots) || {};
  let auto = null;
  const autoOf = () => auto || (auto = autoSlots(list).slots);
  let sent, from;
  if (savedSent.base) { sent = savedSent; from = 'saved'; } else {
    const sentBase = s.sent || autoOf().sent;
    let levels = sentBase ? L.detectLayout(list, inTree(list, sentBase) || sentBase, types) : null;
    from = levels ? 'detected' : 'convention';
    if (!levels) levels = s.sent && s.sentSplit === false ? CONVENTION_SENT.slice(0, 2) : CONVENTION_SENT.slice();
    sent = { base: sentBase, levels };
  }
  let updated = savedUpd;
  if (!savedUpd.base) {
    const upd = s.updated || autoOf().updated;
    updated = { base: upd, levels: [] };
    if (upd && upd.includes('/')) {
      const leaf = leafOf(upd);
      const hit = types.map(t => t.name).find(n => ['-', '_', ' '].some(sep => lc(leaf).endsWith(sep + lc(n))));
      if (hit) updated = { base: upd.slice(0, upd.lastIndexOf('/')), levels: [{ kind: 'type', pattern: leaf.slice(0, leaf.length - hit.length) + '{type}' }] };
    }
  }
  return { layout: { sent, updated }, from };
}

/* The publish plan from a layout: each file into SENT (base, then a folder per level, the day's with " - <desc>" when
   one was typed; existing folders of the same name used as they are, the missing ones made once, in order) and into
   UPDATED (its levels, replacing a file of the same name — the PC moves the old one to @ver). typeOf { n: type }
   changes one file's type; dests { n: path } puts one file's SENT copy into a folder of the tree instead (not in the
   tree: problem 'dest'). Returns { plan, days, slotsMissing? } — days: the descriptions of the date's day folders that
   are there already, of every type, for the window to offer. */
function publishPlan({ layout, types, tree, code, files, sent, updated, date, desc, typeOf = {}, dests = {} }) {
  const list = (tree || []).filter(Boolean);
  const [yyyy, mm, dd] = date.split('-');
  const missing = {};
  const baseOf = (on, key) => {
    if (!on) return null;
    const b = layout[key] && layout[key].base;
    if (!b) { missing[key] = 'unmapped'; return null; }
    const p = inTree(list, b);
    if (!p) missing[key] = 'gone';
    return p;
  };
  const sentBase = baseOf(sent, 'sent'), updBase = baseOf(updated, 'updated');
  const steps = [], made = new Set();
  const mk = p => { if (!inTree(list, p) && !made.has(lc(p))) { made.add(lc(p)); steps.push({ op: 'mkdir', path: p }); } };
  const walk = (base, levels, type, withDesc) => {
    let dir = base;
    for (const lv of levels) {
      let name = L.fill(lv.pattern, { code, type, yyyy, mm, dd });
      if (lv.kind === 'day' && withDesc && desc) name += ' - ' + desc;
      const p = dir + '/' + name;
      dir = inTree(list, p) || p;
      mk(dir);
    }
    return dir;
  };
  const days = new Set();
  if (sentBase) for (const t of types) {
    let dir = sentBase;
    for (const lv of layout.sent.levels) {
      const name = L.fill(lv.pattern, { code, type: t.name, yyyy, mm, dd });
      if (lv.kind === 'day') {
        for (const k of kids(list, dir)) { const l = leafOf(k); if (lc(l).startsWith(lc(name) + ' - ')) days.add(l.slice(name.length + 3)); }
        break;
      }
      const p = inTree(list, dir + '/' + name);
      if (!p) break;
      dir = p;
    }
  }
  const raw = { steps, files: [] }, kinds = [], problems = {}, updDirs = [];
  for (const f of files || []) {
    const type = typeOf[f.n] && types.some(t => t.name === typeOf[f.n]) ? typeOf[f.n] : L.typeOfName(f.name, types);
    const ds = [];
    if (sent && dests[f.n] != null) {
      const p = inTree(list, dests[f.n]);
      if (p) ds.push({ path: p, replace: false }); else problems[f.n] = 'dest';
    } else if (sentBase) ds.push({ path: walk(sentBase, layout.sent.levels, type, true), replace: false });
    if (updBase) {
      const p = walk(updBase, layout.updated.levels, type, false);
      ds.push({ path: p, replace: true });
      if (!updDirs.some(x => lc(x) === lc(p))) updDirs.push(p);
    }
    raw.files.push({ name: f.name, dests: ds });
    kinds.push(type);
  }
  const plan = ai.sanitizeInboxPlan(raw, list, files, updDirs, null);
  plan.files.forEach((f, i) => {
    f.type = kinds[i];
    if (problems[f.n]) f.problem = problems[f.n];
    // SENT and UPDATED in one folder are one dest after sanitizing: count the distinct folders asked for
    else if (f.dests.length < new Set(raw.files[i].dests.map(d => lc(d.path))).size) f.problem = 'steps';
  });
  return { plan, days: [...days].sort(), ...(Object.keys(missing).length ? { slotsMissing: missing } : {}) };
}

module.exports = { autoSlots, withAuto, sentFolder, inboxPlan, nextVersion, receivePlan, senderConsultant, layoutFor, publishPlan };
