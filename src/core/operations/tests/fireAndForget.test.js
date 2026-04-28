import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ACTIVE_OPERATIONS,
  _resetActiveOperationGateForTest,
  fireAndForget,
} from '../fireAndForget.js';
import {
  _resetForTest as resetOperationsRegistryForTest,
  completeOperation as registryCompleteOperation,
  dismissOperation,
  failOperation as registryFailOperation,
  listOperations,
  registerOperation,
} from '../operationsRegistry.js';

function makeJsonCapture() {
  const calls = [];
  const jsonRes = (res, status, body) => { calls.push({ status, body }); return true; };
  return { jsonRes, calls };
}

function makeBatcher() {
  let disposed = false;
  return {
    dispose() { disposed = true; },
    get disposed() { return disposed; },
  };
}

function makeTracker() {
  const completed = [];
  const failed = [];
  const cancelled = [];
  const emitted = [];
  return {
    completeOperation: ({ id }) => completed.push(id),
    failOperation: ({ id, error }) => failed.push({ id, error }),
    cancelOperation: ({ id }) => cancelled.push(id),
    emitDataChange: (args) => emitted.push(args),
    completed,
    failed,
    cancelled,
    emitted,
  };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function makeDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const VALID_OP = {
  type: 'pif',
  category: 'mouse',
  productId: 'mouse-001',
  productLabel: 'Corsair M75 Air',
  stages: ['Discovery', 'Download', 'Processing', 'Complete'],
};

describe('fireAndForget', () => {
  beforeEach(() => {
    _resetActiveOperationGateForTest();
    resetOperationsRegistryForTest();
  });

  it('returns 202 with operationId before asyncWork completes', () => {
    const { jsonRes, calls } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-1' };

    // asyncWork never resolves in this test — we only check the synchronous return
    const result = fireAndForget({
      res: {},
      jsonRes,
      op,
      asyncWork: () => new Promise(() => {}),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    assert.equal(result, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status, 202);
    assert.deepEqual(calls[0].body, { ok: true, operationId: 'op-1' });
  });

  it('calls completeOperation on successful result', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-2' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      asyncWork: async () => ({ rejected: false }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    await flush();
    assert.equal(tracker.completed.length, 1);
    assert.equal(tracker.completed[0], 'op-2');
    assert.equal(tracker.failed.length, 0);
  });

  it('calls failOperation on rejected result ({ rejected: true })', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-3' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      asyncWork: async () => ({
        rejected: true,
        rejections: [{ reason_code: 'llm_error', message: 'Provider route circuit open' }],
      }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    await flush();
    assert.equal(tracker.failed.length, 1);
    assert.equal(tracker.failed[0].id, 'op-3');
    assert.equal(tracker.failed[0].error, 'Provider route circuit open');
    assert.equal(tracker.completed.length, 0);
  });

  it('calls failOperation on thrown error', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-4' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      asyncWork: async () => { throw new Error('boom'); },
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    await flush();
    assert.equal(tracker.failed.length, 1);
    assert.equal(tracker.failed[0].id, 'op-4');
    assert.equal(tracker.failed[0].error, 'boom');
    assert.equal(tracker.completed.length, 0);
  });

  it('emits data-change on successful result', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-5' };
    const broadcastWs = () => {};
    const emitArgs = { event: 'test-run', category: 'cat' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      broadcastWs,
      emitArgs,
      asyncWork: async () => ({ rejected: false }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      emitDataChange: tracker.emitDataChange,
    });

    await flush();
    assert.equal(tracker.emitted.length, 1);
    assert.equal(tracker.emitted[0].event, 'test-run');
    assert.equal(tracker.emitted[0].broadcastWs, broadcastWs);
  });

  it('stamps terminal success data-change with operation correlation metadata', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-terminal-success' };
    const broadcastWs = () => {};
    const emitArgs = {
      event: 'test-run',
      category: 'cat',
      meta: { productId: 'mouse-1' },
    };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      broadcastWs,
      emitArgs,
      asyncWork: async () => ({ rejected: false }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      emitDataChange: tracker.emitDataChange,
    });

    await flush();
    assert.deepEqual(tracker.emitted[0].meta, {
      productId: 'mouse-1',
      operationId: 'op-terminal-success',
      operationStatus: 'done',
    });
  });

  it('emits data-change on rejected result (rejected runs are valid state)', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-6' };
    const broadcastWs = () => {};
    const emitArgs = { event: 'test-run', category: 'cat' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      broadcastWs,
      emitArgs,
      asyncWork: async () => ({
        rejected: true,
        rejections: [{ reason_code: 'validation', message: 'bad' }],
      }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      emitDataChange: tracker.emitDataChange,
    });

    await flush();
    assert.equal(tracker.emitted.length, 1);
    assert.equal(tracker.emitted[0].event, 'test-run');
    assert.deepEqual(tracker.emitted[0].meta, {
      operationId: 'op-6',
      operationStatus: 'error',
    });
  });

  it('does NOT emit data-change on thrown error', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-7' };
    const broadcastWs = () => {};
    const emitArgs = { event: 'test-run', category: 'cat' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      broadcastWs,
      emitArgs,
      asyncWork: async () => { throw new Error('crash'); },
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      emitDataChange: tracker.emitDataChange,
    });

    await flush();
    assert.equal(tracker.emitted.length, 0);
  });

  it('disposes batcher on success', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const batcher = makeBatcher();
    const op = { id: 'op-8' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      batcher,
      asyncWork: async () => ({ rejected: false }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    await flush();
    assert.equal(batcher.disposed, true);
  });

  it('disposes batcher on rejection', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const batcher = makeBatcher();
    const op = { id: 'op-9' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      batcher,
      asyncWork: async () => ({ rejected: true, rejections: [] }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    await flush();
    assert.equal(batcher.disposed, true);
  });

  it('disposes batcher on thrown error', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const batcher = makeBatcher();
    const op = { id: 'op-10' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      batcher,
      asyncWork: async () => { throw new Error('fail'); },
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    await flush();
    assert.equal(batcher.disposed, true);
  });

  // ── Cancellation ───────────────────────────────────────────────

  it('calls cancelOperation (not failOperation) when asyncWork throws AbortError', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-cancel-1' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      asyncWork: async () => { throw new DOMException('Operation cancelled', 'AbortError'); },
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      cancelOperation: tracker.cancelOperation,
    });

    await flush();
    assert.equal(tracker.cancelled.length, 1);
    assert.equal(tracker.cancelled[0], 'op-cancel-1');
    assert.equal(tracker.failed.length, 0);
    assert.equal(tracker.completed.length, 0);
  });

  it('calls cancelOperation when asyncWork resolves but signal was aborted (loop graceful exit)', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-cancel-2' };
    const controller = new AbortController();
    controller.abort();

    fireAndForget({
      res: {},
      jsonRes,
      op,
      signal: controller.signal,
      asyncWork: async () => ({ rejected: false }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      cancelOperation: tracker.cancelOperation,
    });

    await flush();
    assert.equal(tracker.cancelled.length, 1);
    assert.equal(tracker.cancelled[0], 'op-cancel-2');
    assert.equal(tracker.completed.length, 0);
  });

  it('emits data-change on cancel when emitArgs provided', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-cancel-3' };
    const broadcastWs = () => {};
    const emitArgs = { event: 'test-cancel', category: 'cat' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      broadcastWs,
      emitArgs,
      asyncWork: async () => { throw new DOMException('Aborted', 'AbortError'); },
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      cancelOperation: tracker.cancelOperation,
      emitDataChange: tracker.emitDataChange,
    });

    await flush();
    assert.equal(tracker.emitted.length, 1);
    assert.equal(tracker.emitted[0].event, 'test-cancel');
    assert.deepEqual(tracker.emitted[0].meta, {
      operationId: 'op-cancel-3',
      operationStatus: 'cancelled',
    });
  });

  it('disposes batcher on cancel', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const batcher = makeBatcher();
    const op = { id: 'op-cancel-4' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      batcher,
      asyncWork: async () => { throw new DOMException('Aborted', 'AbortError'); },
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      cancelOperation: tracker.cancelOperation,
    });

    await flush();
    assert.equal(batcher.disposed, true);
    assert.equal(tracker.cancelled.length, 1);
  });

  it('existing behavior unchanged when no signal or cancelOperation provided', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const op = { id: 'op-compat' };

    fireAndForget({
      res: {},
      jsonRes,
      op,
      asyncWork: async () => ({ rejected: false }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    await flush();
    assert.equal(tracker.completed.length, 1);
    assert.equal(tracker.failed.length, 0);
  });

  it('caps active top-level operations at 100 and queues overflow', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const blockers = Array.from({ length: MAX_ACTIVE_OPERATIONS + 1 }, makeDeferred);
    const statuses = new Map();
    const started = [];
    const queued = [];

    for (let i = 0; i < MAX_ACTIVE_OPERATIONS + 1; i += 1) {
      const id = `op-cap-${i}`;
      statuses.set(id, 'running');
      fireAndForget({
        res: {},
        jsonRes,
        op: { id },
        asyncWork: async () => {
          started.push(id);
          await blockers[i].promise;
          return { rejected: false };
        },
        completeOperation: tracker.completeOperation,
        failOperation: tracker.failOperation,
        queueOperation: ({ id: queuedId }) => {
          queued.push(queuedId);
          statuses.set(queuedId, 'queued');
        },
        setOperationStatus: ({ id: statusId, status }) => statuses.set(statusId, status),
        getOperationStatus: (statusId) => statuses.get(statusId),
      });
    }

    await flush();

    assert.equal(started.length, MAX_ACTIVE_OPERATIONS);
    assert.deepEqual(queued, [`op-cap-${MAX_ACTIVE_OPERATIONS}`]);
    assert.equal(statuses.get(`op-cap-${MAX_ACTIVE_OPERATIONS}`), 'queued');

    blockers[0].resolve();
    await flush();

    assert.equal(started.length, MAX_ACTIVE_OPERATIONS + 1);
    assert.equal(statuses.get(`op-cap-${MAX_ACTIVE_OPERATIONS}`), 'running');

    for (let i = 1; i < blockers.length; i += 1) blockers[i].resolve();
    await flush();
  });

  it('does not start a queued operation that was cancelled before a slot opens', async () => {
    const { jsonRes } = makeJsonCapture();
    const tracker = makeTracker();
    const blockers = Array.from({ length: MAX_ACTIVE_OPERATIONS }, makeDeferred);
    const statuses = new Map();
    const started = [];
    const batcher = makeBatcher();
    let settledCount = 0;

    for (let i = 0; i < MAX_ACTIVE_OPERATIONS; i += 1) {
      const id = `op-running-${i}`;
      statuses.set(id, 'running');
      fireAndForget({
        res: {},
        jsonRes,
        op: { id },
        asyncWork: async () => {
          started.push(id);
          await blockers[i].promise;
          return { rejected: false };
        },
        completeOperation: tracker.completeOperation,
        failOperation: tracker.failOperation,
        setOperationStatus: ({ id: statusId, status }) => statuses.set(statusId, status),
        getOperationStatus: (statusId) => statuses.get(statusId),
      });
    }

    statuses.set('op-cancelled-before-start', 'running');
    fireAndForget({
      res: {},
      jsonRes,
      op: { id: 'op-cancelled-before-start' },
      batcher,
      asyncWork: async () => {
        started.push('op-cancelled-before-start');
        return { rejected: false };
      },
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
      queueOperation: ({ id }) => statuses.set(id, 'queued'),
      setOperationStatus: ({ id, status }) => statuses.set(id, status),
      getOperationStatus: (id) => statuses.get(id),
      onSettled: () => { settledCount += 1; },
    });

    await flush();
    statuses.set('op-cancelled-before-start', 'cancelled');

    blockers[0].resolve();
    await flush();

    assert.equal(started.includes('op-cancelled-before-start'), false);
    assert.equal(batcher.disposed, true);
    assert.equal(settledCount, 1);

    for (let i = 1; i < blockers.length; i += 1) blockers[i].resolve();
    await flush();
  });

  it('marks overflow registry operations queued until an active slot opens', async () => {
    const { jsonRes } = makeJsonCapture();
    const blockers = Array.from({ length: MAX_ACTIVE_OPERATIONS + 1 }, makeDeferred);
    const started = [];
    const ids = [];

    for (let i = 0; i < MAX_ACTIVE_OPERATIONS + 1; i += 1) {
      const op = registerOperation({ ...VALID_OP, productId: `mouse-${i}` });
      ids.push(op.id);
      fireAndForget({
        res: {},
        jsonRes,
        op,
        asyncWork: async () => {
          started.push(op.id);
          await blockers[i].promise;
          return { rejected: false };
        },
        completeOperation: registryCompleteOperation,
        failOperation: registryFailOperation,
      });
    }

    await flush();

    const queuedId = ids[MAX_ACTIVE_OPERATIONS];
    assert.equal(started.length, MAX_ACTIVE_OPERATIONS);
    assert.equal(listOperations().find((op) => op.id === queuedId)?.status, 'queued');

    blockers[0].resolve();
    await flush();

    assert.equal(started.includes(queuedId), true);
    assert.equal(listOperations().find((op) => op.id === queuedId)?.status, 'running');

    for (let i = 1; i < blockers.length; i += 1) blockers[i].resolve();
    await flush();
  });

  it('skips a queued registry operation that is dismissed before a slot opens', async () => {
    const { jsonRes } = makeJsonCapture();
    const blockers = Array.from({ length: MAX_ACTIVE_OPERATIONS }, makeDeferred);
    const started = [];
    const batcher = makeBatcher();
    let settledCount = 0;

    for (let i = 0; i < MAX_ACTIVE_OPERATIONS; i += 1) {
      const op = registerOperation({ ...VALID_OP, productId: `mouse-running-${i}` });
      fireAndForget({
        res: {},
        jsonRes,
        op,
        asyncWork: async () => {
          started.push(op.id);
          await blockers[i].promise;
          return { rejected: false };
        },
        completeOperation: registryCompleteOperation,
        failOperation: registryFailOperation,
      });
    }

    const queuedOp = registerOperation({ ...VALID_OP, productId: 'mouse-dismissed' });
    fireAndForget({
      res: {},
      jsonRes,
      op: queuedOp,
      batcher,
      asyncWork: async () => {
        started.push(queuedOp.id);
        return { rejected: false };
      },
      completeOperation: registryCompleteOperation,
      failOperation: registryFailOperation,
      onSettled: () => { settledCount += 1; },
    });

    await flush();
    assert.equal(listOperations().find((op) => op.id === queuedOp.id)?.status, 'queued');

    dismissOperation({ id: queuedOp.id });
    blockers[0].resolve();
    await flush();

    assert.equal(started.includes(queuedOp.id), false);
    assert.equal(batcher.disposed, true);
    assert.equal(settledCount, 1);

    for (let i = 1; i < blockers.length; i += 1) blockers[i].resolve();
    await flush();
  });
});
