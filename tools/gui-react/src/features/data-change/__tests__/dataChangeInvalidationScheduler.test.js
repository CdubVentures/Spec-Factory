import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataChangeInvalidationScheduler } from '../index.js';

function createFakeTimers() {
  let nextId = 1;
  const tasks = new Map();
  return {
    setTimeoutFn(fn, _delay) {
      const id = nextId;
      nextId += 1;
      tasks.set(id, fn);
      return id;
    },
    clearTimeoutFn(id) {
      tasks.delete(id);
    },
    flushAll() {
      const pending = [...tasks.entries()];
      tasks.clear();
      for (const [, task] of pending) {
        task();
      }
    },
    pendingCount() {
      return tasks.size;
    },
  };
}

function hasQueryKey(queryKeys, expected) {
  const target = JSON.stringify(expected);
  return queryKeys.some((queryKey) => JSON.stringify(queryKey) === target);
}

test('scheduler coalesces burst invalidations into one timer with deduped query keys', () => {
  const timers = createFakeTimers();
  const invalidated = [];
  const scheduler = createDataChangeInvalidationScheduler({
    queryClient: {
      invalidateQueries: ({ queryKey }) => invalidated.push(queryKey),
    },
    delayMs: 50,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  const message = {
    type: 'data-change',
    event: 'catalog-product-update',
    domains: ['catalog', 'identity', 'catalog'],
  };
  scheduler.schedule({ message, categories: ['mouse'], fallbackCategory: 'mouse' });
  scheduler.schedule({ message, categories: ['mouse'], fallbackCategory: 'mouse' });

  assert.equal(timers.pendingCount(), 1);
  assert.equal(invalidated.length, 0);

  timers.flushAll();

  assert.equal(hasQueryKey(invalidated, ['catalog', 'mouse']), true);
  const signatures = invalidated.map((queryKey) => JSON.stringify(queryKey));
  assert.equal(new Set(signatures).size, signatures.length);
});

test('scheduler merges cross-category burst updates before flush', () => {
  const timers = createFakeTimers();
  const invalidated = [];
  const scheduler = createDataChangeInvalidationScheduler({
    queryClient: {
      invalidateQueries: ({ queryKey }) => invalidated.push(queryKey),
    },
    delayMs: 50,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  scheduler.schedule({
    message: { type: 'data-change', event: 'review-override', domains: ['review'] },
    categories: ['mouse'],
    fallbackCategory: 'mouse',
  });
  scheduler.schedule({
    message: { type: 'data-change', event: 'review-override', domains: ['review'] },
    categories: ['keyboard'],
    fallbackCategory: 'keyboard',
  });

  timers.flushAll();

  assert.equal(hasQueryKey(invalidated, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(invalidated, ['reviewProductsIndex', 'keyboard']), true);
});

test('scheduler dispose clears pending burst without invalidating queries', () => {
  const timers = createFakeTimers();
  const invalidated = [];
  const scheduler = createDataChangeInvalidationScheduler({
    queryClient: {
      invalidateQueries: ({ queryKey }) => invalidated.push(queryKey),
    },
    delayMs: 50,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  scheduler.schedule({
    message: { type: 'data-change', event: 'queue-retry', domains: ['queue'] },
    categories: ['mouse'],
    fallbackCategory: 'mouse',
  });

  assert.equal(timers.pendingCount(), 1);
  scheduler.dispose();
  assert.equal(timers.pendingCount(), 0);

  timers.flushAll();
  assert.equal(invalidated.length, 0);
});

test('scheduler emits flush telemetry callback with merged query keys and categories', () => {
  const timers = createFakeTimers();
  const invalidated = [];
  const flushMetrics = [];
  const scheduler = createDataChangeInvalidationScheduler({
    queryClient: {
      invalidateQueries: ({ queryKey }) => invalidated.push(queryKey),
    },
    delayMs: 50,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    onFlush: (payload) => flushMetrics.push(payload),
  });

  scheduler.schedule({
    message: { type: 'data-change', event: 'catalog-product-update', domains: ['catalog'] },
    categories: ['mouse'],
    fallbackCategory: 'mouse',
  });
  scheduler.schedule({
    message: { type: 'data-change', event: 'catalog-product-update', domains: ['catalog'] },
    categories: ['keyboard'],
    fallbackCategory: 'keyboard',
  });

  timers.flushAll();

  assert.equal(flushMetrics.length, 1);
  assert.equal(flushMetrics[0].queryKeyCount, invalidated.length);
  assert.equal(flushMetrics[0].categories.includes('mouse'), true);
  assert.equal(flushMetrics[0].categories.includes('keyboard'), true);
});
