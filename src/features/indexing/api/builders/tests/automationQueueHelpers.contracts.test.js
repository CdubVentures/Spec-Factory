import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addUniqueStrings,
  automationPriorityForJobType,
  automationPriorityForRequiredLevel,
  buildAutomationJobId,
  buildSearchProfileQueryMaps,
  clampAutomationPriority,
  normalizeAutomationQuery,
  normalizeAutomationStatus,
  toStringList,
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

test('toStringList trims filters and limits string arrays', () => {
  assert.deepEqual(toStringList(['a', ' b ', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(toStringList([null, '', 'x', 0, 'y']), ['x', 'y']);
  assert.deepEqual(toStringList(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
});

test('toStringList returns an empty array for non-array input', () => {
  assert.deepEqual(toStringList('not-array'), []);
  assert.deepEqual(toStringList(null), []);
  assert.deepEqual(toStringList(undefined), []);
});

test('addUniqueStrings merges deduplicated strings and honors the limit', () => {
  assert.deepEqual(addUniqueStrings(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(addUniqueStrings(['a'], ['b', 'c', 'd'], 2), ['a', 'b']);
});

test('addUniqueStrings handles invalid and empty inputs gracefully', () => {
  assert.deepEqual(addUniqueStrings(null, null), []);
  assert.deepEqual(addUniqueStrings('x', 'y'), []);
  assert.deepEqual(addUniqueStrings([], []), []);
  assert.deepEqual(addUniqueStrings([], ['a']), ['a']);
});

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

test('buildSearchProfileQueryMaps returns empty maps for missing or empty input', () => {
  const emptyObject = buildSearchProfileQueryMaps({});
  assert.equal(emptyObject.queryToFields.size, 0);
  assert.equal(emptyObject.fieldStats.size, 0);

  const noArg = buildSearchProfileQueryMaps();
  assert.equal(noArg.queryToFields.size, 0);
  assert.equal(noArg.fieldStats.size, 0);
});

test('buildSearchProfileQueryMaps builds queryToFields from query_rows and field_target_queries', () => {
  const result = buildSearchProfileQueryMaps({
    query_rows: [
      { query: 'sensor dpi', target_fields: ['sensor', 'dpi'], attempts: 1, result_count: 5 },
    ],
    field_target_queries: {
      weight: ['mouse weight grams'],
    },
  });

  assert.deepEqual(result.queryToFields.get('sensor dpi'), ['sensor', 'dpi']);
  assert.deepEqual(result.queryToFields.get('mouse weight grams'), ['weight']);
});

test('buildSearchProfileQueryMaps accumulates fieldStats from query_rows', () => {
  const result = buildSearchProfileQueryMaps({
    query_rows: [
      { query: 'q1', target_fields: ['sensor'], attempts: 2, result_count: 10 },
      { query: 'q2', target_fields: ['sensor'], attempts: 3, result_count: 7 },
    ],
  });

  const stat = result.fieldStats.get('sensor');
  assert.ok(stat);
  assert.equal(stat.attempts, 5);
  assert.equal(stat.results, 17);
  assert.deepEqual(stat.queries.sort(), ['q1', 'q2']);
});

test('buildSearchProfileQueryMaps prefers query_stats when aggregate stats are available', () => {
  const result = buildSearchProfileQueryMaps({
    query_stats: [
      { query: 'q1', attempts: 10, result_count: 50 },
    ],
    query_rows: [
      { query: 'q1', target_fields: ['dpi'], attempts: 1, result_count: 1 },
    ],
  });

  const stat = result.fieldStats.get('dpi');
  assert.ok(stat);
  assert.equal(stat.attempts, 10);
  assert.equal(stat.results, 50);
});
