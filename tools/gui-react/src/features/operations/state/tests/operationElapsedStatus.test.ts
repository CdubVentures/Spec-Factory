import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatOperationStatusText,
  isOperationElapsedTimerActive,
} from '../operationElapsedStatus.ts';
import type { Operation } from '../operationsStore.ts';

function makeOp(overrides: Partial<Operation> = {}): Pick<Operation, 'status' | 'startedAt' | 'endedAt'> {
  return {
    status: 'running',
    startedAt: '2026-04-18T10:00:00Z',
    endedAt: null,
    ...overrides,
  };
}

describe('formatOperationStatusText', () => {
  it('formats running elapsed time against now', () => {
    assert.equal(
      formatOperationStatusText(makeOp(), Date.parse('2026-04-18T10:01:05Z')),
      '1:05',
    );
  });

  it('formats queued elapsed time against now', () => {
    assert.equal(
      formatOperationStatusText(makeOp({ status: 'queued' }), Date.parse('2026-04-18T10:00:09Z')),
      '0:09',
    );
  });

  it('prefixes terminal status and uses endedAt', () => {
    assert.equal(
      formatOperationStatusText(makeOp({
        status: 'done',
        endedAt: '2026-04-18T10:02:05Z',
      })),
      'done 2:05',
    );
    assert.equal(
      formatOperationStatusText(makeOp({
        status: 'error',
        endedAt: '2026-04-18T10:00:12Z',
      })),
      'failed 0:12',
    );
    assert.equal(
      formatOperationStatusText(makeOp({
        status: 'cancelled',
        endedAt: '2026-04-18T10:00:03Z',
      })),
      'cancelled 0:03',
    );
  });

  it('falls back to 0:00 for invalid timestamps', () => {
    assert.equal(
      formatOperationStatusText(makeOp({ startedAt: 'bad-date' }), Date.parse('2026-04-18T10:00:09Z')),
      '0:00',
    );
  });
});

describe('isOperationElapsedTimerActive', () => {
  it('ticks only for queued and running operations', () => {
    assert.equal(isOperationElapsedTimerActive('queued'), true);
    assert.equal(isOperationElapsedTimerActive('running'), true);
    assert.equal(isOperationElapsedTimerActive('done'), false);
    assert.equal(isOperationElapsedTimerActive('error'), false);
    assert.equal(isOperationElapsedTimerActive('cancelled'), false);
  });
});
