'use strict';
// The Outlook add-in's way in: its public files, the key, and the routes the task pane calls.
// Run: node --test tools/local-server/test/outlook.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const REPO = path.join(__dirname, '..', '..', '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

// mcp.js reads the roster, default roles and built-in lists out of the page itself
const PAGE = `<!doctype html><script>
const STATUSES=[{id:'I',label:'עבודה'},{id:'N',label:'לא התחיל'},{id:'C',label:'בוצע'}];const PRIORITIES=[{id:'high',label:'גבוהה'}];
const DISCIPLINES=[{id:'ARCH',label:'ARCH'}];
const OFFICE_STAFF=[{id:'st01',name:'דנה',email:'dana@kkarc.com'},{id:'st02',name:'יואב',email:'yoav@kkarc.com'},{id:'st03',name:'רון',email:'ron@kkarc.com'}];
const DEFAULT_OFFICE_ROLES = {
  st01: 'superadmin',
  st03: 'viewer'
};
</script>`;

function makeSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-outlook-site-'));
  fs.writeFileSync(path.join(root, 'project_hub_01.html'), PAGE);
  fs.writeFileSync(path.join(root, 'login.html'), '<!doctype html><title>login</title>');
  fs.copyFileSync(path.join(REPO, 'outlook_connect.html'), path.join(root, 'outlook_connect.html'));
  fs.mkdirSync(path.join(root, 'outlook'));
  for (const f of ['manifest.xml', 'taskpane.html', 'icon-32.png']) fs.copyFileSync(path.join(REPO, 'outlook', f), path.join(root, 'outlook', f));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-outlook-data-'));
  fs.mkdirSync(path.join(data, 'projects'));
  fs.writeFileSync(path.join(data, 'hub_projects.json'), JSON.stringify({ projects: [
    { id: 'pabc123', name: 'מגרש 4021', code: 'LDPB', visibility: 'shared' },
    { id: 'pdef456', name: 'סודי', code: 'SEC', visibility: 'private', ownerId: 'st01' }
  ] }));
  fs.writeFileSync(path.join(data, 'project_hub_01.json'), JSON.stringify({ projectName: 'PH01', sheets: [], tracks: [], team: [] }));
  fs.writeFileSync(path.join(data, 'projects', 'pdef456.json'), JSON.stringify({ projectName: 'pdef456', team: [{ staffId: 'st01' }], tracks: [], sheets: [] }));
  fs.writeFileSync(path.join(data, 'projects', 'pabc123.json'), JSON.stringify({
    projectName: 'מגרש 4021',
    team: [{ staffId: 'st01' }, { staffId: 'st03' }],
    tracks: [{ id: 'ongoing', label: 'מסלול תכנון', stageOrder: ['home'] }],
    sheets: [{ id: 'home', name: 'משימות שוטפות', type: 'list', track: null, groups: [{ id: 'g1', name: 'כללי' }], tasks: [
      { id: 't1', title: 'תיאום קונסטרוקציה', statusId: 'N', discipline: 'ARCH', events: [{ id: 'e0', status: 'sent', assignee: 'ARCH', date: '2026-10-01', title: 'נשלח לקונסטרוקטור' }], subtasks: [] },
      { id: 't2', title: 'חזית מערבית', statusId: 'N', events: [], subtasks: [] }
    ] }]
  }));
  return { root, data };
}
const principal = email => Buffer.from(JSON.stringify({ claims: [{ typ: 'preferred_username', val: email }, { typ: 'name', val: email }] })).toString('base64');

