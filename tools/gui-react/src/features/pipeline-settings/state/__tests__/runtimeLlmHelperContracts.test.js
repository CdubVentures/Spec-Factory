import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function createRuntimeManifestTokenDefaults(overrides = {}) {
  return {
    llmMaxOutputTokensPlan: 384,
    llmMaxOutputTokensTriage: 512,
    llmMaxOutputTokensReasoning: 512,
    ...overrides,
  };
}

test('runtime llm model options keep current selections stable and dedupe normalized duplicates', async () => {
  const { deriveRuntimeLlmModelOptions } = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowModelTokenOptions.ts',
    { prefix: 'runtime-llm-model-options-' },
  );

  const options = deriveRuntimeLlmModelOptions({
    indexingLlmConfig: {
      model_options: ['gpt-4o-mini', 'gpt-4.1', ' GPT-4O-MINI '],
    },
    llmModelPlan: 'custom-plan',
    llmModelTriage: 'gpt-4.1',
    llmModelReasoning: '',
    llmModelExtract: '',
    llmModelValidate: '',
    llmModelWrite: '',
  });

  assert.deepEqual(
    options,
    ['gpt-4o-mini', 'gpt-4.1', 'custom-plan'],
  );
});

test('runtime llm token preset options sanitize, sort, dedupe, and include live fallback values', async () => {
  const [{ deriveRuntimeLlmTokenPresetOptions }, { parseRuntimeLlmTokenCap }] = await Promise.all([
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowModelTokenOptions.ts',
      { prefix: 'runtime-llm-token-options-' },
    ),
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomain.ts',
      { prefix: 'runtime-llm-token-domain-' },
    ),
  ]);

  const minToken = parseRuntimeLlmTokenCap(1);
  const maxToken = parseRuntimeLlmTokenCap(999999);
  assert.notEqual(minToken, null);
  assert.notEqual(maxToken, null);

  const presets = deriveRuntimeLlmTokenPresetOptions({
    indexingLlmConfig: {
      token_presets: [999999, 1024, 128, 1024, 'bad'],
    },
    llmMaxOutputTokensPlan: 384,
    llmMaxOutputTokensTriage: 1024,
    llmMaxOutputTokensReasoning: 512,
    runtimeManifestDefaults: createRuntimeManifestTokenDefaults(),
  });

  assert.deepEqual(
    presets,
    [minToken, 384, 512, 1024, maxToken],
  );
});

test('runtime llm model token defaults resolve from profiles, config defaults, and manifest fallbacks', async () => {
  const [
    {
      buildRuntimeLlmTokenProfileLookup,
      createRuntimeModelTokenDefaultsResolver,
    },
    { parseRuntimeLlmTokenCap },
  ] = await Promise.all([
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/RuntimeFlowModelTokenDefaults.ts',
      { prefix: 'runtime-llm-token-defaults-' },
    ),
    loadBundledModule(
      'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomain.ts',
      { prefix: 'runtime-llm-token-defaults-domain-' },
    ),
  ]);

  const indexedConfig = {
    token_defaults: { plan: 1024 },
    model_token_profiles: [
      { model: 'alpha', default_output_tokens: 640, max_output_tokens: 1536 },
      { model: 'beta', default_output_tokens: 'bad', max_output_tokens: 999999 },
    ],
  };
  const runtimeManifestDefaults = createRuntimeManifestTokenDefaults({ llmMaxOutputTokensPlan: 768 });
  const llmTokenProfileLookup = buildRuntimeLlmTokenProfileLookup({
    indexingLlmConfig: indexedConfig,
  });
  const resolver = createRuntimeModelTokenDefaultsResolver({
    indexingLlmConfig: indexedConfig,
    llmTokenProfileLookup,
    llmTokenContractPresetMax: 4096,
    runtimeManifestDefaults,
  });

  assert.deepEqual(resolver('alpha'), {
    default_output_tokens: 640,
    max_output_tokens: 1536,
  });
  assert.deepEqual(resolver('missing'), {
    default_output_tokens: 1024,
    max_output_tokens: 4096,
  });
  assert.deepEqual(resolver('beta'), {
    default_output_tokens: 1024,
    max_output_tokens: parseRuntimeLlmTokenCap(999999),
  });

  const manifestFallbackResolver = createRuntimeModelTokenDefaultsResolver({
    indexingLlmConfig: { token_defaults: { plan: 'bad-value' } },
    llmTokenProfileLookup: new Map(),
    llmTokenContractPresetMax: 0,
    runtimeManifestDefaults,
  });

  assert.deepEqual(manifestFallbackResolver('unknown-model'), {
    default_output_tokens: 768,
    max_output_tokens: 768,
  });
});

