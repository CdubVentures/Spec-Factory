import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBusyPrefetchTabs,
  hasPrefetchTabData,
  DEFAULT_PREFETCH_TAB_KEYS,
} from '../prefetchTabBusyHelpers.js';

// Helpers for building partial prefetch data payloads
function withQueryJourney(extra = {}) {
  return {
    needset: { needset_size: 3, total_fields: 40 },
    brand_resolution: { status: 'resolved', brand: 'Razer', official_domain: 'razer.com', aliases: [], candidates: [] },
    llm_calls: { brand_resolver: [{ status: 'finished' }] },
    search_profile: { query_count: 2, query_rows: [{ query: 'q1' }] },
    search_plans: [{ pass_name: 'primary', queries_generated: ['q1'] }],
    query_journey: { selected_query_count: 2, selected_queries: ['q1', 'q2'] },
    ...extra,
  };
}

describe('buildBusyPrefetchTabs', () => {
  it('tab order matches the 8-stage sequential pipeline', () => {
    assert.deepEqual(DEFAULT_PREFETCH_TAB_KEYS, [
      'needset',
      'brand_resolver',
      'search_profile',
      'search_planner',
      'query_journey',
      'search_results',
      'serp_selector',
      'domain_classifier',
    ]);
  });

  it('includes query_journey in default prefetch tab keys before search_results', () => {
    const journeyIndex = DEFAULT_PREFETCH_TAB_KEYS.indexOf('query_journey');
    const resultsIndex = DEFAULT_PREFETCH_TAB_KEYS.indexOf('search_results');
    assert.equal(journeyIndex >= 0, true);
    assert.equal(journeyIndex < resultsIndex, true);
  });

  it('brand_resolver comes before search_profile', () => {
    const brandIdx = DEFAULT_PREFETCH_TAB_KEYS.indexOf('brand_resolver');
    const profileIdx = DEFAULT_PREFETCH_TAB_KEYS.indexOf('search_profile');
    assert.equal(brandIdx < profileIdx, true);
  });

  // ── Not running → nothing bounces ──

  it('returns no busy tabs when run is not active', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: false,
      workers: [{ pool: 'llm', state: 'running', call_type: 'brand_resolver' }],
    });
    assert.deepEqual([...busy], []);
  });

  // ── Worker signal tests ──

  it('returns no busy tabs when running but no workers are active', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      workers: [
        { pool: 'llm', state: 'idle', call_type: 'brand_resolver' },
        { pool: 'search', state: 'idle' },
      ],
    });
    assert.deepEqual([...busy], []);
  });

  it('marks brand_resolver busy when LLM worker running with that call_type', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      workers: [{ pool: 'llm', state: 'running', call_type: 'brand_resolver' }],
    });
    assert.deepEqual([...busy], ['brand_resolver']);
  });

  it('maps needset_planner call_type to the needset tab', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      workers: [{ pool: 'llm', state: 'running', call_type: 'needset_planner' }],
    });
    assert.deepEqual([...busy], ['needset']);
  });

  it('search worker NOT busy until query_journey has data (sequential gate)', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      workers: [{ pool: 'search', state: 'running' }],
    });
    assert.equal(busy.has('search_results'), false, 'search_results should NOT be busy without query journey data');
  });

  it('search worker IS busy when query_journey has data', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      workers: [{ pool: 'search', state: 'running' }],
      prefetchData: withQueryJourney(),
    });
    assert.equal(busy.has('search_results'), true, 'search_results should be busy after query journey completes');
  });

  it('ignores LLM workers with non-prefetch call_types', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      workers: [
        { pool: 'llm', state: 'running', call_type: 'extraction' },
        { pool: 'llm', state: 'running', call_type: 'validation' },
      ],
    });
    assert.deepEqual([...busy], []);
  });

  it('ignores fetch workers entirely', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      workers: [{ pool: 'fetch', state: 'running' }],
    });
    assert.deepEqual([...busy], []);
  });

  it('maps all five LLM prefetch call_types correctly', () => {
    const mapping = [
      ['brand_resolver', 'brand_resolver'],
      ['needset_planner', 'needset'],
      ['search_planner', 'search_planner'],
      ['serp_selector', 'serp_selector'],
      ['domain_classifier', 'domain_classifier'],
    ];
    for (const [callType, expectedTab] of mapping) {
      const busy = buildBusyPrefetchTabs({
        isRunning: true,
        workers: [{ pool: 'llm', state: 'running', call_type: callType }],
      });
      assert.equal(busy.has(expectedTab), true, `call_type '${callType}' should map to tab '${expectedTab}'`);
    }
  });

  // ── No bouncy ball without a worker ──

  it('no busy tabs when running with no workers even if prefetch data exists', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      workers: [],
      prefetchData: { needset: { needset_size: 3, total_fields: 40 } },
    });
    assert.deepEqual([...busy], [], 'no ball without a running worker');
  });

  it('handles undefined options gracefully', () => {
    const busy = buildBusyPrefetchTabs();
    assert.deepEqual([...busy], []);
  });
});

describe('hasPrefetchTabData', () => {
  it('returns true for needset with data', () => {
    assert.equal(hasPrefetchTabData('needset', { needset: { needset_size: 3, total_fields: 40 } }), true);
  });

  it('returns false for needset with empty data', () => {
    assert.equal(hasPrefetchTabData('needset', { needset: {} }), false);
  });

  it('returns true for brand_resolver with resolution data', () => {
    assert.equal(hasPrefetchTabData('brand_resolver', {
      brand_resolution: { status: 'resolved', brand: 'Razer' },
    }), true);
  });

  it('returns true for search_profile with query_rows', () => {
    assert.equal(hasPrefetchTabData('search_profile', {
      search_profile: { query_count: 2, query_rows: [{ query: 'q1' }] },
    }), true);
  });

  it('returns false for unknown tab', () => {
    assert.equal(hasPrefetchTabData('unknown_tab', {}), false);
  });
});
