import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProfileQuery,
  normalizeQueryProfileRow,
  enrichQueryRow,
  toQueryRowLookup,
  incrementHintSourceCounts,
  isRuntimeBridgeSource,
  applyPlanProfileFallback,
  mergeQueryRowFromPlan,
  mergeSearchProfileRows,
} from '../runtimeOpsSearchProfileMergeHelpers.js';

describe('normalizeProfileQuery', () => {
  test('lowercases and trims input', () => {
    assert.equal(normalizeProfileQuery('  Hello World  '), 'hello world');
  });

  test('returns empty string for falsy input', () => {
    assert.equal(normalizeProfileQuery(null), '');
    assert.equal(normalizeProfileQuery(undefined), '');
    assert.equal(normalizeProfileQuery(''), '');
  });
});

describe('normalizeQueryProfileRow', () => {
  test('wraps string into query object', () => {
    assert.deepEqual(normalizeQueryProfileRow('test query'), { query: 'test query' });
  });

  test('returns null for non-object, non-string input', () => {
    assert.equal(normalizeQueryProfileRow(null), null);
    assert.equal(normalizeQueryProfileRow(42), null);
    assert.equal(normalizeQueryProfileRow(undefined), null);
  });

  test('passes through object rows unchanged', () => {
    const row = { query: 'foo', hint_source: 'bar' };
    assert.equal(normalizeQueryProfileRow(row), row);
  });
});

describe('enrichQueryRow', () => {
  test('enriches row from lookup map', () => {
    const lookup = new Map([['test', { query: 'test', hint_source: 'plan', doc_hint: 'doc1' }]]);
    const result = enrichQueryRow({ query: 'test' }, lookup);
    assert.equal(result.hint_source, 'plan');
    assert.equal(result.doc_hint, 'doc1');
  });

  test('does not overwrite existing values', () => {
    const lookup = new Map([['test', { query: 'test', hint_source: 'plan', doc_hint: 'override' }]]);
    const result = enrichQueryRow({ query: 'test', hint_source: 'original', doc_hint: 'keep' }, lookup);
    assert.equal(result.hint_source, 'original');
    assert.equal(result.doc_hint, 'keep');
  });

  test('returns row unchanged for non-object input', () => {
    assert.equal(enrichQueryRow(null), null);
    assert.equal(enrichQueryRow('string'), 'string');
  });

  test('returns row unchanged when no match in lookup', () => {
    const row = { query: 'nomatch' };
    const result = enrichQueryRow(row, new Map());
    assert.deepEqual(result, row);
  });

  test('copies target_fields from source when target has none', () => {
    const lookup = new Map([['q', { query: 'q', target_fields: ['price', 'name'] }]]);
    const result = enrichQueryRow({ query: 'q' }, lookup);
    assert.deepEqual(result.target_fields, ['price', 'name']);
  });
});

describe('toQueryRowLookup', () => {
  test('builds lookup from array of rows', () => {
    const lookup = toQueryRowLookup([{ query: 'Foo' }, { query: 'bar' }]);
    assert.ok(lookup.has('foo'));
    assert.ok(lookup.has('bar'));
    assert.equal(lookup.size, 2);
  });

  test('builds lookup from profile with query_rows', () => {
    const lookup = toQueryRowLookup({ query_rows: [{ query: 'test' }] });
    assert.ok(lookup.has('test'));
  });

  test('builds lookup from profile with queries', () => {
    const lookup = toQueryRowLookup({ queries: [{ query: 'alt' }] });
    assert.ok(lookup.has('alt'));
  });

  test('deduplicates by normalized query', () => {
    const lookup = toQueryRowLookup([{ query: 'Test' }, { query: 'test' }]);
    assert.equal(lookup.size, 1);
  });

  test('handles string rows via normalizeQueryProfileRow', () => {
    const lookup = toQueryRowLookup(['hello']);
    assert.ok(lookup.has('hello'));
  });

  test('skips null/invalid rows', () => {
    const lookup = toQueryRowLookup([null, undefined, 42, { query: 'valid' }]);
    assert.equal(lookup.size, 1);
  });
});

describe('incrementHintSourceCounts', () => {
  const stubToInt = (v, fb) => {
    const parsed = Number.parseInt(String(v || ''), 10);
    return Number.isFinite(parsed) ? parsed : (Number.isFinite(fb) ? fb : 0);
  };

  test('increments count for new source', () => {
    const result = incrementHintSourceCounts({}, 'plan', stubToInt);
    assert.equal(result.plan, 1);
  });

  test('increments existing count', () => {
    const result = incrementHintSourceCounts({ plan: 2 }, 'plan', stubToInt);
    assert.equal(result.plan, 3);
  });

  test('returns unchanged counts for empty source', () => {
    const result = incrementHintSourceCounts({ a: 1 }, '', stubToInt);
    assert.deepEqual(result, { a: 1 });
  });

  test('handles null target', () => {
    const result = incrementHintSourceCounts(null, 'x', stubToInt);
    assert.equal(result.x, 1);
  });
});

