import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAutomationJobId,
  normalizeAutomationQuery,
  normalizeAutomationStatus,
} from '../automationQueueHelpers.js';

test('buildAutomationJobId is deterministic for the same key and distinct for different keys', () => {
  const id1 = buildAutomationJobId('repair', 'some-key');
  const id2 = buildAutomationJobId('repair', 'some-key');
  const other = buildAutomationJobId('repair', 'other-key');

  assert.equal(id1, id2);
  assert.ok(id1.startsWith('repair:'));
  assert.notEqual(id1, other);
});

test('buildAutomationJobId uses stable fallbacks for empty prefix or dedupe key', () => {
  assert.equal(buildAutomationJobId('job', ''), 'job:na');
  assert.ok(buildAutomationJobId('', 'key').startsWith('job:'));
});

test('normalizeAutomationStatus canonicalizes known states and falls back to queued', () => {
  const cases = [
    ['queued', 'queued'],
    ['running', 'running'],
    ['done', 'done'],
    ['failed', 'failed'],
    ['cooldown', 'cooldown'],
    ['RUNNING', 'running'],
    ['unknown', 'queued'],
    ['', 'queued'],
  ];

  for (const [value, expected] of cases) {
    assert.equal(normalizeAutomationStatus(value), expected, value);
  }
});

test('normalizeAutomationQuery trims lowercases and collapses whitespace', () => {
  const cases = [
    ['  Hello World  ', 'hello world'],
    ['a   b\tc', 'a b c'],
    ['', ''],
    [null, ''],
  ];

  for (const [value, expected] of cases) {
    assert.equal(normalizeAutomationQuery(value), expected, String(value));
  }
});
