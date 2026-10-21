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
const OFFICE_STAFF=[{id:'st01',name:'דנה',email:'dana@kkarc.com'},{id:'st02',name:'יואב',email:'yoav@kkarc.com'}];
const DEFAULT_OFFICE_ROLES = {
  st01: 'superadmin'
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
  for (const id of ['pabc123', 'pdef456']) {
    fs.writeFileSync(path.join(data, 'projects', id + '.json'), JSON.stringify({ projectName: id, team: [{ staffId: 'st01' }], tracks: [], sheets: [] }));
  }
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
