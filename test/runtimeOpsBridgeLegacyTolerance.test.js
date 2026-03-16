import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IndexLabRuntimeBridge } from '../src/indexlab/runtimeBridge.js';

async function makeBridge(overrides = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-legacy-'));
  const events = [];
  const bridge = new IndexLabRuntimeBridge({
    outRoot: tmpDir,
    onEvent: (event) => events.push(event),
    ...overrides
  });
  return { bridge, events, tmpDir };
}

function baseRow(overrides = {}) {
  return {
    runId: 'run-legacy-001',
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

function searchEvents(events, eventName) {
  return events.filter(
    (event) => event.event === eventName && event.payload?.scope === 'query'
  );
}

function llmEvents(events, eventName) {
  return events.filter((event) => event.event === eventName);
}

test('legacy search telemetry tolerates sparse start rows and orphan finishes', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    result_count: 2,
    duration_ms: 250
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:16Z',
    result_count: 5,
    duration_ms: 300
  }));
  await bridge.queue;

  const starts = searchEvents(events, 'search_started');
  const finishes = searchEvents(events, 'search_finished');

  assert.equal(starts.length, 1);
  assert.equal(typeof starts[0].payload.query, 'string');
  assert.equal(typeof starts[0].payload.provider, 'string');
  assert.ok(starts[0].payload.worker_id);

  assert.equal(finishes.length, 2);
  assert.ok(finishes.every((event) => typeof event.payload.query === 'string'));
  assert.ok(finishes.every((event) => typeof event.payload.provider === 'string'));
  assert.ok(finishes.every((event) => event.payload.worker_id));
});

test('legacy llm telemetry tolerates missing reason, model, and batch_id', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_completed',
    ts: '2025-01-01T00:00:35Z',
    batch_id: 'orphan-llm',
    reason: 'brand_resolution',
    model: 'gpt-4o',
    completion_tokens: 40,
    estimated_cost: 0.003
  }));
  await bridge.queue;

  const starts = llmEvents(events, 'llm_started');
  const finishes = llmEvents(events, 'llm_finished');

  assert.equal(starts.length, 1);
  assert.equal(starts[0].payload.call_type, 'unknown');
  assert.equal(typeof starts[0].payload.model, 'string');
  assert.ok(starts[0].payload.worker_id.startsWith('llm-'));

  assert.equal(finishes.length, 1);
  assert.equal(finishes[0].payload.call_type, 'brand_resolver');
  assert.ok(finishes[0].payload.worker_id);
});
