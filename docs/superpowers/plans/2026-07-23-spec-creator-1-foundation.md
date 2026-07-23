# Spec Creator — Plan 1: Data Foundation & Server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data foundation for the technical-spec (ג2) generator: the canonical chapter reference, a DOCX→library seeding parser, the generated `spec_library.json`, and the two JSON API routes on the existing local server.

**Architecture:** A one-time Python seeding tool parses the example ג2 DOCX into a reusable library (chapters → sub-chapters → hierarchical clauses) plus a "מבנה ציבור" PRESET. The existing Node static/JSON server gains two `data/*.json`-backed routes (`spec-library`, `spec-projects`) following its existing `APPS` pattern. Parser heuristics are pure, unit-tested functions; the full-document seed run ends with a manual review by Claude (the source styling is inconsistent — this is the known risk).

**Tech Stack:** Node 24 (built-in `node:test`, `http`), existing `serve-handler` server, Python 3.12 with `python-docx` (already installed) and built-in `unittest`.

**Reference design:** `docs/superpowers/specs/2026-07-23-spec-creator-design.md`

**Disciplines enum (authoritative for all plans):** `ARCH | STRC | ELEC | HVAC | PLMB | SAFE | LAND | OTHER`
(refines the design doc by adding `LAND`.)

---

## File Structure

- Create: `data/spec_chapter_reference.json` — canonical chapter list (num, name, discipline).
- Create: `tools/spec-seed/parser.py` — pure parsing/classification functions.
- Create: `tools/spec-seed/seed.py` — orchestrator: DOCX → `spec_library.json`.
- Create: `tools/spec-seed/test_parser.py` — `unittest` tests for pure functions.
- Create: `tools/spec-seed/README.md` — how to run the seed + review checklist.
- Create: `data/spec_library.json` — generated output (committed).
- Modify: `tools/local-server/server.js` — add two entries to `APPS`.
- Create: `tools/local-server/test/api.test.js` — `node:test` integration test for the routes.

---

## Task 1: Canonical chapter reference data

**Files:**
- Create: `data/spec_chapter_reference.json`
- Create: `tools/spec-seed/test_reference.py`

- [ ] **Step 1: Write the failing test**

Create `tools/spec-seed/test_reference.py`:

```python
import json, os, unittest

REF = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'spec_chapter_reference.json')

class TestReference(unittest.TestCase):
    def setUp(self):
        with open(REF, encoding='utf-8') as f:
            self.data = json.load(f)

    def test_is_list_of_chapters(self):
        self.assertIsInstance(self.data, list)
        self.assertGreaterEqual(len(self.data), 40)

    def test_every_row_has_fields(self):
        allowed = {'ARCH','STRC','ELEC','HVAC','PLMB','SAFE','LAND','OTHER'}
        for row in self.data:
            self.assertIn('num', row)
            self.assertTrue(row['name'].strip())
            self.assertIn(row['discipline'], allowed)

    def test_known_chapters(self):
        by_num = {r['num']: r for r in self.data}
        self.assertEqual(by_num[12]['discipline'], 'ARCH')   # אלומיניום
        self.assertEqual(by_num[12]['name'], 'עבודות אלומיניום')
        self.assertEqual(by_num[8]['discipline'], 'ELEC')    # חשמל
        self.assertEqual(by_num[15]['discipline'], 'HVAC')   # מיזוג אוויר

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tools/spec-seed/test_reference.py -v`
Expected: FAIL — `FileNotFoundError` (the JSON does not exist yet).

- [ ] **Step 3: Create the reference data**

Create `data/spec_chapter_reference.json`:

