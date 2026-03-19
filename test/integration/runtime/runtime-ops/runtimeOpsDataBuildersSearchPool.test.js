import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeOpsWorkers,
  buildWorkerDetail
} from '../../../../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function searchStarted(workerId, overrides = {}) {
  return {
    event: 'search_started',
    ts: '2025-01-01T00:00:10.000Z',
    payload: {
      worker_id: workerId,
      scope: 'query',
      slot: 'a',
      tasks_started: 1,
      current_query: 'razer viper specs',
      current_provider: 'google',
      ...overrides
    }
  };
}

function searchFinished(workerId, overrides = {}) {
  return {
    event: 'search_finished',
    ts: '2025-01-01T00:00:15.000Z',
    payload: {
      worker_id: workerId,
      scope: 'query',
      slot: 'a',
      tasks_started: 1,
      current_query: 'razer viper specs',
      current_provider: 'google',
      result_count: 10,
      duration_ms: 500,
      ...overrides
    }
  };
}

function findWorker(workers, id) {
  return workers.find((w) => w.worker_id === id);
}

// ── Test 1: Search worker row includes slot-specific fields ─────────────────

test('buildRuntimeOpsWorkers: search worker row includes slot and task fields while running', () => {
  // Only search_started — worker is still running, so current_query/provider should be set
  const events = [
    searchStarted('search-a', { slot: 'a', tasks_started: 3, current_query: 'q1', current_provider: 'google' }),
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'search-a');

  assert.ok(w, 'search worker should exist');
  assert.equal(w.pool, 'search');
  assert.equal(w.slot, 'a');
  assert.equal(w.tasks_started, 3);
  assert.equal(w.current_query, 'q1');
  assert.equal(w.current_provider, 'google');
});

// ── Test 1b: search_finished clears current_query and current_provider ──────

test('buildRuntimeOpsWorkers: search_finished clears current_query and current_provider', () => {
  const events = [
    searchStarted('search-a', { slot: 'a', tasks_started: 3, current_query: 'q1', current_provider: 'google' }),
    searchFinished('search-a', { slot: 'a', tasks_started: 3, result_count: 8, duration_ms: 420 })
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'search-a');

  assert.ok(w, 'search worker should exist');
  assert.equal(w.pool, 'search');
  assert.equal(w.slot, 'a');
  assert.equal(w.current_query, null, 'current_query should be null after search_finished');
  assert.equal(w.current_provider, null, 'current_provider should be null after search_finished');
});

// ── Test 1c: bridge field names (query/provider) map to current_query/current_provider ──

test('buildRuntimeOpsWorkers: bridge field names query/provider populate current_query/current_provider', () => {
  // The runtime bridge emits { query, provider } — NOT { current_query, current_provider }
  const events = [
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: {
        worker_id: 'search-b',
        scope: 'query',
        slot: 'b',
        tasks_started: 1,
        query: 'logitech g pro specs',
        provider: 'bing'
      }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'search-b');

  assert.ok(w, 'search worker should exist');
  assert.equal(w.current_query, 'logitech g pro specs', 'query should map to current_query');
  assert.equal(w.current_provider, 'bing', 'provider should map to current_provider');
});

// ── Test 1d: current_query takes precedence over query when both present ────

test('buildRuntimeOpsWorkers: current_query takes precedence over query fallback', () => {
  const events = [
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: {
        worker_id: 'search-c',
        scope: 'query',
        slot: 'c',
        tasks_started: 1,
        current_query: 'explicit-query',
        current_provider: 'explicit-provider',
        query: 'fallback-query',
        provider: 'fallback-provider'
      }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'search-c');

  assert.equal(w.current_query, 'explicit-query', 'current_query should take precedence');
  assert.equal(w.current_provider, 'explicit-provider', 'current_provider should take precedence');
});

// ── Test 2: Search worker detail returns search_history ─────────────────────

test('buildWorkerDetail: search worker returns search_history', () => {
  const events = [
    searchStarted('search-a', {
      slot: 'a',
      tasks_started: 1,
      current_query: 'q1',
      current_provider: 'google'
    }),
    searchFinished('search-a', {
      slot: 'a',
      tasks_started: 1,
      current_query: 'q1',
      current_provider: 'google',
      result_count: 10,
      duration_ms: 500
    }),
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:20.000Z',
      payload: {
        worker_id: 'search-a',
        scope: 'query',
        slot: 'a',
        tasks_started: 2,
        current_query: 'q2',
        current_provider: 'bing'
      }
    },
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:25.000Z',
      payload: {
        worker_id: 'search-a',
        scope: 'query',
        slot: 'a',
        tasks_started: 2,
        current_query: 'q2',
        current_provider: 'bing',
        result_count: 5,
        duration_ms: 300
      }
    }
  ];

  const detail = buildWorkerDetail(events, 'search-a');

  assert.ok(Array.isArray(detail.search_history), 'search_history should be an array');
  assert.equal(detail.search_history.length, 2, 'should have 2 attempts');
  // Most recent first
  assert.equal(detail.search_history[0].query, 'q2');
  assert.equal(detail.search_history[1].query, 'q1');
  assert.equal(detail.search_history[0].provider, 'bing');
  assert.equal(detail.search_history[0].result_count, 5);
  assert.equal(detail.search_history[0].duration_ms, 300);
  assert.equal(detail.search_history[0].status, 'done');
});

