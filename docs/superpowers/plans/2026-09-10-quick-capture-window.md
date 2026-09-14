# Quick Capture Window (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Press a global hotkey anywhere in Windows, type what happened, press Enter — the update, task or planning principle lands in the project without opening the app.

**Architecture:** A standalone `capture.html` (vanilla JS, no framework, no build step) served by the existing local Node server, opened in a small browser app-window by an AutoHotkey hotkey. It reads and writes the same `/api/project-hub-01` document the main app uses. The status the user picks decides what gets created; a capture with no precise target lands in a new `data.inbox` that the Overview page surfaces so it can be drained.

**Tech Stack:** Vanilla JS + the existing Node static/API server. AutoHotkey v2 for the hotkey. Dependency-free Node smoke tests for the pure routing logic.

---

## Working method (read before Task 1)

Same constraints as Phase 1 for `project_hub_01.html`: ~777KB, long minified-style lines, **mixed line endings** (`\r\n` in older content, `\n` in newer). Never edit it by hand. Use:

```js
const fs=require('fs');
const FILE='C:/Users/Omega/Database/project_hub_01.html';
let s=fs.readFileSync(FILE,'utf8');
function mustReplace(oldStr,newStr,label){
  const cnt=s.split(oldStr).length-1;
  if(cnt!==1) throw new Error(`NOT UNIQUE (count=${cnt}) for ${label}`);
  s=s.replace(oldStr,newStr);
}
fs.writeFileSync(FILE,s,'utf8');
console.log('DONE',s.length);
```

If an anchor throws `count=0`, print the real bytes and rebuild it:
`node -e "const s=require('fs').readFileSync('C:/Users/Omega/Database/project_hub_01.html','utf8');const i=s.indexOf('<substring>');console.log(JSON.stringify(s.slice(i-120,i+300)))"`

**After every edit to `project_hub_01.html`**, validate syntax:
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('C:/Users/Omega/Database/project_hub_01.html','utf8');let i=0,b=null;while(true){const st=s.indexOf('<script',i);if(st===-1)break;const o=s.indexOf('>',st)+1;const e=s.indexOf('</script>',o);if(!b||e-o>b.len)b={o,e,len:e-o};i=e+1}fs.writeFileSync(process.env.TEMP+'/app.js',s.slice(b.o,b.e))"
node --check %TEMP%\app.js && echo SYNTAX_OK
```

`capture.html` is a NEW file and has none of these constraints — write it normally, LF endings, readable formatting.

**Mirror rule:** test files keep their own copy of the pure functions (no import is possible from an HTML file). Change a pure function in a page, update its mirror in the same commit.

**Server:** `node tools/local-server/server.js "C:\Users\Omega\Database" --port 3403`. The API is `GET/POST /api/project-hub-01`, which reads/writes the whole document as JSON.

---

## Facts established before planning (do not re-derive)

- **There is exactly one real project.** `data/project_hub_01.json` has a single `projectName` (`אולם ספורט לוד`). The other entries in the sidebar are hardcoded portfolio demo records with a different shape (`code`/`pm`/`budget`/`phases`), not editable projects. **The capture window therefore needs no project selector** — it shows the project name as fixed context.
- **A captured task's home** is the only `type:'list'` sheet with `track:null` — `משימות שוטפות` (`sheets[1]`, 14 tasks). The main app computes this same way: `sheets.find(s=>s.type==='list'&&s.track==null)`.
- **`data.disciplines`** holds 16 entries. For most, `id` and `label` match (`ARCH`, `PM`, `TRAF`, `STRC`, …) — **but not all**: one is `{id:"66m6g68", label:"SUST"}` and another `{id:"GR", label:"GRND"}`. Display `label`, store `id`; treating them as interchangeable writes an unresolvable discipline. They are user-editable, so read them at runtime and never hardcode the list.
- **`data.standalonePrinciples`** entries in the wild are `{id, description, discipline, createdAt}` plus optional provenance keys. A captured principle writes exactly the four core fields.
- **`addStandalonePrinciple(data,save,description,discipline)`** already exists and writes exactly `{id:uid(),description,discipline,createdAt:todayISO()}`. The capture window cannot call it, but it is the authority on the shape — match it byte for byte.
- **`EV_STATUSES`** ids are `missing, progress, sent, comments, response, update, approved`. These live in code, are not user-editable, and may be mirrored into `capture.html`.
- Phase 1 shipped `buildUpdate(status,assignee)` and `appendUpdate(events,rec)` inside `project_hub_01.html`. `capture.html` cannot import them and will need its own equivalent — keep the record shape identical: `{id, status, assignee, date, title:'', note:''}`.

---

## File Structure

- **Create** `capture.html` — the capture window. Self-contained: markup, styles, logic. One responsibility: turn one typed line into one correctly-routed write.
- **Create** `tests/capture-logic.test.js` — Node smoke tests mirroring the pure routing functions.
- **Create** `tools/quick-capture.ahk` — the AutoHotkey v2 hotkey script.
- **Create** `tools/README-quick-capture.md` — setup: installing the hotkey, autostarting the server.
- **Modify** `project_hub_01.html` — default `data.inbox` in `migrateData`; add the inbox panel to the Overview page.

---

### Task 1: Pure capture-routing logic

**Files:**
- Create: `tests/capture-logic.test.js`

Three decisions the window makes are pure and worth testing before any UI exists: which discipline the text implies, which existing tasks it might belong to, and what kind of thing to create.

- [ ] **Step 1: Write the failing test**

Create `tests/capture-logic.test.js`:

```js
// Dependency-free smoke tests. Run: node tests/capture-logic.test.js
// MIRROR of the pure capture helpers in capture.html — keep in sync.