test('outlook: public pane and manifest, a key per person, and the pane\'s routes act as that person', async (t) => {
  const port = 3981, base = 'http://127.0.0.1:' + port;
  const { root, data } = makeSite();
  const proc = spawn('node', [SERVER, root, '--port', String(port)], { stdio: 'ignore', env: { ...process.env, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'true', DATA_DIR: data } });
  t.after(() => proc.kill());
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break; } catch (e) { await wait(100); } }

  const dana = { 'x-ms-client-principal': principal('dana@kkarc.com') };
  const yoav = { 'x-ms-client-principal': principal('yoav@kkarc.com') };

  // Outlook loads these without the hub's session
  const pane = await fetch(base + '/outlook/taskpane', { redirect: 'manual' });
  assert.ok(pane.status === 200, 'the task pane is public');
  assert.strictEqual((await fetch(base + '/outlook/icon-32.png')).status, 200);
  const man = await fetch(base + '/outlook/manifest.xml');
  assert.strictEqual(man.status, 200);
  const xml = await man.text();
  assert.ok(!xml.includes('{{BASE}}'), 'every address is filled in');
  assert.ok(xml.includes('https://127.0.0.1:' + port + '/outlook/taskpane'), 'the manifest points back at the server, over https in the cloud');
  // only the add-in's own kinds of file are public
  assert.match(String((await fetch(base + '/outlook/notes.json', { redirect: 'manual' })).headers.get('location')), /\/login/);

  // the key page and its API need sign-in
  assert.match(String((await fetch(base + '/outlook_connect', { redirect: 'manual' })).headers.get('location')), /\/login/);
  assert.strictEqual((await fetch(base + '/api/outlook-connection', { method: 'POST' })).status, 401);

  // no key, a wrong key
  assert.strictEqual((await fetch(base + '/api/outlook/projects')).status, 401);
  assert.strictEqual((await fetch(base + '/api/outlook/projects', { headers: { Authorization: 'Bearer pho_nope' } })).status, 401);

  assert.strictEqual((await (await fetch(base + '/api/outlook-connection', { headers: dana })).json()).key, null);
  const { key } = await (await fetch(base + '/api/outlook-connection', { method: 'POST', headers: dana })).json();
  assert.match(key, /^pho_/);
  const auth = { Authorization: 'Bearer ' + key };
  assert.ok((await (await fetch(base + '/api/outlook-connection', { headers: dana })).json()).key.created);
  assert.strictEqual((await (await fetch(base + '/api/outlook-connection', { headers: yoav })).json()).key, null, 'each person sees only their own key');

  const me = await (await fetch(base + '/api/outlook/me', { headers: auth })).json();
  assert.deepStrictEqual([me.name, me.email, me.role], ['דנה', 'dana@kkarc.com', 'superadmin']);
  const list = await (await fetch(base + '/api/outlook/projects', { headers: auth })).json();
  assert.deepStrictEqual(list.projects.map(p => p.code).sort(), ['LDPB', 'PH01', 'SEC']);

  // Yoav's key sees Yoav's projects: the private one is not his
  const yk = (await (await fetch(base + '/api/outlook-connection', { method: 'POST', headers: yoav })).json()).key;
  const ylist = await (await fetch(base + '/api/outlook/projects', { headers: { Authorization: 'Bearer ' + yk } })).json();
  assert.ok(!ylist.projects.some(p => p.code === 'SEC'));

  // the scanner's key is not the add-in's
  const mk = (await (await fetch(base + '/api/mail-connection', { method: 'POST', headers: dana })).json()).key;
  assert.strictEqual((await fetch(base + '/api/outlook/projects', { headers: { Authorization: 'Bearer ' + mk } })).status, 401);
  assert.strictEqual((await (await fetch(base + '/api/outlook/me', { headers: auth })).json()).name, 'דנה', 'issuing a scanner key leaves the add-in key alone');

  // a new key ends the old one; revoking ends it too
  const k2 = (await (await fetch(base + '/api/outlook-connection', { method: 'POST', headers: dana })).json()).key;
  assert.strictEqual((await fetch(base + '/api/outlook/me', { headers: auth })).status, 401);
  assert.strictEqual((await fetch(base + '/api/outlook/me', { headers: { Authorization: 'Bearer ' + k2 } })).status, 200);
  await fetch(base + '/api/outlook-connection', { method: 'DELETE', headers: dana });
  assert.strictEqual((await fetch(base + '/api/outlook/me', { headers: { Authorization: 'Bearer ' + k2 } })).status, 401);
});

test('outlook: the thread key is the conversation id that classic Outlook uses too', () => {
  const { threadKeyOf } = require('../outlook');
  // a real Office.js conversationId and the classic Outlook (COM) ConversationID of the same thread
  assert.strictEqual(threadKeyOf('AAQkAGI0MzJiZWNkLTVhNzItNDYxOS05NTkzLTdjM2JiMGU3ODIyMQAQAMYLmGG5QqtKg5LHYES/Fmc='), 'C60B9861B942AB4A8392C76044BF1667');
  assert.strictEqual(threadKeyOf('c60b9861b942ab4a8392c76044bf1667'), 'C60B9861B942AB4A8392C76044BF1667');
  // url-safe base64, as REST ids are written
  assert.strictEqual(threadKeyOf('AAQkAGI0MzJiZWNkLTVhNzItNDYxOS05NTkzLTdjM2JiMGU3ODIyMQAQAMYLmGG5QqtKg5LHYES_Fmc='), 'C60B9861B942AB4A8392C76044BF1667');
  assert.strictEqual(threadKeyOf('something-else'), 'something-else');
  assert.strictEqual(threadKeyOf(''), '');
});

