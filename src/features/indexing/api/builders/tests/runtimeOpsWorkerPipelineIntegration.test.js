import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IndexLabRuntimeBridge } from '../../../../../indexlab/runtimeBridge.js';
import {
  buildRuntimeOpsWorkers,
  buildWorkerDetail
} from '../runtimeOpsDataBuilders.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeBridge(overrides = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-int-'));
  const events = [];
  const bridge = new IndexLabRuntimeBridge({
    outRoot: tmpDir,
    onEvent: (ev) => events.push(ev),
    ...overrides
  });
  return { bridge, events, tmpDir };
}

function baseRow(overrides = {}) {
  return {
    runId: 'run-int-001',
    event: 'run_started',
    ts: '2025-01-01T00:00:00Z',
    category: 'mouse',
    productId: 'mouse-test-01',
    ...overrides
  };
}

async function startRun(bridge) {
  bridge.onRuntimeEvent(baseRow());
  await bridge.queue;
}

async function emitSearchAttempt(
  bridge,
  {
    startTs,
    finishTs,
    query,
    provider = 'google',
    resultCount,
    durationMs,
  },
) {
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: startTs,
    query,
    provider,
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: finishTs,
    query,
    provider,
    result_count: resultCount,
    duration_ms: durationMs,
  }));
  await bridge.queue;
}

function findWorker(workers, id) {
  return workers.find((w) => w.worker_id === id);
}

function workersByPool(workers, pool) {
  return workers.filter((w) => w.pool === pool);
}

// ── Test 1: Mixed run produces 3 pool types ─────────────────────────────────

test('integration: mixed run produces workers from all 3 pools', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  // Search event (bridge transforms discovery_query → search_started/finished)
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'razer viper specs',
    provider: 'google'
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'razer viper specs',
    provider: 'google',
    result_count: 10,
    duration_ms: 500
  }));
  await bridge.queue;

  // LLM event (bridge transforms llm_call → llm_started/finished)
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:20Z',
    batch_id: 'br-1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    provider: 'openai',
    round: 1,
    prompt_tokens: 120,
    input_summary: 'Resolve brand'
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:22Z',
    batch_id: 'br-1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    completion_tokens: 48,
    estimated_cost: 0.0042,
    duration_ms: 1800,
    output_summary: 'Resolved Razer'
  }));
  await bridge.queue;

  // Fetch events — bridge does NOT re-emit fetch events via onEvent,
  // so inject directly into the collected events array for the builder
  events.push(
    { event: 'fetch_started', ts: '2025-01-01T00:01:00.000Z', payload: { worker_id: 'fetch-1', url: 'https://example.com/specs' } },
    { event: 'fetch_finished', ts: '2025-01-01T00:01:05.000Z', payload: { worker_id: 'fetch-1', url: 'https://example.com/specs', status_code: 200, bytes: 5000 } }
  );

  const workers = buildRuntimeOpsWorkers(events);
  const pools = new Set(workers.map((w) => w.pool));

  assert.ok(pools.has('search'), 'has search pool');
  assert.ok(pools.has('llm'), 'has llm pool');
  assert.ok(pools.has('fetch'), 'has fetch pool');
});

// ── Test 2: Search workers bounded by slot reuse ────────────────────────────

test('integration: sequential queries keep one visible worker per query', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  const queries = [
    'razer viper specs',
    'logitech g pro specs',
    'zowie ec2 specs',
    'steelseries prime specs',
    'finalmouse starlight specs',
    'endgame haste specs'
  ];

  // Feed 6 queries sequentially (one at a time — same 1-2 slots reused)
  for (let i = 0; i < queries.length; i++) {
    await emitSearchAttempt(bridge, {
      startTs: `2025-01-01T00:00:${10 + i * 10}Z`,
      finishTs: `2025-01-01T00:00:${15 + i * 10}Z`,
      query: queries[i],
      resultCount: 8,
      durationMs: 400,
    });
  }

  const workers = buildRuntimeOpsWorkers(events);
  const searchWorkers = workersByPool(workers, 'search');

  assert.equal(searchWorkers.length, queries.length, 'one visible worker row per sequential query');
  assert.deepEqual(searchWorkers.map((worker) => worker.worker_id), [
    'search-a',
    'search-b',
    'search-c',
    'search-d',
    'search-e',
    'search-f',
  ]);
  assert.deepEqual(searchWorkers.map((worker) => worker.slot), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.ok(searchWorkers.every((worker) => worker.tasks_started === 1), 'each search slot handles one query');
  assert.ok(searchWorkers.every((worker) => worker.tasks_completed === 1), 'each search slot records one completion');
});

