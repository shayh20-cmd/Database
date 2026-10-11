// Run: node --test tests/start-date.test.js
// MIRROR of startDateField / withStartDate in project_hub_01.html — keep in sync.
const test = require('node:test');
const assert = require('node:assert');

let n = 0;
const uid = () => 'new' + ++n;

// ---- mirrored logic (copy of the project_hub_01.html block) ----
const startDateField = doc => {
  const all = (doc.projectInfoFields || []).filter(f => f.type === 'date' && /התחלה/.test(f.label || ''));
  const set = (doc.projectInfo || {}).customFields || {};
  return all.find(f => set[f.id]) || all[0];
};
function withStartDate(doc, date) {
  const fields = doc.projectInfoFields || [];
  const pi = doc.projectInfo || {};
  const field = startDateField(doc) || {
    id: uid(),
    label: 'תאריך התחלה',
    type: 'date'
  };
  return {
    ...doc,
    projectInfoFields: fields.includes(field) ? fields : [...fields, field],
    projectInfo: {
      ...pi,
      customFields: {
        ...(pi.customFields || {}),
        [field.id]: date
      }
    }
  };
}
// ----

const start = id => ({ id, label: 'תאריך התחלה', type: 'date' });

test('a project without a start field gets one on first write', () => {
  const doc = withStartDate({ projectInfoFields: [{ id: 'x', label: 'לקוח', type: 'text' }] }, '2024-03-05');
  assert.strictEqual(doc.projectInfoFields.length, 2);
  assert.strictEqual(startDateField(doc).id, 'new1');
  assert.strictEqual(doc.projectInfo.customFields.new1, '2024-03-05');
});

test('an existing start field is reused, not duplicated', () => {
  const doc = withStartDate({ projectInfoFields: [start('s')], projectInfo: { customFields: { s: '2020-01-01' } } }, '2024-03-05');
  assert.strictEqual(doc.projectInfoFields.length, 1);
  assert.deepStrictEqual(doc.projectInfo.customFields, { s: '2024-03-05' });
});

test('of two start fields, the one holding a date is read and written', () => {
  const doc = { projectInfoFields: [start('tmpl'), start('own')], projectInfo: { customFields: { own: '2026-05-05' } } };
  assert.strictEqual(startDateField(doc).id, 'own');
  assert.deepStrictEqual(withStartDate(doc, '2026-06-01').projectInfo.customFields, { own: '2026-06-01' });
});
