# The KKarcDB Site — Front-End Roadmap

**Date:** 2026-09-16 (revised the same day — see *Revision*, below)
**Branch:** `supabase-schema` (Database); a matching branch is still to be cut in KkarcDB
**Status:** roadmap — decomposes the work into four pieces and records the decisions
that shape them.

**Supersedes** [2026-09-07-project-hub-restructure-design.md](2026-09-07-project-hub-restructure-design.md).
**Amends** [2026-09-15-hub-on-kkarcdb-schema-design.md](2026-09-15-hub-on-kkarcdb-schema-design.md),
whose table map is additionally now under review — see *The schema is re-derived*, below.

## Revision

This document first said the prototype's compiled source would be decompiled into
reviewable JSX and carried into the new application. **It will not be.** The site is
built fresh, with `project_hub.html` as a reference prototype rather than a source. That
retires one whole piece of work and the spec describing it, and it changes what the
database has to look like — the earlier table map was derived from the prototype's
storage format, and nothing requires that shape any more.

## The goal

One website, served by `KKarcDB.Api` from a single origin, talking to the Supabase
database through `/api/*`. A member of the practice signs in with their work account,
lands on a home page showing the projects they are assigned to, opens one, and manages
its tasks, consultants, meetings and drawing issues. Administrators additionally reach
pages that edit the register itself — `project`, `person`, `firm` and the rest.

`project_hub.html` is a working prototype of those screens, built against `localStorage`.
**It is the specification of the behaviour, not the source of the implementation.** Read
it to learn what a screen does; write the screen fresh against the API.

## Vocabulary

Three different things have been called "hub" in conversation. They are not the same
thing, and this document uses none of them loosely:

| Term | What it means |
|---|---|
| `hub_task`, `hub_event`, `hub_meeting`, … | **A database table prefix, nothing more.** The schema design adds tables to KkarcDB's existing database and prefixes them `hub_` so they are distinguishable from KkarcDB's original tables inside the shared `public` schema. |
| `project_hub.html` | The prototype file in the Database repo: 684 KB, 1,218 lines, 2,487 hand-maintained `React.createElement` calls, no JSX source. |
| **The site** | The whole website. This is what is being built. It has pages, named below. |

From here: **the site**, and pages named for what they are.

## The pages

| Page | What it is | Its reference |
|---|---|---|
| **Sign-in** | Work account via Supabase Auth with Entra behind it; `person_identity` decides who is let in. Includes the *refused* screen for an account that authenticates but is not enrolled. | `web/src/components/SignIn.tsx` — this one is **kept as-is**, not rebuilt |
| **Home** | The entrance. An overview of project status: your projects first, all projects available. Cards, urgent tasks, upcoming milestones, the activity feed. | `home_dashboard.html`, and `HomeView` in the prototype |
| **Project** | The working screens for one project: task lists, Gantt, the combined view, meetings, licensing goals and milestones, principles, consultants, team. | `project_hub.html` — the bulk of the rebuild |
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
a colleague's project would cost more than it protects. Editing is not, because the
activity record is only meaningful if the set of people who could have made a change is
small and known.

**The read rule is "you are staff."** `person.app_role` already distinguishes a staff
member from a contact, so when consultants become users they do not break this rule —
they are simply not staff, and their rule is added beside it rather than replacing it.

### Designing for consultant logins without building them

The schema design deferred `hub_project_access` and was right to. Three constraints keep
that door open at no cost now, and they are requirements, not aspirations:

1. **The write check is one function in the API** — `MayEditProject(person, project)` or
   equivalent — never a condition repeated at each endpoint. Adding a second kind of
   caller then changes one function.
2. **Every `/api/hub/*` endpoint is scoped to a project from day one**, even while every
   staff member may read them all. An endpoint that returns "all tasks" has to be
   rewritten for a consultant; one that returns "this project's tasks" does not.
3. **Discipline stays on the work items and their events.** A consultant seeing only
   their own lane is then a `WHERE` clause, not a migration.

## The four pieces

```
0 data safety ──▶ A schema + ETL ──▶ B api ──▶ C the site
   (ships now)                                  └─▶ admin
```

| # | Piece | Spec | Plan | Repo |
|---|---|---|---|---|
| **0** | Data safety — export, restore, quota guard, attachments lifted out of the export | folded into the plan | [2026-09-16-data-safety.md](../plans/2026-09-16-data-safety.md) ✅ | Database |
| **A** | Schema and ETL — the tables, the migrations, and the import of the exported blobs | [2026-09-15](2026-09-15-hub-on-kkarcdb-schema-design.md) ⚠️ **table map under review** | [2026-09-15](../plans/2026-09-15-hub-on-kkarcdb-schema.md) ⚠️ **assumes the current 31 tables** | KkarcDB |
| **B** | `/api/*` endpoints for the site, and the access rules above | ❌ | ❌ | KkarcDB |
| **C** | The site — Home, Project, Planning board, Admin, and the two views the React app has today | ❌ | ❌ | KkarcDB |

