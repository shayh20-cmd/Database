'use strict';
/* Mail suggestions: the scanner's way in (/api/mail-intake, with a personal key) and the page's
   (/api/mail-suggestions, /api/mail-connection, signed in). Each person has one document
   (mail-store.js); new messages wait there as pending until Claude has looked at them
   (mail-ai.js). Nothing reaches a project until the person presses a button; then the task is
   written by the connector's own tools (mcp.js), the same way Claude writes one.
   Spec: docs/superpowers/specs/2026-10-20-mail-task-suggestions-design.md */
const path = require('path');
const store = require('./mail-store');
const ai = require('./mail-ai');
const createTokens = require('./mail-tokens');

module.exports = function createMail(ctx) {
  const { DATA_DIR, LOCAL_USER_NAME, readJson, writeJsonAtomic, sendJson, readRequestBody, mcp } = ctx;
  const DIR = path.join(DATA_DIR, 'mail');
  const tokens = createTokens(path.join(DATA_DIR, 'mail_tokens.json'), { readJson, writeJsonAtomic });
  const MODEL = (process.env.MAIL_AI_MODEL || '').trim() || 'claude-opus-5-5';
  const client = ai.makeClient();
  let lastAi = null; // 'ok' | 'failing', after the latest call

  const now = () => new Date().toISOString();
  const keyOf = email => email || 'local';
  const load = email => store.housekeep(readJson(store.mailFileOf(DIR, email)), Date.now());
  const saveDoc = (email, doc) => writeJsonAtomic(store.mailFileOf(DIR, email), doc);
  // a key names a person by address ("local" on the local server, where there is none)
  const personOfKey = who => who === 'local' ? { email: null, name: LOCAL_USER_NAME } : { email: who, name: who };
  const personOfUser = user => ({ email: user.email ? String(user.email).trim().toLowerCase() : null, name: user.name });

  function health() { return !client ? 'no-key' : lastAi === 'failing' ? 'failing' : 'ok'; }

  /* One queue per person, one message at a time. Every step re-reads the document, so an intake
     or a button press while Claude is thinking is never lost. Each pending message is tried once
     per pass; a failure is retried on the next intake or the next time the page opens. A trigger
     that arrives while the run is going (an intake, a retry) earns one more pass when it ends. */
  const running = new Map(); // person → { again } while their run is going
  function triageSoon(p) {
    const k = keyOf(p.email);
    if (!client) return;
    if (running.has(k)) { running.get(k).again = true; return; }
    const run = { again: false };
    running.set(k, run);
    (async () => {
      do {
        run.again = false;
        // the person's projects, once per pass; if the hub cannot read them that is not Claude's failure
        let projects;
        try { projects = mcp.mailContext(p.email, p.name); } catch (e) { console.error('mail: cannot read the projects:', e.message); return; }
        const tried = new Set();
        for (;;) {
          const id = store.pendingIds(load(p.email)).find(x => !tried.has(x));
          if (!id) break;
          tried.add(id);
          const it = load(p.email).items.find(i => i.id === id);
          try {
            const s = await ai.triage(client, MODEL, it.mail, projects, now().slice(0, 10));
            lastAi = 'ok';
            saveDoc(p.email, store.applySuggestion(load(p.email), id, s, now()));
          } catch (e) {
            lastAi = 'failing';
            console.error('mail triage failed:', e.message);
            saveDoc(p.email, store.failAttempt(load(p.email), id, e.message));
          }
        }
      } while (run.again);
    })().catch(e => console.error('mail queue:', e)).finally(() => running.delete(k));
  }

  // a body that is not a JSON object (null, a string, a list) is treated as empty: a 400 / 409, not a crash
  async function readJsonBody(req) {
    const raw = await readRequestBody(req);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  /* ── the scanner: a bearer key, before the sign-in gate ── */
  async function intake(req, res, url) {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    const who = tokens.check(m ? m[1].trim() : null, now());
    if (!who) { sendJson(res, 401, { error: 'invalid_key' }); return; }
    const p = personOfKey(who);
    if (url.pathname === '/api/mail-intake/status') {
      const until = Date.now() + Math.min(60, Math.max(0, Number(url.searchParams.get('wait')) || 0)) * 1000;
      while (running.has(keyOf(p.email)) && Date.now() < until) await new Promise(r => setTimeout(r, 500));
      sendJson(res, 200, store.summary(load(p.email), now()));
      return;
    }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    let body;
    try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
    if (!Array.isArray(body.mails)) { sendJson(res, 400, { error: 'mails[] expected' }); return; }
    const r = store.ingest(load(p.email), body.mails.slice(0, 10), now());
    saveDoc(p.email, r.doc);
    triageSoon(p);
    sendJson(res, 200, { accepted: r.accepted, duplicates: r.duplicates, ai: client ? 'on' : 'off' });
  }
  function handlePublic(req, res, url) {
    if (url.pathname !== '/api/mail-intake' && url.pathname !== '/api/mail-intake/status') return false;
    intake(req, res, url).catch(e => sendJson(res, 500, { error: e.message }));
    return true;
  }

  /* An accepted suggestion becomes a task (or an update) through the connector's tools. `edit`
     may override title / projectId / due; asTask turns an update suggestion into a new task. */
  function write(p, it, edit) {
    const s = it.suggestion || {};
    const note = store.noteOf(it);
    if (s.kind === 'update' && s.taskId && !edit.asTask) {
      return mcp.runToolAs(p.email, p.name, '', 'update_task', { project: s.projectId, task: s.taskId, add_update: { text: (s.title ? s.title + '\n' : '') + note } });
    }
    const projectId = edit.projectId || s.projectId;
    if (!projectId) throw new mcp.ToolError('Choose a project for this task (Edit)');
    const title = String(edit.title || s.title || (it.mail && it.mail.subject) || '').trim();
    const due = edit.due !== undefined ? edit.due : s.due;
    // only an exact id from the person's list: create_tasks would also match a name or code loosely
    const proj = mcp.mailContext(p.email, p.name).find(x => x.id === projectId);
    if (!proj) throw new mcp.ToolError('That project is no longer in your list — choose another in Edit');
    const me = mcp.whoAmI(p.email, p.name);
    return mcp.runToolAs(p.email, p.name, '', 'create_tasks', {
      project: proj.id,
      tasks: [{ title, note, ...(due ? { due_date: due } : {}), ...(proj && proj.mine ? { assignees: [me.id] } : {}) }]
    });
  }

  /* ── the page: signed in ── */
  const SUG_ROUTE = /^\/api\/mail-suggestions(?:\/([^/]+))?$/;
  async function handle(req, res, url, user) {
    const p = personOfUser(user);
    if (url.pathname === '/api/mail-connection') {
      if (req.method === 'GET') { sendJson(res, 200, { key: tokens.status(p.email), ai: health() }); return; }
      if (req.method === 'POST') { sendJson(res, 200, { key: tokens.issue(p.email, now()) }); return; }
      if (req.method === 'DELETE') { tokens.revoke(p.email); sendJson(res, 200, { ok: true }); return; }
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const m = url.pathname.match(SUG_ROUTE);
    if (!m) { sendJson(res, 404, { error: 'Not found' }); return; }
    if (!m[1]) {
      if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
      const doc = load(p.email);
      if (store.pendingIds(doc).length) triageSoon(p);
      sendJson(res, 200, store.forPage(doc, now()));
      return;
    }
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    let id;
    try { id = decodeURIComponent(m[1]); } catch (e) { sendJson(res, 400, { error: 'Bad suggestion id' }); return; }
    let body;
    try { body = await readJsonBody(req); } catch (e) { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
    const it = load(p.email).items.find(i => i.id === id);
    if (!it) { sendJson(res, 404, { error: 'No such suggestion' }); return; }
    if (!store.canAct(it, body.action)) { sendJson(res, 409, { error: 'Cannot ' + body.action + ' this suggestion now' }); return; }
    let result = null;
    if (body.action === 'accept' && !body.created) {
      try { result = write(p, it, body.edit || {}); } catch (e) {
        if (e instanceof mcp.ToolError) { sendJson(res, 400, { error: e.message }); return; }
        throw e;
      }
    }
    const r = store.act(load(p.email), id, body.action, body.reason, now());
    saveDoc(p.email, r.doc);
    if (body.action === 'retry') triageSoon(p);
    sendJson(res, 200, { ok: true, result });
  }

  return { handlePublic, handle, health };
};