test('bridgeRegistryToFlatKeys returns updated costs when model cost changes in registry', async () => {
  const { bridgeRegistryToFlatKeys } = await loadBundledModule(
    'tools/gui-react/src/features/llm-config/state/llmProviderRegistryBridge.ts',
    { prefix: 'registry-bridge-costs-' },
  );

  const registry = [{
    id: 'p1',
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    enabled: true,
    models: [{
      id: 'm1',
      modelId: 'gpt-4o',
      role: 'primary',
      costInputPer1M: 7.5,
      costOutputPer1M: 30.0,
      costCachedPer1M: 3.75,
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    }],
  }];

  const result = bridgeRegistryToFlatKeys(registry, 'gpt-4o');
  assert.notEqual(result, null);
  assert.equal(result.llmCostInputPer1M, 7.5);
  assert.equal(result.llmCostOutputPer1M, 30.0);
  assert.equal(result.llmCostCachedInputPer1M, 3.75);
});

test('bridgeRegistryToFlatKeys returns null when selected model not in registry', async () => {
  const { bridgeRegistryToFlatKeys } = await loadBundledModule(
    'tools/gui-react/src/features/llm-config/state/llmProviderRegistryBridge.ts',
    { prefix: 'registry-bridge-null-' },
  );

  const registry = [{
    id: 'p1',
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    enabled: true,
    models: [{
      id: 'm1',
      modelId: 'gpt-4o',
      role: 'primary',
      costInputPer1M: 2.5,
      costOutputPer1M: 10.0,
      costCachedPer1M: 1.25,
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    }],
  }];

  assert.equal(bridgeRegistryToFlatKeys(registry, 'unknown-model'), null);
});

test('syncCostsFromRegistry returns cost-only fields when model exists', async () => {
  const { syncCostsFromRegistry } = await loadBundledModule(
    'tools/gui-react/src/features/llm-config/state/llmProviderRegistryBridge.ts',
    { prefix: 'registry-sync-costs-' },
  );

  const registry = [{
    id: 'p1',
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    enabled: true,
    models: [{
      id: 'm1',
      modelId: 'gpt-4o',
      role: 'primary',
      costInputPer1M: 5.0,
      costOutputPer1M: 20.0,
      costCachedPer1M: 2.5,
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    }],
  }];

  const result = syncCostsFromRegistry(registry, 'gpt-4o');
  assert.deepEqual(result, {
    llmCostInputPer1M: 5.0,
    llmCostOutputPer1M: 20.0,
    llmCostCachedInputPer1M: 2.5,
  });
});

test('syncCostsFromRegistry returns null when model not found', async () => {
  const { syncCostsFromRegistry } = await loadBundledModule(
    'tools/gui-react/src/features/llm-config/state/llmProviderRegistryBridge.ts',
    { prefix: 'registry-sync-costs-null-' },
  );

  const registry = [{
    id: 'p1',
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    enabled: true,
    models: [{
      id: 'm1',
      modelId: 'gpt-4o',
      role: 'primary',
      costInputPer1M: 2.5,
      costOutputPer1M: 10.0,
      costCachedPer1M: 1.25,
      maxContextTokens: 128000,
      maxOutputTokens: 16384,
    }],
  }];

  assert.equal(syncCostsFromRegistry(registry, 'missing-model'), null);
});

test('runtime hydration bindings accept active alias keys, ignore retired reasoning fallback tokens, and skip local resets when the snapshot is dirty', async () => {
  const { createRuntimeHydrationBindings, hydrateRuntimeSettingsFromBindings } = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/runtimeSettingsDomain.ts',
    { prefix: 'runtime-llm-hydration-bindings-' },
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
    llmModelPlan: 'alias-plan-model',
    llmModelReasoning: 'alias-reasoning-model',
    llmPlanFallbackModel: 'alias-plan-fallback',
    llmMaxOutputTokensPlan: 1536,
    llmMaxOutputTokensPlanFallback: 2048,
    llmMaxOutputTokensReasoningFallback: 2304,
  };

  assert.equal(
    hydrateRuntimeSettingsFromBindings(snapshot, true, bindings),
    false,
    'dirty runtime state should not be overwritten by authority hydration',
  );
  assert.deepEqual(state, {});

  assert.equal(
    hydrateRuntimeSettingsFromBindings(snapshot, false, bindings),
    true,
    'clean runtime state should hydrate from alias-aware authority bindings',
  );
  assert.equal(state.setLlmModelPlan, 'alias-plan-model');
  assert.equal(state.setLlmModelReasoning, 'alias-reasoning-model');
  assert.equal(state.setLlmPlanFallbackModel, 'alias-plan-fallback');
  assert.equal(state.setLlmMaxOutputTokensPlan, '1536');
  assert.equal(
    state.setLlmMaxOutputTokensPlanFallback,
    undefined,
    'retired plan fallback token key should be ignored during hydration',
  );
  assert.equal(
    state.setLlmMaxOutputTokensReasoningFallback,
    undefined,
    'retired reasoning fallback token key should be ignored during hydration',
  );
});
