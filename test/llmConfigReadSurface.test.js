import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveLlmKnobDefaults,
  collectLlmModels,
} from '../src/api/helpers/llmHelpers.js';
import {
  RUNTIME_SETTINGS_ROUTE_GET,
  DUAL_KEY_PAIRS,
} from '../src/core/config/settingsKeyMap.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';
import { SETTINGS_CLAMPING_INT_RANGE_MAP } from '../src/shared/settingsClampingRanges.js';
import { EXPLICIT_ENV_KEY_OVERRIDES } from '../src/core/config/settingsClassification.js';

// ────────────────────────────────────────────────────────
// Phase 1: Dead field removal from GET/read surfaces
// ────────────────────────────────────────────────────────

test('resolveLlmKnobDefaults does not contain fallback_extract / fallback_validate / fallback_write', () => {
  const knobs = resolveLlmKnobDefaults({ llmModelPlan: 'test-model' });
  assert.equal(knobs.fallback_extract, undefined, 'fallback_extract should not exist');
  assert.equal(knobs.fallback_validate, undefined, 'fallback_validate should not exist');
  assert.equal(knobs.fallback_write, undefined, 'fallback_write should not exist');
  // plan + reasoning fallbacks should still exist
  assert.ok(knobs.fallback_plan !== undefined, 'fallback_plan must remain');
});

test('collectLlmModels does not include per-role fallback model candidates', () => {
  const cfg = {
    llmModelPlan: 'gemini-2.5-flash',
    llmModelReasoning: 'deepseek-reasoner',
    llmPlanFallbackModel: 'deepseek-chat',
    llmExtractFallbackModel: 'should-not-appear',
    llmValidateFallbackModel: 'should-not-appear-2',
    llmWriteFallbackModel: 'should-not-appear-3',
  };
  const models = collectLlmModels(cfg);
  assert.ok(!models.includes('should-not-appear'), 'llmExtractFallbackModel should not be collected');
  assert.ok(!models.includes('should-not-appear-2'), 'llmValidateFallbackModel should not be collected');
  assert.ok(!models.includes('should-not-appear-3'), 'llmWriteFallbackModel should not be collected');
  // Plan fallback should still be collected
  assert.ok(models.includes('deepseek-chat'), 'llmPlanFallbackModel should still be collected');
});

// ────────────────────────────────────────────────────────
// Phase 2: Dead field removal from GET key maps
// ────────────────────────────────────────────────────────

const DEAD_MODEL_ALIASES = ['llmModelTriage', 'llmModelExtract', 'llmModelValidate', 'llmModelWrite'];
const DEAD_TOKEN_CAP_ALIASES = [
  'llmMaxOutputTokensTriage', 'llmMaxOutputTokensExtract',
  'llmMaxOutputTokensValidate', 'llmMaxOutputTokensWrite',
];
const DEAD_FALLBACK_TOKEN_ALIASES = [
  'llmMaxOutputTokensExtractFallback', 'llmMaxOutputTokensValidateFallback',
  'llmMaxOutputTokensWriteFallback',
];
const DEAD_PER_ROLE_PROVIDER_KEYS = [
  'llmExtractProvider', 'llmExtractBaseUrl', 'llmExtractApiKey',
  'llmValidateProvider', 'llmValidateBaseUrl', 'llmValidateApiKey',
  'llmWriteProvider', 'llmWriteBaseUrl', 'llmWriteApiKey',
];
const DEAD_FALLBACK_MODELS = ['llmExtractFallbackModel', 'llmValidateFallbackModel', 'llmWriteFallbackModel'];

test('RUNTIME_SETTINGS_ROUTE_GET.stringMap does not contain dead model aliases', () => {
  for (const key of DEAD_MODEL_ALIASES) {
    assert.equal(RUNTIME_SETTINGS_ROUTE_GET.stringMap[key], undefined, `stringMap should not contain ${key}`);
  }
});

