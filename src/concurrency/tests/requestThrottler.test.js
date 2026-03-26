import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostConcurrencyGate, createRequestThrottler } from '../requestThrottler.js';

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

test('request throttler enforces global and per-key token buckets', async () => {
  let nowMs = 0;
  const waits = [];
  const throttler = createRequestThrottler({
    globalRps: 2,
    globalBurst: 1,
    keyRps: 1,
    keyBurst: 1,
    nowFn: () => nowMs,
    sleepFn: async (ms) => {
      waits.push(ms);
      nowMs += ms;
    }
  });

  assert.equal(await throttler.acquire({ key: 'a.example' }), 0);
  assert.equal(await throttler.acquire({ key: 'a.example' }), 1000);
  assert.equal(await throttler.acquire({ key: 'b.example' }), 500);

  assert.deepEqual(waits, [1000, 500]);
});

test('request throttler penalize applies cooldown wait to matching key only', async () => {
  let nowMs = 5_000;
  const waits = [];
  const throttler = createRequestThrottler({
    nowFn: () => nowMs,
    sleepFn: async (ms) => {
      waits.push(ms);
      nowMs += ms;
    }
  });

  await throttler.acquire({ key: 'a.example' });
  assert.deepEqual(waits, []);

  const appliedPenaltyMs = throttler.penalize({
    key: 'a.example',
    cooldownMs: 750
  });
  assert.equal(appliedPenaltyMs, 750);

  assert.equal(await throttler.acquire({ key: 'a.example' }), 750);
  assert.deepEqual(waits, [750]);

  assert.equal(await throttler.acquire({ key: 'b.example' }), 0);
  assert.deepEqual(waits, [750]);
});

test('request throttler normalizes keys and applies global penalties across keys', async () => {
  let nowMs = 1_000;
  const waits = [];
  const throttler = createRequestThrottler({
    nowFn: () => nowMs,
    sleepFn: async (ms) => {
      waits.push(ms);
      nowMs += ms;
    }
  });

  assert.equal(
    throttler.penalize({ key: ' GLOBAL ', cooldownMs: 300 }),
    300,
  );
  assert.equal(await throttler.acquire({ key: ' Example.COM ' }), 300);
  assert.deepEqual(waits, [300]);
});

test('host concurrency gate serializes work per host key', async () => {
  const gate = createHostConcurrencyGate({ maxInFlight: 1 });
  let inFlight = 0;
  let maxInFlight = 0;
  const taskA = createDeferred();
  const taskB = createDeferred();
  const taskC = createDeferred();
  const deferredById = { a: taskA, b: taskB, c: taskC };

  const runTask = async (id) =>
    gate.run({
      key: 'example.com',
      task: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await deferredById[id].promise;
        inFlight -= 1;
        return id;
      }
    });

  const rowsPromise = Promise.all([runTask('a'), runTask('b'), runTask('c')]);

  await flushAsyncWork();
  assert.equal(inFlight, 1);

  taskA.resolve();
  await flushAsyncWork();
  assert.equal(inFlight, 1);

  taskB.resolve();
  await flushAsyncWork();
  assert.equal(inFlight, 1);

  taskC.resolve();
  const rows = await rowsPromise;

  assert.deepEqual(rows.sort(), ['a', 'b', 'c']);
  assert.equal(maxInFlight, 1);
});

test('host concurrency gate allows parallel work across different host keys', async () => {
  const gate = createHostConcurrencyGate({ maxInFlight: 1 });
  let inFlight = 0;
  let maxInFlight = 0;
  const taskA = createDeferred();
  const taskB = createDeferred();

  const workPromise = Promise.all([
    gate.run({
      key: 'a.example',
      task: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await taskA.promise;
        inFlight -= 1;
      }
    }),
    gate.run({
      key: 'b.example',
      task: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await taskB.promise;
        inFlight -= 1;
      }
    })
  ]);

  await flushAsyncWork();
  taskA.resolve();
  taskB.resolve();
  await workPromise;

  assert.equal(maxInFlight >= 2, true);
});

test('host concurrency gate releases the slot after task rejection and validates task shape', async () => {
  const gate = createHostConcurrencyGate({ maxInFlight: 1 });
  const blocker = createDeferred();
  const started = [];

  const failingPromise = gate.run({
    key: 'example.com',
    task: async () => {
      started.push('first');
      await blocker.promise;
      throw new Error('gate_boom');
    }
  });
  const succeedingPromise = gate.run({
    key: 'example.com',
    task: async () => {
      started.push('second');
      return 'ok';
    }
  });

  await flushAsyncWork();
  assert.deepEqual(started, ['first']);

  blocker.resolve();
  await assert.rejects(failingPromise, /gate_boom/);
  assert.equal(await succeedingPromise, 'ok');
  assert.deepEqual(started, ['first', 'second']);

  await assert.rejects(
    gate.run({ key: 'example.com', task: null }),
    /task must be a function/,
  );
});
