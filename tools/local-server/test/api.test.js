'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SERVER = path.join(__dirname, '..', 'server.js');
const ROOT = path.join(__dirname, '..', '..', '..');
const DATA = path.join(ROOT, 'data', 'spec_projects.json');
const PORT = 3999;

function req(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null })); });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('spec-projects route round-trips JSON', async (t) => {
  // Back up any real project data so the test never destroys it, and restore after.
  const backup = fs.existsSync(DATA) ? fs.readFileSync(DATA) : null;
  t.after(() => { if (backup !== null) fs.writeFileSync(DATA, backup); else if (fs.existsSync(DATA)) fs.unlinkSync(DATA); });
  if (fs.existsSync(DATA)) fs.unlinkSync(DATA);
  const proc = spawn('node', [SERVER, ROOT, '--port', String(PORT)], { stdio: 'ignore' });
  t.after(() => proc.kill());
  await wait(700);

  const empty = await req('GET', '/api/spec-projects');
  assert.deepStrictEqual(empty.body, {}, 'missing file returns {}');

  const payload = { _ts: 1, items: [{ id: 'p1', name: 'בדיקה' }] };
  const post = await req('POST', '/api/spec-projects', payload);
  assert.strictEqual(post.body.ok, true);

  const back = await req('GET', '/api/spec-projects');
  assert.strictEqual(back.body.items[0].name, 'בדיקה');
});

test('hub-project route stores each project in its own file', async (t) => {
  const id = 'zztest' + Date.now().toString(36);
  const file = path.join(ROOT, 'data', 'projects', id + '.json');
  t.after(() => { if (fs.existsSync(file)) fs.unlinkSync(file); });
  const proc = spawn('node', [SERVER, ROOT, '--port', String(PORT + 1)], { stdio: 'ignore' });
  t.after(() => proc.kill());
  await wait(700);
  const call = (m, p, b) => new Promise((resolve, reject) => {
    const data = b ? JSON.stringify(b) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT + 1, path: p, method: m,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      res => { let s = ''; res.on('data', c => s += c); res.on('end', () => { let body = null; try { body = s ? JSON.parse(s) : null; } catch { body = s; } resolve({ status: res.statusCode, body }); }); });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });

  assert.deepStrictEqual((await call('GET', '/api/hub-project/' + id)).body, {});
  assert.strictEqual((await call('POST', '/api/hub-project/' + id, { projectName: 'חדש' })).body.ok, true);
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).projectName, 'חדש');
  assert.strictEqual((await call('GET', '/api/hub-project/..%2Fproject_hub_01')).status, 404);
  assert.strictEqual((await call('GET', '/api/hub-project/AB')).status, 404);
});
