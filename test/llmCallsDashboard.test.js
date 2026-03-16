import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeOpsWorkers,
  buildLlmCallsDashboard
} from '../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function llmStarted(workerId, overrides = {}) {
  return {
    event: 'llm_started',
    ts: overrides.ts || '2025-01-01T00:00:10.000Z',
    payload: {
      worker_id: workerId,
      scope: 'call',
      call_type: 'brand_resolver',
      prefetch_tab: 'brand_resolver',
      round: 1,
      model: 'claude-sonnet',
      provider: 'anthropic',
      prompt_tokens: 2000,
      completion_tokens: null,
      estimated_cost: null,
      duration_ms: null,
      input_summary: 'Resolve brand for WH-1000XM5',
      output_summary: null,
      ...overrides
    }
  };
}

function llmFinished(workerId, overrides = {}) {
  return {
    event: 'llm_finished',
    ts: overrides.ts || '2025-01-01T00:00:12.000Z',
    payload: {
      worker_id: workerId,
      scope: 'call',
      call_type: 'brand_resolver',
      prefetch_tab: 'brand_resolver',
      round: 1,
      model: 'claude-sonnet',
      provider: 'anthropic',
      prompt_tokens: 2000,
      completion_tokens: 350,
      estimated_cost: 0.0031,
      duration_ms: 1800,
      input_summary: 'Resolve brand for WH-1000XM5',
      output_summary: 'Canonical: Sony Corporation (97%)',
      ...overrides
    }
  };
}

function llmFailed(workerId, overrides = {}) {
  return {
    event: 'llm_failed',
    ts: overrides.ts || '2025-01-01T00:00:13.000Z',
    payload: {
      worker_id: workerId,
      scope: 'call',
      call_type: 'extraction',
      round: 1,
      model: 'claude-sonnet',
      provider: 'anthropic',
      prompt_tokens: 3000,
      completion_tokens: 0,
      estimated_cost: 0.001,
      duration_ms: 500,
      message: 'Rate limit exceeded',
      ...overrides
    }
  };
}

// ── Test 1: Empty events → empty dashboard ───────────────────────────────────

test('buildLlmCallsDashboard: empty events returns empty calls and zeroed summary', () => {
  const result = buildLlmCallsDashboard([]);

  assert.deepEqual(result.calls, []);
  assert.equal(result.summary.total_calls, 0);
  assert.equal(result.summary.active_calls, 0);
  assert.equal(result.summary.completed_calls, 0);
  assert.equal(result.summary.total_cost_usd, 0);
  assert.equal(result.summary.total_tokens, 0);
  assert.equal(result.summary.prompt_tokens, 0);
  assert.equal(result.summary.completion_tokens, 0);
  assert.equal(result.summary.avg_latency_ms, 0);
  assert.equal(result.summary.rounds, 0);
  assert.equal(result.summary.calls_in_latest_round, 0);
  assert.deepEqual(result.summary.by_model, []);
  assert.deepEqual(result.summary.by_call_type, []);
});

// ── Test 2: Single completed call → correct row and summary ──────────────────

test('buildLlmCallsDashboard: single completed call produces correct row and summary', () => {
  const events = [
    llmStarted('llm-1'),
    llmFinished('llm-1')
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls.length, 1);
  const call = result.calls[0];
  assert.equal(call.index, 1);
  assert.equal(call.worker_id, 'llm-1');
  assert.equal(call.call_type, 'brand_resolver');
  assert.equal(call.round, 1);
  assert.equal(call.model, 'claude-sonnet');
  assert.equal(call.provider, 'anthropic');
  assert.equal(call.status, 'done');
  assert.equal(call.prompt_tokens, 2000);
  assert.equal(call.completion_tokens, 350);
  assert.equal(call.total_tokens, 2350);
  assert.equal(call.estimated_cost, 0.0031);
  assert.equal(call.duration_ms, 1800);
  // input_summary / output_summary removed from dashboard call rows — previews are the source of truth
  assert.equal(call.input_summary, undefined);
  assert.equal(call.output_summary, undefined);

  assert.equal(result.summary.total_calls, 1);
  assert.equal(result.summary.completed_calls, 1);
  assert.equal(result.summary.active_calls, 0);
  assert.equal(result.summary.total_cost_usd, 0.0031);
  assert.equal(result.summary.total_tokens, 2350);
  assert.equal(result.summary.prompt_tokens, 2000);
  assert.equal(result.summary.completion_tokens, 350);
  assert.equal(result.summary.avg_latency_ms, 1800);
  assert.equal(result.summary.rounds, 1);
});