test('outlook: a thread linked to a task logs its emails once, and an entry can become an update or go', async (t) => {
  const port = 3980, base = 'http://127.0.0.1:' + port;
  const { root, data } = makeSite();
  const proc = spawn('node', [SERVER, root, '--port', String(port)], { stdio: 'ignore', env: { ...process.env, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'true', DATA_DIR: data } });
  t.after(() => proc.kill());
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break; } catch (e) { await wait(100); } }
  const keyOf = async email => (await (await fetch(base + '/api/outlook-connection', { method: 'POST', headers: { 'x-ms-client-principal': principal(email) } })).json()).key;
  const dana = await keyOf('dana@kkarc.com'), ron = await keyOf('ron@kkarc.com');
  const call = async (key, route, body) => {
    const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };
  const project = () => JSON.parse(fs.readFileSync(path.join(data, 'projects', 'pabc123.json'), 'utf8'));
  const task = id => project().sheets[0].tasks.find(x => x.id === id);
  const mail = (id, extra) => ({ conversationId: 'AAQkAGI0MzJiZWNkLTVhNzItNDYxOS05NTkzLTdjM2JiMGU3ODIyMQAQAMYLmGG5QqtKg5LHYES/Fmc=', internetMessageId: id, subject: 'Re: קונסטרוקציה LDPB', from: { name: 'דני', email: 'Dani@Eng.co.il' }, received: '2026-10-20T08:00:00Z', receivedDate: '2026-10-20', ...extra });

  // not linked: the project comes from the subject
  let r = await call(dana, '/api/outlook/context', { mail: mail('<m1@x>') });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.body.threadKey, r.body.projectId, r.body.why, r.body.linked, r.body.canWrite], ['C60B9861B942AB4A8392C76044BF1667', 'pabc123', 'subject', null, true]);

  // the picker lists the project's open tasks
  r = await call(dana, '/api/outlook/tasks?project=pabc123&q=' + encodeURIComponent('קונסטרוקציה'));
  assert.deepStrictEqual(r.body.tasks.map(x => x.id), ['t1']);

  // linking logs the open email on the task, carrying the status and owner forward
  r = await call(dana, '/api/outlook/link', { mail: mail('<m1@x>'), projectId: 'pabc123', taskId: 't1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.why, 'linked');
  assert.strictEqual(r.body.linked.task.title, 'תיאום קונסטרוקציה');
  assert.strictEqual(r.body.linked.message.auto, true);
  assert.ok(r.body.linked.options.update_statuses.length && r.body.linked.options.disciplines.length);
  let evs = task('t1').events;
  assert.strictEqual(evs.length, 2);
  assert.deepStrictEqual([evs[1].status, evs[1].assignee, evs[1].date, evs[1].auto, evs[1].title], ['sent', 'ARCH', '2026-10-20', true, 'מייל מ-דני: Re: קונסטרוקציה LDPB']);
  assert.strictEqual(evs[1].mail.threadKey, 'C60B9861B942AB4A8392C76044BF1667');

  // opening the same email again logs nothing new; another email of the thread is logged once
  await call(dana, '/api/outlook/context', { mail: mail('<m1@x>') });
  await call(dana, '/api/outlook/context', { mail: mail('<m2@x>', { receivedDate: '2026-10-21' }) });
  await call(dana, '/api/outlook/context', { mail: mail('<m2@x>', { receivedDate: '2026-10-21' }) });
  assert.strictEqual(task('t1').events.length, 3);

  // a viewer sees the linked task but logs nothing
  r = await call(ron, '/api/outlook/context', { mail: mail('<m3@x>') });
  assert.deepStrictEqual([r.body.canWrite, !!r.body.linked.task, r.body.linked.message], [false, true, null]);
  assert.strictEqual(task('t1').events.length, 3);

  // m1's entry becomes a real update; m2's is removed and does not come back
  r = await call(dana, '/api/outlook/entry', { mail: mail('<m1@x>'), action: 'promote', text: 'הקונסטרוקטור אישר', update_status: 'approved', owner: 'ARCH' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.linked.message.auto, false);
  const m1 = task('t1').events[1];
  assert.deepStrictEqual([m1.status, m1.title, m1.auto], ['approved', 'הקונסטרוקטור אישר', undefined]);
  r = await call(dana, '/api/outlook/entry', { mail: mail('<m2@x>'), action: 'remove' });
  assert.strictEqual(r.body.linked.message.removed, true);
  assert.strictEqual(task('t1').events.length, 2);
  await call(dana, '/api/outlook/context', { mail: mail('<m2@x>') });
  assert.strictEqual(task('t1').events.length, 2, 'a removed entry does not come back');
  assert.strictEqual((await call(dana, '/api/outlook/entry', { mail: mail('<m1@x>'), action: 'remove' })).status, 400, 'only an automatic entry can be removed');

  // relinking to the same task keeps its log
  await call(dana, '/api/outlook/link', { mail: mail('<m1@x>'), projectId: 'pabc123', taskId: 't1' });
  assert.strictEqual(task('t1').events.length, 2);

  // another thread from the same sender starts in the same project
  r = await call(dana, '/api/outlook/context', { mail: mail('<n1@x>', { conversationId: 'AB000000000000000000000000000001', subject: 'שאלה' }) });
  assert.deepStrictEqual([r.body.projectId, r.body.why], ['pabc123', 'sender']);

  // a deleted task drops the link
  const doc = project();
  doc.sheets[0].tasks = doc.sheets[0].tasks.filter(x => x.id !== 't1');
  fs.writeFileSync(path.join(data, 'projects', 'pabc123.json'), JSON.stringify(doc));
  r = await call(dana, '/api/outlook/context', { mail: mail('<m4@x>') });
  assert.strictEqual(r.body.linked, null);
  assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(data, 'outlook_links.json'), 'utf8')).threads), []);
});
