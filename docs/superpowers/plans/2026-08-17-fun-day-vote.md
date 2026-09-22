# Fun Day Vote Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a single animated scroll page where Knafo Klimor employees see the fun-day activity options, vote for one, and watch live results — backed by Firebase, no server code.

**Architecture:** A static site (`funday/public/`) with plain HTML/CSS and ES module JavaScript, no build step. Two small pure-logic modules (`data.js`, `results.js`) are unit tested with Node's built-in test runner; everything else (DOM rendering, animations, Firebase reads/writes) is verified manually in a browser, per the design spec's testing plan. Firebase Firestore holds one vote document per employee (`votes/emp-01` .. `votes/emp-27`); Firebase Hosting serves the static files.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), GSAP (CDN) for entrance animations, Chart.js (CDN) for the results bar chart, Firebase Firestore + Hosting (Firebase JS SDK v10 via CDN ES module imports), Node.js built-in test runner (`node --test`) for the two logic modules.

**Reference:** `docs/superpowers/specs/2026-08-17-fun-day-vote-design.md` — read it before starting; this plan implements it task by task.

---

### Task 1: Project scaffold + employee/activity data module

**Files:**
- Create: `funday/package.json`
- Create: `funday/public/js/data.js`
- Test: `funday/public/js/data.test.js`

- [ ] **Step 1: Create the package scaffold**

```json
{
  "name": "knafo-klimor-funday",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test public/js"
  }
}
```
Save as `funday/package.json`.

- [ ] **Step 2: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPLOYEES,
  ACTIVITIES,
  getEmployeeById,
  getActivityById,
  isValidEmployeeId,
  isValidActivityId,
  employeesSortedForDropdown,
} from './data.js';

test('has exactly 27 employees with unique ids and non-empty names', () => {
  assert.equal(EMPLOYEES.length, 27);
  const ids = EMPLOYEES.map((e) => e.id);
  assert.equal(new Set(ids).size, 27);
  for (const employee of EMPLOYEES) {
    assert.match(employee.id, /^emp-\d{2}$/);
    assert.ok(employee.name.trim().length > 0);
  }
});

test('has exactly 4 activities with unique ids matching the known set', () => {
  assert.equal(ACTIVITIES.length, 4);
  const ids = ACTIVITIES.map((a) => a.id).sort();
  assert.deepEqual(ids, ['cooking', 'molet', 'print', 'tlvshow']);
});

test('getEmployeeById finds a known employee and returns null for unknown', () => {
  assert.equal(getEmployeeById('emp-01').name, 'דוד קנפו');
  assert.equal(getEmployeeById('emp-99'), null);
});

test('getActivityById finds a known activity and returns null for unknown', () => {
  assert.equal(getActivityById('molet').name, 'MOLET');
  assert.equal(getActivityById('unknown'), null);
});

test('isValidEmployeeId / isValidActivityId reject unknown ids', () => {
  assert.equal(isValidEmployeeId('emp-01'), true);
  assert.equal(isValidEmployeeId('emp-28'), false);
  assert.equal(isValidActivityId('cooking'), true);
  assert.equal(isValidActivityId('bogus'), false);
});

test('employeesSortedForDropdown returns all 27 employees sorted by Hebrew name', () => {
  const sorted = employeesSortedForDropdown();
  assert.equal(sorted.length, 27);
  const names = sorted.map((e) => e.name);
  const expected = [...names].sort((a, b) => a.localeCompare(b, 'he'));
  assert.deepEqual(names, expected);
});
```
Save as `funday/public/js/data.test.js`.

- [ ] **Step 3: Run the test to verify it fails**

Run (from `funday/`): `npm test`
Expected: FAIL — `Cannot find module './data.js'`

- [ ] **Step 4: Write the data module**

```javascript
export const EMPLOYEES = [
  { id: 'emp-01', name: 'דוד קנפו' },
  { id: 'emp-02', name: 'אריה חיון' },
  { id: 'emp-03', name: 'יונתן מאירי' },
  { id: 'emp-04', name: 'תמי בליזובסקי' },
  { id: 'emp-05', name: 'נורית לוי' },
  { id: 'emp-06', name: 'חנן רודיך' },
  { id: 'emp-07', name: 'שי הרשקוביץ' },
  { id: 'emp-08', name: 'נטע שוורץ' },
  { id: 'emp-09', name: 'אסף כוהנים' },
  { id: 'emp-10', name: 'דניאל פולישוק' },
  { id: 'emp-11', name: 'מיקה מרקוסון' },
  { id: 'emp-12', name: 'איילה שירן' },
  { id: 'emp-13', name: 'יותם שדמי' },
  { id: 'emp-14', name: 'אלון ניסן' },
  { id: 'emp-15', name: 'סמיון פישקין' },
  { id: 'emp-16', name: 'עדי רוזן' },
  { id: 'emp-17', name: 'נועה גרגיר' },
  { id: 'emp-18', name: 'שני בוזוקאשויל' },
  { id: 'emp-19', name: 'גיא שפירו' },
  { id: 'emp-20', name: 'שון הפוטה' },
  { id: 'emp-21', name: 'שיר בן שואב' },
  { id: 'emp-22', name: 'אוניר שטגמן' },
  { id: 'emp-23', name: 'דניאל שר' },
  { id: 'emp-24', name: 'עמית שהרבני' },
  { id: 'emp-25', name: 'סתיו ברקוביץ' },
  { id: 'emp-26', name: 'עדי מחוליה עמנואל' },
  { id: 'emp-27', name: 'לי גלביס' },
];

