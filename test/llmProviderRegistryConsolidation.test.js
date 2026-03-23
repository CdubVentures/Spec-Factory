import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLlmProvider } from '../src/core/llm/providers/index.js';
import { resolveLlmRoute } from '../src/core/llm/client/routing.js';
import { buildRegistryLookup } from '../src/core/llm/routeResolver.js';
import { KNOWN_PROVIDERS, normalizeProvider } from '../src/core/llm/providerMeta.js';

// ---------------------------------------------------------------------------
// Phase 1a: Characterization — lock down current selectLlmProvider behavior
// ---------------------------------------------------------------------------

test('selectLlmProvider returns openai for empty/null/undefined input', () => {
  for (const input of ['', null, undefined]) {
    const result = selectLlmProvider(input);
    assert.equal(result.name, 'openai', `input=${JSON.stringify(input)}`);
    assert.equal(typeof result.request, 'function');
  }
});

test('selectLlmProvider returns openai for unknown provider strings', () => {
  for (const input of ['unknown', 'foo', 'cortex', 'OPENAI']) {
    const result = selectLlmProvider(input);
    assert.equal(result.name, 'openai', `input=${JSON.stringify(input)} should default to openai`);
    assert.equal(typeof result.request, 'function');
  }
});

test('selectLlmProvider returns anthropic for anthropic type', () => {
  const result = selectLlmProvider('anthropic');
  assert.equal(result.name, 'anthropic');
  assert.equal(typeof result.request, 'function');
});

test('selectLlmProvider returns deepseek for deepseek token', () => {
  const result = selectLlmProvider('deepseek');
  assert.equal(result.name, 'deepseek');
  assert.equal(typeof result.request, 'function');
});

test('selectLlmProvider returns gemini for gemini token', () => {
  const result = selectLlmProvider('gemini');
  assert.equal(result.name, 'gemini');
  assert.equal(typeof result.request, 'function');
});

test('selectLlmProvider returns chatmock for chatmock token', () => {
  const result = selectLlmProvider('chatmock');
  assert.equal(result.name, 'chatmock');
  assert.equal(typeof result.request, 'function');
});

test('selectLlmProvider is case-insensitive', () => {
  assert.equal(selectLlmProvider('DEEPSEEK').name, 'deepseek');
  assert.equal(selectLlmProvider('Gemini').name, 'gemini');
  assert.equal(selectLlmProvider('ChatMock').name, 'chatmock');
});

test('selectLlmProvider trims whitespace', () => {
  assert.equal(selectLlmProvider('  deepseek  ').name, 'deepseek');
  assert.equal(selectLlmProvider(' gemini ').name, 'gemini');
});

// ---------------------------------------------------------------------------
// Phase 1b: Dispatch table — registry type tokens must dispatch correctly
// ---------------------------------------------------------------------------

test('selectLlmProvider dispatches openai-compatible type to openai', () => {
  const result = selectLlmProvider('openai-compatible');
  assert.equal(result.name, 'openai');
  assert.equal(typeof result.request, 'function');
});

test('selectLlmProvider returns named provider for known tokens via dispatch table', () => {
  const cases = [
    ['openai', 'openai'],
    ['deepseek', 'deepseek'],
    ['gemini', 'gemini'],
    ['chatmock', 'chatmock'],
    ['openai-compatible', 'openai'],
  ];
  for (const [input, expectedName] of cases) {
    const result = selectLlmProvider(input);
    assert.equal(result.name, expectedName, `selectLlmProvider('${input}').name should be '${expectedName}'`);
    assert.equal(typeof result.request, 'function');
  }
});

// ---------------------------------------------------------------------------
// Phase 1: Route integration — registry provider type flows through routing
// ---------------------------------------------------------------------------

function registryConfig(registryProviders, overrides = {}) {
  return {
    _registryLookup: buildRegistryLookup(registryProviders),
    llmModelPlan: 'gemini-2.5-flash',
    ...overrides,
  };
}

test('registry provider type flows through resolveLlmRoute unchanged', () => {
  const proxyProvider = {
    id: 'corp-proxy',
    name: 'Corporate Proxy',
    type: 'openai-compatible',
    baseUrl: 'https://my-proxy.corp.com',
    apiKey: 'proxy-secret',
    enabled: true,
    models: [
      { id: 'proxy-flash', modelId: 'gemini-2.5-flash', role: 'primary',
        costInputPer1M: 0.15, costOutputPer1M: 0.60, costCachedPer1M: 0.04,
        maxContextTokens: 1048576, maxOutputTokens: 65536 },
    ],
  };
  const config = registryConfig([proxyProvider]);
  const route = resolveLlmRoute(config, { role: 'extract' });
  assert.equal(route.provider, 'openai-compatible');
  assert.equal(route.baseUrl, 'https://my-proxy.corp.com');
});

test('adding a new provider to the registry dispatches without code changes', () => {
  const customProvider = {
    id: 'custom-llm',
    name: 'Custom LLM Service',
    type: 'openai-compatible',
    baseUrl: 'https://custom-llm.example.com',
    apiKey: 'custom-key',
    enabled: true,
    models: [
      { id: 'custom-model-1', modelId: 'custom-v1', role: 'primary',
        costInputPer1M: 0.10, costOutputPer1M: 0.30, costCachedPer1M: 0.02,
        maxContextTokens: 32768, maxOutputTokens: 8192 },
    ],
  };
  const config = registryConfig([customProvider], {
    llmModelPlan: 'custom-v1',
  });
  const route = resolveLlmRoute(config, { role: 'plan' });
  assert.equal(route.provider, 'openai-compatible');
  assert.equal(route.model, 'custom-v1');
  assert.equal(route.baseUrl, 'https://custom-llm.example.com');
  assert.equal(route.apiKey, 'custom-key');

  // The provider dispatch should handle this type without code changes
  const providerClient = selectLlmProvider(route.provider);
  assert.equal(providerClient.name, 'openai');
  assert.equal(typeof providerClient.request, 'function');
});

test('non-registry route still infers provider from model name', () => {
  const config = {
    llmModelPlan: 'deepseek-chat',
    deepseekApiKey: 'ds-key',
  };
  const route = resolveLlmRoute(config, { role: 'plan' });
  assert.equal(route.provider, 'deepseek');
  assert.equal(route.apiKey, 'ds-key');

  const providerClient = selectLlmProvider(route.provider);
  assert.equal(providerClient.name, 'deepseek');
});

// ---------------------------------------------------------------------------
// SSOT contract: PROVIDER_DISPATCH derives from KNOWN_PROVIDERS
// ---------------------------------------------------------------------------

test('PROVIDER_DISPATCH covers all KNOWN_PROVIDERS', () => {
  for (const name of KNOWN_PROVIDERS) {
    const result = selectLlmProvider(name);
    assert.equal(result.name, name,
      `PROVIDER_DISPATCH missing entry for "${name}"`);
    assert.equal(typeof result.request, 'function');
  }
});

test('normalizeProvider returns canonical name for known providers', () => {
  for (const name of KNOWN_PROVIDERS) {
    assert.equal(normalizeProvider(name), name);
    assert.equal(normalizeProvider(name.toUpperCase()), name);
  }
});

test('normalizeProvider returns empty string for unknown providers', () => {
  assert.equal(normalizeProvider('unknown'), '');
  assert.equal(normalizeProvider(''), '');
  assert.equal(normalizeProvider(null), '');
});
