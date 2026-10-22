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
const ATTACH_TTL = 30 * 60 * 1000;
const ATTACH_MAX_FILES = 20;
const PH01_ID = 'ph01';
const ROLE_RANK = { viewer: 0, editor: 1, admin: 2, superadmin: 3 };
const EV_STATUSES = {
  missing: 'חסר', progress: 'בעבודה', sent: 'נשלח', comments: 'יש הערות',
  update: 'עדכון', approved: 'מאושר'
};
// בהתייחסות was retired (the page turns stored ones into בעבודה); a document not yet re-saved may still hold it
const evLabel = k => EV_STATUSES[k === 'response' ? 'progress' : k] || k || '';
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
  const { DATA_DIR, STATIC_ROOT, SITE_MODE, APPS, PROJECTS_DIR, readJson, writeJsonAtomic, sendJson, readRequestBody, readRequestBuffer, saveAttachment } = ctx;
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
    const next = { ...doc, _ts: Date.now(), _by: me.name + ' · Claude' };
    if (ctx.beforeProjectWrite) { try { ctx.beforeProjectWrite(proj.file, readJson(proj.file), next, me.name + ' (Claude)'); } catch (e) {} }
    writeJsonAtomic(proj.file, next);
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

  /* ── the execution track (doc.execItems, doc.finishes), with the page's own exec-logic so
     numbers, ball handoffs and statuses behave exactly as on the screen. In trial: only the
     page's EXEC_TRIAL_USERS see these tools. ── */
  let execLib = null;
  function execLogic() {
    const file = path.join(STATIC_ROOT, 'project_hub_01.html');
    let st;
    try { st = fs.statSync(file); } catch (e) { throw new ToolError('Project Hub page not found on the server'); }
    if (execLib && execLib.mtime === st.mtimeMs) return execLib;
    const html = fs.readFileSync(file, 'utf8');
    const m = html.match(/\/\* ═══ exec-logic ═══ \*\/([\s\S]*?)\/\* ═══ \/exec-logic ═══ \*\//);
    if (!m) throw new ToolError('could not read the execution logic from the page');
    const L = new Function('uid', m[1] + '\nreturn {EXEC_TYPES,EXEC_PARTIES,execIsClosed,execNewItem,execBumpSeq,execRespond,execAddRevision,execDecide,execDecideChange,execSetStatus,execWaiting,execBallDays,execPartyLabel,execAddWorkdays,finishStatus,finishFromSubmittal,finishNoteForChange,finishUnlinkItem,FINISH_ZONES,finishZone,finishCat};')(uid);
    const tr = html.match(/const EXEC_TRIAL_USERS = (\[[^\]]*\]);/);
    const due = html.match(/const EX_DUE_WORKDAYS=(\{[^}]*\});/);
    execLib = { mtime: st.mtimeMs, L, trial: tr ? Function('"use strict";return (' + tr[1] + ')')() : null, dueDays: due ? Function('"use strict";return (' + due[1] + ')')() : {} };
    return execLib;
  }
  // null trial list = the track is open to everyone
  const canExec = me => { const t = execLogic().trial; return !t || t.includes(me.id); };
  function execGate(me) { if (!canExec(me)) throw new ToolError('The execution track (מסלול ביצוע) is not open to you yet.'); return execLogic().L; }
  const EXEC_TYPE_IDS = ['issue', 'rfi', 'submittal', 'change'];
  function pickExecType(L, ref) {
    if (!ref) return null;
    const r = norm(ref);
    const hit = EXEC_TYPE_IDS.find(k => k === r || norm(L.EXEC_TYPES[k].prefix) === r || norm(L.EXEC_TYPES[k].label) === r);
    if (!hit) throw new ToolError(`Unknown item type "${ref}". Types: issue (ISS), rfi (RFI), submittal (SUB, הגשה), change (CHG, שינוי / ויתור)`);
    return hit;
  }
  function pickParty(L, b, what) {
    if (b == null) return null;
    const o = typeof b === 'string' ? { party: b } : b;
    const r = norm(o.party);
    const hit = L.EXEC_PARTIES.find(p => p.id === r || norm(p.label) === r || bare(p.label) === bare(o.party));
    if (!hit) throw new ToolError(`Unknown ${what || 'party'} "${o.party}". Parties: ` + L.EXEC_PARTIES.map(p => p.id + ' (' + p.label + ')').join(', '));
    return { party: hit.id, name: String(o.name || '').trim() };
  }
  function pickExecStatus(L, type, ref) {
    const sts = L.EXEC_TYPES[type].statuses;
    const r = norm(ref);
    const hit = sts.find(s => s.id === r) || sts.find(s => norm(s.label.replace(/⁠/g, '')) === r) || sts.find(s => bare(s.label.replace(/⁠/g, '')).startsWith(bare(ref)));
    if (!hit) throw new ToolError(`Unknown status "${ref}" for ${L.EXEC_TYPES[type].label}. Statuses: ` + sts.map(s => s.id + ' (' + s.label.replace(/⁠/g, '') + ')').join(', '));
    return hit.id;
  }
  function findExec(doc, ref, L) {
    const items = doc.execItems || [];
    const r = String(ref || '').trim();
    const num = r.toUpperCase().replace(/\s+/g, '');
    let hit = items.find(i => i.id === r) || items.find(i => i.number === num);
    if (!hit) { const mm = num.match(/^([A-Z]+)-?(\d+)$/); if (mm) hit = items.find(i => L.EXEC_TYPES[i.type] && L.EXEC_TYPES[i.type].prefix === mm[1] && i.seq === +mm[2]); }
    if (hit) return hit;
    const loose = items.filter(i => r && bare(i.title).includes(bare(r)));
    if (loose.length === 1) return loose[0];
    if (loose.length > 1) throw new ToolError(`"${ref}" matches ${loose.length} items: ` + loose.slice(0, 10).map(i => i.number + ' ' + i.title).join(' | ') + '. Pass the number.');
    throw new ToolError(`No execution item "${ref}" in this project. Use list_exec_items.`);
  }
  const stLabel = (L, it) => ((L.EXEC_TYPES[it.type].statuses.find(s => s.id === it.status) || {}).label || it.status).replace(/⁠/g, '');
  const discLabel = (doc, c, id) => id ? ((projList(doc, 'disciplines', c.reg).find(o => o.id === id) || {}).label || id) : '';
  const priLabel = (doc, c, id) => id ? ((projList(doc, 'priorities', c.reg).find(o => o.id === id) || {}).label || id) : '';
  function execBrief(doc, c, L, it, today) {
    return {
      id: it.id, number: it.number, type: it.type, title: it.title, status: stLabel(L, it), closed: L.execIsClosed(it),
      ball: it.ball ? L.execPartyLabel(it.ball) : null, waiting_workdays: L.execWaiting(it, today) || 0,
      due: it.dueDate || null, priority: priLabel(doc, c, it.priority) || undefined, discipline: discLabel(doc, c, it.discipline) || undefined, spec_section: it.specSection || undefined,
      opened_by: L.execPartyLabel(it.openedBy), created: String(it.createdAt || '').slice(0, 10),
      ...(it.type === 'submittal' ? { round: ((it.revisions || []).slice(-1)[0] || {}).label } : {}),
      ...(it.type === 'change' ? { tender_spec: it.tenderSpec, tender_ref: it.tenderRef || undefined, proposed: it.proposed, approved_text: it.approvedText || undefined } : {})
    };
  }
  const execLinkOf = (base, projId, itemId) => `${base}/project_hub_01?project=${encodeURIComponent(projId)}&exec=${encodeURIComponent(itemId)}`;
  const FINISH_FIELDS = { element: 'element', location: 'location', material: 'material', finish: 'finish', color: 'color', color_hex: 'colorHex', supplier: 'supplier', approved_at: 'approvedAt', approved_by: 'approvedBy', spec_section: 'specSection', notes: 'notes' };
  function finishBrief(doc, c, L, r) {
    const items = doc.execItems || [];
    const sub = r.submittalId ? items.find(i => i.id === r.submittalId) : null;
    const chg = r.changeId ? items.find(i => i.id === r.changeId) : null;
    return {
      id: r.id, zone: L.finishZone(r) === 'exterior' ? 'חוץ' : 'פנים', category: L.finishCat(r), element: r.element || '', location: r.location || '', material: r.material || '', finish: r.finish || '',
      color: r.color || '', color_hex: r.colorHex || undefined, supplier: r.supplier || '', approved_at: r.approvedAt || null, approved_by: r.approvedBy || undefined,
      status: L.finishStatus(r, items) === 'approved' ? 'מאושר' : 'ממתין לאישור',
      submittal: sub ? sub.number + ' (' + stLabel(L, sub) + ')' : undefined, change: chg ? chg.number + ' (' + stLabel(L, chg) + ')' : undefined,
      spec_section: r.specSection || undefined, discipline: discLabel(doc, c, r.discipline) || undefined, notes: r.notes || undefined,
      files: (r.files || []).length || undefined, image: r.image ? true : undefined
    };
  }
  function findFinish(doc, ref) {
    const rows = doc.finishes || [];
    const hit = rows.find(r => r.id === ref);
    if (hit) return hit;
    const text = r => [r.category, r.element, r.location, r.material, r.finish, r.color, r.supplier].join(' ');
    const loose = rows.filter(r => ref && bare(text(r)).includes(bare(ref)));
    if (loose.length === 1) return loose[0];
    const list = rows.slice(0, 15).map(r => r.id + ' ' + [r.element, r.location, r.material].filter(Boolean).join(' · ')).join(' | ');
    if (loose.length > 1) throw new ToolError(`"${ref}" matches ${loose.length} finishes rows; pass the row id. ` + loose.slice(0, 10).map(r => r.id + ' ' + [r.element, r.location, r.material].filter(Boolean).join(' · ')).join(' | '));
    throw new ToolError(`No finishes row "${ref}". Rows: ` + (list || 'none') + '. Use list_finishes.');
  }
  function pickZone(L, ref) {
    const r = norm(ref);
    const hit = L.FINISH_ZONES.find(z => z.id === r || norm(z.label) === r || bare(z.label).includes(bare(ref)));
    if (!hit) throw new ToolError(`Unknown zone "${ref}". Zones: exterior (חוץ), interior (פנים)`);
    return hit.id;
  }
  // a category the zone knows ("אלומיניום" → "אלומיניום וזכוכית"), else the text as given
  function pickFinishCat(L, zone, ref) {
    const t = String(ref || '').trim();
    if (!t) return '';
    const cats = (L.FINISH_ZONES.find(z => z.id === zone) || {}).cats || [];
    return cats.find(c => bare(c) === bare(t)) || cats.find(c => bare(c).startsWith(bare(t))) || t;
  }
  const PARTY_SCHEMA = { type: 'object', properties: { party: { type: 'string', description: 'architect | contractor | supervisor | consultant (or אדריכל / קבלן / מפקח / יועץ)' }, name: { type: 'string', description: 'Person or company, e.g. the consultant\'s field' } }, required: ['party'], additionalProperties: false };

  /* ── meetings, as the page's ישיבות screen keeps them ── */
  const ITEM_ACTIONS = { none: null, task: 'משימה', update: 'עדכון', subtask: 'תת-משימה', link: 'קישור למשימה', principle: 'עקרון תכנון', milestone: 'אבן דרך' };
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
        Object.assign(item, { itemType: action, createdTaskTrackId: s.id, linkedTaskId: t.id, linkedTaskSheetId: s.id });
        Object.assign(res, { task: t.title, stage: pathOf(st, s), link: linkOf(base, proj.id, s.id, t.id) });
      } else if (action === 'link') {
        // the row points at an existing task; the task itself is not changed
        if (!x.task) throw new ToolError(`Item "${topic}": a link needs the existing task (id or title)`);
        const { t, s, st } = findTask(doc, x.task);
        Object.assign(item, { linkedTaskId: t.id, linkedTaskSheetId: s.id });
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
      action: { type: 'string', enum: Object.keys(ITEM_ACTIONS), description: 'What the item becomes: none (minutes only), task (new task), update (update on an existing task), subtask (subtask of an existing task), link (point the item at an existing task without changing it), principle (planning principle), milestone' },
      title: { type: 'string', description: 'Task / subtask / milestone title when it should differ from the topic' },
      task: { type: 'string', description: 'For update / subtask / link: the existing task (id or unique part of its title)' },
      update_status: { type: 'string', description: 'For update: missing | progress | sent | comments | update | approved' },
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
            if (args.mine && !(t.assigneeIds || []).includes(c.me.id) && !(t.subtasks || []).some(x => !x.done && (x.assigneeIds || []).includes(c.me.id))) return;
            if (words.length) {
              const hay = bare([t.title, t.comment, textOf(t.description), ...(t.events || []).map(e => (e.title || '') + ' ' + (e.note || '')), ...(t.subtasks || []).map(x => x.title)].join(' '));
              if (!words.every(w => hay.includes(w))) return;
            }
            out.push({
              id: t.id, project: p.code, stage: st ? st.track + ' › ' + st.name : s.name, title: t.title,
              status: (sts.find(x => x.id === status) || {}).label || status,
              discipline: (discs.find(x => x.id === t.discipline) || {}).label || t.discipline || undefined,
              due: t.dueDate || undefined,
              latest_update: lu ? `${lu.date || ''} ${evLabel(lu.status)}${lu.title ? ' — ' + lu.title : ''}`.trim() : undefined,
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
          updates: evChrono(t.events).slice(-15).map(e => ({ date: e.date, status: evLabel(e.status), owner: lbl(discs, e.assignee), title: e.title || undefined, note: e.note || undefined })),
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
              update_status: { type: 'string', description: 'missing | progress | sent | comments | update | approved (or the Hebrew label)' },
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
    },
    {
      name: 'list_exec_items',
      exec: true,
      title: 'Execution items',
      description: 'The execution track (מסלול ביצוע) log of one project: Issues (ISS), RFIs, submittals (SUB, הגשות) and contractor change / waiver requests (CHG, ויתורים ושינויים) — number, status, who holds the ball and for how many working days. Open items only unless include_closed.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          type: { type: 'string', description: 'issue | rfi | submittal | change; omit for all' },
          query: { type: 'string', description: 'Words in the title or description' },
          include_closed: { type: 'boolean' }
        },
        required: ['project'], additionalProperties: false
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const L = execGate(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const doc = readJson(p.file);
        const type = pickExecType(L, args.type);
        const today = todayISO();
        const items = (doc.execItems || []).filter(i => (!type || i.type === type) && (args.include_closed || !L.execIsClosed(i))
          && (!args.query || bare(i.title + ' ' + i.description + ' ' + (i.tenderSpec || '') + ' ' + (i.proposed || '')).includes(bare(args.query))));
        items.sort((a, b) => (L.execWaiting(b, today) - L.execWaiting(a, today)) || (a.seq - b.seq));
        return { project: p.code + ' ' + p.name, today, count: items.length, items: items.map(i => execBrief(doc, c, L, i, today)) };
      }
    },
    {
      name: 'get_exec_item',
      exec: true,
      title: 'Execution item',
      description: 'One execution item in full: description, the whole thread of replies (who wrote, who got the ball), submittal rounds (Rev A/B/C) with decisions, waiting days per party, linked tasks and finishes rows.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, item: { type: 'string', description: 'Number (RFI-004, SUB-2) or id' } }, required: ['project', 'item'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const L = execGate(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const doc = readJson(p.file);
        const it = findExec(doc, args.item, L);
        const today = todayISO();
        return {
          project: p.code + ' ' + p.name,
          item: {
            ...execBrief(doc, c, L, it, today), description: it.description,
            thread: (it.responses || []).map(r => ({ at: String(r.at || '').slice(0, 10), kind: r.kind, by: L.execPartyLabel({ party: r.party, name: r.name }), text: r.body || undefined, ball_to: r.ballTo ? L.execPartyLabel(r.ballTo) : undefined, files: (r.files || []).length || undefined })),
            rounds: it.type === 'submittal' ? (it.revisions || []).map(v => ({ rev: v.label, submitted: String(v.submittedAt || '').slice(0, 10), decision: v.decision ? stLabel(L, { type: 'submittal', status: v.decision }) : null, notes: v.notes || undefined, decided_by: v.decidedBy || undefined })) : undefined,
            waiting_by_party: L.execBallDays(it, today).map(x => ({ party: L.execPartyLabel(x), workdays: x.days })),
            finishes_rows: (doc.finishes || []).filter(r => r.submittalId === it.id || r.changeId === it.id).map(r => ({ id: r.id, element: r.element, material: r.material }))
          },
          link: execLinkOf(c.base, p.id, it.id)
        };
      }
    },
    {
      name: 'create_exec_item',
      exec: true,
      title: 'Open an execution item',
      description: 'Open a new Issue, RFI, submittal or contractor change / waiver request in a project\'s execution log. It gets the next official number. The office records every party\'s messages, so opened_by is who raised it (a contractor RFI is opened_by contractor). Confirm with the user before calling.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          type: { type: 'string', description: 'issue | rfi | submittal | change' },
          title: { type: 'string' },
          description: { type: 'string', description: 'The question / problem / what is submitted' },
          opened_by: PARTY_SCHEMA,
          ball_to: { ...PARTY_SCHEMA, description: 'Who must act now; default the architect when another party opened it, else the contractor' },
          due_date: { type: 'string', description: 'YYYY-MM-DD; default by type (RFI 7, submittal 10, change 7 working days)' },
          discipline: { type: 'string', description: 'Discipline (תחום) from get_project' },
          priority: { type: 'string', description: 'Priority (עדיפות) from get_project' },
          spec_section: { type: 'string', description: 'Spec / BOQ section' },
          tender_spec: { type: 'string', description: 'change: what the tender specified' },
          tender_ref: { type: 'string', description: 'change: tender clause' },
          proposed: { type: 'string', description: 'change: what the contractor proposes instead' }
        },
        required: ['project', 'type', 'title'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        const L = execGate(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const type = pickExecType(L, args.type);
        checkDates(args.due_date);
        const res = writeProject(p, c.me, doc => {
          const openedBy = pickParty(L, args.opened_by || { party: type === 'issue' ? 'architect' : 'contractor' }, 'opened_by') ;
          const ballTo = args.ball_to ? pickParty(L, args.ball_to, 'ball_to') : { party: openedBy.party === 'architect' ? 'contractor' : 'architect', name: '' };
          const now = new Date().toISOString();
          const dd = execLogic().dueDays[type];
          const seqMap = doc.execSeq || {};
          const it = {
            ...L.execNewItem(doc.execItems || [], {
              type, title: String(args.title).trim(), description: String(args.description || '').trim(), openedBy, ballTo,
              dueDate: args.due_date || (dd ? L.execAddWorkdays(now.slice(0, 10), dd) : ''),
              discipline: args.discipline ? pickOption(projList(doc, 'disciplines', c.reg), args.discipline, 'discipline') : '',
              priority: args.priority ? pickOption(projList(doc, 'priorities', c.reg), args.priority, 'priority') : '',
              specSection: args.spec_section || '', source: { kind: 'claude' },
              tenderSpec: args.tender_spec, tenderRef: args.tender_ref, proposed: args.proposed
            }, now, seqMap),
            createdById: c.me.id
          };
          doc.execItems = [...(doc.execItems || []), it];
          doc.execSeq = L.execBumpSeq(seqMap, it);
          return execBrief(doc, c, L, it, todayISO());
        });
        return { project: p.code + ' ' + p.name, created: res, link: execLinkOf(c.base, p.id, res.id) };
      }
    },
    {
      name: 'update_exec_item',
      exec: true,
      title: 'Update an execution item',
      description: 'Record what happened on an execution item, the way the item panel does: a reply (optionally passing the ball), an RFI answer, closing or reopening, a manual status (Issue / RFI), a new submittal round, a decision on a submittal round or on a change request, and/or edits to its fields. Confirm with the user before calling.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          item: { type: 'string', description: 'Number (RFI-004) or id' },
          action: { type: 'string', enum: ['reply', 'answer', 'close', 'reopen', 'status', 'new_revision', 'decide'], description: 'reply: a message in the thread; answer: the official RFI answer; close / reopen; status: set an Issue / RFI status; new_revision: the contractor resubmits (next Rev); decide: the architect\'s decision on the current submittal round or on a change request. Omit to edit fields only.' },
          text: { type: 'string', description: 'The message / answer / decision notes' },
          by: { ...PARTY_SCHEMA, description: 'Who wrote it; default the architect (you)' },
          ball_to: { ...PARTY_SCHEMA, description: 'reply / answer / reopen: who must act next' },
          status: { type: 'string', description: 'action status: the new status (id or Hebrew label)' },
          decision: { type: 'string', description: 'decide — submittal: approved | approved_notes | rejected; change: approved | approved_cond | rejected' },
          approved_text: { type: 'string', description: 'decide on a change: what was approved in practice (default: what was proposed)' },
          finish_row: { type: 'string', description: 'decide on an approved change: the finishes row it changes (id or words); it gets the change link and a "שונה לפי CHG-…" note' },
          fields: {
            type: 'object',
            properties: {
              title: { type: 'string' }, description: { type: 'string' }, due_date: { type: 'string' }, discipline: { type: 'string' }, priority: { type: 'string' }, spec_section: { type: 'string' },
              tender_spec: { type: 'string' }, tender_ref: { type: 'string' }, proposed: { type: 'string' }
            },
            additionalProperties: false
          }
        },
        required: ['project', 'item'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        const L = execGate(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const f = args.fields || {};
        checkDates(f.due_date);
        const res = writeProject(p, c.me, doc => {
          const cur = findExec(doc, args.item, L);
          let it = { ...cur };
          const by = args.by ? pickParty(L, args.by, 'by') : { party: 'architect', name: c.me.name };
          const ballTo = args.ball_to ? pickParty(L, args.ball_to, 'ball_to') : null;
          const text = String(args.text || '').trim();
          const done = [];
          // fields first, so a decision on a change uses the edited proposal
          const set = (k, v, label) => { if (v != null && v !== it[k]) { it[k] = v; done.push(label); } };
          if (f.title != null) set('title', String(f.title).trim(), 'כותרת');
          if (f.description != null) set('description', String(f.description), 'תיאור');
          if (f.due_date != null) set('dueDate', f.due_date, 'תאריך יעד');
          if (f.discipline != null) set('discipline', f.discipline ? pickOption(projList(doc, 'disciplines', c.reg), f.discipline, 'discipline') : '', 'תחום');
          if (f.priority != null) set('priority', f.priority ? pickOption(projList(doc, 'priorities', c.reg), f.priority, 'priority') : '', 'עדיפות');
          if (f.spec_section != null) set('specSection', String(f.spec_section), 'סעיף מפרט');
          if (it.type === 'change') {
            if (f.tender_spec != null) set('tenderSpec', String(f.tender_spec), 'במכרז');
            if (f.tender_ref != null) set('tenderRef', String(f.tender_ref), 'סעיף מכרז');
            if (f.proposed != null) set('proposed', String(f.proposed), 'מוצע');
          } else if (['tender_spec', 'tender_ref', 'proposed'].some(k => f[k] != null)) throw new ToolError('tender_spec / tender_ref / proposed belong to change requests only');
          let finRow = null;
          const a = args.action;
          if (a === 'reply' || a === 'answer' || a === 'close' || a === 'reopen') {
            if (a === 'answer' && it.type !== 'rfi') throw new ToolError('answer is for RFIs; use reply');
            if (a === 'close' && (it.type === 'submittal' || it.type === 'change')) throw new ToolError(`A ${L.EXEC_TYPES[it.type].label} closes by a decision: use action decide`);
            if (a === 'close' && L.execIsClosed(it)) throw new ToolError(it.number + ' is already closed');
            if (a === 'reopen' && !L.execIsClosed(it)) throw new ToolError(it.number + ' is open');
            if ((a === 'reply' || a === 'answer') && !text) throw new ToolError('A ' + a + ' needs text');
            it = L.execRespond(it, { kind: a, party: by.party, name: by.name, body: text, ballTo: a === 'reopen' ? (ballTo || { party: 'architect', name: '' }) : ballTo }, new Date().toISOString());
            done.push(a);
          } else if (a === 'status') {
            if (it.type === 'submittal' || it.type === 'change') throw new ToolError(`A ${L.EXEC_TYPES[it.type].label} moves by rounds and decisions, not a manual status`);
            if (!args.status) throw new ToolError('Give the new status');
            const next = L.execSetStatus(it, pickExecStatus(L, it.type, args.status), { name: c.me.name }, new Date().toISOString());
            if (next !== it) { it = next; done.push('סטטוס'); }
          } else if (a === 'new_revision') {
            if (it.type !== 'submittal') throw new ToolError('new_revision is for submittals');
            it = L.execAddRevision(it, { party: args.by ? by.party : 'contractor', name: args.by ? by.name : '', body: text }, new Date().toISOString());
            done.push('סבב חדש');
          } else if (a === 'decide') {
            if (!args.decision) throw new ToolError('Give the decision');
            if (it.type === 'submittal') {
              const dec = pickExecStatus(L, 'submittal', args.decision);
              if (dec === 'submitted') throw new ToolError('Decisions: approved, approved_notes, rejected');
              const next = L.execDecide(it, { decision: dec, notes: text, name: c.me.name, ballTo }, new Date().toISOString());
              if (next === it) throw new ToolError(`Rev ${((it.revisions || []).slice(-1)[0] || {}).label} of ${it.number} is already decided; a new decision needs a new round (new_revision)`);
              it = next;
            } else if (it.type === 'change') {
              const dec = pickExecStatus(L, 'change', args.decision);
              if (dec === 'requested' || dec === 'in_review') throw new ToolError('Decisions: approved, approved_cond, rejected');
              if (dec !== 'approved' && !text) throw new ToolError('A conditional approval or a rejection needs notes (text)');
              if (L.execIsClosed(it)) throw new ToolError(it.number + ' is already decided; reopen it first');
              it = L.execDecideChange(it, { decision: dec, approvedText: String(args.approved_text || '').trim(), notes: text, name: c.me.name }, new Date().toISOString());
              if (args.finish_row && dec !== 'rejected') finRow = findFinish(doc, args.finish_row);
            } else throw new ToolError('decide is for submittals and change requests; Issues / RFIs close with action close');
            done.push('החלטה');
          } else if (a) throw new ToolError('Unknown action ' + a);
          if (args.finish_row && !finRow) throw new ToolError('finish_row goes with deciding a change as approved / approved_cond');
          if (!done.length) throw new ToolError('Nothing to change: give an action and/or fields');
          doc.execItems = (doc.execItems || []).map(x => x.id === it.id ? it : x);
          if (finRow) doc.finishes = doc.finishes.map(r => r.id === finRow.id ? { ...r, changeId: it.id, notes: L.finishNoteForChange(r.notes, it.number, it.approvedText) } : r);
          return { item: execBrief(doc, c, L, it, todayISO()), changed: done, finish_row: finRow ? finRow.id : undefined };
        });
        return { project: p.code + ' ' + p.name, updated: res.item, changed: res.changed, finish_row: res.finish_row, link: execLinkOf(c.base, p.id, res.item.id) };
      }
    },
    {
      name: 'list_finishes',
      exec: true,
      title: 'Finishes schedule',
      description: 'A project\'s approved finishes schedule (לוח גמרים), split into exterior (גמרי חוץ) and interior (גמרי פנים) finishes, each by category: per row the element and location, material · finish · colour, supplier, approval date and status, and the linked submittal / change request. Row ids are for update_finish.',
      inputSchema: { type: 'object', properties: { project: { type: 'string' }, zone: { type: 'string', description: 'exterior (חוץ) | interior (פנים)' }, category: { type: 'string' }, query: { type: 'string', description: 'Words in any column' } }, required: ['project'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args, c) {
        const L = execGate(c.me);
        const p = findProject(c.me, c.reg, args.project);
        const doc = readJson(p.file);
        const text = r => [r.category, r.element, r.location, r.material, r.finish, r.color, r.supplier, r.notes, r.specSection].join(' ');
        const zone = args.zone ? pickZone(L, args.zone) : null;
        const rows = (doc.finishes || []).filter(r => (!zone || L.finishZone(r) === zone) && (!args.category || bare(L.finishCat(r)).includes(bare(args.category))) && (!args.query || bare(text(r)).includes(bare(args.query))));
        return { project: p.code + ' ' + p.name, count: rows.length, rows: rows.map(r => finishBrief(doc, c, L, r)) };
      }
    },
    {
      name: 'update_finish',
      exec: true,
      title: 'Add or change a finishes row',
      description: 'Change a row in the finishes schedule (לוח גמרים) — material, finish, colour, supplier, approval date, notes, linked submittal or change — or add a new row (omit row). from_submittal fills a new row from an approved submittal\'s last decided round. Confirm with the user before calling. To add a photo or a signed document, use attach_file.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          row: { type: 'string', description: 'Row id (from list_finishes) or words that identify one row; omit to add a row' },
          from_submittal: { type: 'string', description: 'New row only: the submittal number to fill it from' },
          zone: { type: 'string', description: 'exterior (גמרי חוץ) | interior (גמרי פנים); a new row defaults to interior' },
          category: { type: 'string', description: 'Exterior and interior: ריצוף, קירות, אלומיניום וזכוכית, תקרות, מסגרות. Interior only: נגרות, מחיצות קלות בשירותים, משטחים וכיורים, מעליות. Another name makes its own group.' },
          element: { type: 'string' }, location: { type: 'string' }, material: { type: 'string' }, finish: { type: 'string' },
          color: { type: 'string', description: 'Colour name / code, e.g. RAL 9016' },
          color_hex: { type: 'string', description: '#RRGGBB swatch' },
          supplier: { type: 'string' },
          approved_at: { type: 'string', description: 'YYYY-MM-DD, or "" to clear' },
          approved_by: { type: 'string' },
          spec_section: { type: 'string' },
          discipline: { type: 'string' },
          notes: { type: 'string', description: 'Replaces the notes' },
          submittal: { type: 'string', description: 'Link a submittal (number), or "" to unlink' },
          change: { type: 'string', description: 'Link a change request (number), or "" to unlink' }
        },
        required: ['project'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        const L = execGate(c.me);
        const p = findProject(c.me, c.reg, args.project);
        if (args.approved_at) checkDates(args.approved_at);
        if (args.color_hex && !/^#[0-9a-f]{6}$/i.test(args.color_hex)) throw new ToolError('color_hex is #RRGGBB');
        const res = writeProject(p, c.me, doc => {
          const isNew = !args.row;
          if (!isNew && args.from_submittal) throw new ToolError('from_submittal is for a new row (omit row)');
          let row;
          if (isNew) {
            if (args.from_submittal) {
              const s = findExec(doc, args.from_submittal, L);
              if (s.type !== 'submittal') throw new ToolError(s.number + ' is not a submittal');
              const dup = (doc.finishes || []).find(r => r.submittalId === s.id);
              if (dup) throw new ToolError(`${s.number} already has a finishes row (${dup.id} ${dup.element}); change that row instead`);
              row = L.finishFromSubmittal(s);
            } else row = { id: uid(), zone: 'interior', category: '', element: '', location: '', material: '', finish: '', color: '', colorHex: '', supplier: '', approvedAt: '', approvedBy: '', files: [], image: null, submittalId: null, changeId: null, specSection: '', discipline: '', notes: '' };
          } else row = { ...findFinish(doc, args.row) };
          // a row from before the exterior / interior split is written in the new form
          row.zone = L.finishZone(row); row.category = L.finishCat(row);
          if (args.zone != null) row.zone = pickZone(L, args.zone);
          if (args.category != null) row.category = pickFinishCat(L, row.zone, args.category);
          for (const [k, key] of Object.entries(FINISH_FIELDS)) if (args[k] != null) row[key] = String(args[k]).trim();
          if (args.discipline != null) row.discipline = args.discipline ? pickOption(projList(doc, 'disciplines', c.reg), args.discipline, 'discipline') : '';
          const link = (ref, type) => {
            if (ref === '') return null;
            const it = findExec(doc, ref, L);
            if (it.type !== type) throw new ToolError(`${it.number} is not a ${type}`);
            return it.id;
          };
          if (args.submittal != null) row.submittalId = link(args.submittal, 'submittal');
          if (args.change != null) row.changeId = link(args.change, 'change');
          if (![row.element, row.material, row.category].some(x => String(x || '').trim())) throw new ToolError('A finishes row needs at least an element, a material or a category');
          doc.finishes = isNew ? [...(doc.finishes || []), row] : doc.finishes.map(r => r.id === row.id ? row : r);
          return { row: finishBrief(doc, c, L, row), added: isNew };
        });
        return { project: p.code + ' ' + p.name, ...res };
      }
    },    {
      name: 'attach_file',
      title: 'Attach a photo or file',
      description: 'A link where the person adds photos or files to one task or one finishes row (לוח גמרים) — from the phone\'s camera or gallery, or from any computer. You cannot pass the file itself: when the person wants a photo or file attached (even one they already sent you in the chat), call this and give them the link; they open it, pick the file, and it is saved straight into Project Hub. On a finishes row the first photo becomes the row\'s image when it has none (replace_image: replace it) and every other file goes to the row\'s documents. Images, PDF, Outlook .msg / .eml. The link is for this one task or row and works for 30 minutes. It changes nothing until a file is uploaded, so no confirmation is needed.',
      inputSchema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          task: { type: 'string', description: 'Task id (from search_tasks) or a unique part of its title' },
          finish_row: { type: 'string', description: 'Finishes row id (from list_finishes) or words that identify one row' },
          replace_image: { type: 'boolean', description: 'Finishes row: the first photo replaces the row\'s current image' }
        },
        required: ['project'], additionalProperties: false
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args, c) {
        canWrite(c.me);
        if (!args.task === !args.finish_row) throw new ToolError('Pass either task or finish_row (one of them)');
        const p = findProject(c.me, c.reg, args.project);
        const doc = readJson(p.file);
        let target;
        if (args.task) {
          const { t, s, st } = findTask(doc, args.task);
          target = { kind: 'task', id: t.id, label: t.title, where: pathOf(st, s), link: linkOf(c.base, p.id, s.id, t.id) };
        } else {
          execGate(c.me);
          const r = findFinish(doc, args.finish_row);
          target = { kind: 'finish', id: r.id, label: [r.category, r.element, r.location].filter(x => String(x || '').trim()).join(' · ') || r.material || r.id, where: 'לוח גמרים', link: `${c.base}/project_hub_01?project=${encodeURIComponent(p.id)}` };
        }
        const tok = rand(24);
        const exp = Date.now() + ATTACH_TTL;
        const st = loadStore();
        st.uploads[sha(tok)] = { who: c.who, projectId: p.id, project: p.code + ' ' + p.name, ...target, replaceImage: !!args.replace_image, exp, files: 0 };
        saveStore();
        return {
          project: p.code + ' ' + p.name,
          attach_to: (target.kind === 'task' ? 'task ' : 'finishes row ') + target.id + ' ' + target.label,
          upload_link: `${c.base}/attach?t=${tok}`,
          expires_at: new Date(exp).toISOString(),
          tell_the_user: 'Give the person this link to open and pick the photo or file; it is saved to the item as soon as it uploads.'
        };
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
    'Dates are YYYY-MM-DD. Defaults: start today, due in 14 days. After writing, give the user the task links.',
    'The execution track (מסלול ביצוע) is not tasks: Issues, RFIs, submittals (הגשות), contractor changes / waivers (ויתורים ושינויים) and the finishes schedule (לוח גמרים, חומרי גמר) have their own tools (list_exec_items, get_exec_item, create_exec_item, update_exec_item, list_finishes, update_finish) when the person has access. Read first, show what you will write, write after a yes.',
    'To add a photo or file to a task or a finishes row, call attach_file and give the person the link it returns: they pick the file there (camera, gallery or computer). You cannot send a file through the tools, even one shown to you in the chat.'
  ].join('\n');

  /* ── OAuth: storage ── */
  let store = null;
  function loadStore() {
    if (!store) {
      store = readJson(STORE_FILE);
      store.clients = store.clients || {};
      store.codes = store.codes || {};
      store.tokens = store.tokens || {};
      store.uploads = store.uploads || {};
      if (!store.secret) { store.secret = rand(32); saveStore(); }
    }
    return store;
  }
  function saveStore() {
    const now = Date.now();
    for (const k of Object.keys(store.codes)) if (store.codes[k].exp < now) delete store.codes[k];
    for (const k of Object.keys(store.tokens)) if (store.tokens[k].exp < now) delete store.tokens[k];
    for (const k of Object.keys(store.uploads)) if (store.uploads[k].exp < now) delete store.uploads[k];
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
    const since = st.since || now;
    st.tokens[sha(access)] = { kind: 'access', who, client: clientId, exp: now + ACCESS_TTL, since };
    st.tokens[sha(refresh)] = { kind: 'refresh', who, client: clientId, exp: now + REFRESH_TTL, since };
    delete st.since;
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
      st.since = t.since;
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

  /* ── a person's own connection, for Settings ← Claude ── */
  let lastUseSave = 0;
  const samePerson = (a, b) => a && b && (a.email ? String(a.email).toLowerCase() === String(b.email || '').toLowerCase() : !b.email && a.name === b.name);
  function handleConnection(req, res, url, user) {
    const st = loadStore();
    const now = Date.now();
    const mine = Object.entries(st.tokens).filter(([, t]) => t.exp > now && samePerson(t.who, user));
    if (url.pathname === '/api/claude-connection' && req.method === 'GET') {
      const used = mine.map(([, t]) => t.used || 0).reduce((a, b) => Math.max(a, b), 0);
      const since = mine.map(([, t]) => t.since || 0).filter(Boolean).reduce((a, b) => Math.min(a, b), Infinity);
      res.setHeader('Cache-Control', 'no-store');
      return sendJson(res, 200, { connected: mine.length > 0, since: since === Infinity ? null : since, lastUsed: used || null });
    }
    if (url.pathname === '/api/claude-connection/revoke' && req.method === 'POST') {
      for (const [k] of mine) delete st.tokens[k];
      // links for adding files were made through that connection
      for (const [k, u] of Object.entries(st.uploads)) if (samePerson(u.who, user)) delete st.uploads[k];
      saveStore();
      return sendJson(res, 200, { ok: true, revoked: mine.length });
    }
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  /* ── adding a file through a link from attach_file. Claude cannot carry the file, so the
     person opens the link (on the phone: camera or gallery) and the page posts it here.
     The link is the credential, like a bearer token: one task or finishes row, 30 minutes,
     a few files. Each upload acts as the person who asked, with their role at that moment. ── */
  function uploadOf(url) {
    const t = url.searchParams.get('t') || '';
    const u = t && loadStore().uploads[sha(t)];
    return u && u.exp > Date.now() ? u : null;
  }
  function attachInto(u, saved, name) {
    const reg = readJson(REGISTRY);
    let me, p;
    try { me = identify(u.who, reg); canWrite(me); p = findProject(me, reg, u.projectId); }
    catch (e) { if (e instanceof ToolError) throw new ToolError('אין לך הרשאה להוסיף קבצים לפרויקט הזה'); throw e; }
    return writeProject(p, me, doc => {
      if (u.kind === 'task') {
        let hit = null;
        eachTask(doc, (t, s) => { if (t.id === u.id) hit = { t, s }; });
        if (!hit) throw new ToolError('המשימה כבר לא קיימת בפרויקט');
        const n = { ...hit.t, attachments: [...(hit.t.attachments || []), { id: uid(), name, size: saved.bytes, type: saved.type, url: saved.url }],
          activityLog: [...(hit.t.activityLog || []), logEntry(me, `צורף קובץ "${name}"`)] };
        putTask(doc, hit.s.id, n);
        return 'file';
      }
      execGate(me);
      const row = (doc.finishes || []).find(r => r.id === u.id);
      if (!row) throw new ToolError('השורה כבר לא קיימת בלוח הגמרים');
      const n = { ...row };
      let as = 'file';
      if (/^image\//.test(saved.type) && (!row.image || (u.replaceImage && !u.replaced))) { n.image = { url: saved.url, name }; as = 'image'; u.replaced = true; }
      else n.files = [...(row.files || []), { id: uid(), url: saved.url, name }];
      doc.finishes = doc.finishes.map(r => r.id === n.id ? n : r);
      return as;
    });
  }
  async function handleAttachApi(req, res, url) {
    res.setHeader('Cache-Control', 'no-store');
    const u = uploadOf(url);
    if (!u) { sendJson(res, 410, { error: 'expired' }); return; }
    if (req.method === 'GET') { sendJson(res, 200, { project: u.project, kind: u.kind, label: u.label, where: u.where, link: u.link, exp: u.exp, files: u.files, max: ATTACH_MAX_FILES }); return; }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    if (u.files >= ATTACH_MAX_FILES) { sendJson(res, 429, { error: 'too_many' }); return; }
    const name = String(url.searchParams.get('name') || 'file').replace(/[\u0000-\u001f\\/]/g, '').slice(0, 120) || 'file';
    let buf;
    try { buf = await readRequestBuffer(req); } catch (e) { sendJson(res, 413, { error: 'too_large' }); return; }
    if (!buf.length) { sendJson(res, 400, { error: 'empty' }); return; }
    const saved = saveAttachment('project-hub-01', buf, req.headers['content-type'], name);
    if (!saved) { sendJson(res, 415, { error: 'type' }); return; }
    try {
      const as = attachInto(u, saved, name);
      u.files++;
      saveStore();
      sendJson(res, 200, { ok: true, as, url: saved.url });
    } catch (e) {
      if (!(e instanceof ToolError)) console.error('attach', e);
      sendJson(res, e instanceof ToolError ? 403 : 500, { error: e instanceof ToolError ? e.message : 'server_error' });
    }
  }
  function attachPage(res) {
    htmlPage(res, 200, 'צירוף קובץ', `
<p id="what" class="who" data-i18n-skip>…</p>
<p id="msg"></p>
<div class="btns" id="pick" hidden>
  <label class="primary btn"><span data-t="📷 צילום">📷 צילום</span><input type="file" accept="image/*" capture="environment" hidden></label>
  <label class="btn"><span data-t="🖼 תמונה או קובץ">🖼 תמונה או קובץ</span><input type="file" accept="image/*,application/pdf,.pdf,.msg,.eml" multiple hidden></label>
</div>
<ul id="done" data-i18n-skip></ul>
<p class="fine"><a id="back" hidden data-t="פתח ב-Project Hub">פתח ב-Project Hub</a></p>
<style>.btn{flex:1;display:block;text-align:center;font-size:14px;font-weight:700;padding:12px 10px;border-radius:10px;border:1px solid #cfd6e3;background:#fff;color:#1e1f21;cursor:pointer}
.btn.primary{background:#2563EB;border-color:#2563EB;color:#fff}#done{list-style:none;padding:0}#done li{font-size:13.5px;padding:4px 0}#msg.err{color:#b91c1c}
@media (prefers-color-scheme:dark){.btn{background:#222b38;color:#e6e8eb;border-color:#3a4556}.btn.primary{background:#2563EB;color:#fff}#msg.err{color:#f87171}}</style>
<script>
(function(){
var HE_EN={'צירוף קובץ':'Attach a file','📷 צילום':'📷 Take a photo','🖼 תמונה או קובץ':'🖼 Photo or file','פתח ב-Project Hub':'Open in Project Hub',
'משימה':'Task','לוח גמרים':'Finishes schedule','בחר תמונה או קובץ. הוא יישמר מיד.':'Pick a photo or file. It is saved straight away.',
'הקישור פג או כבר לא בתוקף. בקש מ-Claude קישור חדש.':'This link has expired. Ask Claude for a new one.','מעלה…':'Uploading…',
'נשמר':'Saved','נשמר כתמונת השורה':'Saved as the row’s image','הקובץ לא נשמר':'The file was not saved','סוג הקובץ לא נתמך (תמונה, PDF, msg, eml)':'Unsupported file type (image, PDF, msg, eml)',
'הקובץ גדול מדי':'The file is too large','אין לך הרשאה להוסיף קבצים לפרויקט הזה':'You may not add files to this project','הגעת למספר הקבצים המרבי לקישור הזה':'This link has reached its file limit','אפשר להוסיף עוד, או לסגור את הדף.':'You can add more, or close this page.'};
var en=false;try{en=localStorage.getItem('appLang')==='en'}catch(e){}
var T=function(h){return en&&HE_EN[h]||h};
if(en){document.documentElement.dir='ltr';document.documentElement.lang='en';document.title=T('צירוף קובץ');document.querySelector('h1').textContent=T('צירוף קובץ');
document.querySelectorAll('[data-t]').forEach(function(n){n.textContent=T(n.getAttribute('data-t'))});}
var t=new URLSearchParams(location.search).get('t')||'';var api='/api/attach?t='+encodeURIComponent(t);
var $=function(id){return document.getElementById(id)};var msg=function(s,err){$('msg').textContent=s;$('msg').className=err?'err':''};
fetch(api).then(function(r){if(!r.ok)throw 0;return r.json()}).then(function(i){
  var w=$('what');w.textContent='';[i.project,' · '+(i.kind==='task'?T('משימה'):T('לוח גמרים'))+': ',i.label].forEach(function(x,k){var e=document.createElement(k===1?'span':'bdi');e.textContent=x;w.appendChild(e)});
  $('back').href=i.link;$('back').hidden=false;$('pick').hidden=false;msg(T('בחר תמונה או קובץ. הוא יישמר מיד.'));
}).catch(function(){$('what').hidden=true;msg(T('הקישור פג או כבר לא בתוקף. בקש מ-Claude קישור חדש.'),true)});
/* phone photos: HEIC or very large pictures are redrawn as a JPEG of at most 2560px */
function shrink(f){return new Promise(function(ok){
  if(!/^image\\//.test(f.type)||f.type==='image/gif'||f.type==='image/svg+xml'||(f.size<3e6&&/^image\\/(jpeg|png|webp)$/.test(f.type)))return ok(f);
  var img=new Image(),u=URL.createObjectURL(f);img.onload=function(){var k=Math.min(1,2560/Math.max(img.width,img.height)),c=document.createElement('canvas');
  c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);
  c.toBlob(function(b){ok(b?new File([b],f.name.replace(/\\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'}):f)},'image/jpeg',.85)};img.onerror=function(){ok(f)};img.src=u;});}
var ERR={415:'סוג הקובץ לא נתמך (תמונה, PDF, msg, eml)',413:'הקובץ גדול מדי',429:'הגעת למספר הקבצים המרבי לקישור הזה',410:'הקישור פג או כבר לא בתוקף. בקש מ-Claude קישור חדש.'};
async function send(list){for(var i=0;i<list.length;i++){var f=await shrink(list[i]);msg(T('מעלה…')+' '+f.name);
  try{var r=await fetch(api+'&name='+encodeURIComponent(f.name),{method:'POST',headers:{'Content-Type':/^image\\//.test(f.type)?f.type:'application/octet-stream'},body:f});
    var j=await r.json().catch(function(){return{}});
    if(!r.ok){msg(T('הקובץ לא נשמר')+' — '+(ERR[r.status]?T(ERR[r.status]):(j.error?T(j.error):r.status)),true);return;}
    var li=document.createElement('li');li.textContent='✓ '+f.name+' — '+T(j.as==='image'?'נשמר כתמונת השורה':'נשמר');$('done').appendChild(li);
  }catch(e){msg(T('הקובץ לא נשמר'),true);return;}}
  msg(T('אפשר להוסיף עוד, או לסגור את הדף.'));}
document.querySelectorAll('input[type=file]').forEach(function(inp){inp.onchange=function(){var l=[].slice.call(inp.files||[]);inp.value='';if(l.length)send(l)}});
})();
</script>`);
  }

  /* ── /mcp ── */
  function bearerUser(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return null;
    const st = loadStore();
    const t = st.tokens[sha(m[1].trim())];
    if (!t || t.kind !== 'access' || t.exp < Date.now()) return null;
    // "last used", for the person's own connection status; written at most every ten minutes
    t.used = Date.now();
    if (!lastUseSave || t.used - lastUseSave > 10 * 60 * 1000) { lastUseSave = t.used; saveStore(); }
    return t.who;
  }
  /* ── for the mail suggestions (mail.js): the same person, projects and tools as a Claude
     session, without OAuth — mail.js has already decided who is asking ── */
  function whoAmI(email, name) { return identify({ email, name }, readJson(REGISTRY)); }
  function mailContext(email, name) {
    const reg = readJson(REGISTRY);
    const me = identify({ email, name }, reg);
    return projectsFor(me, reg).map(p => {
      const doc = readJson(p.file);
      const tasks = [];
      for (const s of doc.sheets || []) {
        if (s.type !== 'list') continue;
        for (const t of s.tasks || []) if (statusOf(t) !== 'C') tasks.push({ id: t.id, title: String(t.title || '') });
      }
      return { id: p.id, code: p.code || '', name: p.name || '', mine: (doc.team || []).some(m => m.staffId === me.id), tasks: tasks.slice(-150) };
    });
  }
  /* The Outlook add-in's mail log: an email in a linked thread becomes an update on its task. It
     carries forward the status and owner of the update before it, so neither the task's derived
     status nor the ball moves (a bare "update" would send the page back to the raw statusId);
     `auto` marks it until the person makes it a real update or removes it. */
  function mailLog(email, name, projectId, taskId, entry) {
    const reg = readJson(REGISTRY);
    const me = identify({ email, name }, reg);
    canWrite(me);
    const p = findProject(me, reg, projectId);
    checkDates(entry.date);
    return writeProject(p, me, doc => {
      const { t, s } = findTask(doc, taskId);
      const date = entry.date || todayISO();
      const before = evChrono(t.events).filter(e => (e.date || '') <= date).pop();
      const ev = {
        id: uid(), status: (before && before.status) || 'update', assignee: (before && before.assignee) || t.discipline || '',
        date, title: String(entry.text || '').trim(), note: '', ...(entry.mail ? { mail: entry.mail } : {}), auto: true
      };
      putTask(doc, s.id, { ...t, events: [...(t.events || []), ev], activityLog: [...(t.activityLog || []), logEntry(me, 'נרשם אוטומטית מהמייל')] });
      return { eventId: ev.id };
    });
  }
  /* Remove an automatic mail entry (change null), or make it a real update: text, update status, owner. */
  function mailLogEdit(email, name, projectId, taskId, eventId, change) {
    const reg = readJson(REGISTRY);
    const me = identify({ email, name }, reg);
    canWrite(me);
    const p = findProject(me, reg, projectId);
    return writeProject(p, me, doc => {
      const { t, s } = findTask(doc, taskId);
      const ev = (t.events || []).find(e => e.id === eventId);
      if (!ev) throw new ToolError('That update is no longer on the task');
      if (!change) {
        if (!ev.auto) throw new ToolError('Only an automatic mail entry can be removed here');
        putTask(doc, s.id, { ...t, events: t.events.filter(e => e.id !== eventId), activityLog: [...(t.activityLog || []), logEntry(me, 'רישום אוטומטי מהמייל הוסר')] });
        return { removed: true };
      }
      const evs = Object.keys(EV_STATUSES);
      const ust = change.update_status ? (evs.find(k => k === change.update_status) || evs.find(k => norm(EV_STATUSES[k]) === norm(change.update_status))) : ev.status;
      if (!ust) throw new ToolError(`Unknown update status "${change.update_status}"`);
      const owner = change.owner != null ? pickOption(projList(doc, 'disciplines', reg), change.owner, 'discipline') : ev.assignee;
      const next = { ...ev, status: ust, assignee: owner || '', title: change.text != null ? String(change.text).trim() : ev.title };
      delete next.auto;
      putTask(doc, s.id, { ...t, events: t.events.map(e => e.id === eventId ? next : e), activityLog: [...(t.activityLog || []), logEntry(me, 'עדכון מהמייל אושר')] });
      return { eventId, status: ust };
    });
  }
  /* A line in a task's activity log, written from outside the page (the Outlook add-in's filing). */
  function taskLog(email, name, projectId, taskId, text) {
    const reg = readJson(REGISTRY);
    const me = identify({ email, name }, reg);
    canWrite(me);
    const p = findProject(me, reg, projectId);
    return writeProject(p, me, doc => {
      const { t, s } = findTask(doc, taskId);
      putTask(doc, s.id, { ...t, activityLog: [...(t.activityLog || []), logEntry(me, String(text).slice(0, 2000))] });
      return true;
    });
  }
  /* A project's document, read only, when this person can open the project (the filing reads its registerProjectId). */
  function projectDoc(email, name, projectId) {
    const reg = readJson(REGISTRY);
    const p = findProject(identify({ email, name }, reg), reg, projectId);
    return readJson(p.file) || {};
  }
  /* A file saved by the server (saveAttachment) added to one task, as the person — the add-in's way
     of attaching an email or its files. */
  function attachToTask(email, name, projectId, taskId, saved, fileName) {
    return attachInto({ who: { email, name }, projectId, kind: 'task', id: taskId }, saved, fileName);
  }
  /* The execution track as the Outlook add-in offers it: its item types and parties, or null when the track is
     not open to this person (or the page's execution logic cannot be read). */
  function execInfo(email, name) {
    const me = identify({ email, name }, readJson(REGISTRY));
    let lib;
    try { lib = execLogic(); } catch (e) { return null; }
    if (lib.trial && !lib.trial.includes(me.id)) return null;
    return {
      types: Object.entries(lib.L.EXEC_TYPES).map(([id, t]) => ({ id, label: t.label, prefix: t.prefix })),
      parties: lib.L.EXEC_PARTIES.map(x => ({ id: x.id, label: x.label })),
      due_workdays: lib.dueDays || {}
    };
  }
  /* A file the server saved (saveAttachment) added to an execution item the way the page opens one with files:
     on its opening message, and on a submittal also on its first round. */
  function attachToExec(email, name, projectId, itemId, saved, fileName) {
    const reg = readJson(REGISTRY);
    const me = identify({ email, name }, reg);
    canWrite(me);
    execGate(me);
    const p = findProject(me, reg, projectId);
    return writeProject(p, me, doc => {
      const it = (doc.execItems || []).find(x => x.id === itemId);
      if (!it) throw new ToolError('That execution item is no longer in the project');
      const f = { id: uid(), url: saved.url, name: fileName };
      const n = { ...it };
      if ((n.responses || []).length) n.responses = n.responses.map((r, i) => i === 0 ? { ...r, files: [...(r.files || []), f] } : r);
      if (n.type === 'submittal' && (n.revisions || []).length) n.revisions = n.revisions.map((r, i) => i === 0 ? { ...r, files: [...(r.files || []), f] } : r);
      doc.execItems = doc.execItems.map(x => x.id === itemId ? n : x);
      return { id: itemId };
    });
  }
  function runToolAs(email, name, base, toolName, args) {
    const reg = readJson(REGISTRY);
    const tool = TOOLS.find(t => t.name === toolName);
    return tool.run(args, { me: identify({ email, name }, reg), who: { email, name }, reg, base });
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
          serverInfo: { name: 'project-hub', title: 'Project Hub', version: '1.3.0' },
          instructions: INSTRUCTIONS
        });
      }
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: TOOLS.filter(t => !t.exec || canExec(c.me)).map(({ run, exec, ...t }) => t) });
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
    try { c = { me: identify(who, reg), who, reg, base }; } catch (e) { sendJson(res, 500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: e.message } }); return; }
    const batch = Array.isArray(body);
    const answers = [];
    for (const m of batch ? body : [body]) { const a = await handleRpc(m, c); if (a) answers.push(a); }
    if (!answers.length) { res.writeHead(202); res.end(); return; }
    sendJson(res, 200, batch ? answers : answers[0]);
  }

  /* Routes that run before the Microsoft-session gate: discovery, registration, token, /mcp. */
  function handlePublic(req, res, url) {
    const p = url.pathname;
    const isOurs = p === '/mcp' || p.startsWith('/.well-known/oauth-') || p === '/oauth/register' || p === '/oauth/token' || p === '/attach' || p === '/api/attach';
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
    if (p === '/attach') { attachPage(res); return true; }
    if (p === '/api/attach') { handleAttachApi(req, res, url).catch(done); return true; }
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

  return { handlePublic, handleAuthorize, handleConnection, whoAmI, mailContext, runToolAs, mailLog, mailLogEdit, taskLog, projectDoc, attachToTask, execInfo, attachToExec, ToolError, _test: { identify, projectsFor, projList, stagesOf, findStage, officeData, handleRpc } };
};