```json
[
  { "num": 0,    "name": "מוקדמות", "discipline": "ARCH" },
  { "num": 1,    "name": "עבודות עפר", "discipline": "STRC" },
  { "num": 2,    "name": "עבודות בטון יצוק באתר", "discipline": "STRC" },
  { "num": 3,    "name": "מוצרי בטון טרום", "discipline": "STRC" },
  { "num": 4,    "name": "עבודות בנייה", "discipline": "ARCH" },
  { "num": 5,    "name": "עבודות איטום", "discipline": "ARCH" },
  { "num": 6,    "name": "מוצרי נגרות אומן ומסגרות פלדה", "discipline": "ARCH" },
  { "num": 7,    "name": "מתקני תברואה", "discipline": "PLMB" },
  { "num": 8,    "name": "מתקני חשמל", "discipline": "ELEC" },
  { "num": 9,    "name": "עבודות טיח", "discipline": "ARCH" },
  { "num": 10,   "name": "עבודות ריצוף וחיפוי", "discipline": "ARCH" },
  { "num": 11,   "name": "עבודות צביעה", "discipline": "ARCH" },
  { "num": 12,   "name": "עבודות אלומיניום", "discipline": "ARCH" },
  { "num": 13,   "name": "עבודות בטון דרוך", "discipline": "STRC" },
  { "num": 14,   "name": "עבודות אבן", "discipline": "ARCH" },
  { "num": 15,   "name": "מתקני מיזוג אוויר", "discipline": "HVAC" },
  { "num": 16,   "name": "מתקני הסקה וקיטור", "discipline": "HVAC" },
  { "num": 17,   "name": "מעליות", "discipline": "OTHER" },
  { "num": 18,   "name": "תשתיות תקשורת", "discipline": "ELEC" },
  { "num": 19,   "name": "מסגרות חרש", "discipline": "ARCH" },
  { "num": 20,   "name": "נגרות חרש", "discipline": "ARCH" },
  { "num": 21,   "name": "בנייני בטון טרומים", "discipline": "STRC" },
  { "num": 22,   "name": "רכיבים מתועשים בבניין (מחיצות, תקרות, רצפות)", "discipline": "ARCH" },
  { "num": 23,   "name": "כלונסאות קדוחים ויצוקים באתר", "discipline": "STRC" },
  { "num": 24,   "name": "עבודות הריסה ופירוקים", "discipline": "ARCH" },
  { "num": 26,   "name": "עוגני קרקע", "discipline": "STRC" },
  { "num": 27,   "name": "סידורי נגישות לנכים", "discipline": "ARCH" },
  { "num": 29,   "name": "שילוט והכוונה בבניינים", "discipline": "ARCH" },
  { "num": 30,   "name": "ריהוט וציוד מורכב בבניין", "discipline": "ARCH" },
  { "num": 34,   "name": "מערכות גילוי וכיבוי אש", "discipline": "SAFE" },
  { "num": 35,   "name": "מערכת בקרת מבנים", "discipline": "ELEC" },
  { "num": 36,   "name": "מתקני אוויר דחוס", "discipline": "HVAC" },
  { "num": 37,   "name": "מתקני גזים ונוזלים בלחץ גבוה", "discipline": "HVAC" },
  { "num": 40,   "name": "פיתוח האתר", "discipline": "LAND" },
  { "num": 41,   "name": "גינון והשקייה", "discipline": "LAND" },
  { "num": 41.5, "name": "גינון והשקייה - אחזקת גנים", "discipline": "LAND" },
  { "num": 43,   "name": "קירות תמך מקרקע משוריינת", "discipline": "STRC" },
  { "num": 44,   "name": "גידור ושערים", "discipline": "LAND" },
  { "num": 50,   "name": "משטחי בטון", "discipline": "STRC" },
  { "num": 51,   "name": "עבודות סלילה (סלילת מסלולים בשדות תעופה, כבישים ורחבות)", "discipline": "OTHER" },
  { "num": 54,   "name": "כרייה תת-קרקעית", "discipline": "OTHER" },
  { "num": 55,   "name": "אספקת חומרים לתשתית ולבנייה", "discipline": "OTHER" },
  { "num": 57,   "name": "קווי מים, ביוב ותיעול", "discipline": "PLMB" },
  { "num": 58,   "name": "מקלטים", "discipline": "SAFE" },
  { "num": 59,   "name": "מרחבים מוגנים", "discipline": "SAFE" },
  { "num": 62,   "name": "עבודות אבן ובטון בביצורים", "discipline": "OTHER" },
  { "num": 66,   "name": "מסגרות מגן", "discipline": "ARCH" },
  { "num": 67,   "name": "מתקני פלדה נושאי אנטנות וציוד יעודי אחר", "discipline": "OTHER" },
  { "num": 70,   "name": "מקוואות", "discipline": "OTHER" },
  { "num": 102,  "name": "המסמכים ההנדסיים של מכרז וחוזה הבנייה", "discipline": "ARCH" },
  { "num": 1000, "name": "לוח הפרסומים", "discipline": "OTHER" }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tools/spec-seed/test_reference.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add data/spec_chapter_reference.json tools/spec-seed/test_reference.py
git commit -m "feat(spec-creator): add canonical chapter reference data"
```

