'use strict';
// Mail suggestions end to end: key, intake, Claude (a local stand-in), the page's routes, accept.
// Run: node --test tools/local-server/test/mail.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const wait = ms => new Promise(r => setTimeout(r, ms));

// mcp.js reads the roster, default roles and built-in lists out of the page itself
const PAGE = `<!doctype html><script>
const STATUSES=[{id:'I',label:'עבודה'},{id:'N',label:'לא התחיל'},{id:'R',label:'התייחסות'},{id:'S',label:'תקוע'},{id:'C',label:'בוצע'}];const PRIORITIES=[{id:'high',label:'גבוהה'},{id:'medium',label:'בינונית'},{id:'low',label:'נמוכה'}];
const DISCIPLINES=[{id:'ARCH',label:'ARCH'},{id:'ELEC',label:'ELEC'}];
const OFFICE_STAFF=[{id:'st01',name:'דנה',email:'dana@kkarc.com'},{id:'st02',name:'יואב',email:'yoav@kkarc.com'}];
const DEFAULT_OFFICE_ROLES = {
  st01: 'superadmin'
};
</script>`;

function makeSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-mail-site-'));
  fs.writeFileSync(path.join(root, 'project_hub_01.html'), PAGE);
  fs.writeFileSync(path.join(root, 'login.html'), '<!doctype html><title>login</title>');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-mail-data-'));
  fs.mkdirSync(path.join(data, 'projects'));
  fs.writeFileSync(path.join(data, 'hub_projects.json'), JSON.stringify({ projects: [{ id: 'pabc123', name: 'מגרש 4021', code: 'LDPB', visibility: 'shared' }] }));
  fs.writeFileSync(path.join(data, 'project_hub_01.json'), JSON.stringify({ projectName: 'PH01', sheets: [], tracks: [], team: [] }));
  fs.writeFileSync(path.join(data, 'projects', 'pabc123.json'), JSON.stringify({
    projectName: 'מגרש 4021',
    team: [{ staffId: 'st01' }, { staffId: 'st02' }],
    tracks: [{ id: 'ongoing', label: 'מסלול תכנון', stageOrder: ['home'] }],
    sheets: [{ id: 'home', name: 'משימות שוטפות', type: 'list', track: null, groups: [{ id: 'g1', name: 'כללי' }], tasks: [{ id: 't1', title: 'תיאום חשמל', statusId: 'N', events: [], subtasks: [] }] }]
  }));
  return { root, data };
}
const principal = email => Buffer.from(JSON.stringify({ claims: [{ typ: 'preferred_username', val: email }, { typ: 'name', val: email }] })).toString('base64');

// a stand-in for the Anthropic API: the answer depends on the subject
function fakeClaude(port) {
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const prompt = JSON.parse(body).messages[0].content;
      let a = { kind: 'ignore', title: '', projectId: '', taskId: '', due: '', reason: '' };
      if (prompt.includes('Subject: חזית')) a = { kind: 'task', title: 'לעדכן חזית', projectId: 'pabc123', taskId: '', due: '2026-10-27', reason: 'מבקשים תיקון' };
      if (prompt.includes('Subject: חשמל')) a = { kind: 'update', title: 'החשמלאי אישר', projectId: 'pabc123', taskId: 't1', due: '', reason: 'אישור' };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text: JSON.stringify(a) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
    });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

