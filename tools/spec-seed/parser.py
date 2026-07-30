"""Pure classification/structuring helpers for the ג2 spec seed.

No file I/O here — everything operates on already-extracted paragraph dicts
    {'style', 'text', 'bold', 'numId', 'ilvl'}
so the structural logic can be unit-tested on synthetic input.

## How the source encodes hierarchy

The ג2 source is a Word document. Its structure is carried by a *multilevel
list* — the "spine" — whose indent levels map directly onto our tree:

    spine level 1  ->  sub-chapter      (09.01)          e.g. "כללי"
    spine level 2  ->  clause  depth 0  (09.01.01)        e.g. "תכולות"
    spine level 3  ->  sub-clause depth 1 (09.01.01 (א))  e.g. "דוגמאות"
    spine level k  ->  clause depth k-2

Every chapter starts its spine with a level-1 "כללי" sub-chapter. In one
chapter (12 – אלומיניום) the spine is the paragraph *style* `סגנון טקסט`;
in every other chapter it is the dominant numbered list (a single numId whose
paragraphs carry ilvl >= 1).

The *body* — the actual prose — lives in other numbered lists at their own
levels and hangs under the nearest spine heading, one level deeper. So the
paragraphs beneath a clause become its lettered children (א)(ב)(ג). A body
paragraph ending in ':' adopts the run of list items right after it (a
distinct numId) as its own children.
"""
import re, uuid
from collections import Counter

_CHAP_RE = re.compile(r'^פרק\s+0*(\d+)\s*[–—-]\s*(.+?)\s*$')
_END_RE = re.compile(r'^סוף\s+פרק')
_APPENDIX_RE = re.compile(r'^נספחים\b')
_STANDARD_RE = re.compile(r'ת["״]י\s*\d')          # ת"י 1068 / תקן
SUBCHAPTER_STYLES = {'סגנון טקסט', 'כותרת פרק'}


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


def is_appendix(text):
    return bool(_APPENDIX_RE.match(text.strip()))


def is_chapter_style(style):
    """Paragraph styles that legitimately carry a chapter heading ("פרק NN – שם").
    Appendices reference other specs in other styles (e.g. 'אורן סיני',
    'List Paragraph'); gating on these keeps those cross-references from
    becoming spurious chapters."""
    return style == 'Normal' or style.startswith('Heading') or style.startswith('Body Text')


def body_kind(text):
    """Kind for a non-spine (body) paragraph."""
    return 'standard' if _STANDARD_RE.search(text.strip()) else 'paragraph'


def detect_spine(items):
    """Pick the structural spine for one chapter's paragraph items.
    Returns ('style', None) | ('num', numId) | (None, None)."""
    styled = sum(1 for it in items if it['style'] in SUBCHAPTER_STYLES)
    if styled >= 3:
        return ('style', None)
    cnt = Counter()
    for it in items:
        if it['numId'] is not None and (it['ilvl'] or 0) >= 1:
            cnt[it['numId']] += 1
    if cnt:
        return ('num', cnt.most_common(1)[0][0])
    return (None, None)


def spine_level(it, spine):
    """Structural level (1-based: 1=sub-chapter, 2=clause, ...) if this
    paragraph is a spine heading, else None."""
    kind, val = spine
    ilvl = it['ilvl'] or 0
    if kind == 'style':
        if it['style'] in SUBCHAPTER_STYLES:
            return ilvl if ilvl >= 1 else 1
    elif kind == 'num':
        if it['numId'] == val and ilvl >= 1:
            return ilvl
    return None


def _clause(text, kind):
    return {'id': new_id(), 'text': text, 'kind': kind, 'children': []}


def build_chapter(items, spine):
    """Build a chapter's subChapters list from its paragraph items + spine.

    Spine headings define sub-chapters (level 1) and nested clauses (level >= 2).
    Body paragraphs attach under the deepest open heading; a ':' body paragraph
    adopts the immediately-following run of a distinct numbered list as children.
    """
    subs = []
    cur_sub = None
    stack = []  # list of (level, clause_dict) for spine clauses (level >= 2)

    def ensure_sub():
        nonlocal cur_sub
        if cur_sub is None:
            cur_sub = {'id': new_id(), 'title': 'כללי', 'clauses': []}
            subs.append(cur_sub)

    def open_children():
        # where a new body clause / deeper clause should be appended
        if stack:
            return stack[-1][1]['children']
        return cur_sub['clauses']

    i, n = 0, len(items)
    while i < n:
        it = items[i]
        lvl = spine_level(it, spine)

        if lvl == 1:
            cur_sub = {'id': new_id(), 'title': it['text'], 'clauses': []}
            subs.append(cur_sub)
            stack = []
            i += 1
            continue

        if lvl is not None and lvl >= 2:
            ensure_sub()
            while stack and stack[-1][0] >= lvl:
                stack.pop()
            parent = stack[-1][1]['children'] if stack else cur_sub['clauses']
            clause = _clause(it['text'], 'heading')
            parent.append(clause)
            stack.append((lvl, clause))
            i += 1
            continue

        # --- body paragraph ---
        ensure_sub()
        clause = _clause(it['text'], body_kind(it['text']))
        open_children().append(clause)
        # ':' -> adopt the following run of a distinct numbered list as children
        if it['text'].rstrip().endswith(':'):
            base = it['numId']
            j = i + 1
            if (j < n and spine_level(items[j], spine) is None
                    and items[j]['numId'] is not None and items[j]['numId'] != base):
                sub_num = items[j]['numId']
                while (j < n and spine_level(items[j], spine) is None
                       and items[j]['numId'] == sub_num):
                    clause['children'].append(_clause(items[j]['text'], body_kind(items[j]['text'])))
                    j += 1
                i = j
                continue
        i += 1

    return subs