---

## Task 2: Server routes for spec-library & spec-projects

**Files:**
- Modify: `tools/local-server/server.js:25-29` (the `APPS` map)
- Create: `tools/local-server/test/api.test.js`

- [ ] **Step 1: Write the failing test**

Create `tools/local-server/test/api.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'data', 'spec_projects.json');
const PORT = 3999;

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null })); });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('spec-projects route round-trips JSON', async (t) => {
  if (fs.existsSync(DATA)) fs.unlinkSync(DATA);
  const proc = spawn('node', [SERVER, ROOT, '--port', String(PORT)], { stdio: 'ignore' });
  t.after(() => proc.kill());
  await wait(700);

  const empty = await req('GET', '/api/spec-projects');
  assert.deepStrictEqual(empty.body, {}, 'missing file returns {}');

  const payload = { _ts: 1, items: [{ id: 'p1', name: 'בדיקה' }] };
  const post = await req('POST', '/api/spec-projects', payload);
  assert.deepStrictEqual(post.body, { ok: true });

  const back = await req('GET', '/api/spec-projects');
  assert.strictEqual(back.body.items[0].name, 'בדיקה');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tools/local-server/test/`
Expected: FAIL — GET `/api/spec-projects` is not matched (route falls through to `serve-handler`, returns HTML not `{}`), so `JSON.parse` throws or assertion fails.

- [ ] **Step 3: Add the routes**

In `tools/local-server/server.js`, extend the `APPS` map (currently lines 25-29):

```js
const APPS = {
  'project-hub': path.join(DATA_DIR, 'project_hub.json'),
  'project-hub-01': path.join(DATA_DIR, 'project_hub_01.json'),
  'planning-dashboard': path.join(DATA_DIR, 'planning_dashboard.json'),
  'spec-library': path.join(DATA_DIR, 'spec_library.json'),
  'spec-projects': path.join(DATA_DIR, 'spec_projects.json')
};
```

No other change is needed — `API_ROUTE`, `handleApi`, GET/POST persistence all derive from `APPS` automatically.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tools/local-server/test/`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add tools/local-server/server.js tools/local-server/test/api.test.js
git commit -m "feat(spec-creator): add spec-library and spec-projects API routes"
```

---

## Task 3: Parser pure functions

The seed reads the example DOCX paragraphs as `(style_name, text, is_bold)` tuples and classifies each. These pure functions are the testable core; the messy orchestration lives in Task 4.

**Files:**
- Create: `tools/spec-seed/parser.py`
- Create: `tools/spec-seed/test_parser.py`

- [ ] **Step 1: Write the failing test**

Create `tools/spec-seed/test_parser.py`:

```python
import os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
from parser import chapter_start, is_chapter_end, classify, new_id, build_clause_tree

class TestChapterBoundary(unittest.TestCase):
    def test_detects_chapter_start(self):
        self.assertEqual(chapter_start('פרק 12 – עבודות אלומיניום'), (12, 'עבודות אלומיניום'))
        self.assertEqual(chapter_start('פרק 01 - עבודות עפר'), (1, 'עבודות עפר'))

    def test_ignores_non_chapter(self):
        self.assertIsNone(chapter_start('מחיר היסוד של עבודות אלומיניום'))

    def test_detects_chapter_end(self):
        self.assertTrue(is_chapter_end('סוף פרק 12 – עבודות אלומיניום'))
        self.assertFalse(is_chapter_end('פרק 14 – עבודות אבן'))

class TestClassify(unittest.TestCase):
    def test_subchapter_from_style(self):
        self.assertEqual(classify('סגנון טקסט', 'קיר מסך', False), 'subchapter')

    def test_subchapter_from_short_bold(self):
        self.assertEqual(classify('Normal', 'אדני חלון', True), 'subchapter')

    def test_standard_line(self):
        self.assertEqual(classify('Normal', 'ת"י 1068 - קירות מסך.', False), 'standard')

    def test_plain_paragraph(self):
        self.assertEqual(classify('Normal', 'מחיר הבסיס של אלמנטי קירות המסך יכלול חלונות ודלתות.', False), 'paragraph')

class TestClauseTree(unittest.TestCase):
    def test_colon_paragraph_gets_following_list_as_children(self):
        items = [
            ('paragraph', 'תכולות העבודה הכלולה במחיר היסוד הן:'),
            ('list',      'ביצוע עבודות האלומיניום.'),
            ('list',      'העסקת קונסטרוקטור.'),
            ('paragraph', 'העבודה כוללת את כל הנדרש עד קבלת הבניין.'),
        ]
        tree = build_clause_tree(items)
        self.assertEqual(len(tree), 2)
        self.assertEqual(len(tree[0]['children']), 2)
        self.assertEqual(tree[0]['children'][0]['text'], 'ביצוע עבודות האלומיניום.')
        self.assertEqual(tree[1].get('children', []), [])

    def test_ids_are_unique(self):
        self.assertNotEqual(new_id(), new_id())

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest tools/spec-seed/test_parser.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'parser'` (file not created yet).

