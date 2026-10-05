'use strict';
/* Project Hub as a Claude connector.

   Sign-in is OAuth 2.1 the way Claude expects it: Claude registers itself (dynamic client
   registration), sends the person to /oauth/authorize — which needs the same Microsoft
   session the page uses — and trades the code (PKCE) for a token. Every tool call then
   acts as that person, with that person's role and projects.

   /mcp speaks MCP over Streamable HTTP, answering each request with plain JSON (no
   streams, no sessions). The tools read and write the same JSON documents the page does,
   in one synchronous read-modify-write per change, so an open page merges the change on
   its next check like any colleague's save. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const ACCESS_TTL = 12 * 3600 * 1000;
const REFRESH_TTL = 90 * 24 * 3600 * 1000;
const CODE_TTL = 5 * 60 * 1000;
const PH01_ID = 'ph01';
const ROLE_RANK = { viewer: 0, editor: 1, admin: 2, superadmin: 3 };
const EV_STATUSES = {
  missing: 'חסר', progress: 'בעבודה', sent: 'נשלח', comments: 'יש הערות',
  response: 'בהתייחסות', update: 'עדכון', approved: 'מאושר'
};
// the task status an update implies (the page's getMostRecentEventStatus)
const EV_TO_STATUS = { progress: 'I', sent: 'I', response: 'I', comments: 'R', approved: 'C', missing: 'N' };

const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const rand = n => crypto.randomBytes(n).toString('base64url');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Hebrew-tolerant matching: no niqqud or quote marks, one space, and a "bare" form
   without ו/י so כתיב מלא and חסר meet (תאום / תיאום). */
const norm = s => String(s || '').normalize('NFKC').replace(/[֑-ׇ]/g, '').replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const bare = s => norm(s).replace(/[וי]/g, '');

class ToolError extends Error {}