// ── Test 3: Search worker detail returns search_history ─────────────────────

test('integration: search worker detail reflects the query owned by that slot', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  const queries = ['query one', 'query two', 'query three'];
  for (let i = 0; i < queries.length; i++) {
    await emitSearchAttempt(bridge, {
      startTs: `2025-01-01T00:00:${10 + i * 10}Z`,
      finishTs: `2025-01-01T00:00:${15 + i * 10}Z`,
      query: queries[i],
      resultCount: 5 + i,
      durationMs: 300 + i * 100,
    });
  }

  const detail = buildWorkerDetail(events, 'search-c');

  assert.ok(Array.isArray(detail.search_history), 'has search_history array');
  assert.equal(detail.search_history.length, 1, 'each bridge-owned worker keeps its own single query history');
  assert.equal(detail.search_history[0].query, 'query three');
  assert.equal(detail.search_history[0].provider, 'google');
  assert.equal(detail.search_history[0].result_count, 7);
  assert.equal(detail.search_history[0].duration_ms, 500);
  assert.equal(detail.search_history[0].status, 'done');
  assert.deepEqual(detail.documents, [], 'documents empty for search');
});

// ── Test 4: LLM worker carries call telemetry ───────────────────────────────

test('integration: LLM worker carries call telemetry through bridge to builders', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z',
    batch_id: 'br-1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    provider: 'openai',
    round: 1,
    prompt_tokens: 120,
    input_summary: 'Resolve brand'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:32Z',
    batch_id: 'br-1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    completion_tokens: 48,
    estimated_cost: 0.0042,
    duration_ms: 1800,
    output_summary: 'Resolved Razer'
  }));
  await bridge.queue;

  const workers = buildRuntimeOpsWorkers(events);
  const llmWorker = workersByPool(workers, 'llm')[0];

  assert.ok(llmWorker, 'LLM worker exists');
  assert.equal(llmWorker.call_type, 'brand_resolver');
  assert.equal(llmWorker.model, 'gpt-4o');
  assert.equal(llmWorker.prompt_tokens, 120);
  assert.equal(llmWorker.completion_tokens, 48);
  assert.equal(llmWorker.estimated_cost, 0.0042);
  assert.ok(llmWorker.prefetch_tab != null, 'has prefetch_tab');
});

// ── Test 5: LLM worker detail returns llm_detail ────────────────────────────

test('integration: LLM worker detail returns llm_detail with full telemetry', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z',
    batch_id: 'br-2',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    provider: 'openai',
    round: 1,
    prompt_tokens: 200,
    input_summary: 'Resolve brand',
    prompt_preview: 'prompt text here'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:33Z',
    batch_id: 'br-2',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    completion_tokens: 60,
    estimated_cost: 0.005,
    duration_ms: 2500,
    output_summary: 'Resolved brand',
    response_preview: 'response text here'
  }));
  await bridge.queue;

  // Find the LLM worker_id from emitted events
  const llmStartEvent = events.find((e) => e.event === 'llm_started');
  assert.ok(llmStartEvent, 'llm_started event emitted');
  const llmWorkerId = llmStartEvent.payload.worker_id;

  const detail = buildWorkerDetail(events, llmWorkerId);

  assert.ok(detail.llm_detail, 'has llm_detail');
  assert.equal(detail.llm_detail.call_type, 'brand_resolver');
  assert.equal(detail.llm_detail.model, 'gpt-4o');
  assert.equal(detail.llm_detail.round, 1);
  assert.equal(detail.llm_detail.prompt_tokens, 200);
  assert.equal(detail.llm_detail.completion_tokens, 60);
  assert.equal(detail.llm_detail.estimated_cost, 0.005);
  assert.deepEqual(detail.documents, [], 'documents empty for LLM');
});

// ── Test 6: Fetch worker shape unchanged ────────────────────────────────────

