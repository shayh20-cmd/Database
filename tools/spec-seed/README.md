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

The source's hierarchy is carried by a Word **multilevel list** — the *spine* —
whose indent levels map straight onto our tree:

    spine level 1  ->  sub-chapter      (09.01)          "כללי"
    spine level 2  ->  clause  depth 0  (09.01.01)        "תכולות"
    spine level 3  ->  sub-clause depth 1 (09.01.01 (א))  "דוגמאות"

1. `read_paragraphs` — extracts `{style, text, bold, numId, ilvl}` per paragraph
   (including the Word list `numId`/`ilvl`), skipping the table-of-contents region.
2. `group_chapters` — a `פרק NN – שם` line **in a chapter style** (`Normal`/`Heading*`/
   `Body Text*`) starts a chapter; `סוף פרק` closes it; parsing stops at `נספחים`.
   Style gating keeps appendix cross-references (styles `אורן סיני`, `List Paragraph`)
   from creating spurious chapters.
3. `detect_spine` — per chapter, the spine is the `סגנון טקסט`/`כותרת פרק` style if
   present (chapter 12), otherwise the dominant numbered list (the `numId` with the
   most `ilvl >= 1` paragraphs — e.g. `n323` in chapter 09).
4. `build_chapter` — walks the paragraphs: spine headings become sub-chapters (L1) and
   nested clauses (L>=2, tree-depth `L-2`); body paragraphs hang under the nearest
   heading as its lettered children. A `:`-ending body paragraph adopts the immediately
   following run of a **distinct** numbered list (`ת"י …` etc.) as its own children.
   `ת"י …` lines → `kind: "standard"`.
5. A `מבנה ציבור` PRESET is built selecting every chapter + sub-chapter found.

## Notes on the source

The source is authored inconsistently (each chapter uses its own list `numId`; only
chapter 12 uses a paragraph *style* for the spine), so `detect_spine` adapts per
chapter. The numbering itself is **derived from position** by the app
(`tools/spec-creator/lib/numbering.js`) — the seed only has to get the *tree shape*
right. Any remaining structuring is a few clicks in the app.

## Review checklist (run after each seed)

Render the numbered tree and spot-check (a small Node script using `assignNumbers`
from `numbering.js` prints `NN.NN.NN (א)` for each clause):
- [ ] Chapter numbers/names match `data/spec_chapter_reference.json`; no duplicates.
- [ ] Every chapter's first sub-chapter is `כללי`.
- [ ] Architecture chapters (5, 9, 10, 12, 14): `NN.01.01 תכולות` with `(א)(ב)(ג)` under it.
- [ ] `:`-lists (e.g. "רשימת תקנים ישראליים:") captured their items as `(1)(2)(3)` children.
- [ ] Standards (`ת"י`) tagged `kind: "standard"`.

Fix obvious mis-classifications by tuning `parser.py` and re-running.