// ── Test 3: Search history ordering — most recent first ─────────────────────

test('buildWorkerDetail: search history is ordered by attempt descending', () => {
  const events = [];
  for (let i = 1; i <= 5; i++) {
    events.push({
      event: 'search_started',
      ts: `2025-01-01T00:00:${String(i * 10).padStart(2, '0')}.000Z`,
      payload: {
        worker_id: 'search-a',
        scope: 'query',
        slot: 'a',
        tasks_started: i,
        current_query: `query-${i}`,
        current_provider: 'google'
      }
    });
    events.push({
      event: 'search_finished',
      ts: `2025-01-01T00:00:${String(i * 10 + 5).padStart(2, '0')}.000Z`,
      payload: {
        worker_id: 'search-a',
        scope: 'query',
        slot: 'a',
        tasks_started: i,
        current_query: `query-${i}`,
        current_provider: 'google',
        result_count: i * 2,
        duration_ms: 100 + i * 50
      }
    });
  }

  const detail = buildWorkerDetail(events, 'search-a');
  assert.equal(detail.search_history.length, 5);
  assert.equal(detail.search_history[0].attempt_no, 5);
  assert.equal(detail.search_history[4].attempt_no, 1);
  assert.equal(detail.search_history[0].query, 'query-5');
});

// ── Test 4: Search KPI aggregates on worker row ─────────────────────────────

test('buildRuntimeOpsWorkers: search worker tracks zero_result_count and avg metrics', () => {
  const events = [
    searchStarted('search-a', { tasks_started: 1 }),
    searchFinished('search-a', { tasks_started: 1, result_count: 10, duration_ms: 400 }),
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:20.000Z',
      payload: { worker_id: 'search-a', scope: 'query', slot: 'a', tasks_started: 2, current_query: 'q2', current_provider: 'google' }
    },
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:25.000Z',
      payload: { worker_id: 'search-a', scope: 'query', slot: 'a', tasks_started: 2, result_count: 0, duration_ms: 200 }
    },
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:30.000Z',
      payload: { worker_id: 'search-a', scope: 'query', slot: 'a', tasks_started: 3, current_query: 'q3', current_provider: 'google' }
    },
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:35.000Z',
      payload: { worker_id: 'search-a', scope: 'query', slot: 'a', tasks_started: 3, result_count: 6, duration_ms: 300 }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'search-a');

  assert.equal(w.tasks_completed, 3, 'tasks_completed should be 3');
  assert.equal(w.zero_result_count, 1, 'zero_result_count should be 1');
  // avg result = (10 + 0 + 6) / 3 ≈ 5.33
  assert.ok(Math.abs(w.avg_result_count - 5.33) < 0.1, `avg_result_count ~5.33, got ${w.avg_result_count}`);
  // avg duration = (400 + 200 + 300) / 3 = 300
  assert.equal(w.avg_duration_ms, 300, 'avg_duration_ms should be 300');
  assert.equal(w.last_result_count, 6, 'last_result_count should be 6');
  assert.equal(w.last_duration_ms, 300, 'last_duration_ms should be 300');
});

// ── Test 5: Missing search enrichment (legacy) — no crash ───────────────────

test('buildRuntimeOpsWorkers: search worker without slot metadata does not crash', () => {
  const events = [
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: { worker_id: 'search-1', scope: 'query' }
    },
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:15.000Z',
      payload: { worker_id: 'search-1', scope: 'query', result_count: 3 }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'search-1');

  assert.ok(w, 'worker should exist');
  assert.equal(w.pool, 'search');
  assert.equal(w.slot, null, 'slot defaults to null when missing');
  assert.equal(w.tasks_started, 0, 'tasks_started defaults to 0');
  assert.equal(w.current_query, null, 'current_query defaults to null');
});

// ── Test 6: Fetch worker rows are unchanged ─────────────────────────────────