// ---- mirrored logic (copy of the capture.html block) ----
// (intentionally empty for Step 1 — the assertions below must fail first)
// ---- end mirrored logic ----

let failures = 0;
function eq(actual, expected, name) {
  if (actual !== expected) { console.error(`FAIL ${name}: got ${actual}, want ${expected}`); failures++; }
  else console.log(`ok   ${name}`);
}

const DISCS = [{id:'ARCH'},{id:'STRC'},{id:'ELEC'},{id:'PLUM'},{id:'SAFE'},{id:'HVAC'}];

// guessDiscipline — keyword → discipline id, falling back to ARCH
eq(guessDiscipline('שלחתי תכניות לקונסטרוקציה', DISCS), 'STRC', 'guess: קונסטרוקציה → STRC');
eq(guessDiscipline('תיאום עם חברת חשמל', DISCS), 'ELEC', 'guess: חשמל → ELEC');
eq(guessDiscipline('בדיקת אינסטלציה', DISCS), 'PLUM', 'guess: אינסטלציה → PLUM');
eq(guessDiscipline('יועץ בטיחות ביקש', DISCS), 'SAFE', 'guess: בטיחות → SAFE');
eq(guessDiscipline('מיזוג אוויר', DISCS), 'HVAC', 'guess: מיזוג → HVAC');
eq(guessDiscipline('משהו כללי לגמרי', DISCS), 'ARCH', 'guess: no keyword → ARCH');
eq(guessDiscipline('', DISCS), 'ARCH', 'guess: empty → ARCH');
// a guess is only returned if that discipline actually exists in the project
eq(guessDiscipline('קונסטרוקציה', [{id:'ARCH'}]), 'ARCH', 'guess: unknown discipline falls back');

// matchTasks — substring match on words of 3+ chars, capped at 3, skips done tasks
const TASKS = [
  {id:'1', title:'תכנון קונסטרוקציה ראשוני'},
  {id:'2', title:'תיאום חברת חשמל'},
  {id:'3', title:'להעביר תכנית ללולה'},
  {id:'4', title:'תכנון קונסטרוקציה מפורט'},
  {id:'5', title:'תכנון קונסטרוקציה סופי'},
  {id:'6', title:'משימה שהושלמה', done:true},
];
eq(matchTasks('קונסטרוקציה', TASKS).length, 3, 'match: capped at 3');
eq(matchTasks('חשמל', TASKS)[0].id, '2', 'match: finds by word');
eq(matchTasks('', TASKS).length, 0, 'match: empty query → none');
eq(matchTasks('אב', TASKS).length, 0, 'match: query under 3 chars → none');
eq(matchTasks('שהושלמה', TASKS).length, 0, 'match: skips done tasks');
eq(matchTasks('קונסטרוקציה', []).length, 0, 'match: no tasks → none');

