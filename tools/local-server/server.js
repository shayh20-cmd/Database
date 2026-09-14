'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const serveHandler = require('serve-handler');

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
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');

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

async function handleUpload(req, res, appName) {
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
  const type = (req.headers['content-type'] || '').split(';')[0].trim();
  const ext = IMAGE_EXT[type];
  if (!ext) { sendJson(res, 415, { error: 'Unsupported image type: ' + type }); return; }
  try {
    const buf = await readRequestBuffer(req);
    if (!buf.length) { sendJson(res, 400, { error: 'Empty body' }); return; }
    const dir = path.join(ATTACH_DIR, appName);
    fs.mkdirSync(dir, { recursive: true });
    const name = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    // served by the static handler, since DATA_DIR sits under STATIC_ROOT
    sendJson(res, 200, { ok: true, url: '/data/attachments/' + appName + '/' + name, bytes: buf.length });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message });
  }
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    handleProjectList(res);
    return;
  }
  const upMatch = url.pathname.match(UPLOAD_ROUTE);
  if (upMatch) {
    handleUpload(req, res, upMatch[1]).catch(e => sendJson(res, 500, { error: e.message }));
    return;
  }
  const apiMatch = url.pathname.match(API_ROUTE);
  if (apiMatch) {
    handleApi(req, res, apiMatch[1]).catch(e => sendJson(res, 500, { error: e.message }));
    return;
  }
  // Local dev server: tell browsers to always revalidate so edited HTML/JS/CSS never
  // get served stale from the heuristic cache (serve-handler sends no cache headers).
  serveHandler(req, res, {
    public: STATIC_ROOT,
    headers: [{ source: '**', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }]
  });
});

server.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT} (serving ${STATIC_ROOT})`);
});