export const ACTIVITIES = [
  {
    id: 'cooking',
    name: 'סדנת בישול',
    description: 'בישול קבוצתי לפי סגנון',
    time: '3-5 שעות',
    location: 'תל אביב',
    notes: 'אופציה לשילוב עם סיור בשוק',
    link: 'https://www.bishulon.co.il/',
  },
  {
    id: 'print',
    name: 'סדנת הדפס',
    description: 'סדנת הדפס קדום (אופציה לשילוב קדרות לסירוגין)',
    time: '2 שעות',
    location: 'עין הוד',
    notes: 'איש קשר: תמר נבון, 054-4246549',
    link: 'https://www.ein-hod.org/סדנת-הדפס-עין-הוד/',
  },
  {
    id: 'tlvshow',
    name: 'TLVSHOW',
    description: 'פעילות חברתית בעיר בשילוב חידות ומשחקים — כמו אסקייפ רום',
    time: '2-2.5 שעות',
    location: 'תל אביב / חיפה',
    notes: 'מומלץ מאוד ע"י חברים, האפשרות של תל אביב הכי פופולרית',
    link: 'https://tlvshow.com/',
  },
  {
    id: 'molet',
    name: 'MOLET',
    description: 'סדנאות נגרות עם עץ ממוחזר',
    time: '3 שעות',
    location: 'בת ים',
    notes: 'אפשרויות: אור ועץ, פריסטייל, קורה למחשבה, אימפקט',
    link: 'https://www.molet.org/he/workshops/heb-private/',
  },
];

export function getEmployeeById(id) {
  return EMPLOYEES.find((employee) => employee.id === id) ?? null;
}

export function getActivityById(id) {
  return ACTIVITIES.find((activity) => activity.id === id) ?? null;
}

export function isValidEmployeeId(id) {
  return EMPLOYEES.some((employee) => employee.id === id);
}

export function isValidActivityId(id) {
  return ACTIVITIES.some((activity) => activity.id === id);
}

export function employeesSortedForDropdown() {
  return [...EMPLOYEES].sort((a, b) => a.name.localeCompare(b.name, 'he'));
}
```
Save as `funday/public/js/data.js`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 6 tests passing

- [ ] **Step 6: Commit**

```bash
git add funday/package.json funday/public/js/data.js funday/public/js/data.test.js
git commit -m "feat(funday): add employee and activity data module"
```

---

### Task 2: Vote aggregation logic module

**Files:**
- Create: `funday/public/js/results.js`
- Test: `funday/public/js/results.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateVotes } from './results.js';

const activities = [
  { id: 'cooking', name: 'סדנת בישול' },
  { id: 'print', name: 'סדנת הדפס' },
  { id: 'tlvshow', name: 'TLVSHOW' },
  { id: 'molet', name: 'MOLET' },
];

test('returns zero counts and zero percent for every activity when there are no votes', () => {
  const result = aggregateVotes([], activities);
  assert.equal(result.length, 4);
  for (const row of result) {
    assert.equal(row.count, 0);
    assert.equal(row.percent, 0);
  }
});

test('counts votes per activity and preserves activities order', () => {
  const votes = [
    { activityId: 'molet' },
    { activityId: 'cooking' },
    { activityId: 'molet' },
    { activityId: 'cooking' },
    { activityId: 'cooking' },
  ];
  const result = aggregateVotes(votes, activities);
  assert.deepEqual(result.map((r) => r.id), ['cooking', 'print', 'tlvshow', 'molet']);
  assert.equal(result.find((r) => r.id === 'cooking').count, 3);
  assert.equal(result.find((r) => r.id === 'molet').count, 2);
  assert.equal(result.find((r) => r.id === 'print').count, 0);
});

test('computes rounded percentages that reflect vote share', () => {
  const votes = [
    { activityId: 'cooking' },
    { activityId: 'cooking' },
    { activityId: 'print' },
  ];
  const result = aggregateVotes(votes, activities);
  assert.equal(result.find((r) => r.id === 'cooking').percent, 67);
  assert.equal(result.find((r) => r.id === 'print').percent, 33);
  assert.equal(result.find((r) => r.id === 'tlvshow').percent, 0);
});

