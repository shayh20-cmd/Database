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
   What each Hub project knows — its folder's name and the name of the root folder it is in (the office keeps
   projects on many computers, each sharing a drive topped by an "@<Name> Projects" folder; drive letters differ between
   PCs, so the PC finds the root by its name; a folder stored before roots has none, and the PC looks in its legacy
   root), its filing guide, the filings so far — and the register contacts the Hub page last sent are kept in
   filing.json, and so is its folder map (map: the seven areas of filing-ai.js, each with its folders and a note),
   mapped with Claude on the project's settings page in Project Hub (handleHub, signed in: the tasks go to the agent
   holding the key of the same person) and given to Claude with every filing.
   The export inbox: a folder on each PC (Desktop\לתיוק) that Revit / AutoCAD export into. The agent there announces
   what is in it (a batch, inbox-batch); the Hub's quick window (?quick=inbox) shows the batch, guesses the project
   from a project code in the file names, asks Claude where the files go in the project's PUBLISH area (inbox-propose:
   today's SENT folder and/or UPDATED, replacing a file of the same name) and sends the confirmed plan to the agent
   on the PC that announced the batch (an `inbox` task), which copies the files there and takes them out of the inbox.
   The same window files received files too (mode 'receive'): inbox-options offers who sent them (the project's
   consultant folders with its register contacts, the folders of its receive and permit areas, the tree), and Claude
   places them — a consultant's plans in a new version folder (the previous one may move into the @ver next to it), its
   documents in its docs folder, another party's in its folder — without replacing anything.
   Tasks, filings, mapping sessions and inbox batches live in memory: a restart only loses work nobody finished.
   Spec: docs/superpowers/specs/2026-10-22-outlook-file-to-folder-design.md */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ai = require('./filing-ai');
const plans = require('./filing-plan');
const layout = require('./filing-layout');
const { personOf } = require('./mail-tokens');

