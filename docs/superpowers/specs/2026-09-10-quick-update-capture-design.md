# תיעוד בלחיצה אחת — one-click updating and quick capture

**Date:** 2026-09-10
**App:** `project_hub_01.html`
**Status:** design approved, ready for implementation planning

## Problem

Documenting progress feels like a chore, so it doesn't happen. Two causes, both
observable in the current code.

**1. Three composers write the same record, and they disagree.**

| Surface | Cost to log one update | Pre-selected status | Insertion |
|---|---|---|---|
| `TenderCellPanel.addEvent` | 1 click — writes immediately, then expands for optional editing | n/a (status is the click) | append |
| `StatusOwnerCell` (עדכונים column) | open `+` → pick discipline → pick status → confirm = up to 4 clicks, over a popover of 22 pills | the **current** status (repeat what's already there) | prepend |
| `EventsTimelineSection` (task detail) | six visible fields, then שמור עדכון | `getNextSuggestedStatus()` — the **next** step | append |

The tender panel already implements the interaction this design wants. The
regular-task surfaces are the slow ones.

**2. Tasks with no updates have no entry point at all.**
`StatusOwnerCell` returns an empty `<td>` when `(task.events||[]).length === 0`.
The tasks where documentation has not started are exactly the ones you cannot
start documenting from the row — you must open the panel and meet the six-field
form.

Separately, the information being documented originates in email, phone/WhatsApp
and meetings — outside the app. `AUTO_ACTIONS` already contains `add-update`, but
every entry in `AUTO_CONDITIONS` fires on an in-app change, so automations can
only document work that was already logged by hand.

## Goals

- Logging a status update costs one deliberate click, from wherever the user
  already is.
- Refinement (note, title, round, different assignee) is always available and
  never required.
- The same act works from outside the app, without opening it.
- No change to the stored record, so the Gantt, day-counts and delay warnings
  keep working untouched.

## Non-goals

- Email ingestion (IMAP/forwarding) — separate spec.
- A "what's going stale" review screen — separate spec, though the inbox
  introduced here is its natural feeder.
- New statuses, bulk logging, or changes to `EV_STATUSES`.

## Data model

The update record is unchanged: entries in `task.events[]` / `cell.events[]` keep
the shape `{id, status, date, assignee, title?, note?, round?, countFromHere?}`.

One addition, introduced in phase 2:

```js
data.inbox = [{ id, date, text, kind:'update'|'task', projectId, discipline, status? }]
```

`inbox` holds captures that were saved without a precise target. It defaults to
`[]` in `migrateData`.

A captured **decision** needs no new structure: it is a planning principle, and
`data.standalonePrinciples` already exists for exactly this
(see `2026-06-22-planning-principles-design.md`) with the shape
`{id, description, discipline, createdAt}` — which a capture fills directly:
`description` = the captured text, `discipline` = the guessed discipline,
`createdAt` = today. It is already surfaced in the עקרונות תכנון page and
embedded in מבט על, so a captured decision is visible the moment it is saved.

Note that the architecture constraint recorded in that spec — task-editing
components see only their own sheet, never the root `data` — does not apply to
the capture window, which writes the whole data object through the API.

## Phase 1 — one-click updating inside the app

Phase 1 ships on its own and is where implementation starts. Phase 2 depends on
it: the capture window writes through the same shared component and the same
record shape, so building it first would mean building that model twice.

### `QuickUpdatePills` (new shared component)

One component, used by every surface that logs an update.

```
props: { events, onAdd(status), assignee, compact? }
```

- Renders the `EV_STATUSES` pills in `EV_CYCLE` order, `missing` excluded.
- Emphasizes `getNextSuggestedStatus(latestStatus)` — the next step, never a
  repeat of the current one.
- Clicking a pill calls `onAdd(status)` immediately. No confirm button.
- The caller writes `{id:uid(), status, date: todayISO(), assignee}` and
  **appends** it, then expands that entry for editing.

Callers stop making their own guesses; the suggestion and the write shape live
in one place.

### Surface changes

**`StatusOwnerCell`**
- Replace the `panel==='add'` popover body with `QuickUpdatePills`. Discipline
  selection moves behind a "פרטים…" link — it already defaults to the current
  discipline, so it is a correction, not a question.
- Switch the write from prepend to append, matching the other two surfaces.
- Remove the empty-`<td>` early return. A task with no updates renders a faint
  `+` that opens the same pills. The first update costs what the tenth costs.

**`EventsTimelineSection`**
- The default state becomes the pill strip, not the expanded form.
- The full form stays, reached by "פרטים נוספים", with אחראי / כותרת /
  פירוט / ספירת ימים collapsed inside it. Nothing is removed.
- The newly added entry renders expanded with its note field focused-ready and
  מחק visible, so correcting a stray click is immediate.

**`TenderCellPanel`**
- Behaviour already matches. Swap its hand-rolled status buttons for
  `QuickUpdatePills` so the three surfaces cannot drift apart again.

### Decisions

- **`+` visibility:** always visible (faint) on rows with **no** updates, where
  discoverability is the entire point; hover-only on rows that already show a
  chip, where the row is already busy.
- **Accidental clicks:** no undo toast. The new entry appears expanded with מחק,
  and the app's global undo already covers the write.

## Phase 2 — capture from anywhere

### Host

A small `capture.html`, served by the existing local Node server, opened by an
AutoHotkey script bound to a global hotkey (`Ctrl+Shift+Space`). No build step,
no packaging; two files that can be deleted to revert.

Two operational prerequisites, both real:
- the local server must start with Windows (today it is started by hand);
- AutoHotkey must be installed once and its script placed in Startup.

### Window behaviour

Opens centred and focused over whatever the user was doing. `Esc` closes,
`Enter` saves. After saving it shows a confirmation for ~2s and closes itself.

### The status decides what gets created

One rule, no separate mode selector:

| User picked | Result |
|---|---|
| a status pill | an **update** |
| no status | a **new task** |
| "עקרון תכנון" | a standalone entry in `data.standalonePrinciples` |

The inferred kind is shown as a pressed chip at the bottom of the window and can
be overridden with one click, so the inference is always visible and correctable.

### Targeting

- **Project** defaults to the last one used — most captures in a session belong
  to the same project.
- **Discipline** is guessed from the text (e.g. "קונסטרוקציה" → `STRC`), and
  falls back to `ARCH`.
- **Task** is optional. Typing surfaces up to three matching tasks; picking one
  makes the target exact and takes the discipline from it.
- Saving with no task match writes to `data.inbox` with kind and status intact.

### Inbox

Unassigned captures are a real risk: a pile that never gets sorted is worse than
no capture at all. Therefore they are visible, not silent:

- the capture window labels the outcome "ממתין לשיוך" at save time;
- the project shows a count of pending items;
- assigning one to a task writes the real `events[]` record and removes it from
  `data.inbox`, so the pile can only shrink by being used.

### Input helpers

- **הכתבה** — Web Speech API (Chrome, `he-IL`) fills the text field. This is the
  answer to phone calls and site visits, where typing is the barrier.
- **הדבק מהמייל** — pastes clipboard text into the field. A cheap bridge toward
  email ingestion without building IMAP.

## Risks

| Risk | Mitigation |
|---|---|
| Inbox accumulates and is ignored | Pending count surfaced per project; assigning is one click; the future review screen consumes it |
| One-click logging creates stray entries | New entry opens expanded with מחק; global undo covers the write |
| Server not running when the hotkey fires | Capture window shows a plain "השרת לא פעיל" state rather than losing the text; text is retained in the field |
| Hebrew dictation accuracy | Dictation fills an editable field — it is a draft, never saved directly |

## Verification

- `node --check` on the extracted `<script>` after each edit.
- In-browser: log an update from a task with history, from a task with none, and
  from a tender cell; confirm all three write the same record shape and appear in
  the Gantt.
- Confirm day-counts and delay outlines are unchanged for existing data.
- Phase 2: capture an update, a task and a principle; confirm each lands where
  the spec says — in particular that a captured principle appears in the
  עקרונות תכנון page and in מבט על — and that an unassigned capture appears in
  the inbox and can be assigned.

## Mockups

- In-app one-click updating: https://claude.ai/code/artifact/7284a2c5-e387-493a-a59d-69f80ed60443
- Capture window: https://claude.ai/code/artifact/1d2bcb8c-89e0-466c-aaca-56e7ec6284c1
