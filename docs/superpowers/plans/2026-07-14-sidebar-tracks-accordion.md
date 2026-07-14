# Sidebar Tracks Accordion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the dynamic track sub-items in `Sidebar` (מסלול רישוי / מסלול מכרז / מסלול ביצוע, generated from `data.tracks`) under a single collapsible "מסלולים" header, so the sidebar stays compact regardless of how many tracks a project has. "מבט על", "ניהול תכנון", and "טמפלייט" are unaffected.

**Architecture:** New local state `tracksExpanded` (default `true`, not persisted) inside `Sidebar` controls whether the dynamic-track `sb-sub-item` buttons render. A new header `sb-sub-item` button (reusing the existing `DownIcon` component already used for the project-row chevron) toggles that state and does not call `setTrack`. When collapsed, the header gets the `active` style if the currently selected track is one of the dynamic tracks, so selection state is never hidden.

**Tech Stack:** Single-file React 18 app (Babel standalone, no build step) — `project_hub_01.html` (the active file; `project_hub.html` is a stale earlier copy and must NOT be edited). No test framework; verification is manual, via the browser preview tooling.

**Spec:** `docs/superpowers/specs/2026-07-14-sidebar-tracks-accordion-design.md`

---

### Task 1: Add collapsible "מסלולים" group to `Sidebar`

**Files:**
- Modify: `project_hub_01.html` (`function Sidebar(...)`, ~offset 1226-1227)

- [ ] **Step 1: Add the `tracksExpanded` state**

Find this exact text (inside `Sidebar`, right after `expandedProj` state):

```js
const[expandedProj,setExpandedProj]=React.useState('ph01');// ph01 open by default
```

Replace with:

```js
const[expandedProj,setExpandedProj]=React.useState('ph01');// ph01 open by default
const[tracksExpanded,setTracksExpanded]=React.useState(true);
```

- [ ] **Step 2: Replace the flat dynamic-track list with a collapsible header + conditional list**

Find this exact text (the `tracks.filter(...).map(...)` block that renders מסלול רישוי / מכרז / ביצוע, between the "ניהול תכנון" sub-item and the "טמפלייט" sub-item):

```js
tracks.filter(t=>t.id!=='ongoing').map(t=>/*#__PURE__*/React.createElement("button",{key:t.id,className:`sb-sub-item${track===t.id?' active':''}`,onClick:()=>setTrack(t.id)},/*#__PURE__*/React.createElement("span",{className:"sb-sub-dot",style:{background:track===t.id?'var(--accent)':'var(--border-strong)'}}),/*#__PURE__*/React.createElement("span",{className:"sb-item-icon",style:{width:13,height:13}},/*#__PURE__*/React.createElement(Ic,{n:"tasks",size:13})),t.label))
```

Replace with:

```js
/*#__PURE__*/React.createElement("button",{className:`sb-sub-item${!tracksExpanded&&tracks.filter(t=>t.id!=='ongoing').some(t=>t.id===track)?' active':''}`,onClick:()=>setTracksExpanded(!tracksExpanded)},/*#__PURE__*/React.createElement("span",{className:"sb-sub-dot",style:{background:!tracksExpanded&&tracks.filter(t=>t.id!=='ongoing').some(t=>t.id===track)?'var(--accent)':'var(--border-strong)'}}),/*#__PURE__*/React.createElement("span",{className:"sb-item-icon",style:{width:13,height:13}},/*#__PURE__*/React.createElement(DownIcon,{open:tracksExpanded})),"מסלולים"),tracksExpanded&&tracks.filter(t=>t.id!=='ongoing').map(t=>/*#__PURE__*/React.createElement("button",{key:t.id,className:`sb-sub-item${track===t.id?' active':''}`,style:{paddingRight:44},onClick:()=>setTrack(t.id)},/*#__PURE__*/React.createElement("span",{className:"sb-sub-dot",style:{background:track===t.id?'var(--accent)':'var(--border-strong)'}}),/*#__PURE__*/React.createElement("span",{className:"sb-item-icon",style:{width:13,height:13}},/*#__PURE__*/React.createElement(Ic,{n:"tasks",size:13})),t.label))
```

What this does:
- **Header button**: same `sb-sub-item` styling/dot/icon-slot pattern as every other sub-item, so it lines up visually. Its dot and `active` class both light up (via `var(--accent)`) only when the group is collapsed *and* the currently selected `track` is one of the dynamic tracks — so the selection is still visible when collapsed. `onClick` only flips `tracksExpanded`; it never calls `setTrack`.
- **Icon**: reuses `DownIcon` (already defined earlier in `Sidebar`, used by the project-row chevron) passing `open:tracksExpanded` — same open/closed semantics already used there (down-chevron when closed/collapsible, up-chevron when open).
- **Conditional list**: `tracksExpanded&&tracks.filter(...).map(...)` — identical buttons to before (same class, same active check, same `onClick`), just gated on `tracksExpanded` and with `style:{paddingRight:44}` added so they read as visually indented one level under the new header (the existing sub-items use the CSS class's built-in `padding-right:32px`; `44` nudges these further right/in for the nested look). When `tracksExpanded` is `false` this evaluates to `false`, which React silently skips as a child.

Do **not** touch the "מבט על", "ניהול תכנון", or "טמפלייט" buttons immediately before/after this block — they are unchanged.

- [ ] **Step 3: Check for syntax errors in the browser**

Start the `project-hub` launch config (serves `C:\Users\Omega\Database`) and open `http://localhost:3403/project_hub_01.html`. Check the browser console: expect **no** Babel/React errors. If there's a syntax error, re-check Step 2's replacement text for a mismatched brace/paren before proceeding.

- [ ] **Step 4: Commit**

```bash
git add project_hub_01.html
git commit -m "feat(sidebar): group dynamic tracks under collapsible מסלולים header"
```

---

### Task 2: Manual verification in the browser preview

**Files:** none (verification only)

- [ ] **Step 1: Confirm default state on load**

Open `http://localhost:3403/project_hub_01.html`, with the "אולם ספורט לוד" (PH01) project row expanded (default). Expected: sidebar shows, in order, "מבט על", "ניהול תכנון", a "מסלולים" row with a chevron pointing up (open state) and no dot/active highlight, then indented sub-rows for מסלול רישוי / מסלול מכרז / מסלול ביצוע, then "טמפלייט" — matching today's flat layout but with the new header row inserted above the three track rows.

- [ ] **Step 2: Collapse and re-expand**

Click "מסלולים". Expected: the three track rows disappear, the chevron flips to point down, and `track` state / main content area do **not** change (whatever page was showing stays showing). Click "מסלולים" again. Expected: the three track rows reappear, chevron flips back up.

- [ ] **Step 3: Verify active-while-collapsed indicator**

Click "מסלול מכרז" to select it (content area should switch to that track). Then click "מסלולים" to collapse the group. Expected: the "מסלולים" header row itself now shows the active/highlighted style (accent-colored dot and text) even though its own sub-rows are hidden. Expand it again — expected: "מסלול מכרז" itself shows as the active row, and the header goes back to its normal (non-active) style.

- [ ] **Step 4: Verify unaffected items**

Click "מבט על", then "ניהול תכנון", then "טמפלייט". Expected: all three behave exactly as before — each navigates immediately, none of them are nested under "מסלולים", and none of them are affected by the `tracksExpanded` toggle state.

- [ ] **Step 5: Check the browser console for errors**

Use the preview tooling's console-log check after the above interactions; expect no new errors.

No commit for this task — it's verification of Task 1's commit. If any check fails, fix Task 1's code and re-verify before moving on.
