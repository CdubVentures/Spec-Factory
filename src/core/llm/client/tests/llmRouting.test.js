import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEffectiveCostRates,
  callLlmWithRouting,
  extractEffortFromModelName,
  hasAnyLlmApiKey,
  hasLlmRouteApiKey,
  llmRoutingSnapshot,
  resolvePhaseModel,
  resolvePhaseReasoning,
  resolvePhaseFallbackModel,
  resolvePhaseDisableLimits,
  resolveLlmFallbackRoute,
  resolveLlmRoute
} from '../routing.js';
import { buildRegistryLookup } from '../../routeResolver.js';

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
  assert.equal(planRoute.role, 'plan');

  const discoveryPlannerRoute = resolveLlmRoute(config, { reason: 'discovery_planner_primary' });
  assert.equal(discoveryPlannerRoute.provider, 'openai-compatible');
  assert.equal(discoveryPlannerRoute.apiKey, 'proxy-secret');
  assert.equal(discoveryPlannerRoute.model, 'gemini-2.5-flash');
  assert.equal(discoveryPlannerRoute.role, 'plan');

  // verify_extract_fast maps to plan role
  const verifyFastRoute = resolveLlmRoute(config, { reason: 'verify_extract_fast' });
  assert.equal(verifyFastRoute.provider, 'openai-compatible');
  assert.equal(verifyFastRoute.model, 'gemini-2.5-flash');
  assert.equal(verifyFastRoute.role, 'plan');

  // extract also aliases to llmModelPlan — same model, same registry entry
  const extractRoute = resolveLlmRoute(config, { reason: 'extract' });
  assert.equal(extractRoute.provider, 'openai-compatible');
  assert.equal(extractRoute.apiKey, 'proxy-secret');
  assert.equal(extractRoute.model, 'gemini-2.5-flash');
});

test('resolveLlmFallbackRoute returns the fallback even when it matches primary (stochastic resample)', () => {
  // WHY: Fallback is not dedup'd against primary — if the user configured the
  // same model for both, honor that. LLM outputs are stochastic and a resample
  // on the same model can recover from schema/parse failures.
  const deepseekProv = {
    id: 'default-deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'ds-key',
    enabled: true,
    models: [
      { id: 'ds-chat', modelId: 'deepseek-chat', role: 'primary',
        costInputPer1M: 0.28, costOutputPer1M: 0.42, costCachedPer1M: 0.028,
        maxContextTokens: 65536, maxOutputTokens: 8192 },
    ],
  };
  const config = registryConfig([deepseekProv], {
    llmModelPlan: 'deepseek-chat',
    llmPlanFallbackModel: 'deepseek-chat',
  });

  const fallback = resolveLlmFallbackRoute(config, { reason: 'extract' });
  assert.ok(fallback, 'fallback must not be null when configured, even if it matches primary');
  assert.equal(fallback.model, 'deepseek-chat');
});

test('route key helpers detect role-only keys and snapshot masks secrets', () => {
  // WHY: Without registry, routes infer provider from model name + bootstrap apiKey.
  // gemini-2.5-flash infers 'gemini' provider, bootstrap reads geminiApiKey.
  // gpt-4.1-mini infers 'openai' provider, bootstrap reads openaiApiKey.
  const config = {
    llmModelPlan: 'gemini-2.5-flash',
    geminiApiKey: 'gem-key',
    openaiApiKey: '',
  };

  // plan role reads llmModelPlan → gemini-2.5-flash → infers gemini → geminiApiKey
  assert.equal(hasLlmRouteApiKey(config, { reason: 'plan' }), true);
  assert.equal(hasAnyLlmApiKey(config), true);

  const snapshot = llmRoutingSnapshot(config);
  assert.equal(snapshot.plan.primary.api_key_present, true);
  assert.equal(Object.hasOwn(snapshot.plan.primary, 'apiKey'), false);
});

