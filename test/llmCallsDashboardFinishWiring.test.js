import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeOpsWorkers,
  buildLlmCallsDashboard
} from '../src/features/indexing/api/builders/runtimeOpsDataBuilders.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
// These helpers model REAL production event shapes:
//   - llm_started has NO tokens, NO cost, NO response_preview
//   - llm_finished has tokens, cost, response_preview but NO prompt_preview

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
      prompt_tokens: null,        // NOT known at start
      completion_tokens: null,
      estimated_cost: null,
      duration_ms: null,
      input_summary: 'Resolve brand for Orbit X1',
      output_summary: null,
      prompt_preview: 'System: You are a brand resolver.\nUser: Identify the canonical brand...',
      response_preview: '',       // empty at start
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
      prompt_tokens: 2000,        // known after completion
      completion_tokens: 350,
      estimated_cost: 0.0031,
      duration_ms: 1800,
      input_summary: 'Resolve brand for Orbit X1',
      output_summary: 'Canonical: Acme Devices (97%)',
      prompt_preview: '',         // empty — openAI client doesn't resend prompt
      response_preview: '{"brand":"Acme","confidence":0.97}',
      ...overrides
    }
  };
}

// ── BUG 1: prompt_tokens from finish event must update worker ────────────────

test('buildRuntimeOpsWorkers: prompt_tokens from llm_finished updates worker', () => {
  const events = [
    llmStarted('llm-1'),     // prompt_tokens: null
    llmFinished('llm-1', { prompt_tokens: 2000 })
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = workers.find((w) => w.worker_id === 'llm-1');

  assert.ok(w, 'worker should exist');
  assert.equal(w.prompt_tokens, 2000, 'prompt_tokens should be updated from finish event');
});

test('buildLlmCallsDashboard: prompt_tokens from finish event flows into call row', () => {
  const events = [
    llmStarted('llm-1'),     // prompt_tokens: null
    llmFinished('llm-1', { prompt_tokens: 2000, completion_tokens: 350 })
  ];

  const result = buildLlmCallsDashboard(events);
  const call = result.calls[0];

  assert.equal(call.prompt_tokens, 2000, 'call row should have prompt_tokens from finish');
  assert.equal(call.total_tokens, 2350, 'total_tokens should be prompt + completion');
});

test('buildLlmCallsDashboard: summary prompt_tokens correct when only finish provides them', () => {
  const events = [
    llmStarted('llm-a', { ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-a', { prompt_tokens: 3000, completion_tokens: 500, estimated_cost: 0.005, ts: '2025-01-01T00:00:12.000Z' }),
    llmStarted('llm-b', { ts: '2025-01-01T00:00:12.000Z' }),
    llmFinished('llm-b', { prompt_tokens: 4000, completion_tokens: 800, estimated_cost: 0.008, ts: '2025-01-01T00:00:14.000Z' }),
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.summary.prompt_tokens, 7000, 'summary should aggregate prompt_tokens from finish events');
  assert.equal(result.summary.completion_tokens, 1300);
  assert.equal(result.summary.total_tokens, 8300);
});

// ── BUG 2: prompt_preview must NOT be overwritten with empty string ──────────

test('buildRuntimeOpsWorkers: prompt_preview from start survives empty finish', () => {
  const events = [
    llmStarted('llm-1', { prompt_preview: 'System: You are a brand resolver.\nUser: Identify...' }),
    llmFinished('llm-1', { prompt_preview: '' })  // empty on finish — should NOT overwrite
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = workers.find((w) => w.worker_id === 'llm-1');

  assert.equal(w.prompt_preview, 'System: You are a brand resolver.\nUser: Identify...',
    'prompt_preview from start should be preserved when finish sends empty string');
});

test('buildLlmCallsDashboard: prompt_preview preserved from start event', () => {
  const events = [
    llmStarted('llm-1', { prompt_preview: 'System: Extract fields from this page...' }),
    llmFinished('llm-1', { prompt_preview: '' })
  ];

  const result = buildLlmCallsDashboard(events);

  assert.equal(result.calls[0].prompt_preview, 'System: Extract fields from this page...',
    'prompt_preview on call row should come from start, not empty finish');
});

// ── BUG 3: model updated on finish when provider returns different model ─────

test('buildRuntimeOpsWorkers: model updated from llm_finished when different', () => {
  const events = [
    llmStarted('llm-1', { model: 'claude-sonnet' }),
    llmFinished('llm-1', { model: 'claude-sonnet-4-20250514' })
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = workers.find((w) => w.worker_id === 'llm-1');

  assert.equal(w.model, 'claude-sonnet-4-20250514',
    'model should be updated to the actual response model from finish event');
});

test('buildLlmCallsDashboard: by_model uses final model from finish event', () => {
  const events = [
    llmStarted('llm-a', { model: 'claude-sonnet', ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-a', { model: 'claude-sonnet-4-20250514', estimated_cost: 0.005, ts: '2025-01-01T00:00:12.000Z' }),
    llmStarted('llm-b', { model: 'claude-haiku', ts: '2025-01-01T00:00:12.000Z' }),
    llmFinished('llm-b', { model: 'claude-haiku-4-20250506', estimated_cost: 0.001, ts: '2025-01-01T00:00:14.000Z' }),
  ];

  const result = buildLlmCallsDashboard(events);

  // by_model should use the FINAL model, not the start model
  const models = result.summary.by_model.map((m) => m.model);
  assert.ok(models.includes('claude-sonnet-4-20250514'), 'should use final sonnet model');
  assert.ok(models.includes('claude-haiku-4-20250506'), 'should use final haiku model');
  assert.ok(!models.includes('claude-sonnet'), 'should not have the start-only model');
});

// ── BUG 4: Different calls produce different costs in summary ────────────────

test('buildLlmCallsDashboard: calls with different costs produce different by_call_type costs', () => {
  const events = [
    llmStarted('llm-br', { call_type: 'brand_resolver', ts: '2025-01-01T00:00:10.000Z' }),
    llmFinished('llm-br', { call_type: 'brand_resolver', estimated_cost: 0.003, prompt_tokens: 1500, completion_tokens: 200, ts: '2025-01-01T00:00:12.000Z' }),
    llmStarted('llm-ext', { call_type: 'extraction', ts: '2025-01-01T00:00:12.000Z' }),
    llmFinished('llm-ext', { call_type: 'extraction', estimated_cost: 0.019, prompt_tokens: 8000, completion_tokens: 2000, ts: '2025-01-01T00:00:18.000Z' }),
    llmStarted('llm-sp', { call_type: 'search_planner', ts: '2025-01-01T00:00:18.000Z' }),
    llmFinished('llm-sp', { call_type: 'search_planner', estimated_cost: 0.007, prompt_tokens: 3000, completion_tokens: 600, ts: '2025-01-01T00:00:20.000Z' }),
  ];

  const result = buildLlmCallsDashboard(events);

  const byType = result.summary.by_call_type;
  assert.equal(byType.length, 3, 'should have 3 call types');

  const costs = byType.map((ct) => ct.cost_usd);
  const uniqueCosts = new Set(costs);
  assert.equal(uniqueCosts.size, 3, 'all three call types should have different costs');

  // Verify individual costs
  const extraction = byType.find((ct) => ct.call_type === 'extraction');
  const brandResolver = byType.find((ct) => ct.call_type === 'brand_resolver');
  const searchPlanner = byType.find((ct) => ct.call_type === 'search_planner');
  assert.equal(extraction.cost_usd, 0.019);
  assert.equal(brandResolver.cost_usd, 0.003);
  assert.equal(searchPlanner.cost_usd, 0.007);
});

// ── BUG 5: estimated_usage type field on indexing LlmCallRow ─────────────────

test('buildLlmCallsDashboard: estimated_usage flag set correctly', () => {
  // Call with provider-reported tokens (estimated_usage should be false)
  const events = [
    llmStarted('llm-real'),
    llmFinished('llm-real', { prompt_tokens: 2000, completion_tokens: 350, estimated_cost: 0.0031 })
  ];

  const result = buildLlmCallsDashboard(events);
  assert.equal(result.calls[0].estimated_usage, false, 'provider-reported should not be estimated');
});

// ── Edge case: prompt_preview updated ONLY when finish has non-empty value ───

test('buildRuntimeOpsWorkers: prompt_preview updated from finish when non-empty', () => {
  const events = [
    llmStarted('llm-1', { prompt_preview: 'Original prompt...' }),
    llmFinished('llm-1', { prompt_preview: 'Updated prompt with response context...' })
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = workers.find((w) => w.worker_id === 'llm-1');

  assert.equal(w.prompt_preview, 'Updated prompt with response context...',
    'non-empty prompt_preview from finish should update');
});

// ── Edge case: null prompt_preview on finish leaves start value intact ────────

test('buildRuntimeOpsWorkers: null prompt_preview on finish leaves start value', () => {
  const events = [
    llmStarted('llm-1', { prompt_preview: 'Original prompt...' }),
    {
      event: 'llm_finished',
      ts: '2025-01-01T00:00:12.000Z',
      payload: {
        worker_id: 'llm-1',
        scope: 'call',
        completion_tokens: 350,
        estimated_cost: 0.003,
        duration_ms: 1800,
        // prompt_preview not present at all
      }
    }
  ];

  const workers = buildRuntimeOpsWorkers(events);
  const w = workers.find((w) => w.worker_id === 'llm-1');

  assert.equal(w.prompt_preview, 'Original prompt...',
    'when finish has no prompt_preview field, start value should remain');
});
