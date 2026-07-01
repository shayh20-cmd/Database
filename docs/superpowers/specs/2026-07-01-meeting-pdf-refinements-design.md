# Meeting Minutes PDF Refinements — Design Spec

## Goal

Six refinements to the meeting-minutes print output built in [2026-07-01-meeting-minutes-pdf-export-design.md](2026-07-01-meeting-minutes-pdf-export-design.md), based on reviewing the actual printed result: smaller print font, visible sub-item numbering with indent, a third nesting level (sub-sub-items) that folds into its parent's row instead of creating new rows, full discipline names instead of short codes, and — the largest change — meeting items go back to having two real date fields instead of the single `dueDate` the previous spec consolidated them into, now edited through the app's existing date-range picker component and split into two columns in print.

## Supersedes

This spec **reverses** the "Data model changes" and "Editing UI changes" sections of the previous spec (single `dueDate` field, one native `<input type="date">` column). Everything else from the previous spec (print isolation, attendees line, רשם/תפוצה, group-header table structure) stays as built.

## 1. Print font size

All text inside `.meeting-print-table` (header cells and body cells) changes from `fontSize:11`/`font-size:11pt` to `10`/`10pt`. No other sizing changes.

## 2. Sub-item numbering + indent

Currently, child rows (e.g. "2.1") in the print table show only their topic — the group's shared number is on the header row. Child rows now show their own number prefixed onto the topic text (e.g. `"2.1  לעשות אחד לעשות 2"`), and the topic cell for child rows gets extra `paddingRight` beyond the header row's cell, so the text visually starts further from the column's right edge (RTL: padding-right pushes the text away from the reading-start edge — creating a step-in/indent look under the bold header).

## 3. Sub-sub-items (third level)

A new "+ תת תת שורה" button in `MeetingItemsTable`'s toolbar adds an item numbered as `{lastNumber}.{n}` where `lastNumber` is a 2-segment number (e.g. adding to "2.1" produces "2.1.1", "2.1.2", ...). Disabled when there's no 2-segment item to attach to (mirrors how "+ תת-שורה" is already disabled when `items.length===0`).

In print, a 3-segment item never gets its own `<tr>`. Instead, `buildPrintGroups` groups 3-segment items under their 2-segment parent (the child row), and the child row's topic cell renders the parent's topic followed by a small numbered list of its grandchildren's topics (e.g.):

```
2.1  לעשות אחד לעשות 2
     2.1.1  עדכון X
     2.1.2  עדכון Y
```

A grandchild's own assignee/dates are not shown separately in print (only its number + topic, as a list item) — the row's לטיפול/תאריך columns stay driven by the 2-segment child item only. This keeps the row count identical to before level-3 existed; only the printed group with children now needs a level between "group" and "leaf."

**Orphan handling:** a 3-segment item is folded into whichever 2-segment child row is currently "open" (the most recently seen 2-segment item in array order), mirroring how 2-segment orphans already attach to the currently-open group. If no 2-segment item is open yet (e.g. the array starts with a 3-segment item due to hand-edited numbers), it's treated as its own standalone leaf row with its own number, reusing the existing orphan-row fallback `buildPrintGroups` already has for 2-segment orphans.

## 4. Discipline full names in print

A new lookup table maps each `DISCIPLINES` id to a full Hebrew profession name, used only for the לטיפול column in print (the editing UI keeps showing the short code, unchanged):

```javascript
const DISCIPLINE_FULL_NAMES={
  ARCH:'אדריכל', STRC:'קונסטרוקטור', ELEC:'חשמל', ENVI:'סביבה',
  LAND:'נוף', TRAF:'תנועה', PM:'ניהול פרויקט', SAFE:'בטיחות',
  HVAC:'מיזוג אוויר', PLUM:'אינסטלציה', HYDR:'ניקוז', ACSS:'נגישות',
  GR:'קרקע', LIFT:'מעליות', TNDR:'מכרזים', AGRO:'אגרונומיה'
};
```

`assigneeLabel` for print falls back to the existing short-code label (or `'לידיעה'`, or the raw id) if a discipline isn't in this table — no crash on an unmapped id.

## 5+6. Two date fields via the existing `DateRangeCell` component

### Data model

Meeting items go back to two date fields, matching the naming the rest of the app already uses for tasks (not the previous spec's `endDate`):

```javascript
{
  id, number, topic,
  assignee: string|null,
  startDate: string|null,  // "YYYY-MM-DD"
  dueDate: string|null,    // "YYYY-MM-DD"
  itemType, createdTaskTrackId
}
```

**Migration:** `migrateMeeting` changes from consolidating to a single `dueDate` to instead ensuring both fields exist: `startDate: it.startDate ?? null, dueDate: it.dueDate ?? null` (items already migrated by the previous spec's `migrateMeeting` only have `dueDate` set — that value is preserved as the item's `dueDate`, and `startDate` stays `null` for those items since the original start date was already discarded in the prior migration; this is an acceptable one-time loss, consistent with how the prior migration itself was already documented as lossy).

### Editing UI

`MeetingItemsTable`'s date column stops using a native `<input type="date">` and instead renders the existing `DateRangeCell` component (already used for tasks/subtasks elsewhere in this file), wired the same way those call sites already do:

```javascript
React.createElement(DateRangeCell,{
  startDate:item.startDate||'', dueDate:item.dueDate||'',
  onChange:(f,v)=>updateItem(item.id,{[f]:v})
})
```

`DateRangeCell` renders its own `<td>` (it's a self-contained cell component, not something to wrap in an extra `<td>`) with a compact timeline-bar showing both dates; clicking it opens `CalendarRangePicker`, which lets the user pick both dates in one popover and includes an existing "ניקוי" button that clears both — this is the "option to pick '-' / no dates" from item 6, satisfied by reuse rather than new code.

### Print output

The print table's single "תאריך יעד" column becomes two columns — "תאריך התחלה" and "תאריך יעד" — both right of לטיפול (rightmost is still מס', then הנושא, then לטיפול, then the two date columns, matching the existing RTL order). Both are formatted with a new pure-numeric formatter (not the existing `fmtDate`, which produces `"26 יונ"`):

```javascript
const fmtDateNumeric=iso=>iso?iso.split('-').reverse().join('.'):'-';
```

Empty/missing dates print as `-`.

### `CreateItemDialog`

Currently reads `item.dueDate` for both the new task's `startDate` and `dueDate` (a workaround from the single-date model). Reverts to the direct, simpler mapping now that the field names match 1:1 with the task shape:

```javascript
startDate:item&&item.startDate||'', dueDate:item&&item.dueDate||''
```

## Print table column order (final)

RTL, right to left: מס' | הנושא | לטיפול | תאריך התחלה | תאריך יעד

## Out of scope

- Everything already built and unchanged from the previous spec: print isolation, attendees paragraph, רשם/תפוצה fields and their print blocks, group-header bold/underline/rowSpan structure for 2-level groups.
- Any change to how `itemType`/⚙ menu or `CreateItemDialog`'s own fields work beyond the date-field rename above.
- Validating that a grandchild's number prefix actually matches an existing parent when the user hand-edits the number field to something inconsistent — same best-effort behavior as the existing 2-level grouping already has (documented as a known limitation in the code comment added for `buildPrintGroups`).