test('buildRuntimeOpsWorkers: fetch worker rows do not include search-specific fields', () => {
  const events = [
    {
      event: 'fetch_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: {
        worker_id: 'fetch-https-example-com',
        url: 'https://example.com',
        fetch_mode: 'playwright'
      }
    },
    {
      event: 'fetch_finished',
      ts: '2025-01-01T00:00:15.000Z',
      payload: {
        worker_id: 'fetch-https-example-com',
        url: 'https://example.com',
        status_code: 200
      }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'fetch-https-example-com');

  assert.ok(w, 'fetch worker should exist');
  assert.equal(w.pool, 'fetch');
  assert.equal(w.docs_processed, 1);
  // Fetch workers should not have search fields
  assert.equal(w.slot, undefined, 'fetch workers should not have slot');
  assert.equal(w.tasks_started, undefined, 'fetch workers should not have tasks_started');
});

// ── Test 7: Mixed pools in workers list ─────────────────────────────────────

test('buildRuntimeOpsWorkers: mixed pools produce correct pool-specific fields', () => {
  const events = [
    // search worker
    searchStarted('search-a', { slot: 'a', tasks_started: 1 }),
    searchFinished('search-a', { slot: 'a', tasks_started: 1, result_count: 5, duration_ms: 200 }),
    // fetch worker
    {
      event: 'fetch_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: { worker_id: 'fetch-url-1', url: 'https://example.com', fetch_mode: 'got' }
    },
    // llm worker
    {
      event: 'llm_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: {
        worker_id: 'llm-br-1',
        scope: 'call',
        call_type: 'brand_resolver',
        model: 'gpt-4o',
        prompt_tokens: 100,
        round: 1
      }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const search = findWorker(workers, 'search-a');
  const fetch = findWorker(workers, 'fetch-url-1');
  const llm = findWorker(workers, 'llm-br-1');

  assert.equal(search.pool, 'search');
  assert.equal(search.slot, 'a');
  assert.equal(fetch.pool, 'fetch');
  assert.equal(fetch.slot, undefined);
  assert.equal(llm.pool, 'llm');
  assert.equal(llm.call_type, 'brand_resolver');
});

// ── Test 8: search_history uses bridge field names (query/provider) ──────────

test('buildWorkerDetail: search_history populates query/provider from bridge field names', () => {
  // Runtime bridge emits { query, provider } — NOT { current_query, current_provider }
  const events = [
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: {
        worker_id: 'search-d',
        scope: 'query',
        slot: 'd',
        tasks_started: 1,
        query: 'razer viper v3 pro specs',
        provider: 'google'
      }
    },
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:15.000Z',
      payload: {
        worker_id: 'search-d',
        scope: 'query',
        slot: 'd',
        tasks_started: 1,
        query: 'razer viper v3 pro specs',
        provider: 'google',
        result_count: 12,
        duration_ms: 450
      }
    },
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:20.000Z',
      payload: {
        worker_id: 'search-d',
        scope: 'query',
        slot: 'd',
        tasks_started: 2,
        query: 'razer viper v3 pro weight grams',
        provider: 'bing'
      }
    }
  ];

  const detail = buildWorkerDetail(events, 'search-d');
  assert.ok(Array.isArray(detail.search_history), 'search_history should be an array');
  assert.equal(detail.search_history.length, 2, 'should have 2 attempts');

  // Most recent first (attempt #2 is running, #1 is done)
  const attempt2 = detail.search_history[0];
  const attempt1 = detail.search_history[1];

  assert.equal(attempt2.query, 'razer viper v3 pro weight grams', 'attempt 2 query from bridge field');
  assert.equal(attempt2.provider, 'bing', 'attempt 2 provider from bridge field');
  assert.equal(attempt2.status, 'running', 'attempt 2 still running');

  assert.equal(attempt1.query, 'razer viper v3 pro specs', 'attempt 1 query from bridge field');
  assert.equal(attempt1.provider, 'google', 'attempt 1 provider from bridge field');
  assert.equal(attempt1.status, 'done', 'attempt 1 is done');
  assert.equal(attempt1.result_count, 12, 'attempt 1 result_count');
  assert.equal(attempt1.duration_ms, 450, 'attempt 1 duration_ms');
});

// ── Test 9: search_finished without prior search_started creates orphan attempt with bridge fields ──

test('buildWorkerDetail: orphan search_finished uses bridge field names for query/provider', () => {
  const events = [
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:15.000Z',
      payload: {
        worker_id: 'search-e',
        scope: 'query',
        slot: 'e',
        query: 'orphan query text',
        provider: 'brave',
        result_count: 4,
        duration_ms: 612
      }
    }
  ];

  const detail = buildWorkerDetail(events, 'search-e');
  assert.equal(detail.search_history.length, 1, 'should have 1 orphan attempt');
  assert.equal(detail.search_history[0].query, 'orphan query text', 'orphan query from bridge field');
  assert.equal(detail.search_history[0].provider, 'brave', 'orphan provider from bridge field');
  assert.equal(detail.search_history[0].status, 'done');
  assert.equal(detail.search_history[0].result_count, 4);
});

