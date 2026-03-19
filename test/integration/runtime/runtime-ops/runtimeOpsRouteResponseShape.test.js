import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeOpsWorkers,
  buildWorkerDetail
} from '../../../../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

// ── Event Factories (emitted event shapes — as consumed by builders) ────────

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
      result_count: 10,
      duration_ms: 500,
      current_query: 'razer viper specs',
      current_provider: 'google',
      ...overrides
    }
  };
}

function llmStarted(workerId, overrides = {}) {
  return {
    event: 'llm_started',
    ts: '2025-01-01T00:00:20.000Z',
    payload: {
      worker_id: workerId,
      scope: 'call',
      call_type: 'brand_resolver',
      prefetch_tab: 'brand_resolver',
      round: 1,
      model: 'gpt-4o',
      prompt_tokens: 120,
      input_summary: 'Resolve brand',
      prompt_preview: 'prompt text',
      ...overrides
    }
  };
}

function llmFinished(workerId, overrides = {}) {
  return {
    event: 'llm_finished',
    ts: '2025-01-01T00:00:22.000Z',
    payload: {
      worker_id: workerId,
      scope: 'call',
      call_type: 'brand_resolver',
      prefetch_tab: 'brand_resolver',
      round: 1,
      model: 'gpt-4o',
      prompt_tokens: 120,
      completion_tokens: 48,
      estimated_cost: 0.0042,
      duration_ms: 842,
      input_summary: 'Resolve brand',
      output_summary: 'Resolved Razer',
      prompt_preview: 'prompt text',
      response_preview: 'response text',
      ...overrides
    }
  };
}

function fetchStarted(workerId, url) {
  return {
    event: 'fetch_started',
    ts: '2025-01-01T00:01:00.000Z',
    payload: { worker_id: workerId, url }
  };
}

function fetchFinished(workerId, url) {
  return {
    event: 'fetch_finished',
    ts: '2025-01-01T00:01:05.000Z',
    payload: { worker_id: workerId, url, status_code: 200, bytes: 5000 }
  };
}

function findWorker(workers, id) {
  return workers.find((w) => w.worker_id === id);
}

// ── Test 1: Workers endpoint includes pool field ────────────────────────────

test('response shape: every worker has a pool string field', () => {
  const events = [
    searchStarted('search-a'),
    searchFinished('search-a'),
    llmStarted('llm-1'),
    llmFinished('llm-1'),
    fetchStarted('fetch-1', 'https://example.com/p'),
    fetchFinished('fetch-1', 'https://example.com/p')
  ];

  const workers = buildRuntimeOpsWorkers(events);

  assert.ok(workers.length >= 3, 'at least 3 workers');
  for (const w of workers) {
    assert.equal(typeof w.pool, 'string', `worker ${w.worker_id} has string pool`);
    assert.ok(w.pool.length > 0, `worker ${w.worker_id} pool is non-empty`);
  }
});

// ── Test 2: Search rows have search fields ──────────────────────────────────

test('response shape: search workers have slot, tasks, query, provider fields', () => {
  const events = [
    searchStarted('search-a', { slot: 'a', tasks_started: 3, current_query: 'test query', current_provider: 'google' }),
    searchFinished('search-a', { result_count: 8, duration_ms: 420 })
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'search-a');

  assert.ok(w, 'search worker exists');
  assert.ok('slot' in w, 'has slot');
  assert.ok('tasks_started' in w, 'has tasks_started');
  assert.ok('tasks_completed' in w, 'has tasks_completed');
  assert.ok('current_query' in w, 'has current_query');
  assert.ok('current_provider' in w, 'has current_provider');
});

// ── Test 3: LLM rows have LLM fields ───────────────────────────────────────

test('response shape: LLM workers have call_type, model, round, tokens, cost, prefetch_tab', () => {
  const events = [
    llmStarted('llm-1'),
    llmFinished('llm-1')
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'llm-1');

  assert.ok(w, 'LLM worker exists');
  assert.ok('call_type' in w, 'has call_type');
  assert.ok('model' in w, 'has model');
  assert.ok('round' in w, 'has round');
  assert.ok('prompt_tokens' in w, 'has prompt_tokens');
  assert.ok('completion_tokens' in w, 'has completion_tokens');
  assert.ok('estimated_cost' in w, 'has estimated_cost');
  assert.ok('prefetch_tab' in w, 'has prefetch_tab');
});