### Piece 0 waits for nothing, and everything waits for it

The ETL's input is an exported blob. **There is no export today.** `planning_dashboard`
has one; `project_hub` does not. Until it ships, one cleared cache destroys the data
every other piece is built on. It is small, it is independent, and it goes first.

**Piece 0 is also the only work in this roadmap that touches `project_hub.html`** — by
exactly one line, because the data lives in that application's `localStorage` and a new
site at a different origin cannot reach it.

### Admin runs in parallel with C

The Admin page talks to KkarcDB's existing `/api/*` endpoints and to the vocabulary CRUD
promised to `app_role = 'admin'`. `PeopleView.tsx` works today; extending it to cover
projects, firms, participants and assignments does not wait for the rest of the site.

### The two views the React app has today

`ProjectsView` (139 lines) and `OutstandingView` (84 lines) each do two jobs, and the
jobs go to different pages:

| Today | Becomes |
|---|---|
| `ProjectsView` — listing the register | Home's project cards |
| `ProjectsView` — creating and editing a project | Admin |
| `OutstandingView` — who owes us an answer | A page of the site over the shared event log |

Nothing is lost. `CLAUDE.md` names "which consultants owe us an answer" as the question
KkarcDB exists to answer, and the event log is a strictly richer record of it than the
transmittal view has today: it carries rounds, followers, and the
`sent → response → comments → progress` cycle the practice actually runs.

## Decisions taken

| # | Decision | Why |
|---|---|---|
| 1 | **The site is rebuilt, not ported.** `project_hub.html` is a reference for behaviour and layout; no line of it is carried into the new application. | The prototype is compiled output with no JSX source, written against a `localStorage` blob. Decompiling it would have produced 36,000 lines shaped by that blob and by four years of accumulated prototype decisions, all of which would then have to be unpicked to reach the API. Rebuilding costs more up front and is designed for the database instead of around it. |
| 2 | **The site is built in `KkarcDB/web`**, which becomes an npm workspaces root: the SPA itself plus `packages/shared/`. | `Build-Bundle.ps1:66–89` already runs `npm run build` in `web/` and copies `web/dist/*` into `wwwroot`; `Deploy-Azure.ps1` ships that bundle. The front end living in a different repository from its own API would mean two checkouts to produce one artefact. |
| 3 | **One SPA, one entry point, one bundle.** Feature areas are directories under `src/`, not separate builds. | There is one artefact to deploy. Several independently built HTML files is what the site is replacing. |
| 4 | **`ProjectsView` and `OutstandingView` are rebuilt inside the site**, not carried across. | Their reading job belongs to Home and their writing job belongs to Admin. Porting them would preserve a split that the new pages remove. |
| 5 | **The schema is re-derived from the domain before any migration is written.** | The existing table map was derived from the prototype's storage format — there is a section in that document titled "What the front end actually stores", and the tables follow it row by row. `hub_sheet` exists because `sheets[]` exists. Decision 1 removes that constraint, and a shape chosen to mirror a `localStorage` blob should not be carved into migrations by default. |
| 6 | **Admin covers the register**, not only access granting: projects, people, firms, participants, assignments, and the vocabularies. | The site has no other way to create a project or engage a consultant. Without it those stay developer-only operations, and the status, priority and discipline lists — user-editable in the prototype today — would regress. |
| 7 | **Multi-project: read all, edit one at a time.** | Every cross-project *write* is a register write, and those live in Admin — so no working screen needs a project picker, and no cell needs to know which project it is in. |
| 8 | **Read is open to staff; editing a project's work requires a `project_assignment` row.** | The register already records who works on what. A second list of who may open what would drift from it. |
| 9 | **Consultants are not users yet**, but the three constraints above keep the door open. | `CLAUDE.md`: consultants and clients are records, not users, until v5. Building the second access model now would double the scope of B and C for no user. |
| 10 | **Sign-in is unchanged.** Supabase Auth with Entra behind it, `person_identity` decides. It is the one part of the existing React app kept rather than rebuilt. | Already built, already enrolled, already tested. The refused-sign-in flow and the four access states are among the better-worked parts of the existing application. |
| 11 | **Piece 0 ships independently and first, and is the only work that touches `project_hub.html`.** | It is the only piece addressing a risk that exists *today*, and the data it rescues sits in that application's storage. Its one-line change is disposable scaffolding on a file being retired. |
| 12 | **Attachments are `file` rows pointing at the firm's own storage**, never bytes in the database. | `db/migrations/002_files.sql` opens with the rule the schema design had broken: "The database holds metadata and pointers. Bytes stay in SharePoint, BIM 360/ACC, or on the drives they are already on." An attachment is a file like any other; a second, parallel storage model would mean two answers to "where is this file?" and only one of them indexed. |

