import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampAutomationPriority,
  automationPriorityForRequiredLevel,
  automationPriorityForJobType,
  toStringList,
  addUniqueStrings,
  buildAutomationJobId,
  normalizeAutomationStatus,
  normalizeAutomationQuery,
  buildSearchProfileQueryMaps,
} from '../automationQueueHelpers.js';

describe('clampAutomationPriority', () => {
  it('passes through a value within range', () => {
    assert.equal(clampAutomationPriority(50), 50);
  });
  it('clamps below minimum to 1', () => {
    assert.equal(clampAutomationPriority(0), 1);
    assert.equal(clampAutomationPriority(-10), 1);
  });
  it('clamps above maximum to 100', () => {
    assert.equal(clampAutomationPriority(200), 100);
    assert.equal(clampAutomationPriority(101), 100);
  });
  it('returns fallback for NaN', () => {
    assert.equal(clampAutomationPriority('abc'), 50);
    assert.equal(clampAutomationPriority('abc', 70), 70);
  });
  it('returns fallback for null/undefined', () => {
    assert.equal(clampAutomationPriority(null), 50);
    assert.equal(clampAutomationPriority(undefined), 50);
  });
});

describe('automationPriorityForRequiredLevel', () => {
  it('maps identity to 10', () => {
    assert.equal(automationPriorityForRequiredLevel('identity'), 10);
  });
  it('maps critical to 20', () => {
    assert.equal(automationPriorityForRequiredLevel('critical'), 20);
  });
  it('maps required to 35', () => {
    assert.equal(automationPriorityForRequiredLevel('required'), 35);
  });
  it('maps expected to 60', () => {
    assert.equal(automationPriorityForRequiredLevel('expected'), 60);
  });
  it('maps optional to 80', () => {
    assert.equal(automationPriorityForRequiredLevel('optional'), 80);
  });
  it('returns 50 for unknown levels', () => {
    assert.equal(automationPriorityForRequiredLevel('unknown'), 50);
  });
  it('returns 50 for empty string', () => {
    assert.equal(automationPriorityForRequiredLevel(''), 50);
  });
  it('is case-insensitive', () => {
    assert.equal(automationPriorityForRequiredLevel('CRITICAL'), 20);
  });
});

describe('automationPriorityForJobType', () => {
  it('maps repair_search to 20', () => {
    assert.equal(automationPriorityForJobType('repair_search'), 20);
  });
  it('maps deficit_rediscovery to 35', () => {
    assert.equal(automationPriorityForJobType('deficit_rediscovery'), 35);
  });
  it('maps staleness_refresh to 55', () => {
    assert.equal(automationPriorityForJobType('staleness_refresh'), 55);
  });
  it('maps domain_backoff to 65', () => {
    assert.equal(automationPriorityForJobType('domain_backoff'), 65);
  });
  it('returns 50 for unknown', () => {
    assert.equal(automationPriorityForJobType('unknown'), 50);
  });
  it('returns 50 for empty', () => {
    assert.equal(automationPriorityForJobType(''), 50);
  });
});

describe('toStringList', () => {
  it('returns trimmed strings from array', () => {
    assert.deepEqual(toStringList(['a', ' b ', 'c']), ['a', 'b', 'c']);
  });
  it('filters non-strings and empty strings', () => {
    assert.deepEqual(toStringList([null, '', 'x', 0, 'y']), ['x', 'y']);
  });
  it('applies limit', () => {
    assert.deepEqual(toStringList(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
  });
  it('returns empty array for non-array input', () => {
    assert.deepEqual(toStringList('not-array'), []);
    assert.deepEqual(toStringList(null), []);
    assert.deepEqual(toStringList(undefined), []);
  });
});

describe('addUniqueStrings', () => {
  it('merges and deduplicates', () => {
    assert.deepEqual(addUniqueStrings(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  });
  it('respects limit', () => {
    assert.deepEqual(addUniqueStrings(['a'], ['b', 'c', 'd'], 2), ['a', 'b']);
  });
  it('handles non-array inputs gracefully', () => {
    assert.deepEqual(addUniqueStrings(null, null), []);
    assert.deepEqual(addUniqueStrings('x', 'y'), []);
  });
  it('handles empty inputs', () => {
    assert.deepEqual(addUniqueStrings([], []), []);
    assert.deepEqual(addUniqueStrings([], ['a']), ['a']);
  });
});

describe('buildAutomationJobId', () => {
  it('produces deterministic hash', () => {
    const id1 = buildAutomationJobId('repair', 'some-key');
    const id2 = buildAutomationJobId('repair', 'some-key');
    assert.equal(id1, id2);
    assert.ok(id1.startsWith('repair:'));
  });
  it('returns prefix:na when dedupeKey is empty', () => {
    assert.equal(buildAutomationJobId('job', ''), 'job:na');
  });
  it('uses "job" fallback when prefix is empty', () => {
    const id = buildAutomationJobId('', 'key');
    assert.ok(id.startsWith('job:'));
  });
  it('different keys produce different ids', () => {
    const a = buildAutomationJobId('j', 'alpha');
    const b = buildAutomationJobId('j', 'beta');
    assert.notEqual(a, b);
  });
});

describe('normalizeAutomationStatus', () => {
  for (const status of ['queued', 'running', 'done', 'failed', 'cooldown']) {
    it(`returns '${status}' for '${status}'`, () => {
      assert.equal(normalizeAutomationStatus(status), status);
    });
  }
  it('is case-insensitive', () => {
    assert.equal(normalizeAutomationStatus('RUNNING'), 'running');
  });
  it('returns queued for unknown', () => {
    assert.equal(normalizeAutomationStatus('unknown'), 'queued');
  });
  it('returns queued for empty', () => {
    assert.equal(normalizeAutomationStatus(''), 'queued');
  });
});

describe('normalizeAutomationQuery', () => {
  it('trims and lowercases', () => {
    assert.equal(normalizeAutomationQuery('  Hello World  '), 'hello world');
  });
  it('collapses whitespace', () => {
    assert.equal(normalizeAutomationQuery('a   b\tc'), 'a b c');
  });
  it('returns empty string for empty input', () => {
    assert.equal(normalizeAutomationQuery(''), '');
    assert.equal(normalizeAutomationQuery(null), '');
  });
});

describe('buildSearchProfileQueryMaps', () => {
  it('returns empty maps for empty input', () => {
    const result = buildSearchProfileQueryMaps({});
    assert.equal(result.queryToFields.size, 0);
    assert.equal(result.fieldStats.size, 0);
  });

  it('returns empty maps for no argument', () => {
    const result = buildSearchProfileQueryMaps();
    assert.equal(result.queryToFields.size, 0);
    assert.equal(result.fieldStats.size, 0);
  });

  it('builds queryToFields from query_rows', () => {
    const result = buildSearchProfileQueryMaps({
      query_rows: [
        { query: 'sensor dpi', target_fields: ['sensor', 'dpi'], attempts: 1, result_count: 5 },
      ],
    });
    assert.deepEqual(result.queryToFields.get('sensor dpi'), ['sensor', 'dpi']);
  });

  it('merges field_target_queries into queryToFields', () => {
    const result = buildSearchProfileQueryMaps({
      query_rows: [],
      field_target_queries: {
        weight: ['mouse weight grams'],
      },
    });
    assert.deepEqual(result.queryToFields.get('mouse weight grams'), ['weight']);
  });

  it('accumulates fieldStats from query_rows', () => {
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

  it('uses query_stats when available', () => {
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
});
