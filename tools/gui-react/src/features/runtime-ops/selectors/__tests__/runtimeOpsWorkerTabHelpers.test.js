import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkerButtonLabel,
  buildWorkerButtonSubtitle,
  sortWorkersForTabs,
} from '../workerTabHelpers.js';

test('buildWorkerButtonLabel prefers fetch assignment labels and keeps search slots human-readable', () => {
  assert.equal(
    buildWorkerButtonLabel({
      worker_id: 'fetch-11',
      pool: 'fetch',
      display_label: 'fetch-a1',
    }),
    'fetch-a1',
  );

  assert.equal(
    buildWorkerButtonLabel({
      worker_id: 'search-c',
      pool: 'search',
      slot: 'c',
    }),
    'Slot C',
  );
});

test('buildWorkerButtonSubtitle keeps the canonical fetch id visible when an assignment label is shown', () => {
  assert.equal(
    buildWorkerButtonSubtitle({
      worker_id: 'fetch-11',
      pool: 'fetch',
      display_label: 'fetch-a1',
      current_url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
    }),
    'fetch-11 · razer.com',
  );
});

test('buildWorkerButtonSubtitle keeps canonical worker ids visible for humanized search and llm labels', () => {
  assert.equal(
    buildWorkerButtonSubtitle({
      worker_id: 'search-c',
      pool: 'search',
      slot: 'c',
      current_query: 'razer viper v3 pro weight',
    }),
    'razer viper v3 pro weight',
  );

  assert.equal(
    buildWorkerButtonSubtitle({
      worker_id: 'llm-br-1',
      pool: 'llm',
      call_type: 'brand_resolver',
      model: 'gpt-4o-mini',
    }),
    'llm-br-1 · gpt-4o-mini',
  );
});

test('sortWorkersForTabs keeps search slots ordered a..z and fetch rows grouped by slot then SERP rank', () => {
  const ordered = sortWorkersForTabs([
    { worker_id: 'search-c', pool: 'search', slot: 'c', state: 'idle', elapsed_ms: 1 },
    { worker_id: 'fetch-3', pool: 'fetch', assigned_search_slot: 'b', assigned_result_rank: 2, state: 'idle', elapsed_ms: 1 },
    { worker_id: 'fetch-1', pool: 'fetch', assigned_search_slot: 'a', assigned_result_rank: 1, state: 'running', elapsed_ms: 99 },
    { worker_id: 'search-a', pool: 'search', slot: 'a', state: 'running', elapsed_ms: 99 },
    { worker_id: 'search-b', pool: 'search', slot: 'b', state: 'stuck', elapsed_ms: 50 },
    { worker_id: 'fetch-9', pool: 'fetch', assigned_search_slot: null, assigned_result_rank: null, state: 'running', elapsed_ms: 100 },
    { worker_id: 'fetch-2', pool: 'fetch', assigned_search_slot: 'a', assigned_result_rank: 3, state: 'idle', elapsed_ms: 1 },
  ]);

  assert.deepEqual(
    ordered.map((worker) => worker.worker_id),
    ['search-a', 'search-b', 'search-c', 'fetch-1', 'fetch-2', 'fetch-3', 'fetch-9'],
  );
});

test('sortWorkersForTabs sorts unassigned fetch workers numerically not lexicographically', () => {
  const ordered = sortWorkersForTabs([
    { worker_id: 'fetch-10', pool: 'fetch', assigned_search_slot: null, assigned_result_rank: null, state: 'idle', elapsed_ms: 0 },
    { worker_id: 'fetch-2', pool: 'fetch', assigned_search_slot: null, assigned_result_rank: null, state: 'idle', elapsed_ms: 0 },
    { worker_id: 'fetch-1', pool: 'fetch', assigned_search_slot: null, assigned_result_rank: null, state: 'idle', elapsed_ms: 0 },
    { worker_id: 'fetch-20', pool: 'fetch', assigned_search_slot: null, assigned_result_rank: null, state: 'idle', elapsed_ms: 0 },
  ]);

  assert.deepEqual(
    ordered.map((w) => w.worker_id),
    ['fetch-1', 'fetch-2', 'fetch-10', 'fetch-20'],
  );
});
