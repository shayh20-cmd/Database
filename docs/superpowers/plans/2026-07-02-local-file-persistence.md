# Local File Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `localStorage`-only persistence in `project_hub.html` and `planning_dashboard.html` with a small local Node server that reads/writes JSON files on disk, so data survives port changes (`autoPort`), browser storage clears, and machine/browser switches.

**Architecture:** One zero-framework Node server (`tools/local-server/server.js`, using `serve-handler` for static files) exposes `/api/project-hub` and `/api/planning-dashboard` (GET = read, POST = atomic write) on the same port the app is served from. Both HTML files switch their `loadData`/`save` functions from synchronous `localStorage` calls to async `fetch` calls against those endpoints, with a one-time migration that seeds the new JSON file from any existing `localStorage` data, and a File System Access API fallback (native "Open" file picker) if the server is unreachable.

**Tech Stack:** Node.js (built-in `http`/`fs`), `serve-handler` npm package, no other new dependencies. No changes to React/build tooling — both HTML files stay build-free (`React.createElement`, no JSX/Babel).

**Spec:** [2026-07-02-local-file-persistence-design.md](../specs/2026-07-02-local-file-persistence-design.md)

---

## Task 1: Build the local server

**Files:**
- Create: `tools/local-server/server.js`
- Create: `tools/local-server/package.json`

- [ ] **Step 1: Create the server directory and package.json**

```bash
mkdir -p "C:/Users/Omega/Database/tools/local-server"
```

Write `tools/local-server/package.json`:

```json
{
  "name": "local-server",
  "private": true,
  "version": "1.0.0",
  "description": "Static file server + local JSON persistence API for project_hub.html and planning_dashboard.html"
}
```

- [ ] **Step 2: Install serve-handler**

```bash
cd "C:/Users/Omega/Database/tools/local-server" && npm install serve-handler
```

Expected: creates `node_modules/` and `package-lock.json`, and adds a `"dependencies": { "serve-handler": "^..." }` entry to `package.json` automatically.

- [ ] **Step 3: Write the server**

Create `tools/local-server/server.js`:

```javascript
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
  'planning-dashboard': path.join(DATA_DIR, 'planning_dashboard.json')
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const apiMatch = url.pathname.match(/^\/api\/(project-hub|planning-dashboard)$/);
  if (apiMatch) {
    handleApi(req, res, apiMatch[1]).catch(e => sendJson(res, 500, { error: e.message }));
    return;
  }
  serveHandler(req, res, { public: STATIC_ROOT });
});

server.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT} (serving ${STATIC_ROOT})`);
});
```

- [ ] **Step 4: Verify the server manually**

```bash
cd "C:/Users/Omega/Database" && node tools/local-server/server.js "C:/Users/Omega/Database" --port 3499 &
sleep 1
node -e "fetch('http://localhost:3499/api/project-hub').then(r=>r.json()).then(d=>console.log('GET1:',JSON.stringify(d)))"
node -e "fetch('http://localhost:3499/api/project-hub',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hello:'world'})}).then(r=>r.json()).then(d=>console.log('POST:',JSON.stringify(d)))"
node -e "fetch('http://localhost:3499/api/project-hub').then(r=>r.json()).then(d=>console.log('GET2:',JSON.stringify(d)))"
node -e "fetch('http://localhost:3499/project_hub').then(r=>r.status).then(s=>console.log('static status:',s))"
kill %1
```

Expected: `GET1: {}`, `POST: {"ok":true}`, `GET2: {"hello":"world"}`, `static status: 200`. Also confirm `C:/Users/Omega/Database/data/project_hub.json` now contains `{"hello":"world"}`.

- [ ] **Step 5: Clean up the test artifact and commit**

```bash
cd "C:/Users/Omega/Database" && rm -f data/project_hub.json
git add tools/local-server/package.json tools/local-server/package-lock.json tools/local-server/server.js
git commit -m "$(cat <<'EOF'
feat(local-server): add static + JSON persistence server

