'use strict';
// Cloud mode and the pieces both modes share. Run: node --test tools/local-server/test/cloud.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');

function req(method, p, { body, headers, port } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const h = Object.assign({}, headers || {}, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {});
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: h }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(raw.toString('utf8')); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, raw, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// A throwaway site: one page, plus files that must never be served in cloud mode.
function makeSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-site-'));
  fs.writeFileSync(path.join(root, 'project_hub_01.html'), '<!doctype html><title>hub</title>');
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.mkdirSync(path.join(root, 'tools', 'local-server'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'local-server', 'server.js'), '// secret');
  return root;
}

function start(t, { port, env, root }) {
  const proc = spawn('node', [SERVER, root, '--port', String(port)], { stdio: 'ignore', env: Object.assign({}, process.env, env) });
  t.after(() => proc.kill());
  return proc;
}

function principal(claims) {
  return Buffer.from(JSON.stringify({ auth_typ: 'aad', name_typ: 'name', role_typ: 'roles',
    claims: Object.entries(claims).map(([typ, val]) => ({ typ, val })) })).toString('base64');
}

test('local mode: DATA_DIR override, /api/me, /health and the attachments route', async (t) => {
  const port = 3991;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-data-'));
  const root = makeSite();
  start(t, { port, root, env: { DATA_DIR: data, SITE_MODE: '', WEBSITE_AUTH_ENABLED: '' } });
  await wait(700);

  const me = await req('GET', '/api/me', { port });
  assert.strictEqual(me.status, 200);
  assert.deepStrictEqual(me.body, { name: 'שי הרשקוביץ', email: null, mode: 'local' });

  const health = await req('GET', '/health', { port });
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.body.ok, true);

  const post = await req('POST', '/api/spec-projects', { port, body: { items: [1] } });
  assert.deepStrictEqual(post.body, { ok: true });
  assert.ok(fs.existsSync(path.join(data, 'spec_projects.json')), 'document written under DATA_DIR');

  fs.mkdirSync(path.join(data, 'attachments', 'project-hub-01'), { recursive: true });
  fs.writeFileSync(path.join(data, 'attachments', 'project-hub-01', 'abc-123.png'), Buffer.from([1, 2, 3]));
  const att = await req('GET', '/data/attachments/project-hub-01/abc-123.png', { port });
  assert.strictEqual(att.status, 200);
  assert.strictEqual(att.headers['content-type'], 'image/png');
  assert.strictEqual(att.headers['x-content-type-options'], 'nosniff');
  assert.deepStrictEqual([...att.raw], [1, 2, 3]);

  const missing = await req('GET', '/data/attachments/project-hub-01/nope.png', { port });
  assert.strictEqual(missing.status, 404);

  // Pages are still served as today (serve-handler's clean URLs: /page.html → /page).
  const page = await req('GET', '/project_hub_01', { port });
  assert.strictEqual(page.status, 200);
  const listing = await req('GET', '/tools/', { port });
  assert.strictEqual(listing.status, 200, 'local directory listing is unchanged');
});

test('cloud mode: sign-in gate, allowlist, redirect from /', async (t) => {
  const port = 3992;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-data-'));
  const root = makeSite();
  start(t, { port, root, env: { DATA_DIR: data, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'true' } });
  await wait(700);

  const health = await req('GET', '/health', { port });
  assert.strictEqual(health.status, 200, '/health answers without a principal');
  assert.strictEqual(health.body.mode, 'cloud');

  const anonApi = await req('GET', '/api/me', { port });
  assert.strictEqual(anonApi.status, 401);

  const anonPage = await req('GET', '/project_hub_01.html', { port });
  assert.strictEqual(anonPage.status, 302);
  assert.ok(anonPage.headers.location.startsWith('/.auth/login/aad?post_login_redirect_uri='), anonPage.headers.location);

  const hdr = { 'x-ms-client-principal': principal({ name: 'דנה כהן', preferred_username: 'dana@example.com' }) };

  const me = await req('GET', '/api/me', { port, headers: hdr });
  assert.strictEqual(me.status, 200);
  assert.deepStrictEqual(me.body, { name: 'דנה כהן', email: 'dana@example.com', mode: 'cloud' });

  const home = await req('GET', '/', { port, headers: hdr });
  assert.strictEqual(home.status, 302);
  assert.strictEqual(home.headers.location, '/project_hub_01');

  const page = await req('GET', '/project_hub_01', { port, headers: hdr });
  assert.strictEqual(page.status, 200);
  const pageHtml = await req('GET', '/project_hub_01.html', { port, headers: hdr });
  assert.strictEqual(pageHtml.status, 301, 'the .html form redirects to the clean URL as it does locally');

  for (const p of ['/tools/local-server/server.js', '/package.json', '/data/spec_projects.json', '/tools/', '/tools', '/package']) {
    const r = await req('GET', p, { port, headers: hdr });
    assert.strictEqual(r.status, 404, p + ' must not be served in cloud mode');
  }

  const post = await req('POST', '/api/project-hub-01', { port, headers: hdr, body: { projectName: 'בדיקה', _ts: 1 } });
  assert.deepStrictEqual(post.body, { ok: true });
  const back = await req('GET', '/api/project-hub-01', { port, headers: hdr });
  assert.strictEqual(back.body.projectName, 'בדיקה');

  const snip = await req('POST', '/api/snip', { port, headers: hdr });
  assert.strictEqual(snip.status, 404, 'no snipping in the cloud');
});

test('cloud mode refuses to start without WEBSITE_AUTH_ENABLED', async () => {
  const root = makeSite();
  const code = await new Promise(resolve => {
    const proc = spawn('node', [SERVER, root, '--port', '3993'], { stdio: 'ignore',
      env: Object.assign({}, process.env, { SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: '' }) });
    proc.on('exit', resolve);
    setTimeout(() => { proc.kill(); resolve('timeout'); }, 3000);
  });
  assert.strictEqual(code, 1);
});
