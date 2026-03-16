import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRunSummaryIdentityDiscoverySection } from '../src/features/indexing/orchestration/finalize/buildRunSummaryIdentityDiscoverySection.js';

// WHY: The field history feedback loop depends on roundResult.summary.searchPlanQueries
// being populated. Without it, buildFieldHistories receives [] for queries and the
// anti-garbage fields (existing_queries, query_count, duplicate_attempts_suppressed)
// never accumulate across rounds.

describe('searchPlanQueries wiring into summary', () => {
  const makeDiscoveryResult = (queries = []) => ({
    enabled: true,
    discoveryKey: 'dk',
    candidatesKey: 'ck',
    candidates: [],
    search_attempts: [],
    search_profile_key: null,
    search_profile_run_key: null,
    search_profile_latest_key: null,
    queries,
    llm_queries: [],
  });

  it('surfaces searchPlanQueries from discoveryResult.queries', () => {
    const queries = [
      { query: 'logitech g pro sensor', source: 'llm', target_fields: ['sensor_brand', 'sensor_model'] },
      { query: 'logitech g pro weight grams', source: 'targeted', target_fields: ['weight'] },
    ];
    const result = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: makeDiscoveryResult(queries),
    });

    assert.ok(Array.isArray(result.searchPlanQueries), 'searchPlanQueries must be an array');
    assert.equal(result.searchPlanQueries.length, 2);
    assert.equal(result.searchPlanQueries[0].query, 'logitech g pro sensor');
    assert.deepStrictEqual(result.searchPlanQueries[0].target_fields, ['sensor_brand', 'sensor_model']);
    assert.equal(result.searchPlanQueries[1].query, 'logitech g pro weight grams');
    assert.deepStrictEqual(result.searchPlanQueries[1].target_fields, ['weight']);
  });

  it('returns empty array when discoveryResult has no queries', () => {
    const result = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: makeDiscoveryResult([]),
    });
    assert.deepStrictEqual(result.searchPlanQueries, []);
  });

  it('returns empty array when discoveryResult is empty object', () => {
    const result = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: {},
    });
    assert.deepStrictEqual(result.searchPlanQueries, []);
  });

  it('strips non-essential fields from queries (only query + target_fields)', () => {
    const queries = [
      {
        query: 'test query',
        source: 'llm',
        target_fields: ['field_a'],
        doc_hint: 'some hint',
        domain_hint: 'example.com',
        hint_source: 'frontier',
      },
    ];
    const result = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: makeDiscoveryResult(queries),
    });

    assert.equal(result.searchPlanQueries.length, 1);
    assert.equal(result.searchPlanQueries[0].query, 'test query');
    assert.deepStrictEqual(result.searchPlanQueries[0].target_fields, ['field_a']);
    // Should not carry extra discovery metadata
    assert.equal(result.searchPlanQueries[0].doc_hint, undefined);
    assert.equal(result.searchPlanQueries[0].domain_hint, undefined);
  });

  it('handles null/undefined queries gracefully', () => {
    const queries = [null, undefined, { query: 'valid', target_fields: ['f1'] }];
    const result = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: makeDiscoveryResult(queries),
    });

    // Should filter out nulls and keep the valid one
    assert.ok(result.searchPlanQueries.length >= 1);
    const valid = result.searchPlanQueries.find(q => q.query === 'valid');
    assert.ok(valid, 'valid query must survive');
    assert.deepStrictEqual(valid.target_fields, ['f1']);
  });

  it('handles queries with missing target_fields', () => {
    const queries = [
      { query: 'no targets' },
      { query: 'empty targets', target_fields: [] },
    ];
    const result = buildRunSummaryIdentityDiscoverySection({
      discoveryResult: makeDiscoveryResult(queries),
    });

    assert.ok(Array.isArray(result.searchPlanQueries));
    // Both should survive with empty target_fields
    const noTargets = result.searchPlanQueries.find(q => q.query === 'no targets');
    assert.ok(noTargets);
    assert.deepStrictEqual(noTargets.target_fields, []);
  });
});