Small Node server (serve-handler for static files + a tiny /api/*
JSON read/write API) that will back project_hub.html and
planning_dashboard.html's persistence, replacing localStorage.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Ignore generated data and dependencies

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add new ignore entries**

Current `.gitignore`:

```
.superpowers/
.worktrees/
```

New `.gitignore`:

```
.superpowers/
.worktrees/
data/
tools/local-server/node_modules/
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/Omega/Database" && git add .gitignore
git commit -m "$(cat <<'EOF'
chore: gitignore local persistence data and server deps

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Point launch.json at the new server

**Files:**
- Modify: `.claude/launch.json`

- [ ] **Step 1: Replace all three `npx serve` configs**

Current `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "planning-dashboard",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["serve", "C:\\Users\\Omega\\Database", "--listen", "3400", "--no-clipboard"],
      "port": 3400
    },
    {
      "name": "project-hub",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["serve", "C:\\Users\\Omega\\Database", "--no-clipboard"],
      "port": 3403,
      "autoPort": true
    },
    {
      "name": "project-hub-worktree",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["serve", "C:\\Users\\Omega\\Database\\.claude\\worktrees\\sidebar-flat-restructure", "--listen", "3402", "--no-clipboard"],
      "port": 3402
    }
  ]
}
```

New `.claude/launch.json`:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "planning-dashboard",
      "runtimeExecutable": "node",
      "runtimeArgs": ["C:\\Users\\Omega\\Database\\tools\\local-server\\server.js", "C:\\Users\\Omega\\Database", "--port", "3400"],
      "port": 3400
    },
    {
      "name": "project-hub",
      "runtimeExecutable": "node",
      "runtimeArgs": ["C:\\Users\\Omega\\Database\\tools\\local-server\\server.js", "C:\\Users\\Omega\\Database"],
      "port": 3403,
      "autoPort": true
    },
    {
      "name": "project-hub-worktree",
      "runtimeExecutable": "node",
      "runtimeArgs": ["C:\\Users\\Omega\\Database\\tools\\local-server\\server.js", "C:\\Users\\Omega\\Database\\.claude\\worktrees\\sidebar-flat-restructure", "--port", "3402"],
      "port": 3402
    }
  ]
}
```

Note: `project-hub` deliberately omits `--port` (matching the previous `npx serve` config, which also omitted `--listen` there) so the port-selection harness can inject a different port via the `PORT` environment variable when 3403 is busy, without breaking persistence — the data now lives in `data/*.json`, not in origin-scoped `localStorage`, so which port gets picked no longer matters.

`tools/local-server/server.js` always resolves its `data/` directory relative to its own location (two levels up), so all three configs — including the worktree one, which serves a different static root — read and write the *same* `data/project_hub.json` / `data/planning_dashboard.json` in the main repo. This is intentional: it's the same underlying project data regardless of which checkout is being previewed.

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/Omega/Database" && git add .claude/launch.json
git commit -m "$(cat <<'EOF'
chore(launch): serve project-hub/planning-dashboard via local-server

Replaces npx serve with the new local-server so both apps get the
/api/* persistence endpoints alongside static file serving.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate `planning_dashboard.html` to the server API

**Files:**
- Modify: `planning_dashboard.html:377` (STORAGE_KEY / add API_ENDPOINT)
- Modify: `planning_dashboard.html:395-428` (loadData/saveData → async helpers)
- Modify: `planning_dashboard.html:1838-1863` (App: data state, load effect, persist, file fallback, update)
- Modify: `planning_dashboard.html:1940-1941` (loading/error guard before render)
- Modify: `planning_dashboard.html:1977-1981` (saveError banner)

This file is normal multi-line, non-minified React (`React.createElement`, no JSX/Babel) — standard `Edit` calls apply directly.

- [ ] **Step 1: Add the API endpoint constant**

Old (`planning_dashboard.html:377`):

```javascript
const STORAGE_KEY = 'planning_dashboard_data_v4'; // שינוי גרסה → איפוס אוטומטי של נתוני דוגמה ישנים
```

New:

```javascript
const STORAGE_KEY = 'planning_dashboard_data_v4'; // שינוי גרסה → איפוס אוטומטי של נתוני דוגמה ישנים
const API_ENDPOINT = '/api/planning-dashboard';
```

- [ ] **Step 2: Replace `loadData`/`saveData` with async server-backed helpers**

Old (`planning_dashboard.html:395-428`):

```javascript
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initialData = makeInitialData();
      return populateWithSampleData(initialData);
    }
    const parsed = JSON.parse(raw);
    if (!parsed.consultants || !parsed.docTypes || !parsed.buildings) {
      const initialData = makeInitialData();
      return populateWithSampleData(initialData);
    }
    if (!parsed.kpis) parsed.kpis = makeInitialData().kpis;
    if (!parsed.view) parsed.view = {
      rows: 'buildings',
      cols: 'consultants_x_docs'
    };
    if (!parsed.cells) parsed.cells = {};
    return parsed;
  } catch (e) {
    const initialData = makeInitialData();
    return populateWithSampleData(initialData);
  }
}
function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...data,
      lastModified: new Date().toISOString()
    }));
  } catch (e) {
    console.error('Save failed', e);
  }
}
```

New:

```javascript
function normalizeLoadedData(parsed) {
  if (!parsed || !parsed.consultants || !parsed.docTypes || !parsed.buildings) {
    return populateWithSampleData(makeInitialData());
  }
  if (!parsed.kpis) parsed.kpis = makeInitialData().kpis;
  if (!parsed.view) parsed.view = {
    rows: 'buildings',
    cols: 'consultants_x_docs'
  };
  if (!parsed.cells) parsed.cells = {};
  return parsed;
}
async function fetchServerData() {
  const res = await fetch(API_ENDPOINT);
  if (!res.ok) throw new Error('load failed');
  return res.json();
}
async function postServerData(data) {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, lastModified: new Date().toISOString() })
  });
  if (!res.ok) throw new Error('save failed');
}
function readLegacyLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
async function loadInitialData() {
  let raw = await fetchServerData();
  if (!raw || Object.keys(raw).length === 0) {
    const legacy = readLegacyLocalStorage();
    if (legacy) {
      raw = legacy;
      postServerData(legacy).catch(() => {});
    }
  }
  return normalizeLoadedData(raw);
}
```

- [ ] **Step 3: Wire `App`'s state to the async loader, add persist/fallback**

Old (`planning_dashboard.html:1838-1863`):

```javascript
function App() {
  const [data, setData] = useState(loadData);
  const [openCell, setOpenCell] = useState(null);
  const [openSettings, setOpenSettings] = useState(false);
  const [openKpiAdd, setOpenKpiAdd] = useState(false);
  const [editingProjName, setEditingProjName] = useState(false);
  const [filters, setFilters] = useState({
    consultantIds: [],
    statuses: [],
    buildingIds: [],
    docTypeIds: []
  });
  const [mainView, setMainView] = useState('dashboard'); // 'dashboard' | 'gantt'
  const [delaySettings, setDelaySettings] = useState({
    enabled: false,
    threshold: 14
  });
  const [sidebarWidth, setSidebarWidth] = useState(480); // Default sidebar width in pixels
  const [toast, showToast] = useToast();
  const update = useCallback(updater => {
    setData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  }, []);
```

New:

```javascript
function App() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const fileHandleRef = useRef(null);
  const [openCell, setOpenCell] = useState(null);
  const [openSettings, setOpenSettings] = useState(false);
  const [openKpiAdd, setOpenKpiAdd] = useState(false);
  const [editingProjName, setEditingProjName] = useState(false);
  const [filters, setFilters] = useState({
    consultantIds: [],
    statuses: [],
    buildingIds: [],
    docTypeIds: []
  });
  const [mainView, setMainView] = useState('dashboard'); // 'dashboard' | 'gantt'
  const [delaySettings, setDelaySettings] = useState({
    enabled: false,
    threshold: 14
  });
  const [sidebarWidth, setSidebarWidth] = useState(480); // Default sidebar width in pixels
  const [toast, showToast] = useToast();
  useEffect(() => {
    loadInitialData().then(setData).catch(() => setLoadError(true));
  }, []);
  const persist = useCallback(async next => {
    if (fileHandleRef.current) {
      try {
        const w = await fileHandleRef.current.createWritable();
        await w.write(JSON.stringify({ ...next, lastModified: new Date().toISOString() }));
        await w.close();
        setSaveError(false);
      } catch (e) {
        setSaveError(true);
      }
      return;
    }
    try {
      await postServerData(next);
      setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }, []);
  const openFileFallback = useCallback(async () => {
    if (!window.showOpenFilePicker) return;
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
      const file = await handle.getFile();
      const text = await file.text();
      const parsed = text ? JSON.parse(text) : null;
      fileHandleRef.current = handle;
      setLoadError(false);
      setData(normalizeLoadedData(parsed));
    } catch (e) {
      // user cancelled or picker failed — stay on the error banner
    }
  }, []);
  const update = useCallback(updater => {
    setData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persist(next);
      return next;
    });
  }, [persist]);
```

- [ ] **Step 4: Add the loading/error guard before the main render**

Old (`planning_dashboard.html:1940-1941`, immediately after `editEvent`'s `useCallback`):

```javascript
  }, [update]);
  const exportData = () => {
```

New:

```javascript
  }, [update]);
  if (!data) {
    return /*#__PURE__*/React.createElement("div", {
      style: { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 }
    }, loadError ? /*#__PURE__*/React.createElement(React.Fragment, null,
      /*#__PURE__*/React.createElement("div", { style: { fontSize: 14, color: '#6D6E6F' } }, "לא ניתן להתחבר לשרת השמירה המקומי"),
      window.showOpenFilePicker && /*#__PURE__*/React.createElement("button", {
        onClick: openFileFallback,
        style: { background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }
      }, "פתח קובץ נתונים...")
    ) : /*#__PURE__*/React.createElement("div", { style: { fontSize: 14, color: '#6D6E6F' } }, "טוען..."));
  }
  const exportData = () => {
```

- [ ] **Step 5: Add a "not saved" banner when persistence fails**

Old (`planning_dashboard.html:1977-1981`):

```javascript
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh'
    }
  }, /*#__PURE__*/React.createElement("header", {
```

New:

```javascript
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100vh'
    }
  }, saveError && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 600,
      textAlign: 'center', padding: '4px 0'
    }
  }, "לא ניתן לשמור — השינויים האחרונים לא נשמרו"), /*#__PURE__*/React.createElement("header", {
```

- [ ] **Step 6: Load in the browser and check for console errors**

Use the preview tools: start (or reuse) the `planning-dashboard` server, navigate to `/planning_dashboard`, reload, and check `preview_console_logs` for errors. Fix any reported syntax/reference errors before proceeding (most likely cause: an anchor didn't match exactly — re-open the file at the noted line and adjust).

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Omega/Database" && git add planning_dashboard.html
git commit -m "$(cat <<'EOF'
feat(planning-dashboard): persist via local server instead of localStorage

loadData/saveData become async fetch calls against /api/planning-dashboard,
with one-time migration from the old localStorage key and a File System
Access API fallback when the server is unreachable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Verify `planning_dashboard.html` end-to-end

- [ ] **Step 1: Start the server and load the app**

Use `preview_start` with the `planning-dashboard` launch config, navigate to `/planning_dashboard`, and confirm via `preview_snapshot` that the dashboard renders (not stuck on "טוען...").

- [ ] **Step 2: Edit and confirm persistence across a reload**

Use `preview_click`/`preview_fill` to make a small change (e.g. edit the project name via the header). Reload (`preview_eval: window.location.reload()`). Confirm the edit is still there.

- [ ] **Step 3: Confirm the file on disk**

```bash
cat "C:/Users/Omega/Database/data/planning_dashboard.json"
```

Expected: contains the edit made in Step 2.

- [ ] **Step 4: Confirm persistence survives a port change**

Stop the server (`preview_stop`), then start it again on a different port (e.g. temporarily edit `.claude/launch.json`'s `planning-dashboard` port to `3401`, or use the `project-hub` config's `autoPort` behavior as a stand-in). Reload the app at the new port and confirm the same edit from Step 2 is still visible — this is the core bug being fixed. Revert any temporary port edit afterward.

- [ ] **Step 5: Confirm the unreachable-server fallback**

Stop the server. Reload the page directly (it will now be pointed at a dead origin, or open `planning_dashboard.html` via `file://` in the same preview browser). Confirm the "לא ניתן להתחבר..." banner and (if the browser supports `showOpenFilePicker`) the "פתח קובץ נתונים..." button both appear. Restart the server for subsequent tasks.

---

## Task 6: Migrate `project_hub.html` to the server API

**Files:**
- Modify: `project_hub.html:776` (loadData → async server-backed helpers)
- Modify: `project_hub.html:1197-1198` (App: data state, load effect, persist, file fallback)
- Modify: `project_hub.html:1199` (`save` callback → use `persist`)
- Modify: `project_hub.html:1199-1200` (`undoTo`/`redoTo` callbacks → use `persist`)
- Modify: `project_hub.html` (final return → loading guard + saveError banner)

This file is a dense, mostly-single-line minified React file (`React.createElement`, no JSX/Babel) with a documented history of syntax bugs from imprecise edits (see [2026-07-01-meeting-minutes-pdf-export-design.md](../specs/2026-07-01-meeting-minutes-pdf-export-design.md)). For every step below:
1. Before editing, `Grep` the exact old-string in the live file to confirm it still matches character-for-character (whitespace/formatting can drift between plan-writing and execution). If it doesn't match, `Read` the surrounding lines and adjust rather than guessing.
2. After editing, validate with `node --check` on an extracted copy of the `<script>` block, or simply load the page and check `preview_console_logs` for parse errors (Step 6 below does this for the whole file).

- [ ] **Step 1: Replace `loadData` with async server-backed helpers**

Old (`project_hub.html:776`, exact substring — appears once in the file):

```javascript
function loadData(){try{const r=localStorage.getItem(STORAGE_KEY);const d=migrateData(r?JSON.parse(r):makeDefaultData());return repairPrecondsSheet(d);}catch{return migrateData(makeDefaultData());}}
```

New:

```javascript
const API_ENDPOINT='/api/project-hub';async function fetchServerData(){const res=await fetch(API_ENDPOINT);if(!res.ok)throw new Error('load failed');return res.json();}async function postServerData(d){const res=await fetch(API_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});if(!res.ok)throw new Error('save failed');}function readLegacyLocalStorage(){try{const r=localStorage.getItem(STORAGE_KEY);return r?JSON.parse(r):null;}catch{return null;}}async function loadInitialData(){let raw=await fetchServerData();if(!raw||Object.keys(raw).length===0){const legacy=readLegacyLocalStorage();if(legacy){raw=legacy;postServerData(legacy).catch(()=>{});}}const d=migrateData(raw&&Object.keys(raw).length?raw:makeDefaultData());return repairPrecondsSheet(d);}
```

- [ ] **Step 2: Change `App`'s initial state and add load/persist/fallback logic**

Old (`project_hub.html:1197-1198`, exact substring — appears once):

```javascript
function App(){const[data,setData]=useState(loadData);const[editName,setEditName]=useState(false);const[nameDraft,setNameDraft]=useState(data.projectName);const MAX_HIST=30;const[pastStack,setPastStack]=useState([]);// [{snapshot, label}]
const[futureStack,setFutureStack]=useState([]);// [{snapshot, label}]
```

New:

```javascript
function App(){const[data,setData]=useState(null);const[loadError,setLoadError]=useState(false);const[saveError,setSaveError]=useState(false);const fileHandleRef=useRef(null);const[editName,setEditName]=useState(false);const[nameDraft,setNameDraft]=useState('');const MAX_HIST=30;const[pastStack,setPastStack]=useState([]);// [{snapshot, label}]
const[futureStack,setFutureStack]=useState([]);// [{snapshot, label}]
React.useEffect(()=>{loadInitialData().then(setData).catch(()=>setLoadError(true));},[]);const persist=useCallback(async d=>{if(fileHandleRef.current){try{const w=await fileHandleRef.current.createWritable();await w.write(JSON.stringify(d));await w.close();setSaveError(false);}catch{setSaveError(true);}return;}try{await postServerData(d);setSaveError(false);}catch{setSaveError(true);}},[]);const openFileFallback=useCallback(async()=>{if(!window.showOpenFilePicker)return;try{const[handle]=await window.showOpenFilePicker({types:[{description:'JSON',accept:{'application/json':['.json']}}]});const file=await handle.getFile();const text=await file.text();const parsed=text?JSON.parse(text):{};const d=repairPrecondsSheet(migrateData(Object.keys(parsed).length?parsed:makeDefaultData()));fileHandleRef.current=handle;setLoadError(false);setData(d);}catch{}},[]);
```

Note: `nameDraft` no longer reads `data.projectName` at init time (since `data` is `null` on first render) — this is safe because the only place `nameDraft` is actually used is set fresh from `data.projectName` at the moment editing starts (existing code: `onClick:()=>{setNameDraft(data.projectName);setEditName(true);}`, unchanged).

- [ ] **Step 3: Point `save` at `persist` instead of `localStorage`**

Old (`project_hub.html`, exact substring — appears once):

```javascript
setData(d);localStorage.setItem(STORAGE_KEY,JSON.stringify(d));},[data]);
```

New:

```javascript
setData(d);persist(d);},[data,persist]);
```

- [ ] **Step 4: Point `undoTo` at `persist`**

Old (`project_hub.html`, exact substring — appears once, identifiable by the `[data,pastStack]` dependency array):

```javascript
setData(restored);localStorage.setItem(STORAGE_KEY,JSON.stringify(restored));},[data,pastStack]);
```

New:

```javascript
setData(restored);persist(restored);},[data,pastStack,persist]);
```

- [ ] **Step 5: Point `redoTo` at `persist`**

Old (`project_hub.html`, exact substring — appears once, identifiable by the `[data,futureStack]` dependency array):

```javascript
setData(restored);localStorage.setItem(STORAGE_KEY,JSON.stringify(restored));},[data,futureStack]);
```

New:

```javascript
setData(restored);persist(restored);},[data,futureStack,persist]);
```

- [ ] **Step 6: Add the loading/error guard and saveError banner before the main render**

Old (`project_hub.html`, exact substring — appears once):

```javascript
const[track,setTrack]=useState('tasks');return/*#__PURE__*/React.createElement("div",{className:"shell"},/*#__PURE__*/React.createElement(Sidebar,{track:track,setTrack:setTrack,tracks:data.tracks||[]}),
```

New:

```javascript
const[track,setTrack]=useState('tasks');if(!data){return/*#__PURE__*/React.createElement("div",{style:{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:12,padding:40}},loadError?/*#__PURE__*/React.createElement(React.Fragment,null,/*#__PURE__*/React.createElement("div",{style:{fontSize:14,color:'var(--text-2)'}},"לא ניתן להתחבר לשרת השמירה המקומי"),window.showOpenFilePicker&&/*#__PURE__*/React.createElement("button",{onClick:openFileFallback,style:{background:'var(--accent)',color:'#fff',border:'none',borderRadius:6,padding:'8px 16px',fontSize:13,cursor:'pointer',fontFamily:'inherit'}},"פתח קובץ נתונים...")):/*#__PURE__*/React.createElement("div",{style:{fontSize:14,color:'var(--text-2)'}},"טוען..."));}return/*#__PURE__*/React.createElement("div",{className:"shell"},saveError&&/*#__PURE__*/React.createElement("div",{style:{position:'fixed',top:0,left:0,right:0,zIndex:9999,background:'#DC2626',color:'#fff',fontSize:12,fontWeight:600,textAlign:'center',padding:'4px 0'}},"לא ניתן לשמור — השינויים האחרונים לא נשמרו"),/*#__PURE__*/React.createElement(Sidebar,{track:track,setTrack:setTrack,tracks:data.tracks||[]}),
```

- [ ] **Step 7: Load in the browser and check for console/parse errors**

Use the preview tools: start (or reuse) the `project-hub` server, navigate to `/project_hub`, reload, and check `preview_console_logs` for errors. A blank page or a React error boundary message indicates a syntax mismatch from one of the edits above — re-open the exact line, diff it carefully against the "New" blocks above, and fix.

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/Omega/Database" && git add project_hub.html
git commit -m "$(cat <<'EOF'
feat(project-hub): persist via local server instead of localStorage

loadData/save/undoTo/redoTo route through a shared persist() helper
backed by /api/project-hub, with one-time migration from the old
localStorage key and a File System Access API fallback.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verify `project_hub.html` end-to-end

- [ ] **Step 1: Start the server and load the app**

Use `preview_start` with the `project-hub` launch config, navigate to `/project_hub`, and confirm via `preview_snapshot` that the ניהול תכנון task table renders (not stuck on "טוען...").

- [ ] **Step 2: Edit and confirm persistence across a reload**

Edit a task title inline (per [0d9b39c feat(tasks): inline-editable update title in StatusOwnerCell] this is a supported interaction). Reload. Confirm the edit is still there.

- [ ] **Step 3: Confirm undo/redo also persists**

Make an edit, undo it (Ctrl+Z or the ↩ button), reload, confirm the undone state persisted (not the pre-undo state).

- [ ] **Step 4: Confirm the file on disk**

```bash
cat "C:/Users/Omega/Database/data/project_hub.json"
```

Expected: reflects the state from Step 3.

- [ ] **Step 5: Confirm persistence survives a port change**

Stop the server (`preview_stop`), restart it on a different port, reload, and confirm the same data is visible. This is the original bug report — confirm it's actually fixed.

- [ ] **Step 6: Confirm the unreachable-server fallback**

Stop the server, reload, confirm the error banner + (where supported) file-picker button appear, matching Task 5 Step 5's check for `planning_dashboard.html`. Restart the server afterward.

---

## Task 8: Verify legacy localStorage migration

- [ ] **Step 1: Seed a fake legacy localStorage entry for project-hub**

With the server stopped and `data/project_hub.json` deleted (`rm -f "C:/Users/Omega/Database/data/project_hub.json"`), open the app, then via `preview_eval` run:

```javascript
localStorage.setItem('pm_asana_v9', JSON.stringify({ projectName: 'MIGRATION-TEST', sheets: [], tracks: [] }))
```

Reload the page (with the server running).

- [ ] **Step 2: Confirm the legacy data was adopted and seeded server-side**

Check the header now shows "MIGRATION-TEST" (via `preview_snapshot`), and:

```bash
cat "C:/Users/Omega/Database/data/project_hub.json"
```

Expected: contains `"projectName":"MIGRATION-TEST"`.

- [ ] **Step 3: Repeat for planning_dashboard.html**

Same pattern with `localStorage.setItem('planning_dashboard_data_v4', JSON.stringify({consultants:[{id:'c1',name:'MIGRATION-TEST'}],docTypes:[],buildings:[],cells:{}}))` after deleting `data/planning_dashboard.json`, confirming the migrated value shows up both on screen and in the JSON file.

- [ ] **Step 4: Restore real data**

If Steps 1–3 overwrote real working data during testing, this is disposable local dev data (per the design, `data/` is git-ignored) — no repo state to restore. Note this to the user if the test data should be manually cleared afterward.

---

## Self-Review Notes (for the plan author, not a task)

- Spec coverage: architecture ✓ (Task 1, 3), components ✓ (Task 1, 4, 6), data flow load/save ✓ (Task 4 Steps 2-3, Task 6 Steps 1-5), error handling/fallback ✓ (Task 4 Steps 3-5, Task 6 Step 6, verified in Tasks 5 & 7), one-time migration ✓ (Task 8), testing/verification ✓ (Tasks 5, 7, 8 — all manual via preview tools, matching the spec's stated approach).
- No placeholders: every code block above is complete, runnable code — none are described-but-not-shown.
- Type/name consistency checked: `persist`, `loadInitialData`, `fetchServerData`, `postServerData`, `readLegacyLocalStorage`/`normalizeLoadedData`, `openFileFallback`, `fileHandleRef`, `loadError`, `saveError` are spelled identically everywhere they're referenced across both files' tasks.
