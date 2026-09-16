# The KKarcDB Site — Front-End Roadmap

**Date:** 2026-09-16
**Branch:** `supabase-schema` (Database); a matching branch is still to be cut in KkarcDB
**Status:** roadmap — decomposes the front-end work into six pieces and records the
decisions that shape them.

Amends two earlier documents where noted:
[2026-09-07-project-hub-restructure-design.md](2026-09-07-project-hub-restructure-design.md)
and [2026-09-15-hub-on-kkarcdb-schema-design.md](2026-09-15-hub-on-kkarcdb-schema-design.md).
Neither is superseded; both remain the authority on their own subject.

## The goal

One website, served by `KKarcDB.Api` from a single origin, talking to the Supabase
database through `/api/*`. A member of the practice signs in with their work account,
lands on a home page showing the projects they are assigned to, opens one, and manages
its tasks, consultants, meetings and drawing issues. Administrators additionally reach
pages that edit the register itself — `project`, `person`, `firm` and the rest.

`project_hub.html` is the prototype of those working screens, built against
`localStorage` instead of a database. **The work is to keep its screens and replace what
sits behind them** — not to write a new front end.

## Vocabulary

Three different things have been called "hub" in conversation. They are not the same
thing, and this document uses none of them loosely:

| Term | What it means |
|---|---|
| `hub_task`, `hub_event`, `hub_meeting`, … | **A database table prefix, nothing more.** The schema spec adds 31 tables to KkarcDB's existing database and prefixes them `hub_` so they are distinguishable from KkarcDB's original tables inside the shared `public` schema. |
| `project_hub.html` | The prototype file in the Database repo: 684 KB, 1,218 lines, 2,487 hand-maintained `React.createElement` calls, no JSX source. |
| **The site** | The whole website. This is what is being built. It has pages, named below. |

From here: **the site**, and pages named for what they are.

## The pages

| Page | What it is | Comes from |
|---|---|---|
| **Sign-in** | Work account via Supabase Auth with Entra behind it; `person_identity` decides who is let in. Includes the *refused* screen for an account that authenticates but is not enrolled. | `web/src/components/SignIn.tsx` — kept as-is |
| **Home** | The entrance. An overview of project status: your projects first, all projects available. Cards, urgent tasks, upcoming milestones, the activity feed. | `home_dashboard.html` and `HomeView` in the prototype |
| **Project** | The working screens for one project: task lists, Gantt, the combined view, meetings, licensing goals and milestones, principles, consultants, team. | `project_hub.html` — the bulk of the work |
| **Planning board** | The building × consultant × document-type matrix and its status machine. | `planning_dashboard.html` |
| **Admin** | The register: projects, people, firms, participants, assignments, access states, and the editable vocabularies. | `web/src/components/PeopleView.tsx`, extended |

`protein_explorer.html` is a proteomics CSV viewer with no persistent state and is not
part of the site.

## Who may do what

| Action | Who |
|---|---|
| Sign in | `person_identity` has the subject — unchanged from KkarcDB today |
| **Read** any project | any enrolled staff member |
| **Edit** a project's work (tasks, events, meetings, plan cells) | staff with a `project_assignment` row on that project, or an admin |
| **Edit** the register (`project`, `person`, `firm`, `project_participant`, `project_assignment`, vocabularies) | `app_role = 'admin'` |
| Consultant or client sign-in | not yet — they remain records, as `CLAUDE.md` states |

Read is deliberately open across the practice: this is a ~25–30 person firm where hiding
a colleague's project would cost more than it protects. Editing is not, because
`hub_activity` records who changed what, and that record is only meaningful if the set of
people who could have made a change is small and known.

**The read rule is "you are staff."** `person.app_role` already distinguishes a staff
member from a contact, so when consultants become users they do not break this rule —
they are simply not staff, and their rule is added beside it rather than replacing it.

### Designing for consultant logins without building them

The schema spec deferred `hub_project_access` and was right to. Three constraints keep
that door open at no cost now, and they are requirements, not aspirations:

1. **The write check is one function in the API** — `MayEditProject(person, project)` or
   equivalent — never a condition repeated at each endpoint. Adding a second kind of
   caller then changes one function.
2. **Every `/api/hub/*` endpoint is scoped to a project from day one**, even while every
   staff member may read them all. An endpoint that returns "all tasks" has to be
   rewritten for a consultant; one that returns "this project's tasks" does not.
3. **`discipline_code` stays on `hub_task` and `hub_event`.** A consultant seeing only
   their own lane is then a `WHERE` clause, not a migration.

## The six pieces

