'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

/* Nothing here may exit or crash the process. On the free tier a process that exits is
   restarted until a restart quota disables the whole site — deployment endpoint and
   logs included — so a startup problem must stay visible on /health instead. */
let serveHandler = null;
let bootError = null;
try { serveHandler = require('serve-handler'); } catch (e) { bootError = e; }
process.on('uncaughtException', e => { console.error('uncaught exception (kept running):', e); });
process.on('unhandledRejection', e => { console.error('unhandled rejection (kept running):', e); });

function parseArgs(argv) {
  let port = null;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') {
      port = argv[++i];
    } else {
      rest.push(argv[i]);
    }
  }
  return { root: rest[0] || null, port };
}

const { root, port: portArg } = parseArgs(process.argv.slice(2));
const STATIC_ROOT = root || path.resolve(__dirname, '..', '..');
const PORT = Number(portArg || process.env.PORT || 3000);

/* One server, two modes. `local` is today's dev server: every file under the root is
   served, the JSON documents live in data/, and the user is whoever sits at the machine.
   `cloud` is the same server on Azure App Service behind Easy Auth: only the pages are
   served, the documents live outside the deployed folder (DATA_DIR, so a redeploy does
   not wipe them), and the user is whoever Easy Auth signed in. */
const SITE_MODE = process.env.SITE_MODE === 'cloud' ? 'cloud' : 'local';
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '..', '..', 'data');
const LOCAL_USER_NAME = process.env.LOCAL_USER_NAME || 'שי הרשקוביץ';

/* App Service strips incoming X-MS-* headers only while authentication is on. Without
   that assurance any caller could claim to be anyone, so cloud mode serves nothing but
   /health — which says why — until it is confirmed. */
const AUTH_CONFIRMED = SITE_MODE !== 'cloud' || process.env.WEBSITE_AUTH_ENABLED === 'true';
if (!AUTH_CONFIRMED) console.error('SITE_MODE=cloud but WEBSITE_AUTH_ENABLED is not "true": serving /health only.');
if (bootError) console.error('startup failed, serving /health only:', bootError);

const APPS = {
  'project-hub': path.join(DATA_DIR, 'project_hub.json'),
  'project-hub-01': path.join(DATA_DIR, 'project_hub_01.json'),
  'planning-dashboard': path.join(DATA_DIR, 'planning_dashboard.json'),
  'spec-library': path.join(DATA_DIR, 'spec_library.json'),
  'spec-projects': path.join(DATA_DIR, 'spec_projects.json')
};

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data));
  fs.renameSync(tmpPath, filePath);
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json)
  });
  res.end(json);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

const MAX_BYTES = 20 * 1024 * 1024;

function readRequestBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readRequestBody(req) {
  return (await readRequestBuffer(req)).toString('utf8');
}

// Images pasted into a task description are stored as files, not inlined as base64
// data URLs — the whole document is rewritten on every save, so one screenshot
// inlined would dwarf the project data.
const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
const IMAGE_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/svg+xml': 'svg'
};
// A saved Outlook message. Outlook hands a dragged .msg over as octet-stream, so the
// extension comes from ?name= rather than from the content type.
const FILE_EXT = new Set(['msg', 'eml', 'pdf']);
const ATTACH_MIME = {
  png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', msg: 'application/vnd.ms-outlook', eml: 'message/rfc822'
};

function extFor(req, url) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim();
  if (IMAGE_EXT[type]) return IMAGE_EXT[type];
  const given = (url.searchParams.get('name') || '').toLowerCase();
  const ext = given.includes('.') ? given.split('.').pop().replace(/[^a-z0-9]/g, '') : '';
  return FILE_EXT.has(ext) ? ext : null;
}

async function handleUpload(req, res, appName, url) {
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  const ext = extFor(req, url);
  if (!ext) { sendJson(res, 415, { error: 'Unsupported file type' }); return; }
  try {
    const buf = await readRequestBuffer(req);
    if (!buf.length) { sendJson(res, 400, { error: 'Empty body' }); return; }
    const dir = path.join(ATTACH_DIR, appName);
    fs.mkdirSync(dir, { recursive: true });
    const name = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    sendJson(res, 200, { ok: true, url: '/data/attachments/' + appName + '/' + name, bytes: buf.length });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message });
  }
}

/* Attachments are served here rather than by the static handler, because in cloud mode
   DATA_DIR sits outside the deployed folder. The route only accepts the names the
   upload above generates, so nothing else under DATA_DIR is reachable. */
const ATTACH_ROUTE = /^\/data\/attachments\/([a-z0-9-]+)\/([a-z0-9-]+\.([a-z0-9]+))$/;

