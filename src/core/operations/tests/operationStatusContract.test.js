import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  OPERATION_STATUS_CONTRACT,
  countOperationStatuses,
  countResourceRunningOperations,
  countUiActiveOperations,
  isOperationTerminalStatus,
  isOperationUiActiveStatus,
} from '../operationStatusContract.js';

function op(status) {
  return { status };
}

describe('core operation status contract', () => {
  it('defines UI-active statuses as queued plus running only', () => {
    assert.deepEqual(OPERATION_STATUS_CONTRACT.uiActiveStatuses, ['queued', 'running']);
    assert.equal(isOperationUiActiveStatus('queued'), true);
    assert.equal(isOperationUiActiveStatus('running'), true);
    assert.equal(isOperationUiActiveStatus('done'), false);
    assert.equal(isOperationUiActiveStatus('error'), false);
    assert.equal(isOperationUiActiveStatus('cancelled'), false);
  });

  it('defines terminal statuses as done, error, and cancelled', () => {
    assert.deepEqual(OPERATION_STATUS_CONTRACT.terminalStatuses, ['done', 'error', 'cancelled']);
    assert.equal(isOperationTerminalStatus('queued'), false);
    assert.equal(isOperationTerminalStatus('running'), false);
    assert.equal(isOperationTerminalStatus('done'), true);
    assert.equal(isOperationTerminalStatus('error'), true);
    assert.equal(isOperationTerminalStatus('cancelled'), true);
  });

  it('keeps backend resource-running count narrower than UI-active count', () => {
    const operations = [
      op('queued'),
      op('running'),
      op('running'),
      op('done'),
      op('error'),
      op('cancelled'),
    ];

    assert.deepEqual(countOperationStatuses(operations), {
      queued: 1,
      running: 2,
      done: 1,
      error: 1,
      cancelled: 1,
    });
    assert.equal(countUiActiveOperations(operations), 3);
    assert.equal(countResourceRunningOperations(operations), 2);
  });
});
