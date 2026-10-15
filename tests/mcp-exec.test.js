// Run: node --test tests/mcp-exec.test.js
// The connector's execution-track tools against a throwaway project file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const createMcp = require('../tools/local-server/mcp.js');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-mcp-exec-'));
const PH01 = path.join(tmp, 'project_hub_01.json');
const REG = path.join(tmp, 'hub_projects.json');
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const writeJsonAtomic = (f, v) => fs.writeFileSync(f, JSON.stringify(v));
fs.writeFileSync(REG, '{}');
const reset = () => writeJsonAtomic(PH01, {
  sheets: [{ id: 's1', type: 'list', name: 'משימות שוטפות', tasks: [], groups: [] }], tracks: [],
  team: [{ staffId: 'st07' }, { staffId: 'st08' }],
  execItems: [], finishes: [{ id: 'f1', category: 'ריצוף', element: 'ריצוף לובי', location: 'קומת קרקע', material: 'גרניט פורצלן', finish: 'מט', color: 'אפור', colorHex: '', supplier: 'נגב', approvedAt: '', approvedBy: '', files: [], image: null, submittalId: null, changeId: null, specSection: '', discipline: '', notes: '' }]
});
const mcp = createMcp({
  DATA_DIR: tmp, STATIC_ROOT: ROOT, SITE_MODE: 'local', PROJECTS_DIR: tmp,
  APPS: { 'hub-projects': REG, 'project-hub-01': PH01 },
  readJson, writeJsonAtomic, sendJson() {}, readRequestBody() {}
});
const { handleRpc, identify } = mcp._test;
const ctxFor = email => ({ me: identify({ email }, {}), reg: {}, base: 'https://hub' });
const SHAY = ctxFor('shay@kkarc.com'), ASSAF = ctxFor('assaf@kkarc.com');
let id = 0;
async function call(c, name, args) {
  const r = await handleRpc({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }, c);
  if (r.result.isError) { const e = new Error(r.result.content[0].text); e.tool = true; throw e; }
  return r.result.structuredContent;
}
const listNames = async c => (await handleRpc({ jsonrpc: '2.0', id: ++id, method: 'tools/list' }, c)).result.tools.map(t => t.name);

test('execution tools are listed only for the trial user', async () => {
  assert.ok((await listNames(SHAY)).includes('update_finish'));
  const other = await listNames(ASSAF);
  assert.ok(!other.some(n => /exec|finish/.test(n)));
  assert.ok(other.includes('update_task'));
  reset();
  await assert.rejects(call(ASSAF, 'list_finishes', { project: 'PH01' }), /not open to you/);
});

test('update a finishes row: material, colour, approval', async () => {
  reset();
  const r = await call(SHAY, 'update_finish', { project: 'PH01', row: 'ריצוף לובי', material: 'גרניט פורצלן 60/120', color: 'אפור בהיר', approved_at: '2026-10-15', approved_by: 'שי' });
  assert.strictEqual(r.added, false);
  assert.strictEqual(r.row.status, 'מאושר');
  const row = readJson(PH01).finishes[0];
  assert.strictEqual(row.material, 'גרניט פורצלן 60/120');
  assert.strictEqual(row.color, 'אפור בהיר');
  assert.strictEqual(row.approvedAt, '2026-10-15');
  assert.strictEqual(row.supplier, 'נגב');
  await assert.rejects(call(SHAY, 'update_finish', { project: 'PH01', row: 'אין כזה' }), /No finishes row/);
});

test('RFI: open, answer passing the ball, close', async () => {
  reset();
  const c1 = await call(SHAY, 'create_exec_item', { project: 'PH01', type: 'RFI', title: 'גובה תקרה במסדרון', description: 'מה הגובה?', opened_by: { party: 'קבלן', name: 'דנה' } });
  assert.strictEqual(c1.created.number, 'RFI-001');
  assert.strictEqual(c1.created.ball, 'אדריכל');
  assert.match(c1.link, /exec=/);
  const u = await call(SHAY, 'update_exec_item', { project: 'PH01', item: 'rfi-1', action: 'answer', text: '2.60 נטו', ball_to: { party: 'contractor' } });
  assert.strictEqual(u.updated.status, 'נענה');
  assert.strictEqual(u.updated.ball, 'קבלן');
  const done = await call(SHAY, 'update_exec_item', { project: 'PH01', item: 'RFI-001', action: 'close' });
  assert.strictEqual(done.updated.closed, true);
  const list = await call(SHAY, 'list_exec_items', { project: 'PH01' });
  assert.strictEqual(list.count, 0);
  const all = await call(SHAY, 'list_exec_items', { project: 'PH01', include_closed: true });
  assert.strictEqual(all.count, 1);
  const full = await call(SHAY, 'get_exec_item', { project: 'PH01', item: 'RFI-001' });
  assert.deepStrictEqual(full.item.thread.map(t => t.kind), ['open', 'answer', 'close']);
});

