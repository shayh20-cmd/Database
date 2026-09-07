# project_hub Restructure — Design

**Branch:** `restructure/project-hub` (cut from `master`)
**Date:** 2026-09-07
**Status:** design — independent of the schema spec, but should land first

## Problem

`project_hub.html` is 700 KB in 1,218 lines. Its longest line is 46,424 characters.
The application is 2,487 hand-maintained `React.createElement` calls with no JSX
source: someone wrote JSX, compiled it with Babel, kept the output, and lost the
input. The compiled output *is* the source of truth.

The cost is not aesthetic. It is that **changes cannot be reviewed**:

| Commit | Change | Diff a reviewer sees |
|---|---|---|
| `95ec0d7` | prefix a badge with one label | 10,756 characters |
| `0d9b39c` | make one title inline-editable | 7,744 characters |
| `e40db13` | add a badge to the detail sidebar | **250,053 characters** |

Adding a badge produces a quarter-megabyte diff. Nobody can inspect that and
determine whether it is correct. Every future change to this application — including
every change the database migration requires — pays this cost.

## Decisions taken

| Decision | Choice |
|---|---|
| Build output | Single self-contained HTML; must stay double-clickable |
| Scope | `project_hub` only; the other three apps stay untouched at repo root |
| Language | TypeScript, staged — `.jsx` first (mechanical), `.tsx` second (judgement) |
| Approach | Big bang: one automated pass, one verification, one commit |
| Layout | Monorepo — `apps/`, `packages/shared/` |

Bundling React into the output has a side benefit: the app currently fetches React
from unpkg on every open, so it does not work offline. After bundling, it does.

## The decompile is provably lossless

This was verified before the design was written, not assumed.

The file carries Babel's signature: 2,487 `createElement` calls and exactly 2,487
matching `/*#__PURE__*/` annotations, with no `_extends`/`_objectSpread` helpers. The
transform is therefore reversible, and reversibility can be *proven* rather than
trusted:

```
canonical(pristine original) == canonical(compile(prettier(codemod(original))))
```

`canonical()` strips comments, formatting, literal raw-text, and object-key quoting.
It is Unicode-aware because this codebase uses Hebrew object keys, which are valid
JS identifiers.

Measured result:

| | |
|---|---|
| Converted to JSX | 2,485 of 2,487 |
| Left as `createElement` | 2 (spread children — not expressible in JSX) |
| Documentation comments preserved | 325 of 325 |
| Output | 35,969 lines of formatted JSX |
| Canonical equivalence vs pristine | **byte-identical** |

### Traps found while proving it

Each of these produced either silent corruption or a false pass, and each is now
encoded in the harness:

1. `babel-plugin-transform-react-createelement-to-jsx` is unmaintained and calls
   `t.jSXIdentifier`, renamed in modern Babel. We write our own codemod, which also
   lets it refuse rather than guess: anything it cannot represent exactly is left as
   a `createElement` call and counted.
2. Converting outside-in skips calls nested inside expressions
   (`xs.map(x => React.createElement(...))`). Traversal must be bottom-up (`exit`).
3. **`/*#__PURE__*/` must be stripped on the AST, never as text.** Minified output
   contains `return/*#__PURE__*/React.createElement(...)`, where the comment is a
   token separator. A text-level strip silently welds it into `returnReact.createElement(...)`,
   which parses cleanly and corrupts 161 returns.
4. That corruption still reported **IDENTICAL**, because the strip ran before the
   comparison and both sides carried it. The proof must always compare against the
   **pristine** original, never a preprocessed one.
5. Prettier's `quoteProps` and Hebrew identifier handling are semantically neutral but
   textually visible; the canonicaliser absorbs them rather than constraining Prettier.

## The split is safe

Dependency analysis of the decompiled source:

| | |
|---|---|
| Top-level bindings | 144 |
| Dependency edges | 351 (average 2.4) |
| **Cyclic groups** | **0 — a clean DAG** |
| Zero-dependency leaves | 71 |
| Implicit globals / `window` writes / top-level `var` | 0 / 0 / 0 |

No cycles means the modules topologically sort, so ES modules will not hit circular
import fragility, **and the equivalence proof extends to the split**: concatenate the
modules in topological order, recompile, compare to pristine.

