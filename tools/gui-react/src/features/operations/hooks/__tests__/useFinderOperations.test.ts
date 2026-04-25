import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectIsRunning,
  selectRunningVariantKeys,
  selectKeyFieldOpStatesSignature,
  selectPassengerRidesSignature,
  selectActivePassengersSignature,
  selectActiveModulesByProduct,
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

/* ── selectPassengerRidesSignature (Riding column feed) ─────────── */

describe('selectPassengerRidesSignature', () => {
  it('empty when no ops have passengers', () => {
    assert.equal(selectPassengerRidesSignature(new Map(), 'kf', 'p1'), '');
  });

  it('builds reverse map from running ops with passengerFieldKeys', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: ['acceleration', 'motion_sync'] }),
    );
    assert.equal(selectPassengerRidesSignature(ops, 'kf', 'p1'), 'acceleration:ips|motion_sync:ips');
  });

  it('aggregates the same passenger across multiple primaries', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: ['acceleration'] }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'dpi', status: 'running', passengerFieldKeys: ['acceleration'] }),
    );
    assert.equal(selectPassengerRidesSignature(ops, 'kf', 'p1'), 'acceleration:dpi,ips');
  });

  it('excludes terminal ops (done/error/cancelled)', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'done', passengerFieldKeys: ['acceleration'] }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'dpi', status: 'error', passengerFieldKeys: ['motion_sync'] }),
      makeOp({ id: 'c', type: 'kf', productId: 'p1', fieldKey: 'nvidia_reflex', status: 'cancelled', passengerFieldKeys: ['lift_settings'] }),
    );
    assert.equal(selectPassengerRidesSignature(ops, 'kf', 'p1'), '', 'terminal ops drop off the Riding column');
  });

  it('excludes ops with no passengerFieldKeys (solo Run)', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running' }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'dpi', status: 'running', passengerFieldKeys: [] }),
    );
    assert.equal(selectPassengerRidesSignature(ops, 'kf', 'p1'), '');
  });

  it('scopes by type + productId', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: ['acceleration'] }),
      makeOp({ id: 'b', type: 'kf', productId: 'p2', fieldKey: 'dpi', status: 'running', passengerFieldKeys: ['motion_sync'] }),
      makeOp({ id: 'c', type: 'pif', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: ['hero'] }),
    );
    assert.equal(selectPassengerRidesSignature(ops, 'kf', 'p1'), 'acceleration:ips', 'only p1/kf counts');
  });

  it('does not list the primary as its own passenger (defensive)', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: ['ips', 'acceleration'] }),
    );
    assert.equal(selectPassengerRidesSignature(ops, 'kf', 'p1'), 'acceleration:ips', 'primary-as-self-passenger filtered');
  });
});

/* ── selectActivePassengersSignature (Passengers column feed) ───── */

describe('selectActivePassengersSignature', () => {
  it('empty when no ops have passengers', () => {
    assert.equal(selectActivePassengersSignature(new Map(), 'kf', 'p1'), '');
  });

  it('maps primary → its packed passengers for running ops', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: ['acceleration', 'motion_sync'] }),
    );
    assert.equal(selectActivePassengersSignature(ops, 'kf', 'p1'), 'ips:acceleration,motion_sync');
  });

  it('handles multiple concurrent primaries independently', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'flawless_sensor', status: 'running', passengerFieldKeys: ['sensor_link'] }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'dpi', status: 'running', passengerFieldKeys: ['hardware_acceleration', 'motion_sync'] }),
    );
    assert.equal(
      selectActivePassengersSignature(ops, 'kf', 'p1'),
      'dpi:hardware_acceleration,motion_sync|flawless_sensor:sensor_link',
    );
  });

  it('excludes terminal ops — the primary has already released its passengers', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'done', passengerFieldKeys: ['acceleration'] }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'dpi', status: 'cancelled', passengerFieldKeys: ['motion_sync'] }),
    );
    assert.equal(selectActivePassengersSignature(ops, 'kf', 'p1'), '');
  });

  it('excludes primary with empty passenger list (solo run)', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: [] }),
      makeOp({ id: 'b', type: 'kf', productId: 'p1', fieldKey: 'dpi', status: 'running' }), // no field at all
    );
    assert.equal(selectActivePassengersSignature(ops, 'kf', 'p1'), '');
  });

  it('scopes by type + productId', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: ['acceleration'] }),
      makeOp({ id: 'b', type: 'kf', productId: 'p2', fieldKey: 'dpi', status: 'running', passengerFieldKeys: ['motion_sync'] }),
    );
    assert.equal(selectActivePassengersSignature(ops, 'kf', 'p1'), 'ips:acceleration');
  });

  it('filters self-as-passenger (defensive)', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf', productId: 'p1', fieldKey: 'ips', status: 'running', passengerFieldKeys: ['ips', 'acceleration'] }),
    );
    assert.equal(selectActivePassengersSignature(ops, 'kf', 'p1'), 'ips:acceleration');
  });
});

/* ── selectActiveModulesByProduct (queued + running) ───────────────── */

describe('selectActiveModulesByProduct', () => {
  it('returns empty signature for empty operations', () => {
    assert.equal(selectActiveModulesByProduct(new Map(), 'mouse'), '');
  });

  it('includes a queued op (broader than running-only sibling)', () => {
    const ops = opsMap(makeOp({ type: 'cef', productId: 'p1', status: 'queued' }));
    assert.equal(selectActiveModulesByProduct(ops, 'mouse'), 'p1:cef');
  });

  it('includes a running op', () => {
    const ops = opsMap(makeOp({ type: 'cef', productId: 'p1', status: 'running' }));
    assert.equal(selectActiveModulesByProduct(ops, 'mouse'), 'p1:cef');
  });

  it('excludes terminal-status ops', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'cef', productId: 'p1', status: 'done' }),
      makeOp({ id: 'b', type: 'pif', productId: 'p1', status: 'error' }),
      makeOp({ id: 'c', type: 'kf',  productId: 'p1', status: 'cancelled' }),
    );
    assert.equal(selectActiveModulesByProduct(ops, 'mouse'), '');
  });

  it('coalesces multiple modules per product', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'cef', productId: 'p1', status: 'running' }),
      makeOp({ id: 'b', type: 'pif', productId: 'p1', status: 'queued'  }),
      makeOp({ id: 'c', type: 'kf',  productId: 'p1', status: 'running' }),
    );
    assert.equal(selectActiveModulesByProduct(ops, 'mouse'), 'p1:cef,kf,pif');
  });

  it('scopes by category', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'cef', productId: 'p1', category: 'mouse',    status: 'running' }),
      makeOp({ id: 'b', type: 'pif', productId: 'p2', category: 'keyboard', status: 'queued'  }),
    );
    assert.equal(selectActiveModulesByProduct(ops, 'mouse'), 'p1:cef');
  });

  it('sorts products alphabetically with stable module order per product', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'kf',  productId: 'pB', status: 'queued'  }),
      makeOp({ id: 'b', type: 'cef', productId: 'pA', status: 'running' }),
      makeOp({ id: 'c', type: 'pif', productId: 'pA', status: 'queued'  }),
    );
    assert.equal(selectActiveModulesByProduct(ops, 'mouse'), 'pA:cef,pif|pB:kf');
  });

  it('skips ops with no productId', () => {
    const ops = opsMap(makeOp({ id: 'a', type: 'pipeline', productId: undefined, status: 'running' }));
    assert.equal(selectActiveModulesByProduct(ops, 'mouse'), '');
  });
});