test('submittal decision, then a finishes row from it', async () => {
  reset();
  await call(SHAY, 'create_exec_item', { project: 'PH01', type: 'submittal', title: 'חיפוי HPL' });
  const d = await call(SHAY, 'update_exec_item', { project: 'PH01', item: 'SUB-001', action: 'decide', decision: 'approved_notes', text: 'לתקן פרט פינה' });
  assert.strictEqual(d.updated.status, 'אושר עם הערות');
  await assert.rejects(call(SHAY, 'update_exec_item', { project: 'PH01', item: 'SUB-001', action: 'decide', decision: 'approved' }), /already decided/);
  const f = await call(SHAY, 'update_finish', { project: 'PH01', from_submittal: 'SUB-001', category: 'חזיתות', material: 'HPL', color_hex: '#B0A890' });
  assert.strictEqual(f.added, true);
  assert.strictEqual(f.row.element, 'חיפוי HPL');
  assert.match(f.row.submittal, /SUB-001/);
  assert.strictEqual(f.row.status, 'מאושר');
  await assert.rejects(call(SHAY, 'update_finish', { project: 'PH01', from_submittal: 'SUB-001' }), /already has a finishes row/);
});

test('change request: approved changes a finishes row, numbers continue', async () => {
  reset();
  const c = await call(SHAY, 'create_exec_item', { project: 'PH01', type: 'change', title: 'החלפת ריצוף', tender_spec: 'גרניט פורצלן', proposed: 'טרצו' });
  assert.strictEqual(c.created.ball, 'אדריכל');
  await assert.rejects(call(SHAY, 'update_exec_item', { project: 'PH01', item: 'CHG-001', action: 'decide', decision: 'rejected' }), /needs notes/);
  const d = await call(SHAY, 'update_exec_item', { project: 'PH01', item: 'CHG-001', action: 'decide', decision: 'approved', finish_row: 'f1' });
  assert.strictEqual(d.updated.approved_text, 'טרצו');
  const row = readJson(PH01).finishes[0];
  assert.strictEqual(row.changeId, readJson(PH01).execItems[0].id);
  assert.match(row.notes, /שונה לפי CHG-001: טרצו/);
  const e = await call(SHAY, 'update_exec_item', { project: 'PH01', item: 'CHG-001', fields: { tender_ref: '11.02.010' } });
  assert.deepStrictEqual(e.changed, ['סעיף מכרז']);
  const c2 = await call(SHAY, 'create_exec_item', { project: 'PH01', type: 'change', title: 'ב' });
  assert.strictEqual(c2.created.number, 'CHG-002');
  assert.strictEqual(readJson(PH01).execSeq.change, 2);
});

test('issue status and helpful errors', async () => {
  reset();
  await call(SHAY, 'create_exec_item', { project: 'PH01', type: 'issue', title: 'רטיבות בקיר' });
  const s = await call(SHAY, 'update_exec_item', { project: 'PH01', item: 'ISS-001', action: 'status', status: 'בטיפול' });
  assert.strictEqual(s.updated.status, 'בטיפול');
  await assert.rejects(call(SHAY, 'update_exec_item', { project: 'PH01', item: 'ISS-001', action: 'status', status: 'xyz' }), /Statuses:/);
  await assert.rejects(call(SHAY, 'update_exec_item', { project: 'PH01', item: 'ISS-001' }), /Nothing to change/);
  await assert.rejects(call(SHAY, 'create_exec_item', { project: 'PH01', type: 'memo', title: 'x' }), /Unknown item type/);
});
