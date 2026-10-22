'use strict';
/* Filing an email's files into the project's folder on the office network.
   The Outlook pane (personal pho_ key, through outlook.js) opens a job, uploads the chosen files to
   DATA_DIR/filing-tmp/<job> and marks it ready. The agent on the person's PC (tools/file-helper, same key)
   waits on /api/outlook/filing-next and receives the job's one-time token — once — and its window then uses
   the token alone: it reads the job and what the office knows about the project's folder, asks Claude for a
   plan, files on the PC and reports back. (A browser link that would start the window was tried and does not
   work reliably in Chrome; see the spec.)
   What each Hub project knows — its folder's name under "@Omicron Projects", its filing guide, the filings
   so far — is kept in filing.json. Jobs live in memory: a restart only loses jobs nobody finished.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ai = require('./filing-ai');

const TTL = Number(process.env.FILING_TTL_MS) || 15 * 60 * 1000; // a job's (and its token's) life
const POLL = Number(process.env.FILING_POLL_MS) || 25 * 1000;     // how long the agent's request waits for a job
const KEEP = 60 * 60 * 1000;   // a job stays this long after it ends, for the pane's status
const MAX_FILES = 20;
const LOG_MAX = 200;
const WRITERS = ['editor', 'admin', 'superadmin'];
// anything an email brings may be filed, except programs and scripts
const BLOCKED = /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|lnk|hta|cpl|reg|dll)$/i;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeName = n => String(n == null ? '' : n).replace(/[\u0000-\u001f\\/:*?"<>|]/g, '').replace(/^[. ]+|[. ]+$/g, '').slice(0, 150);
// the project's folder under "@Omicron Projects": one folder name, never a path
const folderName = v => { const s = String(v == null ? '' : v).trim(); return s && s.length <= 200 && !/[\\/:*?"<>|\u0000-\u001f]/.test(s) && !/^\.+$/.test(s) && !/[. ]$/.test(s) ? s : null; };

/* The first draft of a project's filing guide: Folder Manager's receive rules, in words. The office edits it
   per project the first time the project is linked to its folder. */
const DEFAULT_GUIDE = [
  'תכניות מיועץ (PDF / DWG / RVT): CONSULTANTS ← תיקיית היועץ (XXXX-<יועץ>) ← XXXX-<יועץ>-plans ← תיקיית גרסה חדשה XXXX-<יועץ>-plans-vNN (המספר הבא). הגרסה הקודמת עוברת לתיקיית XXXX-<יועץ>-plans-@ver שלידה.',
  'עותק של קובצי ה-PDF החדשים נכנס גם ל-XXXX-<יועץ>-updated-PDF, והקבצים הקודמים שם עוברים ל-@ver.',
  'מסמכים מיועץ (לא תכניות): XXXX-<יועץ>-docs, בלי גרסה.',
  'מרשויות (משרד הבריאות, חברת החשמל, הרשות המקומית, היתר, תאגיד המים): GARM ← XXXX-garm-<רשות> ← Recieve.',
  'מכל השאר (עירייה, מנהל פרויקט, ספקים): RECEIVE ← XXXX-receive-<סוג>.'
].join('\n');