- [ ] **Step 3: Write the parser**

Create `tools/spec-seed/parser.py`:

```python
"""Pure classification/structuring helpers for the ג2 spec seed.
No file I/O here — everything operates on already-extracted (style, text, bold) data
so it can be unit-tested on synthetic input."""
import re, uuid

_CHAP_RE = re.compile(r'^פרק\s+0*(\d+)\s*[–—-]\s*(.+?)\s*$')
_END_RE = re.compile(r'^סוף\s+פרק')
_STANDARD_RE = re.compile(r'ת["״]י\s*\d')          # ת"י 1068 / תקן
SUBCHAPTER_STYLES = {'סגנון טקסט', 'כותרת פרק'}
LIST_STYLES = {'List Paragraph', 'Body Text', 'Body Text 2'}

def new_id():
    return uuid.uuid4().hex[:10]

def chapter_start(text):
    """Return (num:int, name:str) if text is a chapter heading, else None."""
    m = _CHAP_RE.match(text.strip())
    if not m:
        return None
    return (int(m.group(1)), m.group(2).strip())

def is_chapter_end(text):
    return bool(_END_RE.match(text.strip()))

def classify(style, text, bold):
    """Classify one paragraph into: 'subchapter' | 'standard' | 'paragraph'.
    Heuristic — the seed run is reviewed manually afterwards."""
    t = text.strip()
    if style in SUBCHAPTER_STYLES:
        return 'subchapter'
    if _STANDARD_RE.search(t):
        return 'standard'
    # short, bold, no sentence-ending punctuation => a heading line acting as sub-chapter
    if bold and len(t) <= 40 and not t.endswith(('.', ':', ',')):
        return 'subchapter'
    return 'paragraph'

def build_clause_tree(items):
    """items: list of (kind, text) where kind in {'paragraph','list','standard'}.
    A paragraph whose text ends with ':' adopts the immediately-following run of
    'list' items as its children. Returns a list of clause dicts."""
    tree = []
    i = 0
    while i < len(items):
        kind, text = items[i]
        clause = {'id': new_id(), 'text': text,
                  'kind': 'standard' if kind == 'standard' else 'paragraph',
                  'children': []}
        if kind == 'paragraph' and text.rstrip().endswith(':'):
            j = i + 1
            while j < len(items) and items[j][0] == 'list':
                clause['children'].append({'id': new_id(), 'text': items[j][1], 'kind': 'paragraph', 'children': []})
                j += 1
            i = j
        else:
            i += 1
        tree.append(clause)
    return tree
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m unittest tools/spec-seed/test_parser.py -v`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/spec-seed/parser.py tools/spec-seed/test_parser.py
git commit -m "feat(spec-creator): add spec DOCX parser pure functions"
```

---

## Task 4: Seed orchestrator → generate `spec_library.json`

**Files:**
- Create: `tools/spec-seed/seed.py`
- Create: `tools/spec-seed/test_seed_output.py`
- Create: `data/spec_library.json` (generated by running the script)

- [ ] **Step 1: Write the seed orchestrator**

Create `tools/spec-seed/seed.py`:

```python
"""One-time (and reusable) seeding: parse a ג2 DOCX into data/spec_library.json.
Usage: python tools/spec-seed/seed.py "<path-to.docx>" [--building-type "מבנה ציבור"] [--preset-name "מבנה ציבור"]
Requires: python-docx."""
import argparse, json, os, sys, time
import docx
sys.path.insert(0, os.path.dirname(__file__))
from parser import chapter_start, is_chapter_end, classify, new_id, build_clause_tree, LIST_STYLES

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
REF_PATH = os.path.join(ROOT, 'data', 'spec_chapter_reference.json')
OUT_PATH = os.path.join(ROOT, 'data', 'spec_library.json')