function handleAttachment(res, appName, fileName, ext) {
  const filePath = path.join(ATTACH_DIR, appName, fileName);
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { sendJson(res, 404, { error: 'Not found' }); return; }
    const headers = {
      'Content-Type': ATTACH_MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    };
    // An uploaded SVG must not run script on this origin.
    if (ext === 'svg') headers['Content-Security-Policy'] = 'sandbox';
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

async function handleApi(req, res, appName) {
  const filePath = APPS[appName];
  if (req.method === 'GET') {
    sendJson(res, 200, readJson(filePath));
    return;
  }
  if (req.method === 'POST') {
    try {
      const raw = await readRequestBody(req);
      const data = raw ? JSON.parse(raw) : {};
      writeJsonAtomic(filePath, data);
      sendJson(res, 200, { ok: true });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
    return;
  }
  sendJson(res, 405, { error: 'Method not allowed' });
}

const API_ROUTE = new RegExp('^/api/(' + Object.keys(APPS).join('|') + ')$');
const UPLOAD_ROUTE = new RegExp('^/api/upload/(' + Object.keys(APPS).join('|') + ')$');

// Apps that hold a project the capture window may write into. Listed rather than
// hardcoded in capture.html so a new project appears without editing that page.
const PROJECT_APPS = ['project-hub-01', 'project-hub'];

function handleProjectList(res) {
  const list = PROJECT_APPS
    .map(id => {
      const d = readJson(APPS[id]);
      if (!d || !d.projectName) return null;
      return { id, name: d.projectName };
    })
    .filter(Boolean);
  sendJson(res, 200, list);
}

/* A web page cannot start the Windows region snip, so the button asks the server to.
   The launched string is a fixed protocol with nothing from the request in it. */
function handleSnip(req, res) {
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  if (process.platform !== 'win32') { sendJson(res, 501, { ok: false, error: 'Windows only' }); return; }
  try {
    require('child_process').spawn('cmd', ['/c', 'start', '', 'ms-screenclip:'], { detached: true, stdio: 'ignore' }).unref();
    sendJson(res, 200, { ok: true });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message });
  }
}

/* Who is asking. Locally it is the person at the machine. In the cloud, Easy Auth puts
   the signed-in user's claims in X-MS-CLIENT-PRINCIPAL (base64 JSON); no header means
   no session. */
function principalFrom(req) {
  if (SITE_MODE !== 'cloud') return { name: LOCAL_USER_NAME, email: null };
  const raw = req.headers['x-ms-client-principal'];
  if (!raw) return null;
  try {
    const p = JSON.parse(Buffer.from(String(raw), 'base64').toString('utf8'));
    const claim = typ => { const c = (p.claims || []).find(x => x.typ === typ); return c ? c.val : null; };
    const login = req.headers['x-ms-client-principal-name'] || null;
    const email = claim('preferred_username') || claim('email') || login;
    const name = claim('name') || login || email;
    return name ? { name, email } : null;
  } catch (e) {
    return null;
  }
}

// In cloud mode only the pages are served: never the server source, package files or data/.
// serve-handler answers /page.html with a redirect to /page (cleanUrls), so both forms pass.
const CLOUD_PAGE = /^\/[A-Za-z0-9_-]+(\.html)?$/;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const healthy = AUTH_CONFIRMED && !bootError;
  if (url.pathname === '/health') {
    sendJson(res, healthy ? 200 : 503, {
      ok: healthy, mode: SITE_MODE, node: process.version,
      authEnabled: process.env.WEBSITE_AUTH_ENABLED === 'true',
      error: bootError ? bootError.message : (AUTH_CONFIRMED ? null : 'authentication not confirmed')
    });
    return;
  }
  if (!healthy) { sendJson(res, 503, { error: 'Not serving; see /health' }); return; }

  const user = principalFrom(req);
  if (!user) {
    if (url.pathname.startsWith('/api/')) { sendJson(res, 401, { error: 'Sign in required' }); return; }
    redirect(res, '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(url.pathname + url.search));
    return;
  }

  if (url.pathname === '/api/me') { sendJson(res, 200, { name: user.name, email: user.email, mode: SITE_MODE }); return; }
  if (url.pathname === '/api/snip' && SITE_MODE === 'local') { handleSnip(req, res); return; }
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    handleProjectList(res);
    return;
  }
  const upMatch = url.pathname.match(UPLOAD_ROUTE);
  if (upMatch) {
    handleUpload(req, res, upMatch[1], url).catch(e => sendJson(res, 500, { error: e.message }));
    return;
  }
  const apiMatch = url.pathname.match(API_ROUTE);
  if (apiMatch) {
    handleApi(req, res, apiMatch[1]).catch(e => sendJson(res, 500, { error: e.message }));
    return;
  }
  const attMatch = url.pathname.match(ATTACH_ROUTE);
  if (attMatch) { handleAttachment(res, attMatch[1], attMatch[2], attMatch[3]); return; }

  if (SITE_MODE === 'cloud') {
    if (url.pathname === '/') { redirect(res, '/project_hub_01'); return; }
    if (!CLOUD_PAGE.test(url.pathname)) { sendJson(res, 404, { error: 'Not found' }); return; }
  }
  // Local dev server: tell browsers to always revalidate so edited HTML/JS/CSS never
  // get served stale from the heuristic cache (serve-handler sends no cache headers).
  serveHandler(req, res, {
    public: STATIC_ROOT,
    directoryListing: SITE_MODE === 'local',
    headers: [{ source: '**', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }]
  });
});

server.listen(PORT, () => {
  console.log('Local server running at http://localhost:' + PORT + ' (serving ' + STATIC_ROOT + ', ' + SITE_MODE + ' mode, data in ' + DATA_DIR + ')');
});
