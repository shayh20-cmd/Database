'use strict';
// The one-click installers of the filing helper and the mail scanner (installers.js).
// Run: node --test tools/local-server/test/installers.test.js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const REPO = path.join(__dirname, '..', '..', '..');

function get(p, { headers, port } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', headers: headers || {} }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    r.end();
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const EMBEDDED = {
  'ProjectHub-FileHelper-Setup.cmd': ['tools/file-helper', ['FileHelper.Core.ps1', 'FileHelper-Agent.ps1', 'Run-Task.ps1', 'run-file-helper-agent.vbs', 'Install-FileHelper.ps1']],
  'ProjectHub-FileHelper-Uninstall.cmd': ['tools/file-helper', ['Uninstall-FileHelper.ps1']],
  'ProjectHub-MailScan-Setup.cmd': ['tools/mail-scan', ['Scan-Mail.ps1', 'run-hidden.vbs', 'Install-MailScan.ps1']],
  'ProjectHub-MailScan-Uninstall.cmd': ['tools/mail-scan', ['Uninstall-MailScan.ps1']],
  'ProjectHub-Uninstall.cmd': ['tools/quick-access', []]
};

// A throwaway site with the two tools' real files, as the deploy packs them.
function makeSite() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-site-'));
  fs.writeFileSync(path.join(root, 'project_hub_01.html'), '<!doctype html><title>hub</title>');
  fs.writeFileSync(path.join(root, 'login.html'), '<!doctype html><title>login</title>');
  for (const [dir, files] of Object.values(EMBEDDED)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const f of files) fs.copyFileSync(path.join(REPO, dir, f), path.join(root, dir, f));
  }
  return root;
}
function start(t, { port, env, root }) {
  const proc = spawn('node', [SERVER, root, '--port', String(port)], { stdio: 'ignore', env: Object.assign({}, process.env, env) });
  t.after(() => proc.kill());
}
function principal(claims) {
  return Buffer.from(JSON.stringify({ auth_typ: 'aad', claims: Object.entries(claims).map(([typ, val]) => ({ typ, val })) })).toString('base64');
}
function blocksOf(text) {
  const out = {};
  for (const m of text.matchAll(/^ {2}'([^']+)' = '([A-Za-z0-9+/=]+)'\r?$/gm)) out[m[1]] = Buffer.from(m[2], 'base64');
  return out;
}

test('cloud mode: the installers need a session, embed the tools and the https site, and no key', async (t) => {
  const port = 3974;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-data-'));
  // a key file in the data folder must never end up in an installer
  fs.writeFileSync(path.join(data, 'outlook-keys.json'), JSON.stringify({ secret: 'KEY-THAT-MUST-NOT-LEAK' }));
  start(t, { port, root: makeSite(), env: { DATA_DIR: data, SITE_MODE: 'cloud', WEBSITE_AUTH_ENABLED: 'true' } });
  await wait(800);

  for (const name of Object.keys(EMBEDDED)) {
    const anon = await get('/' + name, { port, headers: { host: 'hub.example.com' } });
    assert.strictEqual(anon.status, 302, name + ' is not served without a session');
    assert.strictEqual(anon.headers.location, '/login?next=' + encodeURIComponent('/' + name));
  }

  const headers = { host: 'hub.example.com', 'x-ms-client-principal': principal({ name: 'דנה', preferred_username: 'dana@example.com' }) };
  for (const [name, [dir, files]] of Object.entries(EMBEDDED)) {
    const r = await get('/' + name, { port, headers });
    assert.strictEqual(r.status, 200, name);
    assert.strictEqual(r.headers['content-disposition'], 'attachment; filename="' + name + '"');
    const text = r.raw.toString('utf8');
    assert.ok(text.startsWith('@echo off\r\n'), 'a batch file with CRLF and no BOM');
    assert.ok(text.includes("$Site = 'https://hub.example.com'"), 'the site address of the request, https in cloud');
    const blocks = blocksOf(text);
    assert.deepStrictEqual(Object.keys(blocks), files);
    for (const f of files) assert.ok(blocks[f].equals(fs.readFileSync(path.join(REPO, dir, f))), f + ' decodes to the repo file');
    assert.ok(!text.includes('KEY-THAT-MUST-NOT-LEAK'), 'no key');
    assert.ok(!/Bearer [A-Za-z0-9]/.test(text.slice(text.indexOf('#PS-START'), text.indexOf('$files'))), 'no key in the installer\'s own code');
  }

  const bad = await get('/ProjectHub-FileHelper-Setup.cmd', { port, headers: Object.assign({}, headers, { host: "x'; calc; '" }) });
  assert.strictEqual(bad.status, 400, 'a host that is not a plain host[:port] is refused');
});

test('local mode: the installers are served, with the http address', async (t) => {
  const port = 3973;
  start(t, { port, root: makeSite(), env: { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'hub-data-')), SITE_MODE: '', WEBSITE_AUTH_ENABLED: '' } });
  await wait(800);
  const r = await get('/ProjectHub-MailScan-Setup.cmd', { port });
  assert.strictEqual(r.status, 200);
  assert.ok(r.raw.toString('utf8').includes("$Site = 'http://127.0.0.1:" + port + "'"));
});
