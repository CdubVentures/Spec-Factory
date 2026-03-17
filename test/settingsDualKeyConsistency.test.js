import test from 'node:test';
import assert from 'node:assert/strict';
import { DUAL_KEY_PAIRS, assertDualKeyConsistency } from '../src/core/config/settingsKeyMap.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import {
  applyRuntimeSettingsToConfig,
  applyConvergenceSettingsToConfig,
} from '../src/features/settings-authority/userSettingsService.js';

// ---------------------------------------------------------------------------
// Phase 11 — Tests for dual-key consistency
//
// Verifies that the 17 dual-key pairs in SETTINGS_DEFAULTS.runtime have
// identical values and that assertDualKeyConsistency catches drift.
// ---------------------------------------------------------------------------

test('dualKey: DUAL_KEY_PAIRS is a frozen non-empty array', () => {
  assert.ok(Array.isArray(DUAL_KEY_PAIRS));
  assert.ok(DUAL_KEY_PAIRS.length > 0);
  assert.ok(Object.isFrozen(DUAL_KEY_PAIRS));
});

test('dualKey: each pair is a 2-element array of strings', () => {
  for (const pair of DUAL_KEY_PAIRS) {
    assert.ok(Array.isArray(pair), 'pair must be an array');
    assert.equal(pair.length, 2, 'pair must have exactly 2 elements');
    assert.equal(typeof pair[0], 'string');
    assert.equal(typeof pair[1], 'string');
  }
});

test('dualKey: all dual-key pairs have identical values in SETTINGS_DEFAULTS.runtime', () => {
  const runtime = SETTINGS_DEFAULTS.runtime;
  for (const [keyA, keyB] of DUAL_KEY_PAIRS) {
    assert.ok(Object.hasOwn(runtime, keyA), `${keyA} must exist in runtime defaults`);
    assert.ok(Object.hasOwn(runtime, keyB), `${keyB} must exist in runtime defaults`);
    assert.deepStrictEqual(
      runtime[keyA],
      runtime[keyB],
      `${keyA} (${runtime[keyA]}) must equal ${keyB} (${runtime[keyB]})`
    );
  }
});

test('dualKey: assertDualKeyConsistency passes for consistent defaults', () => {
  // Should not throw
  assertDualKeyConsistency(SETTINGS_DEFAULTS.runtime);
});

test('dualKey: assertDualKeyConsistency throws for inconsistent pair', () => {
  const inconsistent = {
    ...SETTINGS_DEFAULTS.runtime,
    phase2LlmModel: 'model-a',
    llmModelPlan: 'model-b' // intentionally different
  };
  assert.throws(
    () => assertDualKeyConsistency(inconsistent),
    (err) => {
      assert.ok(err.message.includes('phase2LlmModel'));
      assert.ok(err.message.includes('llmModelPlan'));
      return true;
    }
  );
});

test('dualKey: assertDualKeyConsistency skips pairs where one key is missing', () => {
  const partial = { phase2LlmModel: 'model-a' };
  // Should not throw — llmModelPlan is missing, so pair is skipped
  assertDualKeyConsistency(partial);
});

// =========================================================================
// Phase 12 — Apply function dual-key sync
// =========================================================================

test('dualKey: applyRuntimeSettingsToConfig syncs llmModelPlan → phase2LlmModel', () => {
  const config = {
    phase2LlmModel: 'old-model',
    llmModelPlan: 'old-model',
  };
  // sanitizeRuntimeSettings uses canonical key 'llmModelPlan' (not GUI alias)
  applyRuntimeSettingsToConfig(config, { llmModelPlan: 'gpt-5' });
  assert.equal(config.llmModelPlan, 'gpt-5');
  assert.equal(config.phase2LlmModel, 'gpt-5');
});

test('dualKey: applyRuntimeSettingsToConfig syncs llmMaxOutputTokensPlan → llmTokensPlan', () => {
  const config = {
    llmTokensPlan: 4096,
    llmMaxOutputTokensPlan: 4096,
  };
  // sanitizeRuntimeSettings uses canonical key 'llmMaxOutputTokensPlan'
  applyRuntimeSettingsToConfig(config, { llmMaxOutputTokensPlan: 8192 });
  assert.equal(config.llmMaxOutputTokensPlan, 8192);
  assert.equal(config.llmTokensPlan, 8192);
});

test('dualKey: applyRuntimeSettingsToConfig does not sync when partner key missing from config', () => {
  const config = {
    llmModelPlan: 'old-model',
    // phase2LlmModel deliberately missing
  };
  applyRuntimeSettingsToConfig(config, { llmModelPlan: 'gpt-5' });
  assert.equal(config.llmModelPlan, 'gpt-5');
  assert.equal(config.phase2LlmModel, undefined);
});