describe('isRuntimeBridgeSource', () => {
  test('returns true for runtime_bridge prefix', () => {
    assert.equal(isRuntimeBridgeSource('runtime_bridge'), true);
    assert.equal(isRuntimeBridgeSource('Runtime_Bridge_v2'), true);
    assert.equal(isRuntimeBridgeSource('  RUNTIME_BRIDGE  '), true);
  });

  test('returns false for non-bridge sources', () => {
    assert.equal(isRuntimeBridgeSource('plan'), false);
    assert.equal(isRuntimeBridgeSource(''), false);
    assert.equal(isRuntimeBridgeSource(), false);
  });
});

describe('applyPlanProfileFallback', () => {
  test('returns target when present', () => {
    assert.equal(applyPlanProfileFallback('target', 'fallback'), 'target');
  });

  test('returns fallback when target is empty', () => {
    assert.equal(applyPlanProfileFallback('', 'fallback'), 'fallback');
    assert.equal(applyPlanProfileFallback(null, 'fallback'), 'fallback');
  });

  test('returns empty when both are empty', () => {
    assert.equal(applyPlanProfileFallback('', ''), '');
  });
});

describe('mergeQueryRowFromPlan', () => {
  test('copies hint fields from plan when target is empty', () => {
    const result = mergeQueryRowFromPlan(
      { query: 'test' },
      { hint_source: 'plan_src', doc_hint: 'doc', domain_hint: 'dom', source_host: 'host.com', target_fields: ['price'] },
    );
    assert.equal(result.hint_source, 'plan_src');
    assert.equal(result.doc_hint, 'doc');
    assert.equal(result.domain_hint, 'dom');
    assert.equal(result.source_host, 'host.com');
    assert.deepEqual(result.target_fields, ['price']);
  });

  test('keeps target values when present', () => {
    const result = mergeQueryRowFromPlan(
      { query: 'test', hint_source: 'mine', target_fields: ['name'] },
      { hint_source: 'plan_src', target_fields: ['price'] },
    );
    assert.equal(result.hint_source, 'mine');
    assert.deepEqual(result.target_fields, ['name']);
  });

  test('returns row for invalid inputs', () => {
    assert.equal(mergeQueryRowFromPlan(null, {}), null);
    const row = { query: 'x' };
    assert.equal(mergeQueryRowFromPlan(row, null), row);
  });
});

describe('mergeSearchProfileRows', () => {
  const stubToInt = (v, fb) => {
    const parsed = Number.parseInt(String(v || ''), 10);
    return Number.isFinite(parsed) ? parsed : (Number.isFinite(fb) ? fb : 0);
  };

  test('merges runtime and plan rows, deduplicating by query', () => {
    const runtime = {
      query_rows: [{ query: 'test query', hint_source: 'runtime_bridge' }],
    };
    const plan = {
      query_rows: [
        { query: 'test query', hint_source: 'plan_src', doc_hint: 'doc1' },
        { query: 'new query', hint_source: 'plan_only' },
      ],
    };
    const result = mergeSearchProfileRows(runtime, plan, stubToInt);
    assert.equal(result.query_rows.length, 2);
    const testRow = result.query_rows.find((r) => r.query === 'test query');
    assert.ok(testRow);
    assert.equal(testRow.__from_plan_profile, true);
    const newRow = result.query_rows.find((r) => r.query === 'new query');
    assert.ok(newRow);
    assert.equal(newRow.__from_plan_profile, true);
  });

  test('plan-only rows get __from_plan_profile flag', () => {
    const runtime = { query_rows: [] };
    const plan = { query_rows: [{ query: 'only in plan' }] };
    const result = mergeSearchProfileRows(runtime, plan, stubToInt);
    assert.equal(result.query_rows.length, 1);
    assert.equal(result.query_rows[0].__from_plan_profile, true);
  });

  test('merges hint_source_counts from both profiles', () => {
    const runtime = { query_rows: [], hint_source_counts: { a: 1 } };
    const plan = { query_rows: [], hint_source_counts: { b: 2 } };
    const result = mergeSearchProfileRows(runtime, plan, stubToInt);
    assert.equal(result.hint_source_counts.a, 1);
    assert.equal(result.hint_source_counts.b, 2);
  });

  test('preserves spread fields from both profiles', () => {
    const runtime = { query_rows: [], category: 'mouse', extra_rt: true };
    const plan = { query_rows: [], plan_version: 2, extra_plan: true };
    const result = mergeSearchProfileRows(runtime, plan, stubToInt);
    assert.equal(result.plan_version, 2);
    assert.equal(result.category, 'mouse');
  });

  test('handles null/undefined profiles gracefully', () => {
    const result = mergeSearchProfileRows(null, null, stubToInt);
    assert.ok(Array.isArray(result.query_rows));
    assert.equal(result.query_rows.length, 0);
  });

  test('runtime_bridge source gets overridden by plan hint_source', () => {
    const runtime = {
      query_rows: [{ query: 'q1', hint_source: 'runtime_bridge' }],
    };
    const plan = {
      query_rows: [{ query: 'q1', hint_source: 'llm_planner' }],
    };
    const result = mergeSearchProfileRows(runtime, plan, stubToInt);
    assert.equal(result.query_rows[0].hint_source, 'llm_planner');
  });
});

