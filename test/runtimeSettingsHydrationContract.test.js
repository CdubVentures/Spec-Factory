import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';
import {
  RUNTIME_SETTINGS_ROUTE_GET,
  RUNTIME_SETTINGS_ROUTE_PUT,
} from '../src/features/settings-authority/settingsContract.js';

function collectHydrationBindingKeys(bindings) {
  const keys = new Set();
  for (const binding of bindings.stringBindings) keys.add(binding.key);
  for (const binding of bindings.numberBindings) keys.add(binding.key);
  for (const binding of bindings.booleanBindings) keys.add(binding.key);
  return keys;
}

function collectGetRouteFrontendKeys() {
  const keys = new Set([
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_GET.stringMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_GET.intMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_GET.floatMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_GET.boolMap),
  ]);
  keys.add(RUNTIME_SETTINGS_ROUTE_GET.dynamicFetchPolicyMapJsonKey);
  return keys;
}

function collectPutRouteFrontendKeys() {
  const keys = new Set([
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringTrimMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap),
  ]);
  keys.add(RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey);
  return keys;
}

// WHY: Backend still returns these for backward compat but they are aliased to plan/reasoning models.
// Normalizer handles them passively — no active hydration bindings needed.
const RETIRED_KEYS = new Set([
  'llmModelTriage', 'llmModelExtract', 'llmModelValidate', 'llmModelWrite',
  'llmMaxOutputTokensTriage', 'llmMaxOutputTokensExtract',
  'llmMaxOutputTokensValidate', 'llmMaxOutputTokensWrite',
  'llmMaxOutputTokensExtractFallback', 'llmMaxOutputTokensValidateFallback',
  'llmMaxOutputTokensWriteFallback',
  'llmExtractFallbackModel', 'llmValidateFallbackModel', 'llmWriteFallbackModel',
  'llmExtractProvider', 'llmExtractBaseUrl', 'llmExtractApiKey',
  'llmValidateProvider', 'llmValidateBaseUrl', 'llmValidateApiKey',
  'llmWriteProvider', 'llmWriteBaseUrl', 'llmWriteApiKey',
  'llmTriageUseReasoning',
]);

function diffMissing(routeKeys, hydrationKeys) {
  return [...routeKeys].filter((key) => !hydrationKeys.has(key) && !RETIRED_KEYS.has(key)).sort();
}

test('runtime hydration bindings cover runtime settings route frontend keys', async () => {
  const { createRuntimeHydrationBindings } = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomain.ts',
    { prefix: 'runtime-hydration-contract-coverage-' },
  );

  const setters = new Proxy({}, {
    get() {
      return () => {};
    },
  });
  const bindings = createRuntimeHydrationBindings(setters);
  const hydrationKeys = collectHydrationBindingKeys(bindings);

  const missingGetKeys = diffMissing(collectGetRouteFrontendKeys(), hydrationKeys);
  const missingPutKeys = diffMissing(collectPutRouteFrontendKeys(), hydrationKeys);

  assert.deepEqual(
    missingGetKeys,
    [],
    `runtime hydration bindings missing GET frontend keys: ${missingGetKeys.join(', ')}`,
  );
  assert.deepEqual(
    missingPutKeys,
    [],
    `runtime hydration bindings missing PUT frontend keys: ${missingPutKeys.join(', ')}`,
  );
});

test('runtime hydration bindings apply canonical runtime setting aliases for contract-critical keys', async () => {
  const { createRuntimeHydrationBindings, hydrateRuntimeSettingsFromBindings } = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomain.ts',
    { prefix: 'runtime-hydration-contract-apply-' },
  );

  const state = {};
  const setters = new Proxy({}, {
    get(_target, prop) {
      return (value) => {
        state[prop] = value;
      };
    },
  });
  const bindings = createRuntimeHydrationBindings(setters);

  const snapshot = {
    fetchBudgetMs: 20000,
    categoryAuthorityRoot: 'category_authority',
  };

  assert.equal(hydrateRuntimeSettingsFromBindings(snapshot, false, bindings), true);

  assert.equal(state.setFetchBudgetMs, '20000');
  assert.equal(state.setCategoryAuthorityRoot, 'category_authority');
});
