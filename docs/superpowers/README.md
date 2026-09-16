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
| `plans/2026-09-16-data-safety.md` | `KkarcDB/docs/plans/2026-09-16-prototype-data-rescue.md` |

The `hub_` table prefix was dropped in the move, and the word "hub" retired: it had come
to mean a table prefix, this repository's prototype file, and the application being
built, and every conversation had to disambiguate it first. Start from the roadmap.

## What stays here, and why

Everything else — the feature specs and plans for meetings, the Gantt, principles, the
sidebar, licensing tracks, the English translation, the protein explorer. They document
prototypes this repository contains, and they remain the **behaviour reference for the
rebuild**: read them to learn why a screen works the way it does.

`specs/2026-09-07-project-hub-restructure-design.md` also stays, carrying a superseded
banner. It is a design about a file that lives here.

## The one piece of code still written against this repository

Piece 0 of the roadmap — the data rescue — adds `data-safety.js` and `data-safety.test.js`
at this repository's root and **one line** to `project_hub.html`, because the data being
rescued is in that application's `localStorage` and a site at another origin cannot reach
it. Its plan lives in KkarcDB, at the path in the table above.
