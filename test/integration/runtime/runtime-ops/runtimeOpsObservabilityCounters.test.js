import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IndexLabRuntimeBridge } from '../../../../src/indexlab/runtimeBridge.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makeBridge(overrides = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-obs-'));
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
    runId: 'run-obs-001',
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

// ── Test 1: Slot reuse counter increments ───────────────────────────────────

test('observability: sequential queries allocate fresh slots and keep reuse at zero', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  // 3 sequential queries — same slot reused each time after first
  for (let i = 0; i < 3; i++) {
    bridge.onRuntimeEvent(baseRow({
      event: 'discovery_query_started',
      ts: `2025-01-01T00:00:${10 + i * 10}Z`,
      query: `query-${i}`,
      provider: 'google'
    }));
    await bridge.queue;
    bridge.onRuntimeEvent(baseRow({
      event: 'discovery_query_completed',
      ts: `2025-01-01T00:00:${15 + i * 10}Z`,
      query: `query-${i}`,
      provider: 'google',
      result_count: 5,
      duration_ms: 300
    }));
    await bridge.queue;
  }

  const obs = bridge.getObservability();
  assert.equal(obs.search_slot_reuse, 0, 'slot reuse stays zero when every query gets a fresh slot');
  assert.equal(obs.search_unique_slots, 3, 'three sequential queries leave three visible slots');
});

// ── Test 2: Finish without start counter ────────────────────────────────────

test('observability: finish without start counter increments for orphan query', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  // Complete a query that was never started (orphan)
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'orphan-query',
    provider: 'bing',
    result_count: 5,
    duration_ms: 300
  }));
  await bridge.queue;

  const obs = bridge.getObservability();
  assert.equal(obs.search_finish_without_start, 1, 'finish without start = 1');
});

// ── Test 3: Unique slots tracked ────────────────────────────────────────────

test('observability: unique slots tracked on 2 concurrent queries', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  // Start 2 concurrent queries (2 slots allocated)
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'query-a',
    provider: 'google'
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:11Z',
    query: 'query-b',
    provider: 'google'
  }));
  await bridge.queue;

  // Finish both
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:20Z',
    query: 'query-a',
    provider: 'google',
    result_count: 8
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:21Z',
    query: 'query-b',
    provider: 'google',
    result_count: 6
  }));
  await bridge.queue;

  const obs = bridge.getObservability();
  assert.equal(obs.search_unique_slots, 2, '2 unique slots');
});

// ── Test 4: LLM missing telemetry counter ───────────────────────────────────

test('observability: LLM missing telemetry counter for event without reason AND model', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z',
    batch_id: 'mt-1'
    // NO reason, NO model
  }));
  await bridge.queue;

  const obs = bridge.getObservability();
  assert.equal(obs.llm_missing_telemetry, 1, 'missing telemetry = 1');
});

// ── Test 5: LLM with partial telemetry does NOT increment ───────────────────

test('observability: LLM with reason but no model does NOT count as missing', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'llm_call_started',
    ts: '2025-01-01T00:00:30Z',
    batch_id: 'pt-1',
    reason: 'brand_resolution'
    // Has reason but NO model — partial, not fully missing
  }));
  await bridge.queue;

  const obs = bridge.getObservability();
  assert.equal(obs.llm_missing_telemetry, 0, 'partial telemetry is OK');
});

// ── Test 6: Counters survive finalize ───────────────────────────────────────

test('observability: counters available after finalize', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  // Feed some events so counters are populated
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'test',
    provider: 'google'
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'test',
    provider: 'google',
    result_count: 5,
    duration_ms: 300
  }));
  await bridge.queue;

  await bridge.finalize();

  const obs = bridge.getObservability();
  assert.ok(obs && typeof obs === 'object', 'getObservability returns object');
  assert.ok('search_finish_without_start' in obs, 'has search_finish_without_start');
  assert.ok('search_slot_reuse' in obs, 'has search_slot_reuse');
  assert.ok('search_unique_slots' in obs, 'has search_unique_slots');
  assert.ok('llm_missing_telemetry' in obs, 'has llm_missing_telemetry');
  assert.ok('llm_orphan_finish' in obs, 'has llm_orphan_finish');
});
