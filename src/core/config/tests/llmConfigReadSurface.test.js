import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveLlmKnobDefaults,
  collectLlmModels,
} from '../../llm/llmRouteHelpers.js';
import {
  RUNTIME_SETTINGS_ROUTE_GET,
} from '../settingsKeyMap.js';
import { SETTINGS_DEFAULTS } from '../../../shared/settingsDefaults.js';
import { SETTINGS_CLAMPING_INT_RANGE_MAP } from '../../../shared/settingsClampingRanges.js';
import { EXPLICIT_ENV_KEY_OVERRIDES } from '../settingsClassification.js';

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

test('RUNTIME_SETTINGS_ROUTE_GET.intMap keeps the surviving triage token cap', () => {
  assert.equal(
    RUNTIME_SETTINGS_ROUTE_GET.intMap.llmMaxOutputTokensTriage,
    'llmMaxOutputTokensTriage',
  );
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

test('SETTINGS surfaces keep the surviving triage token cap', () => {
  assert.equal(Object.hasOwn(SETTINGS_DEFAULTS.runtime, 'llmMaxOutputTokensTriage'), true);
  assert.notEqual(SETTINGS_CLAMPING_INT_RANGE_MAP.llmMaxOutputTokensTriage, undefined);
});

test('EXPLICIT_ENV_KEY_OVERRIDES does not contain dead model aliases', () => {
  const deadKeys = ['llmModelTriage', 'llmModelExtract', 'llmModelValidate', 'llmModelWrite'];
  for (const key of deadKeys) {
    assert.equal(EXPLICIT_ENV_KEY_OVERRIDES.has(key), false,
      `EXPLICIT_ENV_KEY_OVERRIDES should not contain ${key}`);
  }
});
