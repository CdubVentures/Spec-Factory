import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeBridge,
  baseRow,
  startRun,
} from './helpers/runtimeBridgeEventAuditHarness.js';

test('scheduler_fallback_started is emitted under fetch stage', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'scheduler_fallback_started',
    ts: '2025-01-01T00:02:00Z',
    url: 'https://blocked.com/page',
    from_mode: 'crawlee',
    to_mode: 'playwright',
    outcome: 'blocked',
    attempt: 1
  }));
  await bridge.queue;

  const started = events.filter((e) => e.event === 'scheduler_fallback_started');
  assert.equal(started.length, 1);
  assert.equal(started[0].stage, 'fetch');
  assert.equal(started[0].payload.url, 'https://blocked.com/page');
  assert.equal(started[0].payload.from_mode, 'crawlee');
  assert.equal(started[0].payload.to_mode, 'playwright');
  assert.equal(started[0].payload.outcome, 'blocked');
  assert.equal(started[0].payload.attempt, 1);
});

test('scheduler_fallback_succeeded is emitted under fetch stage', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'scheduler_fallback_succeeded',
    ts: '2025-01-01T00:02:30Z',
    url: 'https://blocked.com/page',
    mode: 'playwright',
    attempt: 1,
    from_mode: 'crawlee'
  }));
  await bridge.queue;

  const succeeded = events.filter((e) => e.event === 'scheduler_fallback_succeeded');
  assert.equal(succeeded.length, 1);
  assert.equal(succeeded[0].stage, 'fetch');
  assert.equal(succeeded[0].payload.url, 'https://blocked.com/page');
  assert.equal(succeeded[0].payload.mode, 'playwright');
  assert.equal(succeeded[0].payload.from_mode, 'crawlee');
});

test('scheduler_fallback_exhausted is emitted under fetch stage', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'scheduler_fallback_exhausted',
    ts: '2025-01-01T00:03:00Z',
    url: 'https://blocked.com/page',
    modes_tried: ['crawlee', 'playwright', 'http'],
    final_outcome: 'blocked'
  }));
  await bridge.queue;

  const exhausted = events.filter((e) => e.event === 'scheduler_fallback_exhausted');
  assert.equal(exhausted.length, 1);
  assert.equal(exhausted[0].stage, 'fetch');
  assert.equal(exhausted[0].payload.url, 'https://blocked.com/page');
  assert.deepEqual(exhausted[0].payload.modes_tried, ['crawlee', 'playwright', 'http']);
  assert.equal(exhausted[0].payload.final_outcome, 'blocked');
});

test('search_started event includes worker_id with search- prefix', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_started',
    ts: '2025-01-01T00:00:10Z',
    query: 'razer viper specs',
    provider: 'google'
  }));
  await bridge.queue;

  const searchStarted = events.filter((e) => e.event === 'search_started' && e.payload.scope === 'query');
  assert.equal(searchStarted.length, 1);
  assert.ok(searchStarted[0].payload.worker_id, 'search_started must include worker_id');
  assert.ok(searchStarted[0].payload.worker_id.startsWith('search-'));
});

test('search_finished event includes worker_id with search- prefix', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'discovery_query_completed',
    ts: '2025-01-01T00:00:15Z',
    query: 'razer viper specs',
    provider: 'google',
    result_count: 10
  }));
  await bridge.queue;

  const searchFinished = events.filter((e) => e.event === 'search_finished');
  assert.equal(searchFinished.length, 1);
  assert.ok(searchFinished[0].payload.worker_id, 'search_finished must include worker_id');
  assert.ok(searchFinished[0].payload.worker_id.startsWith('search-'));
});

test('search_request_throttled event is emitted by bridge with throttle payload', async () => {
  const { bridge, events } = await makeBridge();
  await startRun(bridge);

  bridge.onRuntimeEvent(baseRow({
    event: 'search_request_throttled',
    ts: '2025-01-01T00:00:12Z',
    query: 'razer viper v3 pro specs',
    provider: 'google',
    key: 'www.google.com',
    wait_ms: 375
  }));
  await bridge.queue;

  const throttled = events.filter((e) => e.event === 'search_request_throttled');
  assert.equal(throttled.length, 1, 'search_request_throttled should be emitted');
  assert.equal(throttled[0].stage, 'search');
  assert.equal(throttled[0].payload.scope, 'query');
  assert.equal(throttled[0].payload.query, 'razer viper v3 pro specs');
  assert.equal(throttled[0].payload.provider, 'google');
  assert.equal(throttled[0].payload.key, 'www.google.com');
  assert.equal(throttled[0].payload.wait_ms, 375);
  assert.ok(throttled[0].payload.worker_id, 'search_request_throttled must include worker_id');
  assert.ok(throttled[0].payload.worker_id.startsWith('search-'));
});
