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
  if (fs.existsSync(DATA)) fs.unlinkSync(DATA);
  const proc = spawn('node', [SERVER, ROOT, '--port', String(PORT)], { stdio: 'ignore' });
  t.after(() => proc.kill());
  await wait(700);

  const empty = await req('GET', '/api/spec-projects');
  assert.deepStrictEqual(empty.body, {}, 'missing file returns {}');

  const payload = { _ts: 1, items: [{ id: 'p1', name: 'בדיקה' }] };
  const post = await req('POST', '/api/spec-projects', payload);
  assert.deepStrictEqual(post.body, { ok: true });

  const back = await req('GET', '/api/spec-projects');
  assert.strictEqual(back.body.items[0].name, 'בדיקה');
});