test('ignores votes with an activityId not in the known list', () => {
  const votes = [{ activityId: 'cooking' }, { activityId: 'unknown-activity' }];
  const result = aggregateVotes(votes, activities);
  assert.equal(result.find((r) => r.id === 'cooking').count, 1);
  const total = result.reduce((sum, r) => sum + r.count, 0);
  assert.equal(total, 1);
});
```
Save as `funday/public/js/results.test.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './results.js'`

- [ ] **Step 3: Write the aggregation function**

```javascript
export function aggregateVotes(votes, activities) {
  const total = votes.length;
  const counts = new Map(activities.map((activity) => [activity.id, 0]));

  for (const vote of votes) {
    if (counts.has(vote.activityId)) {
      counts.set(vote.activityId, counts.get(vote.activityId) + 1);
    }
  }

  return activities.map((activity) => {
    const count = counts.get(activity.id);
    const percent = total === 0 ? 0 : Math.round((count / total) * 100);
    return { id: activity.id, name: activity.name, count, percent };
  });
}
```
Save as `funday/public/js/results.js`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 10 tests passing total (6 from Task 1 + 4 here)

- [ ] **Step 5: Commit**

```bash
git add funday/public/js/results.js funday/public/js/results.test.js
git commit -m "feat(funday): add vote aggregation logic"
```

---

### Task 3: HTML skeleton

**Files:**
- Create: `funday/public/index.html`
- Create: `funday/public/js/main.js`

- [ ] **Step 1: Write the HTML skeleton**

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KNAFO KLIMOR — FUN DAY 2026</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>

  <section id="frame-hero" class="frame frame--dark" data-reveal>
    <p class="eyebrow" data-reveal-item>KNAFO KLIMOR ARCHITECTS</p>
    <h1 class="hero-title" data-reveal-item>FUN DAY <span class="hero-title__accent">2026</span></h1>
    <div class="rule rule--center" data-reveal-item></div>
    <p class="hero-sub" data-reveal-item>NOVEMBER · TEL AVIV</p>
    <p class="badge badge--sage" data-reveal-item>Green building studio</p>
    <div class="scroll-cue" aria-hidden="true">↓</div>
  </section>

  <section id="frame-activities" class="frame" data-reveal>
    <p class="eyebrow" data-reveal-item>החלופות</p>
    <h2 class="frame-title" data-reveal-item>לאן יוצאים השנה?</h2>
    <div id="activities-grid" class="activities-grid"></div>
  </section>

  <section id="frame-vote" class="frame" data-reveal>
    <p class="eyebrow" data-reveal-item>ההצבעה</p>
    <h2 class="frame-title" data-reveal-item>מה הבחירה שלך?</h2>
    <form id="vote-form" class="vote-form" data-reveal-item>
      <label for="employee-select">השם שלי</label>
      <select id="employee-select" required></select>

      <p class="vote-form__label">הפעילות שבחרתי</p>
      <div id="activity-picker" class="activity-picker"></div>

      <button id="vote-submit" type="submit" disabled>שולח/ת הצבעה</button>
      <p id="vote-error" class="form-message form-message--error" hidden>לא הצלחנו לשמור את ההצבעה — נסה/י שוב.</p>
      <p id="vote-confirmation" class="form-message form-message--success" hidden>ההצבעה שלך נרשמה!</p>
    </form>
  </section>

  <section id="frame-results" class="frame" data-reveal>
    <p class="eyebrow" data-reveal-item>התוצאות</p>
    <h2 class="frame-title" data-reveal-item>איך זה עומד עד עכשיו</h2>
    <p data-reveal-item><span id="results-total" data-value="0">0</span> הצבעות עד כה</p>
    <div class="chart-wrap" data-reveal-item>
      <canvas id="results-chart"></canvas>
    </div>
    <p id="results-error" class="form-message form-message--error" hidden>לא ניתן לטעון תוצאות כרגע.</p>
  </section>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.4/chart.umd.min.js"></script>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```
Save as `funday/public/index.html`.

- [ ] **Step 2: Write a minimal entry point**

```javascript
document.addEventListener('DOMContentLoaded', () => {
  console.log('funday loaded');
});
```
Save as `funday/public/js/main.js`. Later tasks add real wiring here.

- [ ] **Step 3: Serve and check it loads without console errors**

Run (from `funday/public/`): `python -m http.server 8000`
Open `http://localhost:8000` in a browser. Expected: unstyled page showing the 4 sections' text content top to bottom, no console errors, "funday loaded" logged.

- [ ] **Step 4: Commit**

```bash
git add funday/public/index.html funday/public/js/main.js
git commit -m "feat(funday): add page skeleton with four frame sections"
```

---

### Task 4: Base styles (tokens, reset, scroll-snap layout)

**Files:**
- Create: `funday/public/css/styles.css`

- [ ] **Step 1: Write the base stylesheet**

```css
:root {
  --knafo-black: #0b0b0a;
  --knafo-white: #ffffff;
  --knafo-gray: #6b6b68;
  --knafo-gray-light: #d8d8d5;
  --knafo-sage: #8fb874;
  --knafo-sage-dark: #3d5c33;
  --frame-padding: clamp(24px, 6vw, 64px);
}

* {
  box-sizing: border-box;
}

html {
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
}

body {
  margin: 0;
  font-family: 'Assistant', system-ui, sans-serif;
  color: var(--knafo-black);
  background: var(--knafo-white);
  direction: rtl;
}

.frame {
  min-height: 100vh;
  scroll-snap-align: start;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: var(--frame-padding);
  position: relative;
}

.frame--dark {
  background: var(--knafo-black);
  color: var(--knafo-white);
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 3px;
  color: var(--knafo-gray);
  text-transform: uppercase;
  margin: 0 0 12px;
}

.frame--dark .eyebrow {
  color: var(--knafo-gray-light);
}

.frame-title {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 500;
  margin: 0 0 32px;
}

.rule {
  width: 40px;
  height: 1px;
  background: var(--knafo-sage);
  margin: 16px 0;
}

.rule--center {
  margin-inline: auto;
}

.form-message {
  font-size: 14px;
  margin-top: 12px;
}

.form-message--error {
  color: #a32d2d;
}

.form-message--success {
  color: var(--knafo-sage-dark);
}
```
Save as `funday/public/css/styles.css`.

