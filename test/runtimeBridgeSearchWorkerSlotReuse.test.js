import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { IndexLabRuntimeBridge } from '../src/indexlab/runtimeBridge.js';

async function makeBridge(overrides = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bridge-slot-'));
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
    runId: 'run-slot-001',
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
    (e) => e.event === eventName && e.payload?.scope === 'query'
  );
}

// ── Test 1: Single query start + finish share the same worker_id ──────────

test('single query start + finish share the same worker_id', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

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

  const starts = searchEvents(events, 'search_started');
  const finishes = searchEvents(events, 'search_finished');

  assert.equal(starts.length, 1, 'one search_started');
  assert.equal(finishes.length, 1, 'one search_finished');
  assert.equal(
    starts[0].payload.worker_id,
    finishes[0].payload.worker_id,
    'start and finish must share the same worker_id'
  );
  assert.equal(starts[0].payload.worker_id, 'search-a', 'first slot is search-a');
  assert.equal(starts[0].payload.slot, 'a', 'slot letter is a');
  assert.equal(starts[0].payload.tasks_started, 1, 'tasks_started is 1');
});

// ── Test 2: Two concurrent queries get distinct slots ─────────────────────

test('two concurrent queries get distinct slot letters', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'razer viper specs',
    provider: 'google'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:11Z',
    query: 'logitech g pro specs',
    provider: 'bing'
  }));
  await bridge.queue;

  const starts = searchEvents(events, 'search_started');
  assert.equal(starts.length, 2, 'two search_started events');
  assert.equal(starts[0].payload.worker_id, 'search-a');
  assert.equal(starts[1].payload.worker_id, 'search-b');

  // finish both — each matches its start
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:20Z',
    query: 'razer viper specs',
    provider: 'google',
    result_count: 8
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:21Z',
    query: 'logitech g pro specs',
    provider: 'bing',
    result_count: 5
  }));
  await bridge.queue;

  const finishes = searchEvents(events, 'search_finished');
  assert.equal(finishes.length, 2, 'two search_finished events');
  assert.equal(finishes[0].payload.worker_id, 'search-a', 'first finish matches slot a');
  assert.equal(finishes[1].payload.worker_id, 'search-b', 'second finish matches slot b');
});

// ── Test 3: Sequential reuse — slot recycled, tasks_started increments ────

test('sequential queries reuse the same slot, tasks_started increments', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  // query 1: start → finish
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
    result_count: 10
  }));
  await bridge.queue;

  // query 2: start → finish (different query, same provider)
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:20Z',
    query: 'logitech g pro specs',
    provider: 'google'
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:25Z',
    query: 'logitech g pro specs',
    provider: 'google',
    result_count: 7
  }));
  await bridge.queue;

  const starts = searchEvents(events, 'search_started');
  assert.equal(starts.length, 2, 'two search_started events');
  assert.equal(starts[0].payload.worker_id, 'search-a', 'first uses slot a');
  assert.equal(starts[1].payload.worker_id, 'search-a', 'second reuses slot a');
  assert.equal(starts[0].payload.tasks_started, 1, 'first task count is 1');
  assert.equal(starts[1].payload.tasks_started, 2, 'second task count is 2');
});

// ── Test 4: Four interleaved queries, max 2 slots ─────────────────────────

test('four interleaved queries produce at most 2 slot IDs', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  // start q1 → slot a
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'q1', provider: 'google'
  }));
  await bridge.queue;

  // start q2 → slot b
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:11Z',
    query: 'q2', provider: 'google'
  }));
  await bridge.queue;

  // finish q1 → frees slot a
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'q1', provider: 'google', result_count: 5
  }));
  await bridge.queue;

  // start q3 → reuses slot a
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:16Z',
    query: 'q3', provider: 'google'
  }));
  await bridge.queue;

  // finish q2 → frees slot b
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:20Z',
    query: 'q2', provider: 'google', result_count: 3
  }));
  await bridge.queue;

  // start q4 → reuses slot b
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:21Z',
    query: 'q4', provider: 'google'
  }));
  await bridge.queue;

  // finish q3, q4
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:25Z',
    query: 'q3', provider: 'google', result_count: 4
  }));
  await bridge.queue;
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:26Z',
    query: 'q4', provider: 'google', result_count: 6
  }));
  await bridge.queue;

  const allSearch = [
    ...searchEvents(events, 'search_started'),
    ...searchEvents(events, 'search_finished')
  ];
  const uniqueIds = new Set(allSearch.map((e) => e.payload.worker_id));
  assert.ok(
    uniqueIds.size <= 2,
    `should have at most 2 unique slot IDs, got ${uniqueIds.size}: ${[...uniqueIds].join(', ')}`
  );
  assert.ok(uniqueIds.has('search-a'), 'should include slot a');
  assert.ok(uniqueIds.has('search-b'), 'should include slot b');
});