// ── Test 4: Fetch rows lack pool-specific fields ────────────────────────────

test('response shape: fetch workers do NOT have slot, call_type, search_history, llm_detail', () => {
  const events = [
    fetchStarted('fetch-1', 'https://example.com/page'),
    fetchFinished('fetch-1', 'https://example.com/page')
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'fetch-1');

  assert.ok(w, 'fetch worker exists');
  assert.equal(w.pool, 'fetch');
  assert.ok(!Object.prototype.hasOwnProperty.call(w, 'slot'), 'no slot');
  assert.ok(!Object.prototype.hasOwnProperty.call(w, 'call_type'), 'no call_type');
  assert.ok(!Object.prototype.hasOwnProperty.call(w, 'search_history'), 'no search_history');
  assert.ok(!Object.prototype.hasOwnProperty.call(w, 'llm_detail'), 'no llm_detail');
});

// ── Test 5: Worker detail endpoint pool detection ───────────────────────────

test('response shape: worker detail detects pool and returns correct shape', () => {
  const events = [
    searchStarted('search-a'),
    searchFinished('search-a'),
    llmStarted('llm-1'),
    llmFinished('llm-1'),
    fetchStarted('fetch-1', 'https://example.com/page'),
    fetchFinished('fetch-1', 'https://example.com/page')
  ];

  const searchDetail = buildWorkerDetail(events, 'search-a');
  assert.ok(Array.isArray(searchDetail.search_history), 'search detail has search_history');

  const llmDetail = buildWorkerDetail(events, 'llm-1');
  assert.ok(llmDetail.llm_detail && typeof llmDetail.llm_detail === 'object', 'llm detail has llm_detail');

  const fetchDetail = buildWorkerDetail(events, 'fetch-1');
  assert.ok(Array.isArray(fetchDetail.documents), 'fetch detail has documents');
  assert.ok(fetchDetail.documents.length > 0, 'fetch documents non-empty');
});

// ── Test 6: search_history attempt shape ────────────────────────────────────

test('response shape: search_history entries have all required fields', () => {
  const events = [
    searchStarted('search-a', { current_query: 'test', current_provider: 'google' }),
    searchFinished('search-a', { result_count: 8, duration_ms: 420 })
  ];

  const detail = buildWorkerDetail(events, 'search-a');

  assert.equal(detail.search_history.length, 1, 'one attempt');
  const attempt = detail.search_history[0];

  assert.equal(typeof attempt.attempt_no, 'number', 'attempt_no is number');
  assert.equal(typeof attempt.query, 'string', 'query is string');
  assert.equal(typeof attempt.provider, 'string', 'provider is string');
  assert.equal(typeof attempt.status, 'string', 'status is string');
  assert.equal(typeof attempt.result_count, 'number', 'result_count is number');
  assert.equal(typeof attempt.duration_ms, 'number', 'duration_ms is number');
  assert.ok('started_ts' in attempt, 'has started_ts');
  assert.ok('finished_ts' in attempt, 'has finished_ts');
});

// ── Test 7: llm_detail shape ────────────────────────────────────────────────

test('response shape: llm_detail has all required fields', () => {
  const events = [
    llmStarted('llm-1', { prompt_preview: 'prompt text' }),
    llmFinished('llm-1', { response_preview: 'response text' })
  ];

  const detail = buildWorkerDetail(events, 'llm-1');
  const d = detail.llm_detail;

  assert.ok(d, 'llm_detail exists');
  assert.ok('call_type' in d, 'has call_type');
  assert.ok('round' in d, 'has round');
  assert.ok('model' in d, 'has model');
  assert.ok('prompt_tokens' in d, 'has prompt_tokens');
  assert.ok('completion_tokens' in d, 'has completion_tokens');
  assert.ok('estimated_cost' in d, 'has estimated_cost');
  assert.ok('duration_ms' in d, 'has duration_ms');
  assert.ok('input_summary' in d, 'has input_summary');
  assert.ok('output_summary' in d, 'has output_summary');
  assert.ok('prefetch_tab' in d, 'has prefetch_tab');
  assert.ok('prompt_preview' in d, 'has prompt_preview');
  assert.ok('response_preview' in d, 'has response_preview');
});
