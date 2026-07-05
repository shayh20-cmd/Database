# Task List Fill-Height, Staff Roster, and Status Pill Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three UI bugs found while using the new `project_hub_01` project — a layout bug that clips dropdown popups when a list has few tasks, an empty staff-picker roster, and a status picker missing 3 of 7 statuses — across both `project_hub.html` and `project_hub_01.html` (which share the same source code for all three).

**Architecture:** Each fix is a small, exact-match string replacement applied identically to both HTML files (they were byte-identical in these regions before this plan). The staff-roster fix additionally copies real data from `data/project_hub.json` into `data/project_hub_01.json` via a one-time Node script (no manual Hebrew retyping, to avoid the transcription-error class of bug seen earlier this session).

**Tech Stack:** Build-free single-file React (`React.createElement`, no JSX/Babel) — same as the rest of the repo.

**Specs:** [2026-07-05-tasklist-fill-height-and-staff-roster-design.md](../specs/2026-07-05-tasklist-fill-height-and-staff-roster-design.md), [2026-07-05-process-status-pill-picker-design.md](../specs/2026-07-05-process-status-pill-picker-design.md)

---

## Task 1: Fix the list-view flex layout bug (both files)

**Files:**
- Modify: `project_hub.html`
- Modify: `project_hub_01.html`

- [ ] **Step 1: Fix `project_hub.html`**

Old (exact substring, appears once):
```javascript
style:{flex:1,overflowY:'auto',background:'var(--bg)'}}
```

New:
```javascript
style:{flex:1,display:'flex',flexDirection:'column',overflowY:'auto',background:'var(--bg)'}}
```

- [ ] **Step 2: Fix `project_hub_01.html`**

Same old/new strings as Step 1 (this region was untouched when `project_hub_01.html` was generated, so the exact substring still matches there).

- [ ] **Step 3: Verify with `node --check` on both files**

```bash
cd "C:/Users/Omega/Database"
for f in project_hub.html project_hub_01.html; do
  node -e "
    const fs = require('fs');
    const html = fs.readFileSync('$f', 'utf8');
    const m = html.match(/<script>([\s\S]*)<\/script>/);
    fs.writeFileSync('_check.js', m[1]);
  " && node --check _check.js && echo "$f: SYNTAX OK" && rm _check.js
done
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/Omega/Database"
git add project_hub.html project_hub_01.html
git commit -m "$(cat <<'EOF'
fix(list-view): make task list fill available height

The wrapper around ListView had flex:1 on a child (.list-wrap) but
never set display:'flex' on itself, so the flex:1 never took effect
-- the list area shrank to content height instead of filling the
screen. With few tasks, this clipped dropdown popups (e.g. the
priority picker) opened near the bottom. Adding display:flex +
flexDirection:column lets the existing flex:1 finally work.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Fix the staff picker (both files + data)

**Files:**
- Modify: `project_hub.html`
- Modify: `project_hub_01.html`
- Modify: `data/project_hub_01.json` (via a one-time script, not committed — this file is git-ignored)

- [ ] **Step 1: Fix the fallback check in `project_hub.html`**

Old (exact substring, appears once):
```javascript
const staff=data.staff||OFFICE_STAFF;
```

New:
```javascript
const staff=data.staff&&data.staff.length?data.staff:OFFICE_STAFF;
```

- [ ] **Step 2: Fix the same line in `project_hub_01.html`**

Same old/new strings as Step 1.

- [ ] **Step 3: Populate `data/project_hub_01.json`'s `staff` field from the live roster**

This copies the real 27-person office roster programmatically — do not retype any Hebrew names by hand.

```bash
cd "C:/Users/Omega/Database" && node -e "
const fs = require('fs');
const live = JSON.parse(fs.readFileSync('data/project_hub.json', 'utf8'));
const ph01 = JSON.parse(fs.readFileSync('data/project_hub_01.json', 'utf8'));
ph01.staff = live.staff;
fs.writeFileSync('data/project_hub_01.json', JSON.stringify(ph01));
console.log('project_hub_01.json staff count now:', ph01.staff.length);
"
```

Expected output: `project_hub_01.json staff count now: 27`

- [ ] **Step 4: Verify with `node --check` on both HTML files**

```bash
cd "C:/Users/Omega/Database"
for f in project_hub.html project_hub_01.html; do
  node -e "
    const fs = require('fs');
    const html = fs.readFileSync('$f', 'utf8');
    const m = html.match(/<script>([\s\S]*)<\/script>/);
    fs.writeFileSync('_check.js', m[1]);
  " && node --check _check.js && echo "$f: SYNTAX OK" && rm _check.js
