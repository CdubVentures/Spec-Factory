import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectIsRunning,
  selectRunningVariantKeys,
  selectKeyFieldOpStatesSignature,
} from '../useFinderOperations.ts';
import type { Operation } from '../../state/operationsStore.ts';

/* ── Factory ───────────────────────────────────────────────────────── */

function makeOp(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    type: 'pif',
    category: 'mouse',
    productId: 'p1',
    productLabel: 'Test Mouse',
    stages: ['stage1'],
    currentStageIndex: 0,
    status: 'running',
    startedAt: '2026-04-01T00:00:00Z',
    endedAt: null,
    error: null,
    modelInfo: null,
    loopProgress: null,
    llmCalls: [],
    ...overrides,
  };
}

function opsMap(...ops: Operation[]): ReadonlyMap<string, Operation> {
  return new Map(ops.map((o) => [o.id, o]));
}

/* ── selectIsRunning ───────────────────────────────────────────────── */

describe('selectIsRunning', () => {
  it('returns false for empty operations', () => {
    assert.equal(selectIsRunning(new Map(), 'pif', 'p1'), false);
  });

  it('returns false when operation is for different product', () => {
    const ops = opsMap(makeOp({ productId: 'other' }));
    assert.equal(selectIsRunning(ops, 'pif', 'p1'), false);
  });

  it('returns false when operation is for different type', () => {
    const ops = opsMap(makeOp({ type: 'cef' }));
    assert.equal(selectIsRunning(ops, 'pif', 'p1'), false);
  });

  it('returns true when matching operation is running', () => {
    const ops = opsMap(makeOp({ type: 'pif', productId: 'p1', status: 'running' }));
    assert.equal(selectIsRunning(ops, 'pif', 'p1'), true);
  });

  it('returns false when matching operation is done', () => {
    const ops = opsMap(makeOp({ type: 'pif', productId: 'p1', status: 'done' }));
    assert.equal(selectIsRunning(ops, 'pif', 'p1'), false);
  });

  it('returns false when matching operation has error status', () => {
    const ops = opsMap(makeOp({ type: 'pif', productId: 'p1', status: 'error' }));
    assert.equal(selectIsRunning(ops, 'pif', 'p1'), false);
  });

  it('returns true when at least one matching operation is running among many', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'pif', productId: 'p1', status: 'done' }),
      makeOp({ id: 'b', type: 'pif', productId: 'p1', status: 'running' }),
      makeOp({ id: 'c', type: 'cef', productId: 'p1', status: 'running' }),
    );
    assert.equal(selectIsRunning(ops, 'pif', 'p1'), true);
  });
});

/* ── selectRunningVariantKeys ──────────────────────────────────────── */

describe('selectRunningVariantKeys', () => {
  it('returns empty string for empty operations', () => {
    assert.equal(selectRunningVariantKeys(new Map(), 'pif', 'p1', 'loop'), '');
  });

  it('returns empty string when no operations match', () => {
    const ops = opsMap(makeOp({ type: 'cef', subType: 'loop', variantKey: 'color:black' }));
    assert.equal(selectRunningVariantKeys(ops, 'pif', 'p1', 'loop'), '');
  });

  it('returns single variant key', () => {
    const ops = opsMap(makeOp({ subType: 'loop', variantKey: 'color:black' }));
    assert.equal(selectRunningVariantKeys(ops, 'pif', 'p1', 'loop'), 'color:black');
  });

  it('returns multiple variant keys sorted and pipe-delimited', () => {
    const ops = opsMap(
      makeOp({ id: 'a', subType: 'loop', variantKey: 'edition:cod' }),
      makeOp({ id: 'b', subType: 'loop', variantKey: 'color:black' }),
    );
    const result = selectRunningVariantKeys(ops, 'pif', 'p1', 'loop');
    assert.equal(result, 'color:black|edition:cod');
  });

  it('excludes non-running operations', () => {
    const ops = opsMap(
      makeOp({ id: 'a', subType: 'loop', variantKey: 'color:black', status: 'running' }),
      makeOp({ id: 'b', subType: 'loop', variantKey: 'color:red', status: 'done' }),
    );
    assert.equal(selectRunningVariantKeys(ops, 'pif', 'p1', 'loop'), 'color:black');
  });

  it('excludes operations without variantKey', () => {
    const ops = opsMap(
      makeOp({ id: 'a', subType: 'loop', variantKey: 'color:black' }),
      makeOp({ id: 'b', subType: 'loop', variantKey: undefined }),
    );
    assert.equal(selectRunningVariantKeys(ops, 'pif', 'p1', 'loop'), 'color:black');
  });

  it('deduplicates variant keys', () => {
    const ops = opsMap(
      makeOp({ id: 'a', subType: 'loop', variantKey: 'color:black' }),
      makeOp({ id: 'b', subType: 'loop', variantKey: 'color:black' }),
    );
    assert.equal(selectRunningVariantKeys(ops, 'pif', 'p1', 'loop'), 'color:black');
  });
});

