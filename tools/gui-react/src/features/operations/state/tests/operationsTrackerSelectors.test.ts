import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Operation } from '../operationsStore.ts';
import {
  EMPTY_OPERATIONS_MAP,
  selectActiveOperationCount,
  selectOperationById,
  selectVisibleOperationsMap,
} from '../operationsTrackerSelectors.ts';

function makeOperation(overrides: Partial<Operation>): Operation {
  return {
    id: 'op-1',
    type: 'key-finder',
    category: 'mouse',
    productId: 'p1',
    productLabel: 'Mouse One',
    stages: ['Run'],
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

describe('operations tracker selectors', () => {
  it('counts only queued and running operations as active', () => {
    const operations = new Map([
      ['queued', makeOperation({ id: 'queued', status: 'queued' })],
      ['running', makeOperation({ id: 'running', status: 'running' })],
      ['done', makeOperation({ id: 'done', status: 'done' })],
      ['error', makeOperation({ id: 'error', status: 'error' })],
      ['cancelled', makeOperation({ id: 'cancelled', status: 'cancelled' })],
    ]);

    assert.equal(selectActiveOperationCount(operations), 2);
  });

  it('returns a stable empty map while the tracker list is collapsed', () => {
    const operations = new Map([
      ['op-1', makeOperation({ id: 'op-1' })],
    ]);

    assert.equal(selectVisibleOperationsMap(operations, false), EMPTY_OPERATIONS_MAP);
    assert.equal(selectVisibleOperationsMap(new Map(operations), false), EMPTY_OPERATIONS_MAP);
  });

  it('returns the live operations map while the tracker list is expanded', () => {
    const operations = new Map([
      ['op-1', makeOperation({ id: 'op-1' })],
    ]);

    assert.equal(selectVisibleOperationsMap(operations, true), operations);
  });

  it('looks up detail operations independently of list visibility', () => {
    const selected = makeOperation({ id: 'selected' });
    const operations = new Map([['selected', selected]]);

    assert.equal(selectOperationById(operations, 'selected'), selected);
    assert.equal(selectOperationById(operations, 'missing'), null);
    assert.equal(selectOperationById(operations, null), null);
  });
});
