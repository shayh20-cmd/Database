# Azure deployment — shared projects behind Entra sign-in

**Date:** 2026-09-17
**Apps:** `project_hub_01.html`, `capture.html`, `planning_dashboard.html`, `tools/local-server/server.js`
**Branch:** `feat/azure-deployment` (from `origin/master` at `d5d777e`)
**Status:** approved. On 2026-09-17 the first deployment was cut down to the least that shows sign-in and shared data — see `docs/azure.md`: documents under `/home/data` rather than Blob Storage, a client secret rather than a managed identity, `RedirectToLoginPage`, no `index.html`, one project. Versioned saves (`ETag`/`If-Match`/412, merge and retry, merge-in every 30 seconds) were added on 2026-09-22 inside `project_hub_01.html` rather than as `shared/sync.js`. The rest of this design stays the target.

## Goal

The firm uses the project hub together. Anyone with a work account in the firm's
Entra directory opens `https://<name>.azurewebsites.net`, signs in with Microsoft,
and works on the same projects as everyone else. Several projects exist side by
side, anyone can create one, and two people editing the same project at once both
keep their changes.

Everything keeps working locally exactly as it does today, including the quick
capture hotkey and the snipping button.

## Context

- `project_hub_01.html` already saves through `tools/local-server/server.js`: one JSON
  document per app in `data/`, pasted images and Outlook `.msg`/`.eml`/`.pdf` files in
  `data/attachments/`.
- It already merges three ways before saving (`mergeDocs`, mirrored in
  `tests/merge.test.js`), but read–merge–write is not atomic, and change detection
  compares client-clock `_ts` values.
- Each project is a separate HTML file hard-wired to its own API path
  (`project-hub`, `project-hub-01`).
- The current user is hard-coded (`userName='שי'`, `fullName='שי הרשקוביץ'`).
- The data in `data/` is demo data. It is imported anyway, and deleted later if
  unwanted.
- The same server also serves the spec creator, funday and the drawing app locally
  (see `.claude/launch.json`). None of those move to Azure, and none may break.

This reverses the 2026-09-16 decision to freeze the prototypes while the site is
rebuilt in KkarcDB. Real work entered here will have to be carried into KkarcDB
when that site ships.

## Decisions

| Question | Decision |
|---|---|
| Purpose | The team shares data now — not a read-only demo |
| Projects | Several real projects in one deployment |
| Concurrent saves | Keep the existing three-way merge; the server refuses stale saves and the page re-merges and retries |
| Hosting | Standalone Azure App Service + Blob Storage, separate from KkarcDB and Supabase |
| Who signs in | Any member of the firm's Entra directory; guests refused |
| New project | Starts from the page's built-in blank template (`makeDefaultData`) |
| Existing data | Imported once from a local `data/` folder |
| Also on Azure | Quick capture window, planning dashboard |
| Plan | F1 (free) |
| Home view | Hidden on Azure — its portfolio cards are hard-coded demo data |
| Local server | Listens on `localhost` only |

Two points changed after checking Microsoft's documentation, both keeping what was
approved:

- **No client secret, via a managed identity — not via the implicit flow.** Easy Auth
  with no secret falls back to the OAuth implicit grant, which Microsoft does not
  recommend. A user-assigned managed identity trusted by the app registration
  (federated identity credential) gives the same result: nothing to store, nothing
  that expires.
- **Token store on.** Microsoft notes claims mapping into `X-MS-CLIENT-PRINCIPAL`
  depends on it.

One addition: **blob versioning** with a 30-day lifecycle rule, so a bad save — a
merge bug, an accidental bulk delete — can be undone from the portal. Soft delete
alone protects only against deleting a whole file.

## Architecture

One server, two modes, chosen by `SITE_MODE`:

