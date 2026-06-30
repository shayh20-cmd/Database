# Meeting Minutes Feature — Design Spec

## Goal

Add a structured meeting minutes system to the project hub, serving as a management knowledge base for all project meetings.

## Architecture

Meetings are stored as structured JSON objects in `data.meetings[]` alongside existing data in localStorage. The UI adds a `MeetingsView` component (archive list) and a `MeetingEditor` component (single meeting document). Meetings appear in two places: a global sidebar entry and a per-track tab.

## Data Model

```javascript
// data.meetings = []
{
  id: string,           // uuid
  trackId: string|null, // null = project-wide, or track id (e.g. "arch")
  title: string,        // meeting topic / subtitle
  date: string,         // "YYYY-MM-DD"
  participants: [
    {
      name: string,
      role: string,
      isCustom: boolean  // true = manually typed, not from team/consultants list
    }
  ],
  items: [
    {
      id: string,
      number: string,    // free string: "1", "1.1", "1.2", "2" etc.
      topic: string,
      assignee: string|null,  // DISC id ("ARCH","LAND",...) or "לידיעה" or null
      startDate: string|null, // "YYYY-MM-DD"
      endDate: string|null,
      itemType: null|"task"|"subtask"|"update"|"principle"|"milestone"|"goal",
      createdTaskTrackId: string|null  // informational only — no live link
    }
  ],
  createdAt: string      // ISO timestamp
}
```

### Key rules

- `number` is user-entered free text. No automatic numbering. Supports "1", "1.1", "2" etc.
- `itemType` is a display annotation inside the app only — it is hidden in PDF export.
- When a task is created from an item, a new task is added to `data.tasks[]` independently. The meeting document is unaffected by future edits/deletions of that task.
- `createdTaskTrackId` stores where the task was created (for informational display only).

---

## Navigation — Two Access Points

### 1. Global sidebar item

A new "📝 ישיבות" entry in the main sidebar, below the track list. Opens `MeetingsView` showing all meetings across all tracks.

### 2. Per-track tab

Inside each `TrackView`, a new "ישיבות" tab alongside the existing רשימה / גאנט / שבלונות tabs. Shows only meetings where `trackId` matches the current track.

---

## Components

### MeetingsView (archive)

- Grid/list of meeting cards: date, title, track name, participant count, item count
- "ישיבה חדשה" button → opens blank `MeetingEditor`
- Click card → opens `MeetingEditor` in edit mode
- When accessed from global sidebar: shows all meetings, displays track badge on each card
- When accessed from track tab: shows only meetings for that track

### MeetingEditor (document editor)

Layout (RTL):

```
┌─────────────────────────────────────────────────────┐
│  [Project Name]                      📅 [Date input] │
│  נושא: [title input]                                 │
├─────────────────────────────────────────────────────┤
│  משתתפים                                             │
│  [Participant picker dropdown] [+ הוסף ידנית]        │
│  ┌────────────┬──────────────┐                       │
│  │ שם         │ תפקיד        │                       │
│  ├────────────┼──────────────┤                       │
│  │ יוסי כהן   │ אדריכל ראשי  │  [×]                 │
│  └────────────┴──────────────┘                       │
├─────────────────────────────────────────────────────┤
│  מס' │ נושא         │ לטיפול  │ התחלה │ סיום │ [⚙]  │
│  ─────────────────────────────────────────────────  │
│   1  │ [text input] │ [disc▼] │ [date]│[date]│  ⚙   │
│  1.1 │ [text input] │ [disc▼] │ [date]│[date]│  ⚙   │
│   2  │ [text input] │לידיעה ▼ │       │      │  ⚙   │
├─────────────────────────────────────────────────────┤
│  [+ שורה]  [+ תת-שורה]           [🖨 PDF]  [שמור]   │
└─────────────────────────────────────────────────────┘
```

**Participants:**
- Dropdown picker populated from existing `data.consultants[]` and team members
- Each entry shows name + role
- "הוסף ידנית" → text inputs for name + role, adds with `isCustom: true`
- Displayed as a small two-column table (שם / תפקיד) with remove button per row

**Items table:**
- Each row: number (text) | topic (textarea) | assignee (dropdown: DISCs + "לידיעה") | startDate | endDate | type button (⚙)
- `+ שורה` appends a new row
- `+ תת-שורה` appends a row with number pre-filled as `[last number].1` (user can edit)
- Rows can be reordered (drag) or deleted (row hover → delete icon)

**Type column (⚙):**
- Visible only inside the app — hidden via `@media print`
- Clicking ⚙ opens a small dropdown: משימה / תת-משימה / עדכון / עקרון תכנון / אבן דרך / יעד
- Once type is set, ⚙ shows the type label with a color indicator
- Option "צור פריט..." triggers the Create Item dialog (see below)

### Create Item Dialog

Triggered when user selects a type that creates a real system item (task, subtask, update, principle, milestone, goal).

```
┌──────────────────────────────────────┐
│ צור משימה                            │
│                                      │
│ שם: [pre-filled from topic, editable]│
│ מסלול: [Track dropdown]              │
│ קבוצה: [Group dropdown, by track]    │
│                                      │
│           [ביטול]    [צור]           │
└──────────────────────────────────────┘
```

- Name pre-filled from item `topic`
- Start/end dates transferred from item row
- Assignee discipline transferred from item `assignee`
- On confirm: adds new item to `data.tasks[]` (or appropriate array for updates/principles/milestones)
- Meeting item receives a small ✓ indicator; `createdTaskTrackId` is saved
- No live link — the created item is fully independent

---

## PDF Export

- Button "🖨 ייצוא PDF" calls `window.print()`
- `@media print` CSS rules:
  - Hide: app sidebar, top nav, ⚙ column, +שורה/+תת-שורה buttons, save/PDF buttons
  - Show: document header (project name + date), meeting title, participants table, items table (5 columns)
  - RTL layout, clean table borders, readable font size
- Result resembles a standard meeting minutes document

---

## Storage

- `data.meetings` added to the existing localStorage schema
- Initialized as `[]` if not present (backwards-compatible with existing saves)
- Saved on every "שמור" action (same pattern as existing save flow)

---

## Out of Scope (Phase 1)

- Word (.docx) export — planned for Phase 2
- Search across meeting content
- Attachments / file uploads
- Real-time collaboration
