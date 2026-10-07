# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language: the whole website is bilingual, English and Hebrew

Every piece of UI text must exist in both English and Hebrew. When the user writes UI text
in English, supply the Hebrew; when they write it in Hebrew, supply the English. Never ship
a label, message, tooltip or placeholder in one language only.

How that maps onto the code today:

- Hebrew is the source language. Literals in the HTML stay Hebrew, and the English goes into
  `i18n-dict.js` as a `"Hebrew": "English"` entry, appended to the last `Object.assign` chunk.
  Do not put English into the HTML files of pages that load `i18n.js`.
- If the user gave the English, translate it to Hebrew for the source and use their English
  as the dictionary value.
- `node tools/i18n-extract.js` lists Hebrew that would still render untranslated. Run it
  after adding text.
- `i18n.js` matches by **substring**, so a single Hebrew letter or a fragment that occurs
  inside other words must never become a key. A key only matches inside a longer string when
  it starts and ends with a Hebrew letter (the engine refuses a match with Hebrew right next
  to it), so give a fragment like `"השינוי נשמר"` its own key rather than `"השינוי נשמר — "`.
- Text built in code never reaches the page pass — native dialogs, initials, a number in the
  middle of a sentence, a Hebrew prefix glued to a name. In `project_hub_01.html` it goes
  through `tx()` (i18n.js's `I18N.t`): `tx('לפני {m} ד׳', { m })` translates the whole
  template from the dictionary, then fills the `{slots}`, so the English can reorder them
  (`"לפני {m} ד׳": "{m} min ago"`). Hebrew output is unchanged.
- User-entered data (task titles, project names, notes) is never translated: containers
  matching `USER_DATA_SEL` in `i18n.js`, or carrying `data-i18n-skip`. A new component that
  renders stored data needs one of the two. Data inside a sentence (a tooltip, a toast, a
  confirmation) goes through `asTyped()`, which in English wraps it in invisible U+2068/U+2069
  isolate marks that the engine leaves alone. Structure names that ship with Hebrew defaults
  (tracks, stages, boards, built-in fields, the office roster) go through `nameForLang()` /
  `nameIn()`: English when the dictionary knows the whole name, as typed otherwise.
- Switching language also flips `dir` (RTL ⇄ LTR). Use logical CSS (`inset-inline-start`,
  `margin-inline-end`, `text-align: start`) rather than left/right, and check both directions.
- Only `project_hub_01.html`, `project_hub.html`, `planning_dashboard.html` and
  `home_dashboard.html` load `i18n.js`. `login.html` is served before sign-in, when
  `i18n-dict.js` isn't, so it carries its own few strings (`HE_EN` in its script) and follows
  `appLang`; add both languages there. `capture.html`, `site_note.html` and the spec creator
  are Hebrew-only and need the same treatment when their text changes.

## What is live and what is frozen

- `project_hub_01.html` is the active app. It is deployed to Azure
  (`https://kkarc-hub.azurewebsites.net`) behind Microsoft sign-in, and recent work lands here.
- `project_hub.html` and `planning_dashboard.html` are frozen prototypes holding demo data
  only (`docs/superpowers/README.md`). Their `makeDefaultData()` seed is a fixture for the
  rebuild. `project_hub.en.html` is a generated English copy of `project_hub.html`
  (`tools/english-copy/README.md`); don't hand-edit it.
- The long-term rebuild of these dashboards happens in the KkarcDB repository
  (`D:\Coding\KkarcDB`, branch `web-app`), not here.
- `docs/superpowers/specs/` and `plans/` (date-prefixed) are the design trail and the
  behaviour reference for why a screen works the way it does.

## Architecture

**No build step.** Each page is one self-contained HTML file. The React code is
Babel-*compiled* output (`/*#__PURE__*/React.createElement(...)`), not JSX, and is edited in
that form; write new UI as `React.createElement` calls too. Lines are extremely long (the
whole `App` component is one line) and `project_hub_01.html` is ~1.3 MB: locate code with
Grep and edit by unique string, never read the file whole.

Vendored libraries are served from the site root by absolute path (`/react-18.3.1.min.js`,
`/react-dom-18.3.1.min.js`, `/supabase-js-2.112.4.min.js`), so pages must be opened through
the local server, not `file://`.

**Server — `tools/local-server/server.js`.** One Node server, static files plus JSON
persistence, in two modes:

- `SITE_MODE=local` (default): serves everything under the root, documents in `data/`
  (gitignored), user from `LOCAL_USER_NAME`.
- `SITE_MODE=cloud` (Azure App Service): serves pages only, documents in `DATA_DIR`
  (`/home/data`), user from Easy Auth's `X-MS-CLIENT-PRINCIPAL`; unauthenticated page
  requests redirect to `login.html`, API calls get 401. It refuses to start in cloud mode
  unless `WEBSITE_AUTH_ENABLED` is true. The process must never exit (the free tier's restart
  quota disables the site), so startup problems surface on `/health` instead.

Each app's document is one JSON file, keyed in the `APPS` map and served at `/api/<app>`
(`project-hub-01`, `planning-dashboard`, `spec-library`, `hub-projects`, …). Saves send
`If-Match` with the version they started from; a stale save gets 412 and the page re-reads,
merges three ways and retries. Open tabs re-check the document every 30 seconds and on
focus, and merge other people's saves. `/api/version` is the deployed page's version (size
and mtime of `project_hub_01.html`), used to offer a refresh after a deploy. Other routes: `/api/upload/<app>` and `/data/attachments/…` (attachments), `/api/hub-project/<id>`,
`/api/projects`, `/api/personal`, `/api/me`, `/api/register-config`, `/api/snip` (local only).

**The register.** `register-link.js` is the client for KKarcDB.Api (KKarcDB on Supabase), signed
in with a Supabase token. `register-link-ui.js` renders the facts card, the consultants table and
the link picker inside a project, all read-only, and holds the shared register store.
`register-directory-ui.js` renders Settings → Consultants and Firms, which **write** the
register's consultants and firms (Kind = consultant) through the API's own endpoints. The
register's role decides who may edit there: editor, manager or admin. Its four app settings and
the outside changes it depends on are in `docs/azure.md`.

**Other parts of the repo:**

- `funday/` — separate Firebase app (ES modules, own `package.json` and tests).
- `tools/spec-creator/lib/` — pure logic for `spec_creator.html`; `tools/spec-seed/` — Python
  parser that seeds `data/spec_library.json` from a .docx.
- `tools/quick-access/` — Windows installer and Chrome extension for the hub's quick-capture
  window. `*.cmd` files must keep CRLF (`.gitattributes`).
- `site_note.html` is published by GitHub Pages from the `site-note` branch; `index.html`
  redirects to it. The `deploy-pages.yml` run on `master` fails on environment protection,
  which is expected.

## Commands

Run the hub locally (port 3000 by default):

```bash
node tools/local-server/server.js . --port 3000
```

Install the server's one dependency first: `cd tools/local-server && npm install`.
`.claude/launch.json` has preview configs (`project-hub`, `planning-dashboard`,
`spec-creator`, `funday`) with repo-relative paths, so it works on any machine; keep it that way.

Tests use `node:test`. Node 24 needs glob patterns, not bare directories:

```bash
node --test "tests/*.test.js" "tools/spec-creator/test/*.test.js"
```

```bash
cd tools/local-server && node --test "test/*.test.js"
```

```bash
node tools/i18n-extract.test.js
```

```bash
cd funday && npm test
```

```bash
python -m unittest tools/spec-seed/test_reference.py tools/spec-seed/test_parser.py tools/spec-seed/test_seed_output.py
```

Run one file with `node --test tests/merge.test.js`, or one test with
`--test-name-pattern="<name>"`.

Most files in `tests/` are **mirrors**: they copy pure functions out of
`project_hub_01.html` or `capture.html` (marked `MIRROR … keep in sync`) because the HTML
can't be `require`d. When you change one of those functions in the page, update its copy in
the test, or the test keeps passing against stale code. `register-link.test.js` and
`gc-attachments.test.js` load the real modules.

Deploy to Azure (PowerShell 7, `az login` done):

```powershell
.\Deploy-Azure.ps1 -Name kkarc-hub -CodeOnly
```

`-CodeOnly` redeploys page and server without touching configuration. Every configuration
write restarts the app, and the free tier allows 15 restarts an hour before Azure disables
the site, so batch configuration changes. Logs: `az webapp log tail --name kkarc-hub --resource-group project-hub`.
