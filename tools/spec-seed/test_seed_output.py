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

    def test_no_duplicate_chapter_numbers(self):
        nums = [c['num'] for c in self.lib['chapters']]
        self.assertEqual(len(nums), len(set(nums)), 'duplicate chapter numbers detected')

    def test_aluminum_chapter_present(self):
        alum = next((c for c in self.lib['chapters'] if c['num'] == 12), None)
        self.assertIsNotNone(alum)
        self.assertEqual(alum['discipline'], 'ARCH')
        # Every chapter's spine opens with a "כללי" sub-chapter.
        self.assertEqual(alum['subChapters'][0]['title'], 'כללי')
        # "קיר מסך" is a clause (level 2) now, not a sub-chapter — it appears somewhere.
        def texts(clauses):
            for c in clauses:
                yield c['text']
                yield from texts(c.get('children', []))
        alltext = [t for s in alum['subChapters'] for t in texts(s['clauses'])] \
                  + [s['title'] for s in alum['subChapters']]
        self.assertTrue(any('קיר מסך' in t for t in alltext))

    def test_subchapters_start_with_general(self):
        # The seed relies on every chapter's spine starting at a level-1 "כללי".
        starts = [c['subChapters'][0]['title'] for c in self.lib['chapters']
                  if c['subChapters']]
        self.assertGreaterEqual(sum(1 for t in starts if t == 'כללי'), 20, starts)

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
