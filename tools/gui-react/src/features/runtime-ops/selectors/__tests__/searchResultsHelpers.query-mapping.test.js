import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQueryTargetMap,
  queryPassName,
  computePerQueryStats,
  makeResult,
  makeDetail,
  makeSearchPlan,
} from './helpers/searchResultsHelpersHarness.js';

describe('buildQueryTargetMap', () => {
  it('returns empty map when no plans provided', () => {
    const result = buildQueryTargetMap([]);
    assert.equal(result.size, 0);
  });

  it('returns empty map for undefined input', () => {
    const result = buildQueryTargetMap(undefined);
    assert.equal(result.size, 0);
  });

  it('inverts query_target_map from single plan', () => {
    const plans = [
      makeSearchPlan({
        query_target_map: {
          'razer viper v3 pro specs': ['sensor', 'dpi'],
          'razer viper v3 pro weight': ['weight'],
        },
      }),
    ];
    const result = buildQueryTargetMap(plans);
    assert.deepEqual(result.get('razer viper v3 pro specs'), ['sensor', 'dpi']);
    assert.deepEqual(result.get('razer viper v3 pro weight'), ['weight']);
  });

  it('merges target fields across multiple plans for same query', () => {
    const plans = [
      makeSearchPlan({
        query_target_map: { 'specs query': ['sensor'] },
      }),
      makeSearchPlan({
        pass_index: 1,
        pass_name: 'repair',
        query_target_map: { 'specs query': ['weight', 'buttons'] },
      }),
    ];
    const result = buildQueryTargetMap(plans);
    const targets = result.get('specs query');
    assert.ok(targets.includes('sensor'));
    assert.ok(targets.includes('weight'));
    assert.ok(targets.includes('buttons'));
    assert.equal(targets.length, 3);
  });

  it('deduplicates target fields', () => {
    const plans = [
      makeSearchPlan({ query_target_map: { 'q': ['sensor', 'dpi'] } }),
      makeSearchPlan({ pass_index: 1, query_target_map: { 'q': ['sensor', 'weight'] } }),
    ];
    const result = buildQueryTargetMap(plans);
    const targets = result.get('q');
    assert.equal(targets.filter((f) => f === 'sensor').length, 1);
  });
});

// ── queryPassName ──

describe('queryPassName', () => {
  it('returns undefined when no plans provided', () => {
    assert.equal(queryPassName('some query', []), undefined);
  });

  it('returns undefined for undefined plans', () => {
    assert.equal(queryPassName('some query', undefined), undefined);
  });

  it('returns pass name for query found in queries_generated', () => {
    const plans = [
      makeSearchPlan({
        pass_name: 'primary',
        queries_generated: ['razer viper specs', 'razer viper weight'],
      }),
      makeSearchPlan({
        pass_index: 1,
        pass_name: 'repair',
        queries_generated: ['razer viper v3 pro dpi range'],
      }),
    ];
    assert.equal(queryPassName('razer viper specs', plans), 'primary');
    assert.equal(queryPassName('razer viper v3 pro dpi range', plans), 'repair');
  });

  it('returns first matching pass when query appears in multiple passes', () => {
    const plans = [
      makeSearchPlan({ pass_name: 'primary', queries_generated: ['shared query'] }),
      makeSearchPlan({ pass_index: 1, pass_name: 'repair', queries_generated: ['shared query'] }),
    ];
    assert.equal(queryPassName('shared query', plans), 'primary');
  });

  it('returns undefined for unknown query', () => {
    const plans = [
      makeSearchPlan({ pass_name: 'primary', queries_generated: ['known query'] }),
    ];
    assert.equal(queryPassName('unknown query', plans), undefined);
  });
});

// ── computePerQueryStats ──

describe('computePerQueryStats', () => {
  it('returns empty map for empty details', () => {
    const result = computePerQueryStats([]);
    assert.equal(result.size, 0);
  });

  it('computes keep/maybe/drop counts per query', () => {
    const details = [
      makeDetail({
        query: 'q1',
        results: [
          makeResult({ decision: 'keep', domain: 'a.com', relevance_score: 0.9 }),
          makeResult({ decision: 'drop', domain: 'b.com', relevance_score: 0.3 }),
          makeResult({ decision: 'maybe', domain: 'a.com', relevance_score: 0.5 }),
        ],
      }),
    ];
    const result = computePerQueryStats(details);
    const stats = result.get('q1');
    assert.equal(stats.keepCount, 1);
    assert.equal(stats.maybeCount, 1);
    assert.equal(stats.dropCount, 1);
  });

  it('computes topDomain as most frequent domain', () => {
    const details = [
      makeDetail({
        query: 'q1',
        results: [
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'b.com' }),
          makeResult({ domain: 'a.com' }),
        ],
      }),
    ];
    const result = computePerQueryStats(details);
    assert.equal(result.get('q1').topDomain, 'a.com');
  });

  it('computes average relevance score', () => {
    const details = [
      makeDetail({
        query: 'q1',
        results: [
          makeResult({ relevance_score: 0.8 }),
          makeResult({ relevance_score: 0.6 }),
        ],
      }),
    ];
    const result = computePerQueryStats(details);
    assert.ok(Math.abs(result.get('q1').avgRelevance - 0.7) < 0.001);
  });

  it('handles multiple queries independently', () => {
    const details = [
      makeDetail({ query: 'q1', results: [makeResult({ decision: 'keep' })] }),
      makeDetail({ query: 'q2', results: [makeResult({ decision: 'drop' }), makeResult({ decision: 'drop' })] }),
    ];
    const result = computePerQueryStats(details);
    assert.equal(result.get('q1').keepCount, 1);
    assert.equal(result.get('q2').dropCount, 2);
  });
});

// ── computeDomainDecisionBreakdown ──
