import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useOperationsStore } from '../operationsStore.ts';
import type { Operation } from '../operationsStore.ts';

/* ── Factory ────────────────────────────────────────────────────── */

function makeOp(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    type: 'pif',
    category: 'cat-a',
    productId: 'p-1',
    productLabel: 'Product 1',
    stages: ['init', 'run', 'done'],
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

/* ── Helpers ─────────────────────────────────────────────────────── */

function reset() {
  useOperationsStore.getState().clear();
}

function getOps() {
  return useOperationsStore.getState().operations;
}

function getStreamTexts() {
  return useOperationsStore.getState().streamTexts;
}

/* ── Characterization tests — lock current behavior ─────────────── */

describe('operationsStore (characterization)', () => {
  beforeEach(() => reset());

  describe('upsert', () => {
    it('inserts a new operation', () => {
      const op = makeOp();
      useOperationsStore.getState().upsert(op);
      assert.equal(getOps().size, 1);
      assert.equal(getOps().get('op-1')?.id, 'op-1');
    });

    it('preserves streamTexts entry when upsert with running status', () => {
      // WHY: Stream text lives in streamTexts map, not on Operation.
      // Upsert of running op must not touch streamTexts.
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'hello');
      assert.equal(getStreamTexts().get('op-1'), 'hello');
      useOperationsStore.getState().upsert(makeOp({ status: 'running' }));
      assert.equal(getStreamTexts().get('op-1'), 'hello');
    });

    it('clears streamTexts entry when status becomes done', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'hello');
      useOperationsStore.getState().upsert(makeOp({ status: 'done', endedAt: '2025-01-01T00:01:00Z' }));
      assert.equal(getStreamTexts().has('op-1'), false);
    });

    it('clears streamTexts entry when status becomes error', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'partial');
      useOperationsStore.getState().upsert(makeOp({ status: 'error', error: 'fail' }));
      assert.equal(getStreamTexts().has('op-1'), false);
    });

    it('preserves queueDelayMs across upserts', () => {
      useOperationsStore.getState().upsert(makeOp({ queueDelayMs: 500 }));
      useOperationsStore.getState().upsert(makeOp());
      assert.equal(getOps().get('op-1')?.queueDelayMs, 500);
    });

    it('preserves accumulated llmCalls from store', () => {
      const call = { callIndex: 0, timestamp: '', prompt: { system: '', user: '' }, response: null };
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendLlmCall('op-1', call);
      useOperationsStore.getState().upsert(makeOp());
      assert.equal(getOps().get('op-1')?.llmCalls.length, 1);
    });
  });

  describe('appendStreamText', () => {
    it('appends text to streamTexts for a running operation', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'chunk1');
      assert.equal(getStreamTexts().get('op-1'), 'chunk1');
    });

    it('accumulates multiple appends in streamTexts', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'a');
      useOperationsStore.getState().appendStreamText('op-1', 'b');
      useOperationsStore.getState().appendStreamText('op-1', 'c');
      assert.equal(getStreamTexts().get('op-1'), 'abc');
    });

    it('no-ops for missing operation id', () => {
      useOperationsStore.getState().upsert(makeOp());
      const before = getStreamTexts();
      useOperationsStore.getState().appendStreamText('nonexistent', 'text');
      assert.equal(getStreamTexts(), before);
    });

    it('no-ops for terminal status operation', () => {
      useOperationsStore.getState().upsert(makeOp({ status: 'done', endedAt: '2025-01-01T00:01:00Z' }));
      const before = getStreamTexts();
      useOperationsStore.getState().appendStreamText('op-1', 'text');
      assert.equal(getStreamTexts(), before);
    });
  });

  describe('remove', () => {
    it('removes an operation by id', () => {
      useOperationsStore.getState().upsert(makeOp());
      assert.equal(getOps().size, 1);
      useOperationsStore.getState().remove('op-1');
      assert.equal(getOps().size, 0);
    });

    it('no-ops for nonexistent id', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().remove('nonexistent');
      assert.equal(getOps().size, 1);
    });
  });

  describe('clear', () => {
    it('resets operations to empty map', () => {
      useOperationsStore.getState().upsert(makeOp({ id: 'a' }));
      useOperationsStore.getState().upsert(makeOp({ id: 'b' }));
      assert.equal(getOps().size, 2);
      useOperationsStore.getState().clear();
      assert.equal(getOps().size, 0);
    });
  });

  describe('appendLlmCall', () => {
    it('appends a call record', () => {
      useOperationsStore.getState().upsert(makeOp());
      const call = { callIndex: 0, timestamp: '', prompt: { system: 's', user: 'u' }, response: null };
      useOperationsStore.getState().appendLlmCall('op-1', call);
      assert.equal(getOps().get('op-1')?.llmCalls.length, 1);
      assert.equal(getOps().get('op-1')?.llmCalls[0]?.prompt.system, 's');
    });
  });

  describe('updateLlmCall', () => {
    it('updates an existing call by callIndex', () => {
      useOperationsStore.getState().upsert(makeOp());
      const call = { callIndex: 0, timestamp: '', prompt: { system: '', user: '' }, response: null };
      useOperationsStore.getState().appendLlmCall('op-1', call);
      const updated = { ...call, response: 'done' };
      useOperationsStore.getState().updateLlmCall('op-1', 0, updated);
      assert.equal(getOps().get('op-1')?.llmCalls[0]?.response, 'done');
    });
  });

  describe('label field passthrough', () => {
    it('appendLlmCall preserves label field', () => {
      useOperationsStore.getState().upsert(makeOp());
      const call = { callIndex: 0, timestamp: '', prompt: { system: 's', user: 'u' }, response: null, label: 'Discovery' };
      useOperationsStore.getState().appendLlmCall('op-1', call);
      assert.equal(getOps().get('op-1')?.llmCalls[0]?.label, 'Discovery');
    });

    it('updateLlmCall preserves label field', () => {
      useOperationsStore.getState().upsert(makeOp());
      const call = { callIndex: 0, timestamp: '', prompt: { system: '', user: '' }, response: null, label: 'Identity Check' };
      useOperationsStore.getState().appendLlmCall('op-1', call);
      const updated = { ...call, response: 'done' };
      useOperationsStore.getState().updateLlmCall('op-1', 0, updated);
      assert.equal(getOps().get('op-1')?.llmCalls[0]?.label, 'Identity Check');
      assert.equal(getOps().get('op-1')?.llmCalls[0]?.response, 'done');
    });
  });

  describe('usage field passthrough', () => {
    it('appendLlmCall preserves usage field', () => {
      useOperationsStore.getState().upsert(makeOp());
      const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150, cost_usd: 0.003, estimated_usage: false };
      const call = { callIndex: 0, timestamp: '', prompt: { system: 's', user: 'u' }, response: { ok: true }, usage };
      useOperationsStore.getState().appendLlmCall('op-1', call);
      const stored = getOps().get('op-1')?.llmCalls[0];
      assert.deepEqual(stored?.usage, usage);
    });

    it('updateLlmCall preserves usage field', () => {
      useOperationsStore.getState().upsert(makeOp());
      const call = { callIndex: 0, timestamp: '', prompt: { system: '', user: '' }, response: null };
      useOperationsStore.getState().appendLlmCall('op-1', call);
      const usage = { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280, cost_usd: 0.005, estimated_usage: true };
      const updated = { ...call, response: 'done', usage };
      useOperationsStore.getState().updateLlmCall('op-1', 0, updated);
      assert.deepEqual(getOps().get('op-1')?.llmCalls[0]?.usage, usage);
    });
  });
});