| | `local` (default) | `cloud` |
|---|---|---|
| Listens on | `127.0.0.1:<port>` | `0.0.0.0:$PORT` (App Service) |
| Storage | files under `data/` | Blob Storage container `site-data` |
| Identity | `LOCAL_USER_NAME`, default `שי הרשקוביץ` | Easy Auth principal headers |
| Static files | everything under the root, as today | an allowlist only |
| Legacy routes (`/api/project-hub`, `/api/upload/*`, spec creator…) | kept | absent |
| `/api/snip` | works | absent |

**Cloud mode refuses to start** unless `WEBSITE_AUTH_ENABLED` is `true` (App Service
injects it when authentication is on) and the storage settings are present. App
Service strips `X-MS-*` headers from incoming requests only while authentication is
enabled, so without this check any caller could claim to be anyone.

### Azure resources (one resource group)

| Resource | Settings |
|---|---|
| Storage account | StorageV2, LRS, HTTPS only, public blob access off, shared-key access off, blob soft delete 14 days, container soft delete 14 days, versioning on, lifecycle rule deleting versions older than 30 days |
| App Service plan | Linux, F1 |
| Web app | Node 22 LTS, HTTPS only, FTP off, system-assigned identity with **Storage Blob Data Contributor** on the storage account |
| User-assigned managed identity | used only as the sign-in credential of the app registration |
| Entra app registration | single tenant; redirect `https://<name>.azurewebsites.net/.auth/login/aad/callback`; ID tokens on; optional ID-token claim `acct`; federated credential for the user-assigned identity; no secret |
| Easy Auth (authsettingsV2) | Microsoft provider, issuer `https://login.microsoftonline.com/<tenant>/v2.0`; `unauthenticatedClientAction: AllowAnonymous`; token store on; session cookie `FixedTime` 12 hours; app settings `OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID` and `WEBSITE_AUTH_AAD_ALLOWED_TENANTS=<tenant>` |

`AllowAnonymous` is deliberate: Easy Auth still validates the session and injects the
principal, and the server decides — a redirect for pages, 401 for the API, 403 for
guests. With `RedirectToLoginPage`, a `fetch` after the session expires would follow a
cross-origin redirect and fail with an unreadable error.

## Server

### Storage

One interface, two implementations (`storage-fs.js`, `storage-blob.js`):

```
getDoc(key)                          → { doc, version, updatedBy, updatedAt } | null
putDoc(key, doc, { ifMatch, ifNoneMatch, by })
                                     → { version }  |  throws Conflict
listProjects()                       → [{ id, name, updatedBy, updatedAt }]
deleteProject(id)
putAttachment(projectId, fileName, bytes, contentType)
getAttachment(projectId, fileName)   → stream + contentType | null
```

| Key | Blob path | Local file |
|---|---|---|
| project `project-hub-01` | `projects/project-hub-01.json` | `data/project_hub_01.json` (existing) |
| project `project-hub` | `projects/project-hub.json` | `data/project_hub.json` (existing) |
| any other project `<id>` | `projects/<id>.json` | `data/projects/<id>.json` |
| planning dashboard | `docs/planning-dashboard.json` | `data/planning_dashboard.json` (existing) |
| attachment | `attachments/<id>/<file>` | `data/attachments/<id>/<file>` (existing) |

- **Versions.** Blob: the blob's ETag, with `If-Match` / `If-None-Match: *` enforced by
  the storage service. Local: SHA-1 of the file's bytes; the compare and the atomic
  write happen synchronously in one process. (Two local servers sharing one `data/`
  can still race, as they can today.)
- **Who and when.** Blob metadata `updatedby`, `updatedat` and `projectname`,
  percent-encoded because metadata is ASCII-only. `listProjects` reads metadata and
  never downloads documents. Locally, `listProjects` reads the files.
- **Delete.** Blob: a normal delete, recoverable through soft delete. Local: the file
  moves to `data/deleted/`.
- **Ids.** New project ids are generated server-side, `p-` plus 10 random base-36
  characters; every id in a route must match `^[a-z0-9-]{1,40}$`. Attachment file
  names are generated as today and must match `^[a-z0-9-]+\.[a-z0-9]+$`.

### Routes

