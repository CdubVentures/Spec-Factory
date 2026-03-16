import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorkerButtonLabel,
  buildWorkerButtonSubtitle,
  sortWorkersForTabs,
} from '../tools/gui-react/src/features/runtime-ops/selectors/workerTabHelpers.js';

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
    'slot c',
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
    'search-c · razer viper v3 pro weight',
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

test('sortWorkersForTabs keeps search slots ordered a..z and fetch rows grouped by assigned search slot/attempt', () => {
  const ordered = sortWorkersForTabs([
    { worker_id: 'search-c', pool: 'search', slot: 'c', state: 'idle', elapsed_ms: 1 },
    { worker_id: 'fetch-3', pool: 'fetch', assigned_search_slot: 'b', assigned_search_attempt_no: 2, state: 'idle', elapsed_ms: 1 },
    { worker_id: 'fetch-1', pool: 'fetch', assigned_search_slot: 'a', assigned_search_attempt_no: 1, state: 'running', elapsed_ms: 99 },
    { worker_id: 'search-a', pool: 'search', slot: 'a', state: 'running', elapsed_ms: 99 },
    { worker_id: 'search-b', pool: 'search', slot: 'b', state: 'stuck', elapsed_ms: 50 },
    { worker_id: 'fetch-9', pool: 'fetch', assigned_search_slot: null, assigned_search_attempt_no: null, state: 'running', elapsed_ms: 100 },
    { worker_id: 'fetch-2', pool: 'fetch', assigned_search_slot: 'a', assigned_search_attempt_no: 2, state: 'idle', elapsed_ms: 1 },
  ]);

  assert.deepEqual(
    ordered.map((worker) => worker.worker_id),
    ['search-a', 'search-b', 'search-c', 'fetch-1', 'fetch-2', 'fetch-3', 'fetch-9'],
  );
});