- [ ] **Step 2: Reload and verify frame layout**

With the Task 3 local server still running, reload `http://localhost:8000`. Expected: each section fills the viewport height, scrolling snaps one frame at a time, hero frame is black with light text, other frames are white with dark text.

- [ ] **Step 3: Commit**

```bash
git add funday/public/css/styles.css
git commit -m "feat(funday): add base tokens, reset, and scroll-snap frame layout"
```

---

### Task 5: Hero frame styling + scroll animations

**Files:**
- Create: `funday/public/js/animations.js`
- Modify: `funday/public/css/styles.css` (append)
- Modify: `funday/public/js/main.js`

- [ ] **Step 1: Write the animation module**

```javascript
const gsap = window.gsap;

export function initScrollReveal() {
  const frames = document.querySelectorAll('.frame[data-reveal]');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const frame = entry.target;
        const items = frame.querySelectorAll('[data-reveal-item]');
        gsap.fromTo(
          items,
          { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: 'power2.out' }
        );
        observer.unobserve(frame);
      }
    },
    { threshold: 0.35 }
  );

  for (const frame of frames) {
    observer.observe(frame);
  }
}

export function initScrollCue() {
  const cue = document.querySelector('.scroll-cue');
  if (!cue) return;
  gsap.to(cue, {
    y: 10,
    duration: 1.1,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
  });
}
```
Save as `funday/public/js/animations.js`.

- [ ] **Step 2: Append hero-specific CSS**

```css
.hero-title {
  font-size: clamp(36px, 8vw, 64px);
  font-weight: 500;
  letter-spacing: 1px;
  margin: 0;
}

.hero-title__accent {
  color: var(--knafo-sage);
}

.hero-sub {
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--knafo-gray-light);
  margin: 0 0 16px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  border-radius: 20px;
  padding: 4px 14px;
}

.badge--sage {
  color: var(--knafo-sage);
  border: 0.5px solid var(--knafo-sage-dark);
}

.scroll-cue {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 20px;
  color: var(--knafo-sage);
}
```
Append to `funday/public/css/styles.css`.

- [ ] **Step 3: Wire the animations into the entry point**

```javascript
import { initScrollReveal, initScrollCue } from './animations.js';

document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  initScrollCue();
});
```
Replace the contents of `funday/public/js/main.js` with the above.

- [ ] **Step 4: Reload and verify the hero animation**

Reload `http://localhost:8000`. Expected: hero frame's eyebrow/title/rule/subline/badge fade and slide up in a staggered sequence on load (since it starts in view), the down-arrow scroll cue bobs continuously, and scrolling down to a later frame triggers its own reveal only once (scrolling back up and down again should not re-trigger it).

- [ ] **Step 5: Commit**

```bash
git add funday/public/js/animations.js funday/public/js/main.js funday/public/css/styles.css
git commit -m "feat(funday): add hero styling and scroll-triggered reveal animations"
```

---

### Task 6: Activities frame

**Files:**
- Create: `funday/public/js/activities-view.js`
- Modify: `funday/public/css/styles.css` (append)
- Modify: `funday/public/js/main.js`

- [ ] **Step 1: Write the activities rendering module**

```javascript
import { ACTIVITIES } from './data.js';

export function renderActivityCards() {
  const grid = document.getElementById('activities-grid');
  grid.innerHTML = '';
  for (const activity of ACTIVITIES) {
    const card = document.createElement('article');
    card.className = 'activity-card';
    card.setAttribute('data-reveal-item', '');
    card.innerHTML = `
      <h3>${activity.name}</h3>
      <p class="activity-card__desc">${activity.description}</p>
      <dl class="activity-card__meta">
        <div><dt>זמן</dt><dd>${activity.time}</dd></div>
        <div><dt>מיקום</dt><dd>${activity.location}</dd></div>
      </dl>
      <p class="activity-card__notes">${activity.notes}</p>
      <a class="activity-card__link" href="${activity.link}" target="_blank" rel="noopener noreferrer">לפרטים נוספים ↗</a>
    `;
    grid.appendChild(card);
  }
}
```
Save as `funday/public/js/activities-view.js`.

- [ ] **Step 2: Append activities grid CSS**