// routeCapture — the status decides what gets created
eq(routeCapture({status:'sent', taskId:'1'}), 'update', 'route: status + task → update');
eq(routeCapture({status:'sent', taskId:null}), 'inbox', 'route: status, no task → inbox');
eq(routeCapture({status:null, taskId:null}), 'task', 'route: no status → new task');
eq(routeCapture({status:null, taskId:'1'}), 'task', 'route: no status still means a new task');
eq(routeCapture({status:'sent', taskId:'1', kind:'principle'}), 'principle', 'route: explicit kind wins');
eq(routeCapture({status:null, taskId:null, kind:'update'}), 'inbox', 'route: forced update without a task → inbox');

if (failures) { console.error(`\n${failures} FAILURES`); process.exit(1); }
console.log('\nALL PASS');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/capture-logic.test.js`
Expected: `ReferenceError: guessDiscipline is not defined`

- [ ] **Step 3: Fill in the mirrored implementation**

Replace the placeholder mirror block with:

```js
// ---- mirrored logic (copy of the capture.html block) ----
const DISC_HINTS = [
  ['STRC', /קונסטרוקצ|בטון|יסודות|שלד/],
  ['ELEC', /חשמל|תאורה|מתח/],
  ['PLUM', /אינסטלצ|סניטר|ביוב|מים/],
  ['SAFE', /בטיחות|כיבוי|מתזים|אש/],
  ['HVAC', /מיזוג|אוורור|VRF/],
  ['TRAF', /תנועה|חניה|חנייה/],
  ['LAND', /נוף|גינון|פיתוח שטח/],
  ['ACSS', /נגישות/],
];
function guessDiscipline(text, disciplines){
  const has = id => (disciplines||[]).some(d => d.id === id);
  for (const [id, re] of DISC_HINTS) if (re.test(text||'') && has(id)) return id;
  return has('ARCH') ? 'ARCH' : ((disciplines||[])[0]||{}).id || '';
}
function matchTasks(text, tasks){
  const words = (text||'').split(/\s+/).filter(w => w.length >= 3);
  if (!words.length) return [];
  return (tasks||[])
    .filter(t => !t.done && words.some(w => (t.title||'').includes(w)))
    .slice(0, 3);
}
function routeCapture({status, taskId, kind}){
  if (kind === 'principle') return 'principle';
  if (kind === 'task') return 'task';
  if (kind === 'update') return taskId ? 'update' : 'inbox';
  if (!status) return 'task';
  return taskId ? 'update' : 'inbox';
}
// ---- end mirrored logic ----
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/capture-logic.test.js`
Expected: every line `ok ...`, then `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add tests/capture-logic.test.js
git commit -m "test: routing rules for quick capture

The three decisions the capture window makes — which discipline the text
implies, which tasks it might belong to, and what kind of thing to create
— are pure, so they get pinned down before any UI exists."
```

---

### Task 2: `data.inbox` and somewhere to see it

**Files:**
- Modify: `project_hub_01.html`

A capture with no precise target has to land somewhere visible. Building the drain before the tap means the pile can never accumulate unseen — which is the failure mode the design brief called out explicitly.

- [ ] **Step 1: Default the array in `migrateData`**

Find how `migrateData` defaults other root arrays:
```bash
node -e "const s=require('fs').readFileSync('C:/Users/Omega/Database/project_hub_01.html','utf8');const i=s.indexOf('function migrateData');console.log(JSON.stringify(s.slice(i,i+1200)))"
```

`migrateData` defaults root arrays with the form `if(!d.meetings)d={...d,meetings:[]};`. Follow it exactly, using that line as the anchor:

```js
mustReplace(
  "if(!d.meetings)d={...d,meetings:[]};",
  "if(!d.meetings)d={...d,meetings:[]};if(!d.inbox)d={...d,inbox:[]};",
  "inbox default"
);
```

Note the file mixes `
` and `
`; this anchor contains no newline, so it is safe.

- [ ] **Step 2: Verify syntax**

Run the `node --check` extraction from *Working method*. Expected `SYNTAX_OK`.

- [ ] **Step 3: Add the inbox panel to the Overview page**

The Overview page (`OverviewPage`) already hosts the principles table, so a pending-captures panel belongs next to it. Find where the principles section renders:
```bash
node -e "const s=require('fs').readFileSync('C:/Users/Omega/Database/project_hub_01.html','utf8');const i=s.indexOf('function OverviewPage');console.log(JSON.stringify(s.slice(i,i+600)))"
```

Insert a panel that renders **only when `(data.inbox||[]).length > 0`** — it must be invisible when empty, not an empty box demanding attention. For each entry show the captured text, its guessed discipline, its date, and two controls:

- **שייך למשימה** — a `select` of the open tasks in the `track==null` list sheet. Choosing one writes the real record and removes the inbox entry:
```js
const rec=buildUpdate(item.status||'progress', item.discipline||'');
onUpdate({...task, events:appendUpdate(task.events, rec)});
// then: data.inbox = data.inbox.filter(x=>x.id!==item.id)
```
- **מחק** — drops the entry without writing anything.

Both must go through the app's normal `save`, so undo covers them. Match the styling of the surrounding Overview panels; do not invent a new visual language.

- [ ] **Step 4: Verify syntax and tests**

```bash
node --check %TEMP%\app.js && echo SYNTAX_OK
node tests/quick-update.test.js
node tests/tender-logic.test.js
```
All must pass.

- [ ] **Step 5: Verify in the browser**

Start the server, open `http://localhost:3403/project_hub_01.html`, go to **מבט על**.
Expected with an empty inbox: no panel at all.

