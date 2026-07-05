# Task List Fill-Height + Staff Roster Fix — Design Spec

## Goal

Fix two issues discovered while using the new `project_hub_01` ("אולם ספورט לוד") project:

1. The task list area shrinks to fit its content instead of filling the screen, so dropdown popups (e.g. the priority picker) opened on a row near the bottom get visually clipped when there are few tasks — "you can't see the options."
2. The "צוות המשרד" (office team) staff picker has nothing to choose from in the new project, because `staff` was cleared along with the rest of the project-specific content when the project was created.

## Issue 1: Task list doesn't fill available height

**Root cause:** In `TrackView`, the div wrapping `ListView` has:
```javascript
style:{flex:1,overflowY:'auto',background:'var(--bg)'}
```
`.list-wrap` (rendered inside `ListView`) has `flex:1` in its CSS, intended to make it stretch to fill all remaining vertical space. But `flex:1` on a child only has an effect when its *parent* is a flex container — and this wrapper div never sets `display:'flex'`, so the child's `flex:1` is inert. The wrapper (and everything inside it) just shrinks to content height instead of filling the screen.

This is a pre-existing bug in `project_hub.html`, not something introduced by the new project — it's just far more visible there because `project_hub_01` starts with very few tasks per sheet, whereas ספريית לוד's sheets are usually full enough that the shrink-to-content behavior isn't noticeable. There is exactly one occurrence of this wrapper's style object in the file, and it's shared by every list view (every track/stage sheet, the combined "מבט מאוחד" view, and the `ניהול תכנון`/`NihulHubView` list — confirmed via the second screenshot, which shows the identical clipped-dropdown symptom there too).

**Fix:** add `display:'flex',flexDirection:'column'` to that one wrapper's style object:
```javascript
style:{flex:1,display:'flex',flexDirection:'column',overflowY:'auto',background:'var(--bg)'}
```
This makes `.list-wrap`'s existing `flex:1` finally take effect, so the white list area always fills the remaining screen height regardless of task count — which both restores full-height white background and gives dropdowns room to render without clipping. `.toolbar` (the sibling above `.list-wrap`, already `flexShrink:0` implicitly by not having `flex`) keeps its natural height; `.list-wrap` absorbs all remaining space, exactly as the existing `.list-wrap{overflow:auto;flex:1}` CSS rule already assumed.

Since `project_hub_01.html` was copied verbatim from `project_hub.html`, this single source-level fix must be applied identically in **both** files (they currently have the exact same bug in the exact same place).

## Issue 2: Empty staff roster in the new project

**Root cause:** `staff` (the office-wide employee roster: name/role/email/phone/office — 27 people) was treated as project-specific "content" and cleared to `[]` when `project_hub_01` was generated (per [2026-07-02-project-hub-01-design.md](2026-07-02-project-hub-01-design.md)'s "cleared to empty" list). In hindsight this was the wrong category for it — `staff` is shared, firm-wide reference data (who works at the office), not something specific to one project, unlike `team` (which project members are assigned, with project-specific roles) which correctly stays empty for a new project.

There's also a secondary code-level robustness gap: `OverviewPage` reads `const staff=data.staff||OFFICE_STAFF;` intending `OFFICE_STAFF` (a hardcoded 27-person fallback matching the live roster) as a safety net when `data.staff` is missing — but `[]` is truthy in JavaScript, so the fallback never triggers for an explicitly-empty array, only for `null`/`undefined`. This masked the real problem (masks *any* app-level list from ever legitimately being empty by accident, though `staff` is the only case that matters here since it's the only such field with an `||OFFICE_STAFF` fallback pattern).

**Fix:**
1. Populate `data/project_hub_01.json`'s `staff` field with the same 27-entry roster from `data/project_hub.json` (they're identical to `OFFICE_STAFF`, confirmed by inspection) — restores the picker to working order immediately.
2. Fix the fallback check in `project_hub.html`/`project_hub_01.html` (both files, same source line) from `data.staff||OFFICE_STAFF` to `(data.staff&&data.staff.length?data.staff:OFFICE_STAFF)`, so a genuinely empty `staff` array falls back correctly in the future rather than silently showing zero pickable people.

## Non-goals

- No broader reconsideration of the project_hub_01 spec's other "cleared to empty" categorizations (`team`, `goals`, `milestones`, etc. remain correctly empty — only `staff` was miscategorized).
- No change to how `team` (project-specific assignments) works.
- No visual/design changes beyond making the existing white area fill available height — no new styling.

## Testing / verification

Manual, via the preview tools (no automated test harness in this repo):
1. In `project_hub_01`, navigate to a sheet with 1 task (e.g. `מסلول רישוי` → `תיק מידע`), open the priority dropdown on that task, confirm all three options (גבוהה/בינונית/נמוכה) are fully visible, not clipped.
2. Confirm the white list area now visually extends to the bottom of the screen in that same short-list scenario.
3. Repeat the dropdown/fill-height check in `ניהול תכנון` (NihulHubView) with few tasks.
4. Confirm `project_hub.html` (ספريית לוד) still renders correctly after the same fix (its lists are normally full enough that this was invisible, but the change must not regress it).
5. In `project_hub_01`'s "צוות המשרד" section, click "הוסף עובד" and confirm the picker now lists real employees (e.g. דוד קנפו) to choose from.
6. Confirm adding a team member still works end-to-end (persists, shows in the team list).