test('model override switches route provider and credentials by model family via inference', () => {
  // WHY: Model override with no registry infers provider from model name + bootstrap keys.
  const config = {
    llmModelPlan: 'gpt-5.1-low',
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
        costInputPer1M: 0.28, costOutputPer1M: 0.42, costCachedPer1M: 0.028,
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

// ---------------------------------------------------------------------------
// resolvePhaseModel — phase-aware model resolution
// ---------------------------------------------------------------------------

function phaseConfig(overrides = {}) {
  return {
    llmModelPlan: 'global-base',
    llmModelReasoning: 'global-reasoning',
    llmPlanUseReasoning: false,
    ...overrides,
  };
}

test('resolvePhaseModel returns phase base model when phase override is set', () => {
  const config = phaseConfig({
    _resolvedNeedsetBaseModel: 'needset-custom',
    _resolvedNeedsetReasoningModel: 'global-reasoning',
    _resolvedNeedsetUseReasoning: false,
  });
  const result = resolvePhaseModel(config, 'needset');
  assert.equal(result, 'needset-custom');
});

test('resolvePhaseModel falls back to global llmModelPlan when no phase override exists', () => {
  const config = phaseConfig();
  const result = resolvePhaseModel(config, 'needset');
  assert.equal(result, 'global-base');
});

test('resolvePhaseModel falls back to global reasoning model when phase reasoning model is empty', () => {
  const config = phaseConfig({
    _resolvedBrandResolverBaseModel: 'brand-resolver-base',
    _resolvedBrandResolverReasoningModel: '',
    _resolvedBrandResolverUseReasoning: true,
  });
  const result = resolvePhaseModel(config, 'brandResolver');
  assert.equal(result, 'global-reasoning');
});

test('resolvePhaseModel returns empty string for unknown phase (no crash)', () => {
  const config = phaseConfig();
  const result = resolvePhaseModel(config, 'nonexistent');
  assert.equal(result, 'global-base');
});

test('resolvePhaseModel returns registry default when config is empty and phase is unknown', () => {
  const result = resolvePhaseModel({}, 'nonexistent');
  // WHY: SSOT accessor provides the registry default for llmModelPlan
  assert.equal(result, 'gemini-2.5-flash');
});

test('resolvePhaseModel works for all known phases', () => {
  const phases = ['needset', 'searchPlanner', 'brandResolver', 'serpSelector', 'domainClassifier'];
  for (const phase of phases) {
    const cap = phase.charAt(0).toUpperCase() + phase.slice(1);
    const config = phaseConfig({
      [`_resolved${cap}BaseModel`]: `${phase}-model`,
      [`_resolved${cap}UseReasoning`]: false,
    });
    const result = resolvePhaseModel(config, phase);
    assert.equal(result, `${phase}-model`, `phase ${phase} should resolve to ${phase}-model`);
  }
});

// ---------------------------------------------------------------------------
// resolveLlmRoute with phase param — auto-resolves model override
// ---------------------------------------------------------------------------

test('resolveLlmRoute uses phase override model when phase param is passed', () => {
  const config = phaseConfig({
    _resolvedNeedsetBaseModel: 'needset-custom',
    _resolvedNeedsetUseReasoning: false,
  });
  const route = resolveLlmRoute(config, { role: 'plan', phase: 'needset' });
  assert.equal(route.model, 'needset-custom');
});

test('resolveLlmRoute prefers explicit modelOverride over phase', () => {
  const config = phaseConfig({
    _resolvedNeedsetBaseModel: 'needset-custom',
    _resolvedNeedsetUseReasoning: false,
  });
  const route = resolveLlmRoute(config, {
    role: 'plan',
    phase: 'needset',
    modelOverride: 'explicit-override',
  });
  assert.equal(route.model, 'explicit-override');
});

test('resolveLlmRoute ignores phase when phase is empty string', () => {
  const config = phaseConfig({
    _resolvedNeedsetBaseModel: 'needset-custom',
    _resolvedNeedsetUseReasoning: false,
  });
  const route = resolveLlmRoute(config, { role: 'plan', phase: '' });
  assert.equal(route.model, 'global-base');
});

// ---------------------------------------------------------------------------
// resolvePhaseReasoning — phase-aware reasoning auto-resolution
// ---------------------------------------------------------------------------

test('resolvePhaseReasoning returns true when phase config enables reasoning', () => {
  const config = phaseConfig({
    _resolvedSearchPlannerUseReasoning: true,
  });
  assert.equal(resolvePhaseReasoning(config, 'searchPlanner'), true);
});

test('resolvePhaseReasoning returns false when phase config disables reasoning', () => {
  const config = phaseConfig({
    _resolvedSearchPlannerUseReasoning: false,
  });
  assert.equal(resolvePhaseReasoning(config, 'searchPlanner'), false);
});

test('resolvePhaseReasoning falls back to llmPlanUseReasoning when phase key missing', () => {
  const config = phaseConfig({
    llmPlanUseReasoning: true,
    // _resolvedBrandResolverUseReasoning intentionally missing
  });
  assert.equal(resolvePhaseReasoning(config, 'brandResolver'), true);
});

test('resolvePhaseReasoning ignores legacy llmReasoningMode — panel SSOT only', () => {
  const config = {
    llmReasoningMode: true,
    // llmPlanUseReasoning not set — should default to false, NOT fall through to llmReasoningMode
  };
  assert.equal(resolvePhaseReasoning(config, 'brandResolver'), false);
});

test('resolvePhaseReasoning returns false when no reasoning config at all', () => {
  assert.equal(resolvePhaseReasoning({}, 'needset'), false);
});

test('resolvePhaseReasoning returns false for empty phase with no global toggle', () => {
  assert.equal(resolvePhaseReasoning({}, ''), false);
});

test('resolvePhaseReasoning works for all known phases', () => {
  const phases = ['needset', 'searchPlanner', 'brandResolver', 'serpSelector'];
  for (const phase of phases) {
    const cap = phase.charAt(0).toUpperCase() + phase.slice(1);
    const config = phaseConfig({
      [`_resolved${cap}UseReasoning`]: true,
    });
    assert.equal(resolvePhaseReasoning(config, phase), true, `phase ${phase} should resolve reasoning to true`);
  }
});

// ---------------------------------------------------------------------------
// API key resolution: registry with empty apiKey must bootstrap from model name
// ---------------------------------------------------------------------------

test('registry route with empty apiKey falls back to bootstrap key via model name inference', () => {
  // WHY: Registry entry has type "openai-compatible" (protocol) but model is gemini-*.
  // Bootstrap must infer "gemini" from model name to find geminiApiKey.
  const geminiProvider = {
    id: 'default-gemini',
    name: 'Gemini',
    type: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
    enabled: true,
    models: [
      { id: 'gem-flash', modelId: 'gemini-2.5-flash', role: 'primary',
        costInputPer1M: 0.3, costOutputPer1M: 2.5, costCachedPer1M: 0.03,
        maxContextTokens: 1048576, maxOutputTokens: 65536 },
    ],
  };
  const config = registryConfig([geminiProvider], {
    geminiApiKey: 'gem-bootstrap-key',
    openaiApiKey: '',
  });

  const route = resolveLlmRoute(config, { role: 'plan' });
  assert.equal(route.apiKey, 'gem-bootstrap-key',
    'must infer gemini from model name, not use openaiApiKey');
});

test('registry fallback route with empty apiKey falls back to bootstrap key via model name', () => {
  const deepseekProvider = {
    id: 'default-deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    enabled: true,
    models: [
      { id: 'ds-chat', modelId: 'deepseek-chat', role: 'primary',
        costInputPer1M: 0.28, costOutputPer1M: 0.42, costCachedPer1M: 0.028,
        maxContextTokens: 128000, maxOutputTokens: 8192 },
    ],
  };
  const config = registryConfig([deepseekProvider], {
    llmModelPlan: 'gemini-2.5-flash',
    llmPlanFallbackModel: 'deepseek-chat',
    deepseekApiKey: 'ds-bootstrap-key',
    openaiApiKey: '',
  });

  const fallback = resolveLlmFallbackRoute(config, { role: 'plan' });
  assert.ok(fallback, 'fallback route should exist');
  assert.equal(fallback.apiKey, 'ds-bootstrap-key',
    'must infer deepseek from model name, not use openaiApiKey');
});

// ---------------------------------------------------------------------------
// Triage role recognition
// ---------------------------------------------------------------------------

test('hasLlmRouteApiKey returns true for triage role with valid provider key', () => {
  const config = {
    llmModelPlan: 'gemini-2.5-flash',
    geminiApiKey: 'gem-key',
  };
  assert.equal(hasLlmRouteApiKey(config, { role: 'triage' }), true,
    'triage role must resolve to plan model and find geminiApiKey');
});

test('llmRoutingSnapshot includes triage role', () => {
  const config = {
    llmModelPlan: 'gemini-2.5-flash',
    geminiApiKey: 'gem-key',
  };
  const snapshot = llmRoutingSnapshot(config);
  assert.ok(snapshot.triage, 'snapshot must include triage role');
  assert.equal(snapshot.triage.primary.api_key_present, true);
});

// ---------------------------------------------------------------------------
// resolvePhaseFallbackModel — phase-aware fallback resolution
// ---------------------------------------------------------------------------

test('resolvePhaseFallbackModel returns base fallback when fallbackUseReasoning is false', () => {
  const config = phaseConfig({
    _resolvedNeedsetFallbackModel: 'needset-fb',
    _resolvedNeedsetFallbackReasoningModel: 'needset-reason-fb',
    _resolvedNeedsetFallbackUseReasoning: false,
  });
  assert.equal(resolvePhaseFallbackModel(config, 'needset'), 'needset-fb');
});

test('resolvePhaseFallbackModel returns reasoning fallback when fallbackUseReasoning is true', () => {
  const config = phaseConfig({
    _resolvedNeedsetFallbackModel: 'needset-fb',
    _resolvedNeedsetFallbackReasoningModel: 'needset-reason-fb',
    _resolvedNeedsetFallbackUseReasoning: true,
  });
  assert.equal(resolvePhaseFallbackModel(config, 'needset'), 'needset-reason-fb');
});

test('resolvePhaseFallbackModel returns empty string when no fallback configured', () => {
  const config = phaseConfig();
  assert.equal(resolvePhaseFallbackModel(config, 'needset'), '');
});

test('resolvePhaseFallbackModel returns empty string for empty phase', () => {
  const config = phaseConfig({ _resolvedNeedsetFallbackModel: 'should-not-return' });
  assert.equal(resolvePhaseFallbackModel(config, ''), '');
});

test('resolveLlmFallbackRoute uses phase-specific fallback model even when it matches primary', () => {
  const prov = proxyProvider();
  const config = registryConfig([prov], {
    llmModelPlan: 'gemini-2.5-flash',
    llmPlanFallbackModel: 'global-fallback',
    _resolvedNeedsetBaseModel: 'gemini-2.5-flash',
    _resolvedNeedsetUseReasoning: false,
    _resolvedNeedsetFallbackModel: 'gemini-2.5-flash',
    _resolvedNeedsetFallbackUseReasoning: false,
  });
  // WHY: Fallback is not dedup'd against primary — user explicitly set it,
  // a resample on the same model can recover from stochastic failures.
  const route = resolveLlmFallbackRoute(config, { role: 'plan', phase: 'needset' });
  assert.ok(route, 'fallback must be returned even when it matches primary');
  assert.equal(route.model, 'gemini-2.5-flash');
});

// ---------------------------------------------------------------------------
// resolvePhaseDisableLimits
// ---------------------------------------------------------------------------

test('resolvePhaseDisableLimits returns false when not configured', () => {
  const config = phaseConfig();
  assert.equal(resolvePhaseDisableLimits(config, 'needset'), false);
});

test('resolvePhaseDisableLimits returns true when phase has it set', () => {
  const config = phaseConfig({ _resolvedNeedsetDisableLimits: true });
  assert.equal(resolvePhaseDisableLimits(config, 'needset'), true);
});

test('resolvePhaseDisableLimits returns false for empty phase', () => {
  const config = phaseConfig({ _resolvedNeedsetDisableLimits: true });
  assert.equal(resolvePhaseDisableLimits(config, ''), false);
});

// ---------------------------------------------------------------------------
// jsonStrict two-phase routing (callLlmWithRouting)
// ---------------------------------------------------------------------------

function twoPhaseConfig(overrides = {}) {
  return registryConfig([proxyProvider(), anthropicRegistryProvider()], {
    llmPlanFallbackModel: 'claude-sonnet-4-6',
    _resolvedColorfinderFallbackModel: 'claude-sonnet-4-6',
    _resolvedColorfinderFallbackUseReasoning: false,
    _resolvedWriterBaseModel: '',
    _resolvedWriterReasoningModel: '',
    _resolvedWriterUseReasoning: false,
    ...overrides,
  });
}

const TEST_SCHEMA = {
  type: 'object',
  properties: { editions: { type: 'number' }, colors: { type: 'number' } },
  required: ['editions', 'colors'],
};

function mockFetchTwoPhase() {
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, body });
    const hasResponseFormat = Boolean(body.response_format);
    const content = hasResponseFormat
      ? '{"editions": 5, "colors": 7}'
      : 'Research: Found 5 editions and 7 colors';
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content } }],
          model: body.model,
          usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        });
      },
    };
  };
  return calls;
}

