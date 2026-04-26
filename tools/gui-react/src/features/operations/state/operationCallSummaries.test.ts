import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Operation } from './operationsStore.ts';
import { selectActiveLlmCallSummaries } from './operationCallSummaries.ts';

function makeOp(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    type: 'pif',
    category: 'mouse',
    productId: 'mouse-1',
    productLabel: 'Mouse One',
    stages: ['Start', 'LLM', 'Done'],
    currentStageIndex: 1,
    status: 'running',
    startedAt: '2025-01-01T00:00:00Z',
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [],
    ...overrides,
  };
}

describe('selectActiveLlmCallSummaries', () => {
  it('uses activeLlmCalls from summary operations without requiring full call records', () => {
    const op = makeOp({
      activeLlmCalls: [{
        callIndex: 0,
        callId: 'call-1',
        timestamp: '2025-01-01T00:00:01Z',
        lane: 'hero',
        label: 'Hero',
        responseStatus: 'pending',
      }],
      llmCallCount: 3,
      activeLlmCallCount: 1,
    } as Partial<Operation>);

    assert.deepEqual(selectActiveLlmCallSummaries(op), [{
      callIndex: 0,
      callId: 'call-1',
      timestamp: '2025-01-01T00:00:01Z',
      lane: 'hero',
      label: 'Hero',
      responseStatus: 'pending',
    }]);
  });

  it('falls back to pending legacy llmCalls when summary fields are absent', () => {
    const op = makeOp({
      llmCalls: [
        {
          callIndex: 0,
          callId: 'pending',
          timestamp: '2025-01-01T00:00:01Z',
          prompt: { system: 'sys', user: 'usr' },
          response: null,
          mode: 'discovery',
        },
        {
          callIndex: 1,
          callId: 'done',
          timestamp: '2025-01-01T00:00:02Z',
          prompt: { system: 'sys', user: 'usr' },
          response: { ok: true },
          mode: 'validation',
        },
      ],
    });

    assert.deepEqual(selectActiveLlmCallSummaries(op), [{
      callIndex: 0,
      callId: 'pending',
      timestamp: '2025-01-01T00:00:01Z',
      mode: 'discovery',
      responseStatus: 'pending',
    }]);
  });
});
