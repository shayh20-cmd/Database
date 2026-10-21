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
const createTokens = require('./mail-tokens');

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
// what the pane sends about the open email, kept to plain short strings
function mailOf(body) {
  const m = body && typeof body.mail === 'object' && body.mail ? body.mail : {};
  const f = m.from && typeof m.from === 'object' ? m.from : {};
  return {
    conversationId: clip(m.conversationId, 400), internetMessageId: clip(m.internetMessageId, 400),
    subject: clip(m.subject, 300), from: { name: clip(f.name, 120), email: clip(f.email, 200).toLowerCase() },
    received: clip(m.received, 40), receivedDate: /^\d{4}-\d{2}-\d{2}$/.test(m.receivedDate || '') ? m.receivedDate : ''
  };
}

module.exports = function createOutlook(ctx) {
  const { DATA_DIR, STATIC_ROOT, SITE_MODE, LOCAL_USER_NAME, readJson, writeJsonAtomic, sendJson, readRequestBody, mcp } = ctx;
  const tokens = createTokens(path.join(DATA_DIR, 'outlook_tokens.json'), { readJson, writeJsonAtomic }, 'pho_');
  const LINKS = path.join(DATA_DIR, 'outlook_links.json');
  const now = () => new Date().toISOString();
  // a key names a person by address ("local" on the local server, where there is none)
  const personOfKey = who => who === 'local' ? { email: null, name: LOCAL_USER_NAME } : { email: who, name: who };
  const baseOf = req => (SITE_MODE === 'cloud' || req.socket.encrypted ? 'https' : (req.headers['x-forwarded-proto'] || 'http')) + '://' + req.headers.host;
  const loadLinks = () => { const d = readJson(LINKS); return d && d.threads ? d : { threads: {} }; };
  const saveLinks = d => writeJsonAtomic(LINKS, d);

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
      else if (lt.hidden) return { threadKey: key, projectId: null, why: null, linked: { hidden: true }, canWrite };
      else {
        let msg = mail.internetMessageId ? (th.messages || []).find(m => m.internetMessageId === mail.internetMessageId) : null;
        if (!msg && mail.internetMessageId && canWrite) {
          const who = mail.from.name || mail.from.email;
          const r = mcp.mailLog(p.email, p.name, th.projectId, th.taskId, {
            text: 'מייל מ' + (who ? '-' + who : '') + ': ' + (mail.subject || ''),
            date: mail.receivedDate || undefined,
            mail: { threadKey: key, internetMessageId: mail.internetMessageId, subject: mail.subject, from: mail.from.email }
          });
          msg = { internetMessageId: mail.internetMessageId, received: mail.received, from: mail.from.email, subject: mail.subject, eventId: r.eventId, auto: true };
          const fresh = loadLinks();
          if (fresh.threads[key]) { fresh.threads[key].messages = [...(fresh.threads[key].messages || []), msg].slice(-200); saveLinks(fresh); }
          Object.assign(lt, linkedTask(p, base, th, projects)); // the card now shows the new entry
        }
        let options;
        try {
          const g = mcp.runToolAs(p.email, p.name, base, 'get_project', { project: th.projectId });
          options = { update_statuses: g.update_statuses, disciplines: g.disciplines };
        } catch (e) { if (!(e instanceof mcp.ToolError)) throw e; }
        return {
          threadKey: key, projectId: th.projectId, why: 'linked', canWrite,
          linked: { projectId: th.projectId, taskId: th.taskId, task: lt.task, linkedAt: th.linkedAt, message: msg ? { eventId: msg.eventId || null, auto: !!msg.auto, removed: !!msg.removed } : null, options }
        };
      }
    }
    return { threadKey: key, ...guessProject(projects, links, mail), linked: null, canWrite };
  }

  // a body that is not a JSON object is treated as empty
  async function readJsonBody(req) {
    const raw = await readRequestBody(req);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  const GET_ROUTES = ['/api/outlook/me', '/api/outlook/projects', '/api/outlook/tasks'];
  const POST_ROUTES = ['/api/outlook/context', '/api/outlook/link', '/api/outlook/unlink', '/api/outlook/entry'];

  async function run(req, res, url) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const who = tokens.check(m ? m[1].trim() : null, now());
    if (!who) { sendJson(res, 401, { error: 'invalid_key' }); return; }
    const p = personOfKey(who);
    const base = baseOf(req);
    const isGet = GET_ROUTES.includes(url.pathname);
    if (req.method !== (isGet ? 'GET' : 'POST')) { sendJson(res, 405, { error: 'Method not allowed' }); return; }

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

    let body;
    try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
    const mail = mailOf(body);
    const key = threadKeyOf(mail.conversationId);
    if (url.pathname === '/api/outlook/context') { sendJson(res, 200, context(p, base, mail)); return; }
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
    if (url.pathname === '/outlook/manifest.xml' || url.pathname === '/outlook/manifest') { manifest(req, res); return true; }
    if (!GET_ROUTES.includes(url.pathname) && !POST_ROUTES.includes(url.pathname)) return false;
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

  return { handlePublic, handleConnection };
};
module.exports.threadKeyOf = threadKeyOf;
module.exports.guessProject = guessProject;
