# מחשבונים (Calculators) — design

## Intent

A project page where the office runs the regulatory checks a planning submission needs, keeps
each run as a numbered, dated check (like sheets in Excel), and sees all of them summarised on
one page. It replaces the separate parking calculator (`Claude Projects/parking-calculator`)
and the hand calculations done for הל"ת. Built with the user from a clickable mockup on
2026-11-01; the mockup's screens are the reference for layout.

## Scope

- **Now:** parking (תנועה וחניה) and plumbing fixtures (הל"ת), plus the summary page.
- **Later, same page:** civil defence (הג"א) and fire safety (occupancy, exits, exit widths),
  each once the user uploads its regulation. Their tabs show as "coming soon".
- **Not:** a full station register (the mockup's 88-station list is reused as is, with manual
  zone override); the accessible-parking table (provision 8.110/8.271 of the permit
  regulations), which is pending a PDF — the page computes its basis and shows "pending".

## Where it lives

- Sidebar: inside the project, a "מחשבונים" item after "מסלולים". Route `track === 'calcs'`.
- Stored in the project document as `data.calculators = { parking: { sheets }, hlt: { sheets } }`.
  Every sheet, use row and plan floor has an `id`, so the three-way merge combines two
  people's edits by id like the rest of the document.
- Code: `calc-rules.js` (pure rules and arithmetic, loaded by the page and by node tests) and
  `calculators-ui.js` (the React page, `window.CalculatorsUI`), both added to the deploy list.
  `project_hub_01.html` only gains the sidebar item, the route and two script tags.

## Parking — תקנות התכנון והבניה (התקנת מקומות חניה), תשמ"ג-1983, נוסח 30.10.2025

- Basis per check: main area (היתר בחלוקה) or total area (היתר בשטח כולל). Total area uses the
  "א" tables (2א, 3א, …) and the total-area columns of Parts C and D.
- Zone from the address: geocode (Nominatim), stations within 800 m, nearest sets the zone
  (≤300 א, ≤600 ב, else ג; a future station counts as ג). The user can override; the check
  records "set manually".
- One row per use, quantity in the use's unit. Commercial is tiered cumulatively
  (2,000/10,000 m² main; 2,941/14,700 m² total). With no mass transit, commercial, offices and
  industry pick their row by the plan's building-rights % (user's call — the regulation's
  "עד 100% זכויות בנייה" is read as the plan's percentage).
- Each row rounds up (Part A §6). "מספר מרבי" is shown as "עד X" with no minimum.
- Results: private cars, accessible (basis = no-transit count; pending table), bicycles (Part C,
  minimum), motorcycles (Part D). Change since the previous check.

## הל"ת — הוראות למתקני תברואה 2007, סעיף 3.6

- One row per use, picking one of the tables 3.6.3.1–3.6.3.14 (sub-tables listed separately),
  quantity in that table's unit, % men (default from the table's note; fixed 50/15/35 for
  sport, 50/50 for pools), and floors only for uses with a per-floor fixture.
- Per use: a table of fixtures by gender with the table row each number came from, a
  per-building row, and the table's notes quoted.
- Project total, and the general clauses quoted (3.6.1, 3.6.2, 3.6.3).
- Required vs proposed: number of floors in the plan, fixtures entered per floor, gap and
  status per fixture. Urinals may be covered by surplus men's toilets (3.6.3(א)); per-floor
  fixtures are also checked floor by floor.

## Language

Labels, use names, units and rule texts are bilingual (Hebrew source, English in
`i18n-dict.js`); text built in code goes through `I18N.t` templates and the page re-renders on
`i18n:change`. Verbatim regulation quotes stay in Hebrew (`data-i18n-skip`) — they are
citations of Hebrew legislation. Check titles and notes are user data.

## Approaches considered

1. **Separate module + small hook in the page (chosen).** Testable rules, no edits to the
   1.3 MB file beyond the hook; same pattern as `register-directory-ui.js`.
2. Component inside `project_hub_01.html` in compiled form — harder to test and review.
3. A separate page (`calculators.html`) — loses the project document, sync and the Hub's
   navigation.
