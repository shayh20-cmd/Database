import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPLOYEES,
  ACTIVITIES,
  getEmployeeById,
  getActivityById,
  isValidEmployeeId,
  isValidActivityId,
  employeesSortedForDropdown,
} from './data.js';

test('has exactly 27 employees with unique ids and non-empty names', () => {
  assert.equal(EMPLOYEES.length, 27);
  const ids = EMPLOYEES.map((e) => e.id);
  assert.equal(new Set(ids).size, 27);
  for (const employee of EMPLOYEES) {
    assert.match(employee.id, /^emp-\d{2}$/);
    assert.ok(employee.name.trim().length > 0);
  }
});

test('has exactly 4 activities with unique ids matching the known set', () => {
  assert.equal(ACTIVITIES.length, 4);
  const ids = ACTIVITIES.map((a) => a.id).sort();
  assert.deepEqual(ids, ['cooking', 'molet', 'print', 'tlvshow']);
});

test('getEmployeeById finds a known employee and returns null for unknown', () => {
  assert.equal(getEmployeeById('emp-01').name, 'דוד קנפו');
  assert.equal(getEmployeeById('emp-99'), null);
});

test('getActivityById finds a known activity and returns null for unknown', () => {
  assert.equal(getActivityById('molet').name, 'MOLET');
  assert.equal(getActivityById('unknown'), null);
});

test('isValidEmployeeId / isValidActivityId reject unknown ids', () => {
  assert.equal(isValidEmployeeId('emp-01'), true);
  assert.equal(isValidEmployeeId('emp-28'), false);
  assert.equal(isValidActivityId('cooking'), true);
  assert.equal(isValidActivityId('bogus'), false);
});

test('employeesSortedForDropdown returns all 27 employees sorted by Hebrew name', () => {
  const sorted = employeesSortedForDropdown();
  assert.equal(sorted.length, 27);
  const names = sorted.map((e) => e.name);
  const expected = [...names].sort((a, b) => a.localeCompare(b, 'he'));
  assert.deepEqual(names, expected);
});
