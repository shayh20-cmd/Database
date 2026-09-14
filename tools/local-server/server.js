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

function readRequestBody(req) {
  const MAX_BYTES = 20 * 1024 * 1024;
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
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
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
