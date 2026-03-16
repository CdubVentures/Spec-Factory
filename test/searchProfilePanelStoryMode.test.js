import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCoverageStats,
  deriveQueryStatus,
  deriveStrategy,
  deriveLlmPlannerStatus,
  buildQueryDetailPayload,
} from '../tools/gui-react/src/features/runtime-ops/selectors/searchProfileHelpers.js';

function makeNeedRow(overrides = {}) {
  return {
    field_key: 'weight',
    required_level: 'required',
    confidence: null,
    best_tier_seen: null,
    refs_found: 0,
    min_refs: 2,
    reasons: ['missing'],
    need_score: 10,
    ...overrides,
  };
}

function makeQueryRow(overrides = {}) {
  return {
    query: 'razer viper v3 pro weight',
    hint_source: 'field_target',
    target_fields: ['weight'],
    doc_hint: undefined,
    domain_hint: undefined,
    result_count: 0,
    attempts: 0,
    providers: [],
    ...overrides,
  };
}

describe('computeCoverageStats', () => {
  it('returns zero coverage when no queries and no needs', () => {
    const result = computeCoverageStats([], []);
    assert.equal(result.totalNeeds, 0);
    assert.equal(result.coveredNeeds, 0);
    assert.deepEqual(result.gapFields, []);
    assert.equal(result.coverageScore, 1);
  });

  it('computes full coverage when all needs have matching queries', () => {
    const needs = [
      makeNeedRow({ field_key: 'weight' }),
      makeNeedRow({ field_key: 'length' }),
    ];
    const queries = [
      makeQueryRow({ target_fields: ['weight'] }),
      makeQueryRow({ query: 'razer viper v3 pro length', target_fields: ['length'] }),
    ];
    const result = computeCoverageStats(needs, queries);
    assert.equal(result.totalNeeds, 2);
    assert.equal(result.coveredNeeds, 2);
    assert.deepEqual(result.gapFields, []);
    assert.equal(result.coverageScore, 1);
  });

  it('identifies gap fields with no query coverage', () => {
    const needs = [
      makeNeedRow({ field_key: 'weight' }),
      makeNeedRow({ field_key: 'sensor' }),
      makeNeedRow({ field_key: 'dpi_max' }),
    ];
    const queries = [
      makeQueryRow({ target_fields: ['weight'] }),
    ];
    const result = computeCoverageStats(needs, queries);
    assert.equal(result.totalNeeds, 3);
    assert.equal(result.coveredNeeds, 1);
    assert.deepEqual(result.gapFields, ['sensor', 'dpi_max']);
    assert.ok(result.coverageScore > 0.3 && result.coverageScore < 0.4);
  });

  it('handles queries with multiple target fields', () => {
    const needs = [
      makeNeedRow({ field_key: 'weight' }),
      makeNeedRow({ field_key: 'length' }),
    ];
    const queries = [
      makeQueryRow({ target_fields: ['weight', 'length'] }),
    ];
    const result = computeCoverageStats(needs, queries);
    assert.equal(result.coveredNeeds, 2);
    assert.deepEqual(result.gapFields, []);
  });
});

describe('deriveQueryStatus', () => {
  it('returns planned when no attempts and no results', () => {
    assert.equal(deriveQueryStatus(makeQueryRow()), 'planned');
  });

  it('returns sent when attempts > 0 but result_count is 0', () => {
    assert.equal(deriveQueryStatus(makeQueryRow({ attempts: 1, result_count: 0 })), 'sent');
  });

  it('returns received when result_count > 0', () => {
    assert.equal(deriveQueryStatus(makeQueryRow({ result_count: 5 })), 'received');
  });

  it('returns received when result_count > 0 even with 0 attempts', () => {
    assert.equal(deriveQueryStatus(makeQueryRow({ attempts: 0, result_count: 3 })), 'received');
  });
});