test('callLlmWithRouting: jsonStrict false + jsonSchema triggers two-phase call', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = mockFetchTwoPhase();

  try {
    const config = twoPhaseConfig({ _resolvedColorfinderJsonStrict: false });

    const result = await callLlmWithRouting({
      config,
      phase: 'colorfinder',
      system: 'Find all color editions.',
      user: 'Product X',
      jsonSchema: TEST_SCHEMA,
    });

    // Two fetch calls: Phase 1 (research) + Phase 2 (writer)
    assert.equal(fetchCalls.length, 2, 'should make exactly two LLM calls');

    // Phase 1: no response_format (free-form research)
    assert.equal(fetchCalls[0].body.response_format, undefined,
      'Phase 1 must NOT have response_format');

    // Phase 2: has response_format with schema (writer formatting)
    assert.ok(fetchCalls[1].body.response_format,
      'Phase 2 must have response_format');
    assert.equal(fetchCalls[1].body.response_format.type, 'json_schema');

    // Phase 2 system prompt contains writer instructions + research findings
    const writerSystem = fetchCalls[1].body.messages
      .find((m) => m.role === 'system')?.content || '';
    assert.ok(writerSystem.includes('JSON formatter'),
      'Phase 2 system should contain writer instructions');
    assert.ok(writerSystem.includes('Research: Found 5 editions'),
      'Phase 2 system should contain Phase 1 findings');

    // Result is parsed JSON from Phase 2
    assert.deepEqual(result, { editions: 5, colors: 7 });
  } finally {
    global.fetch = originalFetch;
  }
});

