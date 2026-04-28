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

  it('shows active call placeholders while full detail is still loading', () => {
    const summary = makeOp({
      activeLlmCalls: [{
        callIndex: 0,
        callId: 'call-1',
        timestamp: '2025-01-01T00:00:01Z',
        model: 'gpt-5.4',
        label: 'Discovery',
        responseStatus: 'pending',
      }],
      llmCallCount: 1,
      activeLlmCallCount: 1,
      llmCalls: [],
    });

    const display = selectOperationDetailDisplay(summary, null);

    assert.notEqual(display, summary);
    assert.equal(display.llmCalls.length, 1);
    assert.equal(display.llmCalls[0].label, 'Discovery');
    assert.equal(display.llmCalls[0].callId, 'call-1');
    assert.equal(display.llmCalls[0].model, 'gpt-5.4');
    assert.deepEqual(display.llmCalls[0].prompt, { system: '', user: '' });
    assert.equal(display.llmCalls[0].response, null);
  });

  it('keeps active call placeholders when fetched detail has not observed the call yet', () => {
    const summary = makeOp({
      activeLlmCalls: [{
        callIndex: 0,
        timestamp: '2025-01-01T00:00:01Z',
        label: 'Discovery',
        responseStatus: 'pending',
      }],
      llmCallCount: 1,
      activeLlmCallCount: 1,
    });
    const emptyDetail = makeOp({ productLabel: 'Detail', llmCalls: [] });

    const display = selectOperationDetailDisplay(summary, emptyDetail);

    assert.notEqual(display, emptyDetail);
    assert.equal(display.productLabel, 'Detail');
    assert.equal(display.llmCalls.length, 1);
    assert.equal(display.llmCalls[0].label, 'Discovery');
  });

  it('does not invent terminal call rows when only the historical count is known', () => {
    const summary = makeOp({
      status: 'done',
      endedAt: '2025-01-01T00:00:10Z',
      activeLlmCalls: [],
      llmCallCount: 1,
      activeLlmCallCount: 0,
      llmCalls: [],
    });

    const display = selectOperationDetailDisplay(summary, null);

    assert.equal(display, summary);
    assert.equal(display.llmCalls.length, 0);
  });

  it('falls back to the summary while detail is loading', () => {
    const summary = makeOp({ productLabel: 'Summary' });

    assert.equal(selectOperationDetailDisplay(summary, null), summary);
  });
});
