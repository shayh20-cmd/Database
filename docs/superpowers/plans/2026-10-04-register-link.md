# Project Hub reads the register — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `project_hub_01.html` shows a linked register project's details and its consultants, read-only, from KKarcDB.Api, signing in to Supabase in the browser.

**Architecture:** Two new scripts beside the page carry almost all the code: `register-link.js` (pure functions plus a small API client, testable under Node) and `register-link-ui.js` (a shared store and the React components, using the page's global React). The hub's Node server hands the page four public settings from `/api/register-config`. The page itself changes only at a dozen exact-string anchors, because shayh20 edits it several times a day.

**Tech Stack:** Plain browser JavaScript, React 18 UMD (already on the page, no JSX: `React.createElement`), supabase-js 2.112.4 UMD, Node 22 `node:test`, PowerShell for the deploy script.

**Spec:** `docs/superpowers/specs/2026-10-04-register-link-design.md` — read it before starting.

## Global Constraints

- Read-only: the page sends only `GET` requests to `KKARCDB_API`. No code path sends anything else to the register.
- supabase-js is `@supabase/supabase-js@2.112.4`, file `dist/umd/supabase.js`, vendored as `supabase-js-2.112.4.min.js` at the repository root (sha256 `f8ce7fab799af1916019cbd0b485b39bb80dbdbc6dc062909a751c9e5198e04c`). It defines the global `supabase` with `createClient`.
- Settings, exactly: `KK_SUPABASE_URL`, `KK_SUPABASE_ANON_KEY`, `KKARCDB_API`, `KK_HUB_URL`. Endpoint `GET /api/register-config` → `{ supabaseUrl, supabaseAnonKey, api, hubUrl }`, each `null` when unset.
- Sign-in: `flowType: 'pkce'`, `provider: 'azure'`, `scopes: 'openid profile email'`, `redirectTo` = the page's own origin + path. Never forced on load.
- The link is `registerProjectId` at the top level of the hub project's data. **`undefined` = never linked** (auto-match may run); **`null` = unlinked by a person** (auto-match never overrides it). Unlink saves `null`.
- Register data is refetched on window focus when older than 5 minutes (`FRESH_MS = 5 * 60 * 1000`).
- Discipline map (hub → register): ARCH architecture, STRC structural, ELEC electrical, PLUM plumbing, HVAC hvac, LAND landscape, SAFE safety, FIRE fire, ACSS accessibility, TRAF traffic, GR green, HYDR hydrology, LIFT elevators, AGRO agronomy, ENVI environment, PM project_mgmt, TNDR tender.
- New Hebrew UI text gets an entry in `i18n-dict.js`. Elements showing register data (names, firms, codes, addresses, numbers) carry `data-i18n-skip=""`.
- `project_hub_01.html` is edited only by exact-string replacement at the anchors listed in Task 1. Re-run the anchor check before Task 6 — shayh20 may have changed the page since.
- No code changes in KkarcDB or KKarcHub.
- Every commit message ends with the session's `Co-Authored-By:` trailer.

## Review Focus

1. **An access token that expired while the page sat open** — the first request after an hour idle gets `401`; the client must refresh once and retry, and only a second refusal shows "not registered". *Pinned in Task 3.*
2. **Coming back from Microsoft** — the address carries `?code=…` (or `?error=…`); it must be put back to what the page had, with no `code` left to be re-exchanged on reload. *Pinned in Task 2 (`tidyReturnAddress`).*
3. **A project that removed a discipline from its own list** — a register firm of that discipline must still be listed, without a tender-row link (`discCode: null`). *Pinned in Task 2.*
4. **A Viewer opening an unlinked project** — auto-linking must not call `save()` (it would raise the read-only toast). *Pinned in Task 6 (`canEdit`) and checked in Task 7.*
5. **The register not set up, or not answering** — the hub must load and work as before; register areas say why. *Checked in Task 6 (config off) and Task 7 (unreachable).*

---

## File Structure

| File | Responsibility |
|---|---|
| `register-link.js` (create) | Pure functions — discipline map, project matching, consultant rows, project facts, JWT subject, return-address tidying — and `createRegisterClient` (supabase-js + `fetch`). Exports `window.RegisterLink` in a browser, `module.exports` under Node |
| `register-link-ui.js` (create) | The store shared by all register views, and the components: `FactsCard`, `ConsultantsNotice`, `EditInHub`, `AutoLink`, hook `useConsultantRows`. Exports `window.RegisterLinkUI`. Injects its own small stylesheet |
| `supabase-js-2.112.4.min.js` (create) | Vendored supabase-js |
| `tests/register-link.test.js` (create) | `node:test` tests of `register-link.js`, requiring the real file (no mirrored copy) |
| `tools/local-server/server.js` (modify) | `/api/register-config`; the three new scripts on the cloud allowlist |
| `tools/local-server/test/cloud.test.js` (modify) | Tests for the above |
| `project_hub_01.html` (modify) | Script tags, FIRE discipline, consultants from the register, General-tab card, auto-link host |
| `i18n-dict.js` (modify) | English for the new Hebrew strings |
| `Deploy-Azure.ps1` (modify) | Ships the three scripts; applies the four settings from the environment |
| `docs/azure.md` (modify) | "The register" section: settings and the outside changes |

---

### Task 1: Bring the branch up to date and check the anchors

**Files:**
- No source changes; a merge commit on `feat/register-link`.

**Interfaces:**
- Produces: a branch containing shayh20's latest `project_hub_01.html`, on which every anchor below occurs exactly the stated number of times.

- [ ] **Step 1: Merge the latest work into the branch**

Work in the worktree `D:\Projects\@Delta Office\New folder\Database\.worktrees\register-link`.

```bash
git fetch origin
git merge --no-edit origin/master
git merge --no-edit origin/feat/profile-and-entra-login
```

If `origin/feat/profile-and-entra-login` is already contained in `origin/master`, the second merge reports "Already up to date" — that is fine. Expected: no conflicts (this branch only added two docs files).

- [ ] **Step 2: Write the anchor check (scratch, not committed)**

Create `.superpowers/register-anchors.js`:

```js
// Counts each anchor project_hub_01.html must contain for Task 6. Run from the worktree root.
const fs = require('fs');
const s = fs.readFileSync('project_hub_01.html', 'utf8');
const anchors = [
  ['A1 script tag', '<script src="/react-dom-18.3.1.min.js"></script>', 1],
  ['A2 palette', "'disc-AGRO':'#059669','disc-AGRO-bg':'rgba(5,150,105,.15)',", 1],
  ['A3 DISCIPLINES', "{id:'AGRO',label:'AGRO',color:'var(--disc-AGRO)',bg:'var(--disc-AGRO-bg)'}];", 1],
  ['A4 ContactsView list', 'const consultants=data.consultants||[];const extContacts=data.externalContacts||[];const sp=', 1],
  ['A5 editing state', 'const[editingConsultantId,setEditingConsultantId]=useState(null);', 1],
  ['A6 addConsultant', "const addConsultant=()=>{const id=uid();sp({consultants:[...consultants,{id,discCode:'',discipline:'',firm:'',contacts:[{name:'',mobile:'',phone:'',email:'',isLead:false}]}]});setEditingConsultantId(id);};", 1],
  ['A7 add button', 'React.createElement("button",{className:"ov-sec-add-btn",onClick:addConsultant},"+ הוסף")', 1],
  ['A8 office count', 'consultants.length," משרדים"', 1],
  ['A9 consultant rows', 'consultants.map(c=>/*#__PURE__*/React.createElement(ConsultantRow,{key:c.id,c:c,disciplines:effDiscs,editing:editingConsultantId===c.id,onEdit:()=>setEditingConsultantId(c.id),onDone:()=>setEditingConsultantId(null),onUpdate:patch=>sp({consultants:consultants.map(x=>x.id===c.id?{...x,...patch}:x)}),onDelete:()=>{sp({consultants:consultants.filter(x=>x.id!==c.id)});setEditingConsultantId(null);}}))', 1],
  ['A10 row edit button', 'ct.email):\'—\'))),\n/*#__PURE__*/React.createElement("td",{className:"ov-row-actions"},/*#__PURE__*/React.createElement("button",{className:"ov-row-edit-btn",onClick:onEdit,title:"עריכה"},"✏")));', 1],
  ['A11 meeting people', '...(data.consultants||[]).flatMap(c=>', 1],
  ['A12 TenderView', 'function TenderView({data,sheet,save}){', 1],
  ['A13 officeDirectory', 'officeDirectory:data.consultants||[]', 2],
  ['A14 General tab', '}, err), /*#__PURE__*/React.createElement("section", {', 1],
  ['A15 App shell', '{className:"shell"},/*#__PURE__*/React.createElement(ConfirmHost,null),', 1],
  ['A16 new project', '\n    consultants: [],\n    externalContacts: [],', 1],
];
let bad = 0;
for (const [name, text, want] of anchors) {
  const got = s.split(text).length - 1;
  console.log((got === want ? 'ok   ' : 'FAIL ') + name + ': ' + got + ' (want ' + want + ')');
  if (got !== want) bad++;
}
process.exit(bad ? 1 : 0);
```

- [ ] **Step 3: Run it**

Run: `node .superpowers/register-anchors.js` (from the worktree root)
Expected: sixteen `ok` lines, exit code 0. If any line says `FAIL`, find where that code moved (`git log -p origin/master -- project_hub_01.html` around it), update the anchor in this plan and in the script to the new exact text, and note the change in the task report.

- [ ] **Step 4: Run the existing tests on the merged branch**

```bash
npm ci --prefix tools/local-server --no-audit --no-fund
node --test tools/local-server/test/
for f in tests/*.test.js; do node "$f" > /dev/null || echo "FAILED: $f"; done
```

Expected: `node --test` reports all pass; the loop prints nothing. (These are the baseline; later tasks must keep them green.)

- [ ] **Step 5: Nothing to commit beyond the merge commits.** Confirm `git status` is clean.

---

### Task 2: The pure functions

**Files:**
- Create: `register-link.js`
- Test: `tests/register-link.test.js`

**Interfaces:**
- Produces (on `window.RegisterLink` in a browser, `module.exports` under Node):
  - `REGISTER_DISCIPLINE: { [hubCode: string]: string }` — the 17-entry map
  - `NO_DISCIPLINE: 'ללא תחום'`
  - `STATUS_HE: { active, proposal, inactive, complete, cancelled }` → Hebrew labels
  - `matchProjects(hubCode: string, candidates: Project[]): Project[]`
  - `hubDisciplineFor(registerCode: string, hubDisciplines: {id}[]): string | null`
  - `buildConsultantRows(members, persons, firms, tags, hubDisciplines): Row[]` where `Row = { id, discCode, discipline, firm, firmId, registerDiscipline, contacts: { personId, name, mobile, phone, email }[] }`
  - `projectFacts(project): { label, value, data: boolean }[]`
  - `subjectOf(token: string): string | null`
  - `tidyReturnAddress(href: string, savedSearch: string | null): string | null`

API shapes these consume (camelCase JSON from KKarcDB.Api):
- project: `{ id, code, initials, name, nameHe, status, clientName, address, areaM2, endYear, permitDate, tofes4Date, costs: null | { predicted, evaluated, contractor, real }, members: { personId, name, firmName, isStaff }[] }`
- person: `{ id, name, nameHe, firmId, firmName, email, phone, mobile, tags: { [type]: string[] } }`
- firm: `{ id, name, nameHe, tags: { discipline?: string[], kind?: string[] } }`
- tag: `{ typeCode, code, nameEn, nameHe, color, sortOrder }`

- [ ] **Step 1: Write the failing tests**

Create `tests/register-link.test.js`:

```js
'use strict';
// Run: node --test tests/register-link.test.js — tests the real register-link.js, no mirror.
const test = require('node:test');
const assert = require('node:assert');
const RL = require('../register-link.js');

test('the discipline map covers all seventeen hub codes, FIRE and TNDR included', () => {
  assert.deepStrictEqual(Object.keys(RL.REGISTER_DISCIPLINE).sort(), [
    'ACSS', 'AGRO', 'ARCH', 'ELEC', 'ENVI', 'FIRE', 'GR', 'HVAC', 'HYDR', 'LAND', 'LIFT', 'PLUM', 'PM', 'SAFE', 'STRC', 'TNDR', 'TRAF',
  ]);
  assert.strictEqual(RL.REGISTER_DISCIPLINE.SAFE, 'safety');
  assert.strictEqual(RL.REGISTER_DISCIPLINE.FIRE, 'fire');
  assert.strictEqual(RL.REGISTER_DISCIPLINE.TNDR, 'tender');
});

test('hubDisciplineFor maps only to a discipline the project still lists', () => {
  const list = [{ id: 'ARCH' }, { id: 'FIRE' }, { id: 'TNDR' }];
  assert.strictEqual(RL.hubDisciplineFor('fire', list), 'FIRE');
  assert.strictEqual(RL.hubDisciplineFor('tender', list), 'TNDR');
  assert.strictEqual(RL.hubDisciplineFor('structural', list), null, 'STRC not in this project\'s list');
  assert.strictEqual(RL.hubDisciplineFor('cyber', list), null, 'no hub counterpart');
});

test('matchProjects: by initials or code, ignoring case and spaces', () => {
  const ps = [
    { id: 'a', code: '2017-03', initials: 'BEER' },
    { id: 'b', code: '2019-11', initials: 'HRZL' },
    { id: 'c', code: '2020-02', initials: 'hrzl' },
    { id: 'd', code: '2021-07', initials: null },
  ];
  assert.deepStrictEqual(RL.matchProjects(' beer ', ps).map(p => p.id), ['a']);
  assert.deepStrictEqual(RL.matchProjects('2021-07', ps).map(p => p.id), ['d']);
  assert.deepStrictEqual(RL.matchProjects('HRZL', ps).map(p => p.id), ['b', 'c'], 'several: caller must not link');
  assert.deepStrictEqual(RL.matchProjects('NONE', ps), []);
  assert.deepStrictEqual(RL.matchProjects('', ps), [], 'a blank code matches nothing');
  assert.deepStrictEqual(RL.matchProjects(null, ps), []);
});

const tags = [
  { typeCode: 'discipline', code: 'structural', nameEn: 'Structural', nameHe: 'קונסטרוקציה', sortOrder: 20 },
  { typeCode: 'discipline', code: 'electrical', nameEn: 'Electrical', nameHe: 'חשמל', sortOrder: 30 },
  { typeCode: 'discipline', code: 'fire', nameEn: 'Fire safety', nameHe: 'כבאות', sortOrder: 80 },
  { typeCode: 'discipline', code: 'cyber', nameEn: 'Cyber security', nameHe: 'סייבר', sortOrder: 330 },
  { typeCode: 'kind', code: 'consultant', nameEn: 'Consultant', nameHe: 'יועץ', sortOrder: 10 },
];
const firms = [
  { id: 'f1', name: 'Struct Ltd', nameHe: 'קונס בע״מ', tags: { discipline: ['structural', 'electrical'], kind: ['consultant'] } },
  { id: 'f2', name: 'Cyber Co', nameHe: null, tags: { discipline: ['cyber'] } },
  { id: 'f3', name: 'Client Inc', nameHe: 'הלקוח', tags: { kind: ['client'] } },
];
const persons = [
  { id: 'p1', name: 'Avi', nameHe: 'אבי', firmId: 'f1', mobile: '050', phone: '03', email: 'avi@x', tags: {} },
  { id: 'p2', name: 'Beni', nameHe: null, firmId: 'f1', mobile: null, phone: null, email: 'b@x', tags: {} },
  { id: 'p3', name: 'Cyb', firmId: 'f2', tags: {} },
  { id: 'p4', name: 'Free', firmId: null, mobile: '052', tags: { discipline: ['fire'] } },
  { id: 'p5', name: 'Cli', firmId: 'f3', tags: {} },
  { id: 'p6', name: 'Staff', firmId: null, tags: { internal: ['yes'] } },
];
const members = [
  { personId: 'p1', name: 'Avi', firmName: 'Struct Ltd', isStaff: false },
  { personId: 'p2', name: 'Beni', firmName: 'Struct Ltd', isStaff: false },
  { personId: 'p3', name: 'Cyb', firmName: 'Cyber Co', isStaff: false },
  { personId: 'p4', name: 'Free', firmName: null, isStaff: false },
  { personId: 'p5', name: 'Cli', firmName: 'Client Inc', isStaff: false },
  { personId: 'p6', name: 'Staff', firmName: null, isStaff: true },
  { personId: 'p7', name: 'Ghost', firmName: 'משרד ישן', isStaff: false },
];
const hubDiscs = [{ id: 'ARCH' }, { id: 'STRC' }, { id: 'ELEC' }, { id: 'FIRE' }];

test('buildConsultantRows: one row per firm and discipline, in the hub\'s order', () => {
  const rows = RL.buildConsultantRows(members, persons, firms, tags, hubDiscs);
  assert.deepStrictEqual(rows.map(r => r.id), ['f:f1|structural', 'f:f1|electrical', 'p:p4|fire', 'f:f2|cyber', 'f:f3|-', 'p:p7|-']);

  const [strc, elec, fire, cyber, client, ghost] = rows;
  assert.deepStrictEqual(strc, {
    id: 'f:f1|structural', discCode: 'STRC', discipline: 'קונסטרוקציה', firm: 'קונס בע״מ', firmId: 'f1', registerDiscipline: 'structural',
    contacts: [
      { personId: 'p1', name: 'אבי', mobile: '050', phone: '03', email: 'avi@x' },
      { personId: 'p2', name: 'Beni', mobile: '', phone: '', email: 'b@x' },
    ],
  });
  assert.strictEqual(elec.discCode, 'ELEC');
  assert.deepStrictEqual(elec.contacts.map(c => c.personId), ['p1', 'p2'], 'a two-discipline firm lists its people in both rows');
  assert.deepStrictEqual([fire.discCode, fire.firm, fire.firmId], ['FIRE', '', null], 'no firm: the person\'s own discipline');
  assert.deepStrictEqual([cyber.discCode, cyber.discipline, cyber.firm], [null, 'סייבר', 'Cyber Co'], 'unmapped: shown, no tender link');
  assert.deepStrictEqual([client.discCode, client.discipline, client.firm], [null, RL.NO_DISCIPLINE, 'הלקוח']);
  assert.deepStrictEqual([ghost.firm, ghost.contacts[0]], ['משרד ישן', { personId: 'p7', name: 'Ghost', mobile: '', phone: '', email: '' }],
    'a member missing from /api/persons still appears');
  assert.ok(!rows.some(r => r.contacts.some(c => c.personId === 'p6')), 'staff never appear');
});

test('buildConsultantRows: a discipline the project removed from its list is still listed, unlinked', () => {
  const rows = RL.buildConsultantRows(members.slice(0, 1), persons, firms, tags, [{ id: 'ELEC' }]);
  const strc = rows.find(r => r.registerDiscipline === 'structural');
  assert.strictEqual(strc.discCode, null);
  assert.strictEqual(strc.discipline, 'קונסטרוקציה');
  assert.deepStrictEqual(rows.map(r => r.id), ['f:f1|electrical', 'f:f1|structural'], 'mapped first, then unmapped by register order');
});

test('buildConsultantRows: a person\'s own discipline when their firm has none', () => {
  const ps = [{ id: 'p9', name: 'Fire guy', firmId: 'f3', tags: { discipline: ['fire'] } }];
  const rows = RL.buildConsultantRows([{ personId: 'p9', name: 'Fire guy', firmName: 'Client Inc', isStaff: false }], ps, firms, tags, hubDiscs);
  assert.deepStrictEqual(rows.map(r => [r.id, r.discCode, r.firm]), [['f:f3|fire', 'FIRE', 'הלקוח']]);
});

test('buildConsultantRows: nothing in, nothing out', () => {
  assert.deepStrictEqual(RL.buildConsultantRows([], [], [], [], hubDiscs), []);
  assert.deepStrictEqual(RL.buildConsultantRows(undefined, undefined, undefined, undefined, undefined), []);
});

test('projectFacts: the register\'s details, costs only when the API sent them', () => {
  const p = {
    code: '2017-03', initials: 'BEER', name: 'Beer Sheva Library', nameHe: 'ספריית באר שבע', status: 'active',
    clientName: 'עיריית באר שבע', address: 'רגר 1', areaM2: 1234, endYear: 2027, permitDate: '2025-03-15', tofes4Date: null, costs: null,
  };
  assert.deepStrictEqual(RL.projectFacts(p), [
    { label: 'קוד', value: '2017-03 · BEER', data: true },
    { label: 'שם בעברית', value: 'ספריית באר שבע', data: true },
    { label: 'שם באנגלית', value: 'Beer Sheva Library', data: true },
    { label: 'סטטוס', value: 'פעיל', data: false },
    { label: 'לקוח', value: 'עיריית באר שבע', data: true },
    { label: 'כתובת', value: 'רגר 1', data: true },
    { label: 'שטח', value: '1,234 מ״ר', data: true },
    { label: 'שנת סיום', value: '2027', data: true },
    { label: 'היתר', value: '15.03.2025', data: true },
    { label: 'טופס 4', value: '—', data: true },
  ]);
  const withCosts = RL.projectFacts({ ...p, costs: { predicted: 1000000, evaluated: null, contractor: 2500, real: 0 } });
  assert.deepStrictEqual(withCosts.slice(10), [
    { label: 'עלות צפויה', value: '1,000,000 ₪', data: true },
    { label: 'עלות מוערכת', value: '—', data: true },
    { label: 'עלות קבלן', value: '2,500 ₪', data: true },
    { label: 'עלות בפועל', value: '0 ₪', data: true },
  ]);
  const bare = RL.projectFacts({ code: '2020-01', status: 'odd' });
  assert.strictEqual(bare.find(f => f.label === 'סטטוס').value, 'odd', 'an unknown status shows as sent');
  assert.strictEqual(bare.find(f => f.label === 'שטח').value, '—');
});

const jwt = payload => 'h.' + Buffer.from(JSON.stringify(payload)).toString('base64url') + '.s';

test('subjectOf reads the token\'s sub, and nothing else', () => {
  assert.strictEqual(RL.subjectOf(jwt({ sub: 'a1b2-c3', name: 'דנה' })), 'a1b2-c3');
  assert.strictEqual(RL.subjectOf(jwt({ name: 'no sub' })), null);
  assert.strictEqual(RL.subjectOf('not-a-token'), null);
  assert.strictEqual(RL.subjectOf(null), null);
});

test('tidyReturnAddress: puts back the saved address and drops the one-time code', () => {
  const base = 'https://kkarc-hub.azurewebsites.net/project_hub_01';
  assert.strictEqual(RL.tidyReturnAddress(base + '?code=abc', '?tab=contacts'), '/project_hub_01?tab=contacts');
  assert.strictEqual(RL.tidyReturnAddress(base + '?code=abc', ''), '/project_hub_01');
  assert.strictEqual(RL.tidyReturnAddress(base + '?x=1&code=abc', null), '/project_hub_01?x=1', 'nothing saved: just drop the code');
  assert.strictEqual(RL.tidyReturnAddress(base + '?error=access_denied&error_description=No', null), '/project_hub_01');
  assert.strictEqual(RL.tidyReturnAddress(base + '?x=1', '?y=2'), null, 'no sign-in return: leave the address alone');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/register-link.test.js`
Expected: FAIL — `Cannot find module '../register-link.js'`.

- [ ] **Step 3: Write `register-link.js` with the pure functions**

Create `register-link.js` at the repository root:

```js
/* Project Hub ↔ the register (KKarcDB on Supabase), read-only.
   Spec: docs/superpowers/specs/2026-10-04-register-link-design.md.
   Pure functions first — tests/register-link.test.js requires this file under Node. The client
   at the end needs supabase-js and, for the sign-in round trip, a browser. */
(function (root) {
  'use strict';

  /* Hub discipline code → the register's discipline tag code (spec §5). TNDR's `tender` is
     added to the register from KK Hub's Setup; until then no register firm carries it. */
  const REGISTER_DISCIPLINE = {
    ARCH: 'architecture', STRC: 'structural', ELEC: 'electrical', PLUM: 'plumbing', HVAC: 'hvac',
    LAND: 'landscape', SAFE: 'safety', FIRE: 'fire', ACSS: 'accessibility', TRAF: 'traffic',
    GR: 'green', HYDR: 'hydrology', LIFT: 'elevators', AGRO: 'agronomy', ENVI: 'environment',
    PM: 'project_mgmt', TNDR: 'tender',
  };
  const HUB_DISCIPLINE = {};
  Object.keys(REGISTER_DISCIPLINE).forEach(hub => { HUB_DISCIPLINE[REGISTER_DISCIPLINE[hub]] = hub; });

  const NO_DISCIPLINE = 'ללא תחום';
  const STATUS_HE = { active: 'פעיל', proposal: 'הצעה', inactive: 'לא פעיל', complete: 'הסתיים', cancelled: 'בוטל' };

  const upper = v => String(v == null ? '' : v).trim().toUpperCase();

  /* The register projects a hub code names — by initials or by year-sequence code, case
     ignored. The caller links only when there is exactly one (spec §2). */
  function matchProjects(hubCode, candidates) {
    const code = upper(hubCode);
    if (!code) return [];
    return (candidates || []).filter(p => upper(p.initials) === code || upper(p.code) === code);
  }

  /* The hub discipline a register discipline maps to, if this project's list still has it. */
  function hubDisciplineFor(registerCode, hubDisciplines) {
    const hub = HUB_DISCIPLINE[registerCode];
    return hub && (hubDisciplines || []).some(d => d.id === hub) ? hub : null;
  }

  /* The consultants table's rows (spec §4): the project's non-staff members, one row per
     (firm, discipline), in the hub's row shape. The firm's disciplines decide; a person's own
     count only when the firm has none, or there is no firm. */
  function buildConsultantRows(members, persons, firms, tags, hubDisciplines) {
    const personById = new Map((persons || []).map(p => [p.id, p]));
    const firmById = new Map((firms || []).map(f => [f.id, f]));
    const discTag = new Map((tags || []).filter(t => t.typeCode === 'discipline').map(t => [t.code, t]));
    const hubOrder = new Map((hubDisciplines || []).map((d, i) => [d.id, i]));
    const disciplinesOf = x => ((x && x.tags) || {}).discipline || [];
    const rows = new Map();
    for (const m of members || []) {
      if (m.isStaff) continue;
      const person = personById.get(m.personId) || {};
      const firm = person.firmId ? firmById.get(person.firmId) || null : null;
      const owner = firm ? 'f:' + firm.id : 'p:' + m.personId;
      const own = disciplinesOf(firm).length ? disciplinesOf(firm) : disciplinesOf(person);
      const contact = {
        personId: m.personId,
        name: person.nameHe || person.name || m.name || '',
        mobile: person.mobile || '',
        phone: person.phone || '',
        email: person.email || '',
      };
      for (const reg of own.length ? own : [null]) {
        const id = owner + '|' + (reg || '-');
        let row = rows.get(id);
        if (!row) {
          const tag = reg ? discTag.get(reg) : null;
          const discCode = reg ? hubDisciplineFor(reg, hubDisciplines) : null;
          row = {
            id,
            discCode,
            discipline: reg ? (tag && (tag.nameHe || tag.nameEn)) || reg : NO_DISCIPLINE,
            firm: firm ? firm.nameHe || firm.name || '' : m.firmName || '',
            firmId: firm ? firm.id : null,
            registerDiscipline: reg,
            contacts: [],
            rank: discCode ? hubOrder.get(discCode) : reg ? 1000 + (tag ? tag.sortOrder : 99999) : 1e9,
          };
          rows.set(id, row);
        }
        row.contacts.push(contact);
      }
    }
    return [...rows.values()]
      .sort((a, b) => a.rank - b.rank || a.firm.localeCompare(b.firm, 'he'))
      .map(({ rank, ...row }) => row);
  }

  const dash = v => (v === null || v === undefined || v === '' ? '—' : String(v));
  const num = v => Number(v).toLocaleString('he-IL');
  const day = v => (v ? String(v).replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, '$3.$2.$1') : '—');
  const COSTS = [['predicted', 'עלות צפויה'], ['evaluated', 'עלות מוערכת'], ['contractor', 'עלות קבלן'], ['real', 'עלות בפועל']];

  /* The "From the register" card's rows (spec §3). `data` marks a value that is the register's
     own text, which the page's translator must leave alone. Costs only when the API sent them:
     it sends null to whoever may not see them. */
  function projectFacts(p) {
    const facts = [
      { label: 'קוד', value: dash([p.code, p.initials].filter(Boolean).join(' · ')), data: true },
      { label: 'שם בעברית', value: dash(p.nameHe), data: true },
      { label: 'שם באנגלית', value: dash(p.name), data: true },
      { label: 'סטטוס', value: STATUS_HE[p.status] || dash(p.status), data: false },
      { label: 'לקוח', value: dash(p.clientName), data: true },
      { label: 'כתובת', value: dash(p.address), data: true },
      { label: 'שטח', value: p.areaM2 == null ? '—' : num(p.areaM2) + ' מ״ר', data: true },
      { label: 'שנת סיום', value: dash(p.endYear), data: true },
      { label: 'היתר', value: day(p.permitDate), data: true },
      { label: 'טופס 4', value: day(p.tofes4Date), data: true },
    ];
    if (p.costs) {
      COSTS.forEach(([k, label]) => facts.push({ label, value: p.costs[k] == null ? '—' : num(p.costs[k]) + ' ₪', data: true }));
    }
    return facts;
  }

  /* The token's subject — what an administrator enrols. Shown when the register refuses
     someone, since "ask an administrator" is not actionable without it. */
  function subjectOf(token) {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    try {
      const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
      const sub = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))).sub;
      return typeof sub === 'string' ? sub : null;
    } catch (e) {
      return null;
    }
  }

  /* After Microsoft sends a sign-in back (spec §1): the address the page had before, without
     the one-time `code` or an error report. Null when the address carries none of them. */
  const RETURN_PARAMS = ['code', 'error', 'error_code', 'error_description'];
  function tidyReturnAddress(href, savedSearch) {
    const url = new URL(href);
    if (!RETURN_PARAMS.some(k => url.searchParams.has(k))) return null;
    if (typeof savedSearch === 'string') return url.pathname + savedSearch + url.hash;
    RETURN_PARAMS.forEach(k => url.searchParams.delete(k));
    const rest = url.searchParams.toString();
    return url.pathname + (rest ? '?' + rest : '') + url.hash;
  }

  // ── createRegisterClient is added here in Task 3 ──

  const api = {
    REGISTER_DISCIPLINE, NO_DISCIPLINE, STATUS_HE,
    matchProjects, hubDisciplineFor, buildConsultantRows, projectFacts, subjectOf, tidyReturnAddress,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RegisterLink = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/register-link.test.js`
Expected: PASS, 10 tests. If `'1,234 מ״ר'` fails with a different grouping, this Node lacks full ICU — check `node -p "process.versions.icu"` and `Intl.NumberFormat('he-IL').format(1234)`; Node 22 ships full ICU, so a difference means the wrong Node is first on PATH.

- [ ] **Step 5: Commit**

```bash
git add register-link.js tests/register-link.test.js
git commit -m "feat(register-link): discipline map, project matching and consultant rows from the register"
```

---

### Task 3: The register client

**Files:**
- Modify: `register-link.js` (replace the `// ── createRegisterClient is added here in Task 3 ──` line, and the `api` object)
- Test: `tests/register-link.test.js` (append)

**Interfaces:**
- Consumes: `subjectOf`, `tidyReturnAddress` from Task 2.
- Produces: `createRegisterClient(config, createSupabase, fetchImpl?)` → `{ ready: Promise<void>, token(): Promise<string|null>, get(path): Promise<Answer>, signIn(): Promise<string|null>, signOut(): Promise, onChange(listener: () => void): void }`, where `Answer = { state: 'ok', data } | { state: 'signed-out' } | { state: 'refused', subject } | { state: 'not-found' } | { state: 'unreachable' }`. `config` is `/api/register-config`'s body.

- [ ] **Step 1: Write the failing tests**

Append to `tests/register-link.test.js`:

```js
// ── createRegisterClient, with stand-ins for supabase-js and fetch ──
function fakeSupabase({ token = jwt({ sub: 'first' }), refreshed = jwt({ sub: 'second' }) } = {}) {
  return () => ({
    auth: {
      getSession: async () => ({ data: { session: token ? { access_token: token } : null } }),
      refreshSession: async () => ({ data: { session: refreshed ? { access_token: refreshed } : null } }),
      signInWithOAuth: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  });
}
function fakeFetch(answers, seen) {
  return async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization });
    const a = answers.shift();
    if (a === 'throw') throw new TypeError('Failed to fetch');
    return { status: a, ok: a >= 200 && a < 300, json: async () => ({ answered: a }) };
  };
}
const config = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', api: 'https://api.example/' };

test('client: a GET carries the token to the API', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([200], seen));
  assert.deepStrictEqual(await c.get('/api/projects/p1'), { state: 'ok', data: { answered: 200 } });
  assert.deepStrictEqual(seen, [{ url: 'https://api.example/api/projects/p1', auth: 'Bearer ' + jwt({ sub: 'first' }) }]);
});

test('client: an expired token is refreshed once and the request retried', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([401, 200], seen));
  assert.strictEqual((await c.get('/api/firms')).state, 'ok');
  assert.deepStrictEqual(seen.map(s => s.auth), ['Bearer ' + jwt({ sub: 'first' }), 'Bearer ' + jwt({ sub: 'second' })]);
});

test('client: refused twice is "refused", with the subject of the token it last tried', async () => {
  const c = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([401, 401], []));
  assert.deepStrictEqual(await c.get('/api/firms'), { state: 'refused', subject: 'second' });
  const d = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([403], []));
  assert.deepStrictEqual(await d.get('/api/firms'), { state: 'refused', subject: 'first' });
});

test('client: a refresh that yields no session is "signed-out"', async () => {
  const c = RL.createRegisterClient(config, fakeSupabase({ refreshed: null }), fakeFetch([401], []));
  assert.deepStrictEqual(await c.get('/api/firms'), { state: 'signed-out' });
});

test('client: nobody signed in — no request at all', async () => {
  const seen = [];
  const c = RL.createRegisterClient(config, fakeSupabase({ token: null }), fakeFetch([200], seen));
  assert.deepStrictEqual(await c.get('/api/firms'), { state: 'signed-out' });
  assert.strictEqual(seen.length, 0);
  assert.strictEqual(await c.token(), null);
});

test('client: 404 is not-found; 5xx and a network failure are unreachable', async () => {
  for (const [answer, state] of [[404, 'not-found'], [500, 'unreachable'], [503, 'unreachable'], ['throw', 'unreachable']]) {
    const c = RL.createRegisterClient(config, fakeSupabase(), fakeFetch([answer], []));
    assert.deepStrictEqual(await c.get('/api/projects/x'), { state }, String(answer));
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/register-link.test.js`
Expected: the six new tests FAIL with `RL.createRegisterClient is not a function`; the ten from Task 2 still pass.

- [ ] **Step 3: Add the client**

In `register-link.js`, replace the line `  // ── createRegisterClient is added here in Task 3 ──` with:

```js
  const RETURN_KEY = 'register-return';

  /* The register, through KKarcDB.Api, as the signed-in person (spec §1). `createSupabase` is
     supabase-js's createClient and `fetchImpl` the browser's fetch — parameters so the tests can
     stand in for both. Every answer is { state, data?, subject? }, state one of ok, signed-out,
     refused, not-found, unreachable (spec §6). Only GET is ever sent. */
  function createRegisterClient(config, createSupabase, fetchImpl) {
    const doFetch = fetchImpl || ((url, init) => root.fetch(url, init));
    const sb = createSupabase(config.supabaseUrl, config.supabaseAnonKey, { auth: { flowType: 'pkce' } });
    const api = String(config.api).replace(/\/+$/, '');
    const accessToken = r => (r && r.data && r.data.session && r.data.session.access_token) || null;

    // getSession waits for supabase-js to exchange a returning sign-in's code; then the address
    // is put back to what it was before Microsoft (browser only).
    const ready = Promise.resolve(sb.auth.getSession()).then(() => {
      if (typeof location === 'undefined' || typeof history === 'undefined') return;
      let saved = null;
      try { saved = sessionStorage.getItem(RETURN_KEY); } catch (e) { /* storage blocked */ }
      const next = tidyReturnAddress(location.href, saved);
      if (next === null) return;
      try { sessionStorage.removeItem(RETURN_KEY); } catch (e) { /* storage blocked */ }
      history.replaceState(history.state, '', next);
    }).catch(() => {});

    async function token() {
      await ready;
      return accessToken(await sb.auth.getSession());
    }

    async function get(path) {
      let t = await token();
      if (!t) return { state: 'signed-out' };
      for (let attempt = 0; ; attempt++) {
        let res;
        try {
          res = await doFetch(api + path, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/json' } });
        } catch (e) {
          return { state: 'unreachable' };
        }
        if (res.status === 401 && attempt === 0) {
          t = accessToken(await sb.auth.refreshSession());
          if (!t) return { state: 'signed-out' };
          continue;
        }
        if (res.status === 401 || res.status === 403) return { state: 'refused', subject: subjectOf(t) };
        if (res.status === 404) return { state: 'not-found' };
        if (!res.ok) return { state: 'unreachable' };
        try {
          return { state: 'ok', data: await res.json() };
        } catch (e) {
          return { state: 'unreachable' };
        }
      }
    }

    async function signIn() {
      try { sessionStorage.setItem(RETURN_KEY, location.search); } catch (e) { /* storage blocked */ }
      const r = await sb.auth.signInWithOAuth({
        provider: 'azure',
        options: { scopes: 'openid profile email', redirectTo: location.origin + location.pathname },
      });
      return r && r.error ? r.error.message : null;
    }

    return {
      ready,
      token,
      get,
      signIn,
      signOut: () => sb.auth.signOut(),
      // supabase-js must not be called from inside its own callback; listeners run a tick later.
      onChange: listener => { sb.auth.onAuthStateChange(() => { setTimeout(listener, 0); }); },
    };
  }
```

and change the `api` object to include it:

```js
  const api = {
    REGISTER_DISCIPLINE, NO_DISCIPLINE, STATUS_HE,
    matchProjects, hubDisciplineFor, buildConsultantRows, projectFacts, subjectOf, tidyReturnAddress,
    createRegisterClient,
  };
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tests/register-link.test.js`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add register-link.js tests/register-link.test.js
git commit -m "feat(register-link): read-only client for KKarcDB.Api with a Supabase token, one refresh on 401"
```

---

### Task 4: The server's part — settings, allowlist, supabase-js, deploy, docs

**Files:**
- Create: `supabase-js-2.112.4.min.js`
- Modify: `tools/local-server/server.js` (after `const LOGIN_PAGES = …`; the `CLOUD_ASSETS` line; after the `/api/me` route)
- Modify: `Deploy-Azure.ps1` (the `$settings` block; the files `foreach`)
- Modify: `docs/azure.md` (new section before `## Not in this deployment`)
- Test: `tools/local-server/test/cloud.test.js` (append two tests)

**Interfaces:**
- Produces: `GET /api/register-config` → `200 { supabaseUrl, supabaseAnonKey, api, hubUrl }` (strings or `null`), behind the cloud sign-in gate like every `/api/` route. `/supabase-js-2.112.4.min.js`, `/register-link.js`, `/register-link-ui.js` served in cloud mode.

- [ ] **Step 1: Write the failing tests**

Append to `tools/local-server/test/cloud.test.js`:

```js
test('register config: the four public values, behind the sign-in gate; the scripts are served', async (t) => {
  const port = 3998;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-data-'));
  const root = makeSite();
  const scripts = ['supabase-js-2.112.4.min.js', 'register-link.js', 'register-link-ui.js'];
  for (const f of scripts) fs.writeFileSync(path.join(root, f), '// ' + f);
  start(t, { port, root, env: {
    DATA_DIR: data, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'True',
    KK_SUPABASE_URL: ' https://abc.supabase.co ', KK_SUPABASE_ANON_KEY: 'anon-key',
    KKARCDB_API: 'https://kkarcdb.azurewebsites.net', KK_HUB_URL: '',
  } });
  await wait(700);

  assert.strictEqual((await req('GET', '/api/register-config', { port })).status, 401, 'no session, no config');

  const headers = { 'x-ms-client-principal': principal({ name: 'דנה', preferred_username: 'dana@example.com' }) };
  const cfg = await req('GET', '/api/register-config', { port, headers });
  assert.strictEqual(cfg.status, 200);
  assert.deepStrictEqual(cfg.body, {
    supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'anon-key',
    api: 'https://kkarcdb.azurewebsites.net', hubUrl: null,
  });

  for (const f of scripts) {
    assert.strictEqual((await req('GET', '/' + f, { port, headers })).status, 200, f + ' is on the cloud allowlist');
  }
});

test('register config: all null when the settings are unset', async (t) => {
  const port = 3999;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-data-'));
  start(t, { port, root: makeSite(), env: {
    DATA_DIR: data, SITE_MODE: '', WEBSITE_AUTH_ENABLED: '',
    KK_SUPABASE_URL: '', KK_SUPABASE_ANON_KEY: '', KKARCDB_API: '', KK_HUB_URL: '',
  } });
  await wait(700);
  const cfg = await req('GET', '/api/register-config', { port });
  assert.strictEqual(cfg.status, 200);
  assert.deepStrictEqual(cfg.body, { supabaseUrl: null, supabaseAnonKey: null, api: null, hubUrl: null });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tools/local-server/test/cloud.test.js`
Expected: the two new tests FAIL (the config route answers 404 or falls to the page server); the existing ones pass.

- [ ] **Step 3: Add the route and the allowlist entries**

In `tools/local-server/server.js`, change the `CLOUD_ASSETS` line so it includes the three scripts:

```js
const CLOUD_ASSETS = new Set(['/i18n.js', '/i18n-dict.js', '/react-18.3.1.min.js', '/react-dom-18.3.1.min.js', '/supabase-js-2.112.4.min.js', '/register-link.js', '/register-link-ui.js', '/hub.webmanifest', '/hub-sw.js', '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png']);
```

Directly after `const LOGIN_PAGES = new Set(['/login', '/login.html']);` add:

```js

/* The register (KKarcDB on Supabase) that the page reads through KKarcDB.Api. Public values
   only — the anon key is meant for browsers. Null when unset; the page then shows no register. */
function registerConfig() {
  const v = name => (process.env[name] || '').trim() || null;
  return { supabaseUrl: v('KK_SUPABASE_URL'), supabaseAnonKey: v('KK_SUPABASE_ANON_KEY'), api: v('KKARCDB_API'), hubUrl: v('KK_HUB_URL') };
}
```

Directly after the line `  if (url.pathname === '/api/me') { sendJson(res, 200, { name: user.name, email: user.email, mode: SITE_MODE }); return; }` add:

```js
  if (url.pathname === '/api/register-config') { sendJson(res, 200, registerConfig()); return; }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test tools/local-server/test/`
Expected: all pass, including the two new ones.

- [ ] **Step 5: Vendor supabase-js**

```bash
T=$(mktemp -d)
(cd "$T" && npm pack @supabase/supabase-js@2.112.4 --silent && tar -xzf supabase-supabase-js-2.112.4.tgz package/dist/umd/supabase.js)
cp "$T/package/dist/umd/supabase.js" supabase-js-2.112.4.min.js
sha256sum supabase-js-2.112.4.min.js
```

Expected: `f8ce7fab799af1916019cbd0b485b39bb80dbdbc6dc062909a751c9e5198e04c  supabase-js-2.112.4.min.js`. A different hash means a different file — stop and investigate. (`server.js` already serves `*-x.y.z.min.js` with a one-year immutable cache.)

- [ ] **Step 6: Ship the scripts and apply the settings in `Deploy-Azure.ps1`**

In the files loop, change `"react-dom-18.3.1.min.js", "hub.webmanifest"` to:

```powershell
"react-dom-18.3.1.min.js", "supabase-js-2.112.4.min.js", "register-link.js", "register-link-ui.js", "hub.webmanifest"
```

Directly after the closing `}` of the `$settings = [ordered]@{ … }` block add:

```powershell
# The register (KKarcDB) the page reads through its API — public values, taken from this
# window's environment when set. See docs\azure.md, "The register".
foreach ($setting in "KK_SUPABASE_URL", "KK_SUPABASE_ANON_KEY", "KKARCDB_API", "KK_HUB_URL") {
    $value = [Environment]::GetEnvironmentVariable($setting)
    if ($value) { $settings[$setting] = $value.Trim() }
}
```

Check it still parses:

```bash
pwsh -NoProfile -Command '$errs = $null; [void][System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path Deploy-Azure.ps1), [ref]$null, [ref]$errs); $errs.Count'
```

Expected: `0`.

- [ ] **Step 7: Document it in `docs/azure.md`**

Insert before the line `## Not in this deployment`:

```markdown
## The register

The page reads a project's details and its consultants from the register — KKarcDB's
database on Supabase — through KKarcDB.Api, signed in to Supabase with Microsoft in the
browser. Read-only: nothing is written to the register from here. Design:
`docs/superpowers/specs/2026-10-04-register-link-design.md`.

Four app settings, all public values (`KK_SUPABASE_URL` and `KK_SUPABASE_ANON_KEY` are the
same as KKarcHub's repository variables; its published `/shell/config.json` shows them):

| Setting | Value |
|---|---|
| `KK_SUPABASE_URL` | the Supabase project URL |
| `KK_SUPABASE_ANON_KEY` | the Supabase anon key |
| `KKARCDB_API` | `https://kkarcdb.azurewebsites.net` |
| `KK_HUB_URL` | KK Hub's site, `https://icy-sky-0b0e54f0f.6.azurestaticapps.net` |

Set them in the PowerShell window and run `.\Deploy-Azure.ps1 -Name kkarc-hub` once without
`-CodeOnly` (that run applies settings), or set them directly:

    az webapp config appsettings set --name kkarc-hub --resource-group project-hub --settings KK_SUPABASE_URL=… KK_SUPABASE_ANON_KEY=… KKARCDB_API=https://kkarcdb.azurewebsites.net KK_HUB_URL=https://icy-sky-0b0e54f0f.6.azurestaticapps.net

With any of the first three unset the page shows no register, only a line saying so.

Three changes outside this repository, once:

1. **KKarcDB.Api** — add `https://kkarc-hub.azurewebsites.net` to `KKARCDB_ALLOWED_ORIGINS`
   (comma-separated) in `D:\Coding\KkarcDB\env.ps1`, then that repository's
   `Deploy-Azure.ps1`, or as an app setting on the API.
2. **Supabase → Authentication → URL Configuration → Redirect URLs** — add
   `https://kkarc-hub.azurewebsites.net/**`.
3. **KK Hub → Setup → Disciplines** — add *Tender* / *מכרזים*; its code must be `tender`
   (the hub's TNDR maps to it).

For a local check against the live API, also add `http://localhost:3000` to both lists in 1
and 2, and run the server on port 3000.

A person must be enrolled in the register to read it; anyone else sees "not registered" and
the id to give an administrator.
```

- [ ] **Step 8: Commit**

```bash
git add tools/local-server/server.js tools/local-server/test/cloud.test.js supabase-js-2.112.4.min.js Deploy-Azure.ps1 docs/azure.md
git commit -m "feat(register-link): /api/register-config, supabase-js served from the site, deploy settings"
```

---

### Task 5: The store and the components

**Files:**
- Create: `register-link-ui.js`

**Interfaces:**
- Consumes: `window.React` (18), `window.supabase.createClient`, `window.RegisterLink` (Tasks 2–3), `GET /api/register-config` (Task 4).
- Produces `window.RegisterLinkUI`:
  - `useConsultantRows(data, hubDisciplines): Row[]` — a hook; `[]` until the linked project and the directory have both answered
  - `FactsCard({ data, save, hubCode })` — a `section.pg-card`; renders nothing when the register is not configured
  - `ConsultantsNotice({ data, save, hubCode, colSpan })` — a `<tr>` with the state line, or nothing when there are rows to show
  - `EditInHub({ data })` — a link styled `ov-sec-add-btn`, or nothing when unlinked / not configured
  - `AutoLink({ data, save, hubCode, canEdit })` — renders nothing; links an never-linked project whose code names exactly one register project

There is no Node test for this file: it needs React and a browser. Task 6 and Task 7 check it in the browser pane. Keep the logic that can be wrong without a browser in `register-link.js` (already tested).

- [ ] **Step 1: Write `register-link-ui.js`**

```js
/* Project Hub's register views (spec §§2–7): one store that every component showing register
   data shares, and those components. Loaded after React, supabase-js and register-link.js; the
   page reaches it as window.RegisterLinkUI. Read-only: the one thing saved is the hub's own
   registerProjectId, through the page's save() — undefined means never linked, null means a
   person unlinked it (auto-linking leaves that alone). */
(function () {
  'use strict';
  const h = React.createElement;
  const { useState, useEffect, useMemo, useRef, useSyncExternalStore } = React;
  const RL = window.RegisterLink;
  const FRESH_MS = 5 * 60 * 1000;

  const css = document.createElement('style');
  css.textContent = [
    '.rl-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;color:var(--text-2);padding:4px 0}',
    '.rl-cell{padding:10px 16px!important}',
    '.rl-btn{font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}',
    '.rl-btn:hover{border-color:var(--accent);color:var(--accent)}',
    '.rl-facts{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0 0 12px;font-size:13px}',
    '.rl-facts dt{color:var(--text-3)}',
    '.rl-facts dd{margin:0;color:var(--text)}',
    '.rl-actions{display:flex;gap:8px;flex-wrap:wrap}',
    '.rl-picker{display:flex;flex-direction:column;gap:8px;max-width:560px}',
    '.rl-picker-list{display:flex;flex-direction:column;max-height:260px;overflow:auto;border:1px solid var(--border);border-radius:8px}',
    '.rl-pick{font:inherit;font-size:13px;text-align:start;padding:7px 10px;border:0;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer;display:flex;gap:8px;align-items:baseline}',
    '.rl-pick:hover{background:var(--surface-2)}',
    '.rl-muted{color:var(--text-3);font-size:12px;padding:6px 10px}',
    '.rl-subject{font-family:ui-monospace,Consolas,monospace;font-size:11px;user-select:all;color:var(--text)}',
  ].join('\n');
  document.head.appendChild(css);

  /* ── the store ── */
  let client = null;
  let hubUrl = null;
  let snap = { config: 'loading', signedIn: false, directory: null, projects: {} };
  const listeners = new Set();
  const set = patch => { snap = Object.assign({}, snap, patch); listeners.forEach(l => l()); };
  const subscribe = l => { listeners.add(l); return () => listeners.delete(l); };
  const useStore = () => useSyncExternalStore(subscribe, () => snap);
  const stale = e => !!e && Date.now() - e.at > FRESH_MS;

  const inflight = {};
  function once(key, run) {
    if (!inflight[key]) inflight[key] = run().finally(() => { delete inflight[key]; });
    return inflight[key];
  }

  // persons, firms and tags: once per page load, shared by every project (spec §7).
  function loadDirectory() {
    return once('directory', () => Promise.all(['/api/persons', '/api/firms', '/api/tags'].map(p => client.get(p)))
      .then(([persons, firms, tags]) => {
        const bad = [persons, firms, tags].find(r => r.state !== 'ok');
        set({ directory: bad
          ? { state: bad.state, subject: bad.subject, at: Date.now() }
          : { state: 'ok', persons: persons.data, firms: firms.data, tags: tags.data, at: Date.now() } });
      }));
  }

  function loadProject(id) {
    return once('project:' + id, () => client.get('/api/projects/' + encodeURIComponent(id)).then(r => {
      const entry = r.state === 'ok'
        ? { state: 'ok', project: r.data, at: Date.now() }
        : { state: r.state, subject: r.subject, at: Date.now() };
      set({ projects: Object.assign({}, snap.projects, { [id]: entry }) });
    }));
  }

  // Forget the failed answers; the components' effects ask again.
  function retry(id) {
    const projects = Object.assign({}, snap.projects);
    if (id) delete projects[id];
    set({ projects, directory: snap.directory && snap.directory.state === 'ok' ? snap.directory : null });
  }

  function boot() {
    fetch('/api/register-config', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(cfg => {
        if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !cfg.api || !window.supabase) { set({ config: 'off' }); return; }
        hubUrl = cfg.hubUrl ? String(cfg.hubUrl).replace(/\/+$/, '') : null;
        client = RL.createRegisterClient(cfg, window.supabase.createClient);
        const refresh = () => client.token().then(t => set(t
          ? { config: 'on', signedIn: true }
          : { config: 'on', signedIn: false, directory: null, projects: {} }));
        client.onChange(refresh);
        refresh();
      });
    window.addEventListener('focus', () => {
      if (snap.config !== 'on' || !snap.signedIn) return;
      if (stale(snap.directory)) loadDirectory();
      Object.keys(snap.projects).forEach(id => { if (stale(snap.projects[id])) loadProject(id); });
    });
  }

  /* Starts the reads a linked project needs, once signed in, and re-renders with the store. */
  function useLinked(data) {
    const s = useStore();
    const id = data && data.registerProjectId;
    const haveProject = !!(id && s.projects[id]);
    const haveDirectory = !!s.directory;
    useEffect(() => {
      if (s.config !== 'on' || !s.signedIn || !id) return;
      if (!haveProject) loadProject(id);
      if (!haveDirectory) loadDirectory();
    }, [s.config, s.signedIn, id, haveProject, haveDirectory]);
    return s;
  }

  /* Which of spec §6's states a project is in. */
  function statusOf(s, id) {
    if (s.config === 'loading') return { kind: 'loading' };
    if (s.config === 'off') return { kind: 'off' };
    if (!s.signedIn) return { kind: 'signed-out' };
    if (!id) return { kind: 'unlinked' };
    const p = s.projects[id];
    const d = s.directory;
    for (const e of [p, d]) if (e && e.state !== 'ok') return { kind: e.state, subject: e.subject };
    if (!p || !d) return { kind: 'loading' };
    return { kind: 'ok', project: p.project };
  }

  function useConsultantRows(data, hubDisciplines) {
    const s = useLinked(data);
    const id = data && data.registerProjectId;
    const p = id ? s.projects[id] : null;
    const d = s.directory;
    return useMemo(() => (s.signedIn && p && p.state === 'ok' && d && d.state === 'ok'
      ? RL.buildConsultantRows(p.project.members, d.persons, d.firms, d.tags, hubDisciplines)
      : []), [s.signedIn, p, d, hubDisciplines]);
  }

  /* ── components ── */
  const projectLink = id => hubUrl + '/database/?open=' + encodeURIComponent(id);
  const line = (...children) => h('div', { className: 'rl-line' }, ...children);
  const button = (label, onClick) => h('button', { type: 'button', className: 'rl-btn', onClick }, label);

  function LinkPicker({ hubCode, onPick, onCancel }) {
    const [q, setQ] = useState(hubCode || '');
    const [res, setRes] = useState({ state: 'idle', list: [] });
    useEffect(() => {
      const term = q.trim();
      if (!term) { setRes({ state: 'idle', list: [] }); return undefined; }
      let live = true;
      const timer = setTimeout(() => {
        setRes(r => ({ state: 'loading', list: r.list }));
        client.get('/api/projects?q=' + encodeURIComponent(term) + '&limit=20').then(r => {
          if (live) setRes(r.state === 'ok' ? { state: 'ok', list: r.data } : { state: r.state, list: [] });
        });
      }, 300);
      return () => { live = false; clearTimeout(timer); };
    }, [q]);
    return h('div', { className: 'rl-picker' },
      h('input', {
        className: 'ov-edit-input', autoFocus: true, value: q,
        placeholder: 'חיפוש לפי שם, קוד או ראשי תיבות', onChange: e => setQ(e.target.value),
      }),
      h('div', { className: 'rl-picker-list' },
        res.state === 'loading' && !res.list.length ? h('div', { className: 'rl-muted' }, 'מחפש…') : null,
        res.state === 'ok' && !res.list.length ? h('div', { className: 'rl-muted' }, 'לא נמצאו פרויקטים') : null,
        ['unreachable', 'refused', 'signed-out', 'not-found'].includes(res.state) ? h('div', { className: 'rl-muted' }, 'המאגר לא עונה') : null,
        res.list.map(p => h('button', { key: p.id, type: 'button', className: 'rl-pick', onClick: () => onPick(p) },
          h('b', { 'data-i18n-skip': '' }, [p.code, p.initials].filter(Boolean).join(' · ')),
          h('span', { 'data-i18n-skip': '' }, p.nameHe || p.name),
          h('span', { className: 'rl-muted' }, RL.STATUS_HE[p.status] || p.status)))),
      h('div', null, button('ביטול', onCancel)));
  }

  function Notice({ data, save, hubCode, status }) {
    const [picking, setPicking] = useState(false);
    if (picking) {
      return h(LinkPicker, {
        hubCode,
        onCancel: () => setPicking(false),
        onPick: p => { setPicking(false); save(Object.assign({}, data, { registerProjectId: p.id })); },
      });
    }
    switch (status.kind) {
      case 'loading': return line('טוען מהמאגר…');
      case 'off': return line('המאגר לא הוגדר באתר הזה');
      case 'signed-out': return line('המאגר לא מחובר', button('התחברות למאגר', () => { client.signIn(); }));
      case 'refused': return line('אין הרשאה למאגר (KKarcDB) — מסור למנהל את המזהה:',
        h('span', { className: 'rl-subject', 'data-i18n-skip': '' }, status.subject || '—'));
      case 'unreachable': return line('המאגר לא עונה', button('נסה שוב', () => retry(data.registerProjectId)));
      case 'not-found': return line('הקישור למאגר שבור — הפרויקט לא נמצא', button('קישור מחדש', () => setPicking(true)));
      case 'unlinked': return line('הפרויקט לא מקושר למאגר', button('קישור למאגר', () => setPicking(true)));
      default: return null;
    }
  }

  function FactsCard({ data, save, hubCode }) {
    const s = useLinked(data);
    const status = statusOf(s, data.registerProjectId);
    if (status.kind === 'off') return null;
    const unlink = () => save(Object.assign({}, data, { registerProjectId: null }));
    return h('section', { className: 'pg-card' },
      h('h3', { className: 'pg-h' }, 'מהמאגר'),
      status.kind !== 'ok'
        ? h(Notice, { data, save, hubCode, status })
        : h(React.Fragment, null,
          h('dl', { className: 'rl-facts' }, RL.projectFacts(status.project).map(f => h(React.Fragment, { key: f.label },
            h('dt', null, f.label),
            h('dd', f.data ? { 'data-i18n-skip': '' } : null, f.value)))),
          h('div', { className: 'rl-actions' },
            hubUrl ? h('a', { className: 'rl-btn', href: projectLink(data.registerProjectId), target: '_blank', rel: 'noopener' }, 'פתיחה ב-KK Hub') : null,
            button('ביטול קישור', unlink))));
  }

  function ConsultantsNotice({ data, save, hubCode, colSpan }) {
    const s = useLinked(data);
    const status = statusOf(s, data.registerProjectId);
    if (status.kind === 'ok') return null;
    return h('tr', null, h('td', { colSpan, className: 'rl-cell' }, h(Notice, { data, save, hubCode, status })));
  }

  function EditInHub({ data }) {
    const s = useStore();
    if (s.config !== 'on' || !hubUrl || !data.registerProjectId) return null;
    return h('a', { className: 'ov-sec-add-btn', href: projectLink(data.registerProjectId), target: '_blank', rel: 'noopener' }, 'עריכה ב-KK Hub');
  }

  /* Spec §2: a never-linked project whose code names exactly one register project is linked to
     it — once per code per page load, and never for someone who may not edit. */
  const tried = new Set();
  function AutoLink({ data, save, hubCode, canEdit }) {
    const s = useStore();
    const latest = useRef(null);
    latest.current = { data, save };
    const code = String(hubCode || '').trim();
    const neverLinked = !!data && data.registerProjectId === undefined;
    useEffect(() => {
      if (s.config !== 'on' || !s.signedIn || !canEdit || !neverLinked || !code || tried.has(code)) return;
      tried.add(code);
      client.get('/api/projects?q=' + encodeURIComponent(code) + '&limit=20').then(r => {
        if (r.state !== 'ok') return;
        const hits = RL.matchProjects(code, r.data);
        const cur = latest.current;
        if (hits.length === 1 && cur.data && cur.data.registerProjectId === undefined) {
          cur.save(Object.assign({}, cur.data, { registerProjectId: hits[0].id }));
        }
      });
    }, [s.config, s.signedIn, canEdit, neverLinked, code]);
    return null;
  }

  window.RegisterLinkUI = { useConsultantRows, FactsCard, ConsultantsNotice, EditInHub, AutoLink };
  boot();
})();
```

- [ ] **Step 2: Check it parses**

Run: `node --check register-link-ui.js && node --check register-link.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add register-link-ui.js
git commit -m "feat(register-link): shared register store, facts card, consultants notice, link picker and auto-link"
```

---

### Task 6: Wire the page

**Files:**
- Modify: `project_hub_01.html` — anchors A1–A16 from Task 1
- Modify: `i18n-dict.js` — the last `Object.assign` chunk

**Interfaces:**
- Consumes: `window.RegisterLinkUI` (Task 5); page globals `DISCIPLINES`, `MY_PROJECTS`, `ACTIVE_PROJECT_ID`, `myOfficeRole`, `ConsultantRow`.
- Produces: the consultants table, meeting participants and tender office names read from the register; the General tab's "מהמאגר" card; auto-link at the shell; FIRE in the default disciplines.

- [ ] **Step 1: Re-run the anchor check**

Run: `node .superpowers/register-anchors.js`
Expected: sixteen `ok`. If not, fetch, merge `origin/master` (and shayh20's branch) again, and update anchors as in Task 1 Step 3 before editing.

- [ ] **Step 2: Make the replacements**

Each `old` occurs exactly as many times as Task 1 checked. Use exact-string replacement (the Edit tool); A13 replaces both occurrences.

**A1 — load the scripts after React.** old:
```
<script src="/react-dom-18.3.1.min.js"></script>
```
new:
```
<script src="/react-dom-18.3.1.min.js"></script>
<script src="/supabase-js-2.112.4.min.js"></script>
<script src="/register-link.js"></script>
<script src="/register-link-ui.js"></script>
```

**A2 — FIRE's colour (applyTheme scales it for each theme).** old:
```
'disc-AGRO':'#059669','disc-AGRO-bg':'rgba(5,150,105,.15)',
```
new:
```
'disc-AGRO':'#059669','disc-AGRO-bg':'rgba(5,150,105,.15)','disc-FIRE':'#DC2626','disc-FIRE-bg':'rgba(220,38,38,.15)',
```

**A3 — FIRE in the default disciplines.** old:
```
{id:'AGRO',label:'AGRO',color:'var(--disc-AGRO)',bg:'var(--disc-AGRO-bg)'}];
```
new:
```
{id:'AGRO',label:'AGRO',color:'var(--disc-AGRO)',bg:'var(--disc-AGRO-bg)'},{id:'FIRE',label:'FIRE',color:'var(--disc-FIRE)',bg:'var(--disc-FIRE-bg)'}];
```

**A4 — ContactsView reads the register's rows.** old:
```
const consultants=data.consultants||[];const extContacts=data.externalContacts||[];const sp=
```
new:
```
const consultants=RegisterLinkUI.useConsultantRows(data,data.disciplines||DISCIPLINES);const extContacts=data.externalContacts||[];const sp=
```

**A5 — drop the editing state.** old:
```
const[editingConsultantId,setEditingConsultantId]=useState(null);
```
new: *(empty string)*

**A6 — drop "add consultant".** old:
```
const addConsultant=()=>{const id=uid();sp({consultants:[...consultants,{id,discCode:'',discipline:'',firm:'',contacts:[{name:'',mobile:'',phone:'',email:'',isLead:false}]}]});setEditingConsultantId(id);};
```
new: *(empty string)*

**A7 — the header's "+ הוסף" becomes "עריכה ב-KK Hub".** old:
```
React.createElement("button",{className:"ov-sec-add-btn",onClick:addConsultant},"+ הוסף")
```
new:
```
React.createElement(RegisterLinkUI.EditInHub,{data:data})
```

**A8 — count firms, not rows.** old:
```
consultants.length," משרדים"
```
new:
```
new Set(consultants.map(c=>c.firmId||c.id)).size," משרדים"
```

**A9 — read-only rows, then the state line.** old:
```
consultants.map(c=>/*#__PURE__*/React.createElement(ConsultantRow,{key:c.id,c:c,disciplines:effDiscs,editing:editingConsultantId===c.id,onEdit:()=>setEditingConsultantId(c.id),onDone:()=>setEditingConsultantId(null),onUpdate:patch=>sp({consultants:consultants.map(x=>x.id===c.id?{...x,...patch}:x)}),onDelete:()=>{sp({consultants:consultants.filter(x=>x.id!==c.id)});setEditingConsultantId(null);}}))
```
new:
```
consultants.map(c=>/*#__PURE__*/React.createElement(ConsultantRow,{key:c.id,c:c,disciplines:effDiscs,editing:false})),/*#__PURE__*/React.createElement(RegisterLinkUI.ConsultantsNotice,{data:data,save:save,colSpan:6,hubCode:data.projectMeta?.code||(MY_PROJECTS.find(p=>p.id===ACTIVE_PROJECT_ID)||{}).code||''})
```

**A10 — ConsultantRow shows its edit button only when given onEdit.** old:
```
ct.email):'—'))),
/*#__PURE__*/React.createElement("td",{className:"ov-row-actions"},/*#__PURE__*/React.createElement("button",{className:"ov-row-edit-btn",onClick:onEdit,title:"עריכה"},"✏")));
```
new:
```
ct.email):'—'))),
/*#__PURE__*/React.createElement("td",{className:"ov-row-actions"},onEdit&&/*#__PURE__*/React.createElement("button",{className:"ov-row-edit-btn",onClick:onEdit,title:"עריכה"},"✏")));
```

**A11 — meeting participants offer the register's consultants.** old:
```
...(data.consultants||[]).flatMap(c=>
```
new:
```
...RegisterLinkUI.useConsultantRows(data,data.disciplines||DISCIPLINES).flatMap(c=>
```
(It sits in `MeetingEditor`'s top-level `const allPersons=[…]`, which runs on every render — a legal place for a hook.)

**A12 — TenderView reads the rows once, at its top.** old:
```
function TenderView({data,sheet,save}){
```
new:
```
function TenderView({data,sheet,save}){const officeDirectory=RegisterLinkUI.useConsultantRows(data,data.disciplines||DISCIPLINES);
```

**A13 — both tender views use them (replace all, 2 occurrences).** old:
```
officeDirectory:data.consultants||[]
```
new:
```
officeDirectory:officeDirectory
```

**A14 — the General tab's "מהמאגר" card, before "פרטי הפרויקט".** old:
```
}, err), /*#__PURE__*/React.createElement("section", {
```
new:
```
}, err), /*#__PURE__*/React.createElement(RegisterLinkUI.FactsCard, {
    data: data,
    save: save,
    hubCode: code
  }), /*#__PURE__*/React.createElement("section", {
```
(`code` is `ProjectGeneralTab`'s own `const code = meta.code || me.code || ""`.)

**A15 — auto-link at the shell.** old:
```
{className:"shell"},/*#__PURE__*/React.createElement(ConfirmHost,null),
```
new:
```
{className:"shell"},/*#__PURE__*/React.createElement(ConfirmHost,null),/*#__PURE__*/React.createElement(RegisterLinkUI.AutoLink,{data:data,save:save,canEdit:myOfficeRole()!=='viewer',hubCode:data.projectMeta?.code||(MY_PROJECTS.find(p=>p.id===ACTIVE_PROJECT_ID)||{}).code||''}),
```

**A16 — new projects no longer carry their own consultants.** old:
```

    consultants: [],
    externalContacts: [],
```
new:
```

    externalContacts: [],
```

- [ ] **Step 3: Check that nothing still writes or reads the old list**

Run: `grep -n -o -E "data\.consultants|editingConsultantId|addConsultant" project_hub_01.html`
Expected: exactly one line — OverviewPage's unused `const consultants=data.consultants||[]` (left as is; it reads nothing the page shows). Anything else means an anchor was missed.

- [ ] **Step 4: English for the new strings**

Create `.superpowers/register-i18n.js` and run it from the worktree root:

```js
// Adds English for the register strings that i18n-dict.js does not have yet; existing entries win.
const fs = require('fs');
const file = 'i18n-dict.js';
let s = fs.readFileSync(file, 'utf8');
const add = {
  'מהמאגר': 'From the register',
  'טוען מהמאגר…': 'Loading from the register…',
  'המאגר לא הוגדר באתר הזה': "The register isn't set up for this site",
  'המאגר לא מחובר': 'Not connected to the register',
  'התחברות למאגר': 'Connect to the register',
  'אין הרשאה למאגר (KKarcDB) — מסור למנהל את המזהה:': 'Not registered for KKarcDB — give an administrator this id:',
  'המאגר לא עונה': "The register isn't answering",
  'נסה שוב': 'Retry',
  'הקישור למאגר שבור — הפרויקט לא נמצא': "The register link is broken — the project wasn't found",
  'קישור מחדש': 'Link again',
  'הפרויקט לא מקושר למאגר': "This project isn't linked to the register",
  'קישור למאגר': 'Link to the register',
  'חיפוש לפי שם, קוד או ראשי תיבות': 'Search by name, code or initials',
  'מחפש…': 'Searching…',
  'לא נמצאו פרויקטים': 'No projects found',
  'ביטול': 'Cancel',
  'פתיחה ב-KK Hub': 'Open in KK Hub',
  'עריכה ב-KK Hub': 'Edit in KK Hub',
  'ביטול קישור': 'Unlink',
  'קוד': 'Code',
  'שם בעברית': 'Hebrew name',
  'שם באנגלית': 'English name',
  'סטטוס': 'Status',
  'לקוח': 'Client',
  'כתובת': 'Address',
  'שטח': 'Area',
  'שנת סיום': 'End year',
  'היתר': 'Permit',
  'טופס 4': 'Tofes 4',
  'עלות צפויה': 'Predicted cost',
  'עלות מוערכת': 'Evaluated cost',
  'עלות קבלן': 'Contractor cost',
  'עלות בפועל': 'Actual cost',
  'פעיל': 'Active',
  'הצעה': 'Proposal',
  'לא פעיל': 'Inactive',
  'הסתיים': 'Complete',
  'בוטל': 'Cancelled',
};
const missing = Object.entries(add).filter(([he]) => !s.includes(JSON.stringify(he) + ':'));
const tail = '\n});\n\nwindow.I18N_HE_EN = HE_EN;';
if (s.split(tail).length !== 2) throw new Error('the dictionary tail moved — add the entries by hand before the last "});"');
s = s.replace(tail, ',\n' + missing.map(([he, en]) => JSON.stringify(he) + ': ' + JSON.stringify(en)).join(',\n') + tail);
fs.writeFileSync(file, s);
console.log('added ' + missing.length + ' of ' + Object.keys(add).length);
```

Run: `node .superpowers/register-i18n.js && node --check i18n-dict.js`
Expected: `added N of 38` with N ≥ 1, and no syntax error. (If the file's line endings are CRLF, the tail check throws — then convert the `tail` string's `\n` to `\r\n` and rerun.)

- [ ] **Step 5: Run every automated check**

```bash
node --test tests/register-link.test.js
node --test tools/local-server/test/
for f in tests/*.test.js; do node "$f" > /dev/null || echo "FAILED: $f"; done
node -e "const s=require('fs').readFileSync('project_hub_01.html','utf8');const re=/<script([^>]*)>([\s\S]*?)<\/script>/g;let m,bad=0;while((m=re.exec(s))){if(/src=|babel|json|module/.test(m[1]))continue;try{new Function(m[2])}catch(e){bad++;console.log(e.message)}}console.log('syntax errors',bad)"
```

Expected: all pass; no `FAILED:` lines; `syntax errors 0`.

- [ ] **Step 6: Look at it with the register switched off**

Add a launch configuration for this worktree to `.claude/launch.json` in the session's working directory (do **not** commit this file):

```json
{
  "name": "register-link",
  "runtimeExecutable": "node",
  "runtimeArgs": ["D:\\Projects\\@Delta Office\\New folder\\Database\\.worktrees\\register-link\\tools\\local-server\\server.js", "D:\\Projects\\@Delta Office\\New folder\\Database\\.worktrees\\register-link", "--port", "3000"],
  "port": 3000
}
```

Start it with `preview_start { name: "register-link" }`, open `http://localhost:3000/project_hub_01`, then check:
- `read_console_messages` with `onlyErrors: true` → no errors.
- `/api/register-config` answers all `null` (`javascript_tool`: `await fetch('/api/register-config').then(r=>r.json())`).
- The project's contacts page (אנשי קשר): the consultants table shows the office's own row, then one row "המאגר לא הוגדר באתר הזה"; no "+ הוסף" in that header; no edit pencils on consultant rows.
- General tab: no "מהמאגר" card.
- A tender board opens and draws (office names blank).
- A meeting's participant picker opens.
- Switch to English (the page's language control): the notice reads "The register isn't set up for this site".

Screenshot the contacts page for the task report.

- [ ] **Step 7: Look at it signed out**

Read KK Hub's public values: `curl -s https://icy-sky-0b0e54f0f.6.azurestaticapps.net/shell/config.json` → `supabaseUrl`, `supabaseAnonKey`. Change the launch configuration to set them (still not committed):

```json
{
  "name": "register-link",
  "runtimeExecutable": "powershell",
  "runtimeArgs": ["-NoProfile", "-Command", "$env:KK_SUPABASE_URL='<supabaseUrl>'; $env:KK_SUPABASE_ANON_KEY='<supabaseAnonKey>'; $env:KKARCDB_API='https://kkarcdb.azurewebsites.net'; $env:KK_HUB_URL='https://icy-sky-0b0e54f0f.6.azurestaticapps.net'; node 'D:\\Projects\\@Delta Office\\New folder\\Database\\.worktrees\\register-link\\tools\\local-server\\server.js' 'D:\\Projects\\@Delta Office\\New folder\\Database\\.worktrees\\register-link' --port 3000"],
  "port": 3000
}
```

Restart the preview and check: the consultants table's line is "המאגר לא מחובר" with "התחברות למאגר"; the General tab shows the "מהמאגר" card with the same line; no console errors. Do not click the button — signing in needs the outside changes (Task 7).

- [ ] **Step 8: Commit**

```bash
git add project_hub_01.html i18n-dict.js
git commit -m "feat(project-hub): consultants and project details from the register, read-only; FIRE discipline"
```

---

### Task 7: End to end against the live register, then the pull request

This task needs Daniel first. Stop and ask him to make the changes in `docs/azure.md` → "The register" → items 1–3, **including the local `http://localhost:3000` entries**, and to say when they are done. Do not make them yourself.

**Files:**
- No code changes expected. A fix found here goes back to the task that owns the code, with a test where the code is in `register-link.js`.

- [ ] **Step 1: Sign in**

With the Task 6 Step 7 preview running: contacts page → "התחברות למאגר". Microsoft sign-in happens in the browser pane — Daniel signs in himself; never type credentials. Expected on return: the address is `http://localhost:3000/project_hub_01` with no `?code=`; no console errors.

- [ ] **Step 2: Link automatically and by hand**

- Give the demo project a code that names exactly one register project (Daniel picks one; set it in the General tab's code field), reload. Expected: within a few seconds the General tab's "מהמאגר" card shows that project's details, and `registerProjectId` is in the saved document (`javascript_tool`: `await fetch('/api/project-hub-01').then(r=>r.json()).then(d=>d.registerProjectId)`).
- "ביטול קישור" → the card shows "הפרויקט לא מקושר למאגר"; reload → it stays unlinked (`registerProjectId` is `null`, auto-link left it alone).
- "קישור למאגר" → search by part of the name → pick → linked again.

- [ ] **Step 3: Consultants and tenders**

- Contacts page: the register's consultants appear (compare with KK Hub's Database → that project → its people), grouped by firm and discipline, with phones and emails; "עריכה ב-KK Hub" opens KK Hub on that project.
- A tender board whose rows include a discipline the register project has a consultant for: with "show office name" on, the firm's name shows under the row.
- A meeting: the participant picker lists the register's contacts.

- [ ] **Step 4: The failure states**

- Not found: point the link at a uuid no register project has, through the hub server's own versioned save (the default project's document is `/api/project-hub-01`), then reload the page:

  ```js
  const r = await fetch('/api/project-hub-01');
  const doc = await r.json();
  doc.registerProjectId = '00000000-0000-4000-8000-000000000000';
  await fetch('/api/project-hub-01', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': r.headers.get('ETag') }, body: JSON.stringify(doc) }).then(x => x.status);
  ```

  Expected: `200`, and after the reload "הקישור למאגר שבור — הפרויקט לא נמצא" with "קישור מחדש", which opens the picker. Relink to the real project afterwards.
- Unreachable: restart the preview with `KKARCDB_API='https://kkarcdb.invalid'`. Expected: "המאגר לא עונה" with "נסה שוב"; the rest of the hub works.
- Viewer: if a Viewer account exists, open an unlinked project as it — no read-only toast appears. Otherwise read `AutoLink`'s `canEdit` guard and say the check was by reading.

- [ ] **Step 5: Re-run the automated checks** (Task 6 Step 5). Expected: all pass.

- [ ] **Step 6: Restore `.claude/launch.json`** to what it was (`git -C "D:\Projects\@Delta Office\New folder\Database" checkout -- .claude/launch.json`), and confirm the worktree's `git status` is clean.

- [ ] **Step 7: Push and open the pull request**

Ask Daniel before pushing. Then:

```bash
git push -u origin feat/register-link
gh pr create --repo shayh20-cmd/Database --base master --title "Project Hub reads the register: project details and consultants, read-only" --body-file <body file>
```

The body says what changed, that it is read-only, the four settings, the three outside changes (point to `docs/azure.md` → "The register"), that `data.consultants` is no longer used (demo data only), and how it was checked (tests, the Task 6–7 checks and screenshots). It ends with the session's PR attribution line.

- [ ] **Step 8: Deploy (Daniel's call)** — after merge: set the four settings (docs/azure.md), then `.\Deploy-Azure.ps1 -Name kkarc-hub -CodeOnly`. Remove the `localhost:3000` entries from the API's allowed origins and Supabase's redirect list if Daniel prefers.
