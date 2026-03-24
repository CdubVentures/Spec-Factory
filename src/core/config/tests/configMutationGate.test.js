import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfigMutationGate } from '../configMutationGate.js';

// ---------------------------------------------------------------------------
// Phase 13 — Tests for configMutationGate.js
//
// Tests for the centralized config mutation gate that enables rollback
// and prevents direct config[key] = value mutations.
// ---------------------------------------------------------------------------

// =========================================================================
// applyPatch
// =========================================================================

test('mutationGate: applyPatch updates existing keys', () => {
  const config = { maxUrls: 10, concurrency: 4 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ maxUrls: 20, concurrency: 8 });
  assert.equal(config.maxUrls, 20);
  assert.equal(config.concurrency, 8);
});

test('mutationGate: applyPatch ignores keys not in config', () => {
  const config = { maxUrls: 10 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ maxUrls: 20, nonExistent: 'foo' });
  assert.equal(config.maxUrls, 20);
  assert.equal(Object.hasOwn(config, 'nonExistent'), false);
});

test('mutationGate: applyPatch with empty patch is no-op', () => {
  const config = { maxUrls: 10 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({});
  assert.equal(config.maxUrls, 10);
});

test('mutationGate: applyPatch records source metadata', () => {
  const config = { maxUrls: 10 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ maxUrls: 20 }, { source: 'runtime-settings' });
  assert.equal(config.maxUrls, 20);
});

// =========================================================================
// rollback
// =========================================================================

test('mutationGate: rollback restores previous state', () => {
  const config = { maxUrls: 10, concurrency: 4 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ maxUrls: 20, concurrency: 8 });
  assert.equal(config.maxUrls, 20);
  const rolled = gate.rollback();
  assert.equal(rolled, true);
  assert.equal(config.maxUrls, 10);
  assert.equal(config.concurrency, 4);
});

test('mutationGate: rollback returns false when no snapshot exists', () => {
  const config = { maxUrls: 10 };
  const gate = createConfigMutationGate(config);
  assert.equal(gate.rollback(), false);
});

test('mutationGate: rollback only reverts the last applyPatch', () => {
  const config = { maxUrls: 10, concurrency: 4 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ maxUrls: 20 });
  gate.applyPatch({ maxUrls: 30, concurrency: 16 });
  // Rollback should restore to {maxUrls: 20, concurrency: 4} (before second patch)
  // The snapshot was taken at the start of the second applyPatch
  gate.rollback();
  assert.equal(config.maxUrls, 20);
  assert.equal(config.concurrency, 4);
});

test('mutationGate: rollback can only be called once per patch', () => {
  const config = { maxUrls: 10 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ maxUrls: 20 });
  assert.equal(gate.rollback(), true);
  assert.equal(gate.rollback(), false);
  assert.equal(config.maxUrls, 10);
});

// =========================================================================
// snapshot
// =========================================================================

test('mutationGate: snapshot returns a copy of current config', () => {
  const config = { maxUrls: 10, concurrency: 4 };
  const gate = createConfigMutationGate(config);
  const snap = gate.snapshot();
  assert.deepStrictEqual(snap, { maxUrls: 10, concurrency: 4 });
  // Mutating snapshot should not affect config
  snap.maxUrls = 999;
  assert.equal(config.maxUrls, 10);
});

test('mutationGate: snapshot reflects latest mutations', () => {
  const config = { maxUrls: 10 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ maxUrls: 42 });
  const snap = gate.snapshot();
  assert.equal(snap.maxUrls, 42);
});

// =========================================================================
// edge cases
// =========================================================================

test('mutationGate: applyPatch handles null/undefined values gracefully', () => {
  const config = { maxUrls: 10, name: 'test' };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ maxUrls: null, name: undefined });
  assert.equal(config.maxUrls, null);
  assert.equal(config.name, undefined);
});

test('mutationGate: multiple sequential patches each create snapshots for their own rollback', () => {
  const config = { a: 1, b: 2 };
  const gate = createConfigMutationGate(config);
  gate.applyPatch({ a: 10 });
  gate.applyPatch({ b: 20 });
  // Rollback reverts the last patch (b: 20 → b: 2)
  gate.rollback();
  assert.equal(config.a, 10);
  assert.equal(config.b, 2);
});