test('RUNTIME_SETTINGS_ROUTE_GET.stringMap does not contain dead per-role provider/baseUrl/apiKey', () => {
  for (const key of DEAD_PER_ROLE_PROVIDER_KEYS) {
    assert.equal(RUNTIME_SETTINGS_ROUTE_GET.stringMap[key], undefined, `stringMap should not contain ${key}`);
  }
});

test('RUNTIME_SETTINGS_ROUTE_GET.stringMap does not contain dead fallback model aliases', () => {
  for (const key of DEAD_FALLBACK_MODELS) {
    assert.equal(RUNTIME_SETTINGS_ROUTE_GET.stringMap[key], undefined, `stringMap should not contain ${key}`);
  }
});

test('RUNTIME_SETTINGS_ROUTE_GET.intMap does not contain dead token cap aliases', () => {
  for (const key of DEAD_TOKEN_CAP_ALIASES) {
    assert.equal(RUNTIME_SETTINGS_ROUTE_GET.intMap[key], undefined, `intMap should not contain ${key}`);
  }
});

test('RUNTIME_SETTINGS_ROUTE_GET.intMap does not contain dead fallback token aliases', () => {
  for (const key of DEAD_FALLBACK_TOKEN_ALIASES) {
    assert.equal(RUNTIME_SETTINGS_ROUTE_GET.intMap[key], undefined, `intMap should not contain ${key}`);
  }
});

test('RUNTIME_SETTINGS_ROUTE_GET.boolMap does not contain llmTriageUseReasoning', () => {
  assert.equal(RUNTIME_SETTINGS_ROUTE_GET.boolMap.llmTriageUseReasoning, undefined,
    'boolMap should not contain llmTriageUseReasoning');
});

test('SETTINGS_DEFAULTS.runtime does not contain dead model/provider/fallback aliases', () => {
  const runtime = SETTINGS_DEFAULTS.runtime;
  const allDeadKeys = [
    ...DEAD_MODEL_ALIASES,
    ...DEAD_PER_ROLE_PROVIDER_KEYS,
    ...DEAD_FALLBACK_MODELS,
    'llmTriageUseReasoning',
  ];
  for (const key of allDeadKeys) {
    assert.equal(Object.hasOwn(runtime, key), false, `runtime defaults should not contain ${key}`);
  }
});

test('SETTINGS_DEFAULTS.runtime does not contain dead token cap aliases', () => {
  const runtime = SETTINGS_DEFAULTS.runtime;
  const allDeadTokenKeys = [
    ...DEAD_TOKEN_CAP_ALIASES,
    ...DEAD_FALLBACK_TOKEN_ALIASES,
  ];
  for (const key of allDeadTokenKeys) {
    assert.equal(Object.hasOwn(runtime, key), false, `runtime defaults should not contain ${key}`);
  }
});

test('SETTINGS_CLAMPING_INT_RANGE_MAP does not contain dead token cap aliases', () => {
  const allDeadTokenKeys = [
    ...DEAD_TOKEN_CAP_ALIASES,
    ...DEAD_FALLBACK_TOKEN_ALIASES,
  ];
  for (const key of allDeadTokenKeys) {
    assert.equal(SETTINGS_CLAMPING_INT_RANGE_MAP[key], undefined,
      `clamping ranges should not contain ${key}`);
  }
});

test('DUAL_KEY_PAIRS does not contain dead fallback model entries', () => {
  const deadKeys = new Set(DEAD_FALLBACK_MODELS);
  for (const [keyA, keyB] of DUAL_KEY_PAIRS) {
    assert.equal(deadKeys.has(keyA), false, `DUAL_KEY_PAIRS should not reference ${keyA}`);
    assert.equal(deadKeys.has(keyB), false, `DUAL_KEY_PAIRS should not reference ${keyB}`);
  }
});

test('EXPLICIT_ENV_KEY_OVERRIDES does not contain dead model aliases', () => {
  const deadKeys = ['llmModelTriage', 'llmModelExtract', 'llmModelValidate', 'llmModelWrite'];
  for (const key of deadKeys) {
    assert.equal(EXPLICIT_ENV_KEY_OVERRIDES.has(key), false,
      `EXPLICIT_ENV_KEY_OVERRIDES should not contain ${key}`);
  }
});
