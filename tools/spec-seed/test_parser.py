import os, sys, unittest
sys.path.insert(0, os.path.dirname(__file__))
from parser import chapter_start, is_chapter_end, classify, new_id, build_clause_tree, is_chapter_style

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

    def test_heading_from_short_bold(self):
        # short bold line is an inline heading clause, not a new sub-chapter
        self.assertEqual(classify('Normal', 'אדני חלון', True), 'heading')

    def test_standard_line(self):
        self.assertEqual(classify('Normal', 'ת"י 1068 - קירות מסך.', False), 'standard')

    def test_plain_paragraph(self):
        self.assertEqual(classify('Normal', 'מחיר הבסיס של אלמנטי קירות המסך יכלול חלונות ודלתות.', False), 'paragraph')


class TestChapterStyleGate(unittest.TestCase):
    def test_real_chapter_styles_qualify(self):
        self.assertTrue(is_chapter_style('Normal'))
        self.assertTrue(is_chapter_style('Heading 1'))

    def test_appendix_reference_styles_rejected(self):
        self.assertFalse(is_chapter_style('אורן סיני'))
        self.assertFalse(is_chapter_style('List Paragraph'))

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
