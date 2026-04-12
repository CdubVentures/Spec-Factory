import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  initOperationsRegistry,
  registerOperation,
  updateStage,
  updateModelInfo,
  updateProgressText,
  appendLlmCall,
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

  it('stores subType when provided', () => {
    registerOperation({ ...VALID_OP, subType: 'view' });
    assert.equal(listOperations()[0].subType, 'view');
  });

  it('defaults subType to empty string when omitted', () => {
    registerOperation(VALID_OP);
    assert.equal(listOperations()[0].subType, '');
  });

  it('initializes progressText to empty string', () => {
    registerOperation(VALID_OP);
    assert.equal(listOperations()[0].progressText, '');
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

// ── updateProgressText ───────────────────────────────────────────────

describe('updateProgressText', () => {
  beforeEach(() => _resetForTest());

  it('sets progressText on a running operation', () => {
    const op = registerOperation(VALID_OP);
    updateProgressText({ id: op.id, text: '3/12 images' });
    assert.equal(listOperations()[0].progressText, '3/12 images');
  });

  it('overwrites previous text (not append)', () => {
    const op = registerOperation(VALID_OP);
    updateProgressText({ id: op.id, text: 'first' });
    updateProgressText({ id: op.id, text: 'second' });
    assert.equal(listOperations()[0].progressText, 'second');
  });

  it('no-ops on nonexistent id (no crash)', () => {
    assert.doesNotThrow(() => updateProgressText({ id: 'ghost', text: 'x' }));
  });

  it('no-ops on completed operation', () => {
    const op = registerOperation(VALID_OP);
    completeOperation({ id: op.id });
    updateProgressText({ id: op.id, text: 'too late' });
    assert.equal(listOperations()[0].progressText, '');
  });

  it('no-ops on failed operation', () => {
    const op = registerOperation(VALID_OP);
    failOperation({ id: op.id, error: 'boom' });
    updateProgressText({ id: op.id, text: 'too late' });
    assert.equal(listOperations()[0].progressText, '');
  });
});

// ── appendLlmCall ────────────────────────────────────────────────────

describe('appendLlmCall', () => {
  beforeEach(() => _resetForTest());

  it('appends a call record to a running operation', () => {
    const op = registerOperation(VALID_OP);
    appendLlmCall({ id: op.id, call: { prompt: { system: 'sys', user: 'usr' }, response: { ok: true }, model: 'gpt-4o' } });
    const ops = listOperations();
    assert.equal(ops[0].llmCalls.length, 1);
    assert.equal(ops[0].llmCalls[0].callIndex, 0);
    assert.equal(ops[0].llmCalls[0].prompt.system, 'sys');
    assert.equal(ops[0].llmCalls[0].model, 'gpt-4o');
    assert.ok(ops[0].llmCalls[0].timestamp);
  });

  it('accumulates multiple calls with incrementing callIndex', () => {
    const op = registerOperation(VALID_OP);
    appendLlmCall({ id: op.id, call: { prompt: { system: 'a', user: 'b' }, response: {} } });
    appendLlmCall({ id: op.id, call: { prompt: { system: 'c', user: 'd' }, response: {} } });
    const ops = listOperations();
    assert.equal(ops[0].llmCalls.length, 2);
    assert.equal(ops[0].llmCalls[0].callIndex, 0);
    assert.equal(ops[0].llmCalls[1].callIndex, 1);
  });

  it('updates last entry when it has null response (smart update)', () => {
    const op = registerOperation(VALID_OP);
    appendLlmCall({ id: op.id, call: { prompt: { system: 'sys', user: 'usr' }, response: null, model: 'gpt-4o' } });
    assert.equal(listOperations()[0].llmCalls.length, 1);
    assert.equal(listOperations()[0].llmCalls[0].response, null);
    appendLlmCall({ id: op.id, call: { prompt: { system: 'sys', user: 'usr' }, response: { colors: ['red'] }, model: 'gpt-4o' } });
    assert.equal(listOperations()[0].llmCalls.length, 1, 'should update, not append');
    assert.deepEqual(listOperations()[0].llmCalls[0].response, { colors: ['red'] });
  });

  it('appends new entry when last entry already has a response', () => {
    const op = registerOperation(VALID_OP);
    appendLlmCall({ id: op.id, call: { prompt: { system: 'a', user: 'b' }, response: { ok: true } } });
    appendLlmCall({ id: op.id, call: { prompt: { system: 'c', user: 'd' }, response: null } });
    assert.equal(listOperations()[0].llmCalls.length, 2);
  });

  it('no-ops on completed operation', () => {
    const op = registerOperation(VALID_OP);
    completeOperation({ id: op.id });
    appendLlmCall({ id: op.id, call: { prompt: { system: 's', user: 'u' }, response: {} } });
    assert.equal(listOperations()[0].llmCalls.length, 0);
  });

  it('no-ops on nonexistent id', () => {
    assert.doesNotThrow(() => appendLlmCall({ id: 'ghost', call: { prompt: { system: '', user: '' }, response: {} } }));
  });
});

// ── updateModelInfo ──────────────────────────────────────────────────

describe('updateModelInfo', () => {
  beforeEach(() => _resetForTest());

  it('sets modelInfo on a running operation', () => {
    const op = registerOperation(VALID_OP);
    updateModelInfo({ id: op.id, model: 'gpt-4o', provider: 'openai', isFallback: false });
    const ops = listOperations();
    assert.deepEqual(ops[0].modelInfo, { model: 'gpt-4o', provider: 'openai', isFallback: false, accessMode: 'api', thinking: false, webSearch: false });
  });

  it('replaces modelInfo on second call (fallback scenario)', () => {
    const op = registerOperation(VALID_OP);
    updateModelInfo({ id: op.id, model: 'gpt-4o', provider: 'openai', isFallback: false });
    updateModelInfo({ id: op.id, model: 'claude-3.5-sonnet', provider: 'anthropic', isFallback: true, accessMode: 'lab', thinking: true, webSearch: true });
    const ops = listOperations();
    assert.deepEqual(ops[0].modelInfo, { model: 'claude-3.5-sonnet', provider: 'anthropic', isFallback: true, accessMode: 'lab', thinking: true, webSearch: true });
  });

  it('no-ops on nonexistent id (no crash)', () => {
    assert.doesNotThrow(() => updateModelInfo({ id: 'ghost', model: 'x', provider: 'y', isFallback: false }));
  });

  it('no-ops on completed operation', () => {
    const op = registerOperation(VALID_OP);
    completeOperation({ id: op.id });
    updateModelInfo({ id: op.id, model: 'gpt-4o', provider: 'openai', isFallback: false });
    assert.equal(listOperations()[0].modelInfo, null);
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

  it('register broadcast includes subType', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    registerOperation({ ...VALID_OP, subType: 'hero' });
    assert.equal(spy.calls[0].data.operation.subType, 'hero');
  });

  it('updateProgressText broadcasts upsert with progressText', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const op = registerOperation(VALID_OP);
    spy.calls.length = 0;
    updateProgressText({ id: op.id, text: '5/10 done' });
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].data.action, 'upsert');
    assert.equal(spy.calls[0].data.operation.progressText, '5/10 done');
  });

  it('appendLlmCall broadcasts llm-call-append with call data', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const op = registerOperation(VALID_OP);
    spy.calls.length = 0;
    appendLlmCall({ id: op.id, call: { prompt: { system: 'sys', user: 'usr' }, response: { colors: [] }, model: 'test' } });
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].data.action, 'llm-call-append');
    assert.equal(spy.calls[0].data.id, op.id);
    assert.equal(spy.calls[0].data.call.prompt.system, 'sys');
    assert.equal(spy.calls[0].data.call.callIndex, 0);
    assert.ok(spy.calls[0].data.call.timestamp);
  });

  it('regular upsert broadcast excludes llmCalls from payload', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const op = registerOperation(VALID_OP);
    appendLlmCall({ id: op.id, call: { prompt: { system: 'a', user: 'b' }, response: {} } });
    spy.calls.length = 0;
    updateStage({ id: op.id, stageIndex: 1 });
    // The upsert broadcast should NOT include llmCalls (stripped for size)
    assert.equal(spy.calls[0].data.action, 'upsert');
    assert.equal(spy.calls[0].data.operation.llmCalls, undefined);
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

  it('updateModelInfo broadcasts upsert with modelInfo', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const op = registerOperation(VALID_OP);
    spy.calls.length = 0;
    updateModelInfo({ id: op.id, model: 'gpt-4o', provider: 'openai', isFallback: false });
    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].data.action, 'upsert');
    assert.deepEqual(spy.calls[0].data.operation.modelInfo, { model: 'gpt-4o', provider: 'openai', isFallback: false, accessMode: 'api', thinking: false, webSearch: false });
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
