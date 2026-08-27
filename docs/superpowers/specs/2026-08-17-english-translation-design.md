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

## Known issues found during verification (2026-08-17)

**1. `document.title` still translates user data on `project_hub.html`.**
`applyTitle()` calls `tr()` directly and never consults `skip()`, so the browser
tab title bypasses the user-data protection. The three pages differ in what
their title actually contains, so no blanket rule is correct:

| Page | Title | Translating it is… |
|---|---|---|
| `planning_dashboard.html` | `ניהול סטטוס תכנון` | correct — pure UI chrome |
| `home_dashboard.html` | `דף הבית — שי הורביץ` | acceptable — chrome plus a transliterated name |
| `project_hub.html` | `ספריית לוד` | **wrong** — this is purely a project name |

So `project_hub.html` shows `ספריית לוד` in the app but `Lod Library` in the tab.
A minimal fix would be an opt-out marker (e.g. `data-i18n-skip-title` on `<html>`)
honoured by `applyTitle()`, set only on `project_hub.html`. Deferred: it needs a
decision, not just a patch.

**2. LTR layout imperfections.** 158 physical `left`/`right` declarations remain,
against 85 logical. Text is readable and direction flips correctly, but some
absolutely-positioned chrome sits on the wrong side in English mode. Many of
these are intentional (JS-computed Gantt coordinates) and must not be bulk
converted. Tracked as the separate RTL audit above.

## Verification

No test framework, no build step, no `package.json` — consistent with the rest of this repo.

1. **Syntax:** `node --check` on `i18n.js`, `i18n-dict.js`, and `tools/i18n-extract.js`.
2. **Dictionary integrity:** confirm the split preserves all 1,457 entries — key count before and after must match, and the regex must still build without throwing.
3. **Extractor self-check:** running it against the current tree should report few or no missing strings, since the dictionary was built from this same source. A large result means the extraction regex is wrong.
4. **Browser:** load each of the three files, toggle to English, confirm chrome translates and direction flips; toggle back and confirm Hebrew is restored exactly (the engine caches originals in `__i18nHe`, so round-tripping is testable).
5. **User-data isolation:** rename a seed project to a string that exists as a dictionary key, switch to English, confirm it does *not* translate.
6. **No console errors** in either language.