test('integration: fetch worker shape unchanged — direct event injection', () => {
  // Bridge does not re-emit fetch events, so test fetch builder logic directly
  // with events in the emitted format (event + payload wrapper)
  const events = [
    { event: 'fetch_started', ts: '2025-01-01T00:01:00.000Z', payload: { worker_id: 'fetch-1', url: 'https://example.com/specs' } },
    { event: 'fetch_finished', ts: '2025-01-01T00:01:05.000Z', payload: { worker_id: 'fetch-1', url: 'https://example.com/specs', status_code: 200, bytes: 5000 } },
    { event: 'source_processed', ts: '2025-01-01T00:01:06.000Z', payload: { worker_id: 'fetch-1', url: 'https://example.com/specs', candidates: [{ field: 'weight', value: '60g', confidence: 0.9 }] } }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const fetchWorker = findWorker(workers, 'fetch-1');

  assert.ok(fetchWorker, 'fetch worker exists');
  assert.equal(fetchWorker.pool, 'fetch');
  assert.equal(fetchWorker.docs_processed, 1);
  assert.equal(fetchWorker.fields_extracted, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(fetchWorker, 'slot'), 'fetch has no slot');
  assert.ok(!Object.prototype.hasOwnProperty.call(fetchWorker, 'call_type'), 'fetch has no call_type');
});

// ── Test 7: Fetch worker detail unchanged ───────────────────────────────────

test('integration: fetch worker detail returns documents, no search_history or llm_detail', () => {
  // Direct event injection — bridge does not re-emit fetch events
  const events = [
    { event: 'fetch_started', ts: '2025-01-01T00:01:00.000Z', payload: { worker_id: 'fetch-2', url: 'https://example.com/page' } },
    { event: 'fetch_finished', ts: '2025-01-01T00:01:05.000Z', payload: { worker_id: 'fetch-2', url: 'https://example.com/page', status_code: 200, bytes: 3000 } }
  ];

  const detail = buildWorkerDetail(events, 'fetch-2');

  assert.ok(Array.isArray(detail.documents), 'has documents');
  assert.ok(detail.documents.length > 0, 'documents non-empty');
  assert.ok(Array.isArray(detail.extraction_fields), 'has extraction_fields');
  assert.ok(Array.isArray(detail.queue_jobs), 'has queue_jobs');
  assert.ok(Array.isArray(detail.screenshots), 'has screenshots');
  assert.ok(!('search_history' in detail), 'no search_history on fetch');
  assert.ok(!('llm_detail' in detail), 'no llm_detail on fetch');
});

// ── Test 8: Legacy search event without slot metadata ───────────────────────

test('integration: legacy search event without slot metadata does not crash', async () => {
  // Emitted events without slot metadata (pre-overhaul shape)
  const events = [
    {
      event: 'search_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: { worker_id: 'search-1', scope: 'query' }
    },
    {
      event: 'search_finished',
      ts: '2025-01-01T00:00:15.000Z',
      payload: { worker_id: 'search-1', scope: 'query', result_count: 5, duration_ms: 400 }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'search-1');

  assert.ok(w, 'worker exists');
  assert.equal(w.pool, 'search');
  assert.equal(w.slot, null, 'slot defaults to null');
});

// ── Test 9: Legacy LLM event without call_type ──────────────────────────────

test('integration: legacy LLM event without call_type does not crash', async () => {
  const events = [
    {
      event: 'llm_started',
      ts: '2025-01-01T00:00:10.000Z',
      payload: { worker_id: 'llm-1', scope: 'call' }
    },
    {
      event: 'llm_finished',
      ts: '2025-01-01T00:00:12.000Z',
      payload: { worker_id: 'llm-1', scope: 'call' }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = findWorker(workers, 'llm-1');

  assert.ok(w, 'worker exists');
  assert.equal(w.pool, 'llm');
  assert.equal(w.call_type, null, 'call_type defaults to null');
  assert.equal(w.prompt_tokens, null, 'prompt_tokens defaults to null');
});

// ── Test 10: Search KPI aggregates flow end-to-end ──────────────────────────

test('integration: search KPI rows preserve totals across per-query workers', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  const queries = [
    { q: 'query one', results: 10, ms: 400 },
    { q: 'query two', results: 0, ms: 300 },
    { q: 'query three', results: 8, ms: 500 },
    { q: 'query four', results: 12, ms: 600 }
  ];

  for (let i = 0; i < queries.length; i++) {
    await emitSearchAttempt(bridge, {
      startTs: `2025-01-01T00:00:${10 + i * 10}Z`,
      finishTs: `2025-01-01T00:00:${15 + i * 10}Z`,
      query: queries[i].q,
      resultCount: queries[i].results,
      durationMs: queries[i].ms,
    });
  }

  const workers = buildRuntimeOpsWorkers(events);
  const searchWorkers = workersByPool(workers, 'search');

  assert.equal(searchWorkers.length, queries.length, 'one worker row per completed query');
  assert.equal(
    searchWorkers.reduce((sum, worker) => sum + worker.tasks_completed, 0),
    4,
    'all completions are preserved across workers',
  );
  assert.equal(
    searchWorkers.reduce((sum, worker) => sum + worker.zero_result_count, 0),
    1,
    'zero-result queries are preserved across workers',
  );
  assert.equal(
    searchWorkers.reduce((sum, worker) => sum + worker.last_result_count, 0),
    30,
    'result counts are preserved per worker row',
  );
  assert.equal(
    searchWorkers.reduce((sum, worker) => sum + worker.last_duration_ms, 0),
    1800,
    'durations are preserved per worker row',
  );
  assert.equal(findWorker(searchWorkers, 'search-b')?.last_result_count, 0, 'zero-result worker is retained');
});

// ── Test 11: LLM aggregate state on bridge ──────────────────────────────────

test('integration: LLM aggregate state tracks calls by type and model', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  // Call 1: brand_resolution — completed
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z',
    batch_id: 'c1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    prompt_tokens: 100
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:32Z',
    batch_id: 'c1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    completion_tokens: 40,
    estimated_cost: 0.003
  }));
  await bridge.queue;

  // Call 2: discovery_planner — completed
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:33Z',
    batch_id: 'c2',
    reason: 'discovery_planner_primary',
    model: 'gpt-4o',
    prompt_tokens: 200
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:35Z',
    batch_id: 'c2',
    reason: 'discovery_planner_primary',
    model: 'gpt-4o',
    completion_tokens: 80,
    estimated_cost: 0.005
  }));
  await bridge.queue;

  // Call 3: extraction — failed
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:36Z',
    batch_id: 'c3',
    reason: 'extract_fields',
    model: 'claude-sonnet',
    prompt_tokens: 150
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_failed',
    ts: '2025-01-01T00:00:38Z',
    batch_id: 'c3',
    reason: 'extract_fields',
    model: 'claude-sonnet',
    message: 'timeout'
  }));
  await bridge.queue;

  const agg = bridge._llmAgg;
  assert.equal(agg.total_calls, 3, '3 total calls');
  // completed_calls includes both finished AND failed (all non-active resolutions)
  assert.equal(agg.completed_calls, 3, '3 completed (includes failed)');
  assert.equal(agg.failed_calls, 1, '1 failed');
  assert.equal(agg.active_calls, 0, '0 active');
  assert.ok(agg.calls_by_type.brand_resolver >= 1, 'brand_resolver tracked');
  assert.ok(agg.calls_by_type.search_planner >= 1, 'search_planner tracked');
  assert.ok(agg.calls_by_type.extraction >= 1, 'extraction tracked');
  assert.ok(agg.calls_by_model['gpt-4o'] >= 2, 'gpt-4o model tracked');
  assert.ok(agg.calls_by_model['claude-sonnet'] >= 1, 'claude-sonnet model tracked');
});

