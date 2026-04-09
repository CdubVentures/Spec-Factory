import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initOperationsRegistry,
  registerOperation,
  updateStage,
  completeOperation,
  failOperation,
  listOperations,
  _resetForTest,
} from '../operationsRegistry.js';

function makeBroadcastSpy() {
  const calls = [];
  const fn = (channel, data) => calls.push({ channel, data });
  fn.calls = calls;
  return fn;
}

const VALID_OP = {
  type: 'cef',
  category: 'mouse',
  productId: 'mouse-001',
  productLabel: 'Corsair M75 Air',
  stages: ['LLM', 'Validate'],
};

// ── registerOperation ────────────────────────────────────────────────

describe('registerOperation', () => {
  beforeEach(() => _resetForTest());

  it('returns an object with a string id', () => {
    const result = registerOperation(VALID_OP);
    assert.ok(result.id);
    assert.equal(typeof result.id, 'string');
  });

  it('sets status to running and startedAt to ISO string', () => {
    registerOperation(VALID_OP);
    const ops = listOperations();
    assert.equal(ops.length, 1);
    assert.equal(ops[0].status, 'running');
    assert.ok(ops[0].startedAt.includes('T'), 'startedAt is ISO');
    assert.equal(ops[0].endedAt, null);
    assert.equal(ops[0].error, null);
    assert.equal(ops[0].currentStageIndex, 0);
  });

  it('throws when type is missing', () => {
    assert.throws(
      () => registerOperation({ ...VALID_OP, type: '' }),
      /type.*required/i,
    );
  });

  it('preserves all provided fields', () => {
    registerOperation(VALID_OP);
    const op = listOperations()[0];
    assert.equal(op.type, 'cef');
    assert.equal(op.category, 'mouse');
    assert.equal(op.productId, 'mouse-001');
    assert.equal(op.productLabel, 'Corsair M75 Air');
    assert.deepEqual(op.stages, ['LLM', 'Validate']);
  });
});

// ── listOperations ───────────────────────────────────────────────────

describe('listOperations', () => {
  beforeEach(() => _resetForTest());

  it('returns empty array when no ops', () => {
    assert.deepEqual(listOperations(), []);
  });

  it('returns ops sorted newest-first by startedAt', () => {
    const op1 = registerOperation({ ...VALID_OP, productId: 'p1' });
    const op2 = registerOperation({ ...VALID_OP, productId: 'p2' });
    const ops = listOperations();
    assert.equal(ops.length, 2);
    assert.equal(ops[0].id, op2.id, 'newest first');
    assert.equal(ops[1].id, op1.id);
  });
});

// ── updateStage ──────────────────────────────────────────────────────

describe('updateStage', () => {
  beforeEach(() => _resetForTest());

  it('advances currentStageIndex by stageIndex', () => {
    const op = registerOperation(VALID_OP);
    updateStage({ id: op.id, stageIndex: 1 });
    const ops = listOperations();
    assert.equal(ops[0].currentStageIndex, 1);
  });

  it('advances by stageName', () => {
    const op = registerOperation(VALID_OP);
    updateStage({ id: op.id, stageName: 'Validate' });
    const ops = listOperations();
    assert.equal(ops[0].currentStageIndex, 1);
  });

  it('no-ops on nonexistent id (no crash)', () => {
    assert.doesNotThrow(() => updateStage({ id: 'ghost', stageIndex: 1 }));
  });
});

// ── completeOperation ────────────────────────────────────────────────

describe('completeOperation', () => {
  beforeEach(() => _resetForTest());

  it('sets status=done and endedAt', () => {
    const op = registerOperation(VALID_OP);
    completeOperation({ id: op.id });
    const ops = listOperations();
    assert.equal(ops[0].status, 'done');
    assert.ok(ops[0].endedAt);
    assert.equal(ops[0].error, null);
  });

  it('is idempotent on already-done op', () => {
    const op = registerOperation(VALID_OP);
    completeOperation({ id: op.id });
    const first = listOperations()[0].endedAt;
    completeOperation({ id: op.id });
    assert.equal(listOperations()[0].endedAt, first);
  });
});

// ── failOperation ────────────────────────────────────────────────────

describe('failOperation', () => {
  beforeEach(() => _resetForTest());

  it('sets status=error, error message, and endedAt', () => {
    const op = registerOperation(VALID_OP);
    failOperation({ id: op.id, error: 'Validation rejected' });
    const ops = listOperations();
    assert.equal(ops[0].status, 'error');
    assert.equal(ops[0].error, 'Validation rejected');
    assert.ok(ops[0].endedAt);
  });
});

// ── broadcastWs integration ──────────────────────────────────────────

describe('broadcastWs integration', () => {
  beforeEach(() => _resetForTest());

  it('register broadcasts upsert on operations channel', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    registerOperation(VALID_OP);
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].channel, 'operations');
    assert.equal(spy.calls[0].data.action, 'upsert');
    assert.equal(spy.calls[0].data.operation.status, 'running');
  });

  it('updateStage broadcasts upsert', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const op = registerOperation(VALID_OP);
    spy.calls.length = 0;
    updateStage({ id: op.id, stageIndex: 1 });
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].data.action, 'upsert');
    assert.equal(spy.calls[0].data.operation.currentStageIndex, 1);
  });

  it('completeOperation broadcasts upsert with done', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const op = registerOperation(VALID_OP);
    spy.calls.length = 0;
    completeOperation({ id: op.id });
    assert.equal(spy.calls[0].data.action, 'upsert');
    assert.equal(spy.calls[0].data.operation.status, 'done');
  });

  it('failOperation broadcasts upsert with error', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const op = registerOperation(VALID_OP);
    spy.calls.length = 0;
    failOperation({ id: op.id, error: 'boom' });
    assert.equal(spy.calls[0].data.action, 'upsert');
    assert.equal(spy.calls[0].data.operation.status, 'error');
  });

  it('mutations succeed silently when broadcastWs not initialized', () => {
    // _resetForTest clears broadcastWs — no init call
    assert.doesNotThrow(() => {
      const op = registerOperation(VALID_OP);
      updateStage({ id: op.id, stageIndex: 1 });
      completeOperation({ id: op.id });
    });
  });
});

// ── concurrent operations ────────────────────────────────────────────

describe('concurrent operations', () => {
  beforeEach(() => _resetForTest());

  it('tracks multiple operations independently', () => {
    const op1 = registerOperation({ ...VALID_OP, productId: 'p1' });
    const op2 = registerOperation({ ...VALID_OP, productId: 'p2' });
    updateStage({ id: op1.id, stageIndex: 1 });
    completeOperation({ id: op2.id });

    const ops = listOperations();
    const o1 = ops.find(o => o.id === op1.id);
    const o2 = ops.find(o => o.id === op2.id);
    assert.equal(o1.currentStageIndex, 1);
    assert.equal(o1.status, 'running');
    assert.equal(o2.status, 'done');
  });
});
