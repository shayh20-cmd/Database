'use strict';
// Run: node tests/gc-attachments.test.js
const test = require('node:test');
const assert = require('node:assert');
const { collectRefs, selectOrphans, parseArgs } = require('../tools/gc-attachments.js');

const HOUR = 3600 * 1000;
const file = (ref, ageHours) => ({ ref, full: 'x' + ref, bytes: 10, mtimeMs: Date.now() - ageHours * HOUR });

test('finds references wherever they hide in the document', () => {
  const doc = {
    sheets: [{ tasks: [{
      // inside description HTML, which is where a pasted screenshot lands
      description: '<div class="tds-img-wrap"><img src="/data/attachments/project-hub-01/a.png"></div>',
      events: [{ mail: { path: '/data/attachments/project-hub-01/b.msg' } }],
    }] }],
    inbox: [{ shot: { url: '/data/attachments/project-hub-01/c.png' } }],
    standalonePrinciples: [{ shot: { url: '/data/attachments/project-hub/d.png' } }],
  };
  const refs = collectRefs(doc, new Set());
  assert.deepStrictEqual([...refs].sort(), [
    '/data/attachments/project-hub-01/a.png',
    '/data/attachments/project-hub-01/b.msg',
    '/data/attachments/project-hub-01/c.png',
    '/data/attachments/project-hub/d.png',
  ]);
});

test('two references in one string are both found', () => {
  const refs = collectRefs('<img src="/data/attachments/p/a.png"><img src="/data/attachments/p/b.png">', new Set());
  assert.strictEqual(refs.size, 2);
});

test('a referenced file is never an orphan', () => {
  const files = [file('/data/attachments/p/a.png', 48), file('/data/attachments/p/b.png', 48)];
  const refs = new Set(['/data/attachments/p/a.png']);
  assert.deepStrictEqual(selectOrphans(files, refs, Date.now(), 24 * HOUR).map(f => f.ref),
    ['/data/attachments/p/b.png']);
});

test('a freshly uploaded file is left alone even with nothing pointing at it', () => {
  // the capture window uploads before it saves the record, so this file may be
  // seconds away from being referenced
  const files = [file('/data/attachments/p/justnow.png', 0)];
  assert.deepStrictEqual(selectOrphans(files, new Set(), Date.now(), 24 * HOUR), []);
});

test('the grace period boundary is inclusive', () => {
  const now = Date.now();
  const exactly = { ref: '/data/attachments/p/x.png', full: '', bytes: 1, mtimeMs: now - 24 * HOUR };
  assert.strictEqual(selectOrphans([exactly], new Set(), now, 24 * HOUR).length, 1);
  const justUnder = { ref: '/data/attachments/p/y.png', full: '', bytes: 1, mtimeMs: now - 24 * HOUR + 1 };
  assert.strictEqual(selectOrphans([justUnder], new Set(), now, 24 * HOUR).length, 0);
});

test('nothing on disk means nothing to do', () => {
  assert.deepStrictEqual(selectOrphans([], new Set(['/data/attachments/p/a.png']), Date.now(), 0), []);
});

test('report is the default; deleting must be asked for', () => {
  assert.strictEqual(parseArgs([]).del, false);
  assert.strictEqual(parseArgs(['--delete']).del, true);
  assert.strictEqual(parseArgs([]).minAgeHours, 24);
  assert.strictEqual(parseArgs(['--min-age-hours', '2']).minAgeHours, 2);
});
