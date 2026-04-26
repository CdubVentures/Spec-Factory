import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeOpsInvalidationScheduler } from '../runtimeOpsInvalidationScheduler.ts';

function createFakeTimers() {
  let nextId = 1;
  const tasks = new Map<number, () => void>();
  return {
    setTimeoutFn(fn: () => void, _delay: number) {
      const id = nextId;
      nextId += 1;
      tasks.set(id, fn);
      return id;
    },
    clearTimeoutFn(id: number) {
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

test('runtime ops invalidation scheduler coalesces burst events for one run', () => {
  const timers = createFakeTimers();
  const invalidated: unknown[] = [];
  const scheduler = createRuntimeOpsInvalidationScheduler({
    queryClient: {
      invalidateQueries: (args: unknown) => invalidated.push(args),
    },
    delayMs: 50,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  scheduler.schedule('run-1');
  scheduler.schedule('run-1');
  scheduler.schedule('run-1');

  assert.equal(timers.pendingCount(), 1);
  assert.deepEqual(invalidated, []);

  timers.flushAll();

  assert.deepEqual(invalidated, [
    { queryKey: ['runtime-ops', 'run-1'] },
  ]);
});

test('runtime ops invalidation scheduler dedupes each run in a burst', () => {
  const timers = createFakeTimers();
  const invalidated: unknown[] = [];
  const scheduler = createRuntimeOpsInvalidationScheduler({
    queryClient: {
      invalidateQueries: (args: unknown) => invalidated.push(args),
    },
    delayMs: 50,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  scheduler.schedule('run-1');
  scheduler.schedule('run-2');
  scheduler.schedule('run-1');

  timers.flushAll();

  assert.deepEqual(invalidated, [
    { queryKey: ['runtime-ops', 'run-1'] },
    { queryKey: ['runtime-ops', 'run-2'] },
  ]);
});

test('runtime ops invalidation scheduler dispose clears pending invalidation', () => {
  const timers = createFakeTimers();
  const invalidated: unknown[] = [];
  const scheduler = createRuntimeOpsInvalidationScheduler({
    queryClient: {
      invalidateQueries: (args: unknown) => invalidated.push(args),
    },
    delayMs: 50,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });

  scheduler.schedule('run-1');
  assert.equal(timers.pendingCount(), 1);

  scheduler.dispose();
  assert.equal(timers.pendingCount(), 0);

  timers.flushAll();
  assert.deepEqual(invalidated, []);
});
