import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sortOperations } from '../opSort.ts';
import type { Operation } from '../operationsStore.ts';

function makeOp(overrides: Partial<Operation> = {}): Operation {
  return {
    id: 'op-1',
    type: 'cef',
    category: 'monitor',
    productId: 'p-1',
    productLabel: 'Product 1',
    stages: [],
    currentStageIndex: 0,
    status: 'running',
    startedAt: '2026-04-18T10:00:00Z',
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [],
    ...overrides,
  };
}

function asMap(ops: Operation[]): Map<string, Operation> {
  return new Map(ops.map((o) => [o.id, o]));
}

function ids(ops: Operation[]): string[] {
  return ops.map((o) => o.id);
}

describe('sortOperations', () => {
  describe("mode: 'queue' (order called, oldest first)", () => {
    it('oldest startedAt first regardless of status', () => {
      const a = makeOp({ id: 'a', startedAt: '2026-04-18T09:00:00Z', status: 'done' });
      const b = makeOp({ id: 'b', startedAt: '2026-04-18T10:00:00Z', status: 'running' });
      const c = makeOp({ id: 'c', startedAt: '2026-04-18T11:00:00Z', status: 'error' });
      const sorted = sortOperations(asMap([c, a, b]), 'queue');
      assert.deepEqual(ids(sorted), ['a', 'b', 'c']);
    });

    it('mixing running/done/error preserves time order', () => {
      const t1 = makeOp({ id: 't1', startedAt: '2026-04-18T10:00:00Z', status: 'done' });
      const t2 = makeOp({ id: 't2', startedAt: '2026-04-18T10:00:01Z', status: 'running' });
      const t3 = makeOp({ id: 't3', startedAt: '2026-04-18T10:00:02Z', status: 'done' });
      const t4 = makeOp({ id: 't4', startedAt: '2026-04-18T10:00:03Z', status: 'running' });
      const sorted = sortOperations(asMap([t4, t3, t2, t1]), 'queue');
      assert.deepEqual(ids(sorted), ['t1', 't2', 't3', 't4']);
    });

    it('is the default mode', () => {
      const a = makeOp({ id: 'a', startedAt: '2026-04-18T09:00:00Z' });
      const b = makeOp({ id: 'b', startedAt: '2026-04-18T10:00:00Z' });
      const sorted = sortOperations(asMap([b, a]));
      assert.deepEqual(ids(sorted), ['a', 'b']);
    });
  });

  describe("mode: 'recent' (newest first)", () => {
    it('newest startedAt first regardless of status', () => {
      const a = makeOp({ id: 'a', startedAt: '2026-04-18T09:00:00Z', status: 'done' });
      const b = makeOp({ id: 'b', startedAt: '2026-04-18T10:00:00Z', status: 'running' });
      const c = makeOp({ id: 'c', startedAt: '2026-04-18T11:00:00Z', status: 'error' });
      const sorted = sortOperations(asMap([a, b, c]), 'recent');
      assert.deepEqual(ids(sorted), ['c', 'b', 'a']);
    });
  });

  describe("mode: 'grouped' (status then newest)", () => {
    it('running first, then error, then cancelled, then done', () => {
      const r = makeOp({ id: 'r', status: 'running', startedAt: '2026-04-18T09:00:00Z' });
      const e = makeOp({ id: 'e', status: 'error', startedAt: '2026-04-18T10:00:00Z' });
      const c = makeOp({ id: 'c', status: 'cancelled', startedAt: '2026-04-18T11:00:00Z' });
      const d = makeOp({ id: 'd', status: 'done', startedAt: '2026-04-18T12:00:00Z' });
      const sorted = sortOperations(asMap([d, c, e, r]), 'grouped');
      assert.deepEqual(ids(sorted), ['r', 'e', 'c', 'd']);
    });

    it('within a status group, newest first', () => {
      const r1 = makeOp({ id: 'r1', status: 'running', startedAt: '2026-04-18T09:00:00Z' });
      const r2 = makeOp({ id: 'r2', status: 'running', startedAt: '2026-04-18T10:00:00Z' });
      const d1 = makeOp({ id: 'd1', status: 'done', startedAt: '2026-04-18T11:00:00Z' });
      const d2 = makeOp({ id: 'd2', status: 'done', startedAt: '2026-04-18T12:00:00Z' });
      const sorted = sortOperations(asMap([r1, r2, d1, d2]), 'grouped');
      assert.deepEqual(ids(sorted), ['r2', 'r1', 'd2', 'd1']);
    });
  });

  describe('boundaries', () => {
    it('empty map returns empty array', () => {
      assert.deepEqual(sortOperations(new Map(), 'queue'), []);
      assert.deepEqual(sortOperations(new Map(), 'recent'), []);
      assert.deepEqual(sortOperations(new Map(), 'grouped'), []);
    });

    it('single op returns array with that op', () => {
      const a = makeOp({ id: 'a' });
      const sorted = sortOperations(asMap([a]), 'queue');
      assert.equal(sorted.length, 1);
      assert.equal(sorted[0].id, 'a');
    });

    it('does not mutate input map', () => {
      const a = makeOp({ id: 'a', startedAt: '2026-04-18T10:00:00Z' });
      const b = makeOp({ id: 'b', startedAt: '2026-04-18T09:00:00Z' });
      const map = asMap([a, b]);
      const sizeBefore = map.size;
      sortOperations(map, 'queue');
      sortOperations(map, 'recent');
      sortOperations(map, 'grouped');
      assert.equal(map.size, sizeBefore);
      // Original map iteration order is preserved (not mutated).
      const iterated = [...map.values()].map((o) => o.id);
      assert.deepEqual(iterated, ['a', 'b']);
    });
  });
});
