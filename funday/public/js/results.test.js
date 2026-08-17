import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateVotes } from './results.js';

const activities = [
  { id: 'cooking', name: 'סדנת בישול' },
  { id: 'print', name: 'סדנת הדפס' },
  { id: 'tlvshow', name: 'TLVSHOW' },
  { id: 'molet', name: 'MOLET' },
];

test('returns zero counts and zero percent for every activity when there are no votes', () => {
  const result = aggregateVotes([], activities);
  assert.equal(result.length, 4);
  for (const row of result) {
    assert.equal(row.count, 0);
    assert.equal(row.percent, 0);
  }
});

test('counts votes per activity and preserves activities order', () => {
  const votes = [
    { activityId: 'molet' },
    { activityId: 'cooking' },
    { activityId: 'molet' },
    { activityId: 'cooking' },
    { activityId: 'cooking' },
  ];
  const result = aggregateVotes(votes, activities);
  assert.deepEqual(result.map((r) => r.id), ['cooking', 'print', 'tlvshow', 'molet']);
  assert.equal(result.find((r) => r.id === 'cooking').count, 3);
  assert.equal(result.find((r) => r.id === 'molet').count, 2);
  assert.equal(result.find((r) => r.id === 'print').count, 0);
});

test('computes rounded percentages that reflect vote share', () => {
  const votes = [
    { activityId: 'cooking' },
    { activityId: 'cooking' },
    { activityId: 'print' },
  ];
  const result = aggregateVotes(votes, activities);
  assert.equal(result.find((r) => r.id === 'cooking').percent, 67);
  assert.equal(result.find((r) => r.id === 'print').percent, 33);
  assert.equal(result.find((r) => r.id === 'tlvshow').percent, 0);
});

test('ignores votes with an activityId not in the known list', () => {
  const votes = [{ activityId: 'cooking' }, { activityId: 'unknown-activity' }];
  const result = aggregateVotes(votes, activities);
  assert.equal(result.find((r) => r.id === 'cooking').count, 1);
  const total = result.reduce((sum, r) => sum + r.count, 0);
  assert.equal(total, 1);
});
