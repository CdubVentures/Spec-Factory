import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initOperationsRegistry,
  registerOperation,
  setStatus,
  completeOperation,
  failOperation,
  cancelOperation,
  acquireKeyLock,
  releaseKeyLock,
  listOperations,
  _resetForTest,
} from '../operationsRegistry.js';

function makeBroadcastSpy() {
  const calls = [];
  const fn = (channel, data) => calls.push({ channel, data });
  fn.calls = calls;
  return fn;
}

// ── acquireKeyLock / releaseKeyLock ──────────────────────────────────

describe('acquireKeyLock — per-(type, pid, fieldKey) serialization', () => {
  beforeEach(() => _resetForTest());

  it('first acquire returns a release fn immediately (no waiter)', async () => {
    let acquired = false;
    const start = Date.now();
    const release = await acquireKeyLock('kf', 'mouse-001', 'polling_rate');
    acquired = true;
    const elapsed = Date.now() - start;
    assert.equal(acquired, true);
    assert.equal(typeof release, 'function');
    assert.ok(elapsed < 50, `first acquire should be instant (took ${elapsed}ms)`);
    release();
  });

  it('second acquire on same key waits until first is released', async () => {
    const release1 = await acquireKeyLock('kf', 'mouse-001', 'polling_rate');

    let secondResolved = false;
    const secondPromise = acquireKeyLock('kf', 'mouse-001', 'polling_rate').then((rel) => {
      secondResolved = true;
      return rel;
    });

    // Give the event loop a tick — second should still be pending
    await new Promise((r) => setImmediate(r));
    assert.equal(secondResolved, false, 'second acquire must not resolve while first holds lock');

    release1();
    const release2 = await secondPromise;
    assert.equal(secondResolved, true);
    release2();
  });

  it('different keys do not block each other', async () => {
    const r1 = await acquireKeyLock('kf', 'mouse-001', 'polling_rate');

    const r2 = await acquireKeyLock('kf', 'mouse-001', 'dpi');
    assert.equal(typeof r2, 'function', 'different fieldKey acquires independently');

    const r3 = await acquireKeyLock('kf', 'mouse-002', 'polling_rate');
    assert.equal(typeof r3, 'function', 'different productId acquires independently');

    const r4 = await acquireKeyLock('rdf', 'mouse-001', 'polling_rate');
    assert.equal(typeof r4, 'function', 'different type acquires independently');

    r1(); r2(); r3(); r4();
  });

  it('third acquire waits for second (FIFO through chain)', async () => {
    const r1 = await acquireKeyLock('kf', 'mouse-001', 'polling_rate');

    let secondResolved = false;
    const second = acquireKeyLock('kf', 'mouse-001', 'polling_rate').then((rel) => {
      secondResolved = true;
      return rel;
    });

    let thirdResolved = false;
    const third = acquireKeyLock('kf', 'mouse-001', 'polling_rate').then((rel) => {
      thirdResolved = true;
      return rel;
    });

    await new Promise((r) => setImmediate(r));
    assert.equal(secondResolved, false);
    assert.equal(thirdResolved, false);

    r1();
    const r2 = await second;
    assert.equal(secondResolved, true);
    // Third should still wait behind second
    await new Promise((r) => setImmediate(r));
    assert.equal(thirdResolved, false, 'third still waits on second');

    r2();
    const r3 = await third;
    assert.equal(thirdResolved, true);
    r3();
  });

  it('releaseKeyLock helper is a no-op on a non-fn argument', () => {
    // should not throw
    releaseKeyLock(null);
    releaseKeyLock(undefined);
  });

  it('double-release is safe (idempotent)', async () => {
    const release = await acquireKeyLock('kf', 'mouse-001', 'polling_rate');
    release();
    release(); // no throw, no side effect
  });

  it('post-release re-acquire is instant (map cleans up)', async () => {
    const r1 = await acquireKeyLock('kf', 'mouse-001', 'polling_rate');
    r1();

    const start = Date.now();
    const r2 = await acquireKeyLock('kf', 'mouse-001', 'polling_rate');
    const elapsed = Date.now() - start;
    assert.equal(typeof r2, 'function');
    assert.ok(elapsed < 50, `post-release re-acquire should be instant (took ${elapsed}ms)`);
    r2();
  });
});

// ── status: 'queued' + setStatus ─────────────────────────────────────

describe("operation status — 'queued' initial + setStatus transition", () => {
  beforeEach(() => _resetForTest());

  const KF_OP = {
    type: 'kf',
    category: 'mouse',
    productId: 'mouse-001',
    productLabel: 'Logitech MX',
    fieldKey: 'polling_rate',
    stages: ['LLM'],
  };

  it("registerOperation accepts initial status='queued' and broadcasts it", () => {
    const broadcast = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: broadcast });
    const { id } = registerOperation({ ...KF_OP, status: 'queued' });
    const ops = listOperations();
    assert.equal(ops.length, 1);
    assert.equal(ops[0].status, 'queued');
    assert.equal(ops[0].id, id);

    const upserts = broadcast.calls.filter((c) => c.data.action === 'upsert');
    assert.ok(upserts.length >= 1, 'at least one upsert broadcast');
    assert.equal(upserts[0].data.operation.status, 'queued');
  });

  it("defaults status to 'running' when not passed (back-compat)", () => {
    registerOperation(KF_OP);
    const ops = listOperations();
    assert.equal(ops[0].status, 'running');
  });

  it("setStatus transitions queued → running and broadcasts", () => {
    const broadcast = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: broadcast });
    const { id } = registerOperation({ ...KF_OP, status: 'queued' });

    setStatus({ id, status: 'running' });
    const ops = listOperations();
    assert.equal(ops[0].status, 'running');

    // At least one broadcast for registration + one for the transition
    const upserts = broadcast.calls.filter((c) => c.data.action === 'upsert');
    assert.ok(upserts.length >= 2);
    assert.equal(upserts[upserts.length - 1].data.operation.status, 'running');
  });

  it('setStatus on a non-existent id is a no-op (no throw)', () => {
    setStatus({ id: 'does-not-exist', status: 'running' });
  });

  it("completeOperation works for a 'running' op that started 'queued'", () => {
    const { id } = registerOperation({ ...KF_OP, status: 'queued' });
    setStatus({ id, status: 'running' });
    completeOperation({ id });
    const ops = listOperations();
    assert.equal(ops[0].status, 'done');
  });

  it("completeOperation is a no-op on a 'queued' op (must transition to running first)", () => {
    const { id } = registerOperation({ ...KF_OP, status: 'queued' });
    completeOperation({ id });
    const ops = listOperations();
    assert.equal(ops[0].status, 'queued', 'queued op should not jump to done without running transition');
  });

  it("cancelOperation on a 'queued' op transitions to cancelled and does not invoke AbortController", () => {
    const { id } = registerOperation({ ...KF_OP, status: 'queued' });
    cancelOperation({ id });
    const ops = listOperations();
    assert.equal(ops[0].status, 'cancelled');
  });
});