Then seed one entry from the browser console and confirm it appears, assigns, and disappears:
```js
const d = await (await fetch('/api/project-hub-01')).json();
d.inbox = [{id:'test1', date:'2026-09-10', text:'בדיקת תיבת נכנס', kind:'update', status:'sent', discipline:'ARCH'}];
await fetch('/api/project-hub-01',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
location.reload();
```
Expected: the panel appears with one row. Assign it to a task → the task gains an update with `status:'sent'` appended last, and the panel disappears again. Check the console for errors: expected none.

- [ ] **Step 6: Commit**

```bash
git add project_hub_01.html
git commit -m "feat: pending captures get a home on the overview page

Building the drain before the tap — an inbox nobody can see is worse than
no inbox, so the panel lands before anything can write to it. It renders
only when it has entries."
```

---

### Task 3: The capture window

**Files:**
- Create: `capture.html`

- [ ] **Step 1: Write the page**

Create `capture.html` as a self-contained page. Requirements, in order of importance:

**Behaviour**
- The text input is focused on load. Typing is the first thing that works.
- `Esc` closes the window (`window.close()`; if the browser refuses, show a small "אפשר לסגור את החלון" hint rather than failing silently).
- `Enter` in the text field saves.
- After a successful save, show a confirmation naming where it went, then close after ~2s.
- If the server is unreachable, show `השרת לא פעיל` and **keep the typed text in the field** — never lose what the user wrote.

**Data**
- On load, `GET /api/project-hub-01` once. From it take `projectName`, `disciplines`, and the tasks of the `track==null` list sheet.
- Mirror the pure functions from Task 1 (`DISC_HINTS`, `guessDiscipline`, `matchTasks`, `routeCapture`) verbatim — this is the mirror rule; the test file's copy and this copy must stay identical.
- Mirror the `EV_STATUSES` id/label/symbol/colour data needed to render the pills. Exclude `missing` from the strip.

**Layout** (matches the approved mockup)
- Header: the project name as fixed context, plus `Esc לסגירה`.
- The text input, large, placeholder `מה קרה?`.
- A tools row: **🎙 הכתבה** (Web Speech API, `lang='he-IL'`, fills the field — it is a draft, never saved directly) and **📋 הדבק מהמייל** (`navigator.clipboard.readText()` into the field).
- **לאן**: the project name, and the guessed discipline as a chip the user can change.
- **Matching tasks**: up to three, shown once the text is 3+ chars, each selectable; selecting one makes the target exact and adopts its discipline. Selecting again deselects.
- **Status pills**: clicking one selects it (clicking again clears it). No status is a valid state.
- **Kind chips**: `עדכון` / `משימה חדשה` / `עקרון תכנון`, showing the inferred result from `routeCapture` as pressed, and overridable in one click.
- Footer: `Enter לשמור · Esc לסגור` and a save button, disabled while the text is empty.

**Saving** — `GET` the document, mutate, `POST` it back. Route by `routeCapture`:

| Route | Write |
|---|---|
| `update` | append `{id,status,assignee:discipline,date:today,title:'',note:text}` to the matched task's `events[]` |
| `task` | push `{id, title:text, discipline, statusId:'N'}` onto the `track==null` list sheet's `tasks[]` |
| `principle` | push `{id, description:text, discipline, createdAt:today}` onto `data.standalonePrinciples` |
| `inbox` | push `{id, date:today, text, kind:'update', status, discipline}` onto `data.inbox` |