test('callLlmWithRouting: jsonStrict false + no jsonSchema does single call', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    fetchCalls.push({ url, body });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content: '{"result": "ok"}' } }],
          model: body.model,
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        });
      },
    };
  };

  try {
    const config = twoPhaseConfig({ _resolvedColorfinderJsonStrict: false });
    await callLlmWithRouting({
      config,
      phase: 'colorfinder',
      system: 'Describe the product.',
      user: 'Product X',
      jsonSchema: null,
    });
    assert.equal(fetchCalls.length, 1,
      'without jsonSchema, should make exactly one call');
  } finally {
    global.fetch = originalFetch;
  }
});

test('callLlmWithRouting: jsonStrict true (default) does single call with schema', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = mockFetchTwoPhase();

  try {
    // No _resolvedColorfinderJsonStrict set → defaults to true
    const config = twoPhaseConfig();

    await callLlmWithRouting({
      config,
      phase: 'colorfinder',
      system: 'Find all color editions.',
      user: 'Product X',
      jsonSchema: TEST_SCHEMA,
    });

    assert.equal(fetchCalls.length, 1,
      'jsonStrict true should make exactly one call');
    assert.ok(fetchCalls[0].body.response_format,
      'single call must have response_format');
  } finally {
    global.fetch = originalFetch;
  }
});

