import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from './helpers/loadBundledModule.js';

import { RUNTIME_SETTINGS_ROUTE_PUT } from '../src/features/settings-authority/settingsContract.js';

let runtimeSettingsDomainModulePromise;

async function loadRuntimeSettingsDomain() {
  if (!runtimeSettingsDomainModulePromise) {
    runtimeSettingsDomainModulePromise = loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomain.ts',
      { prefix: 'runtime-settings-domain-' },
    );
  }
  return runtimeSettingsDomainModulePromise;
}

// WHY: Per-role token cap keys remain in the PUT intRangeMap (clamping ranges)
// for backward compatibility, but the frontend serializer no longer emits them
// after the LLM model stack simplification. Exclude from the coverage check.
const SERIALIZER_EXCLUDED_PUT_KEYS = new Set([
  'llmMaxOutputTokensTriage',
  'llmMaxOutputTokensExtract',
  'llmMaxOutputTokensValidate',
  'llmMaxOutputTokensWrite',
  'llmMaxOutputTokensExtractFallback',
  'llmMaxOutputTokensValidateFallback',
  'llmMaxOutputTokensWriteFallback',
]);

function getRuntimePutFrontendKeys() {
  return new Set([
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap || {}),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap || {}),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap || {}),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap || {}),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap || {}),
    String(RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey || 'dynamicFetchPolicyMapJson'),
  ].filter((key) => !SERIALIZER_EXCLUDED_PUT_KEYS.has(key)));
}

function createNumericBaseline(fallback = 11) {
  return new Proxy({}, {
    get() {
      return fallback;
    },
  });
}

function createSerializerInput(overrides = {}) {
  return {
    searchEngines: 'bing,brave,duckduckgo',
    searxngBaseUrl: '  https://example.test/search  ',
    llmPlanApiKey: '  key-live  ',
    llmModelPlan: 'gpt-plan',
    llmModelReasoning: 'gpt-reasoning',
    llmPlanFallbackModel: 'gpt-plan-fallback',
    llmReasoningFallbackModel: 'gpt-reasoning-fallback',
    runtimeSettingsFallbackBaseline: createNumericBaseline(),
    resolveModelTokenDefaults: () => ({
      default_output_tokens: 4096,
      max_output_tokens: 8192,
    }),
    ...overrides,
  };
}

test('runtime settings serializer emits every runtime PUT frontend key without source-text shims', async () => {
  const { collectRuntimeSettingsPayload } = await loadRuntimeSettingsDomain();
  const payload = collectRuntimeSettingsPayload(createSerializerInput());
  const missing = Array.from(getRuntimePutFrontendKeys()).filter(
    (key) => !Object.prototype.hasOwnProperty.call(payload, key),
  );

  assert.deepEqual(
    missing,
    [],
    `runtime settings serializer must emit every runtime PUT frontend key (missing: ${missing.join(', ')})`,
  );
  assert.equal(Object.hasOwn(payload, 'profile'), false, 'profile is not a runtime PUT key — must not be in payload');
  assert.equal(Object.hasOwn(payload, 'runProfile'), false, 'runProfile is not a runtime PUT key — must not be in payload');
  assert.equal(Object.hasOwn(payload, 'discoveryEnabled'), false, 'discoveryEnabled is a hardcoded invariant — must not be in payload');
  assert.equal(payload.searchEngines, 'bing,brave,duckduckgo');
  assert.equal(payload.searxngBaseUrl, 'https://example.test/search');
  assert.equal(payload.llmPlanApiKey, 'key-live');
  assert.equal(payload.llmPlanFallbackModel, 'gpt-plan-fallback');
});

test('runtime settings serializer applies fallback baselines and shared model-token defaults at runtime', async () => {
  const { collectRuntimeSettingsPayload } = await loadRuntimeSettingsDomain();
  const payload = collectRuntimeSettingsPayload(createSerializerInput({
    fetchConcurrency: 'not-a-number',
    llmMaxOutputTokens: 'bad-token-count',
    llmMaxOutputTokensPlan: 'bad-plan-tokens',
    llmMaxOutputTokensPlanFallback: 'bad-fallback-plan-tokens',
    dynamicFetchPolicyMapJson: '  {"mouse":"full"}  ',
  }));

  assert.equal(payload.fetchConcurrency, 11);
  // WHY: needsetEvidenceDecayFloor removed in Phase 12 NeedSet Legacy Removal
  assert.equal(payload.llmMaxOutputTokens, 11);
  assert.equal(payload.llmMaxOutputTokensPlan, 4096);
  assert.equal(payload.llmMaxOutputTokensPlanFallback, 4096);
  assert.equal(payload.dynamicFetchPolicyMapJson, '{"mouse":"full"}');
});

test('runtime settings serializer preserves budget and reasoning knobs as parsed runtime payload', async () => {
  const { collectRuntimeSettingsPayload } = await loadRuntimeSettingsDomain();
  // WHY: needsetEvidenceDecayDays removed in Phase 12 NeedSet Legacy Removal
  const payload = collectRuntimeSettingsPayload(createSerializerInput({
    llmExtractMaxSnippetsPerBatch: '12',
    llmExtractMaxSnippetChars: '999',
    llmExtractSkipLowSignal: true,
    llmReasoningMode: true,
    llmReasoningBudget: '3072',
    llmMonthlyBudgetUsd: '7.5',
    llmPerProductBudgetUsd: '1.25',
    llmMaxCallsPerRound: '12',
    llmMaxOutputTokens: '6144',
    llmVerifySampleRate: '5',
    llmMaxBatchesPerProduct: '4',
    llmMaxEvidenceChars: '5000',
    llmMaxTokens: '16000',
    llmTimeoutMs: '45000',
    llmCostInputPer1M: '0.75',
    llmCostOutputPer1M: '1.5',
    llmCostCachedInputPer1M: '0.2',
    llmVerifyMode: true,
  }));

  assert.equal(payload.llmExtractMaxSnippetsPerBatch, 12);
  assert.equal(payload.llmExtractMaxSnippetChars, 999);
  assert.equal(payload.llmExtractSkipLowSignal, true);
  assert.equal(payload.llmReasoningMode, true);
  assert.equal(payload.llmReasoningBudget, 3072);
  assert.equal(payload.llmMonthlyBudgetUsd, 7.5);
  assert.equal(payload.llmPerProductBudgetUsd, 1.25);
  assert.equal(payload.llmMaxCallsPerRound, 12);
  assert.equal(payload.llmMaxOutputTokens, 6144);
  assert.equal(payload.llmVerifySampleRate, 5);
  assert.equal(payload.llmMaxBatchesPerProduct, 4);
  assert.equal(payload.llmMaxEvidenceChars, 5000);
  assert.equal(payload.llmMaxTokens, 16000);
  assert.equal(payload.llmTimeoutMs, 45000);
  assert.equal(payload.llmCostInputPer1M, 0.75);
  assert.equal(payload.llmCostOutputPer1M, 1.5);
  assert.equal(payload.llmCostCachedInputPer1M, 0.2);
  assert.equal(payload.llmVerifyMode, true);
});