```css
.activities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1000px;
  text-align: right;
}

.activity-card {
  border: 0.5px solid var(--knafo-gray-light);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.activity-card h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.activity-card__desc {
  margin: 0;
  color: var(--knafo-gray);
}

.activity-card__meta {
  display: flex;
  gap: 20px;
  margin: 0;
  font-size: 13px;
}

.activity-card__meta dt {
  color: var(--knafo-gray);
}

.activity-card__meta dd {
  margin: 0;
  font-weight: 500;
}

.activity-card__notes {
  font-size: 13px;
  color: var(--knafo-gray);
  margin: 0;
}

.activity-card__link {
  color: var(--knafo-sage-dark);
  font-size: 13px;
  text-decoration: none;
  margin-top: auto;
}

.activity-card__link:hover {
  text-decoration: underline;
}
```
Append to `funday/public/css/styles.css`.

- [ ] **Step 3: Wire it into the entry point**

```javascript
import { initScrollReveal, initScrollCue } from './animations.js';
import { renderActivityCards } from './activities-view.js';

document.addEventListener('DOMContentLoaded', () => {
  renderActivityCards();
  initScrollReveal();
  initScrollCue();
});
```
Replace the contents of `funday/public/js/main.js` with the above.

- [ ] **Step 4: Reload and verify**

Reload `http://localhost:8000`, scroll to the activities frame. Expected: 4 cards (cooking, print, TLVSHOW, MOLET) with description/time/location/notes/link, each opening its real external site in a new tab, staggering into view once as the frame scrolls into place.

- [ ] **Step 5: Commit**

```bash
git add funday/public/js/activities-view.js funday/public/js/main.js funday/public/css/styles.css
git commit -m "feat(funday): render activity cards from data module"
```

---

### Task 7: Firebase project wiring

**Files:**
- Create: `funday/public/js/firebase-init.js`
- Create: `funday/firebase.json`
- Create: `funday/.firebaserc`
- Create: `funday/firestore.rules`
- Create: `funday/.gitignore`

- [ ] **Step 1: Get a Firebase project (you, not the assistant)**

1. Go to `https://console.firebase.google.com` signed in with your own Google account.
2. Click "Add project", name it (e.g. `knafo-klimor-funday`), disable Google Analytics for it (not needed).
3. Once created, go to Build → Firestore Database → Create database → start in **production mode** → pick a region close to Israel (e.g. `europe-west1`).
4. Go to Project settings (gear icon) → General → "Your apps" → click the `</>` (web) icon → register an app (any nickname) → **do not** check "Firebase Hosting" in that wizard, we set hosting up separately below.
5. Copy the `firebaseConfig` object shown — you'll paste its values into Step 2 below.
6. In a terminal, install the Firebase CLI once if you don't have it: `npm install -g firebase-tools`, then `firebase login` (opens a browser to sign in with the same Google account).

- [ ] **Step 2: Write the Firebase client init, with your real config values**

```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'REPLACE_WITH_YOUR_API_KEY',
  authDomain: 'REPLACE_WITH_YOUR_PROJECT.firebaseapp.com',
  projectId: 'REPLACE_WITH_YOUR_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_YOUR_PROJECT.appspot.com',
  messagingSenderId: 'REPLACE_WITH_YOUR_SENDER_ID',
  appId: 'REPLACE_WITH_YOUR_APP_ID',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
```
Save as `funday/public/js/firebase-init.js`, then replace all six `REPLACE_WITH_*` values with the matching fields from the `firebaseConfig` object you copied in Step 1. These values are safe to ship in client-side code — they identify the project, they are not secrets — security is enforced by the Firestore rules in Step 5, not by hiding this config.

- [ ] **Step 3: Write the hosting/firestore config**

```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "**/*.test.js"]
  },
  "firestore": {
    "rules": "firestore.rules"
  }
}
```
Save as `funday/firebase.json`.

```json
{
  "projects": {
    "default": "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID"
  }
}
```
Save as `funday/.firebaserc`, then replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` with the same `projectId` you used in Step 2.

- [ ] **Step 4: Write the ignore file**

```
.firebase/
firebase-debug.log
firestore-debug.log
```
Save as `funday/.gitignore`.

- [ ] **Step 5: Write the security rules**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function employeeNames() {
      return {
        'emp-01': 'דוד קנפו',
        'emp-02': 'אריה חיון',
        'emp-03': 'יונתן מאירי',
        'emp-04': 'תמי בליזובסקי',
        'emp-05': 'נורית לוי',
        'emp-06': 'חנן רודיך',
        'emp-07': 'שי הרשקוביץ',
        'emp-08': 'נטע שוורץ',
        'emp-09': 'אסף כוהנים',
        'emp-10': 'דניאל פולישוק',
        'emp-11': 'מיקה מרקוסון',
        'emp-12': 'איילה שירן',
        'emp-13': 'יותם שדמי',
        'emp-14': 'אלון ניסן',
        'emp-15': 'סמיון פישקין',
        'emp-16': 'עדי רוזן',
        'emp-17': 'נועה גרגיר',
        'emp-18': 'שני בוזוקאשויל',
        'emp-19': 'גיא שפירו',
        'emp-20': 'שון הפוטה',
        'emp-21': 'שיר בן שואב',
        'emp-22': 'אוניר שטגמן',
        'emp-23': 'דניאל שר',
        'emp-24': 'עמית שהרבני',
        'emp-25': 'סתיו ברקוביץ',
        'emp-26': 'עדי מחוליה עמנואל',
        'emp-27': 'לי גלביס'
      };
    }

    function activityIds() {
      return ['cooking', 'print', 'tlvshow', 'molet'];
    }

    match /votes/{docId} {
      allow read: if true;
      allow write: if docId in employeeNames().keys()
        && request.resource.data.employeeName == employeeNames()[docId]
        && request.resource.data.activityId in activityIds()
        && request.resource.data.keys().hasAll(['employeeName', 'activityId', 'updatedAt']);
    }
  }
}
```
Save as `funday/firestore.rules`. **This list must stay in sync with `EMPLOYEES` in `public/js/data.js` (Task 1)** — the rules language can't import the JS module, so the 27 names are duplicated here by necessity; if the roster ever changes, both files need updating together.

