import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../src/core/config/settingsKeyMap.js';

// Lazy-import PUT map (it re-exports from its own file)
const { RUNTIME_SETTINGS_ROUTE_PUT } = await import(
  '../src/features/settings-authority/runtimeSettingsRoutePut.js'
);

// WHY: Per-role extract/validate/write provider overrides were retired in model
// stack simplification. All roles alias to llmModelPlan — per-role provider
// routing is no longer exposed. Plan provider keys remain (global provider route).
const RETIRED_PROVIDER_OVERRIDE_KEYS = [
  'llmExtractProvider',
  'llmExtractBaseUrl',
  'llmExtractApiKey',
  'llmValidateProvider',
  'llmValidateBaseUrl',
  'llmValidateApiKey',
  'llmWriteProvider',
  'llmWriteBaseUrl',
  'llmWriteApiKey',
];

test('retired per-role provider override keys still have defaults (backward compat hydration)', () => {
  for (const key of RETIRED_PROVIDER_OVERRIDE_KEYS) {
    assert.ok(
      Object.hasOwn(SETTINGS_DEFAULTS.runtime, key),
      `Default should still exist for backward compat: ${key}`,
    );
    assert.equal(
      SETTINGS_DEFAULTS.runtime[key],
      '',
      `Default for ${key} should be empty string`,
    );
  }
});

test('retired per-role provider override keys are still in GET stringMap (backward compat read)', () => {
  for (const key of RETIRED_PROVIDER_OVERRIDE_KEYS) {
    assert.ok(
      Object.hasOwn(RUNTIME_SETTINGS_ROUTE_GET.stringMap, key),
      `GET stringMap should still include ${key} for backward compat`,
    );
  }
});

test('retired per-role provider override keys are NOT in PUT stringFreeMap', () => {
  for (const key of RETIRED_PROVIDER_OVERRIDE_KEYS) {
    assert.ok(
      !Object.hasOwn(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap, key),
      `PUT stringFreeMap should not include retired key ${key}`,
    );
  }
});

test('PUT contract includes fallback model keys and parsingConfidenceBaseMapJson', () => {
  const requiredKeys = [
    'llmPlanFallbackModel',
    'llmReasoningFallbackModel',
    'parsingConfidenceBaseMapJson',
  ];
  for (const key of requiredKeys) {
    assert.ok(
      Object.hasOwn(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap, key),
      `PUT stringFreeMap must include ${key}`,
    );
  }
});

test('PUT contract does not include retired per-role model keys', () => {
  const retiredModelKeys = [
    'llmModelTriage',
    'llmModelFast',
    'llmModelExtract',
    'llmModelValidate',
    'llmModelWrite',
  ];
  for (const key of retiredModelKeys) {
    assert.ok(
      !Object.hasOwn(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap, key),
      `PUT stringFreeMap should not include retired key ${key}`,
    );
  }
});

test('PUT contract does not include llmTriageUseReasoning', () => {
  assert.ok(
    !Object.hasOwn(RUNTIME_SETTINGS_ROUTE_PUT.boolMap, 'llmTriageUseReasoning'),
    'PUT boolMap should not include retired llmTriageUseReasoning',
  );
});