The only external globals are `React` and `ReactDOM`, which become imports.

## Target layout

```
Database/
├── package.json                  # npm workspaces root
├── apps/project-hub/
│   ├── index.html  vite.config.ts
│   └── src/
│       ├── main.jsx  App.jsx
│       ├── constants/   storage · lists · columns · fields · events
│       ├── lib/         uid · dates · format · tasks
│       ├── data/        seed · migrate · storage
│       ├── context/     ListsCtx
│       ├── components/  icons · cells · rows · panels · chrome
│       ├── views/
│       └── styles/      tokens · base · table · gantt · sidebar · print
├── packages/shared/              # i18n today; the domain model after the DB migration
├── tools/codemod/                # codemod + equivalence harness
├── legacy/project_hub.html       # pristine original, kept for diffing
└── dist/project_hub.html         # build output
```

`planning_dashboard.html`, `home_dashboard.html` and `protein_explorer.html` stay at
repo root and keep loading root `i18n.js` / `i18n-dict.js`. `project_hub`'s build
inlines those same two files as classic scripts — one copy, no divergence. The
cleanup lands when the other apps migrate.

**CSS is plain CSS split by concern, not CSS Modules.** Class names are constructed
dynamically (`` `dp-opt${sel ? ' sel' : ''}` ``); CSS Modules would silently break
every one.

## Stage 5 — decomposition the automation cannot do

The DAG split produces 115 files under 300 lines holding 18% of the code, and leaves
21 files over 500 lines holding **74%**. Automation cannot fix that; judgement can.
Churn data across all 169 commits says most of it does not need fixing:

| Action | Files | Lines | Rationale |
|---|---|---|---|
| Decompose by hand | `ListView`, `TaskDetailSidebar`, `Toolbar`, `ExpandedDetail`, `TaskRow`, `ProcessTaskPanel` | ~7,400 | Hot path — `track` (20), `task` (16), `sidebar` (12), `subtask`/`meeting`/`group` (10 each) |
| Convert to JSON fixtures | `makeDefaultData`, `PORTFOLIO_DATA` | ~4,050 | Not code. Leaves the maintenance surface entirely |
| Leave as single large files | `NihulGanttView`, `PortfolioView`, `HomeView`, `MyTasksView` | ~8,800 | Cold — `gantt` (2), `dashboard` (2), `portfolio` (0). Readable is sufficient |

The two largest files are the two nobody touches. Decomposing them would be unpaid work.

## Verification, and its expiry

The equivalence harness runs **only during migration**. It proves *nothing changed* —
so it must be retired at parity sign-off, before stage 5 begins, because decomposition
deliberately changes structure. It is scaffolding, not a permanent test.

What replaces it — written *before* the split, so it characterises current behaviour
and independently confirms the restructure:

- **Unit** (Vitest): the `migrateData`/`migrateTask` ladder, date helpers,
  `getMostRecentEventStatus`, `getProcessResponsible`
- **Characterisation** (Vitest + jsdom): render all 9 views against the seed dataset,
  snapshot the DOM
- **Smoke** (Playwright): create task → edit status → undo → reload → assert
  persistence. This is the first automated check that `pm_asana_v9` survives a
  round-trip; nothing verifies that today.

## Risks

| Risk | Mitigation |
|---|---|
| One large unreviewable commit | Harness + characterisation snapshots; `legacy/` kept for side-by-side |
| Auto-chosen module boundaries feel wrong | Boundaries are data-driven from the DAG; renaming afterwards is cheap and re-verifiable |
| Runtime coupling AST analysis cannot see | Playwright smoke test plus a manual pass over all 9 views |
| Prettier reformats 36k lines | Verification runs *after* formatting, so formatting is inside the proof |

## Out of scope

- i18n rework — deferred until after the schema lands, because the `code`/`label`
  split decides it (see the translation spec)
- The other three apps
- The database migration itself
- **Phase 0 data-safety fixes** — JSON export/import for `project_hub`, quota-error
  handling, attachments out of the blob. These are live risk today, are prerequisites
  for any migration, and must ship independently rather than waiting behind this work.

## Housekeeping folded in

- Delete the tracked `project_hub.html.bak` (593 KB; git holds the history)
- Cut the working branch from `master`, not from `English-translate`