const TTL = Number(process.env.FILING_TTL_MS) || 15 * 60 * 1000;            // a filing's (and its file task's) life
const QUICK = Number(process.env.FILING_QUICK_TTL_MS) || 2 * 60 * 1000;     // a pick, tree or open task's life
const ACTIVE = 90 * 1000; // a PC whose agent asked for a task within this long is on (it asks again at least every POLL)
const PICK = Number(process.env.FILING_PICK_TTL_MS) || 10 * 60 * 1000;      // … a pick's, from when the agent opens it (a person is choosing)
const POLL = Number(process.env.FILING_POLL_MS) || 25 * 1000;               // how long the agent's request waits for a task
const TREE_WAIT = Number(process.env.FILING_TREE_WAIT_MS) || 20 * 1000;     // how long a proposal waits for the tree
const AGENT_WAIT = Number(process.env.FILING_AGENT_WAIT_MS) || 15 * 1000;   // … and for an agent to take the tree task
const DAILY = Number(process.env.FILING_DAILY_BYTES) || 50 * 1024 * 1024; // bytes a day the agents may download from the server
// an inbox task's life from when the PC takes it: copying many large exports to a network drive may take a while
const INBOX_TTL = Number(process.env.FILING_INBOX_TTL_MS) || 60 * 60 * 1000;
const BATCH_TTL = 24 * 60 * 60 * 1000; // an export inbox batch's life
const KEEP = 60 * 60 * 1000;  // a task or filing stays this long after it ends, for the pane's status
const MAX_FILES = 20;
const INBOX_MAX = 100; // files in one inbox batch
const LOG_MAX = 200;
const GUIDE_MAX = 4000;
const WRITERS = ['editor', 'admin', 'superadmin'];
// anything an email brings may be filed, except programs and scripts
const BLOCKED = /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|lnk|hta|cpl|reg|dll)$/i;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeName = n => String(n == null ? '' : n).replace(/[\u0000-\u001f\\/:*?"<>|]/g, '').replace(/^[. ]+|[. ]+$/g, '').slice(0, 150);
// the project's folder, and the root folder it is in ("@Kappa projects"): each one folder name, never a path
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

/* The project of an export inbox batch, from the project codes in its file names: a code is a whole token (names
   split on - _ . and spaces; a code with a separator inside is a run of tokens), in any case. The one project
   matched by most files; none when no file matches or two projects tie. */
function inboxGuess(files, projects) {
  const tokens = v => String(v == null ? '' : v).toLowerCase().split(/[-_. ]+/).filter(Boolean);
  const count = new Map();
  for (const f of files || []) {
    const s = ' ' + tokens(f.name).join(' ') + ' ';
    for (const p of projects || []) {
      const c = tokens(p.code);
      if (c.length && s.includes(' ' + c.join(' ') + ' ')) count.set(p, (count.get(p) || 0) + 1);
    }
  }
  let best = null, most = 0, tie = false;
  for (const [p, n] of count) {
    if (n > most) { best = p; most = n; tie = false; } else if (n === most) tie = true;
  }
  return best && !tie ? { projectId: best.id, code: best.code || '', name: best.name, why: 'code' } : { projectId: null, code: '', name: '', why: 'none' };
}

module.exports = function createFiling(ctx) {
  const { DATA_DIR, readJson, writeJsonAtomic, sendJson, readRequestBody, readRequestBuffer, mcp, client, model, linkedTaskOf } = ctx;
  const STORE = path.join(DATA_DIR, 'filing.json');
  const TMP = path.join(DATA_DIR, 'filing-tmp');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { console.error('filing: clearing', TMP, e.message); } // left by a restart: nobody can reach those filings any more; the server never fails to start
  const tasks = new Map();   // id → task
  const filings = new Map(); // id → filing
  const maps = new Map();    // id → a mapping session of the Hub page
  const byToken = new Map(); // sha(token) → task id
  const waiting = new Map(); // who → Set of wake-ups of agents waiting for a task
  const batches = new Map(); // id → an export inbox batch, announced by the agent on a PC
  // the person's PCs as their agents last asked for a task: who|pc → { pc, inbox (the export inbox's path there), at }.
  // Kept in memory only: the agents ask again within POLL, so a restart of the server is forgotten in seconds
  const pcs = new Map();
  const seenPc = (who, pc, inbox) => {
    if (!pc) return;
    const k = who + '|' + pc.toLowerCase();
    const o = pcs.get(k) || { pc, inbox: '' };
    pcs.set(k, { ...o, pc, inbox: inbox || o.inbox, at: Date.now() });
  };
  // the language each person last used on the Hub page (requests that carry lang), for the agent's inbox toast; 'he' until then
  const langs = new Map();
  const noteLang = (who, lang) => { if (lang === 'he' || lang === 'en') langs.set(who, lang); };

  const load = () => {
    const d = readJson(STORE);
    const o = d && typeof d === 'object' ? { projects: d.projects || {}, contacts: d.contacts || {} } : { projects: {}, contacts: {} };
    if (d && d.budget && typeof d.budget === 'object') o.budget = d.budget;
    if (d && d.office && typeof d.office === 'object') o.office = d.office;
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
  const known = id => load().projects[id] || { folder: '', root: '', guide: '', log: [] };
  /* A project root's network share path as a helper reports it — the host, the share, any folders, the root last:
     kept with the project, and sent with its tasks, so a PC that has no drive mapped to that share still finds the root.
     Only a share path whose last folder is the root's name; anything else is ''. */
  const BS = String.fromCharCode(92);
  const shareFor = (v, root) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!root || s.length > 300 || !s.startsWith(BS + BS)) return '';
    const parts = s.slice(2).split(BS);
    if (parts.length < 2 || parts.some(x => folderName(x) !== x)) return '';
    return parts[parts.length - 1].toLowerCase() === String(root).toLowerCase() ? s : '';
  };
  const projectOf = (d, id) => d.projects[id] || (d.projects[id] = { folder: '', root: '', guide: '', log: [] });
  // the office's type list (Settings → the publish section of a project): filing.json's office.types, else the default
  const officeTypes = () => layout.cleanTypes((load().office || {}).types) || layout.OFFICE_TYPES;
  const typesOf = map => (map && map.publish && map.publish.types) || officeTypes();
  const writer = person => WRITERS.includes(mcp.whoAmI(person.email, person.name).role);
  // a task with a pc goes only to the agent on that PC (an inbox's files are on the PC that announced them)
  const samePc = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
  // the person's newest open batch of that PC's export inbox (of any PC when pc is ''), or null; a folder the person
  // chose on the PC (a batch with a source) is not the inbox
  const latestBatch = (who, pc) => {
    let best = null;
    for (const b of batches.values()) if (b.who === who && b.status === 'new' && !b.source && (!pc || samePc(b.pc, pc)) && (!best || b.at >= best.at)) best = b;
    return best;
  };
  /* A batch's files from what the PC sent: programs are never published, and a name the server would change (too
     long, a character it drops) could never be matched to the file on the PC. */
  function batchFiles(list) {
    const files = [];
    for (const x of Array.isArray(list) ? list.slice(0, INBOX_MAX) : []) {
      const raw = x && x.name != null ? String(x.name) : '';
      const name = safeName(raw);
      if (!name || BLOCKED.test(name)) continue;
      if (name !== raw) { console.log('filing: a file left out of a batch, its name is not kept as is:', name.slice(0, 60)); continue; }
      const ms = typeof x.mtime === 'number' ? x.mtime : Date.parse(x.mtime);
      files.push({ n: files.length, name, size: Math.max(0, Math.floor(Number(x.size) || 0)), mtime: Number.isFinite(ms) ? iso(ms) : '' });
    }
    return files;
  }
  /* A new batch of a PC: the export inbox's (source '') or a folder the person chose there (source: the id the PC
     keeps the folder's path under; folder: its name, to show). It replaces the person's open batch of the same kind
     from the same PC unless that one is being published. */
  function addBatch(who, p, base, pc, files, source = '', folder = '') {
    for (const [id, b] of batches) if (b.who === who && samePc(b.pc, pc) && !b.source === !source && b.status === 'new' && !b.taskId) batches.delete(id);
    const b = {
      id: newId(), who, person: p, base, pc, files, source, folder, at: new Date().toISOString(), status: 'new', exp: Date.now() + BATCH_TTL,
      h: null, plan: null, taskId: null, busy: false
    };
    batches.set(b.id, b);
    return b;
  }
  const nextFor = (who, pc) => { for (const t of tasks.values()) if (t.who === who && !t.handed && !t.closed && t.exp > Date.now() && (!t.pc || samePc(t.pc, pc))) return t; return null; };
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

  /* A task's token stops working; those waiting for its result are told. An inbox task that ends without a result
     (expired, cancelled) frees its batch: the window may confirm again. One the PC had taken keeps its token when it
     expires (late): the PC may still be copying, and its result, when it comes, still counts (runToken). */
  function close(t, late = false) {
    if (!late) for (const [h, id] of byToken) if (id === t.id) byToken.delete(h);
    delete t.token;
    t.closed = true;
    if (t.kind === 'inbox' && !t.result) {
      const b = batches.get(t.inboxId);
      if (b && b.taskId === t.id) b.taskId = null;
    }
    for (const f of [...t.waiters]) f();
  }
  /* A filing ends: its waiting files go. */
  function endFiling(f) {
    fs.rmSync(path.join(TMP, f.id), { recursive: true, force: true });
    f.closed = true;
  }
  function sweep(now = Date.now()) {
    for (const [id, t] of tasks) {
      if (!t.closed && t.exp < now) close(t, t.kind === 'inbox' && !!t.handed);
      if (t.exp + KEEP < now) {
        tasks.delete(id);
        for (const [h, tid] of byToken) if (tid === id) byToken.delete(h);
      }
    }
    for (const [id, f] of filings) {
      if (!f.closed && f.exp < now) endFiling(f);
      if (f.exp + KEEP < now) filings.delete(id);
    }
    for (const [id, m] of maps) if (m.exp < now) maps.delete(id);
    for (const [id, b] of batches) if (b.exp < now) batches.delete(id);
  }
  function makeTask(kind, x) {
    const token = crypto.randomBytes(32).toString('base64url');
    const t = {
      id: newId(), kind, who: x.who, person: x.person, base: x.base, by: mcp.whoAmI(x.person.email, x.person.name).name,
      projectId: x.project.id, project: x.project, folder: x.folder || '', root: x.root || '', lang: x.lang === 'en' ? 'en' : 'he', token,
      exp: Date.now() + (kind === 'file' || kind === 'inbox' ? TTL : QUICK), handed: null, opened: false, result: null, closed: false, cancelled: false,
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
  /* The project's tree for a filing or a mapping session (h), asked of the agent once: the task already open for
     it, or a new one. null once h.tree is there; otherwise the page's answer ({ agent: 'none'|'slow'|'failed' } or
     { missing }), or 'gone' when the page gave up on the request (release frees h for its next one). */
  async function treeOf(h, pr, res, release, extra) {
    if (h.tree) return null;
    let t = h.treeTask && tasks.get(h.treeTask);
    if (!t || t.closed) {
      t = makeTask('tree', { who: h.who, person: h.person, base: h.base, project: h.project, folder: pr.folder, root: pr.root || '', lang: h.lang, extra });
      h.treeTask = t.id;
    }
    // the page may give up while the tree is awaited (closed, reloaded): its next request is not "busy"
    res.on('close', release);
    const how = await awaitTask(t);
    res.off('close', release);
    if (res.destroyed) return 'gone';
    if (how === 'none' || how === 'slow') return { agent: how };
    if (t.result && t.result.missing) return { missing: true };
    if (!h.tree) return { agent: 'failed' }; // cancelled or expired on the PC
    return null;
  }
  const taskState = t => ({ kind: t.kind, handed: t.handed, opened: t.opened, result: t.result, expired: !t.result && !t.cancelled && t.exp < Date.now(), cancelled: t.cancelled });
  function saveGuide(projectId, guide, p) {
    const d = load();
    Object.assign(projectOf(d, projectId), { guide, updatedBy: mcp.whoAmI(p.email, p.name).name, updatedAt: new Date().toISOString() });
    writeJsonAtomic(STORE, d);
  }
  const json = async req => { const raw = await readRequestBody(req); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  const projectRef = g => ({ id: g.project.id, code: g.project.code || '', name: g.project.name });

  /* ── the pane and the agent (outlook.js has checked the key and the method; p is the person, who the key's owner) ── */
  async function handlePane(req, res, url, p, who, base) {
    sweep();
    const route = url.pathname.slice('/api/outlook/'.length);
    const getProject = ref => mcp.runToolAs(p.email, p.name, base, 'get_project', { project: String(ref || '') }); // ToolError when not visible

    /* the agent on the PC: what is in its export inbox now (the full list), as a new batch for the Hub's quick
       window; it replaces this person's previous batch from the same PC unless that one is being published */
    if (route === 'inbox-batch' && req.method === 'GET') {
      // the agent asks, when it (re)starts and now and then while its inbox holds files, whether the server still has an
      // open batch of that PC (a restart of the server loses them, and a batch ends after a day): none → it announces again
      const pc = clip(url.searchParams.get('pc'), 60).trim();
      const b = latestBatch(who, pc);
      sendJson(res, 200, { id: b ? b.id : null });
      return;
    }
    if (route === 'inbox-batch') {
      const body = await json(req);
      const pc = clip(body.pc, 60).trim();
      const files = batchFiles(body.files);
      if (!files.length) { sendJson(res, 400, { error: 'files' }); return; }
      const b = addBatch(who, p, base, pc, files);
      sendJson(res, 200, { id: b.id, url: `${base}/project_hub_01?quick=inbox&id=${encodeURIComponent(b.id)}${pc ? '&pc=' + encodeURIComponent(pc) : ''}`, lang: langs.get(who) || 'he' });
      return;
    }

    /* the agent on the PC: this person's next task, handed out once; waits up to POLL for one */
    if (route === 'filing-next') {
      const pc = clip(url.searchParams.get('pc'), 60);
      // an agent of the first version sends no inbox: its PC still shows, without the folder
      const inbox = clip(url.searchParams.get('inbox'), 400).replace(/[\u0000-\u001f]/g, '');
      seenPc(who, pc, inbox);
      let t = nextFor(who, pc);
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
        seenPc(who, pc, inbox);
        t = nextFor(who, pc);
      }
      if (!t) { sendJson(res, 200, { task: null }); return; }
      t.handed = { at: new Date().toISOString(), pc };
      if (t.kind === 'inbox') t.exp = Math.max(t.exp, Date.now() + INBOX_TTL); // the PC is copying from now on
      const token = t.token;
      delete t.token; // from here on the server keeps only its hash
      sendJson(res, 200, { task: { id: t.id, kind: t.kind, token } });
      return;
    }
    if (route === 'filing-task') {
      const t = tasks.get(url.searchParams.get('id') || '');
      if (!t || t.who !== who) { sendJson(res, 404, { error: 'no_task' }); return; }
      sendJson(res, 200, taskState(t));
      return;
    }
    if (route === 'filing-project') {
      const g = getProject(url.searchParams.get('project'));
      const pr = known(g.project.id);
      sendJson(res, 200, { folder: pr.folder || '', root: pr.root || '', guide: pr.guide || '', defaultGuide: DEFAULT_GUIDE, contacts: contactsOf(p, g.project.id).length, map: ai.normalizeMap(pr.map), canWrite: writer(p) });
      return;
    }
    if (route === 'filing-pick' || route === 'filing-open' || route === 'filing-guide' || route === 'filing-guide-add' || route === 'filing') {
      const body = await json(req);
      if (route !== 'filing-open' && !writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
      const g = getProject(body.projectId);
      const project = projectRef(g);
      const pr = known(project.id);
      const x = { who, person: p, base, project, folder: pr.folder || '', root: pr.root || '', lang: body.lang };
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
        saveGuide(project.id, guide, p);
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

    /* filing without Claude: the choices of who sent the files (filing-options: the project's consultants and other
       folders, and the consultant the sender is), and the plan built in code from them (filing-plan, filing-plan.js) —
       in the pane's shape, one folder per file, as Claude's plan in the pane has. The tree is the filing's, read once. */
    if (route === 'filing-options' || route === 'filing-plan') {
      if (f.busy) { sendJson(res, 409, { error: 'busy' }); return; }
      const mine = {};
      f.busy = mine;
      const release = () => { if (f.busy === mine) f.busy = false; };
      try {
        const pr = known(f.projectId);
        if (!pr.folder) { sendJson(res, 200, { needsFolder: true }); return; }
        const no = await treeOf(f, pr, res, release, { filingId: f.id });
        if (no === 'gone') return;
        if (no) { sendJson(res, 200, no); return; }
        if (over() || f.taskId) { sendJson(res, 410, { error: 'expired' }); return; }
        if (route === 'filing-options') {
          const contacts = contactsOf(f.person, f.projectId);
          const o = ai.receiveOptions({ map: ai.normalizeMap(pr.map), tree: f.tree, contacts, code: f.project.code });
          sendJson(res, 200, { ...o, sender: plans.senderConsultant(o, contacts, f.mail.fromEmail) });
          return;
        }
        const fr = body.from && typeof body.from === 'object' && (body.from.kind === 'consultant' || body.from.kind === 'other') ? body.from : null;
        const from = fr ? { kind: fr.kind, folder: ai.relPath(fr.folder) || '', name: oneLine(fr.name, 120).trim() } : null;
        const doc = body.doc === 'plan' || body.doc === 'doc' ? body.doc : '';
        const out = plans.receivePlan({ tree: f.tree, code: f.project.code, from, doc, versionName: oneLine(body.versionName, 120), toVer: typeof body.toVer === 'boolean' ? body.toVer : undefined, files: f.files.map((x, n) => ({ n, name: x.name })) });
        const raw = { files: out.plan.files.map(x => ({ name: x.name, dest: x.dests.length ? x.dests[0].path : null })), steps: out.plan.steps, mode: doc === 'plan' ? 'new-version' : 'existing' };
        const { why, ...plan } = ai.sanitizePlan(raw, f.tree, f.files.map(x => x.name));
        f.plan = plan;
        sendJson(res, 200, { plan, ...(out.version ? { version: out.version } : {}), ...(out.problem ? { problem: out.problem } : {}) });
      } finally {
        release();
      }
      return;
    }

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
        const no = await treeOf(f, pr, res, release, { filingId: f.id });
        if (no === 'gone') return;
        if (no) { sendJson(res, 200, no); return; }
        if (!client) { sendJson(res, 200, { ai: 'unavailable' }); return; }
        const turn = { role: 'user', text };
        let out;
        try {
          out = await ai.propose(client, model, {
            project: f.project, map: ai.normalizeMap(pr.map), guide: String(pr.guide || '').trim() || DEFAULT_GUIDE, tree: f.tree, log: (pr.log || []).slice(-30).reverse(),
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
      const t = makeTask('file', { who, person: p, base, project: f.project, folder: pr.folder, root: pr.root || '', lang: f.lang, extra: { filingId: f.id, plan: f.plan } });
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
    // an inbox task the PC took and that expired while it copied: its result is still taken (and only that)
    const late = !!t && t.closed && t.kind === 'inbox' && !!t.handed && !t.result && !t.cancelled && what === 'result';
    if (!t || (t.closed && !late)) { sendJson(res, 410, { error: 'expired' }); return; }
    if (req.method !== METHOD[what]) { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    const f = t.filingId ? filings.get(t.filingId) : null;
    const b = t.inboxId ? batches.get(t.inboxId) : null;
    const freeBatch = () => { if (t.kind === 'inbox' && b && b.taskId === t.id) b.taskId = null; }; // the window may confirm again

    if (!what) {
      t.opened = true;
      // the folder picker is open on the PC from now on: the person's choice may take a while
      if (t.kind === 'pick' || t.kind === 'pick-source' || t.kind === 'pick-inbox') t.exp = Math.max(t.exp, Date.now() + PICK);
      if (t.kind === 'inbox') t.exp = Math.max(t.exp, Date.now() + INBOX_TTL);
      sendJson(res, 200, {
        kind: t.kind, lang: t.lang, project: t.project, folder: t.folder, root: t.root, share: t.projectId ? known(t.projectId).share || '' : '',
        ...(t.kind === 'open' && t.rel ? { rel: t.rel } : {}),
        // the files to take from the PC's own inbox (or from the folder it keeps under source), and where each goes;
        // move: only the export inbox's files leave it, a chosen folder's are copied
        ...(t.kind === 'inbox' ? { files: t.plan.files.filter(x => x.dests.length).map(x => ({ n: x.n, name: x.name })), plan: t.plan, source: t.source || '', move: !t.source } : {}),
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
      freeBatch();
      close(t);
      sendJson(res, 200, { ok: true });
      return;
    }

    // result: checked by kind, then its side effects. A helper that found the project's root on a network share says
    // where (rootShare): kept for the PCs that do not map it (a pick keeps it with the folder it saves)
    const rootShare = t.kind !== 'pick' && t.projectId && t.root ? shareFor(body.rootShare, t.root) : '';
    if (rootShare && known(t.projectId).root === t.root && known(t.projectId).share !== rootShare) {
      const d = load();
      projectOf(d, t.projectId).share = rootShare;
      writeJsonAtomic(STORE, d);
    }
    if (body.missing === true) {
      t.result = { missing: true };
      if (t.kind === 'file' && f && f.taskId === t.id) f.taskId = null;
      freeBatch();
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
        // the root's name; an agent of the first version sends none (its folder is in its single projects folder)
        const root = body.root == null || body.root === '' ? '' : folderName(body.root);
        if (root == null) { sendJson(res, 400, { error: 'root' }); return; }
        if (!writer(t.person)) { sendJson(res, 403, { error: 'viewer' }); return; }
        mcp.runToolAs(t.person.email, t.person.name, t.base, 'get_project', { project: t.projectId }); // still open to this person
        const d = load();
        Object.assign(projectOf(d, t.projectId), { folder, root, share: shareFor(body.rootShare, root) || (known(t.projectId).root === root ? known(t.projectId).share || '' : ''), updatedBy: t.by, updatedAt: new Date().toISOString() });
        writeJsonAtomic(STORE, d);
        t.result = { picked: folder, root };
      }
    } else if (t.kind === 'pick-source') {
      /* a folder the person chose on the PC to publish from: its files become a batch of that PC. source is the id the
         PC keeps the folder's path under (the server never sees the path); folder: its name, to show */
      if (body.cancelled === true) t.result = { cancelled: true };
      else {
        const source = typeof body.source === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(body.source) ? body.source : '';
        if (!source) { sendJson(res, 400, { error: 'source' }); return; }
        const folder = safeName(String(body.folder || '').split(/[\\/]/).filter(Boolean).pop() || '') || '';
        const files = batchFiles(body.files);
        const b = files.length ? addBatch(t.who, t.person, t.base, t.handed ? t.handed.pc : '', files, source, folder) : null;
        t.result = { id: b ? b.id : null, files: files.length, folder };
      }
    } else if (t.kind === 'pick-inbox') {
      // the PC's export inbox, chosen there and already in its helper's settings: its path, to show on the Hub page
      if (body.cancelled === true) t.result = { cancelled: true };
      else {
        const inbox = typeof body.inbox === 'string' ? clip(body.inbox, 400).replace(/[\u0000-\u001f]/g, '').trim() : '';
        if (!inbox) { sendJson(res, 400, { error: 'inbox' }); return; }
        seenPc(t.who, t.pc, inbox);
        t.result = { inbox };
      }
    } else if (t.kind === 'tree') {
      if (!Array.isArray(body.tree)) { sendJson(res, 400, { error: 'tree' }); return; }
      const tree = body.tree.slice(0, 3000).map(ai.relPath).filter(Boolean);
      if (f && !f.closed) f.tree = tree;
      const m = t.mapId ? maps.get(t.mapId) : null;
      if (m) m.tree = tree;
      if (b && b.h && b.h.treeTask === t.id) b.h.tree = tree;
      t.result = { folders: tree.length };
    } else if (t.kind === 'open') {
      t.result = { opened: true };
    } else if (t.kind === 'inbox') {
      /* what the agent published: per file, the name it saved in each of the plan's dests, in the plan's order (null or
         '' where it saved nothing); the plan's file is the k-th of that name, as in the plan. notInInbox: the files that
         were no longer in the inbox (nothing was done with them). Kept per file: the saved names aligned with the plan's
         dests (null: not saved), their paths, and whether it reached all of them (then it left the inbox). */
      const seen = new Map();
      const out = [], log = [], gone = new Set();
      for (const x of (Array.isArray(body.files) ? body.files : []).slice(0, INBOX_MAX)) {
        if (!x || typeof x !== 'object') continue;
        const name = safeName(x.name);
        const k = seen.get(name) || 0;
        seen.set(name, k + 1);
        const pf = t.plan.files.filter(y => y.name === name)[k];
        if (!pf || !pf.dests.length) continue;
        const dests = pf.dests.map((d, i) => {
          const v = Array.isArray(x.dests) ? x.dests[i] : null;
          const as = typeof v === 'string' ? safeName(v.split(/[\\/]/).pop()) : '';
          if (as) log.push({ file: as, dest: d.path });
          return as || null;
        });
        if (!dests.some(Boolean)) continue;
        const all = dests.every(Boolean);
        if (all) gone.add(pf.n);
        out.push({ n: pf.n, name, dests, paths: pf.dests.map(d => d.path), all });
      }
      const notInInbox = [];
      for (const v of (Array.isArray(body.notInInbox) ? body.notInInbox : []).slice(0, INBOX_MAX)) {
        const pf = t.plan.files.find(y => y.name === safeName(v));
        if (pf && !notInInbox.includes(pf.name)) { notInInbox.push(pf.name); gone.add(pf.n); }
      }
      const error = body.error ? clip(body.error, 500) : null;
      if (log.length) {
        const at = new Date().toISOString();
        const d = load();
        const pr = projectOf(d, t.projectId);
        // received files: who sent them (as chosen in the window, or as Claude guessed)
        const rcv = t.plan.mode === 'receive';
        pr.log = [...(pr.log || []), ...log.map(l => ({ at, by: t.by, from: rcv ? oneLine(t.plan.from, 120) : '', subject: '', file: l.file, dest: l.dest, mode: rcv ? 'receive' : 'publish' }))].slice(-LOG_MAX);
        writeJsonAtomic(STORE, d);
      }
      t.result = { files: out, notInInbox, error };
      if (b) {
        if (b.taskId === t.id) b.taskId = null;
        // the files that left the inbox leave the batch; what is left stays open (the window may publish it too)
        if (gone.size) {
          b.files = b.files.filter(x => !gone.has(x.n));
          if (!b.files.length && b.status === 'new') b.status = 'published';
        }
        // files left, the PC stopped part way, or it moved a folder (perhaps before a copy failed): the plan is not
        // the project's state any more, nor the tree read before it; both are made again for the next proposal
        if (gone.size || error || t.plan.steps.some(s => s.op === 'move')) {
          b.plan = null;
          if (b.h) b.h.tree = null;
        }
      }
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

  /* ── the Hub page (signed in): the project's folder, its map and its guide, on the project's settings page ──
     The person is the signed-in user; the tasks go to the agent running with the same person's key (who, as the
     key names its owner: the address in lower case, 'local' on the local server). base: the site, for the tools. */
  const HUB_METHOD = {
    project: 'GET', task: 'GET', 'office-types': 'GET', pick: 'POST', open: 'POST', 'map-session': 'POST', 'map-propose': 'POST', 'map-auto': 'POST', map: 'PUT', guide: 'PUT',
    inbox: 'GET', 'inbox-options': 'GET', 'inbox-latest': 'GET', 'inbox-open': 'GET', 'pick-source': 'POST', pcs: 'GET', 'pick-inbox': 'POST', 'inbox-propose': 'POST', 'inbox-plan': 'POST', 'inbox-confirm': 'POST', 'inbox-dismiss': 'POST'
  };
  const israelToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  async function handleHub(req, res, url, user, base) {
    sweep();
    const route = url.pathname.slice('/api/filing-hub/'.length);
    if (!HUB_METHOD[route]) { sendJson(res, 404, { error: 'Not found' }); return; }
    // office-types: GET reads the list, PUT keeps it
    const allowed = route === 'office-types' && req.method === 'PUT' ? 'PUT' : HUB_METHOD[route];
    if (req.method !== allowed) { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    const p = { email: user.email || null, name: user.name };
    const who = personOf(user.email);
    const getProject = ref => mcp.runToolAs(p.email, p.name, base, 'get_project', { project: String(ref || '') }); // ToolError when not visible

    if (route === 'project') {
      const g = getProject(url.searchParams.get('project'));
      const pr = known(g.project.id);
      const map = ai.normalizeMap(pr.map);
      sendJson(res, 200, { folder: pr.folder || '', root: pr.root || '', code: g.project.code || '', map, types: typesOf(map), officeTypes: officeTypes(), guide: pr.guide || '', defaultGuide: DEFAULT_GUIDE, canWrite: writer(p) });
      return;
    }
    if (route === 'task') {
      const t = tasks.get(url.searchParams.get('id') || '');
      if (!t || t.who !== who) { sendJson(res, 404, { error: 'no_task' }); return; }
      sendJson(res, 200, taskState(t));
      return;
    }
    if (route === 'office-types') {
      if (req.method === 'GET') { sendJson(res, 200, { types: officeTypes(), canWrite: writer(p) }); return; }
      if (!writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
      const types = layout.cleanTypes((await json(req)).types);
      if (!types) { sendJson(res, 400, { error: 'types' }); return; }
      const d = load();
      d.office = { ...(d.office || {}), types };
      writeJsonAtomic(STORE, d);
      sendJson(res, 200, { types });
      return;
    }

    /* ── the export inbox's quick window: one batch of the person's own agent ── */
    // the window whose batch is gone (replaced by a newer one, or lost in a restart of the server and announced again by
    // the agent): the person's newest open batch of that PC (of any PC when the address names none)
    if (route === 'inbox-latest') {
      const b = latestBatch(who, clip(url.searchParams.get('pc'), 60).trim());
      sendJson(res, 200, { id: b ? b.id : null });
      return;
    }
    // the Hub's top bar ("תיבת הייצוא (N)"): the person's open batches, of every PC, the newest first
    if (route === 'inbox-open') {
      const open = [...batches.values()].filter(b => b.who === who && b.status === 'new' && !b.source).sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
      sendJson(res, 200, open.map(b => ({ id: b.id, pc: b.pc, files: b.files.length, at: b.at })));
      return;
    }
    // a folder of the person's PC to publish from instead of the export inbox: the PC's helper opens a folder picker
    // (any PC of the person: the one the person sits at runs the helper) and announces the folder's files as a batch
    if (route === 'pick-source') {
      const body = await json(req);
      noteLang(who, body.lang);
      if (!writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
      const t = makeTask('pick-source', { who, person: p, base, project: { id: '', code: '', name: '' }, lang: body.lang });
      sendJson(res, 200, { taskId: t.id });
      return;
    }
    // Settings → תיוק מהיר: the person's PCs whose helper asked for a task lately, each with its export inbox
    if (route === 'pcs') {
      const list = [...pcs.entries()].filter(([k]) => k.startsWith(who + '|')).map(([, o]) => ({ pc: o.pc, inbox: o.inbox, at: iso(o.at), active: Date.now() - o.at < ACTIVE }));
      list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      sendJson(res, 200, list);
      return;
    }
    // … and another export inbox for one of them: that PC's helper (only that PC's) opens a folder picker
    if (route === 'pick-inbox') {
      const body = await json(req);
      noteLang(who, body.lang);
      const o = pcs.get(who + '|' + clip(body.pc, 60).toLowerCase());
      if (!o || Date.now() - o.at >= ACTIVE) { sendJson(res, 409, { error: 'pc_off' }); return; }
      const t = makeTask('pick-inbox', { who, person: p, base, project: { id: '', code: '', name: '' }, lang: body.lang, extra: { pc: o.pc } });
      sendJson(res, 200, { taskId: t.id });
      return;
    }
    if (route.startsWith('inbox')) {
      const get = HUB_METHOD[route] === 'GET';
      const body = get ? {} : await json(req);
      noteLang(who, get ? url.searchParams.get('lang') : body.lang);
      const b = batches.get(String((get ? url.searchParams.get('id') : body.id) || url.searchParams.get('id') || ''));
      if (!b || b.who !== who) { sendJson(res, 404, { error: 'no_batch' }); return; }
      // the project's tree, asked once per project chosen in the window, of the PC that announced the batch; another
      // project's: the plan (for the one before) goes with it
      const holdFor = (project, lang) => {
        if (!b.h || b.h.projectId !== project.id) { b.h = { who, person: p, base, projectId: project.id, project, lang, tree: null, treeTask: null }; b.plan = null; }
        return b.h;
      };
      if (route === 'inbox') {
        const projects = mcp.runToolAs(p.email, p.name, base, 'list_projects', {}).projects.map(x => ({ id: x.id, code: x.code || '', name: x.name }));
        // source: files of a folder the person chose (copied), not of the export inbox (moved out of it)
        sendJson(res, 200, { id: b.id, pc: b.pc, status: b.status, files: b.files, source: !!b.source, folder: b.folder || '', move: !b.source, guess: inboxGuess(b.files, projects), projects });
        return;
      }
      if (b.status !== 'new') { sendJson(res, 409, { error: b.status }); return; }
      /* received files: who may have sent them, for the chosen project — its consultants (the folders under the
         consultants area, with the register contacts), the folders under receive and permit, and the whole tree */
      if (route === 'inbox-options') {
        if (!writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
        const project = projectRef(getProject(url.searchParams.get('projectId')));
        const pr = known(project.id);
        if (!pr.folder) { sendJson(res, 200, { needsFolder: true }); return; }
        const h = holdFor(project, url.searchParams.get('lang') === 'en' ? 'en' : 'he');
        const no = await treeOf(h, pr, res, () => {}, { inboxId: b.id, pc: b.pc });
        if (no === 'gone') return;
        if (no) { sendJson(res, 200, no); return; }
        sendJson(res, 200, ai.receiveOptions({ map: ai.normalizeMap(pr.map), tree: h.tree, contacts: contactsOf(p, project.id), code: project.code }));
        return;
      }
      if (b.taskId) { sendJson(res, 409, { error: 'confirmed' }); return; }
      if (route === 'inbox-dismiss') {
        b.status = 'dismissed';
        sendJson(res, 200, { ok: true });
        return;
      }
      if (!writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
      if (b.busy) { sendJson(res, 409, { error: 'busy' }); return; }

      if (route === 'inbox-confirm') {
        const h = b.h;
        if (!b.plan || !h || b.plan.projectId !== h.projectId || !b.plan.files.some(x => x.dests.length)) { sendJson(res, 409, { error: 'no_plan' }); return; }
        getProject(h.projectId); // still open to this person
        const pr = known(h.projectId);
        if (!pr.folder) { sendJson(res, 409, { error: 'no_folder' }); return; }
        // to the agent on the PC whose inbox has the files; any agent of the person when the batch named no PC
        const t = makeTask('inbox', { who, person: p, base, project: h.project, folder: pr.folder, root: pr.root || '', lang: h.lang, extra: { inboxId: b.id, plan: b.plan, pc: b.pc, source: b.source || '' } });
        b.taskId = t.id;
        sendJson(res, 200, { taskId: t.id });
        return;
      }

      // inbox-propose (Claude) and inbox-plan (code, filing-plan.js): the selected files, the chosen targets (publish) or
      // who sent them (receive); Claude also gets the person's instruction, the code the day of SENT, a typed version
      // name and the @ver choice
      const receive = body.mode === 'receive';
      const fr = receive && body.from && typeof body.from === 'object' && (body.from.kind === 'consultant' || body.from.kind === 'other') ? body.from : null;
      const from = fr ? { kind: fr.kind, folder: ai.relPath(fr.folder) || '', name: oneLine(fr.name, 120).trim() } : null;
      const doc = from && from.kind === 'consultant' && (body.doc === 'plan' || body.doc === 'doc') ? body.doc : '';
      const ns = Array.isArray(body.files) ? [...new Set(body.files)] : [];
      // a file's n stays what it was announced as; a published one is no longer in the batch
      const fileOf = n => b.files.find(x => x.n === n);
      if (!ns.length || !ns.every(n => Number.isInteger(n) && fileOf(n))) { sendJson(res, 400, { error: 'files' }); return; }
      const project = projectRef(getProject(body.projectId));
      const lang = body.lang === 'en' ? 'en' : 'he';
      const mine = {};
      b.busy = mine;
      const release = () => { if (b.busy === mine) b.busy = false; };
      b.plan = null; // a plan is for one selection: the previous one goes
      const h = holdFor(project, lang);
      h.lang = lang;
      try {
        const pr = known(project.id);
        if (!pr.folder) { sendJson(res, 200, { needsFolder: true }); return; }
        const no = await treeOf(h, pr, res, release, { inboxId: b.id, pc: b.pc });
        if (no === 'gone') return;
        if (no) { sendJson(res, 200, no); return; }
        const files = ns.sort((x, y) => x - y).map(n => ({ n, name: fileOf(n).name }));
        // a folder the page named that is not in the tree is not one
        const inTree = from && from.folder && h.tree.find(q => q.toLowerCase() === from.folder.toLowerCase());
        if (from) from.folder = inTree || '';
        if (route === 'inbox-plan') {
          let out;
          if (receive) {
            out =plans.receivePlan({ tree: h.tree, code: project.code, from, doc, versionName: oneLine(body.versionName, 120), toVer: typeof body.toVer === 'boolean' ? body.toVer : undefined, files });
            out.plan.from = (from && from.name) || '';
          } else {
            const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) && !Number.isNaN(Date.parse(body.date)) && new Date(body.date + 'T00:00:00Z').toISOString().slice(0, 10) === body.date ? body.date : israelToday();
            const map = ai.normalizeMap(pr.map);
            const types = typesOf(map);
            const { layout: lay, from: layoutFrom } = plans.layoutFor(map, h.tree, types);
            const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
            const typeOf = {}, dests = {};
            for (const [k, v] of Object.entries(obj(body.typeOf))) if (/^[0-9]{1,3}$/.test(k) && typeof v === 'string') typeOf[k] = v;
            for (const [k, v] of Object.entries(obj(body.dests))) { const q = ai.relPath(v); if (/^[0-9]{1,3}$/.test(k) && q) dests[k] = q; }
            out = plans.publishPlan({ layout: lay, types, tree: h.tree, code: project.code, files, sent: body.sent === true, updated: body.updated === true, date, desc: layout.cleanDesc(body.desc), typeOf, dests });
            const under = b => (b ? h.tree.filter(q => q.toLowerCase() === b.toLowerCase() || q.toLowerCase().startsWith(b.toLowerCase() + '/')) : []);
            // the SENT folders (up to 800 paths) only when the window asks for them: the first time the person changes a file's folder
            Object.assign(out, { layoutFrom, types: types.map(x => x.name), ...(body.folders === true ? { folders: under(lay.sent.base).slice(0, 800) } : {}) });
          }
          if (b.status !== 'new' || b.taskId || b.h !== h) { sendJson(res, 409, { error: 'changed' }); return; }
          out.plan.projectId = project.id;
          b.plan = out.plan;
          sendJson(res, 200, { plan: out.plan, ...(out.version ? { version: out.version } : {}), ...(out.slotsMissing ? { slotsMissing: out.slotsMissing } : {}), ...(out.problem ? { problem: out.problem } : {}), ...(out.layoutFrom ? { layoutFrom: out.layoutFrom, days: out.days, types: out.types, ...(out.folders ? { folders: out.folders } : {}) } : {}) });
          return;
        }
        if (!client) { sendJson(res, 200, { ai: 'unavailable' }); return; }
        let out;
        const guide = String(pr.guide || '').trim() || DEFAULT_GUIDE;
        try {
          if (receive) {
            out = await ai.receiveProposal(client, model, {
              project, map: ai.normalizeMap(pr.map), guide, tree: h.tree, contacts: contactsOf(p, project.id), files, from, doc, text: clip(body.text, 1000).trim(), lang
            });
            // who sent them, for the project's history: as the person chose it, else as Claude guessed
            out.plan.from = (from && from.name) || (out.guess && out.guess.name) || '';
          } else {
            const map = ai.normalizeMap(pr.map);
            out = await ai.inboxProposal(client, model, {
              project, map, types: typesOf(map), guide, tree: h.tree, today: israelToday(), files,
              sent: body.sent === true, updated: body.updated === true, text: clip(body.text, 1000).trim(), lang
            });
          }
        } catch (e) {
          console.error('filing inbox propose failed:', e.message);
          sendJson(res, 200, { ai: 'failed' });
          return;
        }
        // the window chose another project while Claude answered (inbox-options): this plan is not for it
        if (b.status !== 'new' || b.taskId || b.h !== h) { sendJson(res, 409, { error: 'changed' }); return; }
        out.plan.projectId = project.id;
        b.plan = out.plan;
        // a replace Claude asked for and the plan dropped ('no_map': no publish area mapped; 'outside': not inside it):
        // the window says so, since Claude's words may still speak of replacing
        sendJson(res, 200, { message: out.message, plan: out.plan, ...(out.replaceStripped ? { replaceStripped: out.replaceStripped } : {}), ...(out.guess ? { guess: out.guess } : {}) });
      } finally {
        release();
      }
      return;
    }
    const body = await json(req);
    noteLang(who, body.lang);

    if (route === 'map-propose') {
      const m = maps.get(url.searchParams.get('id') || '');
      if (!m || m.who !== who) { sendJson(res, 404, { error: 'no_session' }); return; }
      if (m.busy) { sendJson(res, 409, { error: 'busy' }); return; }
      const text = clip(body.text, 1000).trim();
      const mine = {};
      m.busy = mine;
      const release = () => { if (m.busy === mine) m.busy = false; };
      m.exp = Date.now() + TTL; // the session lives while the person talks
      try {
        const pr = known(m.projectId);
        if (!pr.folder) { sendJson(res, 200, { needsFolder: true }); return; }
        const no = await treeOf(m, pr, res, release, { mapId: m.id });
        if (no === 'gone') return;
        if (no) { sendJson(res, 200, no); return; }
        // the table as the person has it now (corrected by hand, unsaved) is the map so far: only folders of the tree
        if (body.areas && typeof body.areas === 'object' && !Array.isArray(body.areas)) {
          const known = new Map(m.tree.map(t => [t.toLowerCase(), t]));
          m.areas = ai.cleanAreas(body.areas, q => (q && known.get(q.toLowerCase())) || null);
        }
        if (!client) { sendJson(res, 200, { ai: 'unavailable' }); return; }
        const turn = { role: 'user', text };
        let out;
        try {
          out = await ai.mapProposal(client, model, {
            project: m.project, guide: String(pr.guide || '').trim() || DEFAULT_GUIDE, tree: m.tree,
            map: m.areas ? { areas: m.areas } : ai.normalizeMap(pr.map), turns: [...m.turns, turn], lang: m.lang
          });
        } catch (e) {
          console.error('filing map failed:', e.message);
          sendJson(res, 200, { ai: 'failed' });
          return;
        }
        m.turns.push(turn, { role: 'assistant', text: out.message, questions: out.questions });
        m.areas = out.areas;
        // the tree too: the page offers it for correcting an area by hand
        sendJson(res, 200, { ...out, tree: m.tree });
      } finally {
        release();
      }
      return;
    }

    // the office's convention found in the session's tree (filing-plan.autoSlots), for the map: no Claude, nothing saved
    if (route === 'map-auto') {
      const m = maps.get(url.searchParams.get('id') || '');
      if (!m || m.who !== who) { sendJson(res, 404, { error: 'no_session' }); return; }
      if (m.busy) { sendJson(res, 409, { error: 'busy' }); return; }
      const mine = {};
      m.busy = mine;
      const release = () => { if (m.busy === mine) m.busy = false; };
      m.exp = Date.now() + TTL;
      try {
        const pr = known(m.projectId);
        if (!pr.folder) { sendJson(res, 200, { needsFolder: true }); return; }
        const no = await treeOf(m, pr, res, release, { mapId: m.id });
        if (no === 'gone') return;
        if (no) { sendJson(res, 200, no); return; }
        const a = plans.autoSlots(m.tree);
        // the layout from the folders the map already holds, the convention's finds filling the rest
        const stored = ai.normalizeMap(pr.map);
        const lay = plans.layoutFor({ slots: plans.withAuto(ai.cleanSlots(stored && stored.slots), a.slots) }, m.tree, typesOf(stored)).layout;
        sendJson(res, 200, { auto: { ...a, publish: lay }, tree: m.tree });
      } finally {
        release();
      }
      return;
    }

    if (route !== 'open' && !writer(p)) { sendJson(res, 403, { error: 'viewer' }); return; }
    const g = getProject(body.projectId);
    const project = projectRef(g);
    const pr = known(project.id);
    const x = { who, person: p, base, project, folder: pr.folder || '', root: pr.root || '', lang: body.lang };
    if (route === 'pick') { sendJson(res, 200, { taskId: makeTask('pick', x).id }); return; }
    if (route === 'open') {
      const rel = ai.relPath(body.rel);
      if (rel == null) { sendJson(res, 400, { error: 'rel' }); return; }
      if (!pr.folder) { sendJson(res, 409, { error: 'no_folder' }); return; }
      sendJson(res, 200, { taskId: makeTask('open', { ...x, extra: { rel } }).id });
      return;
    }
    if (route === 'guide') {
      const guide = clip(body.guide, GUIDE_MAX);
      saveGuide(project.id, guide, p);
      sendJson(res, 200, { guide });
      return;
    }
    if (route === 'map-session') {
      const m = {
        id: newId(), who, person: p, base, projectId: project.id, project, lang: body.lang === 'en' ? 'en' : 'he',
        tree: null, treeTask: null, turns: [], areas: null, busy: false, exp: Date.now() + TTL
      };
      maps.set(m.id, m);
      sendJson(res, 200, { id: m.id });
      return;
    }
    // map: the person's own (from Claude's proposal, corrected by hand): paths inside the project, no tree check
    if (!body.areas || typeof body.areas !== 'object' || Array.isArray(body.areas)) { sendJson(res, 400, { error: 'areas' }); return; }
    const areas = ai.cleanAreas(body.areas, rel => rel || false);
    if (!areas) { sendJson(res, 400, { error: 'path' }); return; }
    const d = load();
    const pd = projectOf(d, project.id);
    // the slots for filing without Claude: as sent, or kept when a page that does not know them saves the areas
    const slots = ai.cleanSlots(body.slots !== undefined ? body.slots : (pd.map || {}).slots);
    // the publish layout: as sent (checked), or kept when a page that does not know it saves the areas
    const pub = body.publish !== undefined ? layout.cleanPublish(body.publish, ai.relPath) : { publish: (ai.normalizeMap(pd.map) || {}).publish || null };
    if (pub.error) { sendJson(res, 400, { error: 'layout', target: pub.target, level: pub.level }); return; }
    const map = { areas, slots, publish: pub.publish, updatedBy: mcp.whoAmI(p.email, p.name).name, updatedAt: new Date().toISOString() };
    pd.map = map;
    writeJsonAtomic(STORE, d);
    sendJson(res, 200, { map });
  }

  return { handlePane, handleToken, handleContacts, handleHub, DEFAULT_GUIDE };
};
module.exports.folderName = folderName;
module.exports.inboxGuess = inboxGuess;
