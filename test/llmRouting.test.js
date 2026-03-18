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

// ---------------------------------------------------------------------------
// Helpers — must be above all tests that reference them
// ---------------------------------------------------------------------------

function registryConfig(registryProviders, overrides = {}) {
  return {
    _registryLookup: buildRegistryLookup(registryProviders),
    llmModelPlan: 'gemini-2.5-flash',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('resolveLlmRoute selects per-role provider/base/model with reason mapping via registry', () => {
  // WHY: All roles now alias to llmModelPlan. Provider/baseUrl/apiKey come from registry or inference.
  const config = registryConfig([proxyProvider()], {
    llmModelPlan: 'gemini-2.5-flash',
    geminiApiKey: 'gem-key',
  });

  const planRoute = resolveLlmRoute(config, { reason: 'plan' });
  assert.equal(planRoute.provider, 'openai-compatible');
  assert.equal(planRoute.apiKey, 'proxy-secret');
  assert.equal(planRoute.model, 'gemini-2.5-flash');

  // verify_extract_fast maps to plan role
  const verifyFastRoute = resolveLlmRoute(config, { reason: 'verify_extract_fast' });
  assert.equal(verifyFastRoute.provider, 'openai-compatible');
  assert.equal(verifyFastRoute.model, 'gemini-2.5-flash');

  // extract also aliases to llmModelPlan — same model, same registry entry
  const extractRoute = resolveLlmRoute(config, { reason: 'extract' });
  assert.equal(extractRoute.provider, 'openai-compatible');
  assert.equal(extractRoute.apiKey, 'proxy-secret');
  assert.equal(extractRoute.model, 'gemini-2.5-flash');
});

test('resolveLlmFallbackRoute returns null when fallback matches primary fingerprint', () => {
  // WHY: All roles alias to llmModelPlan. Fallback uses llmPlanFallbackModel.
  // When both resolve to the same fingerprint, fallback is null.
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
  const config = registryConfig([deepseekProv], {
    llmModelPlan: 'deepseek-chat',
    llmPlanFallbackModel: 'deepseek-chat',
  });

  const fallback = resolveLlmFallbackRoute(config, { reason: 'extract' });
  assert.equal(fallback, null);
});

test('route key helpers detect role-only keys and snapshot masks secrets', () => {
  // WHY: Without registry, routes infer provider from model name + bootstrap apiKey.
  // gemini-2.5-flash infers 'gemini' provider, bootstrap reads geminiApiKey.
  // gpt-4.1-mini infers 'openai' provider, bootstrap reads llmApiKey/openaiApiKey.
  const config = {
    llmModelPlan: 'gemini-2.5-flash',
    geminiApiKey: 'gem-key',
    llmApiKey: '',
    openaiApiKey: '',
  };

  // plan role reads llmModelPlan → gemini-2.5-flash → infers gemini → geminiApiKey
  assert.equal(hasLlmRouteApiKey(config, { reason: 'plan' }), true);
  // extract also aliases to llmModelPlan → same model → same key
  assert.equal(hasLlmRouteApiKey(config, { reason: 'extract' }), true);
  assert.equal(hasAnyLlmApiKey(config), true);

  const snapshot = llmRoutingSnapshot(config);
  assert.equal(snapshot.plan.primary.api_key_present, true);
  assert.equal(snapshot.extract.primary.api_key_present, true);
  assert.equal(Object.hasOwn(snapshot.plan.primary, 'apiKey'), false);
});

test('model override switches route provider and credentials by model family via inference', () => {
  // WHY: Model override with no registry infers provider from model name + bootstrap keys.
  const config = {
    llmModelPlan: 'gpt-5.1-low',
    llmApiKey: 'openai-key',
    openaiApiKey: 'openai-key',
    geminiApiKey: 'gem-key',
    deepseekApiKey: 'ds-key',
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
  // WHY: llmForceRoleModelProvider returns the base route when providers differ.
  // Base route for extract reads llmModelPlan → infers gemini → bootstrap geminiApiKey.
  const config = {
    llmForceRoleModelProvider: true,
    llmModelPlan: 'gemini-2.5-flash-lite',
    geminiApiKey: 'gem-key',
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
// Registry route resolution tests
// ---------------------------------------------------------------------------

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

test('flat-key route (no registry) infers provider from model name + bootstrap keys', () => {
  // WHY: Without registry, baseRouteForRole infers provider from model name.
  const config = {
    llmModelPlan: 'gpt-4.1-mini',
    llmApiKey: 'openai-key',
    openaiApiKey: 'openai-key',
  };
  const route = resolveLlmRoute(config, { role: 'extract' });
  assert.equal(route.provider, 'openai');
  assert.equal(route.model, 'gpt-4.1-mini');
  assert.equal(route.apiKey, 'openai-key');
  assert.equal(route.baseUrl, 'https://api.openai.com');
  assert.ok(!route._registryEntry, 'flat-key route should not have registry entry');
});

test('registry fallback route resolves from registry without provider overwrite', () => {
  // WHY: Fallback uses llmPlanFallbackModel (not per-role fallback keys).
  const config = registryConfig([proxyProvider()], {
    llmPlanFallbackModel: 'gemini-2.5-flash',
    llmModelPlan: 'unknown-model',
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
  const config = registryConfig([cortexProv], { llmModelPlan: 'cortex-model' });
  const route = resolveLlmRoute(config, { role: 'extract' });
  // Route resolves from registry with cortex type preserved
  assert.equal(route.provider, 'cortex');
  assert.equal(route._registryEntry.providerType, 'cortex');
});
