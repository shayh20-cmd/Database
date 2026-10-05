# Office-library views — design

Sketch: https://claude.ai/artifact/1rrLxCaQTE2DT6g3GKMdis (approved 2026-10-05).

## Goal

Views (filter + grouping + sort + visible columns) can come from three places, so the office can
hand everyone the same ready-made views while each person keeps their own:

| Kind | Who sees it | Who edits it | Stored in |
|---|---|---|---|
| Office | everyone, every project | Super Admin | registry `library.views`, `scope:'office'` |
| Project | the project team | project managers | the sheet's `views[]` (as today) |
| Personal | only me, every project | me | registry `library.views`, `scope:'personal'`, `createdBy` me |

Office and personal views follow the same pattern as library fields and automations
(`libScope`, `libCreatorId`, "ספריית המשרד" / "הספרייה שלי").

## Library view record

```js
{ id:'lv-…', name, screen:'tasks'|'mytasks'|'gantt', scope:'office'|'personal',
  filterState, sortState, groupByState,
  hiddenCols,            // built-in ids as-is; a custom field as 't:'+title
  isDefault,             // office only — one per screen
  createdBy:{id,name}, createdAt, updatedAt }
```

Custom fields are matched by title in each project; a title the project lacks is skipped.
Filter / group / sort only use built-in fields and office lists, so their ids are the same everywhere.

## Behaviour (project task lists — phase 1)

- **Column order and width belong to the user**, not the sheet: `/api/personal` →
  `prefs.colLayout.tasks = {colOrder, colWidths}`, the same in every project. Until a user
  changes them, the sheet's existing order/widths are used. No one's drag or resize changes
  anyone else's table any more.
- **Hidden columns are part of the view.** With a view active, toggling a column changes only
  the screen (the view turns dirty); the sheet's `hiddenCols` stay the base when no view is active.
  Applying a view no longer writes anything to the sheet.
- **Menu**: three sections — ספריית המשרד / של הפרויקט / אישיים — plus "ללא מבט". The personal ★
  (per project+list, in the browser, as today) can point at any of them.
- **Opening a list**: ★ → last view used here → the office default for the screen → none.
- **Dirty**: filter/sort/group/hidden columns differ from the view. A banner offers
  "בטל שינויים", "עדכן מבט" (only where the user may edit it) and "שמור כמבט…".
- **Save dialog**: name; save in אישי / הפרויקט (managers) / ספריית המשרד (Super Admin);
  a summary of what the view holds.
- **Settings ← ספרייה ← מבטים**: office / mine tabs, grouped by screen, summary chips,
  ★ default (office, Super Admin), rename, delete. New views are made from the screen itself.

## Phases

1. Project task lists (stage lists and the combined view): model, per-user layout, menu,
   banner, save dialog, library tab.
2. המשימות שלי — office/personal views for screen `mytasks` (it already keeps its layout per user).
3. Gantt — screen `gantt`.