// ── Test 3: Active call (start only) → status 'active' ──────────────────────

test('buildLlmCallsDashboard: call with only start event has status active', () => {
  const events = [
    llmStarted('llm-active')
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].status, 'active');
  assert.equal(result.summary.active_calls, 1);
  assert.equal(result.summary.completed_calls, 0);
  // avg_latency_ms only counts completed calls
  assert.equal(result.summary.avg_latency_ms, 0);
});

// ── Test 4: Failed call → status 'failed' ────────────────────────────────────

test('buildLlmCallsDashboard: failed call has status failed', () => {
  const events = [
    llmStarted('llm-fail', { call_type: 'extraction' }),
    llmFailed('llm-fail')
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].status, 'failed');
});

// ── Test 5: Multiple calls across rounds → correct round stats ──────────────

test('buildLlmCallsDashboard: multiple rounds tracked correctly', () => {
  const events = [
    // Round 1: 3 calls
    llmStarted('llm-r1a', { round: 1, call_type: 'brand_resolver', ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-r1a', { round: 1, call_type: 'brand_resolver', ts: '2025-01-01T00:00:12.000Z', estimated_cost: 0.003, duration_ms: 1800, prompt_tokens: 2000, completion_tokens: 300 }),
    llmStarted('llm-r1b', { round: 1, call_type: 'search_planner', ts: '2025-01-01T00:00:12.000Z' }),
    llmFinished('llm-r1b', { round: 1, call_type: 'search_planner', ts: '2025-01-01T00:00:14.000Z', estimated_cost: 0.005, duration_ms: 2300, prompt_tokens: 3000, completion_tokens: 400 }),
    llmStarted('llm-r1c', { round: 1, call_type: 'domain_safety', ts: '2025-01-01T00:00:14.000Z' }),
    llmFinished('llm-r1c', { round: 1, call_type: 'domain_safety', ts: '2025-01-01T00:00:16.000Z', estimated_cost: 0.006, duration_ms: 2100, prompt_tokens: 3500, completion_tokens: 500 }),
    // Round 2: 2 calls
    llmStarted('llm-r2a', { round: 2, call_type: 'search_planner', ts: '2025-01-01T00:00:20.000Z' }),
    llmFinished('llm-r2a', { round: 2, call_type: 'search_planner', ts: '2025-01-01T00:00:22.000Z', estimated_cost: 0.004, duration_ms: 2000, prompt_tokens: 2800, completion_tokens: 350 }),
    llmStarted('llm-r2b', { round: 2, call_type: 'domain_safety', ts: '2025-01-01T00:00:22.000Z' }),
    llmFinished('llm-r2b', { round: 2, call_type: 'domain_safety', ts: '2025-01-01T00:00:24.000Z', estimated_cost: 0.005, duration_ms: 1800, prompt_tokens: 2500, completion_tokens: 400 }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.summary.total_calls, 5);
  assert.equal(result.summary.rounds, 2);
  assert.equal(result.summary.calls_in_latest_round, 2);
});

// ── Test 6: by_model aggregation ─────────────────────────────────────────────

test('buildLlmCallsDashboard: by_model aggregation groups correctly', () => {
  const events = [
    llmStarted('llm-s1', { model: 'claude-sonnet', ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-s1', { model: 'claude-sonnet', ts: '2025-01-01T00:00:12.000Z', estimated_cost: 0.005 }),
    llmStarted('llm-s2', { model: 'claude-sonnet', ts: '2025-01-01T00:00:12.000Z' }),
    llmFinished('llm-s2', { model: 'claude-sonnet', ts: '2025-01-01T00:00:14.000Z', estimated_cost: 0.005 }),
    llmStarted('llm-h1', { model: 'claude-haiku', ts: '2025-01-01T00:00:14.000Z' }),
    llmFinished('llm-h1', { model: 'claude-haiku', ts: '2025-01-01T00:00:15.000Z', estimated_cost: 0.001 }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.summary.by_model.length, 2);
  const sonnet = result.summary.by_model.find(m => m.model === 'claude-sonnet');
  const haiku = result.summary.by_model.find(m => m.model === 'claude-haiku');
  assert.ok(sonnet, 'sonnet should exist');
  assert.ok(haiku, 'haiku should exist');
  assert.equal(sonnet.calls, 2);
  assert.equal(haiku.calls, 1);
  // Sorted by cost descending
  assert.equal(result.summary.by_model[0].model, 'claude-sonnet');
});

// ── Test 7: by_call_type aggregation ─────────────────────────────────────────

test('buildLlmCallsDashboard: by_call_type aggregation groups correctly', () => {
  const events = [
    llmStarted('llm-ext1', { call_type: 'extraction', ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-ext1', { call_type: 'extraction', ts: '2025-01-01T00:00:12.000Z', estimated_cost: 0.019 }),
    llmStarted('llm-up1', { call_type: 'domain_safety', ts: '2025-01-01T00:00:12.000Z' }),
    llmFinished('llm-up1', { call_type: 'domain_safety', ts: '2025-01-01T00:00:14.000Z', estimated_cost: 0.012 }),
    llmStarted('llm-sp1', { call_type: 'search_planner', ts: '2025-01-01T00:00:14.000Z' }),
    llmFinished('llm-sp1', { call_type: 'search_planner', ts: '2025-01-01T00:00:16.000Z', estimated_cost: 0.010 }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.summary.by_call_type.length, 3);
  // Sorted by cost descending
  assert.equal(result.summary.by_call_type[0].call_type, 'extraction');
  assert.equal(result.summary.by_call_type[1].call_type, 'domain_safety');
  assert.equal(result.summary.by_call_type[2].call_type, 'search_planner');
});

// ── Test 8: Provider field is captured on worker rows ────────────────────────

test('buildRuntimeOpsWorkers: llm worker row includes provider field', () => {
  const events = [
    llmStarted('llm-prov', { provider: 'anthropic' }),
    llmFinished('llm-prov', { provider: 'anthropic' })
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = workers.find(w => w.worker_id === 'llm-prov');

  assert.ok(w, 'worker should exist');
  assert.equal(w.provider, 'anthropic');
});

// ── Test 9: Token aggregation is correct ─────────────────────────────────────

test('buildLlmCallsDashboard: token aggregation sums prompt and completion correctly', () => {
  const events = [
    llmStarted('llm-t1', { prompt_tokens: 3000, ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-t1', { prompt_tokens: 3000, completion_tokens: 500, ts: '2025-01-01T00:00:12.000Z' }),
    llmStarted('llm-t2', { prompt_tokens: 4000, ts: '2025-01-01T00:00:12.000Z' }),
    llmFinished('llm-t2', { prompt_tokens: 4000, completion_tokens: 800, ts: '2025-01-01T00:00:14.000Z' }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.summary.prompt_tokens, 7000);
  assert.equal(result.summary.completion_tokens, 1300);
  assert.equal(result.summary.total_tokens, 8300);
});

// ── Test 10: Average latency excludes active/null calls ──────────────────────

test('buildLlmCallsDashboard: avg latency only uses completed calls with duration', () => {
  const events = [
    // Completed with duration
    llmStarted('llm-d1', { ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-d1', { duration_ms: 2000, ts: '2025-01-01T00:00:12.000Z' }),
    llmStarted('llm-d2', { ts: '2025-01-01T00:00:12.000Z' }),
    llmFinished('llm-d2', { duration_ms: 1000, ts: '2025-01-01T00:00:13.000Z' }),
    // Active (no finish) — should not affect avg
    llmStarted('llm-active', { ts: '2025-01-01T00:00:14.000Z' }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.summary.avg_latency_ms, 1500); // (2000 + 1000) / 2
});

// ── Test 11: Calls sorted by timestamp ───────────────────────────────────────

test('buildLlmCallsDashboard: calls are sorted by started_at ascending', () => {
  const events = [
    llmStarted('llm-late', { ts: '2025-01-01T00:00:20.000Z' }),
    llmFinished('llm-late', { ts: '2025-01-01T00:00:22.000Z' }),
    llmStarted('llm-early', { ts: '2025-01-01T00:00:05.000Z' }),
    llmFinished('llm-early', { ts: '2025-01-01T00:00:07.000Z' }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[0].worker_id, 'llm-early');
  assert.equal(result.calls[1].worker_id, 'llm-late');
  assert.equal(result.calls[0].index, 1);
  assert.equal(result.calls[1].index, 2);
});

// ── Test 12: Non-LLM events are excluded ─────────────────────────────────────

test('buildLlmCallsDashboard: non-llm workers are excluded from results', () => {
  const events = [
    // Fetch worker
    { event: 'fetch_started', ts: '2025-01-01T00:00:05.000Z', payload: { worker_id: 'fetch-1', url: 'https://example.com' } },
    { event: 'fetch_finished', ts: '2025-01-01T00:00:10.000Z', payload: { worker_id: 'fetch-1', url: 'https://example.com', status_code: 200 } },
    // Search worker
    { event: 'search_started', ts: '2025-01-01T00:00:05.000Z', payload: { worker_id: 'search-a', scope: 'query', slot: 'a' } },
    { event: 'search_finished', ts: '2025-01-01T00:00:10.000Z', payload: { worker_id: 'search-a', scope: 'query', result_count: 5, duration_ms: 200 } },
    // LLM worker
    llmStarted('llm-1'),
    llmFinished('llm-1'),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].worker_id, 'llm-1');
  assert.equal(result.summary.total_calls, 1);
});

// ── Test 13: prompt_preview and response_preview on call rows ─────────────

test('buildLlmCallsDashboard: call rows include prompt_preview and response_preview', () => {
  const events = [
    llmStarted('llm-prev', {
      prompt_preview: 'System: You are a brand resolver...',
    }),
    llmFinished('llm-prev', {
      prompt_preview: 'System: You are a brand resolver...',
      response_preview: '{"brand":"Sony","confidence":0.97}',
    }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].prompt_preview, 'System: You are a brand resolver...');
  assert.equal(result.calls[0].response_preview, '{"brand":"Sony","confidence":0.97}');
});

// ── Test 14: active call has null response_preview ────────────────────────

test('buildLlmCallsDashboard: active call has null response_preview', () => {
  const events = [
    llmStarted('llm-act', {
      prompt_preview: 'System: Extract fields...',
    }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].prompt_preview, 'System: Extract fields...');
  assert.equal(result.calls[0].response_preview, null);
});

// ── Test 15: escalation_planner call type flows through ────────────────────

test('buildLlmCallsDashboard: escalation_planner call type produces correct row', () => {
  const events = [
    llmStarted('llm-esc', { call_type: 'escalation_planner', ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-esc', { call_type: 'escalation_planner', ts: '2025-01-01T00:00:12.000Z', estimated_cost: 0.002 }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].call_type, 'escalation_planner');
  assert.equal(result.summary.by_call_type.length, 1);
  assert.equal(result.summary.by_call_type[0].call_type, 'escalation_planner');
});