test('mail: a key, an intake, suggestions for that person only, and accepting writes the project', async (t) => {
  const port = 3990, base = 'http://127.0.0.1:' + port;
  const fake = await fakeClaude(3986);
  const { root, data } = makeSite();
  const proc = spawn('node', [SERVER, root, '--port', String(port)], { stdio: 'ignore', env: { ...process.env, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'true', DATA_DIR: data, ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:3986', MAIL_AI_MODEL: 'claude-opus-5-5' } });
  t.after(() => { proc.kill(); fake.close(); });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break; } catch (e) { await wait(100); } }

  const dana = { 'x-ms-client-principal': principal('dana@kkarc.com') };
  const yoav = { 'x-ms-client-principal': principal('yoav@kkarc.com') };
  const json = r => r.json();

  assert.strictEqual((await json(await fetch(base + '/health'))).mailAi, 'ok');
  assert.strictEqual((await fetch(base + '/api/mail-intake', { method: 'POST', body: '{}' })).status, 401);
  assert.strictEqual((await fetch(base + '/api/mail-suggestions')).status, 401, 'the page routes need sign-in');

  const { key } = await json(await fetch(base + '/api/mail-connection', { method: 'POST', headers: dana }));
  assert.match(key, /^phm_/);
  const auth = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const mails = [
    { id: '<a@x>', from: 'dan@x.com', fromName: 'דני', subject: 'חזית מערבית', received: '2026-10-20T09:14:00+03:00', body: 'לתקן עד שני', attachments: [] },
    { id: '<b@x>', from: 'eli@x.com', fromName: 'אלי', subject: 'חשמל', received: '2026-10-20T10:00:00+03:00', body: 'מאושר', attachments: [] },
    { id: '<c@x>', from: 'news@x.com', fromName: 'News', subject: 'ניוזלטר', received: '2026-10-20T11:00:00+03:00', body: '...', attachments: [] }
  ];
  const r1 = await json(await fetch(base + '/api/mail-intake', { method: 'POST', headers: auth, body: JSON.stringify({ mails }) }));
  assert.deepStrictEqual([r1.accepted, r1.duplicates], [3, 0]);
  const st = await json(await fetch(base + '/api/mail-intake/status?wait=30', { headers: auth }));
  assert.deepStrictEqual([st.new, st.pending, st.failed], [2, 0, 0]);
  const r2 = await json(await fetch(base + '/api/mail-intake', { method: 'POST', headers: auth, body: JSON.stringify({ mails: [mails[0]] }) }));
  assert.deepStrictEqual([r2.accepted, r2.duplicates], [0, 1]);

  const page = await json(await fetch(base + '/api/mail-suggestions', { headers: dana }));
  assert.deepStrictEqual(page.items.map(i => i.suggestion.kind).sort(), ['task', 'update']);
  assert.ok(page.items.every(i => i.mail.body === undefined && i.note.startsWith('מהמייל: ')));
  assert.strictEqual((await json(await fetch(base + '/api/mail-suggestions', { headers: yoav }))).items.length, 0, 'yoav sees only his own');

  const task = page.items.find(i => i.suggestion.kind === 'task');
  const acc = await fetch(base + '/api/mail-suggestions/' + encodeURIComponent(task.id), { method: 'POST', headers: { ...dana, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept' }) });
  assert.strictEqual(acc.status, 200);
  const upd = page.items.find(i => i.suggestion.kind === 'update');
  assert.strictEqual((await fetch(base + '/api/mail-suggestions/' + encodeURIComponent(upd.id), { method: 'POST', headers: { ...dana, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept' }) })).status, 200);
  assert.strictEqual((await fetch(base + '/api/mail-suggestions/' + encodeURIComponent(task.id), { method: 'POST', headers: { ...dana, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept' }) })).status, 409, 'accepted twice');

  const proj = JSON.parse(fs.readFileSync(path.join(data, 'projects', 'pabc123.json'), 'utf8'));
  const tasks = proj.sheets[0].tasks;
  const made = tasks.find(x => x.title === 'לעדכן חזית');
  assert.ok(made, 'the task was written');
  assert.strictEqual(made.dueDate, '2026-10-27');
  assert.deepStrictEqual(made.assigneeIds, ['st01']);
  assert.match(made.comment, /^מהמייל: דני <dan@x.com>/);
  assert.ok(tasks.find(x => x.id === 't1').events.length > 0, 'the update was added to t1');

  const after = await json(await fetch(base + '/api/mail-suggestions', { headers: dana }));
  assert.strictEqual(after.summary.new, 0);
  assert.strictEqual(after.summary.week.accepted, 2);

  await fetch(base + '/api/mail-connection', { method: 'DELETE', headers: dana });
  assert.strictEqual((await fetch(base + '/api/mail-intake', { method: 'POST', headers: auth, body: JSON.stringify({ mails }) })).status, 401, 'revoked');
});

test('mail: without a Claude key messages wait as pending and health says so', async (t) => {
  const port = 3988, base = 'http://127.0.0.1:' + port;
  const { root, data } = makeSite();
  const env = { ...process.env, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'true', DATA_DIR: data };
  delete env.ANTHROPIC_API_KEY;
  const proc = spawn('node', [SERVER, root, '--port', String(port)], { stdio: 'ignore', env });
  t.after(() => proc.kill());
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break; } catch (e) { await wait(100); } }
  const dana = { 'x-ms-client-principal': principal('dana@kkarc.com') };
  assert.strictEqual((await (await fetch(base + '/health')).json()).mailAi, 'no-key');
  const { key } = await (await fetch(base + '/api/mail-connection', { method: 'POST', headers: dana })).json();
  const auth = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  await fetch(base + '/api/mail-intake', { method: 'POST', headers: auth, body: JSON.stringify({ mails: [{ id: '<a@x>', subject: 'חזית', body: 'x' }] }) });
  const page = await (await fetch(base + '/api/mail-suggestions', { headers: dana })).json();
  assert.deepStrictEqual([page.summary.pending, page.summary.new], [1, 0]);
});
