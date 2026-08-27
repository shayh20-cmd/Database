# English Translation Mode — Design

**Branch:** `English-translate`
**Date:** 2026-08-17

## Problem

The three dashboards (`home_dashboard.html`, `planning_dashboard.html`, `project_hub.html`) are Hebrew-only, RTL. We want an English display option without paying an ongoing tax on every future modification.

The conventional i18n refactor is what we are explicitly avoiding: replacing every literal (`"פרויקטים פעילים"`) with a `t('activeProjects')` call plus parallel `he.json`/`en.json` files. That would mean rewriting ~900KB of source across 2,487 `React.createElement` calls in `project_hub.html` alone, and every subsequent edit would touch three places instead of one. The source would also stop being readable in the language its authors think in.

## Approach

Keep the source Hebrew-only. Translate the **rendered DOM** at runtime.

A working implementation of this already exists on the branch as the untracked `i18n.js`: a `MutationObserver` walks text nodes and a fixed set of attributes (`title`, `placeholder`, `aria-label`, `alt`), replacing Hebrew via a longest-match-first regex built from a HE→EN dictionary, and flips `documentElement.dir` to `ltr`. A `<script>` in each `<head>` sets `dir` before first paint to avoid an RTL flash.

This design commits that work and closes the three gaps that make it fragile.

The token cost per modification is the crux: editing a feature costs exactly what it costs today. The only new cost is translating genuinely new strings, and component 2 makes that cost proportional to the number of new strings rather than to the size of the codebase.

---

## Component 1 — Split the dictionary from the engine

`i18n.js` is currently one 1,646-line file: ~160 lines of stable engine and ~1,470 lines of churning dictionary (1,457 entries across three `Object.assign` chunks).

Split into two files:

| File | Contents | Churn |
|---|---|---|
| `i18n-dict.js` | the `HE_EN` map, assigned to a global | high — grows with every feature |
| `i18n.js` | engine, toggle button, observer, boot | low — stable |

Each HTML file loads `i18n-dict.js` before `i18n.js`.

**This is the highest-leverage part of the design.** When a feature adds five strings, the edit targets a dictionary-only file and the engine never enters the context window. Appending to a flat map is near-zero marginal cost; editing a 1,646-line mixed file risks pulling the whole thing in.

The dictionary keeps its current chunked `Object.assign` structure — it exists to avoid one unmanageably long object literal, and that reasoning still holds.

## Component 2 — `tools/i18n-extract.js`

A dependency-free Node script, run from the repo root:

```bash
node tools/i18n-extract.js
```

**Behaviour:**

1. Read the three HTML files.
2. Extract quoted string literals containing at least one Hebrew character (`֐-׿`), handling `'`, `"`, and backtick delimiters with escape awareness.
3. Read the existing keys from `i18n-dict.js`.
4. Print only the source strings absent from the dictionary, as a paste-ready object with empty string values, grouped by source file.
5. Exit non-zero when anything is missing, so it can gate a commit later if desired.

Because the React is precompiled to `React.createElement` calls rather than JSX, every piece of UI text is a plain string literal. A regex scan is sufficient here; no JS parser is needed.

The script reports candidates, not truth. Some hits will be non-UI strings (comments, `console.log`, storage keys). Skimming past those is cheap; silently shipping an untranslated screen is not.

**Known limitation:** strings composed at runtime from fragments (`` `נותרו ${n} ימים` ``) are extracted as their literal fragments. The existing dictionary already handles this by containing partial phrases with trailing context, and the engine's Hebrew-boundary lookarounds keep those from over-matching. New composed strings need the same treatment by hand.

## Component 3 — User-data isolation

All application data lives in a single localStorage JSON blob per app (`pm_asana_v9`, `planning_dashboard_data_v4`), seeded on first load with sample data. Currently `data-i18n-skip` is applied only to the language toggle button itself, so **nothing protects user content** — any project name, task title, or person name that matches a dictionary key gets rewritten.

Mark the components that render values from the stored JSON with `data-i18n-skip`. The engine already honours this attribute via `closest()` in its `skip()` check, so no engine change is required — only the markers.

