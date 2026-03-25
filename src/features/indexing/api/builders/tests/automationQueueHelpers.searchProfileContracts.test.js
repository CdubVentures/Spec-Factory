import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSearchProfileQueryMaps } from '../automationQueueHelpers.js';

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
