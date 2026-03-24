import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeOpsWorkers } from '../../../../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

function makeEvent(event, payload, ts) {
  return {
    event,
    ts,
    payload,
  };
}

function findWorker(workers, workerId) {
  return workers.find((worker) => worker.worker_id === workerId);
}

test('buildRuntimeOpsWorkers assigns fetch rows to the originating search slot with SERP rank', () => {
  const events = [
    makeEvent('search_started', {
      worker_id: 'search-a',
      scope: 'query',
      slot: 'a',
      tasks_started: 1,
      query: 'razer viper v3 pro weight',
      provider: 'google',
    }, '2026-03-01T00:00:01.000Z'),
    makeEvent('search_finished', {
      worker_id: 'search-a',
      scope: 'query',
      slot: 'a',
      tasks_started: 1,
      query: 'razer viper v3 pro weight',
      provider: 'google',
      result_count: 4,
      duration_ms: 420,
    }, '2026-03-01T00:00:02.000Z'),
    makeEvent('search_results_collected', {
      scope: 'query',
      query: 'razer viper v3 pro weight',
      provider: 'google',
      results: [
        {
          url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
          title: 'Razer Viper V3 Pro specs',
          domain: 'razer.com',
          rank: 1,
        },
      ],
    }, '2026-03-01T00:00:02.100Z'),
    makeEvent('fetch_started', {
      worker_id: 'fetch-1',
      scope: 'url',
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      fetch_mode: 'http',
    }, '2026-03-01T00:00:03.000Z'),
  ];

  const workers = buildRuntimeOpsWorkers(events, { nowMs: Date.parse('2026-03-01T00:00:03.500Z') });
  const fetchWorker = findWorker(workers, 'fetch-1');

  assert.ok(fetchWorker, 'expected fetch worker row');
  assert.equal(fetchWorker.worker_id, 'fetch-1', 'canonical worker id stays unchanged');
  assert.equal(fetchWorker.assigned_search_slot, 'a');
  assert.equal(fetchWorker.assigned_search_attempt_no, 1);
  assert.equal(fetchWorker.assigned_result_rank, 1, 'SERP rank carried through');
  assert.equal(fetchWorker.assigned_search_worker_id, 'search-a');
  assert.equal(fetchWorker.assigned_search_query, 'razer viper v3 pro weight');
  assert.equal(fetchWorker.display_label, 'fetch-a1');
});

test('display label uses SERP rank — skips dropped results', () => {
  // Slot a: 9 results, only ranks 1, 2, 3, 8 kept (4-7, 9 dropped)
  const events = [
    makeEvent('search_started', {
      worker_id: 'search-a', scope: 'query', slot: 'a',
      tasks_started: 1, query: 'corsair m55', provider: 'google',
    }, '2026-03-01T00:00:01.000Z'),
    makeEvent('search_results_collected', {
      scope: 'query', query: 'corsair m55', provider: 'google',
      results: [
        { url: 'https://corsair.com/m55', rank: 1 },
        { url: 'https://funkykit.com/corsair-m55', rank: 2 },
        { url: 'https://amazon.com/corsair-m55', rank: 3 },
        // ranks 4-7 dropped (not fetched)
        { url: 'https://gzhls.at/corsair-m55.pdf', rank: 8 },
        // rank 9 dropped
      ],
    }, '2026-03-01T00:00:02.000Z'),
    makeEvent('fetch_started', { worker_id: 'fetch-1', scope: 'url', url: 'https://corsair.com/m55' }, '2026-03-01T00:00:03.000Z'),
    makeEvent('fetch_started', { worker_id: 'fetch-2', scope: 'url', url: 'https://funkykit.com/corsair-m55' }, '2026-03-01T00:00:03.100Z'),
    makeEvent('fetch_started', { worker_id: 'fetch-3', scope: 'url', url: 'https://amazon.com/corsair-m55' }, '2026-03-01T00:00:03.200Z'),
    makeEvent('fetch_started', { worker_id: 'fetch-4', scope: 'url', url: 'https://gzhls.at/corsair-m55.pdf' }, '2026-03-01T00:00:03.300Z'),
  ];

  const workers = buildRuntimeOpsWorkers(events, { nowMs: Date.parse('2026-03-01T00:00:04.000Z') });

  assert.equal(findWorker(workers, 'fetch-1').display_label, 'fetch-a1');
  assert.equal(findWorker(workers, 'fetch-1').assigned_result_rank, 1);
  assert.equal(findWorker(workers, 'fetch-2').display_label, 'fetch-a2');
  assert.equal(findWorker(workers, 'fetch-2').assigned_result_rank, 2);
  assert.equal(findWorker(workers, 'fetch-3').display_label, 'fetch-a3');
  assert.equal(findWorker(workers, 'fetch-3').assigned_result_rank, 3);
  assert.equal(findWorker(workers, 'fetch-4').display_label, 'fetch-a8');
  assert.equal(findWorker(workers, 'fetch-4').assigned_result_rank, 8);
});