test('buildWorkerDetail: search results distinguish exact and host-fallback fetch linkage while preserving triage detail', () => {
  const exactUrl = 'https://www.razer.com/gaming-mice/razer-viper-v3-pro';
  const hostFallbackUrl = 'https://www.razer.com/gaming-mice/razer-viper-v3-pro/specs';
  const unmatchedUrl = 'https://reddit.com/r/MouseReview/comments/viper-v3-pro';
  const exactScoreComponents = {
    base_relevance: 4.8,
    tier_boost: 1.5,
    identity_match: 2.1,
    penalties: -0.2,
  };
  const hostFallbackScoreComponents = {
    base_relevance: 2.9,
    tier_boost: 1.5,
    identity_match: 1.3,
    penalties: -0.4,
  };
  const events = [
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: {
        worker_id: 'search-linkage',
        scope: 'query',
        slot: 'a',
        tasks_started: 1,
        current_query: 'razer viper v3 pro specs',
        current_provider: 'google',
      }
    },
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:15.000Z',
      payload: {
        worker_id: 'search-linkage',
        scope: 'query',
        slot: 'a',
        tasks_started: 1,
        current_query: 'razer viper v3 pro specs',
        current_provider: 'google',
        result_count: 3,
        duration_ms: 420,
      }
    },
    {
      event: 'search_results_collected',
      ts: '2025-01-01T00:00:15.100Z',
      payload: {
        scope: 'query',
        query: 'razer viper v3 pro specs',
        provider: 'google',
        results: [
          {
            title: 'Razer Viper V3 Pro',
            url: exactUrl,
            domain: 'razer.com',
            rank: 1,
            provider: 'google',
          },
          {
            title: 'Razer Viper V3 Pro Specifications',
            url: hostFallbackUrl,
            domain: 'razer.com',
            rank: 2,
            provider: 'google',
          },
          {
            title: 'Community impressions',
            url: unmatchedUrl,
            domain: 'reddit.com',
            rank: 3,
            provider: 'google',
          },
        ],
      }
    },
    {
      event: 'serp_selector_completed',
      ts: '2025-01-01T00:00:15.200Z',
      payload: {
        candidates: [
          {
            url: exactUrl,
            decision: 'keep',
            score: 8.2,
            rationale: 'official spec page',
            score_components: exactScoreComponents,
          },
          {
            url: hostFallbackUrl,
            decision: 'maybe',
            score: 5.3,
            rationale: 'same-host support detail',
            score_components: hostFallbackScoreComponents,
          },
        ],
      }
    },
    {
      event: 'fetch_started',
      ts: '2025-01-01T00:00:15.300Z',
      payload: {
        worker_id: 'fetch-1',
        scope: 'url',
        url: exactUrl,
        fetch_mode: 'http',
      }
    },
  ];

  const detail = buildWorkerDetail(events, 'search-linkage');
  const attempt = detail.search_history[0];
  const exactResult = attempt.results.find((row) => row.url === exactUrl);
  const hostFallbackResult = attempt.results.find((row) => row.url === hostFallbackUrl);
  const unmatchedResult = attempt.results.find((row) => row.url === unmatchedUrl);

  assert.ok(exactResult, 'expected exact search result');
  assert.equal(exactResult.fetched, true);
  assert.equal(exactResult.fetch_worker_id, 'fetch-1');
  assert.equal(exactResult.fetch_link_type, 'exact');
  assert.equal(exactResult.decision, 'keep');
  assert.equal(exactResult.score, 8.2);
  assert.equal(exactResult.rationale, 'official spec page');
  assert.deepEqual(exactResult.score_components, exactScoreComponents);

  assert.ok(hostFallbackResult, 'expected host-fallback search result');
  assert.equal(hostFallbackResult.fetched, true);
  assert.equal(hostFallbackResult.fetch_worker_id, 'fetch-1');
  assert.equal(hostFallbackResult.fetch_link_type, 'host_fallback');
  assert.equal(hostFallbackResult.decision, 'maybe');
  assert.equal(hostFallbackResult.score, 5.3);
  assert.equal(hostFallbackResult.rationale, 'same-host support detail');
  assert.deepEqual(hostFallbackResult.score_components, hostFallbackScoreComponents);

  assert.ok(unmatchedResult, 'expected unmatched search result');
  assert.equal(unmatchedResult.fetched, false);
  assert.equal(unmatchedResult.fetch_worker_id, null);
  assert.equal(unmatchedResult.fetch_link_type, 'none');
  assert.equal(unmatchedResult.decision, 'unknown');
  assert.equal(unmatchedResult.score, 0);
  assert.equal(unmatchedResult.rationale, '');
  assert.equal(unmatchedResult.score_components, null);
});
