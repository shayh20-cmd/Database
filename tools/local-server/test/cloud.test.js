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
  assert.strictEqual(post.body.ok, true);
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
  // App Service injects the flag as "True" (capital T) on Linux.
  start(t, { port, root, env: { DATA_DIR: data, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'True' } });
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
  assert.strictEqual(post.body.ok, true);
  const back = await req('GET', '/api/project-hub-01', { port, headers: hdr });
  assert.strictEqual(back.body.projectName, 'בדיקה');

  const snip = await req('POST', '/api/snip', { port, headers: hdr });
  assert.strictEqual(snip.status, 404, 'no snipping in the cloud');
});

test('versioned saves: If-Match refuses a stale write, If-None-Match answers 304', async (t) => {
  const port = 3994;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-data-'));
  start(t, { port, root: makeSite(), env: { DATA_DIR: data, SITE_MODE: '', WEBSITE_AUTH_ENABLED: '' } });
  await wait(700);

  const first = await req('POST', '/api/project-hub-01', { port, body: { projectName: 'א', _ts: 1 } });
  assert.strictEqual(first.status, 200, 'no If-Match: overwrite, as the legacy pages do');
  const v1 = first.body.version;
  assert.ok(v1 && first.headers.etag === v1);

  const get = await req('GET', '/api/project-hub-01', { port });
  assert.strictEqual(get.headers.etag, v1);
  const same = await req('GET', '/api/project-hub-01', { port, headers: { 'If-None-Match': v1 } });
  assert.strictEqual(same.status, 304);

  // Two tabs loaded v1. The first saves; the second's save must be refused.
  const tabA = await req('POST', '/api/project-hub-01', { port, headers: { 'If-Match': v1 }, body: { projectName: 'ב', _ts: 2 } });
  assert.strictEqual(tabA.status, 200);
  const tabB = await req('POST', '/api/project-hub-01', { port, headers: { 'If-Match': v1 }, body: { projectName: 'ג', _ts: 3 } });
  assert.strictEqual(tabB.status, 412);
  assert.strictEqual(tabB.body.version, tabA.body.version, '412 names the current version');
  const back = await req('GET', '/api/project-hub-01', { port });
  assert.strictEqual(back.body.projectName, 'ב', 'the stale save changed nothing');

  const retry = await req('POST', '/api/project-hub-01', { port, headers: { 'If-Match': tabA.body.version }, body: { projectName: 'ג', _ts: 3 } });
  assert.strictEqual(retry.status, 200, 'saving from the current version succeeds');
});

test('cloud mode without WEBSITE_AUTH_ENABLED serves only a failing /health, and stays up', async (t) => {
  const port = 3993;
  const root = makeSite();
  const proc = start(t, { port, root, env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'hub-data-')), SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: '' } });
  await wait(700);
  assert.strictEqual(proc.exitCode, null, 'the process must not exit — a restart loop disables the free-tier site');

  const health = await req('GET', '/health', { port });
  assert.strictEqual(health.status, 503);
  assert.strictEqual(health.body.ok, false);
  assert.strictEqual(health.body.authEnabled, false);
  assert.strictEqual(health.body.error, 'authentication not confirmed');

  const hdr = { 'x-ms-client-principal': principal({ name: 'x', preferred_username: 'x@example.com' }) };
  for (const p of ['/api/me', '/api/project-hub-01', '/project_hub_01', '/']) {
    const r = await req('GET', p, { port, headers: hdr });
    assert.strictEqual(r.status, 503, p + ' must not be served without confirmed authentication');
  }
});