| Method and path | Behaviour |
|---|---|
| `GET /api/me` | `{ name, email, mode }` |
| `GET /api/projects` | the project list |
| `POST /api/projects` | body `{ name }`; creates an empty document `{ projectName: name }`, returns `{ id }` |
| `GET /api/projects/<id>` | the document; `ETag`, `X-Updated-By`, `X-Updated-At` headers; `304` for a matching `If-None-Match`; `404` if unknown |
| `POST /api/projects/<id>` | saves; `If-Match` **required in cloud mode** (`428` without it), `412` if stale, `404` if unknown; returns `{ version }` |
| `DELETE /api/projects/<id>` | deletes |
| `POST /api/projects/<id>/attachments?name=` | as today's upload: images by content type, `.msg`/`.eml`/`.pdf` by name; 20 MB limit; returns `{ url }` |
| `GET /data/attachments/<id>/<file>` | the attachment, with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox` (an uploaded SVG must not run script on this origin) |
| `GET`/`POST /api/planning-dashboard` | the same version rules as a project |

`X-Updated-By` carries a percent-encoded name, since HTTP headers cannot hold Hebrew.

Locally the legacy routes stay exactly as they are and keep writing the same files,
so `project_hub.html` and the spec creator are unaffected. A legacy `POST` without
`If-Match` still overwrites — the old pages don't send versions.

### Sign-in check (cloud mode, every request)

1. Decode `X-MS-CLIENT-PRINCIPAL` (base64 JSON, `claims: [{ typ, val }]`).
2. No principal: a page request redirects to
   `/.auth/login/aad?post_login_redirect_uri=<path>`; an `/api/*` request gets `401`.
3. `acct` claim missing or not `0`: `403` — a Hebrew page ("חשבונות אורח אינם יכולים
   להתחבר") for pages, JSON for the API. A missing claim refuses everyone, so a
   misconfigured registration fails closed rather than open.
4. Otherwise the request carries `{ name, email }` from the `name` and
   `preferred_username` claims.

### Static files in cloud mode

`/` (serving `index.html`), `/index.html`, `/project_hub_01.html`, `/capture.html`,
`/planning_dashboard.html`, `/shared/merge.js`, `/shared/sync.js`. Anything else is
`404` — the server source, `package.json` and `data/` are never served.

## Pages

### Shared scripts

- **`shared/merge.js`** — `mergeDocs` and its helpers, moved out of
  `project_hub_01.html` unchanged. Loaded by a `<script>` tag; exports through
  `module.exports` when present, so `tests/merge.test.js` requires it instead of
  mirroring it.
- **`shared/sync.js`** — version-aware loading and saving:

```
const sync = createDocSync({ url, fetch })
sync.load()            → { doc, version, updatedBy } | throws NotFound / Unauthorized
sync.save(doc, base)   → the document as saved — merged if others saved in between
sync.update(fn)        → re-reads, applies fn(doc), saves; retries on 412 (for capture)
sync.check()           → null if unchanged, else { doc, version, updatedBy }
sync.pending           → true while a save is queued or in flight
```

`save` keeps one request in flight; a save requested meanwhile replaces any earlier
queued one. On `412` it re-reads, runs `mergeDocs(base, mine, theirs)` and retries,
up to five attempts, then rejects. `check` sends `If-None-Match`.

### `project_hub_01.html`

- **Which project.** `?p=<id>`. In cloud mode a missing `p` redirects to `/`. In local
  mode it defaults to `project-hub-01`, so today's links keep working.
- **Loading.** A document with no `sheets` — a project just created from `/` — is
  filled from `makeDefaultData()`, keeps its `projectName`, and is saved. An unknown id shows "הפרויקט לא
  נמצא" with a link to `/`. In cloud mode the legacy `localStorage` import and the
  "open a file" fallback are disabled.
- **Saving.** `persist` calls `sync.save(doc, baseDoc)`. When the saved document
  differs from what was sent — others' changes were merged in — the page shows it and
  clears undo/redo. Undo restores whole snapshots and would otherwise quietly remove
  a colleague's change.
- **Staying current.** On window focus and every 60 seconds, `sync.check()`. A newer
  version is merged into the screen, a notice reads "עודכן על ידי <name>", and
  undo/redo is cleared — but only when no save is pending and no `input`, `textarea`,
  `select` or `contenteditable` has focus; otherwise it waits for the next check. This
  replaces the `_ts` comparison and the "external change" banner.
- **Who.** `userName` and `fullName` come from `/api/me` (the first word of the name is
  the greeting). `buildActivityLogEntries` adds `by`; entries without `by` render as
  before.
- **Home view.** Hidden in cloud mode.
- **Attachments.** Uploads go to `/api/projects/<id>/attachments`.

### `capture.html`

- The project list comes from `/api/projects`; saving uses `sync.update(applyCapture)`
  against `/api/projects/<id>`, so a capture is re-applied to the fresh document
  rather than overwriting it.
- The snipping button is hidden when `/api/me` reports `mode: cloud`.
- `tools/quick-capture.ahk` gets a local and an Azure `CAPTURE_URL`, one commented
  out; `tools/README-quick-capture.md` explains the switch in Hebrew.

### `planning_dashboard.html`

Loads and saves through `sync.js` against `/api/planning-dashboard`: the same version
check and merge, where today it overwrites.

### `index.html` (new)

The project list at `/`: name, last changed by and when, sorted by most recent.
**פרויקט חדש** asks for a name, creates the project and opens it. **מחיקה** asks the
user to type the project name. A link opens the planning dashboard. Hebrew, RTL,
the same visual language as `project_hub_01.html`.

## Session and failure handling

| Situation | What the user sees | What happens |
|---|---|---|
| Session expired (`401`) | banner "פג תוקף ההתחברות" with a sign-in link opening a new tab | the pending save stays in memory and retries on the next focus or check |
| Guest account (`403`) | the guest refusal page | nothing is read or written |
| Save rejected after five merges | the existing "not saved" marker | the document stays on screen; the next edit or check retries |
| Network down | the existing "not saved" marker | retried on the next check |
| Closing with a save pending | the browser's leave-page prompt | — |
| Project deleted by someone else (`404` on save) | "הפרויקט נמחק" with a link to `/` | nothing is written |

## Deployment — `Deploy-Azure.ps1`

`.\Deploy-Azure.ps1 -Name <name> [-ResourceGroup project-hub] [-Location israelcentral] [-Sku F1] [-Plan <existing plan>]`

Uses the subscription `az login` is signed in to. Every step checks what exists
first, so a second run only redeploys code.

1. Resource group, storage account (settings above), container `site-data`. Grants
   the signed-in user **Storage Blob Data Contributor**, for the import.
2. Plan and web app. Enables the system-assigned identity and grants it storage
   access. App settings: `SITE_MODE=cloud`, `STORAGE_ACCOUNT_URL`,
   `STORAGE_CONTAINER=site-data`, `SCM_DO_BUILD_DURING_DEPLOYMENT=true`.
3. User-assigned identity; app registration with redirect URI, ID tokens, the `acct`
   optional claim and the federated credential; its service principal.
4. Easy Auth configuration (above).
5. Code: stages `index.html`, the three pages, `shared/`, and `tools/local-server/`
   (without `node_modules` or tests) under a root `package.json` whose `start` runs
   the server; zip-deploys it; Azure installs dependencies.
6. Smoke check: `/` must answer `302` to `/.auth/login/aad`, and `/api/projects`
   must answer `401`. Any other result stops the script with the response it got.
   (Unauthenticated requests never reach the allowlist, so it is covered by the
   server tests rather than here.)

If a region refuses the plan, the script lists regions offering the SKU, as
KkarcDB's script does. `-Plan` places the app on an existing plan — Azure may limit
free plans per region, and a shared free plan shares its daily CPU minutes.

`@azure/storage-blob` and `@azure/identity` join `tools/local-server/package.json`,
required only in cloud mode or by the importer.

## Import — `tools/local-server/import.js`

`node tools/local-server/import.js --from <data folder> --account <storage account> [--container site-data] [--force]`

Signs in through `az login` (`DefaultAzureCredential`).

| Local | Azure |
|---|---|
| `project_hub_01.json` | project `project-hub-01` |
| `project_hub.json` | project `project-hub` |
| `planning_dashboard.json` | `docs/planning-dashboard.json` |
| `attachments/<app>/<file>` | `attachments/<app>/<file>` |

Metadata is set to `updatedby=ייבוא` and the file's modification time. An existing
blob is skipped and reported unless `--force`, so a re-run never overwrites the
team's work. Ids are kept, so attachment links inside the documents stay valid.
`spec_library.json` and `spec_projects.json` are not imported.

## Documentation

`docs/azure.md`: what the script creates and why, first deploy, redeploying, moving
to B1, importing, restoring a deleted project or an older version of one, and
turning a guest into a member if someone is wrongly refused.

## Testing

**Server** (`node:test`, alongside `tools/local-server/test/api.test.js`):

- One storage contract suite run against `storage-fs` in a temp folder, and against
  `storage-blob` when `AZURITE_URL` is set: round-trip, `412` on a stale version,
  create-only refuses an existing document, list reads names, delete, attachments.
- Routes: `428` without `If-Match` in cloud mode, `304` on a matching
  `If-None-Match`, `404` for unknown ids, id validation rejects `../`.
- Sign-in: no principal → redirect for pages and `401` for the API; `acct=1` and a
  missing `acct` → `403`; a member → name and email on `/api/me`.
- Cloud mode exits at startup without `WEBSITE_AUTH_ENABLED`.
- The cloud allowlist returns `404` for `/tools/…`, `/data/*.json` and `/package.json`.
- Legacy routes in local mode behave exactly as today.

**Client:**

- `tests/merge.test.js` requires `shared/merge.js`; all 13 existing assertions pass
  unchanged.
- New `tests/sync.test.js` with a fake `fetch`: one request in flight, queued saves
  collapse, `412` → merge → retry, give-up after five, `update` re-applies its
  function, `check` handles `304`.
- `tests/activity-log.test.js` covers the `by` field.

**Importer:** against `storage-fs` in a temp folder — the mapping, skip-existing,
`--force`.

**In the browser, locally:** two tabs on one project — edit different tasks in each
and see both survive; delete a task in one while the other edits it; the 60-second
merge with undo cleared; create and delete a project from `/`; a capture made while
a tab has the project open.

**After the first deploy (manual, in `docs/azure.md`):** sign in as a member;
`/api/me` shows the right name; a guest account is refused, if one exists; two
people edit one project at once; delete a project and restore it; restore an older
version of a project.

## Out of scope

- The spec creator, funday, the drawing app and `home_dashboard.html` on Azure.
- Live co-editing — changes arrive within about a minute, not as they are typed.
- Per-project permissions, read-only users, access for consultants.
- Moving the data into KkarcDB.
- Custom domain, staging slots, CI/CD — deployment is the script, run by hand.
- Cleaning up unreferenced attachments in Blob Storage (`tools/gc-attachments.js`
  stays local).

## To verify during implementation

1. **The name of the `acct` claim inside `X-MS-CLIENT-PRINCIPAL`** after Easy Auth's
   claims mapping — confirm on the first real sign-in through `/.auth/me`. The check
   fails closed if the name is wrong, so a mistake shows up as everyone refused.
2. **Easy Auth with a managed-identity federated credential** on a Linux F1 app
   configured from scratch — Microsoft documents it as a migration from a secret. If
   it cannot work, fall back to a client secret and record its expiry date in
   `docs/azure.md`.
3. **Free-plan availability** in Israel Central for this subscription.
4. **`az` CLI support for the cookie expiration settings**; otherwise set
   authsettingsV2 through `az rest`.