- [ ] **Step 6: Deploy the rules and verify them**

Run (from `funday/`): `firebase deploy --only firestore:rules`
Then open the Firebase console → Firestore Database → Rules tab → "Rules playground": simulate a `create` on `votes/emp-01` with `{employeeName: "דוד קנפו", activityId: "cooking", updatedAt: <timestamp>}` → expect **Allow**. Simulate the same with `employeeName: "מישהו אחר"` → expect **Deny**.

- [ ] **Step 7: Commit**

```bash
git add funday/public/js/firebase-init.js funday/firebase.json funday/.firebaserc funday/firestore.rules funday/.gitignore
git commit -m "feat(funday): wire up Firebase Firestore and hosting config"
```

---

### Task 8: Vote frame

**Files:**
- Create: `funday/public/js/vote.js`
- Modify: `funday/public/css/styles.css` (append)
- Modify: `funday/public/js/main.js`

- [ ] **Step 1: Write the vote form module**

```javascript
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { db } from './firebase-init.js';
import { EMPLOYEES, ACTIVITIES, isValidActivityId, employeesSortedForDropdown } from './data.js';

let selectedActivityId = null;

function renderEmployeeOptions(selectEl) {
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'בחר/י את שמך';
  selectEl.appendChild(placeholder);

  for (const employee of employeesSortedForDropdown()) {
    const option = document.createElement('option');
    option.value = employee.id;
    option.textContent = employee.name;
    selectEl.appendChild(option);
  }
}

function renderActivityTiles(container) {
  container.innerHTML = '';
  for (const activity of ACTIVITIES) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'activity-tile';
    tile.dataset.activityId = activity.id;
    tile.textContent = activity.name;
    tile.addEventListener('click', () => {
      selectedActivityId = activity.id;
      for (const sibling of container.querySelectorAll('.activity-tile')) {
        sibling.classList.toggle('is-selected', sibling === tile);
      }
      updateSubmitState();
    });
    container.appendChild(tile);
  }
}

function updateSubmitState() {
  const submitBtn = document.getElementById('vote-submit');
  const employeeSelect = document.getElementById('employee-select');
  submitBtn.disabled = !employeeSelect.value || !selectedActivityId;
}

async function prefillExistingVote(employeeId, container) {
  selectedActivityId = null;
  for (const tile of container.querySelectorAll('.activity-tile')) {
    tile.classList.remove('is-selected');
  }
  const snap = await getDoc(doc(db, 'votes', employeeId));
  if (snap.exists()) {
    const existing = snap.data();
    selectedActivityId = isValidActivityId(existing.activityId) ? existing.activityId : null;
    const matchingTile = container.querySelector(`[data-activity-id="${selectedActivityId}"]`);
    if (matchingTile) matchingTile.classList.add('is-selected');
  }
  updateSubmitState();
}

async function handleSubmit(event) {
  event.preventDefault();
  const employeeSelect = document.getElementById('employee-select');
  const errorEl = document.getElementById('vote-error');
  const confirmationEl = document.getElementById('vote-confirmation');
  const employeeId = employeeSelect.value;

  if (!employeeId || !selectedActivityId) return;

  const employee = EMPLOYEES.find((e) => e.id === employeeId);
  errorEl.hidden = true;
  confirmationEl.hidden = true;

  try {
    await setDoc(doc(db, 'votes', employeeId), {
      employeeName: employee.name,
      activityId: selectedActivityId,
      updatedAt: serverTimestamp(),
    });
    confirmationEl.hidden = false;
  } catch (error) {
    console.error('Failed to save vote', error);
    errorEl.hidden = false;
  }
}

export function initVoteForm() {
  const employeeSelect = document.getElementById('employee-select');
  const activityContainer = document.getElementById('activity-picker');
  const form = document.getElementById('vote-form');

  renderEmployeeOptions(employeeSelect);
  renderActivityTiles(activityContainer);

  employeeSelect.addEventListener('change', () => {
    document.getElementById('vote-confirmation').hidden = true;
    if (employeeSelect.value) {
      prefillExistingVote(employeeSelect.value, activityContainer);
    } else {
      selectedActivityId = null;
      for (const tile of activityContainer.querySelectorAll('.activity-tile')) {
        tile.classList.remove('is-selected');
      }
      updateSubmitState();
    }
  });

  form.addEventListener('submit', handleSubmit);
  updateSubmitState();
}
```
Save as `funday/public/js/vote.js`.

