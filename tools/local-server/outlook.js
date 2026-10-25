'use strict';
/* The Outlook add-in's way in. The task pane (outlook/taskpane.html) carries a personal key
   (Bearer, before the sign-in gate, like the mail scanner); the key is issued to the signed-in
   person at /api/outlook-connection. Every call acts as that person through the connector's own
   tools (mcp.runToolAs), so the add-in sees and writes exactly what Claude would.

   Threads: an email thread is linked to one task, office-wide, in outlook_links.json. Opening an
   email of a linked thread logs it on the task (mcp.mailLog) once; the person can then make the
   entry a real update or remove it.
   Spec: docs/superpowers/specs/2026-10-21-outlook-addin-design.md */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const createTokens = require('./mail-tokens');
const mailAi = require('./mail-ai');
const ai = require('./outlook-ai');

const UNDO_TTL = 10 * 60 * 1000;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

/* The thread's key: the 16-byte conversation id, as 32 upper-case hex characters. Office.js gives
   it inside a longer base64 id that also names the mailbox (so it differs from person to person);
   classic Outlook (COM, the mail scanner) gives the 32 hex characters themselves. */
function threadKeyOf(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  if (/^[0-9A-F]{32}$/i.test(raw)) return raw.toUpperCase();
  const b = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (b.length >= 34 && b[b.length - 18] === 0x10 && b[b.length - 17] === 0x00) return b.subarray(b.length - 16).toString('hex').toUpperCase();
  return raw;
}

