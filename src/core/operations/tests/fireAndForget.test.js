import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fireAndForget } from '../fireAndForget.js';

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

describe('fireAndForget', () => {
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
        rejections: [{ reason_code: 'llm_error', message: 'LLM call failed' }],
      }),
      completeOperation: tracker.completeOperation,
      failOperation: tracker.failOperation,
    });

    await flush();
    assert.equal(tracker.failed.length, 1);
    assert.equal(tracker.failed[0].id, 'op-3');
    assert.equal(tracker.failed[0].error, 'LLM call failed');
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
});
