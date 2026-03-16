import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBusyPrefetchTabs,
  DEFAULT_PREFETCH_TAB_KEYS,
} from '../tools/gui-react/src/pages/runtime-ops/panels/prefetchTabBusyHelpers.js';

describe('buildBusyPrefetchTabs', () => {
  it('includes query_journey in default prefetch tab keys before search_results', () => {
    const journeyIndex = DEFAULT_PREFETCH_TAB_KEYS.indexOf('query_journey');
    const resultsIndex = DEFAULT_PREFETCH_TAB_KEYS.indexOf('search_results');
    assert.equal(journeyIndex >= 0, true);
    assert.equal(journeyIndex < resultsIndex, true);
  });

  it('returns no busy tabs when run is not active', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: false,
      activeTab: 'needset',
      prefetchData: undefined,
    });
    assert.deepEqual([...busy], []);
  });

  it('marks every tab busy when run is active and prefetch data has not arrived', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      activeTab: null,
      prefetchData: undefined,
    });
    assert.deepEqual([...busy].sort(), [...DEFAULT_PREFETCH_TAB_KEYS].sort());
  });

  it('keeps selected tab busy while run is active even after data is present', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      activeTab: 'search_profile',
      prefetchData: {
        needset: { needset_size: 3, total_fields: 40, needs: [], snapshots: [] },
        search_profile: { query_count: 2, query_rows: [{ query: 'q1' }] },
        llm_calls: { brand_resolver: [{ status: 'finished' }], search_planner: [], serp_triage: [], domain_classifier: [] },
        brand_resolution: { status: 'resolved', brand: 'Razer', official_domain: 'razer.com', aliases: [], candidates: [] },
        search_plans: [{ pass_name: 'primary', queries_generated: ['q1'] }],
        search_results: [{ query: 'q1' }],
        search_result_details: [{ query: 'q1', results: [] }],
        serp_triage: [],
        domain_health: [],
      },
    });

    assert.equal(busy.has('search_profile'), true);
  });

  it('marks tabs without data as busy while completed tabs stay idle', () => {
    const busy = buildBusyPrefetchTabs({
      isRunning: true,
      activeTab: null,
      prefetchData: {
        needset: { needset_size: 1, total_fields: 50, needs: [], snapshots: [] },
        search_profile: { query_count: 1, query_rows: [{ query: 'q1' }] },
        llm_calls: {
          brand_resolver: [{ status: 'finished' }],
          search_planner: [{ status: 'finished' }],
          serp_triage: [],
          domain_classifier: [],
        },
        brand_resolution: { status: 'resolved', brand: 'Razer', official_domain: 'razer.com', aliases: ['Razer Inc'], candidates: [] },
        search_plans: [{ pass_name: 'primary', queries_generated: ['q1'] }],
        search_results: [{ query: 'q1', result_count: 1 }],
        search_result_details: [{ query: 'q1', results: [{ url: 'https://razer.com', decision: 'keep' }] }],
        serp_triage: [],
        domain_health: [],
      },
    });

    assert.equal(busy.has('needset'), false);
    assert.equal(busy.has('search_profile'), false);
    assert.equal(busy.has('query_journey'), false);
    assert.equal(busy.has('brand_resolver'), false);
    assert.equal(busy.has('search_planner'), false);
    assert.equal(busy.has('search_results'), false);
    assert.equal(busy.has('serp_triage'), true);
    assert.equal(busy.has('domain_classifier'), true);
  });
});