Generate ids the same way the app does (`Math.random().toString(36).slice(2,9)`), and dates as `new Date().toISOString().slice(0,10)`.

Style it to match the app: `Heebo` from Google Fonts with a real fallback stack, `dir="rtl"`, the app's own neutrals. Keep it under ~500 lines; it is one window with one job.

- [ ] **Step 2: Confirm the mirror matches**

```bash
node -e "
const fs=require('fs');
const cap=fs.readFileSync('capture.html','utf8');
const tst=fs.readFileSync('tests/capture-logic.test.js','utf8');
const grab=(s,n)=>{const i=s.indexOf('function '+n);const j=s.indexOf('\nfunction ',i+1);return s.slice(i,j===-1?i+600:j).replace(/\s+/g,' ').trim();};
['guessDiscipline','matchTasks','routeCapture'].forEach(n=>console.log(n, grab(cap,n)===grab(tst,n)?'IN SYNC':'DRIFT'));
"
```
Expected: all three `IN SYNC`. Fix any drift before continuing.

- [ ] **Step 3: Run the logic tests**

Run: `node tests/capture-logic.test.js`
Expected: `ALL PASS`

- [ ] **Step 4: Verify in the browser**

Open `http://localhost:3403/capture.html` directly (no hotkey needed yet).

Walk all four routes, checking the data after each via `GET /api/project-hub-01`:
1. Type `שלחתי תכניות לקונסטרוקציה`, confirm `STRC` is guessed, pick a matching task, pick `נשלח`, save → that task's `events[]` gains an appended record.
2. Same text, no task selected, pick `נשלח`, save → `data.inbox` gains an entry.
3. Type `הלקוח רוצה לבדוק גובה תקרה`, no status, save → a new task appears in `משימות שוטפות`.
4. Type `סוכם שהעירייה מאשרת את החניה`, choose `עקרון תכנון`, save → `data.standalonePrinciples` gains an entry.

Confirm `Esc` closes and `Enter` saves. Check the console for errors: expected none.

**Then remove every record created during this walk** — the four writes above are test data, not the user's.

- [ ] **Step 5: Commit**

```bash
git add capture.html
git commit -m "feat: quick capture window

One text field, focused on open. The status decides what gets created —
a status makes it an update, no status makes it a task, and the עקרון
chip makes it a planning principle. A capture with no matching task goes
to the inbox rather than being refused."
```

---

### Task 4: The global hotkey

**Files:**
- Create: `tools/quick-capture.ahk`
- Create: `tools/README-quick-capture.md`

- [ ] **Step 1: Write the AutoHotkey v2 script**

Create `tools/quick-capture.ahk`:

```ahk
#Requires AutoHotkey v2.0
; Project Hub — quick capture. Ctrl+Shift+Space opens the window, or closes it if already open.

CAPTURE_URL := "http://localhost:3403/capture.html"
WIN_TITLE   := "לכידה מהירה"

^+Space:: {
    if WinExist(WIN_TITLE) {
        WinClose(WIN_TITLE)
        return
    }
    Run 'msedge.exe --app=' CAPTURE_URL ' --window-size=470,620'
    if WinWait(WIN_TITLE, , 4)
        WinActivate(WIN_TITLE)
}
```

`capture.html` must set `<title>לכידה מהירה</title>` for `WinExist`/`WinWait` to match — verify it does.

- [ ] **Step 2: Write the setup notes**

Create `tools/README-quick-capture.md` covering, in plain steps:
- Install AutoHotkey v2 (state that this is a one-time prerequisite).
- Put a shortcut to `quick-capture.ahk` in `shell:startup` so the hotkey survives a reboot.
- Autostart the server: a shortcut in `shell:startup` running
  `node "C:\Users\Omega\Database\tools\local-server\server.js" "C:\Users\Omega\Database" --port 3403`,
  noting that until this is done the capture window will show `השרת לא פעיל`.
- The hotkey (`Ctrl+Shift+Space`) and how to change it (the `^+Space` line).
- That Edge is used because it ships with Windows 11; swapping `msedge.exe` for `chrome.exe` works identically.

- [ ] **Step 3: Verify the script parses**

If AutoHotkey v2 is installed, run the script and press the hotkey — the window should open, and pressing the hotkey again should close it.

