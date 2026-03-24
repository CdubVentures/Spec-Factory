import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNeedSet,
  makeIdentityLocked,
  makeIdentityUnlocked,
  makeIdentityConflict,
  makeBaseRules,
  makeBaseInput,
} from './helpers/phase01NeedSetHarness.js';

// --- Test groups ---

describe('Phase 01 â€” Determinism', () => {
  it('same inputs produce identical bundle ordering', () => {
    const input = makeBaseInput();
    const result1 = computeNeedSet(input);
    const result2 = computeNeedSet(input);
    assert.deepEqual(
      result1.bundles.map((b) => b.bundle_id),
      result2.bundles.map((b) => b.bundle_id),
      'bundle ordering must be deterministic'
    );
    assert.deepEqual(
      result1.rows.map((r) => r.field_key),
      result2.rows.map((r) => r.field_key),
      'row ordering must be deterministic'
    );
  });
});
