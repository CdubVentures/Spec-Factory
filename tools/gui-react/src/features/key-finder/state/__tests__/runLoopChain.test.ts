/**
 * runLoopChain — pure async helper tests.
 *
 * BEHAVIORAL class: orchestration contract. The Loop Group / Loop All chain
 * was previously a static-list iterator — once a key joined the chain, it
 * fired even if a bundled primary resolved it mid-chain. Spec says "what
 * remains in the group", so the chain must skip keys that became resolved
 * since it started.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runLoopChain } from '../runLoopChain.ts';

describe('runLoopChain', () => {
  it('fires every key when none resolve mid-chain', async () => {
    const fired: string[] = [];
    const result = await runLoopChain({
      keys: ['a', 'b', 'c'],
      isResolved: () => false,
      fireOne: async (fk) => { fired.push(fk); return `op-${fk}`; },
      awaitTerminal: async () => 'done',
    });
    assert.equal(result, 'complete');
    assert.deepEqual(fired, ['a', 'b', 'c']);
  });

  it('skips a key that became resolved before its slot fires', async () => {
    const fired: string[] = [];
    const resolved = new Set<string>();
    const result = await runLoopChain({
      keys: ['a', 'b', 'c'],
      // b gets resolved before its slot (e.g., by a's passenger pack)
      isResolved: (fk) => resolved.has(fk),
      fireOne: async (fk) => {
        fired.push(fk);
        if (fk === 'a') resolved.add('b'); // side effect: b resolves during a's run
        return `op-${fk}`;
      },
      awaitTerminal: async () => 'done',
    });
    assert.equal(result, 'complete');
    assert.deepEqual(fired, ['a', 'c'], 'b should be skipped');
  });

  it('skips a key that is still dependency-blocked before its slot fires', async () => {
    const fired: string[] = [];
    const blocked = new Set<string>(['sensor_brand']);
    const result = await runLoopChain({
      keys: ['sensor', 'sensor_brand', 'sensor_link'],
      isResolved: () => false,
      isBlocked: (fk) => blocked.has(fk),
      fireOne: async (fk) => {
        fired.push(fk);
        if (fk === 'sensor') blocked.delete('sensor_link');
        return `op-${fk}`;
      },
      awaitTerminal: async () => 'done',
    });
    assert.equal(result, 'complete');
    assert.deepEqual(fired, ['sensor', 'sensor_link'], 'blocked brand should not fire before the dependency unlocks');
  });

  it('re-reads isResolved each iteration (latest-state contract)', async () => {
    const checks: string[] = [];
    let isResolvedSnapshot: Record<string, boolean> = { a: false, b: false, c: false };
    await runLoopChain({
      keys: ['a', 'b', 'c'],
      isResolved: (fk) => { checks.push(fk); return isResolvedSnapshot[fk] ?? false; },
      fireOne: async () => 'op',
      awaitTerminal: async () => 'done',
    });
    // Exactly one isResolved check per key (just before its slot)
    assert.deepEqual(checks, ['a', 'b', 'c']);
  });

  it('reports skipped + firing actions via onStep', async () => {
    const steps: Array<{ fk: string; action: string }> = [];
    await runLoopChain({
      keys: ['a', 'b'],
      isResolved: (fk) => fk === 'a',
      fireOne: async () => 'op',
      awaitTerminal: async () => 'done',
      onStep: (s) => steps.push({ fk: s.fk, action: s.action }),
    });
    assert.deepEqual(steps, [
      { fk: 'a', action: 'skipped' },
      { fk: 'b', action: 'firing' },
    ]);
  });

  it('halts on cancellation mid-chain', async () => {
    const fired: string[] = [];
    const result = await runLoopChain({
      keys: ['a', 'b', 'c'],
      isResolved: () => false,
      fireOne: async (fk) => { fired.push(fk); return `op-${fk}`; },
      awaitTerminal: async (opId) => opId === 'op-b' ? 'cancelled' : 'done',
    });
    assert.equal(result, 'cancelled');
    assert.deepEqual(fired, ['a', 'b'], 'c should not fire after b cancelled');
  });

  it('empty keys array completes immediately', async () => {
    const result = await runLoopChain({
      keys: [],
      isResolved: () => false,
      fireOne: async () => { throw new Error('should not fire'); },
      awaitTerminal: async () => 'done',
    });
    assert.equal(result, 'complete');
  });

  it('all-resolved list skips every slot', async () => {
    const fired: string[] = [];
    const result = await runLoopChain({
      keys: ['a', 'b'],
      isResolved: () => true,
      fireOne: async (fk) => { fired.push(fk); return 'op'; },
      awaitTerminal: async () => 'done',
    });
    assert.equal(result, 'complete');
    assert.deepEqual(fired, [], 'nothing should fire');
  });
});