test('host-level fallback assigns brand workers when URL differs from search result URL', () => {
  // Brand seed URL differs from search result URL (www prefix, different path)
  // but same host — should fall back to host matching
  const events = [
    makeEvent('search_started', {
      worker_id: 'search-a', scope: 'query', slot: 'a',
      tasks_started: 1, query: 'corsair m55 specs', provider: 'google',
    }, '2026-03-01T00:00:01.000Z'),
    makeEvent('search_results_collected', {
      scope: 'query', query: 'corsair m55 specs', provider: 'google',
      results: [
        { url: 'https://corsair.com/m55-lightweight', rank: 1, domain: 'corsair.com' },
        { url: 'https://corsair.com/m55-rgb-pro', rank: 4, domain: 'corsair.com' },
        { url: 'https://funkykit.com/corsair-m55-review', rank: 2, domain: 'funkykit.com' },
      ],
    }, '2026-03-01T00:00:02.000Z'),
    // Brand worker fetches a DIFFERENT corsair URL (brand seed, not search result)
    makeEvent('fetch_queued', {
      worker_id: 'fetch-1', scope: 'url',
      url: 'https://www.corsair.com/us/en/p/gaming-mice/m55',
    }, '2026-03-01T00:00:02.500Z'),
    makeEvent('fetch_started', {
      worker_id: 'fetch-1', scope: 'url',
      url: 'https://www.corsair.com/us/en/p/gaming-mice/m55',
    }, '2026-03-01T00:00:03.000Z'),
    // funkykit exact match still works
    makeEvent('fetch_started', {
      worker_id: 'fetch-2', scope: 'url',
      url: 'https://funkykit.com/corsair-m55-review',
    }, '2026-03-01T00:00:03.100Z'),
  ];

  const workers = buildRuntimeOpsWorkers(events, { nowMs: Date.parse('2026-03-01T00:00:04.000Z') });

  // Host fallback: corsair.com worker gets lowest-ranked corsair.com result (rank 1)
  const brand = findWorker(workers, 'fetch-1');
  assert.equal(brand.assigned_search_slot, 'a', 'host fallback assigns slot');
  assert.equal(brand.assigned_result_rank, 1, 'host fallback picks lowest rank on host');
  assert.equal(brand.display_label, 'fetch-a1');

  // Exact match still preferred
  const funky = findWorker(workers, 'fetch-2');
  assert.equal(funky.assigned_search_slot, 'a');
  assert.equal(funky.assigned_result_rank, 2);
  assert.equal(funky.display_label, 'fetch-a2');
});

test('host fallback consumes assignments so multiple workers on same host get distinct ranks', () => {
  const events = [
    makeEvent('search_started', {
      worker_id: 'search-a', scope: 'query', slot: 'a',
      tasks_started: 1, query: 'corsair m55', provider: 'google',
    }, '2026-03-01T00:00:01.000Z'),
    makeEvent('search_results_collected', {
      scope: 'query', query: 'corsair m55', provider: 'google',
      results: [
        { url: 'https://corsair.com/m55-page-a', rank: 1, domain: 'corsair.com' },
        { url: 'https://corsair.com/m55-page-b', rank: 5, domain: 'corsair.com' },
      ],
    }, '2026-03-01T00:00:02.000Z'),
    // Two different brand workers on corsair.com — neither URL matches search results
    makeEvent('fetch_started', {
      worker_id: 'fetch-1', scope: 'url',
      url: 'https://www.corsair.com/us/en/p/m55-variant-1',
    }, '2026-03-01T00:00:03.000Z'),
    makeEvent('fetch_started', {
      worker_id: 'fetch-2', scope: 'url',
      url: 'https://www.corsair.com/us/en/p/m55-variant-2',
    }, '2026-03-01T00:00:03.100Z'),
  ];

  const workers = buildRuntimeOpsWorkers(events, { nowMs: Date.parse('2026-03-01T00:00:04.000Z') });

  const w1 = findWorker(workers, 'fetch-1');
  const w2 = findWorker(workers, 'fetch-2');
  assert.equal(w1.display_label, 'fetch-a1');
  assert.equal(w1.assigned_result_rank, 1);
  assert.equal(w2.display_label, 'fetch-a5');
  assert.equal(w2.assigned_result_rank, 5);
});

test('buildRuntimeOpsWorkers leaves direct fetch rows on canonical labels when no search assignment exists', () => {
  const events = [
    makeEvent('fetch_started', {
      worker_id: 'fetch-9',
      scope: 'url',
      url: 'https://downloads.example.com/manual.pdf',
      fetch_mode: 'http',
    }, '2026-03-01T00:00:03.000Z'),
  ];

  const workers = buildRuntimeOpsWorkers(events, { nowMs: Date.parse('2026-03-01T00:00:03.500Z') });
  const fetchWorker = findWorker(workers, 'fetch-9');

  assert.ok(fetchWorker, 'expected fetch worker row');
  assert.equal(fetchWorker.assigned_search_slot, null);
  assert.equal(fetchWorker.assigned_search_attempt_no, null);
  assert.equal(fetchWorker.display_label, 'fetch-9');
});