// the hub's Hebrew-tolerant matching (mcp.js `norm`)
const norm = s => String(s || '').normalize('NFKC').replace(/[֑-ׇ]/g, '').replace(/["'״׳`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/* The project an email probably belongs to, when its thread is not linked: the project its sender's
   linked threads belong to most, else one project whose code (or else name) is in the subject. */
function guessProject(projects, links, mail) {
  const ids = new Set(projects.map(p => p.id));
  const from = String((mail.from && mail.from.email) || '').toLowerCase();
  if (from) {
    const count = {};
    for (const th of Object.values(links.threads || {})) {
      if (!ids.has(th.projectId)) continue;
      if ((th.messages || []).some(m => String(m.from || '').toLowerCase() === from)) count[th.projectId] = (count[th.projectId] || 0) + 1;
    }
    const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    if (best) return { projectId: best[0], why: 'sender' };
  }
  const subj = norm(mail.subject);
  if (subj) {
    const byCode = projects.filter(p => p.code && norm(p.code).length >= 2 && subj.includes(norm(p.code)));
    if (byCode.length === 1) return { projectId: byCode[0].id, why: 'subject' };
    const byName = projects.filter(p => p.name && norm(p.name).length >= 3 && subj.includes(norm(p.name)));
    if (byName.length === 1) return { projectId: byName[0].id, why: 'subject' };
  }
  return { projectId: null, why: null };
}

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
// what the pane sends about the open email, kept to plain short strings (the body only for Claude)
function mailOf(body) {
  const m = body && typeof body.mail === 'object' && body.mail ? body.mail : {};
  const f = m.from && typeof m.from === 'object' ? m.from : {};
  const list = v => (Array.isArray(v) ? v : []).map(x => clip(x, 200)).slice(0, 30);
  return {
    conversationId: clip(m.conversationId, 400), internetMessageId: clip(m.internetMessageId, 400),
    subject: clip(m.subject, 300), from: { name: clip(f.name, 120), email: clip(f.email, 200).toLowerCase() },
    received: clip(m.received, 40), receivedDate: /^\d{4}-\d{2}-\d{2}$/.test(m.receivedDate || '') ? m.receivedDate : '',
    to: clip(m.to, 1000), cc: clip(m.cc, 1000), body: clip(m.body, 6000), attachments: list(m.attachments)
  };
}
// the email's line in a task created from it
const mailNote = mail => 'מהמייל: ' + [mail.from.name || mail.from.email, mail.subject, mail.receivedDate].filter(Boolean).join(' · ');

module.exports = function createOutlook(ctx) {
  const { DATA_DIR, STATIC_ROOT, SITE_MODE, LOCAL_USER_NAME, readJson, writeJsonAtomic, sendJson, readRequestBody, readRequestBuffer, saveAttachment, mcp } = ctx;
  const tokens = createTokens(path.join(DATA_DIR, 'outlook_tokens.json'), { readJson, writeJsonAtomic }, 'pho_');
  const LINKS = path.join(DATA_DIR, 'outlook_links.json');
  const now = () => new Date().toISOString();
  // a key names a person by address ("local" on the local server, where there is none)
  const personOfKey = who => who === 'local' ? { email: null, name: LOCAL_USER_NAME } : { email: who, name: who };
  const baseOf = req => (SITE_MODE === 'cloud' || req.socket.encrypted ? 'https' : (req.headers['x-forwarded-proto'] || 'http')) + '://' + req.headers.host;
  const loadLinks = () => { const d = readJson(LINKS); return d && d.threads ? { undo: {}, ...d } : { threads: {}, undo: {} }; };
  const saveLinks = d => {
    const t = Date.now();
    for (const k of Object.keys(d.undo || {})) if (d.undo[k].exp < t) delete d.undo[k];
    writeJsonAtomic(LINKS, d);
  };
  const MODEL = (process.env.OUTLOOK_AI_MODEL || '').trim() || 'claude-sonnet-5-5';
  const client = ctx.aiClient !== undefined ? ctx.aiClient : mailAi.makeClient();
  let lastAi = null; // 'ok' | 'failing', after the latest call
  const health = () => !client ? 'no-key' : lastAi === 'failing' ? 'failing' : 'ok';

  /* Filing the email's files into the project's folder on the office network; see filing.js. */
  const filing = require('./filing')({
    DATA_DIR, readJson, writeJsonAtomic, sendJson, readRequestBody, readRequestBuffer, mcp, client, model: MODEL,
    linkedTaskOf: conv => { const k = threadKeyOf(conv); const th = k ? loadLinks().threads[k] : null; return th ? { projectId: th.projectId, taskId: th.taskId } : null; }
  });

  /* Remember that this email is already recorded on the thread's task (as a new task, an update…),
     so opening it again does not log it a second time. Links the thread first when it is not linked. */
  function recordMessage(p, key, mail, projectId, taskId, how) {
    if (!key) return;
    const links = loadLinks();
    let th = links.threads[key];
    if (!th) th = links.threads[key] = { projectId, taskId, linkedBy: mcp.whoAmI(p.email, p.name).name, linkedAt: now(), messages: [] };
    if (th.taskId !== taskId || !mail.internetMessageId) { saveLinks(links); return; }
    const msgs = th.messages || (th.messages = []);
    const old = msgs.find(m => m.internetMessageId === mail.internetMessageId);
    if (old) Object.assign(old, how);
    else msgs.push({ internetMessageId: mail.internetMessageId, received: mail.received, from: mail.from.email, subject: mail.subject, eventId: null, auto: false, ...how });
    th.messages = msgs.slice(-200);
    saveLinks(links);
  }

  /* A new task from the email, written at once; the answer carries an undo token for 10 minutes. */
  function createTask(p, who, base, mail, projectId, x) {
    const me = mcp.whoAmI(p.email, p.name);
    const g = mcp.runToolAs(p.email, p.name, base, 'get_project', { project: projectId });
    const onTeam = g.team.some(m => m.id === me.id);
    const assignees = (x.assignees || []).length ? x.assignees : onTeam ? [me.id] : [];
    const note = [String(x.note || '').trim(), mailNote(mail)].filter(Boolean).join('\n');
    const r = mcp.runToolAs(p.email, p.name, base, 'create_tasks', {
      project: projectId,
      tasks: [{
        title: String(x.title || mail.subject || '').trim(), note,
        ...(x.stage ? { stage: x.stage } : {}), ...(x.discipline ? { discipline: x.discipline } : {}), ...(x.priority ? { priority: x.priority } : {}),
        ...(x.start_date ? { start_date: x.start_date } : {}), ...(x.due_date ? { due_date: x.due_date } : {}),
        ...(assignees.length ? { assignees } : {})
      }]
    });
    const c = r.created[0];
    const key = threadKeyOf(mail.conversationId);
    recordMessage(p, key, mail, projectId, c.id, { createdTask: c.id });
    const token = crypto.randomBytes(18).toString('base64url');
    const links = loadLinks();
    links.undo[sha(token)] = { who, projectId, taskId: c.id, threadKey: key, exp: Date.now() + UNDO_TTL };
    saveLinks(links);
    const team = g.team;
    return {
      action: 'created', undoToken: token, undoUntil: new Date(Date.now() + UNDO_TTL).toISOString(),
      created: { id: c.id, title: c.title, stage: c.stage, due: c.due, link: c.link, assignees: assignees.map(id => (team.find(m => m.id === id) || {}).name || id) }
    };
  }

  /* What Claude needs to know about the project, in ids it may name. */
  function projectContext(p, base, projectId, key) {
    const g = mcp.runToolAs(p.email, p.name, base, 'get_project', { project: projectId });
    const open = mcp.runToolAs(p.email, p.name, base, 'search_tasks', { project: projectId, limit: 100 });
    const th = key ? loadLinks().threads[key] : null;
    let linked = null;
    if (th && th.projectId === projectId) {
      const hit = open.tasks.find(x => x.id === th.taskId);
      if (hit) linked = { id: hit.id, title: hit.title };
      else { try { const t = mcp.runToolAs(p.email, p.name, base, 'get_task', { project: projectId, task: th.taskId }); if (t.id === th.taskId) linked = { id: t.id, title: t.title }; } catch (e) { if (!(e instanceof mcp.ToolError)) throw e; } }
    }
    return {
      today: ai.todayOf(), me: mcp.whoAmI(p.email, p.name).name, project: g.project,
      stages: g.stages.map(s => ({ id: s.id, path: s.path, default: !!s.default_for_new_tasks })),
      disciplines: g.disciplines, priorities: g.priorities, statuses: g.statuses, update_statuses: g.update_statuses,
      team: g.team, tasks: open.tasks.map(x => ({ id: x.id, title: x.title, stage: x.stage, status: x.status, latest_update: x.latest_update })),
      linked, exec: mcp.execInfo(p.email, p.name)
    };
  }

  /* The manifest names the server it was downloaded from, so one file serves the local HTTPS
     server and Azure alike. */
  function manifest(req, res) {
    fs.readFile(path.join(STATIC_ROOT, 'outlook', 'manifest.xml'), 'utf8', (err, xml) => {
      if (err) { sendJson(res, 404, { error: 'Not found' }); return; }
      const body = xml.split('{{BASE}}').join(baseOf(req));
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Disposition': 'attachment; filename="project-hub-outlook.xml"' });
      res.end(body);
    });
  }

  /* The linked task as the pane shows it, or why there is none. `gone`: the task (or its project)
     no longer exists, so the link is dropped. `hidden`: it exists but this person cannot open it. */
  function linkedTask(p, base, th, projects) {
    if (!projects.some(x => x.id === th.projectId)) {
      const reg = readJson(path.join(DATA_DIR, 'hub_projects.json')) || {};
      const exists = th.projectId === 'ph01' || (reg.projects || []).some(x => x.id === th.projectId);
      return exists ? { hidden: true } : { gone: true };
    }
    try {
      const t = mcp.runToolAs(p.email, p.name, base, 'get_task', { project: th.projectId, task: th.taskId });
      if (t.id !== th.taskId) return { gone: true };
      return { task: { id: t.id, title: t.title, stage: t.stage, status: t.status, due: t.due, assignees: t.assignees, updates: (t.updates || []).slice(-3), link: t.link } };
    } catch (e) {
      if (e instanceof mcp.ToolError) return { gone: true };
      throw e;
    }
  }

  /* An email of a linked thread, logged on its task as an automatic update, and remembered on the thread
     so that neither the pane nor the scanner logs it again. */
  function logOnThread(p, key, th, mail, via) {
    const who = mail.from.name || mail.from.email;
    const r = mcp.mailLog(p.email, p.name, th.projectId, th.taskId, {
      text: 'מייל מ' + (who ? '-' + who : '') + ': ' + (mail.subject || ''),
      date: mail.receivedDate || undefined,
      mail: { threadKey: key, internetMessageId: mail.internetMessageId, subject: mail.subject, from: mail.from.email }
    });
    const msg = { internetMessageId: mail.internetMessageId, received: mail.received, from: mail.from.email, subject: mail.subject, eventId: r.eventId, auto: true, via };
    const fresh = loadLinks();
    const t = fresh.threads[key];
    if (t) { t.messages = [...(t.messages || []), msg].slice(-200); saveLinks(fresh); }
    return msg;
  }

  /* The mail scanner's message (mail.js intake): when its thread is linked to a task — by the conversation id,
     or by a reply to a message already on the thread — it is logged there. 'logged', 'known' (already on the
     thread), or null when the thread is not linked or the person cannot write to that task. */
  function logScanned(p, m) {
    const mail = {
      conversationId: clip(m.conversationId, 400), internetMessageId: clip(m.id, 400), subject: clip(m.subject, 300),
      from: { name: clip(m.fromName, 120), email: clip(m.from, 200).toLowerCase() }, received: clip(m.received, 40),
      receivedDate: /^\d{4}-\d{2}-\d{2}/.test(m.received || '') ? String(m.received).slice(0, 10) : ''
    };
    if (!mail.internetMessageId) return null;
    const links = loadLinks();
    let key = threadKeyOf(mail.conversationId);
    let th = key ? links.threads[key] : null;
    if (!th) {
      const refs = new Set([m.inReplyTo, ...(Array.isArray(m.references) ? m.references : [])].filter(Boolean).map(x => String(x).trim()));
      if (refs.size) {
        const hit = Object.entries(links.threads).find(([, t]) => (t.messages || []).some(x => refs.has(x.internetMessageId)));
        if (hit) { key = hit[0]; th = hit[1]; }
      }
    }
    if (!th) return null;
    if ((th.messages || []).some(x => x.internetMessageId === mail.internetMessageId)) return 'known';
    try { logOnThread(p, key, th, mail, 'scanner'); } catch (e) {
      if (e instanceof mcp.ToolError) return null;
      throw e;
    }
    return 'logged';
  }

  /* What the pane needs for the open email: the project to start from, and the linked task with
     this email logged on it (logging it now when it is new). */
  function context(p, base, mail) {
    const key = threadKeyOf(mail.conversationId);
    const projects = mcp.mailContext(p.email, p.name);
    const me = mcp.whoAmI(p.email, p.name);
    const canWrite = ['editor', 'admin', 'superadmin'].includes(me.role);
    const links = loadLinks();
    const th = key ? links.threads[key] : null;
    if (th) {
      const lt = linkedTask(p, base, th, projects);
      if (lt.gone) { delete links.threads[key]; saveLinks(links); }
      else if (lt.hidden) return { threadKey: key, projectId: null, why: null, linked: { hidden: true }, canWrite, exec: mcp.execInfo(p.email, p.name) };
      else {
        let msg = mail.internetMessageId ? (th.messages || []).find(m => m.internetMessageId === mail.internetMessageId) : null;
        if (!msg && mail.internetMessageId && canWrite) {
          msg = logOnThread(p, key, th, mail, 'pane');
          Object.assign(lt, linkedTask(p, base, th, projects)); // the card now shows the new entry
        }
        let options;
        try {
          const g = mcp.runToolAs(p.email, p.name, base, 'get_project', { project: th.projectId });
          options = { update_statuses: g.update_statuses, disciplines: g.disciplines };
        } catch (e) { if (!(e instanceof mcp.ToolError)) throw e; }
        return {
          threadKey: key, projectId: th.projectId, why: 'linked', canWrite, exec: mcp.execInfo(p.email, p.name),
          linked: { projectId: th.projectId, taskId: th.taskId, task: lt.task, linkedAt: th.linkedAt, message: msg ? { eventId: msg.eventId || null, auto: !!msg.auto, removed: !!msg.removed, created: !!msg.createdTask, attached: !!msg.attached } : null, options }
        };
      }
    }
    return { threadKey: key, ...guessProject(projects, links, mail), linked: null, canWrite, exec: mcp.execInfo(p.email, p.name) };
  }

  // a body that is not a JSON object is treated as empty
  async function readJsonBody(req) {
    const raw = await readRequestBody(req);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  const GET_ROUTES = ['/api/outlook/me', '/api/outlook/projects', '/api/outlook/tasks', '/api/outlook/project', '/api/outlook/filing-project', '/api/outlook/filing-task', '/api/outlook/filing-next'];
  const POST_ROUTES = ['/api/outlook/context', '/api/outlook/link', '/api/outlook/unlink', '/api/outlook/entry', '/api/outlook/parse', '/api/outlook/create', '/api/outlook/apply', '/api/outlook/undo', '/api/outlook/upload', '/api/outlook/attached', '/api/outlook/exec', '/api/outlook/filing', '/api/outlook/filing-file', '/api/outlook/filing-pick', '/api/outlook/filing-open', '/api/outlook/filing-guide-add', '/api/outlook/filing-propose', '/api/outlook/filing-confirm', '/api/outlook/inbox-batch'];
  const PUT_ROUTES = ['/api/outlook/filing-guide'];

  async function run(req, res, url) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const who = tokens.check(m ? m[1].trim() : null, now());
    if (!who) { sendJson(res, 401, { error: 'invalid_key' }); return; }
    const p = personOfKey(who);
    const base = baseOf(req);
    const method = GET_ROUTES.includes(url.pathname) ? 'GET' : PUT_ROUTES.includes(url.pathname) ? 'PUT' : 'POST';
    if (req.method !== method) { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    if (url.pathname.startsWith('/api/outlook/filing') || url.pathname === '/api/outlook/inbox-batch') { await filing.handlePane(req, res, url, p, who, base); return; }

    if (url.pathname === '/api/outlook/me') {
      const me = mcp.whoAmI(p.email, p.name);
      sendJson(res, 200, { name: me.name, email: me.email, role: me.role });
      return;
    }
    if (url.pathname === '/api/outlook/projects') { sendJson(res, 200, mcp.runToolAs(p.email, p.name, base, 'list_projects', {})); return; }
    if (url.pathname === '/api/outlook/tasks') {
      const project = url.searchParams.get('project');
      if (!project) { sendJson(res, 400, { error: 'project expected' }); return; }
      sendJson(res, 200, mcp.runToolAs(p.email, p.name, base, 'search_tasks', { project, query: url.searchParams.get('q') || '', limit: 40 }));
      return;
    }

    // the project's options for the manual forms
    if (url.pathname === '/api/outlook/project') {
      const g = mcp.runToolAs(p.email, p.name, base, 'get_project', { project: url.searchParams.get('project') || '' });
      sendJson(res, 200, { project: g.project, stages: g.stages.map(s => ({ id: s.id, path: s.path, default: !!s.default_for_new_tasks })), disciplines: g.disciplines, priorities: g.priorities, statuses: g.statuses, update_statuses: g.update_statuses, team: g.team, defaults: g.defaults });
      return;
    }

    /* one file — the email itself (.eml) or one of its attachments — added to a task; raw bytes, the
       name and the task in the query */
    if (url.pathname === '/api/outlook/upload') {
      const projectId = url.searchParams.get('project') || '', taskId = url.searchParams.get('task') || '', execId = url.searchParams.get('exec') || '';
      const name = String(url.searchParams.get('name') || 'file').replace(/[\u0000-\u001f\\/:*?"<>|]/g, '').slice(0, 150) || 'file';
      if (!projectId || !taskId === !execId) { sendJson(res, 400, { error: 'project and a task or an execution item expected' }); return; }
      // the task or item must be one this person can see, by its exact id
      if (taskId) {
        const t = mcp.runToolAs(p.email, p.name, base, 'get_task', { project: projectId, task: taskId });
        if (t.id !== taskId) { sendJson(res, 400, { error: 'No such task' }); return; }
      } else {
        const it = mcp.runToolAs(p.email, p.name, base, 'get_exec_item', { project: projectId, item: execId });
        if (!it || (it.item ? it.item.id : it.id) !== execId) { sendJson(res, 400, { error: 'No such execution item' }); return; }
      }
      let buf;
      try { buf = await readRequestBuffer(req); } catch (e) { sendJson(res, 413, { error: 'too_large' }); return; }
      if (!buf.length) { sendJson(res, 400, { error: 'empty' }); return; }
      const saved = saveAttachment('project-hub-01', buf, req.headers['content-type'], name);
      if (!saved) { sendJson(res, 415, { error: 'type' }); return; }
      try {
        if (taskId) mcp.attachToTask(p.email, p.name, projectId, taskId, saved, name);
        else mcp.attachToExec(p.email, p.name, projectId, execId, saved, name);
      } catch (e) {
        if (e instanceof mcp.ToolError) { sendJson(res, 403, { error: e.message }); return; }
        throw e;
      }
      sendJson(res, 200, { ok: true, name, url: saved.url });
      return;
    }

    let body;
    try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
    const mail = mailOf(body);
    const key = threadKeyOf(mail.conversationId);
    if (url.pathname === '/api/outlook/context') { sendJson(res, 200, context(p, base, mail)); return; }

    /* the free-text box: Claude proposes; a new task is written at once (with undo), the rest waits for a yes */
    if (url.pathname === '/api/outlook/parse') {
      const text = clip(body.text, 2000).trim(), projectId = String(body.projectId || '');
      if (!text) { sendJson(res, 400, { error: 'text expected' }); return; }
      if (!projectId) { sendJson(res, 400, { error: 'Choose a project' }); return; }
      if (!client) { sendJson(res, 503, { error: 'ai_unavailable' }); return; }
      const pc = projectContext(p, base, projectId, key);
      let proposal;
      try {
        proposal = await ai.parse(client, MODEL, text, mail, pc);
        lastAi = 'ok';
      } catch (e) {
        lastAi = 'failing';
        console.error('outlook parse failed:', e.message);
        sendJson(res, 503, { error: 'ai_failed', detail: e.message });
        return;
      }
      if (proposal.action === 'create') {
        sendJson(res, 200, { summary: proposal.summary, ...createTask(p, who, base, mail, projectId, proposal.task) });
        return;
      }
      const target = proposal.target_task_id ? pc.tasks.find(x => x.id === proposal.target_task_id) || pc.linked : null;
      sendJson(res, 200, { action: proposal.action, summary: proposal.summary, proposal, target: target ? { id: target.id, title: target.title, stage: target.stage } : null });
      return;
    }
    if (url.pathname === '/api/outlook/create') {
      const projectId = String(body.projectId || '');
      const x = body.task && typeof body.task === 'object' ? body.task : {};
      if (!projectId) { sendJson(res, 400, { error: 'Choose a project' }); return; }
      sendJson(res, 200, createTask(p, who, base, mail, projectId, {
        title: clip(x.title, 200), stage: clip(x.stage, 100), discipline: clip(x.discipline, 60), priority: clip(x.priority, 60),
        assignees: (Array.isArray(x.assignees) ? x.assignees : []).map(a => clip(a, 60)), start_date: clip(x.start_date, 10), due_date: clip(x.due_date, 10), note: clip(x.note, 500)
      }));
      return;
    }
    /* a confirmed update: when this email already has an automatic entry on that task, the entry
       itself becomes the update; otherwise a new update is added */
    if (url.pathname === '/api/outlook/apply') {
      const projectId = String(body.projectId || '');
      const pr = body.proposal && typeof body.proposal === 'object' ? body.proposal : {};
      const taskId = String(pr.target_task_id || '');
      const u = pr.update || {}, ch = pr.changes || {};
      if (!projectId || !taskId) { sendJson(res, 400, { error: 'Choose a task' }); return; }
      if (!String(u.text || '').trim()) { sendJson(res, 400, { error: 'Write what happened' }); return; }
      const th = key ? loadLinks().threads[key] : null;
      const msg = th && th.taskId === taskId && (th.messages || []).find(m => m.internetMessageId === mail.internetMessageId);
      const changes = { ...(ch.due_date ? { due_date: ch.due_date } : {}), ...(ch.status ? { status: ch.status } : {}), ...((ch.assignees || []).length ? { assignees: ch.assignees } : {}) };
      if (msg && msg.auto && msg.eventId) {
        mcp.mailLogEdit(p.email, p.name, projectId, taskId, msg.eventId, { text: u.text, update_status: u.update_status || undefined, owner: u.owner || undefined });
        if (Object.keys(changes).length) mcp.runToolAs(p.email, p.name, base, 'update_task', { project: projectId, task: taskId, ...changes });
        recordMessage(p, key, mail, projectId, taskId, { auto: false });
      } else {
        mcp.runToolAs(p.email, p.name, base, 'update_task', {
          project: projectId, task: taskId, ...changes,
          add_update: { text: String(u.text).trim(), ...(u.update_status ? { update_status: u.update_status } : {}), ...(u.owner ? { owner: u.owner } : {}), ...(mail.receivedDate ? { date: mail.receivedDate } : {}) }
        });
        recordMessage(p, key, mail, projectId, taskId, { updated: true });
      }
      sendJson(res, 200, { ok: true, ...context(p, base, mail) });
      return;
    }
    /* a confirmed execution item (a submittal, an RFI, an Issue, a change): opened with the next official
       number, so only after the person's yes; its files follow through /api/outlook/upload?exec= */
    if (url.pathname === '/api/outlook/exec') {
      const projectId = String(body.projectId || '');
      const x = body.item && typeof body.item === 'object' ? body.item : {};
      if (!projectId) { sendJson(res, 400, { error: 'Choose a project' }); return; }
      if (!String(x.type || '').trim() || !String(x.title || '').trim()) { sendJson(res, 400, { error: 'type and title expected' }); return; }
      const party = (id, nm) => id ? { party: clip(id, 40), ...(nm ? { name: clip(nm, 120) } : {}) } : null;
      const opened = party(x.opened_by, x.opened_by_name), ball = party(x.ball_to, x.ball_to_name);
      const r = mcp.runToolAs(p.email, p.name, base, 'create_exec_item', {
        project: projectId, type: clip(x.type, 20), title: clip(x.title, 200).trim(),
        description: [clip(x.description, 2000).trim(), mailNote(mail)].filter(Boolean).join('\n\n'),
        ...(opened ? { opened_by: opened } : {}), ...(ball ? { ball_to: ball } : {}),
        ...(x.due_date ? { due_date: clip(x.due_date, 10) } : {}), ...(x.discipline ? { discipline: clip(x.discipline, 60) } : {})
      });
      sendJson(res, 200, { action: 'exec_created', created: { id: r.created.id, number: r.created.number, type: r.created.type, title: r.created.title, due: r.created.due, ball: r.created.ball, link: r.link } });
      return;
    }
    // after the files are up: the thread is linked to the task and this email is marked as attached there
    if (url.pathname === '/api/outlook/attached') {
      const projectId = String(body.projectId || ''), taskId = String(body.taskId || '');
      if (!projectId || !taskId) { sendJson(res, 400, { error: 'project and task expected' }); return; }
      recordMessage(p, key, mail, projectId, taskId, { attached: true });
      sendJson(res, 200, context(p, base, mail));
      return;
    }
    if (url.pathname === '/api/outlook/undo') {
      const links = loadLinks();
      const h = sha(String(body.undoToken || ''));
      const u = links.undo[h];
      if (!u || u.who !== who || u.exp < Date.now()) { sendJson(res, 409, { error: 'It is too late to undo this here; delete the task in Project Hub' }); return; }
      const t = mcp.runToolAs(p.email, p.name, base, 'get_task', { project: u.projectId, task: u.taskId });
      if ((t.updates || []).length) { sendJson(res, 409, { error: 'The task has updates since; delete it in Project Hub' }); return; }
      mcp.runToolAs(p.email, p.name, base, 'delete_task', { project: u.projectId, task: u.taskId });
      delete links.undo[h];
      const th = u.threadKey && links.threads[u.threadKey];
      if (th && th.taskId === u.taskId) delete links.threads[u.threadKey];
      saveLinks(links);
      sendJson(res, 200, { ok: true, ...context(p, base, mail) });
      return;
    }
    if (!key) { sendJson(res, 400, { error: 'conversationId expected' }); return; }

    if (url.pathname === '/api/outlook/link') {
      const projectId = String(body.projectId || ''), taskId = String(body.taskId || '');
      // the task must be one this person can see, by its exact id
      const t = mcp.runToolAs(p.email, p.name, base, 'get_task', { project: projectId, task: taskId });
      if (t.id !== taskId) { sendJson(res, 400, { error: 'No such task' }); return; }
      const me = mcp.whoAmI(p.email, p.name);
      const links = loadLinks();
      const old = links.threads[key];
      // relinking to another task starts the thread's log afresh there
      links.threads[key] = { projectId, taskId, linkedBy: me.name, linkedAt: now(), messages: old && old.taskId === taskId ? old.messages || [] : [] };
      saveLinks(links);
      sendJson(res, 200, context(p, base, mail));
      return;
    }
    if (url.pathname === '/api/outlook/unlink') {
      const links = loadLinks();
      delete links.threads[key];
      saveLinks(links);
      sendJson(res, 200, context(p, base, mail));
      return;
    }
    // the logged entry of this email: remove it, or make it a real update
    const links = loadLinks();
    const th = links.threads[key];
    const msg = th && (th.messages || []).find(x => x.internetMessageId === mail.internetMessageId);
    if (!msg || !msg.eventId) { sendJson(res, 409, { error: 'This email has no entry on the task' }); return; }
    if (body.action === 'remove') {
      mcp.mailLogEdit(p.email, p.name, th.projectId, th.taskId, msg.eventId, null);
      msg.eventId = null; msg.auto = false; msg.removed = true;
    } else if (body.action === 'promote') {
      mcp.mailLogEdit(p.email, p.name, th.projectId, th.taskId, msg.eventId, { text: body.text, update_status: body.update_status, owner: body.owner });
      msg.auto = false;
    } else { sendJson(res, 400, { error: 'action must be remove or promote' }); return; }
    saveLinks(links);
    sendJson(res, 200, context(p, base, mail));
  }

  function handlePublic(req, res, url) {
    if (filing.handleToken(req, res, url)) return true;
    if (url.pathname === '/outlook/manifest.xml' || url.pathname === '/outlook/manifest') { manifest(req, res); return true; }
    if (!GET_ROUTES.includes(url.pathname) && !POST_ROUTES.includes(url.pathname) && !PUT_ROUTES.includes(url.pathname)) return false;
    run(req, res, url).catch(e => {
      if (e instanceof mcp.ToolError) { sendJson(res, /viewer/.test(e.message) ? 403 : 400, { error: e.message }); return; }
      console.error('outlook:', e);
      sendJson(res, 500, { error: e.message });
    });
    return true;
  }

  /* ── the key, for the signed-in person ── */
  function handleConnection(req, res, user) {
    const email = user.email ? String(user.email).trim().toLowerCase() : null;
    if (req.method === 'GET') { sendJson(res, 200, { key: tokens.status(email) }); return; }
    if (req.method === 'POST') { sendJson(res, 200, { key: tokens.issue(email, now()) }); return; }
    if (req.method === 'DELETE') { tokens.revoke(email); sendJson(res, 200, { ok: true }); return; }
    sendJson(res, 405, { error: 'Method not allowed' });
  }

  /* the Hub page's snapshot of a project's register contacts, for the filing (signed in; see filing.js) */
  const handleContacts = (req, res, url, user) => filing.handleContacts(req, res, url, user);

  /* the project's folder, its map and its guide, on the Hub page's project settings (signed in; see filing.js) */
  function handleHub(req, res, url, user) {
    filing.handleHub(req, res, url, user, baseOf(req)).catch(e => {
      if (e instanceof mcp.ToolError) { sendJson(res, /viewer/.test(e.message) ? 403 : 400, { error: e.message }); return; }
      if (e instanceof SyntaxError) { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
      console.error('filing hub:', e);
      sendJson(res, 500, { error: e.message });
    });
  }

  return { handlePublic, handleConnection, handleContacts, handleHub, health, logScanned };
};
module.exports.threadKeyOf = threadKeyOf;
module.exports.guessProject = guessProject;
