'use strict';
// The Claude connector (mcp.js): OAuth sign-in and the tools. Run: node --test tools/local-server/test/mcp.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const CB = 'https://claude.ai/api/mcp/auth_callback';
const wait = ms => new Promise(r => setTimeout(r, ms));

// The server reads the roster, default roles and built-in lists out of the page itself.
const PAGE = `<!doctype html><script>
const STATUSES=[{id:'I',label:'עבודה'},{id:'N',label:'לא התחיל'},{id:'R',label:'התייחסות'},{id:'S',label:'תקוע'},{id:'C',label:'בוצע'}];const PRIORITIES=[{id:'high',label:'גבוהה'},{id:'medium',label:'בינונית'},{id:'low',label:'נמוכה'}];
const DISCIPLINES=[{id:'ARCH',label:'ARCH'},{id:'ELEC',label:'ELEC'}];
const OFFICE_STAFF=[{id:'st01',name:'דנה',email:'dana@kkarc.com'},{id:'st02',name:'יואב',email:'yoav@kkarc.com'},{id:'st03',name:'רות',email:'ruth@kkarc.com'}];
const DEFAULT_OFFICE_ROLES = {
  st01: 'superadmin'
};
</script>`;

function makeSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-mcp-site-'));
  fs.writeFileSync(path.join(root, 'project_hub_01.html'), PAGE);
  fs.writeFileSync(path.join(root, 'login.html'), '<!doctype html><title>login</title>');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-mcp-data-'));
  fs.mkdirSync(path.join(data, 'projects'));
  fs.writeFileSync(path.join(data, 'hub_projects.json'), JSON.stringify({
    projects: [{ id: 'pabc123', name: 'מגרש 4021', code: 'LDPB', visibility: 'shared' }],
    officeRoles: { st02: 'viewer' },
    library: { fields: [{ builtinKey: '__priority', scope: 'office', options: [{ label: 'דחוף' }, { id: 'high', label: 'גבוהה' }, { id: 'medium', label: 'בינונית' }, { id: 'low', label: 'נמוכה' }] }] }
  }));
  fs.writeFileSync(path.join(data, 'project_hub_01.json'), JSON.stringify({ projectName: 'PH01', sheets: [], tracks: [], team: [] }));
  fs.writeFileSync(path.join(data, 'projects', 'pabc123.json'), JSON.stringify({
    projectName: 'מגרש 4021',
    team: [{ staffId: 'st01' }, { staffId: 'st02' }],
    listPrefs: { priorities: { hidden: ['medium'], order: [] } },
    tracks: [{ id: 'ongoing', label: 'מסלול תכנון', stageOrder: ['home'] }, { id: 'licensing', label: 'מסלול רישוי', trackValue: 'licensing', stageOrder: ['tik'] }],
    sheets: [
      { id: 'home', name: 'משימות שוטפות', type: 'list', track: null, groups: [{ id: 'g1', name: 'כללי' }], tasks: [{ id: 't1', title: 'תיאום חשמל', statusId: 'N', events: [], subtasks: [] }] },
      { id: 'tik', name: 'תיק מידע', type: 'list', track: 'licensing', groups: [{ id: 'g2', name: 'מסמכים' }], tasks: [] }
    ]
  }));
  return { root, data };
}

function principal(email) {
  return Buffer.from(JSON.stringify({ claims: [{ typ: 'preferred_username', val: email }, { typ: 'name', val: email }] })).toString('base64');
}

async function signIn(base, email) {
  const reg = await (await fetch(base + '/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [CB] }) })).json();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const q = new URLSearchParams({ response_type: 'code', client_id: reg.client_id, redirect_uri: CB, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'st' });
  const session = { 'x-ms-client-principal': principal(email) };
  const page = await (await fetch(base + '/oauth/authorize?' + q, { headers: session })).text();
  const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
  const r = await fetch(base + '/oauth/authorize', { method: 'POST', redirect: 'manual', headers: { ...session, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...Object.fromEntries(q), csrf, decision: 'allow' }) });
  const code = new URL(r.headers.get('location')).searchParams.get('code');
  const tok = await (await fetch(base + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CB, client_id: reg.client_id, code_verifier: verifier }) })).json();
  let id = 0;
  return async (name, args) => {
    const res = await (await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } }) })).json();
    return { error: res.result.isError ? res.result.content[0].text : null, out: res.result.structuredContent };
  };
}