def load_reference():
    with open(REF_PATH, encoding='utf-8') as f:
        return {r['num']: r for r in json.load(f)}

def para_is_bold(p):
    runs = [r for r in p.runs if r.text.strip()]
    return bool(runs) and all(r.bold for r in runs)

def read_paragraphs(path):
    d = docx.Document(path)
    # Skip the table-of-contents region: everything up to and including the last 'toc' paragraph.
    last_toc = -1
    for idx, p in enumerate(d.paragraphs):
        if p.style.name.startswith('toc'):
            last_toc = idx
    out = []
    for p in d.paragraphs[last_toc + 1:]:
        t = p.text.strip()
        if not t:
            continue
        out.append((p.style.name, t, para_is_bold(p)))
    return out

def parse_library(paragraphs, ref):
    chapters = []
    cur_chapter = None
    cur_sub = None
    pending = []  # (kind, text) buffer for the current sub-chapter, flushed into a clause tree

    def flush():
        nonlocal pending
        if cur_sub is not None and pending:
            cur_sub['clauses'] = build_clause_tree(pending)
        pending = []

    for style, text, bold in paragraphs:
        cs = chapter_start(text)
        if cs:
            flush()
            num, name = cs
            meta = ref.get(num, {'discipline': 'OTHER'})
            cur_chapter = {'num': num, 'name': ref.get(num, {}).get('name', name),
                           'discipline': meta['discipline'], 'subChapters': []}
            chapters.append(cur_chapter)
            cur_sub = None
            continue
        if is_chapter_end(text):
            flush(); cur_chapter = None; cur_sub = None; continue
        if cur_chapter is None:
            continue
        role = classify(style, text, bold)
        if role == 'subchapter':
            flush()
            cur_sub = {'id': new_id(), 'title': text, 'clauses': []}
            cur_chapter['subChapters'].append(cur_sub)
            continue
        if cur_sub is None:
            # clauses before the first sub-chapter go into an implicit "כללי" sub-chapter
            flush()
            cur_sub = {'id': new_id(), 'title': 'כללי', 'clauses': []}
            cur_chapter['subChapters'].append(cur_sub)
        kind = 'standard' if role == 'standard' else ('list' if style in LIST_STYLES else 'paragraph')
        pending.append((kind, text))
    flush()
    return chapters

def build_preset(chapters, name):
    return {'id': new_id(), 'name': name, 'buildingType': name,
            'selections': [{'chapterNum': c['num'],
                            'subChapterIds': [s['id'] for s in c['subChapters']]}
                           for c in chapters]}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('docx_path')
    ap.add_argument('--preset-name', default='מבנה ציבור')
    args = ap.parse_args()
    ref = load_reference()
    paragraphs = read_paragraphs(args.docx_path)
    chapters = parse_library(paragraphs, ref)
    library = {'_ts': int(time.time() * 1000), 'chapters': chapters,
               'presets': [build_preset(chapters, args.preset_name)]}
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(library, f, ensure_ascii=False, indent=1)
    n_sub = sum(len(c['subChapters']) for c in chapters)
    print(f'Wrote {OUT_PATH}: {len(chapters)} chapters, {n_sub} sub-chapters.')

if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run the seed against the example DOCX**

Run (one line):

```bash
python tools/spec-seed/seed.py "D:/@Delta Projects/20-11-RgCc-Ramat Gan CC/RgCc-work/RgCc-consultants/RgCc-tender/RgCc-tender-spec/vמרכז קהילתי נווה יהושע - מפרט ג2 - 08.docx"
```

Expected: prints `Wrote .../data/spec_library.json: NN chapters, MMM sub-chapters.` with NN ≥ 25.

- [ ] **Step 3: Write the output-shape test**

Create `tools/spec-seed/test_seed_output.py`:

