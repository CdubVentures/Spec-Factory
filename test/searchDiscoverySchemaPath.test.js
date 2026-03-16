// WHY: Tests the Schema 4 handoff path in search discovery. When a
// search_plan_handoff is available, the old 7-layer append chain is bypassed
// and converted handoff queries go directly to execution.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveSchema4ExecutionPlan } from '../src/features/indexing/discovery/searchDiscovery.js';

// --- fixtures ---

const VARIABLES = {
  brand: 'Pulsar',
  model: 'X2V2 Mini',
  variant: '',
  category: 'mouse',
};

function makeHandoff(queries) {
  return {
    queries: queries.map((q, i) => ({
      q,
      query_hash: `hash_${i}`,
      family: 'manufacturer_html',
      group_key: 'sensor_performance',
      target_fields: ['sensor_model', 'max_dpi'],
      preferred_domains: ['pulsar.gg'],
      exact_match_required: false,
    })),
    query_hashes: queries.map((_, i) => `hash_${i}`),
    total: queries.length,
  };
}

describe('resolveSchema4ExecutionPlan', () => {
  // --- happy path ---

  it('returns plan with 3 queries when handoff passes guard', () => {
    const handoff = makeHandoff([
      'Pulsar X2V2 Mini sensor specs',
      'Pulsar X2V2 Mini weight dimensions',
      'Pulsar X2V2 Mini review rtings',
    ]);
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: handoff, variables: VARIABLES });

    assert.ok(result, 'should return non-null plan');
    assert.equal(result.source, 'schema4');
    assert.equal(result.queries.length, 3);
    assert.equal(result.queryRows.length, 3);
    assert.ok(result.selectedQueryRowMap instanceof Map);
    assert.equal(result.selectedQueryRowMap.size, 3);
  });

  it('query rows have schema4_planner source', () => {
    const handoff = makeHandoff(['Pulsar X2V2 Mini specs']);
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: handoff, variables: VARIABLES });

    assert.equal(result.queryRows[0].source, 'schema4_planner');
    assert.equal(result.queryRows[0].hint_source, 'schema4_search_plan');
  });

  it('selectedQueryRowMap keyed by lowercase query', () => {
    const handoff = makeHandoff(['Pulsar X2V2 Mini specs']);
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: handoff, variables: VARIABLES });

    assert.ok(result.selectedQueryRowMap.has('pulsar x2v2 mini specs'));
  });

  // --- null / empty handoff ---

  it('returns null for null handoff', () => {
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: null, variables: VARIABLES });
    assert.equal(result, null);
  });

  it('returns null for undefined handoff', () => {
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: undefined, variables: VARIABLES });
    assert.equal(result, null);
  });

  it('returns null for handoff with empty queries', () => {
    const handoff = { queries: [], query_hashes: [], total: 0 };
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: handoff, variables: VARIABLES });
    assert.equal(result, null);
  });

  it('returns null for handoff with only falsy q values', () => {
    const handoff = {
      queries: [
        { q: '', query_hash: 'h1', family: 'f', group_key: 'g', target_fields: [], preferred_domains: [] },
        { q: null, query_hash: 'h2', family: 'f', group_key: 'g', target_fields: [], preferred_domains: [] },
      ],
      query_hashes: ['h1', 'h2'],
      total: 2,
    };
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: handoff, variables: VARIABLES });
    assert.equal(result, null);
  });

  // --- identity guard rejects all ---

  it('returns null when guard rejects all queries (off-brand)', () => {
    const logs = [];
    const logger = { warn: (msg, data) => logs.push({ msg, data }) };
    const handoff = makeHandoff([
      'Razer Viper V3 Pro sensor specs',
      'Logitech G Pro X weight',
    ]);
    const result = resolveSchema4ExecutionPlan({
      searchPlanHandoff: handoff,
      variables: VARIABLES,
      logger,
    });

    assert.equal(result, null, 'off-brand queries should all be rejected');
    assert.ok(logs.some(l => l.msg === 'schema4_guard_rejected_all'), 'should log warning');
  });

  // --- partial rejection ---

  it('returns only queries that pass the guard', () => {
    const handoff = makeHandoff([
      'Pulsar X2V2 Mini sensor specs',
      'Razer Viper V3 Pro weight',
    ]);
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: handoff, variables: VARIABLES });

    assert.ok(result, 'should return plan (some queries pass)');
    assert.equal(result.queries.length, 1);
    assert.ok(result.queries[0].includes('Pulsar'), 'on-brand query should pass');
    assert.ok(result.rejectLog.length > 0, 'rejected queries should be in rejectLog');
  });

  // --- deduplication ---

  it('deduplicates queries with same q value', () => {
    const handoff = {
      queries: [
        { q: 'Pulsar X2V2 Mini specs', query_hash: 'h1', family: 'f1', group_key: 'g1', target_fields: ['a'], preferred_domains: [], exact_match_required: false },
        { q: 'Pulsar X2V2 Mini specs', query_hash: 'h2', family: 'f2', group_key: 'g2', target_fields: ['b'], preferred_domains: [], exact_match_required: false },
      ],
      query_hashes: ['h1', 'h2'],
      total: 2,
    };
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: handoff, variables: VARIABLES });
    assert.ok(result);
    assert.equal(result.queries.length, 1, 'duplicates should be removed before guard');
  });

  // --- guard context ---

  it('includes guardContext in result', () => {
    const handoff = makeHandoff(['Pulsar X2V2 Mini specs']);
    const result = resolveSchema4ExecutionPlan({ searchPlanHandoff: handoff, variables: VARIABLES });
    assert.ok(result.guardContext, 'guardContext should be present');
    assert.ok(Array.isArray(result.guardContext.brandTokens));
    assert.ok(Array.isArray(result.guardContext.modelTokens));
  });
});
