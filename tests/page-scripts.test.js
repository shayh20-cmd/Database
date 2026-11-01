// Every script project_hub_01.html loads must reach Azure: on the cloud server's allowlist
// (CLOUD_ASSETS in tools/local-server/server.js) and in Deploy-Azure.ps1's package. A file missing
// from either works locally and is silently absent online.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('the page\'s scripts are served in the cloud and deployed', () => {
  const page = read('project_hub_01.html');
  const scripts = [...page.matchAll(/<script src="\/?([^"]+)"/g)].map(m => m[1]);
  assert.ok(scripts.includes('calculators-ui.js'), 'found the page\'s scripts');
  const assets = read('tools/local-server/server.js').match(/const CLOUD_ASSETS = new Set\(\[([^\]]*)\]/)[1];
  const deploy = read('Deploy-Azure.ps1');
  for (const s of scripts) {
    assert.ok(assets.includes(`'/${s}'`), `${s} is on CLOUD_ASSETS`);
    assert.ok(deploy.includes(`"${s}"`), `${s} is in the deploy package`);
  }
});
