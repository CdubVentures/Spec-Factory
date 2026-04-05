// WHY: Contract test for EventLogger.flush() draining async onEvent promises.
// The core invariant: flush() must await both NDJSON writeQueue AND any
// promises returned by the onEvent hook, so phase boundaries are clean.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventLogger } from './logger.js';

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('EventLogger flush drains async onEvent', () => {
  it('flush waits for async onEvent work to complete', async () => {
    let hookCompleted = false;
    const gate = createDeferred();

    const logger = new EventLogger({
      onEvent: () => gate.promise.then(() => {
        hookCompleted = true;
      }),
    });

    logger.info('test_event');
    let flushResolved = false;
    const flushPromise = logger.flush().then(() => {
      flushResolved = true;
    });

    await flushAsyncWork();
    assert.equal(flushResolved, false, 'flush must stay pending while async onEvent is unresolved');

    gate.resolve();
    await flushPromise;

    assert.equal(hookCompleted, true, 'flush must drain async onEvent before resolving');
  });

  it('flush resolves immediately when onEvent is sync (baseline)', async () => {
    let called = false;
    const logger = new EventLogger({
      onEvent: () => { called = true; },
    });

    logger.info('test_event');
    assert.equal(called, true, 'sync onEvent fires during push');

    // flush should resolve immediately — no async work pending
    await logger.flush();
  });

  it('flush resolves when no onEvent hook is configured', async () => {
    const logger = new EventLogger();
    logger.info('test_event');
    await logger.flush();
  });

  it('onEvent that throws synchronously does not break push or flush', async () => {
    const logger = new EventLogger({
      onEvent: () => { throw new Error('boom'); },
    });

    // push should not throw
    logger.info('test_event');

    // flush should resolve
    await logger.flush();
  });

  it('onEvent returning a rejected promise does not break flush', async () => {
    // WHY: Suppress the unhandled rejection from the current fire-and-forget
    // behavior. After the fix, the rejection is caught by ._onEventQueue chain.
    const suppress = (err) => {
      if (err?.message === 'async boom') return;
      throw err;
    };
    process.on('unhandledRejection', suppress);

    try {
      const logger = new EventLogger({
        onEvent: () => Promise.reject(new Error('async boom')),
      });

      logger.info('test_event');
      await logger.flush();
    } finally {
      process.removeListener('unhandledRejection', suppress);
    }
  });

  it('multiple pushes with async onEvent chain in order', async () => {
    const order = [];

    const logger = new EventLogger({
      onEvent: (row) => new Promise((resolve) => {
        setTimeout(() => {
          order.push(row.event);
          resolve();
        }, 1);
      }),
    });

    logger.info('event_a');
    logger.info('event_b');
    logger.info('event_c');

    await logger.flush();

    assert.deepEqual(order, ['event_a', 'event_b', 'event_c'],
      'events must resolve in push order');
  });

  it('flush drains onEventQueue even without storage writes', async () => {
    let hookCompleted = false;
    const gate = createDeferred();

    const logger = new EventLogger({
      onEvent: () => gate.promise.then(() => {
        hookCompleted = true;
      }),
    });

    logger.info('test_event');
    let flushResolved = false;
    const flushPromise = logger.flush().then(() => {
      flushResolved = true;
    });

    await flushAsyncWork();
    assert.equal(flushResolved, false, 'flush must still wait for the async onEvent work');

    gate.resolve();
    await flushPromise;

    assert.equal(hookCompleted, true, 'onEventQueue must be drained');
  });
});
