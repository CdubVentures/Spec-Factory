import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { _resetForTest as resetMutex } from '../categoryMutex.js';
import {
  _resetForTest as resetOps,
  initOperationsRegistry,
  listOperations,
} from '../operationsRegistry.js';

// WHY: commandExecutor uses dynamic import + operationsRegistry internally.
// We test through the public contract, injecting deps.

describe('commandExecutor — contract', () => {
  let executeCommand;

  beforeEach(async () => {
    resetMutex();
    resetOps();
    initOperationsRegistry({ broadcastWs: () => {} });
    // Fresh import to avoid stale module state
    const mod = await import('../commandExecutor.js');
    executeCommand = mod.executeCommand;
  });

  it('happy path: registers operation, calls handler, completes', async () => {
    const handler = mock.fn(async ({ category }) => ({ category, compiled: true }));

    const result = await executeCommand({
      type: 'compile',
      category: 'mouse',
      config: {},
      deps: {},
      _handlerOverride: handler,
    });

    assert.ok(result.operationId, 'should return operationId');
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(handler.mock.calls.length, 1);
    assert.strictEqual(handler.mock.calls[0].arguments[0].category, 'mouse');

    // Operation should be completed
    const ops = listOperations();
    const op = ops.find(o => o.id === result.operationId);
    assert.ok(op, 'operation should exist');
    assert.strictEqual(op.status, 'done');
  });

  it('handler throws: operation marked as failed, mutex released', async () => {
    const handler = mock.fn(async () => { throw new Error('compile crashed'); });

    const result = await executeCommand({
      type: 'compile',
      category: 'mouse',
      config: {},
      deps: {},
      _handlerOverride: handler,
    });

    assert.ok(result.operationId);
    const ops = listOperations();
    const op = ops.find(o => o.id === result.operationId);
    assert.strictEqual(op.status, 'error');
    assert.ok(op.error.includes('compile crashed'));

    // Mutex should be released — next acquire should succeed
    const { acquireCategoryLock } = await import('../categoryMutex.js');
    const lock = acquireCategoryLock('mouse');
    assert.strictEqual(lock.acquired, true);
    lock.release();
  });

  it('compile handler returning compiled:false marks operation as failed', async () => {
    const handler = mock.fn(async () => ({
      category: 'mouse',
      compiled: false,
      errors: ['field sensor_latency_wired: enum_source is required'],
    }));

    const result = await executeCommand({
      type: 'compile',
      category: 'mouse',
      config: {},
      deps: {},
      _handlerOverride: handler,
    });

    assert.ok(result.operationId);
    const ops = listOperations();
    const op = ops.find(o => o.id === result.operationId);
    assert.strictEqual(op.status, 'error');
    assert.ok(op.error.includes('field sensor_latency_wired: enum_source is required'));
  });

  it('unknown type: throws immediately', async () => {
    await assert.rejects(
      () => executeCommand({ type: 'nonexistent', category: 'mouse', config: {}, deps: {} }),
      (err) => err.message.includes('nonexistent'),
    );
  });

  it('category busy: returns error without registering operation', async () => {
    // Lock the category first
    const { acquireCategoryLock } = await import('../categoryMutex.js');
    acquireCategoryLock('mouse');

    const handler = mock.fn(async () => ({ ok: true }));
    const result = await executeCommand({
      type: 'compile',
      category: 'mouse',
      config: {},
      deps: {},
      _handlerOverride: handler,
    });

    assert.strictEqual(result.error, 'category_busy');
    assert.strictEqual(handler.mock.calls.length, 0, 'handler should not be called');
  });

  it('postComplete failure does not fail the operation', async () => {
    const handler = mock.fn(async () => ({ compiled: true }));
    const postComplete = mock.fn(async () => { throw new Error('sync failed'); });

    const result = await executeCommand({
      type: 'compile',
      category: 'mouse',
      config: {},
      deps: {},
      _handlerOverride: handler,
      _postCompleteOverride: postComplete,
    });

    const ops = listOperations();
    const op = ops.find(o => o.id === result.operationId);
    assert.strictEqual(op.status, 'done', 'operation should still be done despite postComplete failure');
    assert.strictEqual(postComplete.mock.calls.length, 1);
  });

  it('non-mutating command does not acquire mutex', async () => {
    const handler = mock.fn(async () => ({ valid: true }));

    const result = await executeCommand({
      type: 'validate',
      category: 'mouse',
      config: {},
      deps: {},
      _handlerOverride: handler,
    });

    assert.ok(result.operationId);
    assert.strictEqual(result.error, undefined);

    // Another validate on same category should work (no mutex)
    const result2 = await executeCommand({
      type: 'validate',
      category: 'mouse',
      config: {},
      deps: {},
      _handlerOverride: handler,
    });
    assert.ok(result2.operationId);
    assert.strictEqual(result2.error, undefined);
  });
});