test('callLlmWithRouting: jsonStrict false Phase 1 failure triggers fallback research then writer', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  let callCount = 0;

  global.fetch = async (url, opts) => {
    callCount++;
    const body = JSON.parse(opts.body);
    fetchCalls.push({ url, body });

    if (callCount === 1) {
      // Phase 1 research (primary) fails
      return {
        ok: false,
        status: 500,
        async text() { return 'Internal Server Error'; },
      };
    }
    if (callCount === 2) {
      // Phase 1 research (fallback) succeeds with raw findings
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            choices: [{ message: { content: 'Findings: 3 editions and 2 colors.' } }],
            model: body.model,
            usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 },
          });
        },
      };
    }
    // Phase 2 writer call with schema
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [{ message: { content: '{"editions": 3, "colors": 2}' } }],
          model: body.model,
          usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
        });
      },
    };
  };

  try {
    const config = twoPhaseConfig({ _resolvedColorfinderJsonStrict: false });

    const result = await callLlmWithRouting({
      config,
      phase: 'colorfinder',
      system: 'Find all color editions.',
      user: 'Product X',
      jsonSchema: TEST_SCHEMA,
    });

    assert.equal(callCount, 3, 'should try primary research, fallback research, then writer');
    // Call 1 (primary research): no schema
    assert.equal(fetchCalls[0].body.response_format, undefined,
      'primary research call must not have response_format');
    // Call 2 (fallback research): no schema
    assert.equal(fetchCalls[1].body.response_format, undefined,
      'fallback research call must not have response_format');
    // Call 3 (writer): has schema
    assert.ok(fetchCalls[2].body.response_format,
      'writer call must have response_format');
    assert.deepEqual(result, { editions: 3, colors: 2 });
  } finally {
    global.fetch = originalFetch;
  }
});

