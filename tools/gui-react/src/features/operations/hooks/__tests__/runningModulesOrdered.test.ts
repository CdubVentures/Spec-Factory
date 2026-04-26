import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectRunningModulesByProductOrdered,
  parseOrderedModulesByProduct,
} from '../useFinderOperations.ts';
import type { Operation } from '../../state/operationsStore.ts';

function makeOp(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    type: 'cef',
    category: 'mouse',
    productId: 'p1',
    productLabel: 'Test',
    stages: [],
    currentStageIndex: 0,
    status: 'running',
    startedAt: '2026-04-25T10:00:00Z',
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [],
    ...overrides,
  };
}

function opsMap(...ops: Operation[]): ReadonlyMap<string, Operation> {
  return new Map(ops.map((o) => [o.id, o]));
}

describe('selectRunningModulesByProductOrdered', () => {
  it('returns empty string for empty operations', () => {
    assert.equal(selectRunningModulesByProductOrdered(new Map(), 'mouse'), '');
  });

  it('orders modules by call time (queuedAt ?? startedAt) ascending', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'pif', productId: 'p1', status: 'running', startedAt: '2026-04-25T10:00:02Z' }),
      makeOp({ id: 'b', type: 'cef', productId: 'p1', status: 'running', startedAt: '2026-04-25T10:00:01Z' }),
      makeOp({ id: 'c', type: 'kf',  productId: 'p1', status: 'running', startedAt: '2026-04-25T10:00:03Z' }),
    );
    assert.equal(
      selectRunningModulesByProductOrdered(ops, 'mouse'),
      'p1:cef,pif,kf',
    );
  });

  it('prefers queuedAt over startedAt for ordering', () => {
    const ops = opsMap(
      // startedAt earlier, but queuedAt later → should order LATER
      makeOp({ id: 'a', type: 'pif', productId: 'p1', status: 'running',
              startedAt: '2026-04-25T10:00:00Z', queuedAt: '2026-04-25T10:00:05Z' }),
      makeOp({ id: 'b', type: 'cef', productId: 'p1', status: 'running',
              startedAt: '2026-04-25T10:00:02Z', queuedAt: '2026-04-25T10:00:01Z' }),
    );
    assert.equal(
      selectRunningModulesByProductOrdered(ops, 'mouse'),
      'p1:cef,pif',
    );
  });

  it('deduplicates module types — first occurrence wins', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'cef', productId: 'p1', status: 'running', startedAt: '2026-04-25T10:00:01Z' }),
      makeOp({ id: 'b', type: 'pif', productId: 'p1', status: 'running', startedAt: '2026-04-25T10:00:02Z' }),
      makeOp({ id: 'c', type: 'cef', productId: 'p1', status: 'running', startedAt: '2026-04-25T10:00:03Z' }),
    );
    assert.equal(
      selectRunningModulesByProductOrdered(ops, 'mouse'),
      'p1:cef,pif',
    );
  });

  it('excludes non-running operations (queued, done, error, cancelled)', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'cef', productId: 'p1', status: 'running' }),
      makeOp({ id: 'b', type: 'pif', productId: 'p1', status: 'queued' }),
      makeOp({ id: 'c', type: 'kf',  productId: 'p1', status: 'done' }),
      makeOp({ id: 'd', type: 'rdf', productId: 'p1', status: 'error' }),
      makeOp({ id: 'e', type: 'skf', productId: 'p1', status: 'cancelled' }),
    );
    assert.equal(
      selectRunningModulesByProductOrdered(ops, 'mouse'),
      'p1:cef',
    );
  });

  it('splits per product and sorts product ids alphabetically', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'cef', productId: 'p2', status: 'running', startedAt: '2026-04-25T10:00:01Z' }),
      makeOp({ id: 'b', type: 'pif', productId: 'p1', status: 'running', startedAt: '2026-04-25T10:00:02Z' }),
    );
    assert.equal(
      selectRunningModulesByProductOrdered(ops, 'mouse'),
      'p1:pif|p2:cef',
    );
  });

  it('filters by category', () => {
    const ops = opsMap(
      makeOp({ id: 'a', type: 'cef', productId: 'p1', category: 'mouse',    status: 'running' }),
      makeOp({ id: 'b', type: 'pif', productId: 'p1', category: 'keyboard', status: 'running' }),
    );
    assert.equal(
      selectRunningModulesByProductOrdered(ops, 'mouse'),
      'p1:cef',
    );
  });

  it('returns empty when category is set but no ops match', () => {
    const ops = opsMap(makeOp({ category: 'keyboard', status: 'running' }));
    assert.equal(selectRunningModulesByProductOrdered(ops, 'mouse'), '');
  });
});

describe('parseOrderedModulesByProduct', () => {
  it('returns an empty map for empty signature', () => {
    const map = parseOrderedModulesByProduct('');
    assert.equal(map.size, 0);
  });

  it('round-trips a single product signature with order preserved', () => {
    const map = parseOrderedModulesByProduct('p1:cef,pif,kf');
    assert.deepEqual([...map.keys()], ['p1']);
    assert.deepEqual([...(map.get('p1') ?? [])], ['cef', 'pif', 'kf']);
  });

  it('round-trips multiple products', () => {
    const map = parseOrderedModulesByProduct('p1:cef,pif|p2:kf');
    assert.deepEqual([...(map.get('p1') ?? [])], ['cef', 'pif']);
    assert.deepEqual([...(map.get('p2') ?? [])], ['kf']);
  });

  it('skips malformed tokens', () => {
    const map = parseOrderedModulesByProduct('p1:cef|broken|p2:pif');
    assert.deepEqual([...(map.get('p1') ?? [])], ['cef']);
    assert.deepEqual([...(map.get('p2') ?? [])], ['pif']);
    assert.equal(map.size, 2);
  });
});
