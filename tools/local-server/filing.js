'use strict';
/* Filing an email's files into the project's folder on the office network, as a conversation in the Outlook pane.
   The pane (personal pho_ key, through outlook.js) talks; the agent on the person's PC (tools/file-helper, same
   key) does the disk work. Each piece of disk work is a task: `pick` (choose the project's folder in a Windows
   folder picker), `tree` (read the project folder's tree), `open` (open it in Explorer), `file` (file the
   confirmed plan). The agent waits on /api/outlook/filing-next and receives a task's one-time token — once —
   and from then on the token is its only permission: it reads the task, downloads the files, posts the result.
   A filing is the pane's conversation about one email: its uploaded files (DATA_DIR/filing-tmp/<filing>), the
   project's tree (asked of the agent once), the turns with Claude, and the last plan Claude proposed — which
   is the only plan "confirm" ever sends to the PC.
   The local path: the pane names the email's attachments (name, size) instead of uploading them, and the agent saves
   them from classic Outlook on the PC (files[n].source 'outlook'); only what Outlook there cannot give is asked back
   (result { needUpload: [n…] }), uploaded by the pane (filing-file?n=) and downloaded by the agent ('upload'). What
   goes up is what the server will send the agent, and Azure's free plan allows 165 MB a day out: uploads stop for
   the (UTC) day at FILING_DAILY_BYTES (filing.json budget), 429 daily_budget.
   What each Hub project knows — its folder's name under "@Omicron Projects", its filing guide, the filings
   so far — and the register contacts the Hub page last sent are kept in filing.json. Tasks and filings live in
   memory: a restart only loses work nobody finished.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ai = require('./filing-ai');

const TTL = Number(process.env.FILING_TTL_MS) || 15 * 60 * 1000;            // a filing's (and its file task's) life
const QUICK = Number(process.env.FILING_QUICK_TTL_MS) || 2 * 60 * 1000;     // a pick, tree or open task's life
const PICK = Number(process.env.FILING_PICK_TTL_MS) || 10 * 60 * 1000;      // … a pick's, from when the agent opens it (a person is choosing)
const POLL = Number(process.env.FILING_POLL_MS) || 25 * 1000;               // how long the agent's request waits for a task
const TREE_WAIT = Number(process.env.FILING_TREE_WAIT_MS) || 20 * 1000;     // how long a proposal waits for the tree
const AGENT_WAIT = Number(process.env.FILING_AGENT_WAIT_MS) || 15 * 1000;   // … and for an agent to take the tree task
const DAILY = Number(process.env.FILING_DAILY_BYTES) || 50 * 1024 * 1024; // bytes a day the agents may download from the server
const KEEP = 60 * 60 * 1000;  // a task or filing stays this long after it ends, for the pane's status
const MAX_FILES = 20;
const LOG_MAX = 200;
const GUIDE_MAX = 4000;
const WRITERS = ['editor', 'admin', 'superadmin'];
// anything an email brings may be filed, except programs and scripts
const BLOCKED = /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|lnk|hta|cpl|reg|dll)$/i;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeName = n => String(n == null ? '' : n).replace(/[\u0000-\u001f\\/:*?"<>|]/g, '').replace(/^[. ]+|[. ]+$/g, '').slice(0, 150);
// the project's folder under "@Omicron Projects": one folder name, never a path
const folderName = v => { const s = String(v == null ? '' : v).trim(); return s && s.length <= 200 && !/[\\/:*?"<>|\u0000-\u001f]/.test(s) && !/^\.+$/.test(s) && !/[. ]$/.test(s) ? s : null; };
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const oneLine = (v, n) => clip(String(v == null ? '' : v).replace(/[\r\n]+/g, ' '), n); // for the prompt and the log
const REGISTER_ID = /^[A-Za-z0-9_-]{1,80}$/;

/* The first draft of a project's filing guide: Folder Manager's receive rules, in words. Claude goes by it
   until the office writes the project's own guide. */
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
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { console.error('filing: clearing', TMP, e.message); } // left by a restart: nobody can reach those filings any more; the server never fails to start
  const tasks = new Map();   // id → task
  const filings = new Map(); // id → filing
  const byToken = new Map(); // sha(token) → task id
  const waiting = new Map(); // who → Set of wake-ups of agents waiting for a task

  const load = () => {
    const d = readJson(STORE);
    const o = d && typeof d === 'object' ? { projects: d.projects || {}, contacts: d.contacts || {} } : { projects: {}, contacts: {} };
    if (d && d.budget && typeof d.budget === 'object') o.budget = d.budget;
    return o;
  };
  /* The day's planned sends to the agents: the bytes uploaded for filing today (UTC), each sent once to the agent. */
  const today = () => new Date().toISOString().slice(0, 10);
  const usedToday = d => (d.budget && d.budget.day === today() ? Number(d.budget.bytes) || 0 : 0);
  const fits = n => usedToday(load()) + n <= DAILY;
  function spend(n) {
    const d = load();
    d.budget = { day: today(), bytes: usedToday(d) + n };
    writeJsonAtomic(STORE, d);
  }
  const known = id => load().projects[id] || { folder: '', guide: '', log: [] };
  const projectOf = (d, id) => d.projects[id] || (d.projects[id] = { folder: '', guide: '', log: [] });
  const writer = person => WRITERS.includes(mcp.whoAmI(person.email, person.name).role);
  const nextFor = who => { for (const t of tasks.values()) if (t.who === who && !t.handed && !t.closed && t.exp > Date.now()) return t; return null; };
  const wake = who => { for (const f of [...(waiting.get(who) || [])]) f(); };
  const newId = () => crypto.randomBytes(9).toString('hex');
  const iso = ms => new Date(ms).toISOString();
  // the register contacts of a Hub project, through the registerProjectId in its document ([] when none)
  function contactsOf(p, projectId) {
    let rid = null;
    try { rid = mcp.projectDoc(p.email, p.name, projectId).registerProjectId; } catch (e) { if (!(e instanceof mcp.ToolError)) throw e; }
    const c = rid ? load().contacts[rid] : null;
    return c && Array.isArray(c.list) ? c.list : [];
  }

  /* A task's token stops working; those waiting for its result are told. */
  function close(t) {
    for (const [h, id] of byToken) if (id === t.id) byToken.delete(h);
    delete t.token;
    t.closed = true;
    for (const f of [...t.waiters]) f();
  }
  /* A filing ends: its waiting files go. */
  function endFiling(f) {
    fs.rmSync(path.join(TMP, f.id), { recursive: true, force: true });
    f.closed = true;
  }
  function sweep(now = Date.now()) {
    for (const [id, t] of tasks) {
      if (!t.closed && t.exp < now) close(t);
      if (t.exp + KEEP < now) tasks.delete(id);
    }
    for (const [id, f] of filings) {
      if (!f.closed && f.exp < now) endFiling(f);
      if (f.exp + KEEP < now) filings.delete(id);
    }
  }
  function makeTask(kind, x) {
    const token = crypto.randomBytes(32).toString('base64url');
    const t = {
      id: newId(), kind, who: x.who, person: x.person, base: x.base, by: mcp.whoAmI(x.person.email, x.person.name).name,
      projectId: x.project.id, project: x.project, folder: x.folder || '', lang: x.lang === 'en' ? 'en' : 'he', token,
      exp: Date.now() + (kind === 'file' ? TTL : QUICK), handed: null, opened: false, result: null, closed: false, cancelled: false,
      waiters: new Set(), ...(x.extra || {})
    };
    tasks.set(t.id, t);
    byToken.set(sha(token), t.id);
    wake(x.who);
    return t;
  }
  /* Waits for the task's result: 'done' (result or cancel), 'none' (no agent took it in time), 'slow'. */
  function awaitTask(t) {
    return new Promise(resolve => {
      let fired = false;
      const timers = [];
      const done = how => {
        if (fired) return;
        fired = true;
        timers.forEach(clearTimeout);
        t.waiters.delete(finish);
        resolve(how);
      };
      const finish = () => done(t.result || t.cancelled ? 'done' : 'expired');
      if (t.closed) { finish(); return; }
      t.waiters.add(finish);
      timers.push(setTimeout(() => { if (!t.handed) done('none'); }, AGENT_WAIT));
      timers.push(setTimeout(() => done(t.handed ? 'slow' : 'none'), TREE_WAIT));
    });
  }
  const json = async req => { const raw = await readRequestBody(req); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  const projectRef = g => ({ id: g.project.id, code: g.project.code || '', name: g.project.name });

  /* ── the pane and the agent (outlook.js has checked the key and the method; p is the person, who the key's owner) ── */
  async function handlePane(req, res, url, p, who, base) {
    sweep();
    const route = url.pathname.slice('/api/outlook/'.length);
    const getProject = ref => mcp.runToolAs(p.email, p.name, base, 'get_project', { project: String(ref || '') }); // ToolError when not visible

    /* the agent on the PC: this person's next task, handed out once; waits up to POLL for one */
    if (route === 'filing-next') {
      const pc = clip(url.searchParams.get('pc'), 60);
      let t = nextFor(who);
      if (!t) {
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
        t = nextFor(who);
      }
      if (!t) { sendJson(res, 200, { task: null }); return; }
      t.handed = { at: new Date().toISOString(), pc };
      const token = t.token;
      delete t.token; // from here on the server keeps only its hash
      sendJson(res, 200, { task: { id: t.id, kind: t.kind, token } });
      return;
    }
    if (route === 'filing-task') {
      const t = tasks.get(url.searchParams.get('id') || '');
      if (!t || t.who !== who) { sendJson(res, 404, { error: 'no_task' }); return; }
      sendJson(res, 200, { kind: t.kind, handed: t.handed, opened: t.opened, result: t.result, expired: !t.result && !t.cancelled && t.exp < Date.now(), cancelled: t.cancelled });
      return;
    }
    if (route === 'filing-project') {
      const g = getProject(url.searchParams.get('project'));
      const pr = known(g.project.id);
      sendJson(res, 200, { folder: pr.folder || '', guide: pr.guide || '', defaultGuide: DEFAULT_GUIDE, contacts: contactsOf(p, g.project.id).length, canWrite: writer(p) });
      return;
    }
    if (route === 'filing-pick' || route === 'filing-open' || route === 'filing-guide' || route === 'filing-guide-add' || route === 'filing') {
      const body = await json(req);
      if (route !== 'filing-open' && !writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
      const g = getProject(body.projectId);
      const project = projectRef(g);
      const pr = known(project.id);
      const x = { who, person: p, base, project, folder: pr.folder || '', lang: body.lang };
      if (route === 'filing-pick') { sendJson(res, 200, { taskId: makeTask('pick', x).id }); return; }
      if (route === 'filing-open') {
        const rel = ai.relPath(body.rel);
        if (rel == null) { sendJson(res, 400, { error: 'rel' }); return; }
        if (!pr.folder) { sendJson(res, 409, { error: 'no_folder' }); return; }
        sendJson(res, 200, { taskId: makeTask('open', { ...x, extra: { rel } }).id });
        return;
      }
      if (route === 'filing-guide' || route === 'filing-guide-add') {
        let guide;
        if (route === 'filing-guide') guide = clip(body.guide, GUIDE_MAX);
        else {
          const line = clip(body.text, 300).replace(/\s+/g, ' ').trim();
          if (!line) { sendJson(res, 400, { error: 'empty' }); return; }
          // the line joins the guide Claude goes by: the project's own, else the first draft
          guide = [String(pr.guide || '').trim() || DEFAULT_GUIDE, line].join('\n');
          if (guide.length > GUIDE_MAX) { sendJson(res, 413, { error: 'too_long' }); return; }
        }
        const d = load();
        Object.assign(projectOf(d, project.id), { guide, updatedBy: mcp.whoAmI(p.email, p.name).name, updatedAt: new Date().toISOString() });
        writeJsonAtomic(STORE, d);
        sendJson(res, 200, { guide });
        return;
      }
      // a new filing
      const m = body.mail && typeof body.mail === 'object' ? body.mail : {};
      const from = m.from && typeof m.from === 'object' ? m.from : {};
      // the attachments the PC saves from classic Outlook: named here, their bytes never reach the server
      const named = Array.isArray(body.files) ? body.files : [];
      if (named.length > MAX_FILES) { sendJson(res, 413, { error: 'too_many' }); return; }
      const files = [];
      for (const x of named) {
        const name = safeName(x && x.name);
        if (!name) { sendJson(res, 400, { error: 'name' }); return; }
        if (BLOCKED.test(name)) { sendJson(res, 415, { error: 'type' }); return; }
        const size = Math.max(0, Math.floor(Number(x.size) || 0));
        files.push({ name, size, source: 'outlook' });
      }
      const received = Date.parse(m.received);
      const f = {
        id: newId(), who, person: p, base, projectId: project.id, project, files, needUpload: [],
        mail: {
          subject: oneLine(m.subject, 300),
          from: oneLine([from.name, from.email ? '<' + from.email + '>' : ''].filter(Boolean).join(' '), 300),
          fromEmail: oneLine(from.email, 200),
          conversationId: clip(m.conversationId, 400),
          internetMessageId: oneLine(m.internetMessageId, 400),
          received: Number.isFinite(received) ? iso(received) : '',
          body: clip(m.body, 1500)
        },
        lang: body.lang === 'en' ? 'en' : 'he', tree: null, treeTask: null, turns: [], plan: null, taskId: null,
        exp: Date.now() + TTL, closed: false, busy: false
      };
      filings.set(f.id, f);
      sendJson(res, 200, { id: f.id, exp: iso(f.exp) });
      return;
    }

    // the routes of one filing
    const f = filings.get(url.searchParams.get('id') || '');
    if (!f || f.who !== who) { sendJson(res, 404, { error: 'no_filing' }); return; }
    const over = () => f.closed || f.exp < Date.now();

    // filing-file: one file, raw bytes: a new one before the conversation starts, or (?n=) a named one the PC could
    // not save from Outlook, between its answer and the next confirm
    if (route === 'filing-file') {
      const nq = url.searchParams.get('n');
      const slot = nq != null && /^\d{1,2}$/.test(nq) ? Number(nq) : null;
      if (nq != null && slot == null) { sendJson(res, 400, { error: 'n' }); return; }
      // the state that lets this upload in: checked before the bytes come and again after
      const refused = () => {
        if (over()) return [410, 'expired'];
        if (slot != null) return f.taskId || f.busy || !f.needUpload.includes(slot) || f.files[slot].source !== 'outlook' ? [409, 'not_asked'] : null;
        if (f.turns.length || f.taskId || f.busy) return [409, 'started'];
        if (f.files.length >= MAX_FILES) return [413, 'too_many'];
        return null;
      };
      let no = refused();
      if (no) { sendJson(res, no[0], { error: no[1] }); return; }
      const name = slot != null ? f.files[slot].name : safeName(url.searchParams.get('name'));
      if (!name || BLOCKED.test(name)) { sendJson(res, 415, { error: 'type' }); return; }
      // the day's budget, before the bytes come when their length is known
      const said = Number(req.headers['content-length']);
      if (Number.isFinite(said) && said > 0 && !fits(said)) { req.resume(); sendJson(res, 429, { error: 'daily_budget' }); return; }
      let buf;
      try { buf = await readRequestBuffer(req); } catch (e) { sendJson(res, 413, { error: 'too_large' }); return; }
      if (!buf.length) { sendJson(res, 400, { error: 'empty' }); return; }
      // ended, proposed on or confirmed while the bytes came in
      no = refused();
      if (no) { sendJson(res, no[0], { error: no[1] }); return; }
      if (!fits(buf.length)) { sendJson(res, 429, { error: 'daily_budget' }); return; }
      spend(buf.length);
      const n = slot != null ? slot : f.files.length;
      const dir = path.join(TMP, f.id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, String(n)), buf);
      f.files[n] = { name, size: buf.length, source: 'upload' };
      if (slot != null) f.needUpload = f.needUpload.filter(x => x !== slot);
      sendJson(res, 200, { ok: true, n });
      return;
    }

    const body = await json(req);
    if (over()) { sendJson(res, 410, { error: 'expired' }); return; }
    if (f.taskId) { sendJson(res, 409, { error: 'confirmed' }); return; }

    if (route === 'filing-propose') {
      if (f.busy) { sendJson(res, 409, { error: 'busy' }); return; }
      const text = clip(body.text, 1000).trim();
      const mine = {}; // this request's hold on the filing: a later request's hold is never released by this one
      f.busy = mine;
      const release = () => { if (f.busy === mine) f.busy = false; };
      // a correction that does not end in a new proposal leaves no plan to confirm: the previous one was refused
      if (text) f.plan = null;
      try {
        const pr = known(f.projectId);
        if (!pr.folder) { sendJson(res, 200, { needsFolder: true }); return; }
        if (!f.tree) {
          // ask the agent for the tree: the task already open for this filing, or a new one
          let t = f.treeTask && tasks.get(f.treeTask);
          if (!t || t.closed) {
            t = makeTask('tree', { who, person: f.person, base: f.base, project: f.project, folder: pr.folder, lang: f.lang, extra: { filingId: f.id } });
            f.treeTask = t.id;
          }
          // the pane may give up while the tree is awaited (closed, reloaded): its next request is not "busy"
          res.on('close', release);
          const how = await awaitTask(t);
          res.off('close', release);
          if (res.destroyed) return;
          if (how === 'none' || how === 'slow') { sendJson(res, 200, { agent: how }); return; }
          if (t.result && t.result.missing) { sendJson(res, 200, { missing: true }); return; }
          if (!f.tree) { sendJson(res, 200, { agent: 'failed' }); return; } // cancelled or expired on the PC
        }
        if (!client) { sendJson(res, 200, { ai: 'unavailable' }); return; }
        const turn = { role: 'user', text };
        let out;
        try {
          out = await ai.propose(client, model, {
            project: f.project, guide: String(pr.guide || '').trim() || DEFAULT_GUIDE, tree: f.tree, log: (pr.log || []).slice(-30).reverse(),
            contacts: contactsOf(f.person, f.projectId), mail: f.mail, files: f.files, turns: [...f.turns, turn], lang: f.lang
          });
        } catch (e) {
          console.error('filing propose failed:', e.message);
          sendJson(res, 200, { ai: 'failed' });
          return;
        }
        if (over() || f.taskId) { sendJson(res, 410, { error: 'expired' }); return; }
        f.turns.push(turn, { role: 'assistant', text: out.message, plan: out.plan });
        f.plan = out.plan;
        sendJson(res, 200, { message: out.message, plan: out.plan, guideAdd: out.guideAdd });
      } finally {
        release();
      }
      return;
    }
    if (route === 'filing-confirm') {
      if (!writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
      if (f.busy) { sendJson(res, 409, { error: 'busy' }); return; }
      if (!f.plan || !f.plan.files.some(x => x.dest !== null)) { sendJson(res, 409, { error: 'no_plan' }); return; }
      getProject(f.projectId); // still open to this person
      const pr = known(f.projectId);
      if (!pr.folder) { sendJson(res, 409, { error: 'no_folder' }); return; }
      f.exp = Date.now() + TTL; // the filing lives as long as its file task
      const t = makeTask('file', { who, person: p, base, project: f.project, folder: pr.folder, lang: f.lang, extra: { filingId: f.id, plan: f.plan } });
      f.taskId = t.id;
      sendJson(res, 200, { taskId: t.id });
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  }

  /* ── the agent on the PC, with a task's token: its only permission ── */
  const ROUTE = /^\/api\/filing\/([A-Za-z0-9_-]{20,80})(?:\/(result|cancel|file)(?:\/(\d{1,2}))?)?$/;
  const METHOD = { '': 'GET', file: 'GET', result: 'POST', cancel: 'POST' };
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
    const t = tasks.get(byToken.get(sha(token)));
    if (!t || t.closed) { sendJson(res, 410, { error: 'expired' }); return; }
    if (req.method !== METHOD[what]) { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    const f = t.filingId ? filings.get(t.filingId) : null;

    if (!what) {
      t.opened = true;
      // the folder picker is open on the PC from now on: the person's choice may take a while
      if (t.kind === 'pick') t.exp = Math.max(t.exp, Date.now() + PICK);
      sendJson(res, 200, {
        kind: t.kind, lang: t.lang, project: t.project, folder: t.folder,
        ...(t.kind === 'open' && t.rel ? { rel: t.rel } : {}),
        ...(t.kind === 'file' ? {
          files: f.files.map((x, i) => ({ n: i, name: x.name, size: x.size, source: x.source })), plan: t.plan,
          // what classic Outlook on the PC finds the email by
          mail: { internetMessageId: f.mail.internetMessageId, conversationId: f.mail.conversationId, subject: f.mail.subject, received: f.mail.received, from: f.mail.fromEmail }
        } : {}),
        by: t.by
      });
      return;
    }
    if (what === 'file') {
      const x = t.kind === 'file' && f && !f.closed && n != null && f.files[Number(n)] && f.files[Number(n)].source === 'upload' ? f.files[Number(n)] : null;
      if (!x) { sendJson(res, 404, { error: 'no_file' }); return; }
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': x.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(path.join(TMP, f.id, String(Number(n)))).on('error', () => res.destroy()).pipe(res);
      return;
    }
    const body = await json(req);
    if (what === 'cancel') {
      t.cancelled = true;
      if (t.kind === 'file' && f && f.taskId === t.id) f.taskId = null; // the pane may confirm again
      close(t);
      sendJson(res, 200, { ok: true });
      return;
    }

    // result: checked by kind, then its side effects
    if (body.missing === true) {
      t.result = { missing: true };
      if (t.kind === 'file' && f && f.taskId === t.id) f.taskId = null;
    } else if (t.kind === 'file' && body.needUpload != null) {
      // classic Outlook on the PC could not give these files: nothing was filed; the pane uploads them and confirms again
      const ns = [...new Set([].concat(body.needUpload))];
      if (!f || f.closed || !ns.length || !ns.every(x => Number.isInteger(x) && f.files[x] && f.files[x].source === 'outlook')) { sendJson(res, 400, { error: 'needUpload' }); return; }
      ns.sort((a, b) => a - b);
      f.needUpload = ns;
      if (f.taskId === t.id) f.taskId = null;
      t.result = { needUpload: ns };
    } else if (t.kind === 'pick') {
      if (body.cancelled === true) t.result = { cancelled: true };
      else {
        const folder = folderName(body.picked);
        if (!folder) { sendJson(res, 400, { error: 'folder' }); return; }
        if (!writer(t.person)) { sendJson(res, 403, { error: 'viewer' }); return; }
        mcp.runToolAs(t.person.email, t.person.name, t.base, 'get_project', { project: t.projectId }); // still open to this person
        const d = load();
        Object.assign(projectOf(d, t.projectId), { folder, updatedBy: t.by, updatedAt: new Date().toISOString() });
        writeJsonAtomic(STORE, d);
        t.result = { picked: folder };
      }
    } else if (t.kind === 'tree') {
      if (!Array.isArray(body.tree)) { sendJson(res, 400, { error: 'tree' }); return; }
      const tree = body.tree.slice(0, 3000).map(ai.relPath).filter(Boolean);
      if (f && !f.closed) f.tree = tree;
      t.result = { folders: tree.length };
    } else if (t.kind === 'open') {
      t.result = { opened: true };
    } else {
      // file: what the agent actually did
      const did = (Array.isArray(body.files) ? body.files : []).slice(0, MAX_FILES)
        .map(x => x && typeof x === 'object' ? { name: safeName(x.name), dest: ai.relPath(x.dest), savedAs: safeName(x.savedAs) } : {})
        .filter(x => x.name && x.dest != null);
      const error = body.error ? clip(body.error, 500) : null;
      const mode = t.plan.mode === 'new-version' ? 'new-version' : 'existing';
      const at = new Date().toISOString();
      if (did.length) {
        const d = load();
        const pr = projectOf(d, t.projectId);
        pr.log = [...(pr.log || []), ...did.map(x => ({ at, by: t.by, from: f.mail.from, subject: f.mail.subject, file: x.name, dest: x.dest, mode }))].slice(-LOG_MAX);
        writeJsonAtomic(STORE, d);
      }
      let taskLogged = false;
      const lt = did.length && linkedTaskOf ? linkedTaskOf(f.mail.conversationId) : null;
      if (lt && lt.projectId === t.projectId) {
        const lines = did.map(x => `תויק: ${x.savedAs || x.name} ← ${x.dest.replace(/\//g, '\\') || '\\'}`);
        try { mcp.taskLog(t.person.email, t.person.name, lt.projectId, lt.taskId, lines.join('\n')); taskLogged = true; }
        catch (e) { if (!(e instanceof mcp.ToolError)) throw e; }
      }
      t.result = { files: did, error, taskLogged };
      if (f) endFiling(f);
    }
    close(t);
    sendJson(res, 200, { ok: true });
  }

  /* ── the Hub page (signed in): the register contacts of one register project, for the filings ── */
  async function handleContacts(req, res, url, user) {
    const id = url.pathname.slice('/api/register-contacts/'.length);
    if (!REGISTER_ID.test(id)) { sendJson(res, 404, { error: 'Not found' }); return; }
    if (req.method !== 'PUT') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    const person = { email: user.email || null, name: user.name };
    if (!writer(person)) { sendJson(res, 403, { error: 'viewer' }); return; }
    const raw = await readRequestBody(req);
    const rows = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(rows) || rows.length > 200) { sendJson(res, 400, { error: 'rows' }); return; }
    const list = rows.filter(r => r && typeof r === 'object').map(r => ({
      name: clip(r.name, 120).trim(), role: clip(r.role, 80).trim(), firm: clip(r.firm, 120).trim(),
      emails: (Array.isArray(r.emails) ? r.emails : []).slice(0, 5).map(e => clip(e, 200).trim()).filter(Boolean)
    })).filter(r => r.name);
    const d = load();
    d.contacts[id] = { at: new Date().toISOString(), by: mcp.whoAmI(person.email, person.name).name, list };
    writeJsonAtomic(STORE, d);
    sendJson(res, 200, { ok: true, n: list.length });
  }

  return { handlePane, handleToken, handleContacts, DEFAULT_GUIDE };
};
module.exports.folderName = folderName;
