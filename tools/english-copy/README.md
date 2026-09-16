# How project_hub.en.html was made

`project_hub.en.html` is a generated English copy of `project_hub.html`. The original
is frozen and was not modified. These scripts record how the copy was produced, so the
658 KB result is auditable rather than a mystery.

## Why source edits at all

`i18n.js` translates *rendered text* through a Hebrew→English dictionary, and that
covers almost everything — the extractor reports 11 residual literals out of 1,458
entries. But it structurally cannot reach text the application derives **in code**:

| Case | Example | Renders as |
|---|---|---|
| A letter taken from a label | `(s.label || '?')[0]` on a status | `ת` from `תקוע` |
| Initials built from a name | avatar for `יונתן מאיר` | `ימ` |
| A number interpolated mid-string | `עדכון ≥${fEventDays}י` | `Update ≥7י` |
| Stored text shown for editing | clicking a task name | the raw Hebrew |

The dictionary matches by substring, so single Hebrew letters can never be added to it
— mapping `ת` would corrupt every word containing it. Hence a source pass.

## What must never be translated

Seven values are compared with `===` and eight are used as object keys. All fifteen are
in each script's `EXCLUDE` set and must survive byte-identical, or sheets, phases and
meeting-item routing break silently:

    לידיעה · תנאים מקדימים · ניהול שוטף · ניהול תכנון · אישורי היתר ·
    ניהול ותיאום · ללא שם · ביצוע · היתר · מכרז · תכנון ראשוני ·
    נכחו · רשם · תפוצה · כל שני 10

## Order

Run from the repository root, after copying `project_hub.html` to `project_hub.en.html`
and applying the shell edits (doc language, title, `I18N_FORCE_LANG`, the six date
constant arrays, and `direction:'rtl'` → `'ltr'`):

    node tools/english-copy/translate-seed.js        # title/comment/note/description  — 320
    node tools/english-copy/translate-constants.js   # PORTFOLIO_DATA, OFFICE_STAFF, … — 215
    node tools/english-copy/translate-names.js       # name/initials/org/role/…        — 103

Verified after each pass: zero visible Hebrew text nodes on List, Gantt, Meetings,
Overview, My tasks and Portfolio, and no console errors.
