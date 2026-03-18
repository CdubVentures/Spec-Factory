import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegistryLookup,
  resolveModelFromRegistry,
  resolveModelCosts,
  resolveModelTokenProfile,
} from '../src/core/llm/routeResolver.js';
import {
  resolveLlmRoute,
  resolveLlmFallbackRoute,
} from '../src/core/llm/client/routing.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function geminiProvider(overrides = {}) {
  return {
    id: 'default-gemini',
    name: 'Google Gemini',
    type: 'openai-compatible',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: 'gem-key',
    enabled: true,
    models: [
      {
        id: 'gem-flash',
        modelId: 'gemini-2.5-flash',
        role: 'primary',
        costInputPer1M: 0.15,
        costOutputPer1M: 0.60,
        costCachedPer1M: 0.04,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
      },
      {
        id: 'gem-flash-lite',
        modelId: 'gemini-2.5-flash-lite',
        role: 'fast',
        costInputPer1M: 0.075,
        costOutputPer1M: 0.30,
        costCachedPer1M: 0.02,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
      },
    ],
    ...overrides,
  };
}

function deepseekProvider(overrides = {}) {
  return {
    id: 'default-deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'ds-key',
    enabled: true,
    models: [
      {
        id: 'ds-chat',
        modelId: 'deepseek-chat',
        role: 'primary',
        costInputPer1M: 0.27,
        costOutputPer1M: 1.10,
        costCachedPer1M: 0.07,
        maxContextTokens: 65536,
        maxOutputTokens: 8192,
      },
    ],
    ...overrides,
  };
}

function anthropicProvider(overrides = {}) {
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
    ...overrides,
  };
}

function cortexProvider(overrides = {}) {
  return {
    id: 'local-llmlab',
    name: 'LLM Lab Sidecar',
    type: 'cortex',
    baseUrl: 'http://localhost:5050',
    apiKey: '',
    enabled: true,
    models: [
      {
        id: 'llmlab-gpt5-low',
        modelId: 'gpt-5-low',
        role: 'fast',
        tier: 'fast',
        transport: 'sync',
        costInputPer1M: 0,
        costOutputPer1M: 0,
        costCachedPer1M: 0,
        maxContextTokens: 16384,
        maxOutputTokens: 16384,
      },
    ],
    ...overrides,
  };
}

function twoProviderRegistry() {
  return [geminiProvider(), deepseekProvider()];
}

function fullRegistry() {
  return [geminiProvider(), deepseekProvider(), anthropicProvider(), cortexProvider()];
}

// ---------------------------------------------------------------------------
// buildRegistryLookup
// ---------------------------------------------------------------------------

test('buildRegistryLookup — returns empty lookup for null/undefined/empty', () => {
  for (const input of [null, undefined, '', '{}', '[]', 0, false]) {
    const lookup = buildRegistryLookup(input);
    assert.equal(lookup.providers.size, 0);
    assert.equal(lookup.modelIndex.size, 0);
    assert.equal(lookup.compositeIndex.size, 0);
  }
});

test('buildRegistryLookup — parses JSON string', () => {
  const json = JSON.stringify(twoProviderRegistry());
  const lookup = buildRegistryLookup(json);
  assert.equal(lookup.providers.size, 2);
  assert.ok(lookup.providers.has('default-gemini'));
  assert.ok(lookup.providers.has('default-deepseek'));
});

test('buildRegistryLookup — accepts pre-parsed array', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  assert.equal(lookup.providers.size, 2);
});

test('buildRegistryLookup — skips disabled providers', () => {
  const registry = [geminiProvider({ enabled: false }), deepseekProvider()];
  const lookup = buildRegistryLookup(registry);
  assert.equal(lookup.providers.size, 1);
  assert.ok(lookup.providers.has('default-deepseek'));
  assert.equal(lookup.modelIndex.has('gemini-2.5-flash'), false);
});

test('buildRegistryLookup — builds composite index correctly', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  assert.ok(lookup.compositeIndex.has('default-gemini:gemini-2.5-flash'));
  assert.ok(lookup.compositeIndex.has('default-gemini:gemini-2.5-flash-lite'));
  assert.ok(lookup.compositeIndex.has('default-deepseek:deepseek-chat'));
  assert.equal(lookup.compositeIndex.size, 3);
});

test('buildRegistryLookup — builds model index with all routes per model', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const flashRoutes = lookup.modelIndex.get('gemini-2.5-flash');
  assert.equal(flashRoutes.length, 1);
  assert.equal(flashRoutes[0].providerId, 'default-gemini');
});

