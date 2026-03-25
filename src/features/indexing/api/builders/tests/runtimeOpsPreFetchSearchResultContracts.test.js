import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreFetchPhases } from '../runtimeOpsDataBuilders.js';
import { makeEvent, makeMeta } from './fixtures/runtimeOpsDataBuildersHarness.js';

test('buildPreFetchPhases: search_results_collected projects detail envelopes and preserves empty result sets', () => {
  const result = buildPreFetchPhases([
    makeEvent('search_results_collected', {
      query: 'Razer Viper V3 Pro specs',
      provider: 'searxng',
      dedupe_count: 3,
      results: [
        {
          title: 'Razer Viper V3 Pro - Official',
          url: 'https://razer.com/viper-v3-pro',
          domain: 'razer.com',
          snippet: 'Official specs page',
          rank: 1,
          relevance_score: 0.95,
          decision: 'keep',
          reason: 'manufacturer page',
        },
      ],
    }),
    makeEvent('search_results_collected', {
      query: 'no results query',
      provider: 'searxng',
      dedupe_count: 0,
      results: [],
    }, { ts: '2026-02-20T00:02:00.000Z' }),
  ], makeMeta(), {});

  assert.deepEqual(result.search_result_details[0], {
    query: 'Razer Viper V3 Pro specs',
    provider: 'searxng',
    dedupe_count: 3,
    results: [
      {
        title: 'Razer Viper V3 Pro - Official',
        url: 'https://razer.com/viper-v3-pro',
        domain: 'razer.com',
        snippet: 'Official specs page',
        rank: 1,
        relevance_score: 0.95,
        decision: 'keep',
        reason: 'manufacturer page',
        provider: '',
        already_crawled: false,
      },
    ],
  });
  assert.deepEqual(result.search_result_details[1], {
    query: 'no results query',
    provider: 'searxng',
    dedupe_count: 0,
    results: [],
  });
});

test('buildPreFetchPhases: search stage boundary events do not create blank search result rows', () => {
  const result = buildPreFetchPhases([
    makeEvent('search_started', { scope: 'stage', trigger: 'run_started' }, { ts: '2026-02-20T00:00:00.000Z' }),
    makeEvent('search_started', {
      scope: 'query',
      query: 'Razer Viper V3 Pro specs',
      provider: 'google',
      worker_id: 'search-1',
    }, { ts: '2026-02-20T00:00:01.000Z' }),
    makeEvent('search_finished', {
      scope: 'query',
      query: 'Razer Viper V3 Pro specs',
      provider: 'google',
      result_count: 0,
      worker_id: 'search-1',
    }, { ts: '2026-02-20T00:00:02.000Z' }),
    makeEvent('search_finished', { scope: 'stage', reason: 'first_fetch_started' }, { ts: '2026-02-20T00:00:46.000Z' }),
  ], makeMeta(), {});

  assert.deepEqual(result.search_results, [{
    query: 'Razer Viper V3 Pro specs',
    provider: 'google',
    result_count: 0,
    duration_ms: 1000,
    worker_id: 'search-1',
    throttle_events: 0,
    throttle_wait_ms: 0,
    ts: '2026-02-20T00:00:02.000Z',
  }]);
});
