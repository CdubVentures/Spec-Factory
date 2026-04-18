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
  cancelOperation,
  getOperationSignal,
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

  it('preserves label field on append', () => {
    const op = registerOperation(VALID_OP);
    appendLlmCall({ id: op.id, call: { prompt: { system: 's', user: 'u' }, response: {}, label: 'Discovery' } });
    assert.equal(listOperations()[0].llmCalls[0].label, 'Discovery');
  });

  it('preserves label from incoming call through smart update', () => {
    const op = registerOperation(VALID_OP);
    appendLlmCall({ id: op.id, call: { prompt: { system: 's', user: 'u' }, response: null, label: 'Discovery' } });
    appendLlmCall({ id: op.id, call: { prompt: { system: 's', user: 'u' }, response: { ok: true }, label: 'Discovery' } });
    assert.equal(listOperations()[0].llmCalls.length, 1);
    assert.equal(listOperations()[0].llmCalls[0].label, 'Discovery');
    assert.deepEqual(listOperations()[0].llmCalls[0].response, { ok: true });
  });
});

// ── updateModelInfo ──────────────────────────────────────────────────

describe('updateModelInfo', () => {
  beforeEach(() => _resetForTest());

  it('sets modelInfo on a running operation', () => {
    const op = registerOperation(VALID_OP);
    updateModelInfo({ id: op.id, model: 'gpt-4o', provider: 'openai', isFallback: false });
    const ops = listOperations();
    assert.deepEqual(ops[0].modelInfo, { model: 'gpt-4o', provider: 'openai', isFallback: false, accessMode: 'api', thinking: false, webSearch: false, effortLevel: '' });
  });

  it('replaces modelInfo on second call (fallback scenario)', () => {
    const op = registerOperation(VALID_OP);
    updateModelInfo({ id: op.id, model: 'gpt-4o', provider: 'openai', isFallback: false });
    updateModelInfo({ id: op.id, model: 'claude-3.5-sonnet', provider: 'anthropic', isFallback: true, accessMode: 'lab', thinking: true, webSearch: true });
    const ops = listOperations();
    assert.deepEqual(ops[0].modelInfo, { model: 'claude-3.5-sonnet', provider: 'anthropic', isFallback: true, accessMode: 'lab', thinking: true, webSearch: true, effortLevel: '' });
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
    assert.deepEqual(spy.calls[0].data.operation.modelInfo, { model: 'gpt-4o', provider: 'openai', isFallback: false, accessMode: 'api', thinking: false, webSearch: false, effortLevel: '' });
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

// ── cancelOperation ─────────────────────────────────────────────────

describe('cancelOperation', () => {
  beforeEach(() => _resetForTest());

  it('sets status=cancelled and endedAt on a running op', () => {
    const op = registerOperation(VALID_OP);
    cancelOperation({ id: op.id });
    const ops = listOperations();
    assert.equal(ops[0].status, 'cancelled');
    assert.ok(ops[0].endedAt);
    assert.equal(ops[0].error, null);
  });

  it('aborts the AbortController signal', () => {
    const op = registerOperation(VALID_OP);
    const signal = getOperationSignal(op.id);
    assert.equal(signal.aborted, false);
    cancelOperation({ id: op.id });
    assert.equal(signal.aborted, true);
  });

  it('is idempotent on already-cancelled op', () => {
    const op = registerOperation(VALID_OP);
    cancelOperation({ id: op.id });
    const first = listOperations()[0].endedAt;
    cancelOperation({ id: op.id });
    assert.equal(listOperations()[0].endedAt, first);
    assert.equal(listOperations()[0].status, 'cancelled');
  });

  it('no-ops on done op', () => {
    const op = registerOperation(VALID_OP);
    completeOperation({ id: op.id });
    cancelOperation({ id: op.id });
    assert.equal(listOperations()[0].status, 'done');
  });

  it('no-ops on error op', () => {
    const op = registerOperation(VALID_OP);
    failOperation({ id: op.id, error: 'boom' });
    cancelOperation({ id: op.id });
    assert.equal(listOperations()[0].status, 'error');
  });

  it('no-ops on nonexistent id (no crash)', () => {
    assert.doesNotThrow(() => cancelOperation({ id: 'ghost' }));
  });

  it('broadcasts upsert with cancelled status', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const op = registerOperation(VALID_OP);
    spy.calls.length = 0;
    cancelOperation({ id: op.id });
    assert.equal(spy.calls[0].data.action, 'upsert');
    assert.equal(spy.calls[0].data.operation.status, 'cancelled');
  });
});

// ─��� getOperationSignal ──────────────────────────────────────────────

describe('getOperationSignal', () => {
  beforeEach(() => _resetForTest());

  it('returns AbortSignal for a running operation', () => {
    const op = registerOperation(VALID_OP);
    const signal = getOperationSignal(op.id);
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
  });

  it('returns null for nonexistent id', () => {
    assert.equal(getOperationSignal('ghost'), null);
  });

  it('returns null after completeOperation cleans up controller', () => {
    const op = registerOperation(VALID_OP);
    assert.ok(getOperationSignal(op.id));
    completeOperation({ id: op.id });
    assert.equal(getOperationSignal(op.id), null);
  });

  it('returns null after failOperation cleans up controller', () => {
    const op = registerOperation(VALID_OP);
    assert.ok(getOperationSignal(op.id));
    failOperation({ id: op.id, error: 'boom' });
    assert.equal(getOperationSignal(op.id), null);
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

// ── 50-op cap (auto-eviction of oldest terminal) ─────────────────────

describe('50-op cap', () => {
  beforeEach(() => _resetForTest());

  function registerDone(productId) {
    const { id } = registerOperation({ ...VALID_OP, productId });
    completeOperation({ id });
    return id;
  }

  it('keeps all 50 when at cap', () => {
    for (let i = 0; i < 50; i++) registerDone(`p-${i}`);
    assert.equal(listOperations().length, 50);
  });

  it('evicts oldest terminal when adding the 51st', () => {
    const ids = [];
    for (let i = 0; i < 50; i++) ids.push(registerDone(`p-${i}`));
    const newId = registerOperation({ ...VALID_OP, productId: 'p-new' }).id;

    const ops = listOperations();
    assert.equal(ops.length, 50, 'cap holds');
    assert.ok(!ops.find(o => o.id === ids[0]), 'oldest done evicted');
    assert.ok(ops.find(o => o.id === newId), 'new op survives');
  });

  it('never evicts a running op even when over cap', () => {
    // All 55 running — nothing terminal → cannot evict
    const runningIds = [];
    for (let i = 0; i < 55; i++) {
      runningIds.push(registerOperation({ ...VALID_OP, productId: `p-${i}` }).id);
    }
    const ops = listOperations();
    assert.equal(ops.length, 55);
    for (const id of runningIds) {
      assert.ok(ops.find(o => o.id === id), `running op ${id} preserved`);
    }
  });

  it('skips running ops and evicts oldest terminal', () => {
    const runId = registerOperation({ ...VALID_OP, productId: 'p-run-first' }).id;
    const doneIds = [];
    for (let i = 1; i < 50; i++) doneIds.push(registerDone(`p-${i}`));
    // Total: 50 (1 running + 49 done). Register 51st → must evict oldest terminal, not the running one.
    const newId = registerOperation({ ...VALID_OP, productId: 'p-new' }).id;

    const ops = listOperations();
    assert.equal(ops.length, 50);
    assert.ok(ops.find(o => o.id === runId), 'running op preserved');
    assert.ok(!ops.find(o => o.id === doneIds[0]), 'oldest terminal evicted');
    assert.ok(ops.find(o => o.id === newId));
  });

  it('broadcasts {action:"remove", id} on eviction', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    const doneIds = [];
    for (let i = 0; i < 50; i++) doneIds.push(registerDone(`p-${i}`));
    spy.calls.length = 0;
    registerOperation({ ...VALID_OP, productId: 'p-trigger' });

    const removes = spy.calls.filter(c => c.channel === 'operations' && c.data.action === 'remove');
    assert.equal(removes.length, 1, 'one remove broadcast');
    assert.equal(removes[0].data.id, doneIds[0], 'remove id is oldest terminal');
  });

  it('evicts on completion when over cap with mix', () => {
    // 51 running (over cap, nothing to evict yet)
    const runIds = [];
    for (let i = 0; i < 51; i++) runIds.push(registerOperation({ ...VALID_OP, productId: `p-${i}` }).id);
    assert.equal(listOperations().length, 51);
    // Complete one → it becomes terminal → cap enforcement evicts it
    completeOperation({ id: runIds[0] });
    const ops = listOperations();
    assert.equal(ops.length, 50, 'cap restored after completion triggers eviction');
    assert.ok(!ops.find(o => o.id === runIds[0]), 'the now-terminal op was evicted');
  });

  it('evicts on failure when over cap', () => {
    const runIds = [];
    for (let i = 0; i < 51; i++) runIds.push(registerOperation({ ...VALID_OP, productId: `p-${i}` }).id);
    failOperation({ id: runIds[0], error: 'boom' });
    assert.equal(listOperations().length, 50);
  });

  it('evicts on cancel when over cap', () => {
    const runIds = [];
    for (let i = 0; i < 51; i++) runIds.push(registerOperation({ ...VALID_OP, productId: `p-${i}` }).id);
    cancelOperation({ id: runIds[0] });
    assert.equal(listOperations().length, 50);
  });

  it('cap holds across repeated overflow', () => {
    for (let i = 0; i < 50; i++) registerDone(`p-${i}`);
    for (let i = 0; i < 10; i++) {
      const id = registerOperation({ ...VALID_OP, productId: `x-${i}` }).id;
      completeOperation({ id });
    }
    assert.equal(listOperations().length, 50);
  });

  it('no eviction when count is at or below 50', () => {
    const spy = makeBroadcastSpy();
    initOperationsRegistry({ broadcastWs: spy });
    for (let i = 0; i < 50; i++) registerDone(`p-${i}`);
    const removes = spy.calls.filter(c => c.channel === 'operations' && c.data.action === 'remove');
    assert.equal(removes.length, 0, 'no remove broadcasts at or below cap');
  });
});