test('buildRegistryLookup — same modelId in two providers yields two entries in modelIndex', () => {
  const provider1 = geminiProvider();
  const provider2 = {
    id: 'alt-gemini',
    name: 'Alt Gemini',
    type: 'openai-compatible',
    baseUrl: 'https://alt.example.com',
    apiKey: 'alt-key',
    enabled: true,
    models: [
      {
        id: 'alt-flash',
        modelId: 'gemini-2.5-flash',
        role: 'primary',
        costInputPer1M: 0.10,
        costOutputPer1M: 0.40,
        costCachedPer1M: 0.02,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
      },
    ],
  };
  const lookup = buildRegistryLookup([provider1, provider2]);
  const routes = lookup.modelIndex.get('gemini-2.5-flash');
  assert.equal(routes.length, 2);
  assert.equal(routes[0].providerId, 'default-gemini');
  assert.equal(routes[1].providerId, 'alt-gemini');
});

test('buildRegistryLookup — malformed JSON string yields empty lookup', () => {
  const lookup = buildRegistryLookup('not json{{{');
  assert.equal(lookup.providers.size, 0);
});

test('buildRegistryLookup — non-array parsed value yields empty lookup', () => {
  const lookup = buildRegistryLookup(JSON.stringify({ foo: 'bar' }));
  assert.equal(lookup.providers.size, 0);
});

test('buildRegistryLookup — provider missing id is skipped', () => {
  const bad = { ...geminiProvider(), id: '' };
  const lookup = buildRegistryLookup([bad, deepseekProvider()]);
  assert.equal(lookup.providers.size, 1);
  assert.ok(lookup.providers.has('default-deepseek'));
});

test('buildRegistryLookup — provider missing models array uses empty', () => {
  const noModels = { ...deepseekProvider(), models: null };
  const lookup = buildRegistryLookup([noModels]);
  assert.equal(lookup.providers.size, 1);
  assert.equal(lookup.compositeIndex.size, 0);
});

// ---------------------------------------------------------------------------
// resolveModelFromRegistry — composite keys
// ---------------------------------------------------------------------------

test('resolveModelFromRegistry — composite key exact match', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'default-gemini:gemini-2.5-flash');
  assert.equal(route.providerId, 'default-gemini');
  assert.equal(route.providerName, 'Google Gemini');
  assert.equal(route.providerType, 'openai-compatible');
  assert.equal(route.modelId, 'gemini-2.5-flash');
  assert.equal(route.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(route.apiKey, 'gem-key');
});

test('resolveModelFromRegistry — composite key for deepseek', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'default-deepseek:deepseek-chat');
  assert.equal(route.providerId, 'default-deepseek');
  assert.equal(route.modelId, 'deepseek-chat');
  assert.equal(route.apiKey, 'ds-key');
});

test('resolveModelFromRegistry — composite key miss returns null', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'nonexistent:gemini-2.5-flash');
  assert.equal(route, null);
});

// ---------------------------------------------------------------------------
// resolveModelFromRegistry — bare keys (first enabled provider)
// ---------------------------------------------------------------------------

test('resolveModelFromRegistry — bare key finds first enabled provider', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'gemini-2.5-flash');
  assert.equal(route.providerId, 'default-gemini');
  assert.equal(route.modelId, 'gemini-2.5-flash');
});

test('resolveModelFromRegistry — bare key with duplicate model picks first enabled', () => {
  const p1 = geminiProvider({ enabled: false });
  const p2 = {
    id: 'alt-gemini',
    name: 'Alt Gemini',
    type: 'openai-compatible',
    baseUrl: 'https://alt.example.com',
    apiKey: 'alt-key',
    enabled: true,
    models: [{
      id: 'alt-flash', modelId: 'gemini-2.5-flash', role: 'primary',
      costInputPer1M: 0.10, costOutputPer1M: 0.40, costCachedPer1M: 0.02,
      maxContextTokens: 1048576, maxOutputTokens: 65536,
    }],
  };
  const lookup = buildRegistryLookup([p1, p2]);
  const route = resolveModelFromRegistry(lookup, 'gemini-2.5-flash');
  assert.equal(route.providerId, 'alt-gemini');
});

test('resolveModelFromRegistry — bare key unknown model returns null', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'gpt-99-turbo');
  assert.equal(route, null);
});

// ---------------------------------------------------------------------------
// resolveModelFromRegistry — provider type flows through
// ---------------------------------------------------------------------------

test('resolveModelFromRegistry — openai-compatible type', () => {
  const lookup = buildRegistryLookup(fullRegistry());
  const route = resolveModelFromRegistry(lookup, 'gemini-2.5-flash');
  assert.equal(route.providerType, 'openai-compatible');
});

