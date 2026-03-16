import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IndexLabRuntimeBridge } from '../src/indexlab/runtimeBridge.js';

async function makeBridge(overrides = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-llm-'));
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
    runId: 'run-llm-001',
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

function llmEvents(events, eventName) {
  return events.filter((event) => event.event === eventName);
}

test('brand resolver llm call emits enriched call telemetry', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z',
    batch_id: 'br-1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    provider: 'openai',
    route_role: 'plan',
    round: 2,
    prompt_tokens: 120,
    max_tokens_applied: 800,
    input_summary: 'Resolve canonical brand',
    prompt_preview: 'prompt body'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:31Z',
    batch_id: 'br-1',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    provider: 'openai',
    route_role: 'plan',
    round: 2,
    prompt_tokens: 120,
    completion_tokens: 48,
    total_tokens: 168,
    estimated_cost: 0.0042,
    duration_ms: 842,
    output_summary: 'Resolved Razer',
    response_preview: 'response body'
  }));
  await bridge.queue;

  const starts = llmEvents(events, 'llm_started');
  const finishes = llmEvents(events, 'llm_finished');

  assert.equal(starts.length, 1);
  assert.equal(finishes.length, 1);

  assert.equal(starts[0].payload.worker_id, 'llm-br-1');
  assert.equal(finishes[0].payload.worker_id, 'llm-br-1');
  assert.equal(finishes[0].payload.call_type, 'brand_resolver');
  assert.equal(finishes[0].payload.prefetch_tab, '02');
  assert.equal(finishes[0].payload.round, 2);
  assert.equal(finishes[0].payload.model, 'gpt-4o');
  assert.equal(finishes[0].payload.prompt_tokens, 120);
  assert.equal(finishes[0].payload.completion_tokens, 48);
  assert.equal(finishes[0].payload.estimated_cost, 0.0042);
  assert.equal(finishes[0].payload.duration_ms, 842);
  assert.equal(starts[0].payload.input_summary, 'Resolve canonical brand');
  assert.equal(finishes[0].payload.output_summary, 'Resolved Razer');
});

test('missing llm telemetry fields normalize to null without crashing', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:40Z',
    batch_id: 'sp-1',
    reason: 'discovery_planner_primary',
    model: 'claude-sonnet',
    provider: 'anthropic'
  }));
  await bridge.queue;

  const finishes = llmEvents(events, 'llm_finished');
  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].payload.call_type, 'search_planner');
  assert.equal(finishes[0].payload.prefetch_tab, '04');
  assert.equal(finishes[0].payload.round, 1);
  assert.equal(finishes[0].payload.prompt_tokens, null);
  assert.equal(finishes[0].payload.completion_tokens, null);
  assert.equal(finishes[0].payload.estimated_cost, null);
  assert.equal(finishes[0].payload.duration_ms, null);
  assert.equal(finishes[0].payload.input_summary, null);
  assert.equal(finishes[0].payload.output_summary, null);
});

test('llm aggregate state tracks totals, active calls, and type/model rollups', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:50Z',
    batch_id: 'dc-1',
    reason: 'domain_safety_classification',
    model: 'claude-haiku',
    provider: 'anthropic',
    prompt_tokens: 30
  }));
  await bridge.queue;

  assert.deepEqual(bridge._llmAgg, {
    total_calls: 1,
    completed_calls: 0,
    failed_calls: 0,
    active_calls: 1,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    total_cost: 0,
    calls_by_type: { domain_classifier: 1 },
    calls_by_model: { 'claude-haiku': 1 }
  });

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:51Z',
    batch_id: 'dc-1',
    reason: 'domain_safety_classification',
    model: 'claude-haiku',
    provider: 'anthropic',
    prompt_tokens: 30,
    completion_tokens: 10,
    estimated_cost: 0.0009
  }));
  await bridge.queue;

  assert.deepEqual(bridge._llmAgg, {
    total_calls: 1,
    completed_calls: 1,
    failed_calls: 0,
    active_calls: 0,
    total_prompt_tokens: 30,
    total_completion_tokens: 10,
    total_cost: 0.0009,
    calls_by_type: {
      domain_classifier: 1
    },
    calls_by_model: {
      'claude-haiku': 1
    }
  });
});

test('failed llm calls keep telemetry mapping and drain active aggregate count', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:01:00Z',
    batch_id: 'st-1',
    reason: 'serp_triage_batch',
    model: 'gpt-4o-mini',
    provider: 'openai'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_failed',
    ts: '2025-01-01T00:01:01Z',
    batch_id: 'st-1',
    reason: 'serp_triage_batch',
    model: 'gpt-4o-mini',
    provider: 'openai',
    message: 'provider timeout'
  }));
  await bridge.queue;

  const failures = llmEvents(events, 'llm_failed');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].payload.call_type, 'serp_triage');
  assert.equal(failures[0].payload.prefetch_tab, '07');
  assert.equal(failures[0].payload.message, 'provider timeout');
  assert.equal(bridge._llmAgg.total_calls, 1);
  assert.equal(bridge._llmAgg.completed_calls, 1);
  assert.equal(bridge._llmAgg.failed_calls, 1);
  assert.equal(bridge._llmAgg.active_calls, 0);
});
