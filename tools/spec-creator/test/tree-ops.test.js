'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../lib/tree-ops.js');

function tree() {
  return [
    { id: 'a', text: 'A', kind: 'paragraph', children: [] },
    { id: 'b', text: 'B', kind: 'paragraph', children: [
      { id: 'b1', text: 'B1', kind: 'paragraph', children: [] },
      { id: 'b2', text: 'B2', kind: 'paragraph', children: [] },
    ] },
    { id: 'c', text: 'C', kind: 'paragraph', children: [] },
  ];
}

test('locate finds nested nodes', () => {
  assert.strictEqual(T.locate(tree(), 'b2').index, 1);
  assert.strictEqual(T.locate(tree(), 'x'), null);
});

test('move down swaps within sibling list and is immutable', () => {
  const src = tree();
  const out = T.move(src, 'a', 1);
  assert.deepStrictEqual(out.map(n => n.id), ['b', 'a', 'c']);
  assert.deepStrictEqual(src.map(n => n.id), ['a', 'b', 'c']);
});

test('move keeps children with their parent', () => {
  const out = T.move(tree(), 'b', -1);
  assert.deepStrictEqual(out.map(n => n.id), ['b', 'a', 'c']);
  assert.strictEqual(out[0].children.length, 2);
});

test('move at boundary is a no-op', () => {
  assert.deepStrictEqual(T.move(tree(), 'a', -1).map(n => n.id), ['a', 'b', 'c']);
});

test('addAfter inserts a sibling and returns its id', () => {
  const { tree: out, newId } = T.addAfter(tree(), 'a', 'paragraph');
  assert.deepStrictEqual(out.map(n => n.id), ['a', newId, 'b', 'c']);
});

test('addChild appends a child under a parent', () => {
  const { tree: out, newId } = T.addChild(tree(), 'b', 'paragraph');
  const b = out.find(n => n.id === 'b');
  assert.strictEqual(b.children[b.children.length - 1].id, newId);
});

test('remove deletes a nested node', () => {
  const out = T.remove(tree(), 'b1');
  assert.strictEqual(out.find(n => n.id === 'b').children.length, 1);
});

test('setText updates text immutably', () => {
  const src = tree();
  const out = T.setText(src, 'a', 'NEW');
  assert.strictEqual(out[0].text, 'NEW');
  assert.strictEqual(src[0].text, 'A');
});

test('reorderById drops before the target by default', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepStrictEqual(T.reorderById(list, 'c', 'a', false).map(x => x.id), ['c', 'a', 'b']);
  assert.deepStrictEqual(list.map(x => x.id), ['a', 'b', 'c']); // immutable
});

test('reorderById drops after the target when after=true', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepStrictEqual(T.reorderById(list, 'a', 'b', true).map(x => x.id), ['b', 'a', 'c']);
});

test('reorderById moving onto itself is a no-op copy', () => {
  const list = [{ id: 'a' }, { id: 'b' }];
  assert.deepStrictEqual(T.reorderById(list, 'a', 'a', false).map(x => x.id), ['a', 'b']);
});
