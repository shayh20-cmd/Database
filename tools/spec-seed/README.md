# Spec seed tool

Parses a ג2 (מפרט טכני) Word document into `data/spec_library.json` — the reusable
knowledge base for the spec-creator app.

## Run

```bash
python tools/spec-seed/seed.py "<path to .docx>"
```

Then run the tests:

```bash
python -m unittest tools/spec-seed/test_reference.py tools/spec-seed/test_parser.py tools/spec-seed/test_seed_output.py
```

## How it works

1. `read_paragraphs` — extracts `(style, text, bold)` per paragraph, skipping the
   table-of-contents region.
2. `parse_library` — walks the paragraphs:
   - A `פרק NN – שם` line **in a chapter style** (`Normal`/`Heading*`) starts a chapter.
     Gating on style stops appendix cross-references (styles `אורן סיני`, `List Paragraph`)
     from creating spurious chapters.
   - A paragraph in a sub-chapter style (`סגנון טקסט`, `כותרת פרק`) starts a sub-chapter.
   - `ת"י …` lines → `kind: "standard"`; short bold lines → `kind: "heading"`;
     everything else → `paragraph`. A paragraph ending in `:` adopts the following
     list items as `children`.
3. `resplit_implicit` — chapters that produced **no** styled sub-chapters (everything
   fell into the implicit `כללי`) are split into real sub-chapters at their `heading`
   clauses. Styled chapters are left as-is.
4. A `מבנה ציבור` PRESET is built selecting every chapter + sub-chapter found.

## Known limitation — inconsistent source styling

Source specs are authored inconsistently, so the seed is a **draft**, not a finished
library:

- Chapters authored with `סגנון טקסט` on every heading level (e.g. **פרק 12 עבודות
  אלומיניום**) come out **over-granular** (~100 sub-chapters) — every heading, at every
  depth, becomes a sub-chapter. The content is correct; the grouping is too fine.
- Chapters with flat styling are split at their bold headings by `resplit_implicit`,
  which is usually close to right.

Final sub-chapter structuring (merging, nesting, promoting/demoting headings) is meant
to happen **in the app** (Plan 2), where it is a few clicks — not by hand-editing JSON.

## Review checklist (run after each seed)

Open `data/spec_library.json` and spot-check:
- [ ] Chapter numbers/names match `data/spec_chapter_reference.json`; no duplicates.
- [ ] Architecture chapters (5, 9, 10, 12, 14) have plausible sub-chapters and real clauses.
- [ ] Nested lists (e.g. "תכולות … הן:") captured their bullet items as `children`.
- [ ] Standards (ת"י) tagged `kind: "standard"`.

Fix obvious mis-classifications directly in the JSON, or tune `parser.py` and re-run.
```
