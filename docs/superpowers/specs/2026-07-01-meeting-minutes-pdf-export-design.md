# Meeting Minutes PDF Export — Design Spec

## Goal

Fix the meeting-minutes PDF export so it produces a clean, A4-appropriate document instead of a screenshot of the app UI, and restructure the topics table so grouped items (a topic with numbered sub-items, e.g. "2" / "2.1" / "2.2") print as a proper sectioned table like a real MOM (minutes of meeting) document.

Follow-up to [2026-06-30-meetings-design.md](2026-06-30-meetings-design.md). This spec only changes the PDF export and the item date field — navigation, the archive view, and the "create item" flow are unchanged.

Reference document (not to be matched pixel-for-pixel, just the general idea): a Knafo Klimor Architects meeting-minutes PDF with a project/title block, a "נכחו:" attendees paragraph, a table with grouped section headers (bold, merged row number), and רשם/תפוצה lines at the end.

## Non-goals (deferred)

- Office letterhead / logo reproduction in the header — deferred to a future pass.
- Automatic page numbers / running footer — deferred along with the letterhead (browser's native print header/footer can stand in for now).
- Any change to the on-screen editing table layout beyond the date-column consolidation described below.

## Data model changes

`meeting.items[].startDate` + `.endDate` are consolidated into a single `dueDate` field, matching the reference's single "תאריך יעד" column:

```javascript
{
  id, number, topic,
  assignee: string|null,
  dueDate: string|null,   // "YYYY-MM-DD" — replaces startDate/endDate
  itemType, createdTaskTrackId
}
```

Migration: when reading a meeting, `dueDate = item.dueDate ?? item.endDate ?? item.startDate ?? null`. This runs as part of `migrateData` (same place the earlier `meetings: []` migration lives), so old meetings keep working without a separate one-off script.

New meeting-level fields:

```javascript
{
  ...,
  recordedBy: string,     // "רשם" — free text, single name
  distribution: string,   // "תפוצה" — free text, comma/newline separated names
}
```

Both default to `''` for new meetings and for existing meetings without the field (`meeting.recordedBy || ''`).

## Editing UI changes

- **Items table:** the two date inputs (start/end) are replaced by one date input bound to `dueDate`. No other column changes.
- **MeetingEditor:** two new text inputs, placed after the items table (before the toolbar), for רשם and תפוצה. Same visual style as the existing title/date inputs. Hidden from print only in the sense that they render as plain labeled text in the print output (see below) — the inputs themselves carry `meeting-print-hide` and are replaced by print-only static text nodes, following the existing pattern used for the participants picker.

## Print isolation

Current `@media print` only hides a few in-document buttons, so printing captures the whole app chrome (sidebar, project header, tab bars) because none of that is inside `.meeting-print-hide`. Replace it with visibility-based isolation that doesn't depend on enumerating every chrome element:

```css
@media print {
  body * { visibility: hidden; }
  .meeting-doc, .meeting-doc * { visibility: visible; }
  .meeting-doc {
    position: absolute; top: 0; left: 0;
    width: 100% !important; max-width: 100% !important;
    margin: 0 !important; padding: 24px !important;
    overflow: visible !important;
  }
  .meeting-print-hide { display: none !important; }
  @page { margin: 15mm 12mm; size: A4; }
  /* existing table/input rules stay, adjusted for the new layout below */
}
```

`.meeting-doc` carries inline styles (`maxWidth:860`, `overflowY:'auto'`, `flex:1`) for its normal on-screen scrollable-panel role; the `!important` overrides above are needed because `position: absolute` alone doesn't cancel those. This hides everything except the `.meeting-doc` subtree regardless of sidebar/header markup changes elsewhere in the app.

## Print-only content structure

Rendered only inside `.meeting-doc`'s print output (the interactive editor above it keeps its current on-screen layout):

1. **Header** — project name (bold), meeting title, date. (No office letterhead — deferred.)
2. **Attendees line** — "נכחו: " followed by a single inline paragraph of `name (role), name (role), ...` built from `meeting.participants`, replacing the editable table for print (the table itself gets `meeting-print-hide`).
3. **Topics table** — columns, right-to-left: מס' | הנושא | לטיפול | תאריך יעד.
4. **Footer block** — "רשם: {recordedBy}" and "תפוצה: {distribution}" as two lines, shown only if non-empty.

## Topics table grouping (print-only)

The editing screen keeps today's flat list with `+ שורה` / `+ תת-שורה`. Grouping is a pure presentational transform applied only when building the print markup — no change to how items are stored or edited.

**Group detection:** an item is a *group header* if its `number` contains no `.`. Its *children* are the items whose `number` starts with `"{header.number}."`, in array order.

**Rendering rule per group:**
- **Has children:** one bold, underlined header row — topic text spans the הנושא column, לטיפול/תאריך יעד cells blank (even if the header item has values, they're not printed) — followed by one row per child with its own נושא/לטיפול/תאריך יעד. The group's מס' cell is rendered once, on the header row, with `rowSpan = 1 + children.length`, vertically centered.
- **No children (standalone item):** a normal single row — not bold, values shown as usual. This covers a lone top-level item that was never split into sub-items.

**Fallback:** if a child's number prefix has no matching header item in the array (edited out of order), it's still grouped with other children sharing that prefix; the group renders without a header row (מס' shows the child's own number, no merged cell, no bold title row).

**Pagination:** `<thead>` is used so the column header row repeats on each printed page (native browser behavior — no extra code needed). Each group's rows get `page-break-inside: avoid` where the group is short enough to reasonably fit (best-effort; long groups may still split).

## Implementation notes

`project_hub.html` is a single-line-per-statement React file with no build step (`React.createElement` calls, Babel-free). Three separate unclosed/extra-paren syntax bugs were found and fixed in this file today from earlier imprecise edits — the file is fragile to hand-editing at this density. For this change:

- Write the new `MeetingItemsTable`, `MeetingEditor`, and print-CSS code in readable (non-minified) form first.
- Validate with `node --check` and an `acorn` parse before writing into the real file (same verification approach used for today's bug fixes).
- Replace whole function bodies rather than making small in-place edits inside the existing minified lines.

## Out of scope (this spec)

- Office letterhead/logo and running page-number footer (deferred, noted above).
- Any change to navigation, the meeting archive view, or the create-item dialog.
- Word/.docx export (already out of scope per the original meetings spec).