done
```

- [ ] **Step 5: Commit the HTML changes**

`data/project_hub_01.json` is git-ignored (per [2026-07-02-local-file-persistence-design.md](../specs/2026-07-02-local-file-persistence-design.md)'s Task 2) — only the two HTML files are committed here; the data file change takes effect immediately on disk without a commit.

```bash
cd "C:/Users/Omega/Database"
git add project_hub.html project_hub_01.html
git commit -m "$(cat <<'EOF'
fix(staff-picker): fall back to OFFICE_STAFF for empty staff arrays

data.staff||OFFICE_STAFF never triggered its fallback for an
explicitly-empty array ([] is truthy in JS), so a brand-new project
with staff:[] showed nobody to pick from. Also seeded
data/project_hub_01.json's staff field with the real office roster,
since it's shared firm-wide reference data, not project-specific
content that should have been cleared when the project was created.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Replace the status `<select>` with a colored pill picker (both files, both occurrences)

There are two separate places using the old limited picker: `ProcessTaskPanel`'s main add-event form, and a compact quick-add popup inside `TrackSection`. Both need the same replacement.

**Files:**
- Modify: `project_hub.html`
- Modify: `project_hub_01.html`

- [ ] **Step 1: Replace occurrence 1 (`ProcessTaskPanel`'s form) in `project_hub.html`**

Old (exact substring, appears once):
```javascript
React.createElement("select",{style:{width:'100%',padding:'5px 7px',border:'1px solid var(--border-strong)',borderRadius:6,fontSize:12,fontFamily:'inherit',background:'var(--surface)',outline:'none',color:'var(--text)',cursor:'pointer'},value:formStatus,onChange:e=>setFormStatus(e.target.value)},EV_ADD_STATUSES.map(s=>/*#__PURE__*/React.createElement("option",{key:s,value:s},EV_STATUSES[s].label)))
```

New:
```javascript
React.createElement("div",{style:{display:'flex',flexWrap:'wrap',gap:4}},EV_CYCLE.map(s=>/*#__PURE__*/React.createElement("span",{key:s,className:"pill",onClick:()=>setFormStatus(s),style:{color:EV_STATUSES[s].color,background:EV_STATUSES[s].bg,border:'2px solid '+(formStatus===s?EV_STATUSES[s].border:'transparent')}},EV_STATUSES[s].symbol+' '+EV_STATUSES[s].label)))
```

- [ ] **Step 2: Replace occurrence 2 (`TrackSection`'s quick-add popup) in `project_hub.html`**

Old (exact substring, appears once):
```javascript
React.createElement("select",{style:{...inp,cursor:'pointer'},value:formStatus,onChange:e=>setFormStatus(e.target.value)},EV_ADD_STATUSES.map(s=>/*#__PURE__*/React.createElement("option",{key:s,value:s},EV_STATUSES[s].label)))
```

New:
```javascript
React.createElement("div",{style:{display:'flex',flexWrap:'wrap',gap:4}},EV_CYCLE.map(s=>/*#__PURE__*/React.createElement("span",{key:s,className:"pill",onClick:()=>setFormStatus(s),style:{color:EV_STATUSES[s].color,background:EV_STATUSES[s].bg,border:'2px solid '+(formStatus===s?EV_STATUSES[s].border:'transparent')}},EV_STATUSES[s].symbol+' '+EV_STATUSES[s].label))
```

Note: this one has no trailing `)` after the `.map(...)` closing paren (it's immediately followed by a comma and the next grid-cell element, the date `<input>`) — match the exact old string above, which already accounts for this (one fewer closing paren than occurrence 1).

- [ ] **Step 3: Remove the now-unused `EV_ADD_STATUSES` constant in `project_hub.html`**

Old (exact substring, appears once):
```javascript
/* Statuses available to add manually (missing/response are auto-created) */const EV_ADD_STATUSES=['progress','sent','comments','approved'];
```

New: (empty string — delete it entirely)

- [ ] **Step 4: Repeat Steps 1-3 in `project_hub_01.html`**

Same three old/new string pairs as Steps 1-3 (this region was untouched when `project_hub_01.html` was generated, so the exact substrings still match there).

- [ ] **Step 5: Verify no remaining references to `EV_ADD_STATUSES`**

```bash
cd "C:/Users/Omega/Database" && grep -c "EV_ADD_STATUSES" project_hub.html project_hub_01.html
```

Expected: `project_hub.html:0` and `project_hub_01.html:0`.

- [ ] **Step 6: Verify with `node --check` on both files**

```bash
cd "C:/Users/Omega/Database"
for f in project_hub.html project_hub_01.html; do
  node -e "
    const fs = require('fs');
    const html = fs.readFileSync('$f', 'utf8');
    const m = html.match(/<script>([\s\S]*)<\/script>/);
    fs.writeFileSync('_check.js', m[1]);
  " && node --check _check.js && echo "$f: SYNTAX OK" && rm _check.js
done
```

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/Omega/Database"
git add project_hub.html project_hub_01.html
git commit -m "$(cat <<'EOF'
feat(process-panel): replace status select with colored pill picker

Both places that let you pick a new process-event status (the main
add-event form in ProcessTaskPanel, and the quick-add popup in
TrackSection) used a plain <select> limited to 4 of the 7 EV_STATUSES
entries. Replaced with a colored pill row (reusing the existing .pill
style already used for priority) showing all 7 statuses, including
missing/response which were previously auto-created-only. Removed
the now-dead EV_ADD_STATUSES constant.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verify end-to-end

- [ ] **Step 1: Start the server and load `project_hub_01`**

Use the preview tools: `preview_start` with config name `project-hub` (reuses if already running), navigate to `/project_hub_01`, check `preview_console_logs` for errors.

- [ ] **Step 2: Verify the fill-height fix**

Navigate to a sheet with 1 task (e.g. `מסلול רישוי` → `תיק מידע`). Use `preview_inspect` on `.list-wrap` to confirm its rendered height now matches (or nearly matches) the available viewport height, not just the content height (compare against `data/project_hub_01.json`'s task count in that sheet — should be a small number, but `.list-wrap` should still be tall).

- [ ] **Step 3: Verify the status pill picker**

Click into that same task to open `ProcessTaskPanel` (or use whatever UI path opens it — the "▶"/expand affordance on a process-type task row). Confirm via `preview_snapshot` that all 7 status pills render (חסר, בעבודה, נשלח, בהתייחסות, יש הערות, עדכון, מאושר). Click a pill, confirm the selection ring moves to it.

- [ ] **Step 4: Verify the staff picker**

Navigate to `מבט על` (Overview), find "צוות המשרד", click "הוסף עובד". Confirm via `preview_snapshot` that real employee names (e.g. דוד קנפו) now appear as pickable options. Click one, confirm they're added to the team list and it persists after a reload.

- [ ] **Step 5: Confirm `project_hub.html` (ספريית לוד) still works correctly**

Navigate to `/project_hub`. Confirm the app loads with zero console errors, the task list still renders correctly (its lists are normally full enough that the fill-height fix should be invisible there, but must not regress — e.g. no double scrollbars, no layout shift), and the staff picker / status pill picker both work the same way as in `project_hub_01`.

- [ ] **Step 6: Confirm real ספريית לוד data was not altered**

```bash
cd "C:/Users/Omega/Database" && node -e "
const d = JSON.parse(require('fs').readFileSync('data/project_hub.json','utf8'));
console.log('projectName:', d.projectName);
console.log('total tasks:', d.sheets.reduce((n,s)=>n+(s.tasks?s.tasks.length:0),0));
console.log('staff count:', (d.staff||[]).length);
"
```

Expected: `projectName: ספريית לוד`, task count unchanged from before this plan (55, unless the user has since added/removed tasks through normal use), `staff count: 27` (untouched — Task 2 only reads from this file, never writes to it).

---

## Self-Review Notes (for the plan author, not a task)

- Spec coverage: fill-height fix ✓ (Task 1), staff fallback + roster seed ✓ (Task 2), all-7-statuses pill picker in both known usage sites ✓ (Task 3, including the second `TrackSection` occurrence the spec didn't explicitly call out by name but is covered by "wherever this pattern is used"), dead-code removal ✓ (Task 3 Step 3/5), testing ✓ (Task 4, covers all three fixes plus a ספريית לוד regression/data-safety check).
- No placeholders: every old/new string pair is a complete, exact, already-located substring (all verified unique via `grep -c` before writing this plan).
- Type/name consistency: `EV_CYCLE`, `EV_STATUSES`, `formStatus`/`setFormStatus` are pre-existing names already in scope at both replacement sites (verified via the surrounding context read during investigation) — no new names introduced that could typo-drift between tasks.