module.exports = function createFiling(ctx) {
  const { DATA_DIR, readJson, writeJsonAtomic, sendJson, readRequestBody, readRequestBuffer, mcp, client, model, linkedTaskOf } = ctx;
  const STORE = path.join(DATA_DIR, 'filing.json');
  const TMP = path.join(DATA_DIR, 'filing-tmp');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { console.error('filing: clearing', TMP, e.message); } // left by a restart: nobody can reach those jobs any more; the server never fails to start
  const jobs = new Map();    // id → job
  const byToken = new Map(); // sha(token) → job id
  const waiting = new Map(); // who → Set of wake-ups of agents waiting for a job

  const load = () => { const d = readJson(STORE); return d && d.projects ? d : { projects: {} }; };
  const known = id => load().projects[id] || { folder: '', guide: '', log: [] };
  const writer = person => WRITERS.includes(mcp.whoAmI(person.email, person.name).role);
  const nextFor = who => { for (const j of jobs.values()) if (j.who === who && j.ready && !j.handed && !j.closed && j.exp > Date.now()) return j; return null; };
  const wake = who => { for (const f of [...(waiting.get(who) || [])]) f(); };

  // the token stops working and the waiting files go
  function close(j) {
    for (const [h, id] of byToken) if (id === j.id) byToken.delete(h);
    delete j.token;
    fs.rmSync(path.join(TMP, j.id), { recursive: true, force: true });
    j.closed = true;
  }
  function sweep(now = Date.now()) {
    for (const [id, j] of jobs) {
      if (!j.closed && j.exp < now) close(j);
      if (j.exp + KEEP < now) jobs.delete(id);
    }
  }
  const json = async req => { const raw = await readRequestBody(req); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };

  /* ── the pane and the agent (outlook.js has checked the key; p is the person, who the key's owner) ── */
  async function handlePane(req, res, url, p, who, base) {
    sweep();
    if (url.pathname === '/api/outlook/filing') {
      const body = await json(req);
      if (!writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
      const g = mcp.runToolAs(p.email, p.name, base, 'get_project', { project: String(body.projectId || '') }); // ToolError when not visible
      const m = body.mail && typeof body.mail === 'object' ? body.mail : {};
      const from = m.from && typeof m.from === 'object' ? m.from : {};
      const token = crypto.randomBytes(32).toString('base64url');
      const j = {
        id: crypto.randomBytes(9).toString('hex'), who, person: p, base, by: mcp.whoAmI(p.email, p.name).name, token,
        projectId: g.project.id, project: { id: g.project.id, code: g.project.code || '', name: g.project.name },
        mail: {
          subject: String(m.subject || '').slice(0, 300),
          from: [from.name, from.email ? '<' + from.email + '>' : ''].filter(Boolean).join(' ').slice(0, 300),
          conversationId: String(m.conversationId || '').slice(0, 400)
        },
        lang: body.lang === 'en' ? 'en' : 'he', files: [], exp: Date.now() + TTL,
        ready: false, handed: null, opened: false, done: null, closed: false
      };
      jobs.set(j.id, j);
      byToken.set(sha(token), j.id);
      sendJson(res, 200, { id: j.id, exp: new Date(j.exp).toISOString() });
      return;
    }
    /* the agent on the PC: this person's next ready job, handed out once; waits up to POLL for one */
    if (url.pathname === '/api/outlook/filing-next') {
      const pc = String(url.searchParams.get('pc') || '').slice(0, 60);
      let j = nextFor(who);
      if (!j) {
        await new Promise(resolve => {
          const set = waiting.get(who) || new Set();
          waiting.set(who, set);
          let fired = false;
          const done = () => {
            if (fired) return;
            fired = true;
            clearTimeout(timer); set.delete(done);
            if (!set.size && waiting.get(who) === set) waiting.delete(who);
            resolve();
          };
          const timer = setTimeout(done, POLL);
          set.add(done);
          res.on('close', done);
        });
        if (res.writableEnded || res.destroyed) return;
        j = nextFor(who);
      }
      if (!j) { sendJson(res, 200, { job: null }); return; }
      j.handed = { at: new Date().toISOString(), pc };
      const token = j.token;
      delete j.token;
      sendJson(res, 200, { job: { id: j.id, token } });
      return;
    }
    const j = jobs.get(url.searchParams.get('id') || '');
    if (!j || j.who !== who) { sendJson(res, 404, { error: 'no_job' }); return; }
    if (url.pathname === '/api/outlook/filing-status') {
      sendJson(res, 200, { ready: j.ready, handed: j.handed, opened: j.opened, done: j.done, cancelled: !!j.cancelled, expired: !j.done && !j.cancelled && j.exp < Date.now() });
      return;
    }
    if (url.pathname === '/api/outlook/filing-ready') {
      if (j.closed) { sendJson(res, 410, { error: 'expired' }); return; }
      if (!j.files.length) { sendJson(res, 400, { error: 'no_files' }); return; }
      j.ready = true;
      wake(who);
      sendJson(res, 200, { ok: true });
      return;
    }
    // /api/outlook/filing-file: one file, raw bytes, while the job is not ready yet
    if (j.closed || j.ready) { sendJson(res, 409, { error: 'started' }); return; }
    const name = safeName(url.searchParams.get('name'));
    if (!name || BLOCKED.test(name)) { sendJson(res, 415, { error: 'type' }); return; }
    if (j.files.length >= MAX_FILES) { sendJson(res, 413, { error: 'too_many' }); return; }
    let buf;
    try { buf = await readRequestBuffer(req); } catch (e) { sendJson(res, 413, { error: 'too_large' }); return; }
    if (!buf.length) { sendJson(res, 400, { error: 'empty' }); return; }
    if (j.closed || j.ready) { sendJson(res, 409, { error: 'started' }); return; } // ready, cancelled or expired while the bytes came in
    const dir = path.join(TMP, j.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, String(j.files.length)), buf);
    j.files.push({ name, size: buf.length });
    sendJson(res, 200, { ok: true, n: j.files.length - 1 });
  }

  /* ── the window on the PC: the token is its only permission ── */
  const ROUTE = /^\/api\/filing\/([A-Za-z0-9_-]{20,80})(?:\/(project|suggest|done|cancel|file)(?:\/(\d{1,2}))?)?$/;
  const METHOD = { '': 'GET', file: 'GET', project: 'PUT', suggest: 'POST', done: 'POST', cancel: 'POST' };
  function handleToken(req, res, url) {
    const m = url.pathname.match(ROUTE);
    if (!m) return false;
    runToken(req, res, m[1], m[2] || '', m[3]).catch(e => {
      if (e instanceof mcp.ToolError) { sendJson(res, 403, { error: e.message }); return; }
      if (e instanceof SyntaxError) { sendJson(res, 400, { error: 'Invalid JSON' }); return; }
      console.error('filing:', e);
      sendJson(res, 500, { error: e.message });
    });
    return true;
  }
  async function runToken(req, res, token, what, n) {
    sweep();
    const j = jobs.get(byToken.get(sha(token)));
    if (!j || j.closed) { sendJson(res, 410, { error: 'expired' }); return; }
    if (req.method !== METHOD[what]) { sendJson(res, 405, { error: 'Method not allowed' }); return; }

    if (!what) {
      j.opened = true;
      const pr = known(j.projectId);
      sendJson(res, 200, {
        project: j.project, folder: pr.folder || '', guide: pr.guide || '', defaultGuide: DEFAULT_GUIDE,
        log: (pr.log || []).slice(-30).reverse(), by: j.by, mail: { subject: j.mail.subject, from: j.mail.from },
        files: j.files.map((f, i) => ({ n: i, name: f.name, size: f.size })), lang: j.lang, exp: new Date(j.exp).toISOString()
      });
      return;
    }
    if (what === 'file') {
      const f = n == null ? null : j.files[Number(n)];
      if (!f) { sendJson(res, 404, { error: 'no_file' }); return; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': f.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(path.join(TMP, j.id, String(Number(n)))).on('error', () => res.destroy()).pipe(res);
      return;
    }
    if (what === 'cancel') { j.cancelled = true; close(j); sendJson(res, 200, { ok: true }); return; }
    const body = await json(req);

    if (what === 'project') {
      const folder = folderName(body.folder);
      if (!folder) { sendJson(res, 400, { error: 'folder' }); return; }
      if (!writer(j.person)) { sendJson(res, 403, { error: 'viewer' }); return; }
      mcp.runToolAs(j.person.email, j.person.name, j.base, 'get_project', { project: j.projectId }); // still open to this person
      const d = load();
      const pr = d.projects[j.projectId] || (d.projects[j.projectId] = { folder: '', guide: '', log: [] });
      Object.assign(pr, { folder, guide: String(body.guide == null ? '' : body.guide).slice(0, 4000), updatedBy: j.by, updatedAt: new Date().toISOString() });
      writeJsonAtomic(STORE, d);
      sendJson(res, 200, { ok: true, folder: pr.folder, guide: pr.guide });
      return;
    }
    if (what === 'suggest') {
      const tree = (Array.isArray(body.tree) ? body.tree : []).slice(0, 3000).map(ai.relPath).filter(Boolean);
      if (!client) { sendJson(res, 200, { plan: null, reason: 'ai_unavailable' }); return; }
      const pr = known(j.projectId);
      try {
        const plan = await ai.suggest(client, model, { project: j.project, guide: pr.guide || '', tree, log: (pr.log || []).slice(-30).reverse(), mail: j.mail, files: j.files, lang: j.lang });
        sendJson(res, 200, { plan });
      } catch (e) {
        console.error('filing suggest failed:', e.message);
        sendJson(res, 200, { plan: null, reason: 'ai_failed' });
      }
      return;
    }
    // done: what the window actually did
    const did = (Array.isArray(body.files) ? body.files : []).slice(0, MAX_FILES)
      .map(f => f && typeof f === 'object' ? { name: safeName(f.name), dest: ai.relPath(f.dest), savedAs: safeName(f.savedAs) } : {})
      .filter(f => f.name && f.dest != null);
    const mode = body.mode === 'new-version' ? 'new-version' : 'existing';
    const at = new Date().toISOString();
    if (did.length) {
      const d = load();
      const pr = d.projects[j.projectId] || (d.projects[j.projectId] = { folder: '', guide: '', log: [] });
      pr.log = [...(pr.log || []), ...did.map(f => ({ at, by: j.by, from: j.mail.from, subject: j.mail.subject, file: f.name, dest: f.dest, mode }))].slice(-LOG_MAX);
      writeJsonAtomic(STORE, d);
    }
    let taskLogged = false;
    const lt = did.length && linkedTaskOf ? linkedTaskOf(j.mail.conversationId) : null;
    if (lt && lt.projectId === j.projectId) {
      const lines = did.map(f => `תויק: ${f.savedAs || f.name} ← ${f.dest.replace(/\//g, '\\') || '\\'}`);
      try { mcp.taskLog(j.person.email, j.person.name, lt.projectId, lt.taskId, lines.join('\n')); taskLogged = true; }
      catch (e) { if (!(e instanceof mcp.ToolError)) throw e; }
    }
    j.done = { at, files: did, mode, taskLogged };
    close(j);
    sendJson(res, 200, { ok: true, taskLogged });
  }

  return { handlePane, handleToken, DEFAULT_GUIDE };
};
module.exports.folderName = folderName;
