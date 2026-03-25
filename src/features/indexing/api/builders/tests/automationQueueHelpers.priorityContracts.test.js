import test from 'node:test';
import assert from 'node:assert/strict';

import {
  automationPriorityForJobType,
  automationPriorityForRequiredLevel,
  clampAutomationPriority,
} from '../automationQueueHelpers.js';

test('clampAutomationPriority keeps in-range priorities and clamps numeric overflow', () => {
  const cases = [
    { value: 50, expected: 50 },
    { value: 0, expected: 1 },
    { value: -10, expected: 1 },
    { value: 101, expected: 100 },
    { value: 200, expected: 100 },
  ];

  for (const testCase of cases) {
    assert.equal(
      clampAutomationPriority(testCase.value),
      testCase.expected,
      String(testCase.value),
    );
  }
});

test('clampAutomationPriority uses the configured fallback for non-numeric input', () => {
  assert.equal(clampAutomationPriority('abc'), 50);
  assert.equal(clampAutomationPriority('abc', 70), 70);
  assert.equal(clampAutomationPriority(null), 50);
  assert.equal(clampAutomationPriority(undefined), 50);
});

test('automationPriorityForRequiredLevel maps canonical levels case-insensitively', () => {
  const cases = [
    ['identity', 10],
    ['critical', 20],
    ['required', 35],
    ['expected', 60],
    ['optional', 80],
    ['CRITICAL', 20],
  ];

  for (const [value, expected] of cases) {
    assert.equal(automationPriorityForRequiredLevel(value), expected, value);
  }
});

test('automationPriorityForRequiredLevel falls back to midpoint priority for unknown levels', () => {
  assert.equal(automationPriorityForRequiredLevel('unknown'), 50);
  assert.equal(automationPriorityForRequiredLevel(''), 50);
});

test('automationPriorityForJobType maps known job types and falls back for unknown values', () => {
  const cases = [
    ['repair_search', 20],
    ['deficit_rediscovery', 35],
    ['staleness_refresh', 55],
    ['domain_backoff', 65],
    ['unknown', 50],
    ['', 50],
  ];

  for (const [value, expected] of cases) {
    assert.equal(automationPriorityForJobType(value), expected, value);
  }
});