describe('deriveStrategy', () => {
  it('returns deterministic for field_target hint source', () => {
    assert.equal(deriveStrategy(makeQueryRow({ hint_source: 'field_target' })), 'deterministic');
  });

  it('returns deterministic for alias_expansion hint source', () => {
    assert.equal(deriveStrategy(makeQueryRow({ hint_source: 'alias_expansion' })), 'deterministic');
  });

  it('returns llm-planned for llm_planner hint source', () => {
    assert.equal(deriveStrategy(makeQueryRow({ hint_source: 'llm_planner' })), 'llm-planned');
  });

  it('returns llm-planned for llm_discovery hint source', () => {
    assert.equal(deriveStrategy(makeQueryRow({ hint_source: 'llm_discovery' })), 'llm-planned');
  });

  it('returns deterministic for doc_hint hint source', () => {
    assert.equal(deriveStrategy(makeQueryRow({ hint_source: 'doc_hint' })), 'deterministic');
  });

  it('returns deterministic when hint_source is undefined', () => {
    assert.equal(deriveStrategy(makeQueryRow({ hint_source: undefined })), 'deterministic');
  });
});

describe('deriveLlmPlannerStatus', () => {
  it('returns false for null profile', () => {
    assert.equal(deriveLlmPlannerStatus(null), false);
  });

  it('returns true when llm_query_planning is explicitly true', () => {
    assert.equal(deriveLlmPlannerStatus({ llm_query_planning: true }), true);
  });

  it('returns false when llm_query_planning is explicitly false and no other signals', () => {
    assert.equal(deriveLlmPlannerStatus({ llm_query_planning: false }), false);
  });

  it('returns true when llm_queries has entries even if flag is false', () => {
    assert.equal(deriveLlmPlannerStatus({
      llm_query_planning: false,
      llm_queries: [{ query: 'test' }],
    }), true);
  });

  it('returns true when llm_query_model is set even if flag is false', () => {
    assert.equal(deriveLlmPlannerStatus({
      llm_query_planning: false,
      llm_query_model: 'gemini-2.0-flash',
    }), true);
  });

  it('returns true when query rows have llm hint_source', () => {
    assert.equal(deriveLlmPlannerStatus({
      llm_query_planning: false,
      query_rows: [
        { query: 'test', hint_source: 'field_target' },
        { query: 'test2', hint_source: 'llm_planner' },
      ],
    }), true);
  });

  it('returns false for baseline profile with no LLM signals', () => {
    assert.equal(deriveLlmPlannerStatus({
      llm_query_planning: false,
      llm_query_model: '',
      llm_queries: [],
      query_rows: [{ query: 'test', hint_source: 'field_target' }],
    }), false);
  });
});

describe('buildQueryDetailPayload', () => {
  it('includes query text and target fields', () => {
    const query = makeQueryRow({ query: 'test query', target_fields: ['weight', 'length'] });
    const result = buildQueryDetailPayload(query, []);
    assert.equal(result.query, 'test query');
    assert.deepEqual(result.targetFields, ['weight', 'length']);
  });

  it('cross-references needset to find matched needs', () => {
    const query = makeQueryRow({ target_fields: ['weight', 'dpi_max'] });
    const needs = [
      makeNeedRow({ field_key: 'weight', need_score: 10 }),
      makeNeedRow({ field_key: 'sensor', need_score: 5 }),
      makeNeedRow({ field_key: 'dpi_max', need_score: 8 }),
    ];
    const result = buildQueryDetailPayload(query, needs);
    assert.equal(result.matchedNeeds.length, 2);
    assert.equal(result.matchedNeeds[0].field_key, 'weight');
    assert.equal(result.matchedNeeds[1].field_key, 'dpi_max');
  });

  it('includes constraints from query row', () => {
    const query = makeQueryRow({ doc_hint: 'spec sheet', domain_hint: 'razer.com' });
    const result = buildQueryDetailPayload(query, []);
    assert.equal(result.constraints.doc_hint, 'spec sheet');
    assert.equal(result.constraints.domain_hint, 'razer.com');
  });

  it('includes strategy and status', () => {
    const query = makeQueryRow({ hint_source: 'llm_planner', result_count: 5 });
    const result = buildQueryDetailPayload(query, []);
    assert.equal(result.strategy, 'llm-planned');
    assert.equal(result.status, 'received');
  });

  it('returns empty matchedNeeds when no target fields', () => {
    const query = makeQueryRow({ target_fields: [] });
    const needs = [makeNeedRow({ field_key: 'weight' })];
    const result = buildQueryDetailPayload(query, needs);
    assert.deepEqual(result.matchedNeeds, []);
  });
});
