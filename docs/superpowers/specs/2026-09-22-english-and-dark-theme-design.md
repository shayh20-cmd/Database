# English mode and a dark ("black") theme for the project hub — Design

**Branch:** `feat/azure-deployment`
**Date:** 2026-09-22
**Page:** `project_hub_01.html` — the copy that is live at kkarc-hub.azurewebsites.net

## Problem

The live project hub is Hebrew-only, right-to-left, and light-only. Daniel asked for
"an English version of this frontend and a black theme". Two independent switches,
both remembered per browser, both reachable from inside the page.

## Decisions and the assumptions behind them

Daniel was not available while this was designed, so the following were decided from
the repo's own history rather than asked. Each is cheap to reverse.

1. **English is a runtime toggle, not a second file.** The 2026-08-17 English
   translation design (branch `English-translate`) already rejected the `t('key')`
   refactor and a forked English copy: a 1 MB page would diverge within a week. That
   branch's engine (`i18n.js`) and dictionary (`i18n-dict.js`) are reused as-is and
   grown; the page source stays Hebrew.
2. **"Black" means a dark appearance built on near-black surfaces**, not a fourth
   entry in the existing colour-intensity themes (default / muted / vivid). Appearance
   is a second axis: any intensity theme works in light or dark.
3. **Scope is the live page only.** `planning_dashboard.html`, `home_dashboard.html`
   and `capture.html` are not touched; because the engine and dictionary are shared
   files, adding them later is two script tags each.
4. **User-entered data is never translated.** Same rule as the earlier design: project
   names, task titles, people, notes stay in the language they were typed in.

## Component 1 — Shared translation files at the repo root

`i18n.js` and `i18n-dict.js` are taken from `English-translate` (file contents only;
that branch's page edits target the retired `project_hub.html`). Two small engine
changes:

- `window.I18N = { get(), set(lang), toggle() }` so a page can render its own control.
- `data-i18n-no-button` on `<html>` suppresses the floating globe button. The project
  hub sets it and puts the control in its sidebar footer and settings instead; the two
  older pages keep the floating button when they adopt the files.

The dictionary gains one new `Object.assign` chunk headed `project_hub_01`, holding
every UI string of this page that the dictionary does not already translate. Measured
before the work: 1,260 distinct Hebrew literals in the page, 564 already exact keys,
277 fully covered by existing partial phrases, 419 uncovered. Seed/demo strings are
excluded on purpose (see the 2026-09-15 note: 68% of the old dictionary was seed data).
Composed strings such as `` `סטטוס שונה ל"${x}"` `` are covered by their static
fragments, the way the engine's Hebrew-boundary lookarounds already expect.

`tools/i18n-extract.js` and its test come over too, with `project_hub_01.html` added
to its file list, so a future edit can ask "what did I leave untranslated?".

## Component 2 — The page in English

- A pre-paint `<script>` in `<head>` sets `dir`/`lang` from `localStorage.appLang`
  (no RTL flash), plus `data-i18n-skip-title` because the title is the project name.
- `<script src="i18n-dict.js">` and `<script src="i18n.js">` at the end of `<body>`.
- **RTL → LTR audit**, the same three classes of bug the earlier audit found, now in
  this page: 15 hard-coded `dir:"rtl"` on portals/panels, 34 inline `direction:'rtl'`,
  and physical `paddingRight` / `textAlign:'right'` / `right:` / `left:` in CSS and
  inline styles. Rule: anything that expresses "the start side" becomes logical
  (`inset-inline-start`, `paddingInlineStart`, `textAlign:'start'`) or inherits the
  document direction; anything that is a coordinate (Gantt bar `left`, popup x) stays
  physical. Hebrew rendering must be byte-identical afterwards.
- **User-data containers**: the existing skip selector (`.name-text,.cmt,.proj-name`)
  is checked against every component that renders stored data in this page — the
  multi-project sidebar, home and overview widgets, meetings, principles, tender matrix,
  activity log — and extended with `data-i18n-skip` or a class where a container is
  not covered. Activity-log lines ("status changed to X") are UI text around a value
  and are translated; the value only changes if it happens to equal a dictionary key,
  which is the accepted trade from the earlier design.

## Component 3 — Dark appearance

- `localStorage.pm_appearance` ∈ `light` (default) | `dark`. A pre-paint `<script>`
  sets `data-appearance` on `<html>`; `applyAppearance(id)` sits next to `applyTheme`.
- One CSS block `:root[data-appearance="dark"]{…}` overrides only the **neutral
  tokens** — `--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`,
  `--text`, `--text-2`, `--text-3`, the three shadows — and sets `color-scheme: dark`
  so scrollbars and form controls follow. Surfaces are near-black (`--bg` ≈ #0B0C0F,
  `--surface` ≈ #141518), not grey.
- The intensity themes keep their accent; if the contrast check finds an accent
  unreadable on the dark surfaces, `THEMES[n]` gains a `dark` override map used by
  `applyTheme` when dark is active.
- **Hard-coded colours** are the real work. The page has ~100 hex colours in CSS and
  ~700 in inline styles. Each is classified: semantic colours (status red, priority,
  discipline, Gantt, event chips) stay; **neutral light colours** (`#fff` surfaces,
  `#F0F2F6` sub-rows, `#FEF2F2` danger backgrounds, `#E5E7EB` borders, `#888` text…)
  move to a token — existing ones, or new named ones such as `--danger-bg`,
  `--warn-bg`, `--tooltip-bg`, `--on-accent` — each with a light and a dark value.
  White text on accent buttons stays white. Pale event-chip backgrounds with dark text
  stay as they are in dark mode: they remain readable and read as chips.
- The PDF/print export keeps its own light stylesheet; paper is white.

## Component 4 — The controls

- **Sidebar footer** (next to the signed-in user): a language pill (🌐 English / עברית)
  and a sun/moon appearance button. One tap each.
- **Settings → ערכת צבעים (Theme tab)**: two rows added above the intensity cards —
  *Language* (עברית / English) and *Appearance* (Light / Dark) — so the switches are
  also discoverable where colours already live.

## Component 5 — Server and deployment

- Cloud mode serves only pages; `/i18n.js` and `/i18n-dict.js` are added to the
  allowlist by exact name (nothing else under the root becomes reachable).
- `Deploy-Azure.ps1` copies the two files into the zip. `cloud.test.js` gains a case
  for the two allowed paths and one denied `.js` path.
- `.claude/launch.json` gains an entry for this worktree on this machine
  (`project-hub-azure`).

## Out of scope

Number/date locale formatting; translating the other pages; an English seed dataset;
per-user preference sync across devices (both switches are per browser, like the
intensity theme today).

## Verification

1. `node tools/i18n-extract.js` reports nothing missing for `project_hub_01.html`
   after the accepted seed/comment ignore list.
2. `node --test tools/local-server/test/` passes, including the new allowlist case.
3. In the browser, on the local server, all four combinations (he/en × light/dark):
   no console errors; in English no Hebrew text node outside a skip container; in
   Hebrew light the rendered geometry of the sidebar, table, task panel, Gantt and
   tender matrix equals the pre-change build (mirror check as in the earlier audit);
   in dark, text/background pairs of the neutral tokens reach WCAG AA (4.5:1).
4. Screenshots of the four combinations attached to the PR.
