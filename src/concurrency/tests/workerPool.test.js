import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerPool } from '../workerPool.js';

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

// ---------------------------------------------------------------------------
// IP05-5A — Worker Pool + Concurrency Tests
// ---------------------------------------------------------------------------

test('pool: runs tasks up to concurrency limit', async () => {
  const pool = new WorkerPool({ concurrency: 2, name: 'test' });
  const started = [];
  const deferreds = [createDeferred(), createDeferred(), createDeferred()];

  const task = (id) => async () => {
    started.push(id);
    await deferreds[id].promise;
  };

  const p1 = pool.run(task(0));
  const p2 = pool.run(task(1));
  const p3 = pool.run(task(2));

  assert.deepEqual(started, [0, 1]);
  assert.equal(pool.stats().active, 2);
  assert.equal(pool.stats().queued, 1);

  deferreds[0].resolve();
  await flushAsyncWork();
  assert.deepEqual(started, [0, 1, 2]);

  deferreds[1].resolve();
  deferreds[2].resolve();
  await Promise.all([p1, p2, p3]);

  assert.equal(started.length, 3);
  assert.equal(pool.stats().completed, 3);
});

test('pool: respects concurrency=1 (serial execution)', async () => {
  const pool = new WorkerPool({ concurrency: 1, name: 'serial' });
  const order = [];
  const deferredById = new Map();
  const makeTask = (id) => async () => {
    order.push(`start-${id}`);
    const deferred = createDeferred();
    deferredById.set(id, deferred);
    await deferred.promise;
    order.push(`end-${id}`);
    return id;
  };

  const resultsPromise = Promise.all([
    pool.run(makeTask('a')),
    pool.run(makeTask('b')),
    pool.run(makeTask('c'))
  ]);

  assert.deepEqual(order, ['start-a']);

  deferredById.get('a').resolve();
  await flushAsyncWork();
  assert.deepEqual(order, ['start-a', 'end-a', 'start-b']);

  deferredById.get('b').resolve();
  await flushAsyncWork();
  assert.deepEqual(order, ['start-a', 'end-a', 'start-b', 'end-b', 'start-c']);

  deferredById.get('c').resolve();
  const results = await resultsPromise;
  assert.deepEqual(results, ['a', 'b', 'c']);
});

test('pool: handles task errors without blocking pool', async () => {
  const pool = new WorkerPool({ concurrency: 2, name: 'error-test' });
  const failing = () => Promise.reject(new Error('boom'));
  const passing = () => Promise.resolve('ok');

  await assert.rejects(() => pool.run(failing), { message: 'boom' });
  const result = await pool.run(passing);
  assert.equal(result, 'ok');
  assert.equal(pool.stats().failed, 1);
  assert.equal(pool.stats().completed, 1);
});

test('pool: stats tracks active, queued, completed, failed', async () => {
  const pool = new WorkerPool({ concurrency: 1, name: 'stats' });
  let resolveTask;
  const blocker = () => new Promise((resolve) => { resolveTask = resolve; });

  const p1 = pool.run(blocker);
  const p2 = pool.run(() => Promise.resolve('done'));

  // While p1 is running, p2 should be queued
  const midStats = pool.stats();
  assert.equal(midStats.active, 1);
  assert.equal(midStats.queued, 1);

  resolveTask('first');
  await p1;
  await p2;

  const endStats = pool.stats();
  assert.equal(endStats.active, 0);
  assert.equal(endStats.queued, 0);
  assert.equal(endStats.completed, 2);
});

test('pool: default concurrency is 4', () => {
  const pool = new WorkerPool({ name: 'default' });
  assert.equal(pool.stats().concurrency, 4);
});

test('pool: name appears in stats', () => {
  const pool = new WorkerPool({ concurrency: 3, name: 'fetch' });
  assert.equal(pool.stats().name, 'fetch');
  assert.equal(pool.stats().concurrency, 3);
});

test('pool: drain waits for all active and queued tasks', async () => {
  const pool = new WorkerPool({ concurrency: 2, name: 'drain' });
  const results = [];
  const deferredA = createDeferred();
  const deferredB = createDeferred();
  const deferredC = createDeferred();

  pool.run(async () => {
    await deferredA.promise;
    results.push('a');
  });
  pool.run(async () => {
    await deferredB.promise;
    results.push('b');
  });
  pool.run(async () => {
    await deferredC.promise;
    results.push('c');
  });

  const drainPromise = pool.drain();
  deferredA.resolve();
  deferredB.resolve();
  await flushAsyncWork();
  deferredC.resolve();
  await drainPromise;

  assert.equal(results.length, 3);
  assert.ok(results.includes('a'));
  assert.ok(results.includes('b'));
  assert.ok(results.includes('c'));
});

test('pool: high concurrency runs many tasks', async () => {
  const pool = new WorkerPool({ concurrency: 10, name: 'batch' });
  const ids = Array.from({ length: 25 }, (_, i) => i);
  const results = await Promise.all(
    ids.map((id) => pool.run(() => Promise.resolve(id * 2)))
  );
  assert.equal(results.length, 25);
  assert.equal(results[0], 0);
  assert.equal(results[24], 48);
  assert.equal(pool.stats().completed, 25);
});

test('pool: returns task result correctly', async () => {
  const pool = new WorkerPool({ concurrency: 2, name: 'return' });
  const result = await pool.run(() => Promise.resolve({ hello: 'world' }));
  assert.deepEqual(result, { hello: 'world' });
});

test('pool: rejected work releases queued tasks and keeps mixed outcome stats', async () => {
  const pool = new WorkerPool({ concurrency: 1, name: 'mixed' });
  const firstTask = createDeferred();
  const order = [];

  const failingPromise = pool.run(async () => {
    order.push('first-start');
    await firstTask.promise;
    order.push('first-fail');
    throw new Error('pool_boom');
  });
  const succeedingPromise = pool.run(async () => {
    order.push('second-start');
    return 'ok';
  });

  assert.deepEqual(pool.stats(), {
    name: 'mixed',
    concurrency: 1,
    active: 1,
    queued: 1,
    completed: 0,
    failed: 0,
  });

  firstTask.resolve();
  await assert.rejects(failingPromise, /pool_boom/);
  assert.equal(await succeedingPromise, 'ok');
  assert.deepEqual(order, ['first-start', 'first-fail', 'second-start']);
  assert.deepEqual(pool.stats(), {
    name: 'mixed',
    concurrency: 1,
    active: 0,
    queued: 0,
    completed: 1,
    failed: 1,
  });
});

test('pool: drain resolves after rejected tasks finish unwinding', async () => {
  const pool = new WorkerPool({ concurrency: 1, name: 'drain-failure' });
  const blocker = createDeferred();

  const failingPromise = pool.run(async () => {
    await blocker.promise;
    throw new Error('drain_boom');
  }).catch(() => undefined);
  const drainPromise = pool.drain();

  blocker.resolve();
  await Promise.all([failingPromise, drainPromise]);

  assert.deepEqual(pool.stats(), {
    name: 'drain-failure',
    concurrency: 1,
    active: 0,
    queued: 0,
    completed: 0,
    failed: 1,
  });
});
