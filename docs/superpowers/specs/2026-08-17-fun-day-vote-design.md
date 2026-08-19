# Fun Day vote site — design

Status: approved (2026-08-17)

## Summary

A single-page, animated, scroll-driven landing site for Knafo Klimor Architects' November 2026 office fun day. Employees scroll through a hero, four activity options, a vote form, and a live results chart. Votes are stored in Firebase Firestore and results update in real time for every visitor without a page refresh.

## Source data

Extracted from the two files the user attached:

**Team roster** (`רשימת צוות משרד.xlsx`, sheet `צוות`) — 27 employees, first name in row 4 (columns B–AB) paired with last name directly below in row 5. Column A is the firm's own name ("כלימור"), not an employee, and is excluded.

1. דוד קנפו
2. אריה חיון
3. יונתן מאירי
4. תמי בליזובסקי
5. נורית לוי
6. חנן רודיך
7. שי הרשקוביץ
8. נטע שוורץ
9. אסף כוהנים
10. דניאל פולישוק
11. מיקה מרקוסון
12. איילה שירן
13. יותם שדמי
14. אלון ניסן
15. סמיון פישקין
16. עדי רוזן
17. נועה גרגיר
18. שני בוזוקאשויל
19. גיא שפירו
20. שון הפוטה
21. שיר בן שואב
22. אוניר שטגמן
23. דניאל שר
24. עמית שהרבני
25. סתיו ברקוביץ
26. עדי מחוליה עמנואל
27. לי גלביס

Two employees share the first name "עדי" (רוזן, מחוליה עמנואל) and two share "דניאל" (פולישוק, שר) — the vote picker must always show full name (first + last), never first name alone, to disambiguate.

**Activity alternatives** (`חלופות יום כייף מצומצם.xlsx`, sheet `חלופות`) — 4 options:

| id | שם | תיאור | זמן | מיקום | הערות | קישור |
|---|---|---|---|---|---|---|
| `cooking` | סדנת בישול | בישול קבוצתי לפי סגנון | 3-5 שעות | תל אביב | אופציה לשילוב עם סיור בשוק | https://www.bishulon.co.il/ |
| `print` | סדנת הדפס (אופציה לשילוב קדרות לסירוגין) | סדנת הדפס קדום | 2 שעות | עין הוד | איש קשר: תמר נבון 054-4246549 | https://www.ein-hod.org/סדנת-הדפס-עין-הוד/ |
| `tlvshow` | TLVSHOW | פעילות חברתית בעיר בשילוב חידות/משחקים — כמו אסקייפ רום | 2-2.5 שעות | תל אביב / חיפה | מומלץ מאוד ע"י חברים; אופציית תל אביב הכי פופולרית | https://tlvshow.com/ (מקושר בלי פרמטרי מעקב) |
| `molet` | MOLET | סדנאות נגרות עם עץ ממוחזר | 3 שעות | בת ים | 4 תת-אפשרויות: אור ועץ / פריסטייל / קורה למחשבה / אימפקט | https://www.molet.org/he/workshops/heb-private/ |

## Visual direction (approved, v1 — superseded by v2 below for motion/background, palette still applies)

Monochrome, editorial, typography-led — matching the Knafo Klimor wordmark (black, thin rule, tracked-out caps). One restrained accent: sage green (`#8FB874` on dark, darker shade for light-background text), used sparingly for the rule under the title, active states, chart bars, and small "green building studio" type badges. No bright/playful palette, no gradients or drop shadows — flat surfaces, generous whitespace, confident large type.

## Visual direction v2 — blueprint + steel + green (approved 2026-08-17, after seeing Tasks 5-6 built)

After seeing the v1 hero and activities frame live, the user asked for something more creative/dynamic, referencing a high-end 3D WebGL site (liquidink.design/github_web/ — floating islands, connecting path, drifting particles). A full 3D/WebGL rebuild was judged out of scope for a one-off internal poll (that reference is weeks of dedicated 3D-artist + WebGL-dev production). Instead, the agreed direction keeps the same 2D DOM/CSS/GSAP stack (no Three.js, no WebGL, no custom 3D assets) but adds two things, applied to **all four frames**, not just the hero:

1. **Blueprint background layer** — a faint (15% opacity) sage-green architectural-drawing motif behind every frame's content: horizontal/vertical grid lines, and one L-shaped corner bracket mark (like a technical-drawing crop mark) at the block-start/inline-end corner. Implemented as pure CSS (`.frame::before` for the grid, `.frame::after` for the bracket, both `z-index: -1` inside a stacking context established by `.frame { z-index: 0 }`) rather than a JS-rendered helper or real DOM nodes — simpler, zero runtime cost, and automatically consistent across all four frames from one shared selector. **Revised down from the original mockup**, which also showed a circle (compass motif) and a second corner bracket — dropped as an implementation-time simplification (avoids a data-URI SVG or extra pseudo-element budget) that the single grid + bracket already reads as "blueprint" without. The bracket lands at the RTL *inline-end* corner (visually top-left on this Hebrew page) since it uses logical CSS properties (`inset-inline-end`) consistent with the rest of the RTL layout, not a fixed physical top-right.
2. **Construction-themed scroll transition** — replaces the plain fade-up-only reveal with a short sequence that plays the first time each frame scrolls into view, before/alongside the existing per-item fade-up stagger: a steel-toned beam slides in horizontally, a bolt/nut icon spins and "locks" at its center, then a small leaf icon briefly appears near a corner bracket as a completion accent (tying the construction motif back to the office's green-building identity) — then the frame's real content fades up as before. This is a `gsap.timeline()`, not a single tween, and still fires only once per frame (same IntersectionObserver + `unobserve` pattern already in place).

Palette is unchanged (still `--knafo-black` / `--knafo-white` / `--knafo-sage` / `--knafo-sage-dark` from Task 4) — v2 is about background texture and transition choreography, not new colors. No cursor-parallax, no 3D — those were the reference site's WebGL-specific techniques and are explicitly out of scope.

## Architecture

- **Frontend**: static site, vanilla HTML/CSS/JS (no framework/build step). One `index.html` plus a small number of JS modules and a stylesheet.
- **Animation**: CSS scroll-snap for frame-to-frame paging; GSAP (loaded via CDN) + IntersectionObserver for staggered entrance animations as each frame comes into view.
- **Chart**: Chart.js (CDN) bar chart, styled via its config API (flat bars, sage fill, no gridlines/shadows) to match the monochrome look.
- **Backend**: none (no server code). All persistence goes directly from the browser to Firebase.
- **Data store**: Firebase Firestore, single collection `votes`.
- **Hosting**: Firebase Hosting, deployed via `firebase deploy` from this repo.
- **Auth**: none. This is an internal tool for a known 27-person office; no login is required to vote or view results.

## Data model

Collection `votes`, one document per employee, **document ID = a fixed employee code `emp-01` .. `emp-27`**, assigned by position in the roster list above (`emp-01` = דוד קנפו, ... `emp-27` = לי גלביס). The code-to-name mapping is a hardcoded constant shared by the client code and the security rules — this sidesteps Hebrew transliteration entirely and guarantees no collisions. Fields:

```
{
  employeeName: string,   // full display name, e.g. "דוד קנפו"
  activityId: string,     // one of: cooking | print | tlvshow | molet
  updatedAt: Timestamp    // server timestamp, set on every write
}
```

Voting again with the same employee **overwrites** the existing document (same doc ID) — this is what gives "one vote per employee, changeable" without needing auth: picking your name and submitting always targets your own doc.

**Firestore security rules** restrict writes on `votes/{docId}` to documents where:
- `docId` is one of `emp-01`..`emp-27`
- `employeeName` matches the name that the hardcoded code-to-name mapping assigns to that `docId` (so a client can't write an arbitrary name into another employee's doc)
- `activityId` is one of the 4 known ids

Reads on `votes` are open (needed for the live results view). This is not tamper-proof against a determined employee poking DevTools — acceptable for a low-stakes internal poll, called out explicitly so it's a conscious trade-off, not an oversight.

## Frame-by-frame behavior

**Frame 1 — Hero**
"KNAFO KLIMOR ARCHITECTS" tracked-out label, "FUN DAY 2026" large title with sage-green "2026", thin sage rule, "NOVEMBER · TEL AVIV" subline, small "green building studio" badge. Animated scroll-down cue.

**Frame 2 — Activities**
Four cards (cooking, print, tlvshow, molet) in a responsive grid, each showing name, description, time, location, relevant notes, and an outbound link ("לפרטים נוספים ↗") to the activity's own website. Cards stagger into view on scroll (translate + fade).

**Frame 3 — Vote**
- Select dropdown of the 27 employees (full names), sorted by first name using Hebrew locale comparison (`localeCompare` with `'he'`).
- Four selectable activity cards/tiles (reuse the visual identity from frame 2, condensed) — single-select.
- Submit button, disabled until both a name and an activity are chosen.
- On submit: write/overwrite the Firestore doc for that employee, show a short animated confirmation ("ההצבעה שלך נרשמה!"), and pre-fill the form with the employee's existing choice if they reopen the picker and had already voted (read their doc after selecting their name, so re-voting shows their current pick rather than a blank form).
- Client-side validation: submit button stays disabled (not just an error message) until both fields are filled, consistent with the no-empty-required-field rule.

**Frame 4 — Results**
Live bar chart, one bar per activity, height/value = vote count. Hover/tap a bar shows exact count and percentage of votes cast so far. Numbers animate (count-up) on first load and on live updates. A Firestore `onSnapshot` listener on the `votes` collection recomputes counts and re-renders the chart whenever any vote changes, for every open tab, with no manual refresh.

## Error handling

- Firestore write failure (offline, rules rejection, etc.): show an inline error near the submit button ("לא הצלחנו לשמור את ההצבעה — נסה שוב") and keep the form filled in so the user doesn't lose their selection. Do not silently fail.
- Firestore read failure on the results frame: show a quiet inline message ("לא ניתן לטעון תוצאות כרגע") instead of a blank/broken chart.
- Employee not found in the 27-name list (shouldn't happen since it's a closed dropdown, not free text) — no separate handling needed given the input is constrained by construction.

## Testing / verification plan

Since this is a browser-facing static site with a live backend, verification is manual through the browser preview once Firebase is wired up:
1. Load the page, scroll through all 4 frames, confirm entrance animations fire once per frame (not re-triggering awkwardly on scroll-back).
2. Submit a vote for a test employee, confirm it appears in the Firestore console and the results chart updates in another open tab without refresh.
3. Re-vote as the same employee with a different activity, confirm the old vote is replaced (Firestore doc count stays at 1 for that employee, `activityId` changed).
4. Check the "already voted" pre-fill: pick a name that has already voted, confirm the form shows their existing choice.
5. Resize to mobile width, confirm frames and the vote form remain usable (dropdown, buttons, chart) — this is going out to a full office over email, likely opened on phones as often as desktops.

## Deployment & rollout

1. User creates a Firebase project at console.firebase.google.com under their own Google account (~5 minutes) and shares the public client config (apiKey, projectId, etc. — not secret, safe to embed client-side) with the assistant.
2. Assistant wires the config into the site, sets up Firestore + security rules, and deploys via Firebase Hosting, producing a `*.web.app` URL (or a custom domain later, if wanted).
3. Assistant drafts a short Hebrew email announcing the fun day and containing the link; the user reviews and sends it to the team themselves (no automated mass email).

## Out of scope

- No login/authentication.
- No admin dashboard beyond the public results chart (the results frame *is* the admin view — anyone with the link can see live counts).
- No voting deadline/results-lock mechanism — results are always live and always visible.
- No custom domain setup unless requested later.