// ── Test 5: Finish without matching start — fallback, no crash ────────────

test('discovery_query_completed without prior start does not crash', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'orphan query',
    provider: 'bing',
    result_count: 3
  }));
  await bridge.queue;

  const finishes = searchEvents(events, 'search_finished');
  assert.equal(finishes.length, 1, 'search_finished still emitted');
  assert.ok(
    finishes[0].payload.worker_id.startsWith('search-'),
    'worker_id starts with search-'
  );
});

// ── Test 6: Missing provider — still works ────────────────────────────────

test('discovery_query_started with missing provider still assigns a slot', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'test query'
    // no provider field
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'test query',
    result_count: 2
    // no provider field
  }));
  await bridge.queue;

  const starts = searchEvents(events, 'search_started');
  const finishes = searchEvents(events, 'search_finished');
  assert.equal(starts.length, 1);
  assert.equal(finishes.length, 1);
  assert.equal(starts[0].payload.worker_id, 'search-a');
  assert.equal(
    starts[0].payload.worker_id,
    finishes[0].payload.worker_id,
    'start and finish share worker_id even without provider'
  );
});

// ── Test 7: Same query, different providers — separate slots ──────────────

test('same query with different providers get separate slots', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'razer viper',
    provider: 'google'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:11Z',
    query: 'razer viper',
    provider: 'searxng'
  }));
  await bridge.queue;

  const starts = searchEvents(events, 'search_started');
  assert.equal(starts.length, 2);
  assert.equal(starts[0].payload.worker_id, 'search-a');
  assert.equal(starts[1].payload.worker_id, 'search-b');

  // finish google → matches slot a
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:20Z',
    query: 'razer viper',
    provider: 'google',
    result_count: 10
  }));
  await bridge.queue;

  // finish searxng → matches slot b
  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:21Z',
    query: 'razer viper',
    provider: 'searxng',
    result_count: 7
  }));
  await bridge.queue;

  const finishes = searchEvents(events, 'search_finished');
  assert.equal(finishes[0].payload.worker_id, 'search-a');
  assert.equal(finishes[1].payload.worker_id, 'search-b');
});

// ── Test 8: search_request_throttled uses active slot ─────────────────────

test('search_request_throttled uses the active slot for the same query', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'razer viper',
    provider: 'google'
  }));
  await bridge.queue;

  bridge.onRuntimeEvent(baseRow({
    event: 'search_request_throttled',
    ts: '2025-01-01T00:00:12Z',
    query: 'razer viper',
    provider: 'google',
    key: 'google.com',
    wait_ms: 2000
  }));
  await bridge.queue;

  const throttled = events.filter((e) => e.event === 'search_request_throttled');
  assert.equal(throttled.length, 1);
  assert.equal(
    throttled[0].payload.worker_id,
    'search-a',
    'throttled event should use the active slot'
  );
});

// ── Test 9: finalize clears slot state ────────────────────────────────────

test('finalize clears search slot state', async () => {
  const { bridge } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'test',
    provider: 'google'
  }));
  await bridge.queue;

  assert.ok(bridge._searchSlots.size > 0, 'slots allocated before finalize');
  assert.ok(bridge._queryToSlot.size > 0, 'query map populated before finalize');

  await bridge.finalize({ status: 'completed' });

  assert.equal(bridge._searchSlots.size, 0, 'slots cleared after finalize');
  assert.equal(bridge._queryToSlot.size, 0, 'query map cleared after finalize');
  assert.equal(bridge._searchNextSlotIndex, 0, 'slot index reset after finalize');
});