- [ ] **Step 2: Append vote form CSS**

```css
.vote-form {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.vote-form label,
.vote-form__label {
  font-size: 13px;
  color: var(--knafo-gray);
  text-align: right;
  margin: 0;
}

.vote-form select {
  padding: 10px 12px;
  font-size: 15px;
  border: 0.5px solid var(--knafo-gray-light);
  border-radius: 8px;
  font-family: inherit;
}

.activity-picker {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.activity-tile {
  padding: 12px;
  border: 0.5px solid var(--knafo-gray-light);
  border-radius: 8px;
  background: var(--knafo-white);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}

.activity-tile.is-selected {
  border-color: var(--knafo-sage-dark);
  background: rgba(143, 184, 116, 0.12);
  font-weight: 500;
}

.vote-form button[type='submit'] {
  padding: 12px;
  font-size: 15px;
  border-radius: 8px;
  border: none;
  background: var(--knafo-black);
  color: var(--knafo-white);
  cursor: pointer;
}

.vote-form button[type='submit']:disabled {
  background: var(--knafo-gray-light);
  color: var(--knafo-gray);
  cursor: not-allowed;
}
```
Append to `funday/public/css/styles.css`.

- [ ] **Step 3: Wire it into the entry point**

```javascript
import { initScrollReveal, initScrollCue } from './animations.js';
import { renderActivityCards } from './activities-view.js';
import { initVoteForm } from './vote.js';

document.addEventListener('DOMContentLoaded', () => {
  renderActivityCards();
  initVoteForm();
  initScrollReveal();
  initScrollCue();
});
```
Replace the contents of `funday/public/js/main.js` with the above.

- [ ] **Step 4: Reload and verify against your real Firebase project**

Reload `http://localhost:8000`, scroll to the vote frame. Pick a name, confirm the submit button stays disabled until an activity is also picked. Pick an activity, submit, confirm the success message appears. In the Firebase console → Firestore Database → `votes` collection, confirm a document with the matching `emp-XX` id and correct `employeeName`/`activityId`/`updatedAt` exists. Re-select the same name from the dropdown and confirm the matching activity tile is pre-selected. Pick a different activity and resubmit — confirm the same document updates in place (collection still has exactly one doc for that employee).

- [ ] **Step 5: Commit**

```bash
git add funday/public/js/vote.js funday/public/js/main.js funday/public/css/styles.css
git commit -m "feat(funday): add vote form with prefill and Firestore write"
```

---

### Task 9: Results frame

**Files:**
- Create: `funday/public/js/results-view.js`
- Modify: `funday/public/css/styles.css` (append)
- Modify: `funday/public/js/main.js`

- [ ] **Step 1: Write the results rendering module**

```javascript
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { db } from './firebase-init.js';
import { ACTIVITIES } from './data.js';
import { aggregateVotes } from './results.js';

const Chart = window.Chart;
let chart = null;

function animateNumber(el, from, to, duration = 500) {
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const value = Math.round(from + (to - from) * progress);
    el.textContent = String(value);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderChart(rows) {
  const canvas = document.getElementById('results-chart');
  const data = {
    labels: rows.map((row) => row.name),
    datasets: [
      {
        data: rows.map((row) => row.count),
        backgroundColor: '#8fb874',
        borderRadius: 4,
        borderSkipped: false,
      },
    ],
  };

  if (!chart) {
    chart = new Chart(canvas, {
      type: 'bar',
      data,
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const row = rows[context.dataIndex];
                return `${row.count} הצבעות (${row.percent}%)`;
              },
            },
          },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: { grid: { display: false } },
        },
      },
    });
  } else {
    chart.data = data;
    chart.update();
  }
}

function renderTotal(rows) {
  const totalEl = document.getElementById('results-total');
  if (!totalEl) return;
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const previous = Number(totalEl.dataset.value || '0');
  animateNumber(totalEl, previous, total);
  totalEl.dataset.value = String(total);
}

export function initResultsView() {
  const errorEl = document.getElementById('results-error');
  const votesRef = collection(db, 'votes');
  onSnapshot(
    votesRef,
    (snapshot) => {
      if (errorEl) errorEl.hidden = true;
      const votes = snapshot.docs.map((docSnap) => docSnap.data());
      const rows = aggregateVotes(votes, ACTIVITIES);
      renderChart(rows);
      renderTotal(rows);
    },
    (error) => {
      console.error('Failed to load results', error);
      if (errorEl) errorEl.hidden = false;
    }
  );
}
```
Save as `funday/public/js/results-view.js`.

- [ ] **Step 2: Append results frame CSS**

```css
.chart-wrap {
  width: 100%;
  max-width: 640px;
  height: 320px;
}

#results-total {
  font-size: 20px;
  font-weight: 500;
}
```
Append to `funday/public/css/styles.css`.

- [ ] **Step 3: Wire it into the entry point**