```
0 data safety ──┐
   (ships now)  ├──▶ A decompile ──▶ B schema+ETL ──▶ C api+adapter ──┬──▶ D merge ──▶ E old views
                ┘                                                     └──▶ admin
```

| # | Piece | Spec | Plan | Repo |
|---|---|---|---|---|
| **0** | Data safety — JSON export, quota-error handling, attachments out of the blob | in the restructure spec's *Out of scope*, as work that must ship independently | Task 1 of the schema plan covers the export | Database |
| **A** | Decompile `project_hub.html` into reviewable TypeScript/JSX | [2026-09-07](2026-09-07-project-hub-restructure-design.md) ✅ | ❌ | Database → KkarcDB |
| **B** | Schema and ETL — migrations `008`–`012`, 31 tables, the import | [2026-09-15](2026-09-15-hub-on-kkarcdb-schema-design.md) ✅ | [2026-09-15](../plans/2026-09-15-hub-on-kkarcdb-schema.md) ✅, not executed | KkarcDB |
| **C** | `/api/hub/*` endpoints and the `localStorage` → `fetch` adapter; the sample data is deleted here | ❌ | ❌ | KkarcDB |
| **D** | The merge — one Vite app, Sign-in gates it, Admin route, Home and Project as pages | ❌ | ❌ | KkarcDB |
| **E** | Rebuild `ProjectsView` and `OutstandingView` as pages of the site | ❌ | ❌ | KkarcDB |

### Piece 0 waits for nothing, and everything waits for it

The ETL's input is an exported blob. **There is no export today.**
`planning_dashboard` has one; `project_hub` does not. Until it ships, one cleared cache
destroys the data every other piece is built on. It is small, it is independent, and it
goes first.

### Admin runs in parallel with D

The Admin page talks to KkarcDB's existing `/api/*` endpoints and to the vocabulary CRUD
the schema spec already promises to `app_role = 'admin'`. It does not talk to the
decompiled prototype. `PeopleView.tsx` works today; extending it to cover projects,
firms, participants and assignments does not wait for the JSX work.

### What "rebuild, not port" means for E

`ProjectsView` (139 lines) and `OutstandingView` (84 lines) each do two jobs, and the
jobs go to different places:

| Today | Becomes |
|---|---|
| `ProjectsView` — listing the register | Home's project cards, from `project` + `hub_project_profile` + counts over `hub_task` |
| `ProjectsView` — creating and editing a project | Admin |
| `OutstandingView` — who owes us an answer | A page of the site over `hub_event`, which is the same status machine |

Nothing is lost. `CLAUDE.md` names "which consultants owe us an answer" as the question
KkarcDB exists to answer, and `hub_event` is a strictly richer record of it than the
transmittal view has today: it carries rounds, followers, and the
`sent → response → comments → progress` cycle the practice actually runs.

## Decisions taken

| # | Decision | Why |
|---|---|---|
| 1 | **One Vite app.** The prototype's screens become the site; the React app is replaced, not joined to it. | After the decompile both are React 19 + TypeScript + Vite 8 + supabase-js + i18next. Two apps at one origin would mean two navigations, two i18n setups and two session handlers to keep in step. |
| 2 | **The site is built in `KkarcDB/web`**, which becomes an npm workspaces root: the SPA itself plus `packages/shared/`. | `Build-Bundle.ps1:66–89` already runs `npm run build` in `web/` and copies `web/dist/*` into `wwwroot`; `Deploy-Azure.ps1` ships that bundle. The front end living in a different repository from its own API would mean two checkouts to produce one artefact. |
| 3 | **`ProjectsView` and `OutstandingView` are rebuilt inside the site**, not carried across. | Their reading job belongs to Home and their writing job belongs to Admin. Porting them would preserve a split that the new pages remove. |
| 4 | **The decompile lands before the merge.** | Commit `e40db13` added one badge to a sidebar and produced a **250,053-character diff**. Every step of the merge would be unreviewable until this is fixed. |
| 5 | **Admin covers the register**, not only access granting: projects, people, firms, participants, assignments, and the vocabularies. | The site has no other way to create a project or engage a consultant. Without it those stay developer-only operations, and `STATUSES`, `PRIORITIES` and `DISCIPLINES` — user-editable lists in the prototype today — would regress. |
| 6 | **Multi-project: read all, edit one at a time.** | The schema spec already makes the data multi-project by `project_id`. Every cross-project *write* is a register write, and those live in Admin — so no working screen needs a project picker, and no cell needs to know which project it is in. |
| 7 | **Read is open to staff; editing a project's work requires a `project_assignment` row.** | The register already records who works on what. A second list of who may open what would drift from it. |
| 8 | **Consultants are not users yet**, but the three constraints above keep the door open. | `CLAUDE.md`: consultants and clients are records, not users, until v5. Building the second access model now would double the scope of C and D for no user. |
| 9 | **Sign-in is unchanged.** Supabase Auth with Entra behind it, `person_identity` decides. | Already built, already enrolled, already tested. The refused-sign-in flow and the four access states are among the better-worked parts of the existing application. |
| 10 | **Piece 0 ships independently and first.** | It is the only piece that addresses a risk that exists *today*. |
| 11 | **The sample data is deleted in piece C, with the adapter — not before.** | `makeDefaultData()` at `project_hub.html:759` is a single 46,425-character line of hand-written Hebrew demo tasks, subtasks and event chains; `PORTFOLIO_DATA`, `MY_PROJECTS`, `OFFICE_STAFF` and `MILESTONES_BY_PROJECT` feed the dashboard views, and `HomeView` hard-codes `userName='שי'` and `fullName='שי הרשקוביץ'`. Removing them before there is an API to fill the gap leaves a blank application that cannot be demonstrated or tested. The restructure spec's stage 5 already plans to convert them to JSON fixtures, which is the right intermediate state. |

