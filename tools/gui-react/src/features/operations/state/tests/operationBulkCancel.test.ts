import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelActiveOperations,
  formatStopAllActiveOperationsMessage,
  selectActiveOperationIds,
} from '../operationBulkCancel.ts';
import type { Operation } from '../operationsStore.ts';

function op(id: string, status: Operation['status']): Operation {
  return {
    id,
    type: 'pif',
    category: 'mouse',
    productId: `product-${id}`,
    productLabel: `Product ${id}`,
    stages: ['Run', 'Complete'],
    currentStageIndex: 0,
    status,
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [],
  };
}

describe('operation bulk cancel helpers', () => {
  it('selects queued and running operations only', () => {
    const operations = [
      op('queued', 'queued'),
      op('running', 'running'),
      op('done', 'done'),
      op('error', 'error'),
      op('cancelled', 'cancelled'),
    ];

    assert.deepEqual(selectActiveOperationIds(operations), ['queued', 'running']);
  });

  it('preserves the current sidebar order', () => {
    const operations = [
      op('running-newest', 'running'),
      op('queued-middle', 'queued'),
      op('running-oldest', 'running'),
    ];

    assert.deepEqual(selectActiveOperationIds(operations), [
      'running-newest',
      'queued-middle',
      'running-oldest',
    ]);
  });

  it('formats the destructive confirmation copy with the active count', () => {
    assert.equal(
      formatStopAllActiveOperationsMessage(37),
      'Stop 37 active operations?\n\nQueued operations will not start. Running operations will be asked to cancel and may finish their current provider call first.',
    );
  });

  it('requests cancel for active operations only', async () => {
    const cancelledIds: string[] = [];

    const result = await cancelActiveOperations(
      [op('queued', 'queued'), op('done', 'done'), op('running', 'running')],
      async (operationId) => {
        cancelledIds.push(operationId);
      },
    );

    assert.deepEqual(cancelledIds, ['queued', 'running']);
    assert.deepEqual(result.requestedIds, ['queued', 'running']);
    assert.deepEqual(result.failedIds, []);
  });
});
