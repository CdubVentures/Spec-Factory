import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

function createRuntimeManifestTokenDefaults(overrides = {}) {
  return {
    llmTokensPlan: 384,
    llmTokensTriage: 512,
    llmTokensFast: 512,
    llmTokensReasoning: 512,
    llmTokensExtract: 512,
    llmTokensValidate: 512,
    llmTokensWrite: 512,
    llmTokensPlanFallback: 4096,
    llmTokensExtractFallback: 4096,
    llmTokensValidateFallback: 4096,
    llmTokensWriteFallback: 4096,
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
    phase2LlmModel: 'custom-plan',
    phase3LlmModel: 'gpt-4.1',
    llmModelFast: '',
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
    llmTokensPlan: 384,
    llmTokensTriage: 1024,
    llmTokensFast: 512,
    llmTokensReasoning: 512,
    llmTokensExtract: 512,
    llmTokensValidate: 512,
    llmTokensWrite: 512,
    llmTokensPlanFallback: 4096,
    llmTokensExtractFallback: 4096,
    llmTokensValidateFallback: 4096,
    llmTokensWriteFallback: 4096,
    runtimeManifestDefaults: createRuntimeManifestTokenDefaults(),
  });

  assert.deepEqual(
    presets,
    [minToken, 384, 512, 1024, 4096, maxToken],
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
  const runtimeManifestDefaults = createRuntimeManifestTokenDefaults({ llmTokensPlan: 768 });
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

test('runtime hydration bindings accept alias keys and skip local resets when the snapshot is dirty', async () => {
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
    llmModelTriage: 'alias-triage-model',
    llmPlanFallbackModel: 'alias-plan-fallback',
    llmMaxOutputTokensPlan: 1536,
    llmMaxOutputTokensPlanFallback: 2048,
    llmTokensWriteFallback: 2304,
    llmPlanDiscoveryQueries: true,
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
  assert.equal(state.setPhase2LlmModel, 'alias-plan-model');
  assert.equal(state.setPhase3LlmModel, 'alias-triage-model');
  assert.equal(state.setLlmPlanFallbackModel, 'alias-plan-fallback');
  assert.equal(state.setLlmTokensPlan, 1536);
  assert.equal(state.setLlmTokensPlanFallback, 2048);
  assert.equal(state.setLlmTokensWriteFallback, 2304);
  assert.equal(state.setPhase2LlmEnabled, true);
});
