import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Operation } from './operationsStore.ts';
import { selectOperationDetailDisplay } from './operationDetailSelection.ts';

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

describe('selectOperationDetailDisplay', () => {
  it('shows fetched detail when available so the popup can render full calls', () => {
    const summary = makeOp({ productLabel: 'Summary', llmCalls: [] });
    const detail = makeOp({
      productLabel: 'Detail',
      llmCalls: [{
        callIndex: 0,
        timestamp: '2025-01-01T00:00:01Z',
        prompt: { system: 'sys', user: 'usr' },
        response: { ok: true },
      }],
    });

    assert.equal(selectOperationDetailDisplay(summary, detail), detail);
  });

  it('falls back to the summary while detail is loading', () => {
    const summary = makeOp({ productLabel: 'Summary' });

    assert.equal(selectOperationDetailDisplay(summary, null), summary);
  });
});
