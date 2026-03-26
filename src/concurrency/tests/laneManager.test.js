import test from 'node:test';
import assert from 'node:assert/strict';
import { LaneManager } from '../laneManager.js';

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

test('creates 4 lanes with default concurrency', () => {
  const lm = new LaneManager();
  const snapshot = lm.snapshot();

  assert.ok(snapshot.search, 'Expected search lane');
  assert.ok(snapshot.fetch, 'Expected fetch lane');
  assert.ok(snapshot.parse, 'Expected parse lane');
  assert.ok(snapshot.llm, 'Expected llm lane');

  assert.equal(snapshot.search.concurrency, 2);
  assert.equal(snapshot.fetch.concurrency, 4);
  assert.equal(snapshot.parse.concurrency, 4);
  assert.equal(snapshot.llm.concurrency, 2);
});

test('creates lanes with custom concurrency', () => {
  const lm = new LaneManager({
    search: { concurrency: 1 },
    fetch: { concurrency: 8 },
    parse: { concurrency: 6 },
    llm: { concurrency: 3 }
  });
  const snapshot = lm.snapshot();

  assert.equal(snapshot.search.concurrency, 1);
  assert.equal(snapshot.fetch.concurrency, 8);
  assert.equal(snapshot.parse.concurrency, 6);
  assert.equal(snapshot.llm.concurrency, 3);
});

test('dispatch runs task in correct lane', async () => {
  const lm = new LaneManager();
  let ran = false;

  const result = await lm.dispatch('search', async () => {
    ran = true;
    return 42;
  });

  assert.ok(ran, 'Task should have run');
  assert.equal(result, 42);

  const snapshot = lm.snapshot();
  assert.equal(snapshot.search.completed, 1);
});

test('dispatch throws for unknown lane', async () => {
  const lm = new LaneManager();
  await assert.rejects(
    () => lm.dispatch('invalid', async () => {}),
    (err) => err.message.includes('Unknown lane')
  );
});

test('pause prevents new tasks from starting, resume unblocks', async () => {
  const lm = new LaneManager({ search: { concurrency: 1 } });
  lm.pause('search');

  const snapshot = lm.snapshot();
  assert.equal(snapshot.search.paused, true);

  let started = false;
  const taskPromise = lm.dispatch('search', async () => {
    started = true;
    return 'done';
  });

  await flushAsyncWork();
  assert.equal(started, false, 'Task should not start while paused');

  lm.resume('search');
  const result = await taskPromise;
  assert.equal(result, 'done');
  assert.equal(started, true, 'Task should run after resume');
});

test('setConcurrency changes lane concurrency at runtime', () => {
  const lm = new LaneManager({ fetch: { concurrency: 4 } });

  lm.setConcurrency('fetch', 8);
  const snapshot = lm.snapshot();
  assert.equal(snapshot.fetch.concurrency, 8);
});

test('setConcurrency clamps to minimum 1', () => {
  const lm = new LaneManager();
  lm.setConcurrency('search', 0);
  const snapshot = lm.snapshot();
  assert.equal(snapshot.search.concurrency, 1);
});

test('snapshot reports per-lane stats', async () => {
  const lm = new LaneManager();
  await lm.dispatch('search', async () => 'a');
  await lm.dispatch('fetch', async () => 'b');
  await lm.dispatch('fetch', async () => 'c');

  const snapshot = lm.snapshot();
  assert.equal(snapshot.search.completed, 1);
  assert.equal(snapshot.fetch.completed, 2);
  assert.equal(snapshot.parse.completed, 0);
  assert.equal(snapshot.llm.completed, 0);
});

test('drain waits for all lanes to complete', async () => {
  const lm = new LaneManager();
  let count = 0;
  const searchTask = createDeferred();
  const fetchTask = createDeferred();
  const parseTask = createDeferred();

  lm.dispatch('search', async () => { await searchTask.promise; count += 1; });
  lm.dispatch('fetch', async () => { await fetchTask.promise; count += 1; });
  lm.dispatch('parse', async () => { await parseTask.promise; count += 1; });

  const drainPromise = lm.drain();
  searchTask.resolve();
  fetchTask.resolve();
  parseTask.resolve();
  await drainPromise;
  assert.equal(count, 3, 'All tasks should complete before drain resolves');
});

test('withBudgetGuard rejects task when budget check fails', async () => {
  const lm = new LaneManager();
  const mockBudget = { canFetchUrl: () => false };

  const result = await lm.dispatchWithBudget('fetch', async () => 'done', {
    budgetEnforcer: mockBudget,
    budgetCheck: 'canFetchUrl'
  });

  assert.equal(result, null, 'Should return null when budget exhausted');
  const snapshot = lm.snapshot();
  assert.equal(snapshot.fetch.completed, 0, 'Task should not have run');
  assert.equal(snapshot.fetch.budget_rejected, 1, 'Should track budget rejections');
});

test('withBudgetGuard runs task when budget check passes', async () => {
  const lm = new LaneManager();
  const mockBudget = { canFetchUrl: () => true };

  const result = await lm.dispatchWithBudget('fetch', async () => 'done', {
    budgetEnforcer: mockBudget,
    budgetCheck: 'canFetchUrl'
  });

  assert.equal(result, 'done');
  const snapshot = lm.snapshot();
  assert.equal(snapshot.fetch.completed, 1);
});

test('failed lane tasks increment failure stats and release queued work', async () => {
  const lm = new LaneManager({ search: { concurrency: 1 } });
  const firstTask = createDeferred();
  const taskOrder = [];

  const failingPromise = lm.dispatch('search', async () => {
    taskOrder.push('first-start');
    await firstTask.promise;
    taskOrder.push('first-fail');
    throw new Error('lane_boom');
  });
  const succeedingPromise = lm.dispatch('search', async () => {
    taskOrder.push('second-start');
    return 'ok';
  });

  await flushAsyncWork();
  assert.deepEqual(taskOrder, ['first-start']);
  assert.equal(lm.snapshot().search.queued, 1);

  firstTask.resolve();
  await assert.rejects(failingPromise, /lane_boom/);
  assert.equal(await succeedingPromise, 'ok');

  assert.deepEqual(taskOrder, ['first-start', 'first-fail', 'second-start']);
  assert.deepEqual(lm.snapshot().search, {
    name: 'search',
    concurrency: 1,
    active: 0,
    queued: 0,
    completed: 1,
    failed: 1,
    budget_rejected: 0,
    paused: false,
  });
});