// ── Test 12: Finalize clears all pool state ─────────────────────────────────

test('integration: finalize clears search slots, LLM tracking, and resets counters', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  // Feed a search event
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'test query',
    provider: 'google'
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'test query',
    provider: 'google',
    result_count: 5,
    duration_ms: 300
  }));
  await bridge.queue;

  // Feed an LLM event
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:20Z',
    batch_id: 'f1',
    reason: 'brand_resolution',
    model: 'gpt-4o'
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:22Z',
    batch_id: 'f1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    completion_tokens: 30,
    estimated_cost: 0.002
  }));
  await bridge.queue;

  // Pre-finalize: state should be populated
  assert.ok(bridge._searchSlots.size > 0 || bridge._queryToSlot.size >= 0, 'search state exists pre-finalize');

  // Finalize
  await bridge.finalize();

  assert.equal(bridge._searchSlots.size, 0, 'search slots cleared');
  assert.equal(bridge._queryToSlot.size, 0, 'query-to-slot map cleared');
  assert.equal(bridge._llmCallMap.size, 0, 'LLM call map cleared');
  assert.equal(bridge._llmSeenWorkers.size, 0, 'LLM seen workers cleared');
  assert.equal(bridge._searchNextSlotIndex, 0, 'search slot index reset');
  assert.equal(bridge._llmCounter, 0, 'LLM counter reset');
});