/* ── selectKeyFieldOpStatesSignature (Phase 3b) ────────────────────── */

describe('selectKeyFieldOpStatesSignature', () => {
  it('returns empty string when no kf ops', () => {
    assert.equal(selectKeyFieldOpStatesSignature(new Map(), 'kf', 'p1'), '');
  });

  it("encodes running Run as 'fieldKey:running:run'", () => {
    const ops = opsMap(makeOp({
      type: 'kf', productId: 'p1', fieldKey: 'polling_rate', status: 'running',
    }));
    assert.equal(selectKeyFieldOpStatesSignature(ops, 'kf', 'p1'), 'polling_rate:running:run');
  });

  it("encodes running Loop as 'fieldKey:running:loop'", () => {
    const ops = opsMap(makeOp({
      type: 'kf', productId: 'p1', fieldKey: 'polling_rate', subType: 'loop', status: 'running',
    }));
    assert.equal(selectKeyFieldOpStatesSignature(ops, 'kf', 'p1'), 'polling_rate:running:loop');
  });

  it("encodes queued Loop as 'fieldKey:queued:loop'", () => {
    const ops = opsMap(makeOp({
      type: 'kf', productId: 'p1', fieldKey: 'polling_rate', subType: 'loop', status: 'queued',
    }));
    assert.equal(selectKeyFieldOpStatesSignature(ops, 'kf', 'p1'), 'polling_rate:queued:loop');
  });

  it('excludes terminal states (done, error, cancelled)', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'polling_rate', status: 'done' }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'dpi', status: 'error' }),
      makeOp({ id: 'c', type: 'kf', productId: 'p1', fieldKey: 'buttons', status: 'cancelled' }),
    );
    assert.equal(selectKeyFieldOpStatesSignature(ops, 'kf', 'p1'), '');
  });

  it('excludes ops for other products / types / no fieldKey', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p2', fieldKey: 'polling_rate', status: 'running' }),
      makeOp({ id: 'b', type: 'rdf', productId: 'p1', fieldKey: 'release_date', status: 'running' }),
      makeOp({ id: 'c', type: 'kf', productId: 'p1', fieldKey: '', status: 'running' }),
    );
    assert.equal(selectKeyFieldOpStatesSignature(ops, 'kf', 'p1'), '');
  });

  it('multiple keys sorted alphabetically and pipe-delimited', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'zoo', status: 'running' }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'alpha', subType: 'loop', status: 'queued' }),
      makeOp({ id: 'c', type: 'kf', productId: 'p1', fieldKey: 'middle', subType: 'loop', status: 'running' }),
    );
    assert.equal(
      selectKeyFieldOpStatesSignature(ops, 'kf', 'p1'),
      'alpha:queued:loop|middle:running:loop|zoo:running:run',
    );
  });

  it('later op on the same fieldKey overwrites earlier state', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'dpi', subType: 'loop', status: 'queued' }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'dpi', subType: 'loop', status: 'running' }),
    );
    assert.equal(selectKeyFieldOpStatesSignature(ops, 'kf', 'p1'), 'dpi:running:loop');
  });
});