module.exports = function createMcp(ctx) {
  const { DATA_DIR, STATIC_ROOT, SITE_MODE, APPS, PROJECTS_DIR, readJson, writeJsonAtomic, sendJson, readRequestBody } = ctx;
  const STORE_FILE = path.join(DATA_DIR, 'mcp_oauth.json');
  const REGISTRY = APPS['hub-projects'];

  /* ── the office as the page defines it: roster, default roles, built-in lists ── */
  let office = null;
  function officeData() {
    const file = path.join(STATIC_ROOT, 'project_hub_01.html');
    let st;
    try { st = fs.statSync(file); } catch (e) { throw new ToolError('Project Hub page not found on the server'); }
    if (office && office.mtime === st.mtimeMs) return office;
    const html = fs.readFileSync(file, 'utf8');
    const grab = re => {
      const m = html.match(re);
      if (!m) throw new ToolError('could not read ' + re.source.slice(6, 30) + ' from the page');
      return Function('"use strict";return (' + m[1] + ')')();
    };
    office = {
      mtime: st.mtimeMs,
      staff: grab(/const OFFICE_STAFF=(\[[\s\S]*?\]);/),
      roles: grab(/const DEFAULT_OFFICE_ROLES = (\{[\s\S]*?\});/),
      lists: {
        statuses: grab(/const STATUSES=(\[[\s\S]*?\]);/),
        priorities: grab(/const PRIORITIES=(\[[\s\S]*?\]);/),
        disciplines: grab(/const DISCIPLINES=(\[[\s\S]*?\]);/)
      }
    };
    return office;
  }

  /* ── who: a signed-in email (or, locally, the person at the machine) → staff, role ── */
  function identify(who, reg) {
    const off = officeData();
    const mail = (who.email || '').trim().toLowerCase();
    let staff = mail ? off.staff.find(s => (s.email || '').toLowerCase() === mail) : null;
    if (!staff && !mail) staff = off.staff.find(s => s.name === who.name) || null;
    const id = staff ? staff.id : 'ext:' + mail;
    const prof = (reg.staffProfiles || {})[id];
    const profName = prof ? [prof.firstName, prof.lastName].map(x => (x || '').trim()).filter(Boolean).join(' ') : '';
    const name = profName || (staff ? staff.name : who.name || mail);
    const role = { ...off.roles, ...(reg.officeRoles || {}) }[id] || 'editor';
    return { id, name, email: mail || null, role };
  }

  /* ── which projects: the page's rule (shared or own, then team membership unless admin) ── */
  const fileOf = id => id === PH01_ID ? APPS['project-hub-01'] : path.join(PROJECTS_DIR, id + '.json');
  function projectsFor(me, reg) {
    const ph = { id: PH01_ID, name: 'אולם ספורט לוד', code: 'PH01', color: '#2563EB', ...(reg.ph01 || {}) };
    const list = [ph, ...(reg.projects || []).filter(p => p.visibility === 'shared' || p.ownerId === me.id)];
    const admin = ROLE_RANK[me.role] >= ROLE_RANK.admin;
    return list.map(p => ({ id: p.id, name: p.name, code: p.code, file: fileOf(p.id) }))
      .filter(p => fs.existsSync(p.file))
      .filter(p => admin || (readJson(p.file).team || []).some(m => m.staffId === me.id));
  }
  function findProject(me, reg, ref) {
    const all = projectsFor(me, reg);
    if (!ref) throw new ToolError('Name the project (code, name or id). Available: ' + all.map(p => p.code + ' ' + p.name).join(' | '));
    const r = norm(ref);
    const exact = all.filter(p => p.id === ref || norm(p.code) === r || norm(p.name) === r);
    if (exact.length === 1) return exact[0];
    const loose = all.filter(p => bare(p.name).includes(bare(ref)) || bare(ref).includes(bare(p.code)) && bare(p.code).length >= 2);
    if (loose.length === 1) return loose[0];
    if (loose.length > 1) throw new ToolError(`"${ref}" matches more than one project: ` + loose.map(p => p.code + ' ' + p.name).join(' | ') + '. Ask which one.');
    throw new ToolError(`No project "${ref}" that you can open. Available: ` + all.map(p => p.code + ' ' + p.name).join(' | '));
  }

  /* ── a project's option lists: its own, else the office library's, in the project's order ── */
  function labelId(l) { let h = 7; for (const c of l) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'o' + h.toString(36); }
  function officeLists(reg) {
    const off = officeData();
    const fields = (reg.library && reg.library.fields) || [];
    const out = {};
    for (const [key, listKey] of [['__status', 'statuses'], ['__priority', 'priorities'], ['__discipline', 'disciplines']]) {
      const base = off.lists[listKey];
      const f = fields.find(x => x.builtinKey === key && (x.scope || 'office') === 'office');
      let next = f ? (f.options || []).map(o => typeof o === 'string' ? { id: labelId(o), label: o } : { id: o.id || (o.label ? labelId(o.label) : ''), label: o.label }).filter(o => o.label) : base;
      if (!next.length || listKey === 'statuses' && !base.every(b => next.some(n => n.id === b.id))) next = base;
      out[listKey] = next.map(o => ({ id: o.id, label: o.label }));
    }
    return out;
  }
  function projList(doc, key, reg) {
    if (doc[key]) return doc[key].map(o => ({ id: o.id, label: o.label }));
    const base = officeLists(reg)[key];
    const pref = doc.listPrefs && doc.listPrefs[key];
    if (!pref) return base;
    const hidden = new Set(pref.hidden || []);
    const ord = pref.order || [];
    return base.map((o, i) => ({ o: hidden.has(o.id) ? { ...o, hidden: true } : o, r: ord.indexOf(o.id) < 0 ? ord.length + i : ord.indexOf(o.id) }))
      .sort((a, b) => a.r - b.r).map(x => x.o);
  }
  function pickOption(list, ref, what) {
    if (ref == null || ref === '') return null;
    const r = norm(ref);
    const hit = list.find(o => norm(o.id) === r) || list.find(o => norm(o.label) === r) || list.find(o => bare(o.label) === bare(ref));
    if (!hit) throw new ToolError(`Unknown ${what} "${ref}". Options: ` + list.filter(o => !o.hidden).map(o => o.label).join(', '));
    return hit.id;
  }

  /* ── stages: the track › stage lists a task can live in ── */
  function stagesOf(doc) {
    const sheets = doc.sheets || [];
    const out = [];
    const home = sheets.find(s => s.type === 'list' && s.track == null);
    for (const t of doc.tracks || []) {
      for (const id of t.stageOrder || []) {
        const s = sheets.find(x => x.id === id && x.type === 'list');
        if (s && !out.some(o => o.id === s.id)) out.push({ id: s.id, name: s.name, track: t.label, groups: (s.groups || []).map(g => g.name) });
      }
    }
    for (const s of sheets) if (s.type === 'list' && !out.some(o => o.id === s.id)) out.push({ id: s.id, name: s.name, track: s.track == null ? 'מסלול תכנון' : String(s.track), groups: (s.groups || []).map(g => g.name) });
    return out.map(o => ({ ...o, default: !!home && o.id === home.id }));
  }
  function findStage(doc, ref) {
    const all = stagesOf(doc);
    if (!ref) {
      const d = all.find(s => s.default) || all[0];
      if (!d) throw new ToolError('This project has no task lists');
      return d;
    }
    const byId = all.find(s => s.id === ref);
    if (byId) return byId;
    const parts = String(ref).split(/\s*[›>/|]\s*/).filter(Boolean);
    const stageRef = parts[parts.length - 1];
    const trackRef = parts.length > 1 ? parts[0] : null;
    let hits = all.filter(s => bare(s.name) === bare(stageRef) && (!trackRef || bare(s.track).includes(bare(trackRef))));
    if (!hits.length) hits = all.filter(s => bare(s.name).includes(bare(stageRef)) && (!trackRef || bare(s.track).includes(bare(trackRef))));
    if (hits.length === 1) return hits[0];
    const list = all.map(s => s.track + ' › ' + s.name).join(' | ');
    if (hits.length > 1) throw new ToolError(`Stage "${ref}" is ambiguous; give it as "track › stage". Stages: ` + list);
    throw new ToolError(`No stage "${ref}". Stages: ` + list);
  }

  /* ── people on the project's team ── */
  function teamOf(doc) {
    const staff = officeData().staff;
    return (doc.team || []).filter(m => m.staffId).map(m => {
      const s = staff.find(x => x.id === m.staffId);
      return { id: m.staffId, name: (s && s.name) || m.name || m.staffId, role: m.role || (s && s.role) || '' };
    });
  }
  function pickPeople(doc, refs) {
    const team = teamOf(doc);
    return (refs || []).map(ref => {
      const hit = team.find(m => m.id === ref) || team.find(m => norm(m.name) === norm(ref)) || team.filter(m => bare(m.name).includes(bare(ref))).length === 1 && team.find(m => bare(m.name).includes(bare(ref)));
      if (!hit) throw new ToolError(`"${ref}" is not on this project's team. Team: ` + team.map(m => m.name).join(', '));
      return hit.id;
    });
  }

  /* ── tasks ── */
  const evChrono = evs => (evs || []).map((e, i) => ({ e, i })).sort((a, b) => {
    const da = a.e.date || '', db = b.e.date || '';
    if (da !== db) return da < db ? -1 : 1;
    if (b.e.followOf && b.e.followOf === a.e.id) return -1;
    if (a.e.followOf && a.e.followOf === b.e.id) return 1;
    return a.i - b.i;
  }).map(x => x.e);
  const latestUpdate = evs => { const c = evChrono(evs), t = todayISO(); for (let k = c.length - 1; k >= 0; k--) if ((c[k].date || '') <= t) return c[k]; return c[0] || null; };
  const statusOf = t => {
    if (t.statusOverride) return t.statusId || 'N';
    const l = latestUpdate(t.events);
    return (l && EV_TO_STATUS[l.status]) || t.statusId || 'N';
  };
  const textOf = html => String(html || '').replace(/<img[^>]*>/gi, '[תמונה]').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim();
  function eachTask(doc, fn) {
    const stages = stagesOf(doc);
    for (const s of doc.sheets || []) {
      if (s.type !== 'list') continue;
      const st = stages.find(x => x.id === s.id);
      for (const t of s.tasks || []) fn(t, s, st);
    }
  }
  function findTask(doc, ref) {
    let found = null;
    const hits = [];
    eachTask(doc, (t, s, st) => {
      if (t.id === ref) found = { t, s, st };
      else if (ref && bare(t.title).includes(bare(ref))) hits.push({ t, s, st });
    });
    if (found) return found;
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) throw new ToolError(`"${ref}" matches ${hits.length} tasks; use search_tasks and pass the task id. ` + hits.slice(0, 8).map(h => h.t.id + ' ' + h.t.title).join(' | '));
    throw new ToolError(`No task "${ref}" in this project. Use search_tasks to find its id.`);
  }

  /* ── writing: one synchronous read → change → write, then the page merges it ── */
  function writeProject(proj, me, mutate) {
    const doc = readJson(proj.file);
    if (!doc || !doc.sheets) throw new ToolError('The project could not be read');
    const out = mutate(doc);
    writeJsonAtomic(proj.file, { ...doc, _ts: Date.now(), _by: me.name + ' · Claude' });
    return out;
  }
  const logEntry = (me, text) => ({ id: uid(), at: Date.now(), user: me.name + ' (Claude)', text });
  function canWrite(me) { if (ROLE_RANK[me.role] < ROLE_RANK.editor) throw new ToolError('Your role in Project Hub is viewer: you can read, not change.'); }

  /* ── tools ── */
  const linkOf = (base, projId, sheetId, taskId) => `${base}/project_hub_01?project=${encodeURIComponent(projId)}&sheet=${encodeURIComponent(sheetId)}&task=${encodeURIComponent(taskId)}`;
  /* ── building blocks shared by the task tools and the meeting tools ── */
  const checkDates = (...ds) => { for (const d of ds) if (d && !ISO_DATE.test(d)) throw new ToolError(`Dates are YYYY-MM-DD, not "${d}"`); };
  const pathOf = (st, s) => st ? st.track + ' › ' + st.name : s.name;
  // a new task, the way the page's quick-add builds one; `extra` carries links such as sourceMeetingId
  function buildTask(doc, x, c, extra) {
    const discs = projList(doc, 'disciplines', c.reg), pris = projList(doc, 'priorities', c.reg);
    const title = String(x.title || '').trim();
    if (!title) throw new ToolError('Every task needs a title');
    const st = findStage(doc, x.stage);
    const sheet = doc.sheets.find(s => s.id === st.id);
    const groups = sheet.groups || [];
    const group = x.group ? groups.find(g => bare(g.name) === bare(x.group)) || groups.find(g => bare(g.name).includes(bare(x.group))) : groups[0];
    if (x.group && !group) throw new ToolError(`No group "${x.group}" in ${st.name}. Groups: ` + groups.map(g => g.name).join(', '));
    checkDates(x.start_date, x.due_date);
    const start = x.start_date || todayISO();
    let due = x.due_date || plusDays(start, 14);
    if (due < start) due = start;
    const people = pickPeople(doc, x.assignees);
    const task = {
      id: uid(), groupId: group ? group.id : null, title, statusId: 'N',
      priority: pickOption(pris, x.priority, 'priority') || '',
      discipline: pickOption(discs, x.discipline, 'discipline'),
      startDate: start, dueDate: due, comment: String(x.note || '').trim(),
      ...(x.description ? { description: esc(x.description).replace(/\n/g, '<br>') } : {}),
      ...(x.mail_url ? { mails: [{ url: String(x.mail_url), added: todayISO() }] } : {}),
      done: false, taskType: 'simple', fieldValues: {}, subtasks: [],
      ...(people.length ? { assigneeIds: people } : {}),
      ...(extra || {}),
      activityLog: [logEntry(c.me, (extra && extra.sourceMeetingId) ? 'נוצרה מישיבה דרך Claude' : 'נוצרה דרך Claude')]
    };
    return { sheetId: st.id, path: st.track + ' › ' + st.name, task };
  }
  function addTasks(doc, plan) {
    doc.sheets = doc.sheets.map(s => {
      const add = plan.filter(x => x.sheetId === s.id).map(x => x.task);
      return add.length ? { ...s, tasks: [...(s.tasks || []), ...add] } : s;
    });
  }
  /* one task changed the way update_task describes; opts.eventExtra goes on a new update,
     opts.why is logged before the field changes (e.g. which meeting asked for it) */
  function changeTask(doc, t, args, c, opts = {}) {
    const discs = projList(doc, 'disciplines', c.reg), pris = projList(doc, 'priorities', c.reg), sts = projList(doc, 'statuses', c.reg);
    const n = { ...t };
    const log = opts.why ? [opts.why] : [];
    checkDates(args.start_date, args.due_date, args.add_update && args.add_update.date);
    if (args.title && args.title.trim() !== t.title) { n.title = args.title.trim(); log.push(`כותרת שונתה ל"${n.title}"`); }
    if (args.priority != null) { n.priority = pickOption(pris, args.priority, 'priority') || ''; log.push('עדיפות עודכנה'); }
    if (args.discipline != null) { n.discipline = pickOption(discs, args.discipline, 'discipline'); log.push('תחום עודכן'); }
    if (args.start_date) n.startDate = args.start_date;
    if (args.due_date) n.dueDate = args.due_date;
    if (args.start_date || args.due_date) { if (n.dueDate && n.startDate && n.dueDate < n.startDate) n.dueDate = n.startDate; log.push('תאריכים עודכנו'); }
    if (args.note != null) { n.comment = String(args.note); log.push('הערה עודכנה'); }
    if (args.assignees) { n.assigneeIds = pickPeople(doc, args.assignees); log.push('אחראים עודכנו'); }
    if (args.add_mail_url) n.mails = [...(t.mails || (t.mail ? [t.mail] : [])), { url: String(args.add_mail_url), added: todayISO() }];
    if (args.add_update) {
      const u = args.add_update;
      const evs = Object.keys(EV_STATUSES);
      const ust = u.update_status ? (evs.find(k => k === u.update_status) || evs.find(k => norm(EV_STATUSES[k]) === norm(u.update_status))) : 'update';
      if (!ust) throw new ToolError(`Unknown update status "${u.update_status}". Options: ` + evs.map(k => k + ' (' + EV_STATUSES[k] + ')').join(', '));
      const lu = latestUpdate(t.events);
      const owner = u.owner ? pickOption(discs, u.owner, 'discipline') : ((lu && lu.assignee) || t.discipline || '');
      n.events = [...(t.events || []), { id: uid(), status: ust, assignee: owner || '', date: u.date || todayISO(), title: String(u.text).trim(), note: '', ...(u.mail_url ? { mail: { url: String(u.mail_url), added: todayISO() } } : {}), ...(opts.eventExtra || {}) }];
    }
    if (args.status) {
      const sid = pickOption(sts, args.status, 'status');
      n.statusId = sid; n.statusOverride = true; n.done = sid === 'C';
      log.push(`סטטוס שונה ל"${(sts.find(x => x.id === sid) || {}).label}"`);
    }
    if (args.add_subtasks && args.add_subtasks.length) {
      n.subtasks = [...(n.subtasks || []), ...args.add_subtasks.map(x => ({ id: uid(), title: String(x.title).trim(), done: false, statusId: 'N', priority: '', discipline: x.discipline ? pickOption(discs, x.discipline, 'discipline') : '', events: [] }))];
      log.push(args.add_subtasks.length === 1 ? 'נוספה תת-משימה' : `נוספו ${args.add_subtasks.length} תתי-משימות`);
    }
    if (args.complete_subtasks && args.complete_subtasks.length) {
      const subs = n.subtasks || [];
      const ids = args.complete_subtasks.map(ref => {
        const hit = subs.find(x => x.id === ref) || subs.find(x => bare(x.title) === bare(ref)) || subs.find(x => bare(x.title).includes(bare(ref)));
        if (!hit) throw new ToolError(`No subtask "${ref}". Subtasks: ` + subs.map(x => x.title).join(' | '));
        return hit.id;
      });
      n.subtasks = subs.map(x => ids.includes(x.id) ? { ...x, done: true, statusId: 'C' } : x);
      log.push('תתי-משימות עודכנו');
    }
    if (log.length) n.activityLog = [...(t.activityLog || []), ...log.map(x => logEntry(c.me, x))];
    return n;
  }
  const putTask = (doc, sheetId, n) => { doc.sheets = doc.sheets.map(sh => sh.id === sheetId ? { ...sh, tasks: sh.tasks.map(x => x.id === n.id ? n : x) } : sh); };

  /* ── meetings, as the page's ישיבות screen keeps them ── */
  const ITEM_ACTIONS = { none: null, task: 'משימה', update: 'עדכון', subtask: 'תת-משימה', principle: 'עקרון תכנון', milestone: 'אבן דרך' };
  function findMeeting(doc, ref) {
    const ms = doc.meetings || [];
    const hit = ms.find(m => m.id === ref) || ms.filter(m => m.date === ref).length === 1 && ms.find(m => m.date === ref);
    if (hit) return hit;
    const loose = ms.filter(m => ref && bare(m.title).includes(bare(ref)));
    if (loose.length === 1) return loose[0];
    const list = ms.slice(-12).map(m => m.id + ' ' + (m.date || '') + ' ' + (m.title || '(ללא כותרת)')).join(' | ');
    if (loose.length > 1) throw new ToolError(`"${ref}" matches ${loose.length} meetings; pass the meeting id. ` + list);
    throw new ToolError(`No meeting "${ref}" in this project. Meetings: ` + (list || 'none'));
  }
  function findTrack(doc, ref) {
    if (!ref) return null;
    const tr = (doc.tracks || []).find(t => t.id === ref) || (doc.tracks || []).find(t => bare(t.label).includes(bare(ref)));
    if (!tr) throw new ToolError(`No track "${ref}". Tracks: ` + (doc.tracks || []).map(t => t.label).join(', '));
    return tr.id;
  }
  const topNumber = items => items.reduce((mx, it) => Math.max(mx, /^\d+$/.test(it.number || '') ? +it.number : 0), 0);
  /* Writes a meeting's items into the meeting and carries out what each one asks for.
     Runs inside writeProject: any bad item throws before anything is written. */
  function applyItems(doc, meeting, items, c, base, proj) {
    const discs = projList(doc, 'disciplines', c.reg);
    const out = [];
    const tasksToAdd = [];
    let next = topNumber(meeting.items || []);
    for (const x of items) {
      const topic = String(x.topic || '').trim();
      if (!topic) throw new ToolError('Every meeting item needs a topic');
      checkDates(x.start_date, x.due_date);
      const action = x.action || 'none';
      if (!(action in ITEM_ACTIONS)) throw new ToolError(`Unknown action "${action}". Actions: ` + Object.keys(ITEM_ACTIONS).join(', '));
      const forInfo = x.for && /^לידיעה$/.test(norm(x.for));
      const disc = x.for && !forInfo ? pickOption(discs, x.for, 'discipline') : null;
      const item = {
        id: uid(), number: x.number ? String(x.number) : String(++next), topic,
        assignee: forInfo ? 'לידיעה' : disc, startDate: x.start_date || '', dueDate: x.due_date || '',
        itemType: null, createdTaskTrackId: null
      };
      const links = { sourceMeetingId: meeting.id, sourceMeetingItemId: item.id };
      const res = { number: item.number, topic, action };
      if (action === 'task') {
        const plan = buildTask(doc, { title: x.title || topic, stage: x.stage, discipline: disc || undefined, priority: x.priority, start_date: x.start_date, due_date: x.due_date, assignees: x.assignees, note: x.note }, c, links);
        tasksToAdd.push(plan);
        Object.assign(item, { itemType: 'task', createdTaskTrackId: plan.sheetId, createdTaskId: plan.task.id, startDate: plan.task.startDate, dueDate: plan.task.dueDate });
        Object.assign(res, { task: plan.task.title, stage: plan.path, due: plan.task.dueDate, link: linkOf(base, proj.id, plan.sheetId, plan.task.id) });
      } else if (action === 'update' || action === 'subtask') {
        if (!x.task) throw new ToolError(`Item "${topic}": an ${action} needs the existing task (id or title)`);
        const { t, s, st } = findTask(doc, x.task);
        const why = `${action === 'update' ? 'עודכנה' : 'נוספה תת-משימה'} מישיבה "${meeting.title || meeting.date}"`;
        const meetDay = meeting.date && meeting.date <= todayISO() ? meeting.date : todayISO();
        const n = action === 'update'
          ? changeTask(doc, t, { add_update: { text: topic, update_status: x.update_status, owner: disc || undefined, date: meetDay } }, c, { eventExtra: links, why })
          : changeTask(doc, t, { add_subtasks: [{ title: x.title || topic, discipline: disc || undefined }] }, c, { why });
        putTask(doc, s.id, n);
        Object.assign(item, { itemType: action, createdTaskTrackId: s.id, linkedTaskId: t.id });
        Object.assign(res, { task: t.title, stage: pathOf(st, s), link: linkOf(base, proj.id, s.id, t.id) });
      } else if (action === 'principle') {
        const rec = { id: uid(), description: topic, discipline: disc || '', createdAt: meeting.date || todayISO(), ...links };
        doc.standalonePrinciples = [...(doc.standalonePrinciples || []), rec];
        Object.assign(item, { itemType: 'principle', linkedRecordId: rec.id, linkedRecordKind: 'principle' });
      } else if (action === 'milestone') {
        const rec = { id: uid(), title: x.title || topic, date: x.due_date || '', startDate: todayISO(), status: 'not_started', done: false, stageId: null };
        doc.licensingMilestones = [...(doc.licensingMilestones || []), rec];
        Object.assign(item, { itemType: 'milestone', linkedRecordId: rec.id, linkedRecordKind: 'milestone' });
      }
      meeting.items = [...(meeting.items || []), item];
      out.push(res);
    }
    addTasks(doc, tasksToAdd);
    return out;
  }
  const ITEM_SCHEMA = {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'The item as written in the minutes' },
      number: { type: 'string', description: 'Item number ("3", "3.1"); omit to number automatically' },
      for: { type: 'string', description: 'Discipline that handles it, or "לידיעה" (for information)' },
      start_date: { type: 'string', description: 'YYYY-MM-DD' },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
      action: { type: 'string', enum: Object.keys(ITEM_ACTIONS), description: 'What the item becomes: none (minutes only), task (new task), update (update on an existing task), subtask (subtask of an existing task), principle (planning principle), milestone' },
      title: { type: 'string', description: 'Task / subtask / milestone title when it should differ from the topic' },
      task: { type: 'string', description: 'For update / subtask: the existing task (id or unique part of its title)' },
      update_status: { type: 'string', description: 'For update: missing | progress | sent | comments | response | update | approved' },
      stage: { type: 'string', description: 'For task: "track › stage"; omit for the default stage' },
      priority: { type: 'string', description: 'For task' },
      assignees: { type: 'array', items: { type: 'string' }, description: 'For task: team member names' },
      note: { type: 'string', description: 'For task: row comment' }
    },
    required: ['topic'], additionalProperties: false
  };

  const TOOLS = [
    {
      name: 'list_projects',
      title: 'Projects',
      description: 'The Project Hub projects the signed-in person can open: code, name and id. Start here when the user names a project loosely.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const list = projectsFor(c.me, c.reg).map(p => ({ id: p.id, code: p.code, name: p.name }));
        return { you: { name: c.me.name, role: c.me.role }, today: todayISO(), projects: list };
      }
    },
    {
      name: 'get_project',
      title: 'Project structure',
      description: 'One project\'s structure, needed before adding or changing tasks: its tracks and stages (task lists), the default stage for new tasks, the discipline / priority / status options, the team, and the update statuses.',
      inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project code, name or id' } }, required: ['project'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const p = findProject(c.me, c.reg, args.project);
        const doc = readJson(p.file);
        const vis = l => l.filter(o => !o.hidden).map(o => ({ id: o.id, label: o.label }));
        const stages = stagesOf(doc);
        return {
          project: { id: p.id, code: p.code, name: p.name },
          today: todayISO(),
          stages: stages.map(s => ({ id: s.id, path: s.track + ' › ' + s.name, groups: s.groups, default_for_new_tasks: s.default || undefined })),
          disciplines: vis(projList(doc, 'disciplines', c.reg)),
          priorities: vis(projList(doc, 'priorities', c.reg)),
          statuses: vis(projList(doc, 'statuses', c.reg)),
          update_statuses: Object.entries(EV_STATUSES).map(([id, label]) => ({ id, label })),
          team: teamOf(doc),
          defaults: { stage: (stages.find(s => s.default) || stages[0] || {}).name, start_date: todayISO(), due_date: plusDays(todayISO(), 14) }
        };
      }
    },
    {
      name: 'search_tasks',
      title: 'Find tasks',
      description: 'Find tasks by words in the title, comment, updates or subtasks — in one project or in all of them. Open tasks only unless include_done. Returns ids for get_task / update_task.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to look for (Hebrew spelling variants match)' },
          project: { type: 'string', description: 'Limit to one project (code, name or id)' },
          stage: { type: 'string', description: 'Limit to a stage: "track › stage" or the stage name' },
          discipline: { type: 'string' },
          mine: { type: 'boolean', description: 'Only tasks assigned to the signed-in person' },
          include_done: { type: 'boolean' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const projs = args.project ? [findProject(c.me, c.reg, args.project)] : projectsFor(c.me, c.reg);
        const words = bare(args.query || '').split(' ').filter(Boolean);
        const out = [];
        for (const p of projs) {
          const doc = readJson(p.file);
          const stageId = args.stage && args.project ? findStage(doc, args.stage).id : null;
          const discs = projList(doc, 'disciplines', c.reg);
          const sts = projList(doc, 'statuses', c.reg);
          const discId = args.discipline ? pickOption(discs, args.discipline, 'discipline') : null;
          eachTask(doc, (t, s, st) => {
            if (stageId && s.id !== stageId) return;
            const status = statusOf(t);
            if (!args.include_done && (status === 'C' || t.done)) return;
            const lu = latestUpdate(t.events);
            const owner = (lu && lu.assignee) || t.discipline || '';
            if (discId && t.discipline !== discId && owner !== discId) return;
            if (args.mine && !(t.assigneeIds || []).includes(c.me.id)) return;
            if (words.length) {
              const hay = bare([t.title, t.comment, textOf(t.description), ...(t.events || []).map(e => (e.title || '') + ' ' + (e.note || '')), ...(t.subtasks || []).map(x => x.title)].join(' '));
              if (!words.every(w => hay.includes(w))) return;
            }
            out.push({
              id: t.id, project: p.code, stage: st ? st.track + ' › ' + st.name : s.name, title: t.title,
              status: (sts.find(x => x.id === status) || {}).label || status,
              discipline: (discs.find(x => x.id === t.discipline) || {}).label || t.discipline || undefined,
              due: t.dueDate || undefined,
              latest_update: lu ? `${lu.date || ''} ${EV_STATUSES[lu.status] || lu.status || ''}${lu.title ? ' — ' + lu.title : ''}`.trim() : undefined,
              open_subtasks: (t.subtasks || []).filter(x => !x.done).length || undefined
            });
          });
        }
        const limit = Math.min(args.limit || 30, 100);
        return { count: out.length, tasks: out.slice(0, limit), truncated: out.length > limit || undefined };
      }
    },
    {
      name: 'get_task',
      title: 'Task details',
      description: 'Everything about one task: description, comment, dates, people, its update history (newest last) and subtasks.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, task: { type: 'string', description: 'Task id (from search_tasks) or a unique part of its title' } }, required: ['project', 'task'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const p = findProject(c.me, c.reg, args.project);
        const doc = readJson(p.file);
        const { t, s, st } = findTask(doc, args.task);
        const discs = projList(doc, 'disciplines', c.reg), pris = projList(doc, 'priorities', c.reg), sts = projList(doc, 'statuses', c.reg);
        const lbl = (l, id) => id ? ((l.find(x => x.id === id) || {}).label || id) : undefined;
        const team = teamOf(doc);
        return {
          id: t.id, project: p.code, stage: st ? st.track + ' › ' + st.name : s.name, title: t.title,
          status: lbl(sts, statusOf(t)), priority: lbl(pris, t.priority), discipline: lbl(discs, t.discipline),
          start: t.startDate || undefined, due: t.dueDate || undefined,
          assignees: (t.assigneeIds || []).map(id => (team.find(m => m.id === id) || {}).name || id),
          comment: t.comment || undefined, description: textOf(t.description) || undefined,
          mails: (t.mails || (t.mail ? [t.mail] : [])).map(m => m.url || m) || undefined,
          updates: evChrono(t.events).slice(-15).map(e => ({ date: e.date, status: EV_STATUSES[e.status] || e.status, owner: lbl(discs, e.assignee), title: e.title || undefined, note: e.note || undefined })),
          subtasks: (t.subtasks || []).map(x => ({ id: x.id, title: x.title, done: !!x.done, discipline: lbl(discs, x.discipline) })),
          from_meeting: t.sourceMeetingId ? (m => m ? `${m.date || ''} ${m.title || ''}`.trim() : undefined)((doc.meetings || []).find(m => m.id === t.sourceMeetingId)) : undefined,
          link: linkOf(c.base, p.id, s.id, t.id)
        };
      }
    },
    {
      name: 'create_tasks',
      title: 'Add tasks',
      description: 'Add one or more tasks to one project. Call get_project first, show the user the list you are about to add (title, stage, discipline, owner, due) and add only after they confirm. Defaults: the project\'s default stage, start today, due in 14 days, status "לא התחיל".',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string', description: 'Project code, name or id' },
          tasks: {
            type: 'array', minItems: 1, maxItems: 50,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                stage: { type: 'string', description: '"track › stage" or stage name or id; omit for the default stage' },
                group: { type: 'string', description: 'Group (section) inside the stage; omit for the first' },
                discipline: { type: 'string' },
                priority: { type: 'string' },
                start_date: { type: 'string', description: 'YYYY-MM-DD' },
                due_date: { type: 'string', description: 'YYYY-MM-DD' },
                assignees: { type: 'array', items: { type: 'string' }, description: 'Team member names' },
                note: { type: 'string', description: 'Short comment shown in the task row' },
                description: { type: 'string', description: 'Longer text for the task\'s description' },
                mail_url: { type: 'string', description: 'Link to a related email' }
              },
              required: ['title'], additionalProperties: false
            }
          }
        },
        required: ['project', 'tasks'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const made = writeProject(p, c.me, doc => {
          const plan = args.tasks.map(x => buildTask(doc, x, c));
          addTasks(doc, plan);
          return plan;
        });
        return {
          project: p.code + ' ' + p.name,
          created: made.map(x => ({ id: x.task.id, title: x.task.title, stage: x.path, due: x.task.dueDate, link: linkOf(c.base, p.id, x.sheetId, x.task.id) }))
        };
      }
    },
    {
      name: 'update_task',
      title: 'Update a task',
      description: 'Change one task: add an update to its update history (the usual way to record progress), set its status, change fields, add subtasks or tick them off. Confirm with the user before calling. An update\'s owner is a discipline (who holds the ball).',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          task: { type: 'string', description: 'Task id (from search_tasks) or a unique part of its title' },
          add_update: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'What happened' },
              update_status: { type: 'string', description: 'missing | progress | sent | comments | response | update | approved (or the Hebrew label)' },
              owner: { type: 'string', description: 'Discipline that now holds the ball; omit to keep the current one' },
              date: { type: 'string', description: 'YYYY-MM-DD, default today' },
              mail_url: { type: 'string' }
            },
            required: ['text'], additionalProperties: false
          },
          status: { type: 'string', description: 'Task status (id or label), e.g. בוצע' },
          title: { type: 'string' },
          priority: { type: 'string' },
          discipline: { type: 'string' },
          start_date: { type: 'string' },
          due_date: { type: 'string' },
          note: { type: 'string', description: 'Replaces the row comment' },
          assignees: { type: 'array', items: { type: 'string' } },
          add_subtasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, discipline: { type: 'string' } }, required: ['title'], additionalProperties: false } },
          complete_subtasks: { type: 'array', items: { type: 'string' }, description: 'Subtask ids or titles to mark done' },
          add_mail_url: { type: 'string' }
        },
        required: ['project', 'task'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const res = writeProject(p, c.me, doc => {
          const { t, s, st } = findTask(doc, args.task);
          const sts = projList(doc, 'statuses', c.reg);
          const n = changeTask(doc, t, args, c);
          putTask(doc, s.id, n);
          return { id: t.id, title: n.title, stage: st ? st.track + ' › ' + st.name : s.name, status: (sts.find(x => x.id === statusOf(n)) || {}).label, sheetId: s.id };
        });
        return { project: p.code + ' ' + p.name, updated: { ...res, sheetId: undefined, link: linkOf(c.base, p.id, res.sheetId, res.id) } };
      }
    },
    {
      name: 'delete_task',
      title: 'Delete a task',
      description: 'Delete one task (with its subtasks and updates) from a project. Only when the user asked for a deletion: first show them exactly which task (title, stage, id) and get an explicit yes for that task. A copy is kept on the server, so a mistaken delete can be restored by an administrator.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, task: { type: 'string', description: 'Task id — use the id, not a title, so the right task goes' } }, required: ['project', 'task'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const gone = writeProject(p, c.me, doc => {
          let hit = null;
          eachTask(doc, (t, s, st) => { if (t.id === args.task) hit = { t, s, st }; });
          if (!hit) throw new ToolError(`No task with id "${args.task}" in this project. Find it with search_tasks and pass its id.`);
          const at = new Date().toISOString();
          const dir = path.join(DATA_DIR, 'deleted', p.id);
          fs.mkdirSync(dir, { recursive: true });
          writeJsonAtomic(path.join(dir, at.replace(/[:.]/g, '-') + '-' + hit.t.id + '.json'), { project: { id: p.id, code: p.code, name: p.name }, sheetId: hit.s.id, stage: pathOf(hit.st, hit.s), deletedBy: c.me.name + ' (Claude)', at, task: hit.t });
          doc.sheets = doc.sheets.map(sh => sh.id === hit.s.id ? { ...sh, tasks: sh.tasks.filter(x => x.id !== hit.t.id) } : sh);
          return { id: hit.t.id, title: hit.t.title, stage: pathOf(hit.st, hit.s), subtasks: (hit.t.subtasks || []).length };
        });
        return { project: p.code + ' ' + p.name, deleted: gone, kept_copy: true };
      }
    },
    {
      name: 'list_meetings',
      title: 'Meetings',
      description: 'A project\'s meeting minutes (ישיבות), newest first: id, date, title, track and how many items became tasks, updates or principles.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, query: { type: 'string', description: 'Words in the title or items' }, limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 } }, required: ['project'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const p = findProject(c.me, c.reg, args.project);
        const doc = readJson(p.file);
        const words = bare(args.query || '').split(' ').filter(Boolean);
        const trackLabel = id => ((doc.tracks || []).find(t => t.id === id) || {}).label;
        const ms = (doc.meetings || []).filter(m => !words.length || words.every(w => bare([m.title, ...(m.items || []).map(i => i.topic)].join(' ')).includes(w)))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const limit = Math.min(args.limit || 15, 50);
        return {
          project: p.code + ' ' + p.name,
          count: ms.length,
          meetings: ms.slice(0, limit).map(m => ({ id: m.id, date: m.date, title: m.title || '(ללא כותרת)', track: trackLabel(m.trackId), items: (m.items || []).length, acted_on: (m.items || []).filter(i => i.itemType).length }))
        };
      }
    },
    {
      name: 'get_meeting',
      title: 'Meeting minutes',
      description: 'One meeting: participants and every item with what it became (task, update, subtask, principle, milestone) and links to the tasks.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, meeting: { type: 'string', description: 'Meeting id, its date (YYYY-MM-DD) or part of its title' } }, required: ['project', 'meeting'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const p = findProject(c.me, c.reg, args.project);
        const doc = readJson(p.file);
        const m = findMeeting(doc, args.meeting);
        const discs = projList(doc, 'disciplines', c.reg);
        const taskById = {};
        eachTask(doc, (t, s) => { taskById[t.id] = { t, s }; });
        const linkedTask = it => {
          const id = it.createdTaskId || it.linkedTaskId || (Object.values(taskById).find(x => x.t.sourceMeetingItemId === it.id) || {}).t?.id;
          const hit = id && taskById[id];
          return hit ? { task: hit.t.title, link: linkOf(c.base, p.id, hit.s.id, hit.t.id) } : {};
        };
        return {
          id: m.id, date: m.date, title: m.title, track: ((doc.tracks || []).find(t => t.id === m.trackId) || {}).label,
          participants: (m.participants || []).map(x => x.role ? `${x.name} (${x.role})` : x.name),
          recorded_by: m.recordedBy || undefined, distribution: m.distribution || undefined,
          items: (m.items || []).map(it => ({
            number: it.number, topic: it.topic,
            for: it.assignee === 'לידיעה' ? 'לידיעה' : ((discs.find(d => d.id === it.assignee) || {}).label || it.assignee || undefined),
            start: it.startDate || undefined, due: it.dueDate || undefined,
            became: it.itemType ? ITEM_ACTIONS[it.itemType] || it.itemType : undefined,
            ...(it.itemType && ['task', 'update', 'subtask'].includes(it.itemType) ? linkedTask(it) : {})
          }))
        };
      }
    },
    {
      name: 'create_meeting',
      title: 'Record a meeting',
      description: 'Record a meeting\'s minutes in the project (it appears under ישיבות) and, in the same step, turn its items into new tasks, updates or subtasks on existing tasks, planning principles or milestones — each linked back to the meeting. Before calling: get_project, search_tasks for items that continue existing tasks, then show the user a numbered table (item, what it becomes, stage/task, discipline, due) and call only after they confirm. Items the user did not pick stay in the minutes with action "none".',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          title: { type: 'string', description: 'Meeting subject' },
          date: { type: 'string', description: 'YYYY-MM-DD, default today' },
          track: { type: 'string', description: 'Track the meeting belongs to (e.g. מסלול רישוי); omit for general' },
          participants: { type: 'array', items: { type: 'string' }, description: 'Names, optionally "name (role)"' },
          recorded_by: { type: 'string', description: 'Default: the signed-in person' },
          distribution: { type: 'string' },
          items: { type: 'array', minItems: 1, maxItems: 80, items: ITEM_SCHEMA }
        },
        required: ['project', 'title', 'items'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        const p = findProject(c.me, c.reg, args.project);
        checkDates(args.date);
        const res = writeProject(p, c.me, doc => {
          const date = args.date || todayISO();
          const title = String(args.title || '').trim();
          if ((doc.meetings || []).some(m => m.date === date && bare(m.title) === bare(title))) throw new ToolError(`A meeting "${title}" on ${date} already exists; use add_meeting_items to add to it.`);
          const team = teamOf(doc);
          const participants = (args.participants || []).map(raw => {
            const mm = /^(.*?)\s*\((.*)\)\s*$/.exec(String(raw));
            const name = (mm ? mm[1] : String(raw)).trim(), role = mm ? mm[2].trim() : '';
            const member = team.find(x => bare(x.name) === bare(name));
            return { id: uid(), name: member ? member.name : name, role: role || (member ? member.role : ''), isCustom: !member };
          });
          const meeting = { id: uid(), trackId: findTrack(doc, args.track), title, date, participants, items: [], recordedBy: args.recorded_by || c.me.name, distribution: args.distribution || '', createdAt: new Date().toISOString(), createdVia: 'claude' };
          const items = applyItems(doc, meeting, args.items, c, c.base, p);
          doc.meetings = [...(doc.meetings || []), meeting];
          return { meeting, items };
        });
        return { project: p.code + ' ' + p.name, meeting: { id: res.meeting.id, date: res.meeting.date, title: res.meeting.title, where: 'ניהול תכנון › ישיבות' }, items: res.items };
      }
    },
    {
      name: 'add_meeting_items',
      title: 'Add to a meeting',
      description: 'Add items to an existing meeting\'s minutes, with the same actions as create_meeting (task, update, subtask, principle, milestone, none). Confirm with the user first.',
      inputSchema: {
        type: 'object',
        properties: { project: { type: 'string' }, meeting: { type: 'string', description: 'Meeting id, date or part of its title' }, items: { type: 'array', minItems: 1, maxItems: 80, items: ITEM_SCHEMA } },
        required: ['project', 'meeting', 'items'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const res = writeProject(p, c.me, doc => {
          const found = findMeeting(doc, args.meeting);
          const meeting = { ...found, items: [...(found.items || [])] };
          const items = applyItems(doc, meeting, args.items, c, c.base, p);
          doc.meetings = doc.meetings.map(m => m.id === meeting.id ? meeting : m);
          return { meeting, items };
        });
        return { project: p.code + ' ' + p.name, meeting: { id: res.meeting.id, date: res.meeting.date, title: res.meeting.title }, items: res.items };
      }
    }
  ];

  const INSTRUCTIONS = [
    'Project Hub is the task manager of KKARC, an architecture office. Talk with the user in Hebrew.',
    'A project has tracks (מסלולים) with stages (שלבים); each stage is a task list. New tasks go to the project\'s default stage (usually "מסלול תכנון › משימות שוטפות") unless the user names another.',
    'Before adding or changing anything, call get_project for the project, map what the user said onto its real stages, disciplines (תחום), priorities and team, and show a short table of exactly what you will write. Write only after the user confirms. Never invent a project, stage, discipline or person — ask.',
    'From meeting minutes or a summary: work out the project, then read every item and propose what each becomes — a new task, an update or subtask on an existing task (search_tasks first), a planning principle (עקרון תכנון), a milestone, or minutes only. Show a numbered table and let the user change and pick; then record it all with one create_meeting call (or add_meeting_items for a meeting already in Project Hub), so the minutes and everything made from them stay linked.',
    'Progress on an existing task is recorded as an update (update_task.add_update), not by editing the title. An update\'s owner is a discipline — who holds the ball after this step.',
    'Delete only when the user asked to delete: name the exact task (title, stage, id), get an explicit yes, then call delete_task with the id. Never delete to "clean up" on your own.',
    'Dates are YYYY-MM-DD. Defaults: start today, due in 14 days. After writing, give the user the task links.'
  ].join('\n');

  /* ── OAuth: storage ── */
  let store = null;
  function loadStore() {
    if (!store) {
      store = readJson(STORE_FILE);
      store.clients = store.clients || {};
      store.codes = store.codes || {};
      store.tokens = store.tokens || {};
      if (!store.secret) { store.secret = rand(32); saveStore(); }
    }
    return store;
  }
  function saveStore() {
    const now = Date.now();
    for (const k of Object.keys(store.codes)) if (store.codes[k].exp < now) delete store.codes[k];
    for (const k of Object.keys(store.tokens)) if (store.tokens[k].exp < now) delete store.tokens[k];
    writeJsonAtomic(STORE_FILE, store);
  }
  const baseOf = req => (SITE_MODE === 'cloud' ? 'https' : (req.headers['x-forwarded-proto'] || 'http')) + '://' + req.headers.host;
  /* Codes only ever go back to Claude (claude.ai / claude.com) or to a program on this computer. */
  function redirectAllowed(uri) {
    try {
      const u = new URL(uri);
      if (u.protocol === 'https:' && /^(?:[a-z0-9-]+\.)*(?:claude\.ai|claude\.com|anthropic\.com)$/i.test(u.hostname)) return true;
      if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return true;
      return false;
    } catch (e) { return false; }
  }
  const cors = res => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
  };
  const oauthError = (res, status, error, desc) => { res.setHeader('Cache-Control', 'no-store'); sendJson(res, status, { error, error_description: desc }); };

  function metadata(base) {
    return {
      issuer: base,
      authorization_endpoint: base + '/oauth/authorize',
      token_endpoint: base + '/oauth/token',
      registration_endpoint: base + '/oauth/register',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['projects']
    };
  }

  async function register(req, res) {
    let body;
    try { body = JSON.parse(await readRequestBody(req) || '{}'); } catch (e) { return oauthError(res, 400, 'invalid_client_metadata', 'Body is not JSON'); }
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
    if (!uris.length || !uris.every(redirectAllowed)) return oauthError(res, 400, 'invalid_redirect_uri', 'Only Claude callbacks or this computer may receive codes');
    const st = loadStore();
    const id = 'c_' + rand(18);
    st.clients[id] = { redirect_uris: uris, name: String(body.client_name || 'Claude').slice(0, 80), created: Date.now() };
    saveStore();
    res.setHeader('Cache-Control', 'no-store');
    sendJson(res, 201, {
      client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: st.clients[id].name,
      redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none'
    });
  }

  function issueTokens(st, who, clientId) {
    const access = rand(32), refresh = rand(32), now = Date.now();
    st.tokens[sha(access)] = { kind: 'access', who, client: clientId, exp: now + ACCESS_TTL };
    st.tokens[sha(refresh)] = { kind: 'refresh', who, client: clientId, exp: now + REFRESH_TTL };
    saveStore();
    return { access_token: access, token_type: 'Bearer', expires_in: Math.floor(ACCESS_TTL / 1000), refresh_token: refresh, scope: 'projects' };
  }

  async function token(req, res) {
    const raw = await readRequestBody(req);
    let f;
    if ((req.headers['content-type'] || '').includes('json')) { try { f = JSON.parse(raw || '{}'); } catch (e) { f = {}; } }
    else f = Object.fromEntries(new URLSearchParams(raw));
    const st = loadStore();
    if (f.grant_type === 'authorization_code') {
      const key = sha(f.code || '');
      const c = st.codes[key];
      delete st.codes[key];
      if (!c || c.exp < Date.now()) { saveStore(); return oauthError(res, 400, 'invalid_grant', 'The code is unknown or expired'); }
      if (c.client !== f.client_id || c.redirect_uri !== f.redirect_uri) { saveStore(); return oauthError(res, 400, 'invalid_grant', 'The code was issued to another client'); }
      const challenge = crypto.createHash('sha256').update(String(f.code_verifier || '')).digest('base64url');
      if (challenge !== c.challenge) { saveStore(); return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed'); }
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, issueTokens(st, c.who, c.client));
    }
    if (f.grant_type === 'refresh_token') {
      const key = sha(f.refresh_token || '');
      const t = st.tokens[key];
      if (!t || t.kind !== 'refresh' || t.exp < Date.now() || (f.client_id && f.client_id !== t.client)) return oauthError(res, 400, 'invalid_grant', 'The refresh token is unknown or expired');
      delete st.tokens[key];
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, issueTokens(st, t.who, t.client));
    }
    return oauthError(res, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
  }

  /* The consent screen. It is reached with the Microsoft session (the server's gate sends
     anyone without one to sign in first), and its form carries a token bound to that
     person and these exact parameters, so another site cannot submit it for them. */
  const consentSig = (st, who, q) => crypto.createHmac('sha256', st.secret).update([who.email || who.name, q.client_id, q.redirect_uri, q.code_challenge, q.state || ''].join('\n')).digest('base64url');
  function authorize(req, res, url, user, body) {
    const q = body || Object.fromEntries(url.searchParams);
    const st = loadStore();
    const client = st.clients[q.client_id];
    if (!client) return htmlPage(res, 400, 'החיבור לא הוגדר כראוי', 'Claude לא נרשם מול Project Hub. נסו להוסיף את המחבר מחדש.');
    if (!q.redirect_uri || !client.redirect_uris.includes(q.redirect_uri)) return htmlPage(res, 400, 'כתובת חזרה לא מוכרת', 'הבקשה הגיעה עם כתובת חזרה שלא נרשמה.');
    const back = params => { const u = new URL(q.redirect_uri); for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v); res.writeHead(302, { Location: u.toString(), 'Cache-Control': 'no-store' }); res.end(); };
    if (q.response_type !== 'code') return back({ error: 'unsupported_response_type', state: q.state });
    if (!q.code_challenge || (q.code_challenge_method || 'plain') !== 'S256') return back({ error: 'invalid_request', error_description: 'PKCE with S256 is required', state: q.state });
    const reg = readJson(REGISTRY);
    const me = identify(user, reg);
    if (req.method === 'POST') {
      const origin = req.headers.origin;
      if (origin && origin !== baseOf(req)) return htmlPage(res, 403, 'הבקשה נחסמה', 'האישור חייב להגיע מעמוד Project Hub עצמו.');
      if (q.csrf !== consentSig(st, user, q)) return htmlPage(res, 403, 'הבקשה נחסמה', 'פג תוקף העמוד. נסו שוב מ-Claude.');
      if (q.decision !== 'allow') return back({ error: 'access_denied', state: q.state });
      const code = rand(32);
      st.codes[sha(code)] = { client: q.client_id, redirect_uri: q.redirect_uri, challenge: q.code_challenge, who: { email: user.email, name: user.name }, exp: Date.now() + CODE_TTL };
      saveStore();
      return back({ code, state: q.state });
    }
    const hidden = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource']
      .filter(k => q[k] != null).map(k => `<input type="hidden" name="${k}" value="${esc(q[k])}">`).join('');
    const host = (() => { try { return new URL(q.redirect_uri).host; } catch (e) { return ''; } })();
    const roleHe = { viewer: 'צפייה בלבד', editor: 'עריכה', admin: 'מנהל', superadmin: 'Super Admin' }[me.role] || me.role;
    htmlPage(res, 200, 'חיבור Claude ל-Project Hub', `
      <p><b>${esc(client.name)}</b> מבקש לעבוד ב-Project Hub בשמך:</p>
      <div class="who">${esc(me.name)}${me.email ? ' · <span dir="ltr">' + esc(me.email) + '</span>' : ''} · הרשאה: ${esc(roleHe)}</div>
      <ul>
        <li>לקרוא את הפרויקטים והמשימות שפתוחים לך</li>
        ${ROLE_RANK[me.role] >= 1 ? '<li>להוסיף משימות, לעדכן אותן ולהוסיף תתי-משימות</li>' : ''}
        <li>כל שינוי יירשם על שמך, עם הסימון "Claude"</li>
      </ul>
      <form method="post" action="/oauth/authorize">${hidden}
        <input type="hidden" name="csrf" value="${esc(consentSig(st, user, q))}">
        <div class="btns"><button class="primary" name="decision" value="allow">אישור</button><button name="decision" value="deny">ביטול</button></div>
      </form>
      <p class="fine">החיבור יחזור אל <span dir="ltr">${esc(host)}</span>. אפשר לנתק אותו בכל עת בהגדרות של Claude.</p>`);
  }
  function htmlPage(res, status, title, body) {
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#eef3fb;font-family:"Segoe UI",Arial,sans-serif;color:#1e1f21}
.card{background:#fff;border-radius:16px;box-shadow:0 18px 44px -14px rgba(15,23,42,.3);padding:28px 30px;max-width:420px;width:calc(100% - 32px);box-sizing:border-box}
.head{display:flex;align-items:center;gap:10px;margin-bottom:14px}.head img{width:34px;height:34px}.head h1{font-size:18px;margin:0}
p{font-size:14px;line-height:1.6;margin:8px 0}.who{background:#f1f5fb;border:1px solid #dbe3f0;border-radius:10px;padding:9px 12px;font-size:13.5px;font-weight:600;margin:8px 0 12px}
ul{margin:0 0 16px;padding-inline-start:20px;font-size:13.5px;line-height:1.75;color:#3d4250}.btns{display:flex;gap:8px}
button{flex:1;font:inherit;font-size:14px;font-weight:700;padding:10px;border-radius:10px;border:1px solid #cfd6e3;background:#fff;color:#1e1f21;cursor:pointer}
button.primary{background:#2563EB;border-color:#2563EB;color:#fff}.fine{font-size:12px;color:#6b7280;margin-top:14px}
@media (prefers-color-scheme:dark){body{background:#0f141c;color:#e6e8eb}.card{background:#1a212c}.who{background:#222b38;border-color:#334}ul{color:#c2c8d2}button{background:#222b38;color:#e6e8eb;border-color:#3a4556}}</style></head>
<body><main class="card"><div class="head"><img src="/icon-192.png?v=cube" alt=""><h1>${esc(title)}</h1></div>${body}</main></body></html>`;
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" });
    res.end(html);
  }

  /* ── /mcp ── */
  function bearerUser(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return null;
    const st = loadStore();
    const t = st.tokens[sha(m[1].trim())];
    if (!t || t.kind !== 'access' || t.exp < Date.now()) return null;
    return t.who;
  }
  async function handleRpc(msg, c) {
    const reply = result => ({ jsonrpc: '2.0', id: msg.id, result });
    const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid request');
    if (msg.id === undefined) return null; // a notification
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params && msg.params.protocolVersion;
        return reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'project-hub', title: 'Project Hub', version: '1.2.0' },
          instructions: INSTRUCTIONS
        });
      }
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: TOOLS.map(({ run, ...t }) => t) });
      case 'tools/call': {
        const name = msg.params && msg.params.name;
        const tool = TOOLS.find(t => t.name === name);
        if (!tool) return fail(-32602, 'Unknown tool: ' + name);
        try {
          const out = tool.run((msg.params && msg.params.arguments) || {}, c);
          return reply({ content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], structuredContent: out, isError: false });
        } catch (e) {
          if (!(e instanceof ToolError)) console.error('mcp tool', name, e);
          return reply({ content: [{ type: 'text', text: e instanceof ToolError ? e.message : 'Internal error: ' + e.message }], isError: true });
        }
      }
      case 'resources/list': return reply({ resources: [] });
      case 'prompts/list': return reply({ prompts: [] });
      default: return fail(-32601, 'Method not found: ' + msg.method);
    }
  }
  async function mcp(req, res) {
    const base = baseOf(req);
    if (req.method === 'GET' || req.method === 'DELETE') { res.writeHead(405, { Allow: 'POST' }); res.end(); return; }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    const who = bearerUser(req);
    if (!who) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
      sendJson(res, 401, { error: 'invalid_token', error_description: 'Sign in to Project Hub' });
      return;
    }
    let body;
    try { body = JSON.parse(await readRequestBody(req)); } catch (e) { sendJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return; }
    const reg = readJson(REGISTRY);
    let c;
    try { c = { me: identify(who, reg), reg, base }; } catch (e) { sendJson(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: e.message } }); return; }
    const batch = Array.isArray(body);
    const answers = [];
    for (const m of batch ? body : [body]) { const a = await handleRpc(m, c); if (a) answers.push(a); }
    if (!answers.length) { res.writeHead(202); res.end(); return; }
    sendJson(res, 200, batch ? answers : answers[0]);
  }

  /* Routes that run before the Microsoft-session gate: discovery, registration, token, /mcp. */
  function handlePublic(req, res, url) {
    const p = url.pathname;
    const isOurs = p === '/mcp' || p.startsWith('/.well-known/oauth-') || p === '/oauth/register' || p === '/oauth/token';
    if (!isOurs) return false;
    cors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
    const base = baseOf(req);
    if (p.startsWith('/.well-known/oauth-protected-resource')) { sendJson(res, 200, { resource: base + '/mcp', authorization_servers: [base], bearer_methods_supported: ['header'], scopes_supported: ['projects'], resource_name: 'Project Hub' }); return true; }
    if (p.startsWith('/.well-known/oauth-authorization-server')) { sendJson(res, 200, metadata(base)); return true; }
    const done = e => { console.error('mcp route', p, e); if (!res.headersSent) sendJson(res, 500, { error: 'server_error' }); };
    if (p === '/oauth/register') { if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return true; } register(req, res).catch(done); return true; }
    if (p === '/oauth/token') { if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return true; } token(req, res).catch(done); return true; }
    if (p === '/mcp') { mcp(req, res).catch(done); return true; }
    sendJson(res, 404, { error: 'Not found' });
    return true;
  }
  /* /oauth/authorize, after the gate: the person is signed in to Microsoft. */
  function handleAuthorize(req, res, url, user) {
    if (req.method === 'POST') {
      readRequestBody(req).then(raw => authorize(req, res, url, user, Object.fromEntries(new URLSearchParams(raw))))
        .catch(e => { console.error('authorize', e); if (!res.headersSent) sendJson(res, 500, { error: 'server_error' }); });
      return;
    }
    try { authorize(req, res, url, user); } catch (e) { console.error('authorize', e); if (!res.headersSent) sendJson(res, 500, { error: 'server_error' }); }
  }

  return { handlePublic, handleAuthorize, _test: { identify, projectsFor, projList, stagesOf, findStage, officeData } };
};
