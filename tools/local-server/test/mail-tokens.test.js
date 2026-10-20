'use strict';
// Mail scan keys (mail-tokens.js). Run: node --test tools/local-server/test/mail-tokens.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createTokens = require('../mail-tokens');

function make() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-mailkeys-')), 'mail_tokens.json');
  const io = {
    readJson: f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return {}; } },
    writeJsonAtomic: (f, d) => fs.writeFileSync(f, JSON.stringify(d))
  };
  return { tokens: createTokens(file, io), file };
}

test('a key is shown once, stored only as a hash, and names its person', () => {
  const { tokens, file } = make();
  const key = tokens.issue('Dana@kkarc.com', '2026-10-20T08:00:00Z');
  assert.match(key, /^phm_[A-Za-z0-9_-]{32}$/);
  assert.ok(!fs.readFileSync(file, 'utf8').includes(key));
  assert.strictEqual(tokens.check(key, '2026-10-20T09:00:00Z'), 'dana@kkarc.com');
  assert.deepStrictEqual(tokens.status('dana@kkarc.com'), { created: '2026-10-20T08:00:00Z', lastUsed: '2026-10-20T09:00:00Z' });
  assert.strictEqual(tokens.check('phm_wrong', '2026-10-20T09:00:00Z'), null);
  assert.strictEqual(tokens.check('', '2026-10-20T09:00:00Z'), null);
});

test('a new key replaces the old one; revoke ends it', () => {
  const { tokens } = make();
  const a = tokens.issue('dana@kkarc.com', 't1');
  const b = tokens.issue('dana@kkarc.com', 't2');
  const y = tokens.issue('yoav@kkarc.com', 't2');
  assert.strictEqual(tokens.check(a, 't3'), null);
  assert.strictEqual(tokens.check(b, 't3'), 'dana@kkarc.com');
  tokens.revoke('dana@kkarc.com');
  assert.strictEqual(tokens.check(b, 't4'), null);
  assert.strictEqual(tokens.status('dana@kkarc.com'), null);
  assert.strictEqual(tokens.check(y, 't4'), 'yoav@kkarc.com');
});

test('locally there is no address: the key belongs to "local"', () => {
  const { tokens } = make();
  const k = tokens.issue(null, 't1');
  assert.strictEqual(tokens.check(k, 't2'), 'local');
});

test('lastUsed is written at most every 10 minutes; the key still works every time', () => {
  const { tokens, file } = make();
  const key = tokens.issue('dana@kkarc.com', '2026-10-20T08:00:00.000Z');
  const mtime = () => fs.readFileSync(file, 'utf8');
  assert.strictEqual(tokens.check(key, '2026-10-20T09:00:00.000Z'), 'dana@kkarc.com');
  const first = mtime();
  assert.strictEqual(tokens.check(key, '2026-10-20T09:05:00.000Z'), 'dana@kkarc.com');
  assert.strictEqual(mtime(), first, 'no write 5 minutes later');
  assert.strictEqual(tokens.status('dana@kkarc.com').lastUsed, '2026-10-20T09:00:00.000Z');
  assert.strictEqual(tokens.check(key, '2026-10-20T09:11:00.000Z'), 'dana@kkarc.com');
  assert.strictEqual(tokens.status('dana@kkarc.com').lastUsed, '2026-10-20T09:11:00.000Z');
});
