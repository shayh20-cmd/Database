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
    """Classify one paragraph into: 'subchapter' | 'heading' | 'standard' | 'paragraph'.
    Only an explicit sub-chapter *style* starts a new sub-chapter; a short bold line
    becomes an inline heading clause (promotable to a sub-chapter later in the app).
    Heuristic — the seed run is reviewed manually afterwards."""
    t = text.strip()
    if style in SUBCHAPTER_STYLES:
        return 'subchapter'
    if _STANDARD_RE.search(t):
        return 'standard'
    # short, bold, no sentence-ending punctuation => an inline heading within the sub-chapter
    if bold and len(t) <= 40 and not t.endswith(('.', ':', ',')):
        return 'heading'
    return 'paragraph'


# Paragraph styles that legitimately carry a chapter heading ("פרק NN – שם").
# Appendices reference other specs in other styles (e.g. 'אורן סיני', 'List Paragraph');
# gating on these styles keeps those cross-references from becoming spurious chapters.
def is_chapter_style(style):
    return style == 'Normal' or style.startswith('Heading')


def split_by_headings(clauses):
    """Split a flat clause list into (title, clauses) groups at top-level heading
    clauses. Leading clauses before the first heading get title None. Used to give
    collapsed chapters (no styled sub-chapters) real sub-chapters from their headings."""
    groups = []
    cur_title = None
    cur = []
    for cl in clauses:
        if cl['kind'] == 'heading':
            if cur or cur_title is not None:
                groups.append((cur_title, cur))
            cur_title = cl['text']
            cur = []
        else:
            cur.append(cl)
    if cur or cur_title is not None:
        groups.append((cur_title, cur))
    return groups


def build_clause_tree(items):
    """items: list of (kind, text) where kind in {'paragraph','list','standard'}.
    A paragraph whose text ends with ':' adopts the immediately-following run of
    'list' items as its children. Returns a list of clause dicts."""
    tree = []
    i = 0
    while i < len(items):
        kind, text = items[i]
        ck = kind if kind in ('standard', 'heading') else 'paragraph'
        clause = {'id': new_id(), 'text': text, 'kind': ck, 'children': []}
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
