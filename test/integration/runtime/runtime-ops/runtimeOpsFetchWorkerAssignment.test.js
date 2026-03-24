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
