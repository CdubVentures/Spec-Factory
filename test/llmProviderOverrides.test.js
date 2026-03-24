import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../src/core/config/settingsKeyMap.js';

// Lazy-import PUT map (it re-exports from its own file)
const { RUNTIME_SETTINGS_ROUTE_PUT } = await import(
  '../src/features/settings-authority/runtimeSettingsRoutePut.js'
);

// WHY: Per-role extract/validate/write provider overrides fully retired.
// All roles alias to llmModelPlan — per-role provider routing removed from
// GET/defaults/clamping surfaces.
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

test('retired per-role provider override keys are removed from defaults', () => {
  for (const key of RETIRED_PROVIDER_OVERRIDE_KEYS) {
    assert.equal(
      Object.hasOwn(SETTINGS_DEFAULTS.runtime, key),
      false,
      `Default should no longer exist: ${key}`,
    );
  }
});

test('retired per-role provider override keys are removed from GET stringMap', () => {
  for (const key of RETIRED_PROVIDER_OVERRIDE_KEYS) {
    assert.equal(
      Object.hasOwn(RUNTIME_SETTINGS_ROUTE_GET.stringMap, key),
      false,
      `GET stringMap should no longer include ${key}`,
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

test('PUT contract includes fallback model keys', () => {
  const requiredKeys = [
    'llmPlanFallbackModel',
    'llmReasoningFallbackModel',
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
