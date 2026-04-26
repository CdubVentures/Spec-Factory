import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectActivePublisherReconcileOperation } from '../publisherReconcileOperations.ts';
import type { Operation } from '../../../operations/state/operationsStore.ts';

function makeOp(overrides: Partial<Operation>): Operation {
  return {
    id: 'op-1',
    type: 'publisher-reconcile',
    category: 'mouse',
    productId: '',
    productLabel: '',
    stages: ['Scan', 'Apply'],
    currentStageIndex: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [],
    ...overrides,
  };
}

describe('selectActivePublisherReconcileOperation', () => {
  it('returns null when no matching operation is running', () => {
    const operations = new Map([
      ['done', makeOp({ id: 'done', status: 'done' })],
      ['other-type', makeOp({ id: 'other-type', type: 'compile', status: 'running' })],
      ['other-category', makeOp({ id: 'other-category', category: 'keyboard', status: 'running' })],
    ]);
    assert.equal(selectActivePublisherReconcileOperation(operations, 'mouse'), null);
  });

  it('returns the running reconcile operation for the active category', () => {
    const running = makeOp({ id: 'run-1', category: 'mouse', status: 'running' });
    const operations = new Map([
      ['other', makeOp({ id: 'other', category: 'keyboard', status: 'running' })],
      [running.id, running],
    ]);
    assert.equal(selectActivePublisherReconcileOperation(operations, 'mouse'), running);
  });
});