## What these decisions change in the existing specs

Three amendments. Each should be read into the relevant spec rather than discovered
later during implementation.

### Restructure spec — the target layout moves

The spec places the monorepo in the Database repo:

```
Database/
├── apps/project-hub/
├── packages/shared/
```

It becomes:

```
KkarcDB/web/
├── index.html  vite.config.ts     one entry point, one bundle
├── src/
│   ├── auth/                      Sign-in, the refused screen, session handling
│   ├── pages/home/
│   ├── pages/project/             the decompiled prototype's views
│   ├── pages/planning/
│   ├── pages/admin/
│   ├── components/  lib/  styles/
└── packages/shared/               i18n, and the domain model after the DB migration
```

**One SPA, one entry point, one bundle** — decision 1. The restructure spec's `apps/`
directory was designed for several independently built HTML files; the site has one, so
its feature areas become directories under `src/` rather than workspace members.
`packages/shared/` survives as a workspace member because it holds code the build tools
and any future second artefact both consume.

Nothing about the decompile itself changes — the equivalence harness operates on a file,
and where its output lands is configuration, not proof. The `legacy/` copy kept for
diffing, the codemod, and the characterisation tests are unaffected.

### Schema spec — hosting

> Hosting: The three HTML pages are served from `KKarcDB.Api`'s `wwwroot`

They are not three HTML pages served alongside an existing application. They are the
application. One bundle, one `wwwroot`, one deployment — which is what that decision was
reaching for anyway.

### Schema spec — access

> Staff access is `person.app_role`, as in KkarcDB.

This becomes: **read** is `person.app_role` (any staff member), **write** additionally
requires a `project_assignment` row on the project, and **register writes** require
`app_role = 'admin'`. `hub_project_access` remains deliberately uncreated.

## Open items

- **`project_hub.html`'s history.** 125 of the Database repo's 174 commits touch it.
  Moving the decompiled result into KkarcDB either loses that history or needs a
  `git subtree` / `filter-repo` import. Decide before piece A's plan is written; the
  cheap option — keeping the Database repo as the archive and starting clean in
  KkarcDB — is defensible, but only if chosen rather than defaulted into.
- **The other agent in KkarcDB.** A Gemini CLI agent also commits to that repository. It
  is currently on `autodesk-bim360`, and the `supabase-schema` counterpart branch the
  schema plan expects has not been cut there. Confirm nothing is mid-flight before
  reshaping `web/`.
- **i18n.** The prototype translates Hebrew to English at runtime through `i18n.js` and
  `i18n-dict.js`; `web/` uses i18next with `locales/*.json`. The schema spec's `name_he`
  and `name_en` columns unblock the code/label catalogue that replaces the runtime
  approach. Which one the merged site uses is piece D's question, not this document's —
  but it must not be left to fall out by accident, because the extractor
  (`tools/i18n-extract.js`) breaks on JSX and the decompile produces 36,000 lines of it.
- **Attachments.** The schema spec puts bytes in a Supabase Storage bucket
  `hub-attachments`, with the API holding the service key. Piece 0 has to get them out of
  the `localStorage` blob before the ETL runs; the upload path is piece C's.

## Out of scope

- `protein_explorer` — no persistent state, not part of the site
- Realtime push, offline mode, per-row history beyond `hub_activity`
- Consultant and client logins — see the three constraints above
- Per-field permissions. Editing a project is one right, not a matrix