test('resolveModelFromRegistry — anthropic type', () => {
  const lookup = buildRegistryLookup(fullRegistry());
  const route = resolveModelFromRegistry(lookup, 'claude-sonnet-4-6');
  assert.equal(route.providerType, 'anthropic');
});

test('resolveModelFromRegistry — cortex type with modelMeta', () => {
  const lookup = buildRegistryLookup(fullRegistry());
  const route = resolveModelFromRegistry(lookup, 'local-llmlab:gpt-5-low');
  assert.equal(route.providerType, 'cortex');
  assert.equal(route.modelMeta.tier, 'fast');
  assert.equal(route.modelMeta.transport, 'sync');
});

test('resolveModelFromRegistry — openai-compatible ignores unknown model fields', () => {
  const lookup = buildRegistryLookup(fullRegistry());
  const route = resolveModelFromRegistry(lookup, 'gemini-2.5-flash');
  assert.equal(route.modelMeta.tier, undefined);
  assert.equal(route.modelMeta.transport, undefined);
});

// ---------------------------------------------------------------------------
// resolveModelFromRegistry — cost + token profile in resolved route
// ---------------------------------------------------------------------------

test('resolveModelFromRegistry — costs populated from model entry', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'gemini-2.5-flash');
  assert.deepEqual(route.costs, {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    cachedPer1M: 0.04,
  });
});

test('resolveModelFromRegistry — token profile populated from model entry', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'gemini-2.5-flash');
  assert.deepEqual(route.tokenProfile, {
    maxContextTokens: 1048576,
    maxOutputTokens: 65536,
  });
});

// ---------------------------------------------------------------------------
// resolveModelFromRegistry — empty/null/edge inputs
// ---------------------------------------------------------------------------

test('resolveModelFromRegistry — null lookup returns null', () => {
  assert.equal(resolveModelFromRegistry(null, 'gemini-2.5-flash'), null);
});

test('resolveModelFromRegistry — undefined lookup returns null', () => {
  assert.equal(resolveModelFromRegistry(undefined, 'gemini-2.5-flash'), null);
});

test('resolveModelFromRegistry — empty string key returns null', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  assert.equal(resolveModelFromRegistry(lookup, ''), null);
});

test('resolveModelFromRegistry — null key returns null', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  assert.equal(resolveModelFromRegistry(lookup, null), null);
});

test('resolveModelFromRegistry — whitespace-only key returns null', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  assert.equal(resolveModelFromRegistry(lookup, '   '), null);
});

// ---------------------------------------------------------------------------
// resolveModelCosts
// ---------------------------------------------------------------------------

test('resolveModelCosts — returns registry costs for known model', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const costs = resolveModelCosts(lookup, 'gemini-2.5-flash');
  assert.deepEqual(costs, {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    cachedInputPer1M: 0.04,
  });
});

test('resolveModelCosts — returns fallback rates for unknown model', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const fallback = { inputPer1M: 1, outputPer1M: 2, cachedInputPer1M: 0.5 };
  const costs = resolveModelCosts(lookup, 'unknown-model', fallback);
  assert.deepEqual(costs, fallback);
});

test('resolveModelCosts — returns zeros when no model and no fallback', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const costs = resolveModelCosts(lookup, 'unknown-model');
  assert.deepEqual(costs, { inputPer1M: 0, outputPer1M: 0, cachedInputPer1M: 0 });
});

test('resolveModelCosts — null lookup returns fallback', () => {
  const fallback = { inputPer1M: 1, outputPer1M: 2, cachedInputPer1M: 0.5 };
  const costs = resolveModelCosts(null, 'gemini-2.5-flash', fallback);
  assert.deepEqual(costs, fallback);
});

test('resolveModelCosts — composite key works', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const costs = resolveModelCosts(lookup, 'default-deepseek:deepseek-chat');
  assert.deepEqual(costs, {
    inputPer1M: 0.27,
    outputPer1M: 1.10,
    cachedInputPer1M: 0.07,
  });
});

// ---------------------------------------------------------------------------
// resolveModelTokenProfile
// ---------------------------------------------------------------------------

test('resolveModelTokenProfile — returns profile for known model', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const profile = resolveModelTokenProfile(lookup, 'deepseek-chat');
  assert.deepEqual(profile, {
    maxContextTokens: 65536,
    maxOutputTokens: 8192,
  });
});

test('resolveModelTokenProfile — returns null for unknown model', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  assert.equal(resolveModelTokenProfile(lookup, 'unknown-model'), null);
});

test('resolveModelTokenProfile — null lookup returns null', () => {
  assert.equal(resolveModelTokenProfile(null, 'gemini-2.5-flash'), null);
});

