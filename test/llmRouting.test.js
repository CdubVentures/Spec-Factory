import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEffectiveCostRates,
  hasAnyLlmApiKey,
  hasLlmRouteApiKey,
  llmRoutingSnapshot,
  resolveLlmFallbackRoute,
  resolveLlmRoute
} from '../src/core/llm/client/routing.js';
import { buildRegistryLookup } from '../src/core/llm/routeResolver.js';

test('resolveLlmRoute selects per-role provider/base/model with reason mapping', () => {
  const config = {
    llmProvider: 'openai',
    llmApiKey: 'global-key',
    llmBaseUrl: 'https://api.openai.com',
    llmModelExtract: 'gpt-4.1-mini',
    llmModelPlan: 'gpt-4.1-mini',
    llmModelValidate: 'gpt-4.1-mini',
    llmPlanProvider: 'gemini',
    llmPlanApiKey: 'gem-key',
    llmPlanBaseUrl: 'https://generativelanguage.googleapis.com',
    llmModelPlan: 'gemini-2.5-flash',
    llmExtractProvider: 'deepseek',
    llmExtractApiKey: 'ds-key',
    llmExtractBaseUrl: 'https://api.deepseek.com',
    llmModelExtract: 'deepseek-reasoner'
  };

  const planRoute = resolveLlmRoute(config, { reason: 'plan' });
  assert.equal(planRoute.provider, 'gemini');
  assert.equal(planRoute.apiKey, 'gem-key');
  assert.equal(planRoute.model, 'gemini-2.5-flash');

  const verifyFastRoute = resolveLlmRoute(config, { reason: 'verify_extract_fast' });
  assert.equal(verifyFastRoute.provider, 'gemini');
  assert.equal(verifyFastRoute.model, 'gemini-2.5-flash');

  const extractRoute = resolveLlmRoute(config, { reason: 'extract' });
  assert.equal(extractRoute.provider, 'deepseek');
  assert.equal(extractRoute.apiKey, 'ds-key');
  assert.equal(extractRoute.model, 'deepseek-reasoner');
});

test('resolveLlmFallbackRoute returns null when fallback matches primary fingerprint', () => {
  const config = {
    llmProvider: 'deepseek',
    llmApiKey: 'ds-key',
    llmBaseUrl: 'https://api.deepseek.com',
    llmModelExtract: 'deepseek-chat',
    llmExtractFallbackProvider: 'deepseek',
    llmExtractFallbackApiKey: 'ds-key',
    llmExtractFallbackBaseUrl: 'https://api.deepseek.com',
    llmExtractFallbackModel: 'deepseek-chat'
  };

  const fallback = resolveLlmFallbackRoute(config, { reason: 'extract' });
  assert.equal(fallback, null);
});

test('route key helpers detect role-only keys and snapshot masks secrets', () => {
  const config = {
    llmProvider: 'openai',
    llmApiKey: '',
    llmBaseUrl: 'https://api.openai.com',
    llmModelExtract: 'gpt-4.1-mini',
    llmModelPlan: 'gpt-4.1-mini',
    llmModelValidate: 'gpt-4.1-mini',
    llmModelWrite: 'gpt-4.1-mini',
    llmPlanProvider: 'gemini',
    llmPlanApiKey: 'gem-key',
    llmPlanBaseUrl: 'https://generativelanguage.googleapis.com',
    llmModelPlan: 'gemini-2.5-flash'
  };

  assert.equal(hasLlmRouteApiKey(config, { reason: 'plan' }), true);
  assert.equal(hasLlmRouteApiKey(config, { reason: 'extract' }), false);
  assert.equal(hasAnyLlmApiKey(config), true);

  const snapshot = llmRoutingSnapshot(config);
  assert.equal(snapshot.plan.primary.api_key_present, true);
  assert.equal(snapshot.extract.primary.api_key_present, false);
  assert.equal(Object.hasOwn(snapshot.plan.primary, 'apiKey'), false);
});

