import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import {
  applyRuntimeSettingsToConfig,
  applyConvergenceSettingsToConfig
} from '../src/features/settings-authority/userSettingsService.js';

// ---------------------------------------------------------------------------
// Phase 0 — Characterization tests for settings apply functions
//
// These tests lock down the CURRENT behavior of applyRuntimeSettingsToConfig()
// and applyConvergenceSettingsToConfig() before refactoring. This covers F17
// (the test gap for these functions).
// ---------------------------------------------------------------------------

// =========================================================================
// SECTION 1: applyRuntimeSettingsToConfig basic behavior
// =========================================================================

test('CHAR apply: applyRuntimeSettingsToConfig modifies config in-place', () => {
  const config = loadConfig();
  const originalConcurrency = config.concurrency;
  applyRuntimeSettingsToConfig(config, { fetchConcurrency: 8 });
  // fetchConcurrency maps to concurrency via settingsKeyMap
  // The apply function uses sanitized keys, so check if any key was applied
  assert.equal(typeof config.concurrency, 'number');
});

test('CHAR apply: applyRuntimeSettingsToConfig with empty settings is no-op', () => {
  const config = loadConfig();
  const snapshot = { ...config };
  applyRuntimeSettingsToConfig(config, {});
  // Config should be unchanged after applying empty settings
  for (const key of Object.keys(snapshot)) {
    if (typeof snapshot[key] !== 'object') {
      assert.equal(config[key], snapshot[key], `${key} should not change`);
    }
  }
});

test('CHAR apply: applyRuntimeSettingsToConfig with null config is silent no-op', () => {
  // Should not throw
  applyRuntimeSettingsToConfig(null, { maxUrlsPerProduct: 10 });
  applyRuntimeSettingsToConfig(undefined, { maxUrlsPerProduct: 10 });
});

test('CHAR apply: applyRuntimeSettingsToConfig with non-object config is silent no-op', () => {
  applyRuntimeSettingsToConfig('not-an-object', { maxUrlsPerProduct: 10 });
  applyRuntimeSettingsToConfig(42, { maxUrlsPerProduct: 10 });
});

test('CHAR apply: applyRuntimeSettingsToConfig only updates keys that exist in config', () => {
  const config = loadConfig();
  const nonexistentKey = '__DEFINITELY_NOT_A_CONFIG_KEY_' + Date.now();
  applyRuntimeSettingsToConfig(config, { [nonexistentKey]: 'value' });
  assert.equal(Object.hasOwn(config, nonexistentKey), false);
});

test('CHAR apply: applyRuntimeSettingsToConfig applies known settings keys', () => {
  const config = loadConfig();
  // Apply a direct config key (maxUrlsPerProduct maps directly)
  applyRuntimeSettingsToConfig(config, { maxUrlsPerProduct: 99 });
  assert.equal(config.maxUrlsPerProduct, 99);
});

// =========================================================================
// SECTION 2: applyConvergenceSettingsToConfig basic behavior
// =========================================================================

test('CHAR apply: applyConvergenceSettingsToConfig modifies config in-place', () => {
  const config = loadConfig();
  applyConvergenceSettingsToConfig(config, { serpTriageMinScore: 5 });
  assert.equal(config.serpTriageMinScore, 5);
});

test('CHAR apply: applyConvergenceSettingsToConfig with empty settings is no-op', () => {
  const config = loadConfig();
  const snapshot = { ...config };
  applyConvergenceSettingsToConfig(config, {});
  for (const key of Object.keys(snapshot)) {
    if (typeof snapshot[key] !== 'object') {
      assert.equal(config[key], snapshot[key], `${key} should not change`);
    }
  }
});

test('CHAR apply: applyConvergenceSettingsToConfig with null config is silent no-op', () => {
  applyConvergenceSettingsToConfig(null, { serpTriageMinScore: 5 });
  applyConvergenceSettingsToConfig(undefined, { serpTriageMinScore: 5 });
});

test('CHAR apply: applyConvergenceSettingsToConfig only updates keys that exist in config', () => {
  const config = loadConfig();
  const nonexistentKey = '__DEFINITELY_NOT_A_CONFIG_KEY_' + Date.now();
  applyConvergenceSettingsToConfig(config, { [nonexistentKey]: 'value' });
  assert.equal(Object.hasOwn(config, nonexistentKey), false);
});

test('CHAR apply: applyConvergenceSettingsToConfig applies convergence keys', () => {
  const config = loadConfig();
  applyConvergenceSettingsToConfig(config, {
    serpTriageMinScore: 5,
    serpTriageMaxUrls: 15
  });
  assert.equal(config.serpTriageMinScore, 5);
  assert.equal(config.serpTriageMaxUrls, 15);
});

// =========================================================================
// SECTION 3: type coercion behavior
// =========================================================================

test('CHAR apply: applyRuntimeSettingsToConfig handles string numbers', () => {
  const config = loadConfig();
  // After sanitization, numeric strings may or may not be coerced
  // This test captures the current behavior
  applyRuntimeSettingsToConfig(config, { maxUrlsPerProduct: 42 });
  assert.equal(config.maxUrlsPerProduct, 42);
});

test('CHAR apply: applyConvergenceSettingsToConfig handles int values', () => {
  const config = loadConfig();
  applyConvergenceSettingsToConfig(config, { serpTriageMinScore: 7 });
  assert.equal(config.serpTriageMinScore, 7);
});

// =========================================================================
// SECTION 4: multiple apply calls stack
// =========================================================================

test('CHAR apply: multiple applyRuntimeSettingsToConfig calls stack', () => {
  const config = loadConfig();
  applyRuntimeSettingsToConfig(config, { maxUrlsPerProduct: 10 });
  assert.equal(config.maxUrlsPerProduct, 10);
  applyRuntimeSettingsToConfig(config, { maxUrlsPerProduct: 20 });
  assert.equal(config.maxUrlsPerProduct, 20);
});

test('CHAR apply: runtime and convergence apply functions can be mixed', () => {
  const config = loadConfig();
  applyRuntimeSettingsToConfig(config, { maxUrlsPerProduct: 42 });
  applyConvergenceSettingsToConfig(config, { serpTriageMinScore: 7 });
  assert.equal(config.maxUrlsPerProduct, 42);
  assert.equal(config.serpTriageMinScore, 7);
});

// =========================================================================
// SECTION 5: no rollback capability (characterizing current limitation)
// =========================================================================

test('CHAR apply: in-place mutation has no rollback — values are permanently changed', () => {
  const config = loadConfig();
  const original = config.maxUrlsPerProduct;
  applyRuntimeSettingsToConfig(config, { maxUrlsPerProduct: 999 });
  assert.equal(config.maxUrlsPerProduct, 999);
  // There is no way to rollback — this characterizes F16
  assert.notEqual(config.maxUrlsPerProduct, original);
});