If AutoHotkey is **not** installed, do not install it. Report that Step 3 could not be executed and leave it to the user; the script and README are still the deliverable.

- [ ] **Step 4: Commit**

```bash
git add tools/quick-capture.ahk tools/README-quick-capture.md
git commit -m "feat: global hotkey for quick capture

A web page cannot register a system-wide shortcut, so the hotkey lives
outside the browser — about thirty lines of AutoHotkey that toggle the
capture window. Two files; deleting them reverts the feature."
```

---

### Task 5: End-to-end verification

**Files:** none unless a defect is found

- [ ] **Step 1: Run every suite**

```bash
node tests/capture-logic.test.js
node tests/quick-update.test.js
node tests/tender-logic.test.js
```
Expected: `ALL PASS` from all three.

- [ ] **Step 2: Capture from outside the app**

With the server running and the main app **closed**, press the hotkey and capture one of each kind. Confirm each landed correctly by fetching the document.

- [ ] **Step 3: Confirm the inbox round-trip**

Capture an update with no matching task, then open the app's **מבט על** and assign it. Confirm the task gains the record and the inbox entry disappears.

- [ ] **Step 4: Check concurrency honestly**

With the main app open in a browser tab, capture something, then edit a task in the app **without reloading**. Fetch the document and check whether the captured item survived.

Both the app and the capture window write the whole document, so a stale tab can clobber a capture. If it does, record it in the plan's Known issues rather than papering over it — the fix (merge-on-write, or the app refetching before save) is a separate change.

- [ ] **Step 5: Clean up**

Remove every record created during verification. Confirm with:
```js
const d = await (await fetch('/api/project-hub-01')).json();
const all=[]; const w=o=>{if(!o||typeof o!=='object')return; if(Array.isArray(o))return o.forEach(w);
  if(Array.isArray(o.events))o.events.forEach(e=>all.push(e)); for(const k in o)w(o[k]);}; w(d);
console.log({
  writtenToday: all.filter(e=>e.date===new Date().toISOString().slice(0,10)).length,
  inbox: (d.inbox||[]).length,
  principles: (d.standalonePrinciples||[]).length,
});
```
Expected: `writtenToday: 0`, `inbox: 0`, and `principles` back to its pre-verification count (2).

---

## Known issues to carry

- **Whole-document writes lose captures — CONFIRMED, not theoretical.** Reproduced on 2026-09-11:
  open the app in a tab, capture a new task from the capture window (task count 15 → 16),
  then edit anything in the app tab without reloading it. The app POSTs the document it
  loaded before the capture existed, and the captured task is gone (16 → 15), silently.
  Both surfaces read-modify-write the whole JSON, and the app holds its copy for as long
  as the tab stays open.

  This is data loss on the feature's main path — leaving the app open in a tab is normal.

  The fix is contained but not trivial. The app has exactly one write path,
  `postServerData(d)` called from `persist`, so re-fetching and merging before the POST is
  a few lines. But a naive "keep whatever the server has that `d` lacks" merge makes
  deletion impossible: every task deleted in the app comes straight back. Doing it right
  means tracking the record ids the app knew at load and at last save, so that
  missing-and-known reads as deleted while missing-and-unknown reads as externally added.
  That is its own change with its own tests, and bolting it onto this one would be worse
  than scheduling it.
  **FIXED on 2026-09-14.**  now re-reads the live document and three-way merges
  against the version this tab loaded, so an external write is kept while a deliberate
  deletion still deletes — the distinction a naive merge cannot make. Verified both ways
  through the real UI. 13 assertions in tests/merge.test.js. The banner below remains, now
  only to say the view is stale rather than to warn of loss.

  **Superseded — was: mitigated, not fixed.** The capture window now stamps `_ts` on every write, and the app
  compares the server's `_ts` against the last one it persisted whenever the window regains
  focus. An outside write raises an orange banner — "נוספו עדכונים מחוץ לחלון הזה — שמירה
  מכאן תמחק אותם" — with a רענן button. Silent loss becomes a visible prompt, but a user
  who ignores the banner and keeps editing still overwrites the capture. The merge is
  still owed.

- **`EV_STATUSES` is mirrored into `capture.html`.** Statuses are not user-editable so this is safe today, but it is a second copy that can drift.
- **Dictation quality** is whatever Chrome/Edge gives for `he-IL`. It fills an editable field and is never saved unreviewed.