/* ── New behavior tests — streamTexts isolation ─────────────────── */

describe('operationsStore (streamTexts isolation)', () => {
  beforeEach(() => reset());

  describe('appendStreamText isolates from operations', () => {
    it('does not mutate operations map reference', () => {
      useOperationsStore.getState().upsert(makeOp());
      const opsBefore = getOps();
      useOperationsStore.getState().appendStreamText('op-1', 'chunk');
      assert.equal(getOps(), opsBefore, 'operations map reference must be unchanged');
    });

    it('writes to streamTexts map', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'hello');
      assert.equal(getStreamTexts().get('op-1'), 'hello');
    });

    it('accumulates in streamTexts', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'a');
      useOperationsStore.getState().appendStreamText('op-1', 'b');
      assert.equal(getStreamTexts().get('op-1'), 'ab');
    });

    it('no-ops for missing id', () => {
      const before = getStreamTexts();
      useOperationsStore.getState().appendStreamText('ghost', 'x');
      assert.equal(getStreamTexts(), before);
    });

    it('no-ops for terminal status', () => {
      useOperationsStore.getState().upsert(makeOp({ status: 'done', endedAt: '2025-01-01T00:01:00Z' }));
      const before = getStreamTexts();
      useOperationsStore.getState().appendStreamText('op-1', 'x');
      assert.equal(getStreamTexts(), before);
    });
  });

  describe('batchAppendStreamText', () => {
    it('updates multiple operations in one call', () => {
      useOperationsStore.getState().upsert(makeOp({ id: 'a' }));
      useOperationsStore.getState().upsert(makeOp({ id: 'b' }));
      const chunks = new Map([['a', 'hello'], ['b', 'world']]);
      useOperationsStore.getState().batchAppendStreamText(chunks);
      assert.equal(getStreamTexts().get('a'), 'hello');
      assert.equal(getStreamTexts().get('b'), 'world');
    });

    it('accumulates on top of existing stream text', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'first');
      const chunks = new Map([['op-1', 'second']]);
      useOperationsStore.getState().batchAppendStreamText(chunks);
      assert.equal(getStreamTexts().get('op-1'), 'firstsecond');
    });

    it('no-ops for empty map', () => {
      const before = getStreamTexts();
      useOperationsStore.getState().batchAppendStreamText(new Map());
      assert.equal(getStreamTexts(), before);
    });

    it('skips terminal operations', () => {
      useOperationsStore.getState().upsert(makeOp({ id: 'a', status: 'done', endedAt: '2025-01-01T00:01:00Z' }));
      useOperationsStore.getState().upsert(makeOp({ id: 'b', status: 'running' }));
      const chunks = new Map([['a', 'skip'], ['b', 'keep']]);
      useOperationsStore.getState().batchAppendStreamText(chunks);
      assert.equal(getStreamTexts().has('a'), false);
      assert.equal(getStreamTexts().get('b'), 'keep');
    });
  });

  describe('cleanup coordination', () => {
    it('upsert terminal deletes from streamTexts', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'data');
      assert.equal(getStreamTexts().get('op-1'), 'data');
      useOperationsStore.getState().upsert(makeOp({ status: 'done', endedAt: '2025-01-01T00:01:00Z' }));
      assert.equal(getStreamTexts().has('op-1'), false);
    });

    it('upsert running does not touch streamTexts', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'data');
      const stBefore = getStreamTexts();
      useOperationsStore.getState().upsert(makeOp({ currentStageIndex: 2 }));
      assert.equal(getStreamTexts(), stBefore);
    });

    it('remove cleans up streamTexts', () => {
      useOperationsStore.getState().upsert(makeOp());
      useOperationsStore.getState().appendStreamText('op-1', 'data');
      useOperationsStore.getState().remove('op-1');
      assert.equal(getStreamTexts().has('op-1'), false);
    });

    it('clear resets streamTexts', () => {
      useOperationsStore.getState().upsert(makeOp({ id: 'a' }));
      useOperationsStore.getState().upsert(makeOp({ id: 'b' }));
      useOperationsStore.getState().appendStreamText('a', 'x');
      useOperationsStore.getState().appendStreamText('b', 'y');
      useOperationsStore.getState().clear();
      assert.equal(getStreamTexts().size, 0);
    });
  });
});
