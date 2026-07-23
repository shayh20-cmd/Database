"""One-time (and reusable) seeding: parse a ג2 DOCX into data/spec_library.json.
Usage: python tools/spec-seed/seed.py "<path-to.docx>" [--preset-name "מבנה ציבור"]
Requires: python-docx."""
import argparse, json, os, sys, time
import docx
sys.path.insert(0, os.path.dirname(__file__))
from parser import (chapter_start, is_chapter_end, classify, new_id,
                    build_clause_tree, LIST_STYLES, is_chapter_style)

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
        cs = chapter_start(text) if is_chapter_style(style) else None
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
        if role == 'standard':
            kind = 'standard'
        elif role == 'heading':
            kind = 'heading'
        elif style in LIST_STYLES:
            kind = 'list'
        else:
            kind = 'paragraph'
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
