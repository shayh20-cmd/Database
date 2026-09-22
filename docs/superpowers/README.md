# Where the active work lives

This directory holds the design and planning trail of **`project_hub.html` and the two
dashboards beside it** — the prototypes built in this repository.

**The work going forward happens in the KkarcDB repository** (`D:\Coding\KkarcDB`,
branch `web-app`). The dashboards are being rebuilt as KkarcDB's own front end, served
from `KKarcDB.Api`, backed by its database. Four documents moved there on 2026-09-16:

| Was here | Now |
|---|---|
| `specs/2026-09-16-hub-frontend-roadmap.md` | `KkarcDB/docs/specs/2026-09-16-web-app-roadmap.md` |
| `specs/2026-09-15-hub-on-kkarcdb-schema-design.md` | `KkarcDB/docs/specs/2026-09-15-project-schema-design.md` |
| `plans/2026-09-15-hub-on-kkarcdb-schema.md` | `KkarcDB/docs/plans/2026-09-15-project-schema.md` |
| `plans/2026-09-16-data-safety.md` | deleted — see *These prototypes are frozen*, below |

The `hub_` table prefix was dropped in the move, and the word "hub" retired: it had come
to mean a table prefix, this repository's prototype file, and the application being
built, and every conversation had to disambiguate it first. Start from the roadmap.

## These prototypes are frozen

**Do not enter real work into `project_hub.html` or `planning_dashboard.html`.**

They hold demo data only. On 2026-09-16 that was confirmed and acted on: the plan to
export their data before a cleared cache destroyed it, and the ETL that would have
imported it, were both deleted — about 4,600 lines of planned work, because there is
nothing to rescue. Git holds them if the premise turns out to be wrong.

That decision holds only while it stays true. **If anyone is about to start using one of
these for real, say so first** — the export has to exist before the data does, not after.
Their storage is a browser's `localStorage`, on one machine, with no backup and no
server.

## What stays here, and why

Everything else — the feature specs and plans for meetings, the Gantt, principles, the
sidebar, licensing tracks, the English translation, the protein explorer. They document
prototypes this repository contains, and they remain the **behaviour reference for the
rebuild**: read them to learn why a screen works the way it does. The seed data in
`project_hub.html`'s `makeDefaultData()` is a ready-made fixture for developing the new
site, and it is read from git rather than from anybody's browser.

`specs/2026-09-07-project-hub-restructure-design.md` also stays, carrying a superseded
banner. It is a design about a file that lives here.
