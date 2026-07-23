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
