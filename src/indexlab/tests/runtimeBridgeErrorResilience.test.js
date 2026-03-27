import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBridge, baseRow, startRun } from './helpers/runtimeBridgeEventAuditHarness.js';

// WHY: These tests prove that the outer .catch() on the bridge queue logs and
// counts errors instead of silently swallowing them. The inner try-catch blocks
// in emit()/writeRunMeta() handle expected failures; these tests target the
// outer catch-all that handles UNEXPECTED errors escaping from handlers.

describe('RuntimeBridge error resilience', () => {
  test('event dispatch error does not reject the queue', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    // WHY: Override setContext to throw. dispatchRuntimeEvent calls setContext
    // when the event row has a category field — this throw escapes to the
    // outer .catch because it happens before any handler's inner try-catch.
    bridge.setContext = () => { throw new Error('context_boom'); };

    bridge.onRuntimeEvent(baseRow({
      event: 'source_fetch_queued',
      ts: '2025-01-01T00:00:02Z',
      url: 'https://example.com',
      worker_id: 'fetch-1',
    }));
    await bridge.queue;
    // No rejection — test passes if we reach here
  });

  test('bridge_event_errors counter increments on dispatch error', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    bridge.setContext = () => { throw new Error('context_boom'); };

    bridge.onRuntimeEvent(baseRow({
      event: 'source_fetch_queued',
      ts: '2025-01-01T00:00:02Z',
      url: 'https://example.com',
      worker_id: 'fetch-1',
    }));
    await bridge.queue;

    const obs = bridge.getObservability();
    assert.equal(obs.bridge_event_errors, 1, 'bridge_event_errors should be 1 after one error');
  });

  test('bridge continues processing events after a dispatch error', async () => {
    const { bridge, events } = await makeBridge();
    await startRun(bridge);

    // First event — will error
    bridge.setContext = () => { throw new Error('context_boom'); };
    bridge.onRuntimeEvent(baseRow({
      event: 'source_fetch_queued',
      ts: '2025-01-01T00:00:02Z',
      url: 'https://a.com',
      worker_id: 'fetch-1',
    }));
    await bridge.queue;

    // Restore setContext so second event succeeds
    bridge.setContext = function (next = {}) {
      this.context = { ...this.context, ...next };
    };

    bridge.onRuntimeEvent(baseRow({
      event: 'source_fetch_queued',
      ts: '2025-01-01T00:00:03Z',
      url: 'https://b.com',
      worker_id: 'fetch-2',
    }));
    await bridge.queue;

    // Second event should have processed — fetch_queued emitted for b.com
    const queuedEvents = events.filter((e) => e.event === 'fetch_queued');
    assert.ok(queuedEvents.length >= 1, 'at least one fetch_queued event emitted after recovery');
  });

  test('finalize error does not throw and increments bridge_finalize_errors', async () => {
    const { bridge } = await makeBridge();
    await startRun(bridge);

    // WHY: Null out stageState so finishStage throws a TypeError
    // (Cannot read properties of null). This happens early in finalize
    // and is not caught by any inner try-catch.
    bridge.stageState = null;

    await bridge.finalize({ status: 'completed' });

    const obs = bridge.getObservability();
    assert.equal(obs.bridge_finalize_errors, 1, 'bridge_finalize_errors should be 1');
  });

  test('error counters visible through getObservability and start at zero', async () => {
    const { bridge } = await makeBridge();
    const obs = bridge.getObservability();
    assert.ok('bridge_event_errors' in obs, 'has bridge_event_errors');
    assert.ok('bridge_finalize_errors' in obs, 'has bridge_finalize_errors');
    assert.equal(obs.bridge_event_errors, 0, 'starts at 0');
    assert.equal(obs.bridge_finalize_errors, 0, 'starts at 0');
  });
});
