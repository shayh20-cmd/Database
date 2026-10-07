# Project Hub reads the register — design

> Decisions 1 and 4 are partly reversed for people and firms by `2026-10-07-settings-consultants-firms-design.md`: Settings now edits the register's consultants and firms.

**Date:** 2026-10-04
**Status:** agreed with Daniel on 2026-10-04, section by section. Not yet planned.

`project_hub_01.html` (the live hub at `https://kkarc-hub.azurewebsites.net`) keeps its own
copy of every project in JSON files on its own server. The firm's real register of projects,
firms, people and disciplines is KKarcDB's PostgreSQL on Supabase, reached only through
`KKarcDB.Api` (`https://kkarcdb.azurewebsites.net`). This design connects the two, **read-only**:
the hub shows a project's register details, and the register's consultants replace the hub's
own consultant list.

It is a first step toward KK Hub's project #3 ("The Project Hub — tasks, schedules and
contacts, kept in the register through the API", KKarcHub
`docs/superpowers/specs/2026-09-29-hub-platform-design.md`). Signing in to the register from
the browser is the plumbing that project needs anyway.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What does "connected" cover? | **Read-only.** The hub shows register data and never writes to the register. Edits happen in KK Hub |
| 2 | How does the hub reach the register? | **The browser signs in to Supabase with Microsoft and calls `KKarcDB.Api` with that token** — KK Hub's own path. Not a hub-server relay, not a direct database connection: both would bypass the API's rules |
| 3 | How does a hub project find its register project? | **By its code, automatically; a picker when that is not exactly one match.** The link is saved in the project's data |
| 4 | The hub's consultants | **Replaced by the register's**, read-only. Adding or editing a consultant happens in KK Hub |
| 5 | The hub's existing consultants and tender boards | **Demo data only** (confirmed by Daniel). No migration; `data.consultants` is simply no longer used |
| 6 | Disciplines | **The hub keeps its own codes** (tasks and tender rows use them), each mapped to a register discipline (§5) |

## 1. Connection and sign-in

**Settings.** The hub's Node server (`tools/local-server/server.js`) reads four new settings —
app settings in Azure, environment variables locally:

| Setting | Value | Secret? |
|---|---|---|
| `KK_SUPABASE_URL` | The Supabase project URL — the same value as KKarcHub's repository variable | No |
| `KK_SUPABASE_ANON_KEY` | The Supabase anon (publishable) key — the same as KKarcHub's | No, public by design |
| `KKARCDB_API` | `https://kkarcdb.azurewebsites.net` | No |
| `KK_HUB_URL` | KK Hub's site, `https://icy-sky-0b0e54f0f.6.azurestaticapps.net` | No |

A new endpoint, **`GET /api/register-config`**, returns them as
`{ supabaseUrl, supabaseAnonKey, api, hubUrl }`, each `null` when unset. In cloud mode it sits
behind Easy Auth like every other route. When any of the first three is `null`, the register
is **not configured**: the hub shows no register features beyond a one-line notice where
consultants would be (§6).

**supabase-js** is served from the site itself, as React is since `6d8e532`: the UMD build of
`@supabase/supabase-js@2.112.4` (the version KK Hub pins) copied to
`supabase-js-2.112.4.min.js` at the root, cached for a year like the React files, and added to
the files `Deploy-Azure.ps1` ships.

**Signing in** mirrors KKarcHub's `shell/src/auth.ts`:

- `createClient(url, anonKey, { auth: { flowType: 'pkce' } })`; the session lives in this
  browser's `localStorage`, so it happens once per browser, not per visit.
- `signInWithOAuth({ provider: 'azure', options: { scopes: 'openid profile email', redirectTo } })`,
  where `redirectTo` is the hub page's own address. The address that was open (its query) is
  kept in `sessionStorage` and put back after the return; a `code` parameter is removed from
  the address once exchanged.
- Sign-in is **never forced on load**. The hub works fully without the register; a "Connect to
  the register" button appears only where register data would show.
- A `401` from the API triggers one `refreshSession()` and one retry before the hub treats it
  as refused.

**Calls** are `GET` only, to `KKARCDB_API`, with `Authorization: Bearer <access token>`. The
hub contains no code that sends anything else to the register.

## 2. Linking a hub project to a register project

