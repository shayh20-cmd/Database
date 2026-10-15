// The server's save → archive → backups path, end to end on a throwaway data folder.
// Run: node --test tests/history-server.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SERVER = path.join(__dirname, '..', 'tools', 'local-server', 'server.js');

function start() {
  const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-srv-'));
  const PORT = 40000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, [SERVER, path.join(__dirname, '..'), '--port', String(PORT)], {
    env: { ...process.env, DATA_DIR, PORT: String(PORT), SITE_MODE: 'local' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const ready = new Promise((resolve, reject) => {
    proc.stdout.on('data', b => { if (/running at/.test(String(b))) resolve(); });
    proc.on('exit', c => reject(new Error('server exited ' + c)));
    setTimeout(() => reject(new Error('server did not start')), 8000);
  });
  return { DATA_DIR, base: 'http://localhost:' + PORT, proc, ready };
}

const doc = tasks => ({
  tracks: [{ id: 'licensing', label: 'מסלול רישוי', trackValue: 'licensing' }],
  sheets: [{ id: 's1', name: 'תנאים מקדימים', type: 'list', track: 'licensing', groups: [{ id: 'g1', name: 'כללי' }], tasks }]
});
const t = (id, title) => ({ id, title, groupId: 'g1', subtasks: [] });

test('a save that removes tasks archives them, backs up first and serves both', async () => {
  const s = start();
  try {
    await s.ready;
    const post = async body => {
      const cur = await fetch(s.base + '/api/project-hub-01');
      const etag = cur.headers.get('etag');
      return fetch(s.base + '/api/project-hub-01', { method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(body) });
    };
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => t(id, 'משימה ' + id));
    assert.strictEqual((await post(doc(six))).status, 200);
    assert.strictEqual((await post(doc([six[0]]))).status, 200);
    const arc = await (await fetch(s.base + '/api/archive/ph01')).json();
    assert.deepStrictEqual(arc.items.map(i => i.id).sort(), ['b', 'c', 'd', 'e', 'f']);
    assert.strictEqual(arc.items[0].stage, 'תנאים מקדימים');
    const bak = await (await fetch(s.base + '/api/backups/ph01')).json();
    assert.ok(bak.backups.some(b => /before-mass-delete/.test(b.name)));
    const one = await (await fetch(s.base + '/api/backups/ph01/' + bak.backups.find(b => /before-mass-delete/.test(b.name)).name)).json();
    assert.strictEqual(one.sheets[0].tasks.length, 6);
    // restoring = saving it back; it leaves the archive
    assert.strictEqual((await post(doc([six[0], six[1]]))).status, 200);
    const arc2 = await (await fetch(s.base + '/api/archive/ph01')).json();
    assert.ok(!arc2.items.some(i => i.id === 'b'));
    // purge
    const pr = await (await fetch(s.base + '/api/archive/ph01/purge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['c'] }) })).json();
    assert.strictEqual(pr.purged, 1);
  } finally {
    s.proc.kill();
  }
});
