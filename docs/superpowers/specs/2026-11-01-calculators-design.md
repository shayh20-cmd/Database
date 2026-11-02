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

- A "מחשבונים" tab in ניהול תכנון (NihulHubView, after "בדיקות"); hidden in the admin project like the other planning-only tabs. (First shipped as a sidebar item; moved here at the user's request.)
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

## הג"א (added 2026-11-01)

Sources: תקנות ההתגוננות האזרחית (מפרטים לבניית מקלטים), התש"ן-1990 — 171–172 (ממ"ק), 197א (ממ"ד),
236 (ממ"מ: % of the floor's main area, minimum 10 m², maximum 60 m², 236(ב) uses not counted); Annex A to
236(א) for the total-area column (from the user's scan); מפרט למיגון מוסדות חינוך, November 2023, section 8
and table 1 (per classroom, minimum per space, maximum 90 m²).

- A check has a basis (main / total area) and a list of floors. Each floor holds uses (several per floor) and
  the proposed protected spaces (name, type, net area). Floors can be duplicated.
- Per floor and space type: ממ"מ and school spaces add up the floor's uses, the largest minimum among them
  applies, and the number of spaces is the area over the maximum; ממ"ד one per apartment (9 m²); ממ"ק one
  per 4 apartments (4/5 m² per apartment). The floor passes when area, count, maximum and minimum hold.
- Ventilation and filtration per proposed space (not ממ"ד): occupants = ceil(area / m² per person), airflow =
  occupants × m³/h per person (defaults 0.4 and 6, from the user's own table; editable per check); chosen
  systems of 33/50/66/83/100 people must add up to at least the occupants; the page suggests the fewest units.
- Calls to confirm with the user: post offices 2.4% total area (the scan shows "2%"), warehouses and shops
  under 200 m² keep their main-area % on a total-area basis (no value in the annex); special education over
  9 classrooms adds 5 m² to every classroom.

## בטיחות (added 2026-11-01)

Source: תקנות התכנון והבנייה (בקשה להיתר, תנאיו ואגרות), התש"ל-1970, second schedule, part ג' (fire safety),
from 3.1.1.1 — 3.2.12.1–3.2.12.7 (occupancy, width factors, corridors, mixed uses), 3.2.1.3 (doors), 3.2.1.21
(panic hardware), 3.2.2.2 (stairs), 3.2.13.2–3.2.13.3 (number of exits).

- A check has the building height (low / high 13–29 m / tower), residential, up to 2 apartments, sprinklers,
  and floors. Each floor has a level (0 = exit level), a corridor type (table 3.2.12.5), spaces and the
  proposed exits; floors can be duplicated.
- Space: use from table 3.2.12.2 → occupancy (area ÷ factor rounded up; seats, bench length ÷ 0.5 or planned
  people where the table says so; range factors chosen within the range). Exits from the room (3.2.13.2),
  door width = max(table 3.2.1.3, horizontal width ÷ exits), panic hardware above 100. Proposed doors,
  width and panic are checked.
- Floor: total occupancy; exits from the floor (3.2.13.3, single exit for a residential non-tower or ≤30
  people with ≤30 m travel as a checkbox, never fewer than the largest room needs); per exit: occupancy ÷
  exits × the widest factor on the floor (stairs / horizontal); corridor = max(table 3.2.12.5, calculated);
  stairs = max(3.2.2.2 minimum, the largest per-exit stair width of the floors it serves on the way to the
  exit level — 3.2.12.1(ג)); exit doors ≥ 0.90 into a stair, 1.10 at the exit level.
- Proposed exits are stairs or same-level exits, with door width, stair width and panic hardware.
- Calls: occupancy rounds up; hazardous areas only through use 39; travel distances are not calculated.
