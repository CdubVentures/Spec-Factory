import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeOpsWorkers,
  buildWorkerDetail
} from '../../../../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function llmStarted(workerId, overrides = {}) {
  return {
    event: 'llm_started',
    ts: '2025-01-01T00:00:10.000Z',
    payload: {
      worker_id: workerId,
      scope: 'call',
      call_type: 'brand_resolver',
      prefetch_tab: 'brand_resolver',
      round: 1,
      model: 'gpt-4o',
      provider: 'openai',
      prompt_tokens: 120,
      completion_tokens: null,
      estimated_cost: null,
      duration_ms: null,
      input_summary: 'Resolve brand for test',
      output_summary: null,
      ...overrides
    }
  };
}

function llmFinished(workerId, overrides = {}) {
  return {
    event: 'llm_finished',
    ts: '2025-01-01T00:00:12.000Z',
    payload: {
      worker_id: workerId,
      scope: 'call',
      call_type: 'brand_resolver',
      prefetch_tab: 'brand_resolver',
      round: 1,
      model: 'gpt-4o',
      provider: 'openai',
      prompt_tokens: 120,
      completion_tokens: 48,
      estimated_cost: 0.0042,
      duration_ms: 842,
      input_summary: 'Resolve brand for test',
      output_summary: 'Resolved Razer',
      ...overrides
    }
  };
}

function findWorker(workers, id) {
  return workers.find((w) => w.worker_id === id);
}

// ── Test 1: LLM worker row includes call-level fields ───────────────────────

test('buildRuntimeOpsWorkers: llm worker row includes call_type, model, tokens, cost', () => {
  const events = [
    llmStarted('llm-br-1'),
    llmFinished('llm-br-1')
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'llm-br-1');

  assert.ok(w, 'llm worker should exist');
  assert.equal(w.pool, 'llm');
  assert.equal(w.call_type, 'brand_resolver');
  assert.equal(w.model, 'gpt-4o');
  assert.equal(w.round, 1);
  assert.equal(w.prompt_tokens, 120);
  assert.equal(w.completion_tokens, 48);
  assert.equal(w.estimated_cost, 0.0042);
  assert.equal(w.duration_ms, 842);
  assert.equal(w.prefetch_tab, 'brand_resolver');
});

// ── Test 2: LLM worker detail returns llm_detail ────────────────────────────

test('buildWorkerDetail: llm worker returns llm_detail', () => {
  const events = [
    llmStarted('llm-br-1', { input_summary: 'Resolve brand', prompt_preview: 'prompt...' }),
    llmFinished('llm-br-1', {
      output_summary: 'Resolved Sony',
      response_preview: 'response...',
      prompt_tokens: 1840,
      completion_tokens: 312,
      estimated_cost: 0.00312,
      duration_ms: 1820
    })
  ];

  const detail = buildWorkerDetail(events, 'llm-br-1');

  assert.ok(detail.llm_detail, 'llm_detail should exist');
  assert.equal(detail.llm_detail.call_type, 'brand_resolver');
  assert.equal(detail.llm_detail.model, 'gpt-4o');
  assert.equal(detail.llm_detail.round, 1);
  assert.equal(detail.llm_detail.prompt_tokens, 1840);
  assert.equal(detail.llm_detail.completion_tokens, 312);
  assert.equal(detail.llm_detail.estimated_cost, 0.00312);
  assert.equal(detail.llm_detail.duration_ms, 1820);
  assert.equal(detail.llm_detail.input_summary, 'Resolve brand');
  assert.equal(detail.llm_detail.output_summary, 'Resolved Sony');
  assert.equal(detail.llm_detail.prefetch_tab, 'brand_resolver');
  assert.equal(detail.llm_detail.prompt_preview, 'prompt...');
  assert.equal(detail.llm_detail.response_preview, 'response...');
});

// ── Test 3: LLM worker with null tokens — fields are null, no crash ─────────

test('buildRuntimeOpsWorkers: llm worker with null tokens still valid', () => {
  const events = [
    llmStarted('llm-sp-1', {
      call_type: 'search_planner',
      model: 'claude-sonnet',
      prompt_tokens: null,
      completion_tokens: null,
      estimated_cost: null,
      duration_ms: null
    }),
    llmFinished('llm-sp-1', {
      call_type: 'search_planner',
      model: 'claude-sonnet',
      prompt_tokens: null,
      completion_tokens: null,
      estimated_cost: null,
      duration_ms: null
    })
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'llm-sp-1');

  assert.ok(w, 'worker should exist');
  assert.equal(w.call_type, 'search_planner');
  assert.equal(w.prompt_tokens, null);
  assert.equal(w.completion_tokens, null);
  assert.equal(w.estimated_cost, null);
});

// ── Test 4: Fetch worker detail is unchanged ────────────────────────────────

test('buildWorkerDetail: fetch worker returns documents, not llm_detail or search_history', () => {
  const events = [
    {
      event: 'fetch_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: { worker_id: 'fetch-url-1', url: 'https://example.com' }
    },
    {
      event: 'fetch_finished',
      ts: '2025-01-01T00:00:15.000Z',
      payload: { worker_id: 'fetch-url-1', url: 'https://example.com', status_code: 200 }
    }
  ];

  const detail = buildWorkerDetail(events, 'fetch-url-1');

  assert.ok(Array.isArray(detail.documents), 'documents should be an array');
  assert.equal(detail.documents.length, 1, 'should have one document');
  assert.equal(detail.llm_detail, undefined, 'no llm_detail for fetch workers');
  assert.equal(detail.search_history, undefined, 'no search_history for fetch workers');
});

// ── Test 5: LLM worker detail has empty documents/screenshots ───────────────

test('buildWorkerDetail: llm worker has empty documents and screenshots', () => {
  const events = [
    llmStarted('llm-ext-1', { call_type: 'extraction' }),
    llmFinished('llm-ext-1', { call_type: 'extraction' })
  ];

  const detail = buildWorkerDetail(events, 'llm-ext-1');

  assert.ok(detail.llm_detail, 'llm_detail should exist');
  assert.deepEqual(detail.documents, [], 'documents should be empty for llm workers');
  assert.deepEqual(detail.screenshots, [], 'screenshots should be empty for llm workers');
});

// ── Test 6: Search worker detail has empty documents/screenshots ────────────

test('buildWorkerDetail: search worker has empty documents and screenshots', () => {
  const events = [
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: { worker_id: 'search-a', scope: 'query', slot: 'a', tasks_started: 1, current_query: 'q1', current_provider: 'google' }
    },
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:15.000Z',
      payload: { worker_id: 'search-a', scope: 'query', slot: 'a', tasks_started: 1, current_query: 'q1', current_provider: 'google', result_count: 5, duration_ms: 200 }
    }
  ];

  const detail = buildWorkerDetail(events, 'search-a');

  assert.ok(Array.isArray(detail.search_history), 'search_history should exist');
  assert.deepEqual(detail.documents, [], 'documents should be empty for search workers');
  assert.deepEqual(detail.screenshots, [], 'screenshots should be empty for search workers');
});