**Accepted consequence:** the seed/demo data flows through those same components, so sample projects (`מרכז קהילתי רמת גן`, `בית ספר בית שמש`) and person names will render in Hebrew even in English mode. On a dashboard that data is most of the visible text, so English mode will look mixed when running on seed data.

This is the correct trade. These are proper nouns — real places and real people — and an English-speaking consultant reading the board wants the interface in English, not their colleagues' names invented into English. Users' own Hebrew data staying Hebrew is expected behaviour, not a bug.

If polished all-English demos are wanted later, the fix is a separate English seed dataset selected at seed time — not dictionary matching against user content.

**Dictionary pruning is deliberately out of scope.** Once the render sites are skipped, the ~200–400 seed-data entries in the dictionary simply stop firing. They are dead weight in the regex alternation but harmless, and removing them is churn without user-visible benefit.

---

## Out of scope

**RTL→LTR CSS audit.** The three files carry 158 physical `left`/`right` declarations against 85 already-converted logical ones. These are *not* uniformly convertible: a large share in `project_hub.html` position Gantt bars from JS-computed coordinates, where physical positioning is intentional and a logical property would break the timeline. This needs a considered audit, not a bulk find-replace, and is tracked as separate follow-up work.

Consequence: English mode will have some layout imperfections at ship time. The text is readable and the direction flips correctly; some absolutely-positioned chrome will sit on the wrong side.

**Language-specific number, date, and currency formatting.** Dates render via existing helpers; English mode shows Hebrew-locale formatting.

**Translating the other direction (EN→HE).** The dictionary is one-way by construction.

**`protein_explorer.html`.** Unrelated standalone file, not part of the dashboard suite.

---

## Verification outcome (2026-08-17) — both issues resolved

**1. `document.title` — fixed.** `applyTitle()` now honours a
`data-i18n-skip-title` attribute on `<html>`, set only on `project_hub.html`,
whose title *is* the project name. The other two pages have chrome titles and
still translate:

| Page | Title | English mode |
|---|---|---|
| `planning_dashboard.html` | `ניהול סטטוס תכנון` | `Design Status Management` |
| `home_dashboard.html` | `דף הבית — שי הורביץ` | `Home — Shai Horowitz` |
| `project_hub.html` | `ספריית לוד` | unchanged — it is a project name |

**2. RTL→LTR audit — done.** The headline "158 physical declarations" was
misleading: most were JS inline-style coordinates (Gantt columns, popup
positions) that are direction-agnostic by construction. Only **19** lived in
CSS. Auditing by comparing rendered geometry between modes — rather than
reading CSS — found three real bugs, all fixed:

- **6 hardcoded `dir="rtl"`** on portal-rendered context menus, the duplicate
  and delete modals, and the task detail panel. These pinned those surfaces to
  RTL in English mode. Portals into `document.body` already inherit `dir` from
  `<html>`, so the attribute was redundant in Hebrew and harmful in English.
- **`.hero::before` / `::after`** used physical `left`/`right` and were measured
  byte-identical in both directions, while `text-align: start` correctly flipped
  the text — so in English the heading moved onto the decoration. Now logical.
- **6 image resize handles** positioned physically, with resize maths hardcoded
  to RTL (`// RTL: drag right = smaller`). Position is now logical and the drag
  maths reads the document direction. RTL behaviour is byte-identical; LTR is
  its mirror.

The 11 remaining physical `left`/`right` declarations are verified
direction-neutral: `translateX(-50%)` centering idioms, full-bleed
`left:0;right:0`, and `.select`, which already carries a `[dir="ltr"]` override.

**Verified in-browser on all three pages:** no horizontal overflow, zero
mirror failures (every positioned element lands at its mirrored coordinate),
chrome translates, user data does not, clean Hebrew round-trip, no console
errors.

**Not verified hands-on:** the image-resize *drag* interaction requires
inserting an image into a task description and dragging a corner. The change is
a provable mirror of existing behaviour, so RTL cannot regress, but LTR drag
direction deserves a manual try.