The two number projects differently. Hub codes are four letters (`BEER`, `HRZL`). The
register's identity is `year-sequence` (`2017-03`), plus optional four-letter `initials` that
are not unique.

- The link is **`registerProjectId`** (the register's project uuid) at the top level of the
  hub project's data. It is saved through the hub's normal versioned save, so every user
  shares it.
- **Automatic match.** When a project opens unlinked and the person is signed in, the hub calls
  `GET /api/projects?q=<code>&limit=20` (which searches name, code and initials) and keeps the
  candidates whose `initials` or `code` equals the hub code, ignoring case. Exactly one →
  linked and saved. None or several → no link.
- **Picker.** An unlinked project shows "Link to the register" on its General tab: a search
  box over `/api/projects?q=`, listing code, initials, Hebrew name and status. Choosing one
  saves the link.
- **Unlink** sits beside the linked project's code and clears `registerProjectId`.
- Anyone who may edit the hub project may link or unlink it; linking changes only the hub's
  data, never the register.

## 3. Project details

A read-only **"From the register"** block on the project's General tab, from
`GET /api/projects/{registerProjectId}`:

- code and initials, `nameHe` and `name`, status (in Hebrew: פעיל, הצעה, לא פעיל, הסתיים,
  בוטל), client, address, area (`areaM2`), end year, permit date, Tofes 4 date;
- costs (predicted, evaluated, contractor, real) only when the API returns `costs` — it does
  for managers and administrators, and sends `null` to everyone else;
- **"Open in KK Hub"**, linking to `${hubUrl}/database/?open=<registerProjectId>`, where the
  details are edited.

The hub's own `projectInfo` fields (description, phase, custom fields) are unchanged and stay
editable.

## 4. Consultants

The register's list **replaces** the hub's. It is built in the browser from four reads:

| Read | Gives |
|---|---|
| `GET /api/projects/{id}` → `members` | `{ personId, name, firmName, isStaff }` for everyone on the project |
| `GET /api/persons` | `firmId`, `email`, `phone`, `mobile`, `tags` per person |
| `GET /api/firms` | `name`, `nameHe`, `tags` per firm — `tags.discipline` is the firm's disciplines |
| `GET /api/tags` | each discipline's `name_he` / `name_en` |

**Building the rows** (a pure function, tested):

1. Take the members with `isStaff = false`.
2. A member's disciplines are their firm's `tags.discipline`; for someone without a firm, their
   own `tags.discipline`.
3. One row per (firm, discipline) — a firm with two disciplines appears twice — in the hub's
   existing row shape: `{ id, discCode, discipline, firm, firmId, registerDiscipline, contacts }`.
   `contacts` are `{ personId, name, mobile, phone, email }`. `discCode` is the hub discipline
   mapped from `registerDiscipline` (§5), or `null` when the hub has none.
4. Members whose firm and self carry no discipline form one row per firm under **"ללא תחום"**,
   so nobody on the project disappears.
5. Order: by the hub's discipline order, then unmapped disciplines in the register's order,
   then "ללא תחום".

The register has no "lead contact", so the hub's `isLead` is not shown.

**What changes in the page:**

- `ContactsView`'s consultants table shows these rows read-only. Its add, edit and delete
  controls are removed; the table's header gets **"Edit in KK Hub"**
  (`${hubUrl}/database/?open=<registerProjectId>`).
- Everything else that read `data.consultants` reads these rows instead: the tender matrix's
  and tender Gantt's office names (`officeDirectory`, matched on `discCode` as today), the
  people list built from team and consultants, and the overview.
- `data.consultants` is no longer read or written, and new projects and templates stop
  creating it. Values in existing files are left as they are, inert.
- The hub's own team (`data.team`) and external contacts (`data.externalContacts`) are not part
  of this design and stay as they are.

## 5. Disciplines

The hub's discipline codes stay — tasks, the Gantt's colour-by-discipline and tender rows all
use them. A constant map ties each to a register discipline:

| Hub | Register | Note |
|---|---|---|
| ARCH | `architecture` | |
| STRC | `structural` | |
| ELEC | `electrical` | |
| PLUM | `plumbing` | |
| HVAC | `hvac` | |
| LAND | `landscape` | |
| SAFE | `safety` | |
| **FIRE** | `fire` | **New hub discipline** (כבאות), added to `DISCIPLINES` with `--disc-FIRE` and `--disc-FIRE-bg` in both themes |
| ACSS | `accessibility` | |
| TRAF | `traffic` | |
| GR | `green` | |
| HYDR | `hydrology` | |
| LIFT | `elevators` | |
| AGRO | `agronomy` | |
| ENVI | `environment` | |
| PM | `project_mgmt` | |
| TNDR | `tender` | **The register has no such discipline yet** — added from KK Hub's Setup (§8) |

`safety` and `fire` were checked against the live register on 2026-10-04: both exist, among
52 discipline tags, and nothing tender-like does.

The map is keyed by hub code, so a project that edited its own `data.disciplines` list still
maps every code it kept. A discipline a project added itself has no register counterpart and
receives no register consultants.

## 6. When the register cannot answer

The hub keeps working and says why — in the consultants table and in the "From the register"
block:

| State | Shown |
|---|---|
| Not configured (§1) | "The register isn't set up for this site" — no buttons |
| Not signed in | **Connect to the register** |
| Refused — `401` after one refresh, or `403` | "Not registered for KKarcDB", with the token's subject (`sub`) to give an administrator, as KK Hub shows it |
| Unreachable, or `5xx` | "The register isn't answering", with **Retry** |
| Linked project not found (`404`: deleted or merged) | The link shown as broken, with the picker to relink |
| Unlinked | **Link to the register** (§2) |

Tender office names stay blank until register data has arrived.

## 7. Freshness

Register data is fetched when a project opens and held in memory for the visit. `persons`,
`firms` and `tags` are fetched once per page load and shared across projects. When the window
regains focus and the data is more than five minutes old, it is fetched again. Nothing from the
register is written to the hub's files — only `registerProjectId`.

## 8. Changes outside this repository

All configuration; no KKarcDB or KKarcHub code changes.

1. **KKarcDB.Api** — add `https://kkarc-hub.azurewebsites.net` to `KKARCDB_ALLOWED_ORIGINS`
   (comma-separated; today it lists only KK Hub's site). In `D:\Coding\KkarcDB\env.ps1`, then
   that repository's `Deploy-Azure.ps1`, or as an app setting on the API directly.
2. **Supabase Auth → URL Configuration → Redirect URLs** — add
   `https://kkarc-hub.azurewebsites.net/**`.
3. **KK Hub → Setup → Disciplines** — add *Tender* / *מכרזים*, and confirm the code it gets is
   `tender` (codes are generated from the name; if it differs, the §5 map follows it).
4. **Development only, optional** — for the browser check against the live API from a local
   server, add `http://localhost:3000` to both lists above. Remove it afterwards if preferred.

Hub users must already be enrolled in the register (`person_identity`). Staff who use KK Hub
are; anyone else sees "Not registered" (§6).

## 9. Testing

- **Pure functions**, mirrored into `tests/register-link.test.js` in the style of the existing
  `tests/*.test.js` (dependency-free, `node tests/register-link.test.js`):
  - code matching — by initials, by `year-sequence`, case, none, several;
  - building consultant rows — multiple disciplines per firm, a person without a firm,
    members with no discipline, staff excluded, ordering, unmapped disciplines;
  - the discipline map, including FIRE and TNDR.
- **Server:** `/api/register-config` in `tools/local-server/test/` — values present, values
  absent, behind the cloud-mode gate.
- **End to end** in the browser preview against the live API (needs §8.4): sign in, link a real
  project automatically and by the picker, see its details and consultants, see a tender
  board's office names, sign out and see the "Connect" state, and an unenrolled account's
  "Not registered" state.

## 10. Rollout

1. Merge the latest `feat/profile-and-entra-login` into master first. shayh20 commits to
   `project_hub_01.html` there several times a day; edits to the page are kept small and
   self-contained to keep merges clean.
2. Build on branch `feat/register-link` (worktree `.worktrees/register-link`), and open a PR.
3. Daniel makes the §8 changes.
4. Set the four app settings on `kkarc-hub` (`Deploy-Azure.ps1` gains them) and deploy with
   `-CodeOnly`.

## Not in this design

- Writing to the register from the hub — projects, consultants, members or tags.
- The hub's team, external contacts and client contacts coming from the register.
- Moving the hub into KK Hub's site, or replacing its storage with the register (KK Hub
  project #3 in full).
- Replacing Easy Auth: the hub keeps its own Entra sign-in, and the register sign-in is
  separate.
- Offline copies of register data.