```javascript
import { initScrollReveal, initScrollCue } from './animations.js';
import { renderActivityCards } from './activities-view.js';
import { initVoteForm } from './vote.js';
import { initResultsView } from './results-view.js';

document.addEventListener('DOMContentLoaded', () => {
  renderActivityCards();
  initVoteForm();
  initResultsView();
  initScrollReveal();
  initScrollCue();
});
```
Replace the contents of `funday/public/js/main.js` with the above.

- [ ] **Step 4: Verify live updates across two tabs**

Reload `http://localhost:8000` in two separate browser tabs, scroll both to the results frame. In tab A, submit a vote from the vote frame. Expected: within about a second, tab B's bar chart and total count update on their own, with no manual refresh, and the bar for the voted activity animates to its new height. Hover a bar and confirm the tooltip shows the count and percentage.

- [ ] **Step 5: Commit**

```bash
git add funday/public/js/results-view.js funday/public/js/main.js funday/public/css/styles.css
git commit -m "feat(funday): add live results chart with realtime Firestore listener"
```

---

### Task 10: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit test suite one more time**

Run (from `funday/`): `npm test`
Expected: PASS — all 10 tests.

- [ ] **Step 2: Full scroll-through check**

With the local server running, reload the page from the top. Scroll through all 4 frames in order. Expected: each frame's entrance animation fires once as it enters view; scrolling back up and back down again does not replay a frame's animation.

- [ ] **Step 3: Mobile width check**

Resize the browser (or use responsive/device mode) to a 375px-wide viewport. Expected: hero text stays readable and doesn't overflow, activity cards stack to one column, the vote form and activity picker stay usable with touch-sized tap targets, the chart resizes to fit.

- [ ] **Step 4: Re-vote check**

Using the same test employee from Task 8, open the vote frame again, confirm their previous choice is pre-selected, change it to a different activity, submit, and confirm in the Firebase console that the `votes` collection still has exactly one document for that employee with the updated `activityId`.

- [ ] **Step 5: Offline/error path check**

With dev tools open, use the Network tab to simulate offline mode, then try submitting a vote. Expected: the inline error message ("לא הצלחנו לשמור את ההצבעה") appears instead of a silent failure, and the form keeps the user's selections. Restore the network before continuing.

No commit for this task — it's verification only. If any check fails, fix the relevant task's code and re-run this checklist before moving on.

---

### Task 11: Deploy to Firebase Hosting

**Files:** none (deployment only)

- [ ] **Step 1: Deploy**

Run (from `funday/`): `firebase deploy --only hosting,firestore:rules`
Expected output includes a "Hosting URL" line, e.g. `https://knafo-klimor-funday.web.app`.

- [ ] **Step 2: Verify the live site**

Open the printed Hosting URL in a browser (not localhost). Repeat the Task 10 scroll-through check against the live URL. Confirm a test vote submitted here also shows up live in another tab open on the same URL.

- [ ] **Step 3: Note the URL for the email draft in Task 12.**

No commit needed — deployment is not a code change.

---

### Task 12: Announcement email draft + Firestore cleanup

**Files:**
- Create: `funday/EMAIL_DRAFT.md`

- [ ] **Step 1: Write the email draft**

```markdown
נושא: יום הכיף השנתי – ההצבעה על הפעילות פתוחה

שלום לכולם,

יום הכיף השנתי של המשרד מתקרב – נובמבר 2026!
השנה ריכזנו הכול בדף אחד: תיאור קצר על כל אחת מארבע האפשרויות,
קישור לאתר של כל פעילות לפרטים נוספים, ואפשרות להצביע על הבחירה שלכם.
אפשר גם לראות בזמן אמת איך שאר הצוות מצביע.

הקישור לדף ולהצבעה:
[להדביק כאן את כתובת ה-Hosting מ-Task 11]

אפשר להצביע, ואם תתחרטו — גם לשנות את ההצבעה בכל שלב, פשוט בוחרים
את השם שלכם שוב ובוחרים אחרת.

ניפגש ביום כיף מעולה!
[השם שלך]
```
Save as `funday/EMAIL_DRAFT.md`. Fill in the real Hosting URL from Task 11 and your name, then copy the text into your email client and send it yourself.

- [ ] **Step 2: Clear out test votes**

In the Firebase console → Firestore Database → `votes` collection, delete any documents created while testing (Tasks 8–11) so the real vote counts start clean before the email goes out.

- [ ] **Step 3: Commit**

```bash
git add funday/EMAIL_DRAFT.md
git commit -m "docs(funday): add announcement email draft"
```

---

## Self-review notes

- **Spec coverage:** all 4 frames (Tasks 3, 5, 6, 8, 9), Firestore data model and security rules (Task 7), one-vote-per-employee-changeable behavior (Task 8, verified in Task 10), live updates (Task 9), error handling on both write and read paths (Tasks 8–9, verified in Task 10), deployment (Task 11), and the email draft (Task 12) are each covered by a task.
- **Consistency:** `EMPLOYEES`/`ACTIVITIES` ids defined in Task 1 are reused verbatim in the Firestore rules (Task 7), `vote.js` (Task 8), and `results-view.js` (Task 9) — no renamed fields between tasks.
- **Out of scope, per the design doc:** no login, no admin dashboard beyond the public chart, no voting deadline, no custom domain.