```python
import json, os, unittest

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'spec_library.json')

class TestSeedOutput(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(OUT, encoding='utf-8') as f:
            cls.lib = json.load(f)

    def test_top_shape(self):
        self.assertIn('chapters', self.lib)
        self.assertGreaterEqual(len(self.lib['chapters']), 25)
        self.assertEqual(len(self.lib['presets']), 1)
        self.assertEqual(self.lib['presets'][0]['name'], 'מבנה ציבור')

    def test_aluminum_chapter_present(self):
        alum = next((c for c in self.lib['chapters'] if c['num'] == 12), None)
        self.assertIsNotNone(alum)
        self.assertEqual(alum['discipline'], 'ARCH')
        titles = [s['title'] for s in alum['subChapters']]
        self.assertTrue(any('קיר מסך' in t for t in titles), titles)

    def test_has_a_nested_clause_somewhere(self):
        def has_children(clauses):
            return any(c.get('children') for c in clauses)
        found = any(has_children(s['clauses'])
                    for c in self.lib['chapters'] for s in c['subChapters'])
        self.assertTrue(found, 'expected at least one clause with children')

    def test_preset_selects_existing_subchapters(self):
        ids = {s['id'] for c in self.lib['chapters'] for s in c['subChapters']}
        for sel in self.lib['presets'][0]['selections']:
            for sid in sel['subChapterIds']:
                self.assertIn(sid, ids)

if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 4: Run the output test**

Run: `python -m unittest tools/spec-seed/test_seed_output.py -v`
Expected: PASS (4 tests). If `test_aluminum_chapter_present` or `test_has_a_nested_clause_somewhere` fails, the classification heuristic needs tuning in `parser.py` — adjust and re-run Step 2, then re-test.

- [ ] **Step 5: Commit**

```bash
git add tools/spec-seed/seed.py tools/spec-seed/test_seed_output.py data/spec_library.json
git commit -m "feat(spec-creator): seed spec_library.json from example ג2 DOCX"
```

---

## Task 5: Manual review of the seeded library

The source DOCX styling is inconsistent, so the automated seed produces a *draft*. This task is a human/agent review pass (no test — it is a judgement gate documented in the README).

**Files:**
- Create: `tools/spec-seed/README.md`
- Modify: `data/spec_library.json` (hand-corrections only)

- [ ] **Step 1: Write the review README**

Create `tools/spec-seed/README.md`:

```markdown
# Spec seed tool

Parses a ג2 (מפרט טכני) Word document into `data/spec_library.json`.

## Run
    python tools/spec-seed/seed.py "<path to .docx>"

Then: `python -m unittest discover tools/spec-seed`

## Review checklist (styling in source specs is inconsistent)
After each seed run, open `data/spec_library.json` and verify a sample:
- [ ] Chapter numbers/names match `data/spec_chapter_reference.json`.
- [ ] Sub-chapter titles are real headings, not body sentences that got mis-classified.
- [ ] No body paragraph leaked in as a sub-chapter (symptom: a "sub-chapter" with 0 clauses and a long title).
- [ ] Nested lists (e.g. "תכולות ... הן:") captured their bullet items as `children`.
- [ ] Standards (ת"י) tagged `kind: "standard"`.
Fix mis-classifications directly in the JSON, or tune `parser.py` and re-run.
```

- [ ] **Step 2: Review and correct**

Open `data/spec_library.json`. Spot-check chapters 5, 9, 10, 12, 14 (architecture). For any sub-chapter with an empty `clauses` array and a sentence-like title, either merge its text into the previous sub-chapter's clauses or delete it. Confirm the aluminum chapter's `כללי ותכולות עבודה`, `קיר מסך`, `חלונות ודלתות`, `מעקות` sub-chapters exist.

- [ ] **Step 3: Re-run all seed tests**

Run: `python -m unittest discover -s tools/spec-seed -v`
Expected: PASS (all tests across the three test files).

- [ ] **Step 4: Commit**

```bash
git add tools/spec-seed/README.md data/spec_library.json
git commit -m "docs(spec-creator): add seed README; hand-review seeded library"
```

---

## Self-Review Notes

- **Spec coverage:** §3 data model (library JSON) → Tasks 1,4. Hierarchical clauses → Task 3 `build_clause_tree` + Task 4 test. Snapshot/projects storage → Task 2 (`spec-projects` route; project *creation* logic is Plan 2). Seeding pipeline §5 → Tasks 3–5. Server routes §4 → Task 2. Discipline tagging → Task 1 + Task 4.
- **Out of scope for Plan 1 (later plans):** ChapterTree/ClauseEditor UI, PRESET editing UI, wizard (Plan 2); `/api/spec/import` + `/api/spec/export` + PDF (Plan 3). The `spec-library`/`spec-projects` GET/POST routes here are the contract Plan 2 consumes.
- **Type consistency:** `Clause = {id, text, kind, children[]}` used identically in parser, seed, and tests. Preset shape `{id,name,buildingType,selections:[{chapterNum,subChapterIds[]}]}` matches design §3.
```
