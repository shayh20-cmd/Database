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
