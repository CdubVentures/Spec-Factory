import test from 'node:test';
import assert from 'node:assert/strict';
import { DUAL_KEY_PAIRS, assertDualKeyConsistency } from '../src/core/config/settingsKeyMap.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import {
  applyRuntimeSettingsToConfig,
  applyConvergenceSettingsToConfig,
} from '../src/features/settings-authority/userSettingsService.js';

// ---------------------------------------------------------------------------
// Dual-key consistency — only plan + reasoning fallback pairs remain.
// Per-role fallback aliases retired with model stack simplification.
// ---------------------------------------------------------------------------

test('dualKey: DUAL_KEY_PAIRS is a frozen non-empty array', () => {
  assert.ok(Array.isArray(DUAL_KEY_PAIRS));
  assert.equal(DUAL_KEY_PAIRS.length, 2, 'only plan + reasoning fallback pairs remain');
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

test('dualKey: remaining pairs are all self-referencing (keyA === keyB)', () => {
  for (const [keyA, keyB] of DUAL_KEY_PAIRS) {
    assert.equal(keyA, keyB, `expected self-referencing pair, got ${keyA} !== ${keyB}`);
  }
});

test('dualKey: assertDualKeyConsistency passes for consistent defaults', () => {
  assertDualKeyConsistency(SETTINGS_DEFAULTS.runtime);
});

test('dualKey: applyRuntimeSettingsToConfig updates llmModelPlan directly', () => {
  const config = { llmModelPlan: 'old-model' };
  applyRuntimeSettingsToConfig(config, { llmModelPlan: 'gpt-5' });
  assert.equal(config.llmModelPlan, 'gpt-5');
});

test('dualKey: applyRuntimeSettingsToConfig updates llmMaxOutputTokensPlan directly', () => {
  const config = { llmMaxOutputTokensPlan: 4096 };
  applyRuntimeSettingsToConfig(config, { llmMaxOutputTokensPlan: 8192 });
  assert.equal(config.llmMaxOutputTokensPlan, 8192);
});
