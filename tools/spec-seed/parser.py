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