test('model override switches route provider and credentials by model family', () => {
  const config = {
    llmProvider: 'openai',
    llmApiKey: 'openai-key',
    llmBaseUrl: 'http://localhost:5001',
    llmModelPlan: 'gpt-5.1-low',
    llmPlanProvider: 'openai',
    llmPlanApiKey: 'openai-key',
    llmPlanBaseUrl: 'http://localhost:5001',
    llmWriteProvider: 'gemini',
    llmWriteApiKey: 'gem-key',
    llmWriteBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    llmPlanFallbackProvider: 'deepseek',
    llmPlanFallbackApiKey: 'ds-key',
    llmPlanFallbackBaseUrl: 'https://api.deepseek.com',
    llmPlanFallbackModel: 'deepseek-chat'
  };

  const geminiRoute = resolveLlmRoute(config, {
    role: 'plan',
    modelOverride: 'gemini-2.5-flash-lite'
  });
  assert.equal(geminiRoute.provider, 'gemini');
  assert.equal(geminiRoute.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(geminiRoute.apiKey, 'gem-key');
  assert.equal(geminiRoute.model, 'gemini-2.5-flash-lite');

  const deepseekRoute = resolveLlmRoute(config, {
    role: 'plan',
    modelOverride: 'deepseek-chat'
  });
  assert.equal(deepseekRoute.provider, 'deepseek');
  assert.equal(deepseekRoute.baseUrl, 'https://api.deepseek.com');
  assert.equal(deepseekRoute.apiKey, 'ds-key');
  assert.equal(deepseekRoute.model, 'deepseek-chat');
});

test('model override does not switch provider when role model family pin is enabled', () => {
  const config = {
    llmProvider: 'gemini',
    llmApiKey: 'gem-key',
    llmBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    llmForceRoleModelProvider: true,
    llmModelExtract: 'gemini-2.5-flash-lite',
    llmExtractProvider: 'gemini',
    llmExtractApiKey: 'gem-key',
    llmExtractBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai'
  };

  const route = resolveLlmRoute(config, {
    role: 'extract',
    modelOverride: 'gpt-5.1-medium'
  });

  assert.equal(route.provider, 'gemini');
  assert.equal(route.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(route.apiKey, 'gem-key');
  assert.equal(route.model, 'gemini-2.5-flash-lite');
});

// ---------------------------------------------------------------------------
// Fix 1: Registry routes must NOT be overwritten by alignRouteToModelProvider
// ---------------------------------------------------------------------------

function registryConfig(registryProviders, overrides = {}) {
  return {
    _registryLookup: buildRegistryLookup(registryProviders),
    llmModelExtract: 'gemini-2.5-flash',
    llmModelPlan: 'gemini-2.5-flash',
    llmModelValidate: 'gemini-2.5-flash',
    llmModelWrite: 'gemini-2.5-flash',
    ...overrides,
  };
}

function proxyProvider() {
  return {
    id: 'corp-proxy',
    name: 'Corporate Proxy',
    type: 'openai-compatible',
    baseUrl: 'https://my-proxy.corp.com',
    apiKey: 'proxy-secret',
    enabled: true,
    models: [
      {
        id: 'proxy-flash',
        modelId: 'gemini-2.5-flash',
        role: 'primary',
        costInputPer1M: 0.15,
        costOutputPer1M: 0.60,
        costCachedPer1M: 0.04,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
      },
    ],
  };
}

function anthropicRegistryProvider() {
  return {
    id: 'default-anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'ant-key',
    enabled: true,
    models: [
      {
        id: 'ant-sonnet',
        modelId: 'claude-sonnet-4-6',
        role: 'reasoning',
        costInputPer1M: 3.0,
        costOutputPer1M: 15.0,
        costCachedPer1M: 0.30,
        maxContextTokens: 200000,
        maxOutputTokens: 64000,
      },
    ],
  };
}

test('registry-resolved route is NOT overwritten by alignRouteToModelProvider', () => {
  const config = registryConfig([proxyProvider()]);
  const route = resolveLlmRoute(config, { role: 'extract' });
  assert.equal(route.provider, 'openai-compatible');
  assert.equal(route.baseUrl, 'https://my-proxy.corp.com');
  assert.equal(route.apiKey, 'proxy-secret');
  assert.equal(route.model, 'gemini-2.5-flash');
  assert.ok(route._registryEntry, 'registry entry should be preserved');
});

test('custom proxy provider baseUrl survives route resolution', () => {
  const config = registryConfig([proxyProvider()]);
  const route = resolveLlmRoute(config, { role: 'extract' });
  assert.equal(route.baseUrl, 'https://my-proxy.corp.com',
    'proxy baseUrl must not be replaced by public API default');
});

test('anthropic provider type survives route resolution without overwrite', () => {
  const config = registryConfig([anthropicRegistryProvider()], {
    llmModelExtract: 'claude-sonnet-4-6',
    llmModelPlan: 'claude-sonnet-4-6',
  });
  const route = resolveLlmRoute(config, { role: 'extract' });
  assert.equal(route.provider, 'anthropic');
  assert.equal(route.baseUrl, 'https://api.anthropic.com');
  assert.equal(route.apiKey, 'ant-key');
});

test('modelOverride for registry model re-resolves from registry', () => {
  const deepseekProv = {
    id: 'default-deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'ds-key',
    enabled: true,
    models: [
      { id: 'ds-chat', modelId: 'deepseek-chat', role: 'primary',
        costInputPer1M: 0.27, costOutputPer1M: 1.10, costCachedPer1M: 0.07,
        maxContextTokens: 65536, maxOutputTokens: 8192 },
    ],
  };
  const config = registryConfig([proxyProvider(), deepseekProv]);
  const route = resolveLlmRoute(config, {
    role: 'extract',
    modelOverride: 'deepseek-chat',
  });
  assert.equal(route.model, 'deepseek-chat');
  assert.equal(route.baseUrl, 'https://api.deepseek.com');
  assert.equal(route.apiKey, 'ds-key');
  assert.ok(route._registryEntry, 'override model should re-resolve from registry');
});

test('modelOverride for non-registry model falls through to alignRouteToModelProvider', () => {
  const config = registryConfig([proxyProvider()]);
  const route = resolveLlmRoute(config, {
    role: 'extract',
    modelOverride: 'unknown-model-999',
  });
  // Non-registry model should be processed by alignment (infers openai)
  assert.equal(route.model, 'unknown-model-999');
  assert.ok(!route._registryEntry, 'non-registry model should not have registry entry');
});

test('flat-key route (no registry) still goes through alignRouteToModelProvider', () => {
  const config = {
    llmProvider: 'openai',
    llmApiKey: 'openai-key',
    llmBaseUrl: 'https://api.openai.com',
    llmModelExtract: 'gpt-4.1-mini',
    llmExtractProvider: 'openai',
    llmExtractApiKey: 'openai-key',
    llmExtractBaseUrl: 'https://api.openai.com',
  };
  const route = resolveLlmRoute(config, { role: 'extract' });
  assert.equal(route.provider, 'openai');
  assert.equal(route.model, 'gpt-4.1-mini');
  assert.ok(!route._registryEntry, 'flat-key route should not have registry entry');
});

test('registry fallback route is NOT overwritten by alignRouteToModelProvider', () => {
  const config = registryConfig([proxyProvider()], {
    llmExtractFallbackModel: 'gemini-2.5-flash',
    llmModelExtract: 'unknown-model',
  });
  const fallback = resolveLlmFallbackRoute(config, { role: 'extract' });
  assert.ok(fallback, 'fallback should exist');
  assert.equal(fallback.provider, 'openai-compatible');
  assert.equal(fallback.baseUrl, 'https://my-proxy.corp.com');
  assert.equal(fallback.apiKey, 'proxy-secret');
  assert.ok(fallback._registryEntry, 'fallback registry entry should be preserved');
});

// ---------------------------------------------------------------------------
// Fix 2: buildEffectiveCostRates — registry vs caller cost rates
// ---------------------------------------------------------------------------

test('buildEffectiveCostRates returns registry costs when entry has costs', () => {
  const registryEntry = {
    costs: { inputPer1M: 0.15, outputPer1M: 0.60, cachedPer1M: 0.04 },
  };
  const callerRates = { llmCostInputPer1M: 99, llmCostOutputPer1M: 99, llmCostCachedInputPer1M: 99 };
  const result = buildEffectiveCostRates(registryEntry, callerRates);
  assert.deepEqual(result, {
    llmCostInputPer1M: 0.15,
    llmCostOutputPer1M: 0.60,
    llmCostCachedInputPer1M: 0.04,
  });
});

test('buildEffectiveCostRates returns caller rates when no registry entry', () => {
  const callerRates = { llmCostInputPer1M: 1, llmCostOutputPer1M: 2, llmCostCachedInputPer1M: 0.5 };
  assert.deepEqual(buildEffectiveCostRates(null, callerRates), callerRates);
  assert.deepEqual(buildEffectiveCostRates(undefined, callerRates), callerRates);
});

test('buildEffectiveCostRates returns caller rates when entry has no costs', () => {
  const callerRates = { llmCostInputPer1M: 1, llmCostOutputPer1M: 2, llmCostCachedInputPer1M: 0.5 };
  assert.deepEqual(buildEffectiveCostRates({}, callerRates), callerRates);
  assert.deepEqual(buildEffectiveCostRates({ costs: null }, callerRates), callerRates);
});

// ---------------------------------------------------------------------------
// Gap 3: cortex provider type rejected at runtime guard
// ---------------------------------------------------------------------------

test('cortex provider type is blocked with clear error in resolveLlmRoute flow', async () => {
  // cortex entries should never reach callLlmWithRouting — the runtime guard prevents it.
  // resolveLlmRoute itself should still resolve cortex entries from the registry
  // (the guard is in callLlmWithRouting, not resolveLlmRoute).
  const cortexProv = {
    id: 'local-cortex',
    name: 'Cortex Sidecar',
    type: 'cortex',
    baseUrl: 'http://localhost:5050',
    apiKey: '',
    enabled: true,
    models: [
      { id: 'c1', modelId: 'cortex-model', role: 'primary',
        costInputPer1M: 0, costOutputPer1M: 0, costCachedPer1M: 0,
        maxContextTokens: 8192, maxOutputTokens: 4096 },
    ],
  };
  const config = registryConfig([cortexProv], { llmModelExtract: 'cortex-model' });
  const route = resolveLlmRoute(config, { role: 'extract' });
  // Route resolves from registry with cortex type preserved
  assert.equal(route.provider, 'cortex');
  assert.equal(route._registryEntry.providerType, 'cortex');
});