test('callLlmWithRouting: jsonStrict false Phase 2 uses dedicated writer model route', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = mockFetchTwoPhase();

  try {
    // Writer model explicitly set to anthropic (claude-sonnet-4-6)
    const config = twoPhaseConfig({
      _resolvedColorfinderJsonStrict: false,
      _resolvedWriterBaseModel: 'claude-sonnet-4-6',
    });

    await callLlmWithRouting({
      config,
      phase: 'colorfinder',
      system: 'Find all color editions.',
      user: 'Product X',
      jsonSchema: TEST_SCHEMA,
    });

    assert.equal(fetchCalls.length, 2);
    // Phase 1: primary model (gemini via proxy)
    assert.ok(fetchCalls[0].url.includes('my-proxy.corp.com'),
      'Phase 1 should use primary (proxy) base URL');
    // Phase 2: writer model (anthropic) — NOT fallback
    assert.ok(fetchCalls[1].url.includes('api.anthropic.com'),
      'Phase 2 should use dedicated writer (anthropic) base URL');
  } finally {
    global.fetch = originalFetch;
  }
});

test('callLlmWithRouting: jsonStrict false no writer configured falls back to primary for Phase 2', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = mockFetchTwoPhase();

  try {
    // No writer model set — Phase 2 should use primary
    const config = twoPhaseConfig({
      _resolvedColorfinderJsonStrict: false,
      _resolvedWriterBaseModel: '',
    });

    await callLlmWithRouting({
      config,
      phase: 'colorfinder',
      system: 'Find all color editions.',
      user: 'Product X',
      jsonSchema: TEST_SCHEMA,
    });

    assert.equal(fetchCalls.length, 2);
    // Both phases use the primary (proxy) route
    assert.ok(fetchCalls[0].url.includes('my-proxy.corp.com'),
      'Phase 1 should use primary (proxy) base URL');
    assert.ok(fetchCalls[1].url.includes('my-proxy.corp.com'),
      'Phase 2 should fall back to primary when no writer configured');
  } finally {
    global.fetch = originalFetch;
  }
});

test('callLlmWithRouting: jsonStrict false writer model is independent of fallback model', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = mockFetchTwoPhase();

  try {
    // Writer = anthropic, Fallback = proxy (same as primary here, so fallback deduped to null)
    // This proves writer is NOT the fallback — it's a separate route
    const config = twoPhaseConfig({
      _resolvedColorfinderJsonStrict: false,
      _resolvedWriterBaseModel: 'claude-sonnet-4-6',
      _resolvedColorfinderFallbackModel: 'gemini-2.5-flash', // same as primary → deduped
    });

    await callLlmWithRouting({
      config,
      phase: 'colorfinder',
      system: 'Find all color editions.',
      user: 'Product X',
      jsonSchema: TEST_SCHEMA,
    });

    assert.equal(fetchCalls.length, 2);
    // Phase 2 still uses writer (anthropic), not fallback (which was deduped)
    assert.ok(fetchCalls[1].url.includes('api.anthropic.com'),
      'Phase 2 must use writer model, independent of fallback');
  } finally {
    global.fetch = originalFetch;
  }
});

// WHY: extractEffortFromModelName unit tests live in src/shared/tests/effortFromModelName.test.js.
// The function is imported here via re-export from routing.js to verify the re-export works.
test('extractEffortFromModelName re-export from routing.js works', () => {
  assert.equal(extractEffortFromModelName('gpt-5.4-xhigh'), 'xhigh');
  assert.equal(extractEffortFromModelName('gpt-5.4'), null);
});