## What these decisions change in the existing specs

### The restructure spec is superseded

[2026-09-07-project-hub-restructure-design.md](2026-09-07-project-hub-restructure-design.md)
exists to solve one problem: changes to `project_hub.html` cannot be reviewed, because
adding a badge produced a 250,053-character diff. Decision 1 means nothing is ever
changed there again, so the problem does not arise. The decompile, the equivalence
harness, the `apps/` monorepo layout and the stage-5 decomposition are all retired.

**One thing is worth keeping, informally.** A throwaway decompile is still the cheapest
way to *read* the prototype while rebuilding: 36,000 lines of formatted JSX is far easier
to learn behaviour from than 1,218 lines of minified `createElement`. It goes in a
scratch folder, carries no harness, is not committed, and nobody maintains it.

### The schema design: hosting

> Hosting: The three HTML pages are served from `KKarcDB.Api`'s `wwwroot`

They are not three HTML pages served alongside an existing application. They are the
application. One bundle, one `wwwroot`, one deployment.

### The schema design: access

> Staff access is `person.app_role`, as in KkarcDB.

This becomes: **read** is `person.app_role` (any staff member), **write** additionally
requires a `project_assignment` row on the project, and **register writes** require
`app_role = 'admin'`. `hub_project_access` remains deliberately uncreated.

### The schema design: attachments

Corrected by decision 12. The change to that document is task 4 of the data-safety plan
and has not been applied yet.

### The schema design: the table map is under review

Decision 5. The 31 tables were a faithful rendering of the prototype's storage; they are
now a first draft to be compared against a design derived from the practice's actual
work. Candidates already visible:

| Candidate | Note |
|---|---|
| `hub_task` + `hub_subtask` → one self-referencing item table | They share title, done, discipline, status, priority, dates, principle flag and ordering. KkarcDB's `stage` is already a self-referencing tree, and the subtask cycle triggers were specified to copy it. Collapses the event log's "exactly one of three foreign keys" constraint too. |
| `hub_plan_building` + `hub_plan_doc_type` → one axis table | Identical columns. Rows and columns of the same matrix. |
| `hub_licensing_goal` + `hub_licensing_milestone` → one table with a kind | Near-identical: project, title, date, done, source, ordering. |
| `hub_project_blocker` | Both its sources are hard-coded sample data. Is a blocker a thing, or a flag on an item? |
| `hub_discipline_hours` | Two integers per discipline per project. |
| `hub_task_lane` | Derivable by grouping child items on discipline? |
| `hub_field` and its `field_values` | User-defined columns — a prototype feature the rebuild may deliberately not carry. |
| `hub_sheet` vs `hub_project_track` | Two levels of grouping above the work. Does the second earn its keep? |

**The four vocabularies stay separate.** Folding them into one `hub_vocabulary(kind, …)`
is the one-true-lookup-table antipattern: it trades a real foreign key for a check
constraint and a convention. Four small tables is the boring correct answer.

The [schema implementation plan](../plans/2026-09-15-hub-on-kkarcdb-schema.md) assumes
the current 31 and will need reworking to match whatever the review concludes. That is
cheap now and expensive once migrations have run against real data.

## Open items

- **The schema review itself** — decision 5. It is the next piece of work, and piece A
  cannot start without it.
- **Which storage location attachments land in.** They are `file` rows, so the *model* is
  settled; the `storage_location` row they point at is not. SharePoint is the likely
  answer and needs the Graph app registration `CLAUDE.md` names as the long-lead item.
  Until it exists, an attachment can be a `file` row with a `local_drive` instance, which
  is honest — `storage_is_reachable()` already reports such a file as index-only rather
  than openable.
- **The other agent in KkarcDB.** A Gemini CLI agent also commits to that repository. It
  is currently on `autodesk-bim360`, and the `supabase-schema` counterpart branch the
  schema plan expects has not been cut there. Confirm nothing is mid-flight before
  reshaping `web/`.
- **i18n.** The prototype translates Hebrew to English at runtime through `i18n.js` and
  `i18n-dict.js`; `web/` uses i18next with `locales/*.json`. A rebuilt site has no reason
  to carry the runtime approach — i18next with a proper catalogue is the obvious answer,
  and the schema's `name_he` / `name_en` columns cover the data side. Confirm when piece C
  is specced.
- **What the rebuild deliberately drops.** The prototype accumulated features across 125
  commits, and some of them — user-defined columns, the template hierarchy editor, saved
  view definitions — may not be worth carrying. Piece C's spec should name what is *not*
  being rebuilt, explicitly, rather than letting it be discovered by omission.

## Out of scope

- `protein_explorer` — no persistent state, not part of the site
- Realtime push, offline mode, per-row change history beyond the activity log
- Consultant and client logins — see the three constraints above
- Per-field permissions. Editing a project is one right, not a matrix
- Any further change to `project_hub.html` beyond piece 0's single line
