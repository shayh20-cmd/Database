# Local File Persistence — Design Spec

## Goal

Replace `localStorage`-only persistence in `project_hub.html` and `planning_dashboard.html` with a small local Node server that reads/writes JSON files on disk, so data survives browser storage clears, port changes (`autoPort` in `.claude/launch.json`), and switching machines/browsers.

Trigger: `project_hub.html` data appeared to "disappear" between sessions because `.claude/launch.json`'s `project-hub` config uses `autoPort: true` — each restart can land on a different port, and `localStorage` is scoped per-origin (protocol+host+**port**), so data saved under one port's origin is invisible from another. Firebase was considered and explicitly deferred in favor of local-only persistence for now.

## Non-goals (deferred)

- Firebase / any cloud backend — deferred to a future pass.
- Real-time multi-user collaboration — out of scope; this is still single-editor-at-a-time.
- Automated tests — this codebase has no test harness; verification is manual via the preview tools, consistent with prior work.

## Architecture

One small custom Node server (`tools/local-server/server.js`) replaces `npx serve` in every `.claude/launch.json` config. It does two jobs on a single port:

- Serves the repo statically, identical to today's `npx serve` behavior (extension-less URLs like `/project_hub` continue to work), via the `serve-handler` package (the same library `serve` uses internally).
- Exposes a small JSON load/save API under `/api/*`, so the browser talks to the same origin it loaded from — no CORS, no second port to track.

```
tools/local-server/
  server.js        — http server: /api/* → JSON read/write, everything else → serve-handler
  package.json      — one dependency: serve-handler
data/                — gitignored
  project_hub.json
  planning_dashboard.json
```

Because persistence no longer lives in `localStorage`, the port a session happens to land on no longer determines whether data is visible — `autoPort` becomes safe to keep.

## Components

### `tools/local-server/server.js`

Two fixed named endpoints per app (not an arbitrary `?file=` param), so the client can never make the server write outside `data/`:

- `GET /api/project-hub` → returns contents of `data/project_hub.json`, or `{}` if the file doesn't exist yet.
- `POST /api/project-hub` → atomically writes the request body to `data/project_hub.json` (write to `data/project_hub.json.tmp`, then `fs.rename` over the real file, so a crash mid-write can't corrupt existing data).
- `GET /api/planning-dashboard` / `POST /api/planning-dashboard` → same pattern for `data/planning_dashboard.json`.
- Everything else (any path not starting with `/api/`) is delegated to `serve-handler(request, response, { public: <repo root> })`, preserving current static-serving behavior exactly.

### `.claude/launch.json`

The three existing server configs (`planning-dashboard`, `project-hub`, `project-hub-worktree`) change their `runtimeExecutable`/`runtimeArgs` from `npx serve ...` to `node tools/local-server/server.js <port>`, keeping their existing `port`/`autoPort` settings.

### Client changes (`project_hub.html`, `planning_dashboard.html`)

`loadData()` and `save()` become async and talk to `/api/project-hub` (or `/api/planning-dashboard`) instead of `localStorage.getItem`/`setItem`. Everything downstream — `migrateData()`, `repairPrecondsSheet()`, React state, the undo/redo stacks — is unchanged; only the I/O at the edges moves from synchronous `localStorage` calls to `fetch`.

## Data flow

**Load:** `App` mounts with `data` initialized to `null` (instead of the current synchronous `useState(loadData)`). A `useEffect` fires `GET /api/project-hub` on mount. While pending, render a lightweight loading state — this is the one visible behavioral change versus today, a brief loading flash on first paint. Once resolved, run `migrateData()` / `repairPrecondsSheet()` on the fetched JSON exactly as today.

**Save:** `save(nd)` still updates React state and the undo/redo stacks synchronously first (no UI lag on typing/clicking), then fires `POST /api/project-hub` with the new data in the background. No debouncing — saves already only fire on discrete committed actions (blur/Enter/button clicks), not per keystroke, so request volume is already low.

## Error handling / fallback

- If the initial `GET` fails (server not running, page opened via `file://`, etc.), show a small dismissible banner: *"Can't reach the local save server — [Open a file instead]"*.
- Clicking that action calls `window.showOpenFilePicker()` (File System Access API — Chrome/Edge only). On unsupported browsers the button is hidden; the banner just explains the app is running unsaved/in-memory.
- Once a file is picked this way, the `FileSystemFileHandle` is kept in memory for the session; every subsequent `save()` writes to it directly via `createWritable()` instead of `POST`ing to the server.
- If a `POST` fails after a successful initial load (server died mid-session), show a small persistent "not saved" indicator near the existing undo/redo buttons, rather than failing silently — so work is never lost without the user knowing.

## One-time migration from localStorage

On the first `GET`, if the server responds with an empty object (no file in `data/` yet), the client checks the corresponding existing `localStorage` key:

- `project_hub.html`: `localStorage.getItem('pm_asana_v9')`
- `planning_dashboard.html`: `localStorage.getItem('planning_dashboard_data_v4')`

If present, that becomes the initial `data` and is immediately `POST`ed to seed the server-side file. From then on the server file is the source of truth; the old `localStorage` key is left untouched (harmless, never read again after this one-time check).

## Testing / verification

Manual, via the preview tools (this codebase has no automated test harness):

1. Start the new server, confirm both apps load their existing data (migrated from current `localStorage`).
2. Edit something in each app, reload the page, confirm the edit persisted.
3. Kill the server process, reload, confirm the fallback banner appears and the file picker works (where supported).
4. Restart the server on a different port (simulating `autoPort` picking a new port) and confirm data is still visible — this is the core bug being fixed.

## Out of scope (this spec)

- Firebase migration (deferred, noted above).
- Real-time multi-user sync.
- Committing `data/*.json` to git (explicitly git-ignored per user decision).
- Any change to `project_hub.html` / `planning_dashboard.html` behavior beyond the load/save I/O described here.
