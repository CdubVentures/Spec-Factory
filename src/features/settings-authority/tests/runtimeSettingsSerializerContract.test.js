import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../shared/tests/helpers/loadBundledModule.js';

import { RUNTIME_SETTINGS_ROUTE_PUT } from '../settingsContract.js';

async function createRuntimeSettingsDomainHarness() {
  const runtimeSettingsDomainModule = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomain.ts',
    { prefix: 'runtime-settings-domain-' },
  );

  return {
    collectRuntimeSettingsPayload: runtimeSettingsDomainModule.collectRuntimeSettingsPayload,
  };
}

const runtimeSettingsDomainHarnessPromise = createRuntimeSettingsDomainHarness();

const SERIALIZER_EXCLUDED_PUT_KEYS = new Set([
  'llmMaxOutputTokensTriage',
]);

function getRuntimePutFrontendKeys() {
  return new Set([
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap || {}),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap || {}),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap || {}),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap || {}),
    ...Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap || {}),
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

test('runtime settings serializer emits every runtime PUT frontend key', async () => {
  const harness = await runtimeSettingsDomainHarnessPromise;
  const payload = harness.collectRuntimeSettingsPayload(createSerializerInput());
  const missing = Array.from(getRuntimePutFrontendKeys()).filter(
    (key) => !Object.prototype.hasOwnProperty.call(payload, key),
  );

  assert.deepEqual(
    missing,
    [],
    `runtime settings serializer must emit every runtime PUT frontend key (missing: ${missing.join(', ')})`,
  );
  assert.equal(Object.hasOwn(payload, 'profile'), false);
  assert.equal(payload.searchEngines, 'bing,brave,duckduckgo');
  assert.equal(payload.searxngBaseUrl, 'https://example.test/search');
  assert.equal(payload.llmPlanFallbackModel, 'gpt-plan-fallback');
});

test('runtime settings serializer applies shared token defaults when input is malformed', async () => {
  const harness = await runtimeSettingsDomainHarnessPromise;
  const payload = harness.collectRuntimeSettingsPayload(createSerializerInput({
    llmMaxOutputTokens: 'bad-token-count',
    llmMaxOutputTokensPlan: 'bad-plan-tokens',
  }));

  assert.equal(payload.llmMaxOutputTokens, 11);
  assert.equal(payload.llmMaxOutputTokensPlan, 4096);
  // WHY: llmMaxOutputTokensPlanFallback has been retired — fallback inherits
  // the primary's phase cap. Payload must not surface it.
  assert.equal(Object.hasOwn(payload, 'llmMaxOutputTokensPlanFallback'), false);
});

test('runtime settings serializer preserves parsed reasoning, timeout, and cost knobs', async () => {
  const harness = await runtimeSettingsDomainHarnessPromise;
  const payload = harness.collectRuntimeSettingsPayload(createSerializerInput({
    llmReasoningMode: true,
    llmReasoningBudget: '3072',
    llmMaxOutputTokens: '6144',
    llmMaxTokens: '16000',
    llmTimeoutMs: '45000',
    llmCostInputPer1M: '0.75',
    llmCostOutputPer1M: '1.5',
    llmCostCachedInputPer1M: '0.2',
  }));

  assert.equal(payload.llmReasoningMode, true);
  assert.equal(payload.llmReasoningBudget, 3072);
  assert.equal(payload.llmMaxOutputTokens, 6144);
  assert.equal(payload.llmMaxTokens, 16000);
  assert.equal(payload.llmTimeoutMs, 45000);
  assert.equal(payload.llmCostInputPer1M, 0.75);
  assert.equal(payload.llmCostOutputPer1M, 1.5);
  assert.equal(payload.llmCostCachedInputPer1M, 0.2);
});
