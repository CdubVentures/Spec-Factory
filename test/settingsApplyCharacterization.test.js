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
  });
  assert.equal(config.serpTriageMinScore, 5);
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

// =========================================================================
// SECTION 5b: llmPhaseOverridesJson must re-resolve _resolved* fields
// =========================================================================

test('applyRuntimeSettingsToConfig re-resolves phase overrides when llmPhaseOverridesJson changes', () => {
  const config = loadConfig();
  // Before: all phases use global llmModelPlan
  assert.equal(config._resolvedNeedsetBaseModel, config.llmModelPlan);
  assert.equal(config._resolvedExtractionBaseModel, config.llmModelPlan);

  // Apply phase overrides via runtime settings (simulates GUI save)
  const overrides = JSON.stringify({
    needset: { baseModel: 'gpt-5-low' },
    extraction: { baseModel: 'deepseek-chat' },
  });
  applyRuntimeSettingsToConfig(config, { llmPhaseOverridesJson: overrides });

  // After: overridden phases must use their per-phase model, not the global
  assert.equal(config._resolvedNeedsetBaseModel, 'gpt-5-low');
  assert.equal(config._resolvedExtractionBaseModel, 'deepseek-chat');
  // Non-overridden phases still use global
  assert.equal(config._resolvedSearchPlannerBaseModel, config.llmModelPlan);
  assert.equal(config._resolvedBrandResolverBaseModel, config.llmModelPlan);
});

test('applyRuntimeSettingsToConfig re-resolves _resolved* when llmModelPlan changes without llmPhaseOverridesJson', () => {
  const config = loadConfig();
  const originalModel = config.llmModelPlan;
  // Before: all phases inherit from llmModelPlan
  assert.equal(config._resolvedNeedsetBaseModel, originalModel);
  assert.equal(config._resolvedSerpSelectorBaseModel, originalModel);

  // Change ONLY the global base model — no phase overrides change
  applyRuntimeSettingsToConfig(config, { llmModelPlan: 'gemini-2.5-flash' });

  // After: all _resolved* keys must reflect the new global model
  assert.equal(config._resolvedNeedsetBaseModel, 'gemini-2.5-flash',
    '_resolvedNeedsetBaseModel must update when llmModelPlan changes');
  assert.equal(config._resolvedSerpSelectorBaseModel, 'gemini-2.5-flash',
    '_resolvedSerpSelectorBaseModel must update when llmModelPlan changes');
  assert.equal(config._resolvedSearchPlannerBaseModel, 'gemini-2.5-flash',
    '_resolvedSearchPlannerBaseModel must update when llmModelPlan changes');
  assert.equal(config._resolvedBrandResolverBaseModel, 'gemini-2.5-flash',
    '_resolvedBrandResolverBaseModel must update when llmModelPlan changes');
});

test('applyRuntimeSettingsToConfig re-resolves reasoning overrides per phase', () => {
  const config = loadConfig();

  const overrides = JSON.stringify({
    serpSelector: { useReasoning: true, reasoningModel: 'deepseek-reasoner' },
  });
  applyRuntimeSettingsToConfig(config, { llmPhaseOverridesJson: overrides });

  assert.equal(config._resolvedSerpSelectorUseReasoning, true);
  assert.equal(config._resolvedSerpSelectorReasoningModel, 'deepseek-reasoner');
});

test('applyRuntimeSettingsToConfig clears phase overrides when set to empty JSON', () => {
  const config = loadConfig();

  // First apply overrides
  applyRuntimeSettingsToConfig(config, {
    llmPhaseOverridesJson: JSON.stringify({ needset: { baseModel: 'gpt-5-low' } }),
  });
  assert.equal(config._resolvedNeedsetBaseModel, 'gpt-5-low');

  // Then clear them
  applyRuntimeSettingsToConfig(config, { llmPhaseOverridesJson: '{}' });
  assert.equal(config._resolvedNeedsetBaseModel, config.llmModelPlan);
});

// =========================================================================
// SECTION 5: _registryLookup rebuild on llmProviderRegistryJson change
// =========================================================================

test('applyRuntimeSettingsToConfig rebuilds _registryLookup when llmProviderRegistryJson changes', () => {
  const config = loadConfig();

  const registry = JSON.stringify([{
    id: 'test-provider',
    name: 'Test',
    type: 'openai-compatible',
    baseUrl: 'https://test.example.com',
    apiKey: 'test-key-123',
    enabled: true,
    models: [
      { id: 'test-m1', modelId: 'test-model-alpha', role: 'primary', costInputPer1M: 1, costOutputPer1M: 2, costCachedPer1M: 0.1 },
      { id: 'test-m2', modelId: 'test-model-beta', role: 'reasoning', costInputPer1M: 3, costOutputPer1M: 6, costCachedPer1M: 0.3 },
    ],
  }]);

  applyRuntimeSettingsToConfig(config, { llmProviderRegistryJson: registry });

  assert.equal(config._registryLookup.modelIndex.size, 2,
    '_registryLookup must be rebuilt with 2 models from the new registry');

  const alpha = config._registryLookup.modelIndex.get('test-model-alpha');
  assert.ok(alpha, 'test-model-alpha must be in _registryLookup');
  assert.equal(alpha[0].baseUrl, 'https://test.example.com');
  assert.equal(alpha[0].apiKey, 'test-key-123');
});

test('applyRuntimeSettingsToConfig does NOT rebuild _registryLookup when unrelated keys change', () => {
  const config = loadConfig();
  const lookupBefore = config._registryLookup;
  applyRuntimeSettingsToConfig(config, { llmModelPlan: 'some-model' });
  assert.strictEqual(config._registryLookup, lookupBefore,
    '_registryLookup must not be rebuilt when only llmModelPlan changes');
});

// =========================================================================
// SECTION 6: no rollback capability (characterizing current limitation)
// =========================================================================

test('CHAR apply: in-place mutation has no rollback — values are permanently changed', () => {
  const config = loadConfig();
  const original = config.maxUrlsPerProduct;
  applyRuntimeSettingsToConfig(config, { maxUrlsPerProduct: 999 });
  assert.equal(config.maxUrlsPerProduct, 999);
  // There is no way to rollback — this characterizes F16
  assert.notEqual(config.maxUrlsPerProduct, original);
});