test('connector: sign-in, then tools act as that person with their role and projects', async (t) => {
  const port = 3995;
  const base = 'http://127.0.0.1:' + port;
  const { root, data } = makeSite();
  const proc = spawn('node', [SERVER, root, '--port', String(port)], { stdio: 'ignore', env: { ...process.env, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'true', DATA_DIR: data } });
  t.after(() => proc.kill());
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/health'); break; } catch { await wait(100); } }

  // discovery is public; /mcp asks for a token and says where to get one
  const unauth = await fetch(base + '/mcp', { method: 'POST', body: '{}' });
  assert.strictEqual(unauth.status, 401);
  // in cloud mode the site is always addressed over https (App Service ends TLS in front of it)
  assert.match(unauth.headers.get('www-authenticate'), /resource_metadata="https:\/\/127\.0\.0\.1:3995\/\.well-known\/oauth-protected-resource"/);
  assert.strictEqual((await (await fetch(base + '/.well-known/oauth-authorization-server')).json()).token_endpoint, 'https://127.0.0.1:3995/oauth/token');

  // the consent page needs the Microsoft session
  const noSession = await fetch(base + '/oauth/authorize?client_id=x', { redirect: 'manual' });
  assert.strictEqual(noSession.status, 302);
  assert.match(noSession.headers.get('location'), /^\/login\?next=/);
  // codes go only to Claude
  assert.strictEqual((await fetch(base + '/oauth/register', { method: 'POST', body: JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }) })).status, 400);

  const dana = await signIn(base, 'dana@kkarc.com');
  let r = await dana('get_project', { project: 'ldpb' });
  assert.ifError(r.error);
  assert.deepStrictEqual(r.out.priorities.map(p => p.label), ['דחוף', 'גבוהה', 'נמוכה'], 'office list, minus what the project hides');
  assert.strictEqual(r.out.stages.find(s => s.default_for_new_tasks).path, 'מסלול תכנון › משימות שוטפות');

  r = await dana('create_tasks', { project: 'מגרש 4021', tasks: [{ title: 'א', priority: 'דחוף', discipline: 'ELEC' }, { title: 'ב', stage: 'רישוי › תיק מידע', due_date: '2030-01-01' }] });
  assert.ifError(r.error);
  const doc = () => JSON.parse(fs.readFileSync(path.join(data, 'projects', 'pabc123.json'), 'utf8'));
  let d = doc();
  const a = d.sheets[0].tasks.find(x => x.title === 'א');
  assert.ok(a && a.groupId === 'g1' && a.discipline === 'ELEC' && /^o/.test(a.priority) && a.dueDate > a.startDate);
  assert.strictEqual(d.sheets[1].tasks[0].dueDate, '2030-01-01');
  assert.match(d._by, /Claude/);
  assert.ok(d.listPrefs, 'the rest of the document is kept');

  r = await dana('update_task', { project: 'LDPB', task: 'תאום חשמל', add_update: { text: 'נשלח ליועץ', update_status: 'sent', owner: 'ELEC' }, add_subtasks: [{ title: 'תוכנית לוחות' }] });
  assert.ifError(r.error);
  r = await dana('update_task', { project: 'LDPB', task: 't1', complete_subtasks: ['לוחות'], status: 'בוצע' });
  assert.strictEqual(r.out.updated.status, 'בוצע');
  d = doc();
  const t1 = d.sheets[0].tasks.find(x => x.id === 't1');
  assert.deepStrictEqual([t1.events.length, t1.events[0].status, t1.events[0].assignee, t1.subtasks[0].done, t1.done], [1, 'sent', 'ELEC', true, true]);

  r = await dana('create_tasks', { project: 'LDPB', tasks: [{ title: 'x', discipline: 'NOPE' }] });
  assert.match(r.error, /Options/);
  r = await dana('search_tasks', { query: 'תיאום' });
  assert.ok(r.out.tasks.length === 0, 'done tasks are left out by default');
  r = await dana('search_tasks', { query: 'תיאום', include_done: true });
  assert.strictEqual(r.out.tasks[0].id, 't1');

  // a viewer reads but cannot write; someone off the team does not see the project
  const yoav = await signIn(base, 'yoav@kkarc.com');
  assert.ifError((await yoav('get_project', { project: 'LDPB' })).error);
  assert.match((await yoav('create_tasks', { project: 'LDPB', tasks: [{ title: 'x' }] })).error, /viewer/);
  const ruth = await signIn(base, 'ruth@kkarc.com');
  assert.match((await ruth('get_project', { project: 'LDPB' })).error, /No project/);
});