test('resolveModelTokenProfile — composite key works', () => {
  const lookup = buildRegistryLookup(fullRegistry());
  const profile = resolveModelTokenProfile(lookup, 'local-llmlab:gpt-5-low');
  assert.deepEqual(profile, {
    maxContextTokens: 16384,
    maxOutputTokens: 16384,
  });
});

// ---------------------------------------------------------------------------
// providerType defaults
// ---------------------------------------------------------------------------

test('resolveModelFromRegistry — missing type defaults to openai-compatible', () => {
  const provider = {
    id: 'no-type',
    name: 'No Type',
    baseUrl: 'https://example.com',
    apiKey: 'key',
    enabled: true,
    models: [{
      id: 'nt-1', modelId: 'test-model', role: 'primary',
      costInputPer1M: 0, costOutputPer1M: 0, costCachedPer1M: 0,
      maxContextTokens: 8192, maxOutputTokens: 4096,
    }],
  };
  const lookup = buildRegistryLookup([provider]);
  const route = resolveModelFromRegistry(lookup, 'test-model');
  assert.equal(route.providerType, 'openai-compatible');
});

// ---------------------------------------------------------------------------
// model role carries through modelMeta
// ---------------------------------------------------------------------------

test('resolveModelFromRegistry — model role in modelMeta', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'gemini-2.5-flash-lite');
  assert.equal(route.modelMeta.role, 'fast');
});

// ---------------------------------------------------------------------------
// Fix 5: Integration — registry → routing → dispatch (end-to-end route resolution)
// ---------------------------------------------------------------------------

function registryIntegrationConfig(providers, overrides = {}) {
  return {
    _registryLookup: buildRegistryLookup(providers),
    llmModelExtract: 'gemini-2.5-flash',
    llmModelPlan: 'gemini-2.5-flash',
    llmModelValidate: 'gemini-2.5-flash',
    llmModelWrite: 'gemini-2.5-flash',
    ...overrides,
  };
}

test('integration — config with registry → resolveLlmRoute returns registry-resolved route', () => {
  const config = registryIntegrationConfig([geminiProvider()]);
  const route = resolveLlmRoute(config, { role: 'extract' });
  assert.equal(route.provider, 'openai-compatible');
  assert.equal(route.model, 'gemini-2.5-flash');
  assert.equal(route.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(route.apiKey, 'gem-key');
  assert.ok(route._registryEntry, 'route should carry registry entry');
  assert.equal(route._registryEntry.providerId, 'default-gemini');
});

test('integration — config with registry + modelOverride re-resolves override from registry', () => {
  const config = registryIntegrationConfig(
    [geminiProvider(), deepseekProvider()],
    { llmModelExtract: 'gemini-2.5-flash' },
  );
  const route = resolveLlmRoute(config, {
    role: 'extract',
    modelOverride: 'deepseek-chat',
  });
  assert.equal(route.model, 'deepseek-chat');
  assert.equal(route.baseUrl, 'https://api.deepseek.com');
  assert.equal(route.apiKey, 'ds-key');
  assert.ok(route._registryEntry);
  assert.equal(route._registryEntry.providerId, 'default-deepseek');
});

test('integration — config with empty registry infers provider from model name + bootstrap keys', () => {
  const config = {
    _registryLookup: buildRegistryLookup([]),
    llmApiKey: 'flat-key',
    llmModelPlan: 'gpt-4.1-mini',
  };
  const route = resolveLlmRoute(config, { role: 'extract' });
  assert.equal(route.provider, 'openai');
  assert.equal(route.model, 'gpt-4.1-mini');
  assert.equal(route.apiKey, 'flat-key');
  assert.equal(route.baseUrl, 'https://api.openai.com');
  assert.ok(!route._registryEntry, 'non-registry route should not have registry entry');
});

test('integration — resolveLlmFallbackRoute with registry returns registry-resolved fallback', () => {
  const config = registryIntegrationConfig(
    [geminiProvider(), deepseekProvider()],
    {
      llmModelPlan: 'gemini-2.5-flash',
      llmPlanFallbackModel: 'deepseek-chat',
    },
  );
  const fallback = resolveLlmFallbackRoute(config, { role: 'extract' });
  assert.ok(fallback, 'fallback should exist');
  assert.equal(fallback.provider, 'openai-compatible');
  assert.equal(fallback.model, 'deepseek-chat');
  assert.equal(fallback.baseUrl, 'https://api.deepseek.com');
  assert.equal(fallback.apiKey, 'ds-key');
  assert.ok(fallback._registryEntry, 'fallback should carry registry entry');
});
