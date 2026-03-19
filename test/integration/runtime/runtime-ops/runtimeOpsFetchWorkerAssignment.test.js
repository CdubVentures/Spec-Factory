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

test('buildRuntimeOpsWorkers assigns fetch rows to the originating search slot and attempt number', () => {
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
  assert.equal(fetchWorker.assigned_search_worker_id, 'search-a');
  assert.equal(fetchWorker.assigned_search_query, 'razer viper v3 pro weight');
  assert.equal(fetchWorker.display_label, 'fetch-a1');
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
