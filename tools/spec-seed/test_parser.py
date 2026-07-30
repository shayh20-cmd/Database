import os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
from parser import (chapter_start, is_chapter_end, is_appendix, is_chapter_style,
                    body_kind, detect_spine, spine_level, build_chapter, new_id)


def item(text, style='Normal', numId=None, ilvl=None, bold=False):
    return {'style': style, 'text': text, 'bold': bold, 'numId': numId, 'ilvl': ilvl}


class TestChapterBoundary(unittest.TestCase):
    def test_detects_chapter_start(self):
        self.assertEqual(chapter_start('פרק 12 – עבודות אלומיניום'), (12, 'עבודות אלומיניום'))
        self.assertEqual(chapter_start('פרק 01 - עבודות עפר'), (1, 'עבודות עפר'))

    def test_ignores_non_chapter(self):
        self.assertIsNone(chapter_start('מחיר היסוד של עבודות אלומיניום'))

    def test_detects_chapter_end(self):
        self.assertTrue(is_chapter_end('סוף פרק 12 – עבודות אלומיניום'))
        self.assertFalse(is_chapter_end('פרק 14 – עבודות אבן'))

    def test_detects_appendix(self):
        self.assertTrue(is_appendix('נספחים'))
        self.assertFalse(is_appendix('נספח א - רשימת תקנים'))


class TestChapterStyleGate(unittest.TestCase):
    def test_real_chapter_styles_qualify(self):
        self.assertTrue(is_chapter_style('Normal'))
        self.assertTrue(is_chapter_style('Heading 1'))
        self.assertTrue(is_chapter_style('Body Text 2'))

    def test_appendix_reference_styles_rejected(self):
        self.assertFalse(is_chapter_style('אורן סיני'))
        self.assertFalse(is_chapter_style('List Paragraph'))


class TestBodyKind(unittest.TestCase):
    def test_standard_line(self):
        self.assertEqual(body_kind('ת"י 1068 - חלונות אלומיניום.'), 'standard')

    def test_plain_paragraph(self):
        self.assertEqual(body_kind('מחיר הבסיס כולל חלונות ודלתות.'), 'paragraph')


class TestSpineDetection(unittest.TestCase):
    def test_style_spine_when_styled_headings_present(self):
        items = [item('כללי', style='סגנון טקסט', ilvl=1),
                 item('תכולות', style='סגנון טקסט', ilvl=2),
                 item('תקנים', style='סגנון טקסט', ilvl=2),
                 item('טקסט גוף', numId=99, ilvl=0)]
        self.assertEqual(detect_spine(items), ('style', None))

    def test_num_spine_picks_dominant_multilevel_list(self):
        items = [item('כללי', numId=323, ilvl=1),
                 item('תכולות', numId=323, ilvl=2),
                 item('פסקה', numId=358, ilvl=0),
                 item('דרישות', numId=323, ilvl=2)]
        self.assertEqual(detect_spine(items), ('num', 323))

    def test_spine_level_reads_ilvl_for_num_spine(self):
        spine = ('num', 323)
        self.assertEqual(spine_level(item('כללי', numId=323, ilvl=1), spine), 1)
        self.assertEqual(spine_level(item('תכולות', numId=323, ilvl=2), spine), 2)
        self.assertIsNone(spine_level(item('פסקה', numId=358, ilvl=0), spine))


class TestBuildChapter(unittest.TestCase):
    def test_paragraphs_under_clause_become_lettered_children(self):
        # Mirrors the טיח reference: 09.01.01 תכולות -> (א)(ב)(ג)
        spine = ('num', 323)
        items = [
            item('כללי', numId=323, ilvl=1),
            item('תכולות', numId=323, ilvl=2),
            item('מפרט זה מתייחס לטיח.', numId=358, ilvl=0),
            item('רוב קירות חוץ יחופו.', numId=358, ilvl=0),
            item('כל עבודות הטיח יבוצעו.', numId=358, ilvl=0),
        ]
        subs = build_chapter(items, spine)
        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]['title'], 'כללי')
        clauses = subs[0]['clauses']
        self.assertEqual(len(clauses), 1)
        self.assertEqual(clauses[0]['text'], 'תכולות')
        self.assertEqual([c['text'] for c in clauses[0]['children']],
                         ['מפרט זה מתייחס לטיח.', 'רוב קירות חוץ יחופו.', 'כל עבודות הטיח יבוצעו.'])

    def test_colon_paragraph_adopts_distinct_sublist(self):
        spine = ('num', 323)
        items = [
            item('כללי', numId=323, ilvl=1),
            item('דרישות כלליות', numId=323, ilvl=2),
            item('העבודה תבוצע עפ"י התקנים, כולל:', numId=359, ilvl=0),
            item('ת"י 755.', numId=360, ilvl=0),
            item('ת"י 921.', numId=360, ilvl=0),
            item('כל התקנים יהיו מעודכנים.', numId=359, ilvl=0),
        ]
        subs = build_chapter(items, spine)
        clause = subs[0]['clauses'][0]                # דרישות כלליות
        self.assertEqual(len(clause['children']), 2)  # the ':' para + the trailing para
        colon = clause['children'][0]
        self.assertEqual(len(colon['children']), 2)   # two ת"י items nested under it
        self.assertEqual(colon['children'][0]['kind'], 'standard')

    def test_level3_spine_nests_under_level2(self):
        spine = ('num', 323)
        items = [
            item('כללי', numId=323, ilvl=1),
            item('הגשות', numId=323, ilvl=2),
            item('דוגמאות', numId=323, ilvl=3),
            item('להכין דוגמה.', numId=363, ilvl=0),
        ]
        subs = build_chapter(items, spine)
        hagashot = subs[0]['clauses'][0]
        self.assertEqual(hagashot['text'], 'הגשות')
        self.assertEqual(len(hagashot['children']), 1)
        dugmaot = hagashot['children'][0]
        self.assertEqual(dugmaot['text'], 'דוגמאות')
        self.assertEqual(dugmaot['children'][0]['text'], 'להכין דוגמה.')

    def test_body_before_first_subchapter_gets_implicit_general(self):
        spine = ('num', 323)
        items = [item('פסקה יתומה.', numId=358, ilvl=0)]
        subs = build_chapter(items, spine)
        self.assertEqual(len(subs), 1)
        self.assertEqual(subs[0]['title'], 'כללי')
        self.assertEqual(subs[0]['clauses'][0]['text'], 'פסקה יתומה.')

    def test_ids_are_unique(self):
        self.assertNotEqual(new_id(), new_id())


if __name__ == '__main__':
    unittest.main()
