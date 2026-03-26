import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRegistryLookup,
  resolveModelFromRegistry,
} from '../routeResolver.js';
import {
  anthropicProvider,
  cortexProvider,
  fullRegistry,
  geminiProvider,
  twoProviderRegistry,
} from './fixtures/routeResolverFixtures.js';

test('resolveModelFromRegistry resolves composite keys and returns null on misses', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());

  const geminiRoute = resolveModelFromRegistry(lookup, 'default-gemini:gemini-2.5-flash');
  assert.equal(geminiRoute.providerId, 'default-gemini');
  assert.equal(geminiRoute.providerName, 'Google Gemini');
  assert.equal(geminiRoute.providerType, 'openai-compatible');
  assert.equal(geminiRoute.modelId, 'gemini-2.5-flash');
  assert.equal(geminiRoute.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(geminiRoute.apiKey, 'gem-key');

  const deepseekRoute = resolveModelFromRegistry(lookup, 'default-deepseek:deepseek-chat');
  assert.equal(deepseekRoute.providerId, 'default-deepseek');
  assert.equal(deepseekRoute.modelId, 'deepseek-chat');
  assert.equal(deepseekRoute.apiKey, 'ds-key');

  assert.equal(resolveModelFromRegistry(lookup, 'nonexistent:gemini-2.5-flash'), null);
});

test('resolveModelFromRegistry resolves bare keys to the first route and returns null for unknown models', () => {
  const lookup = buildRegistryLookup(twoProviderRegistry());
  const route = resolveModelFromRegistry(lookup, 'gemini-2.5-flash');
  assert.equal(route.providerId, 'default-gemini');
  assert.equal(route.modelId, 'gemini-2.5-flash');

  // When multiple providers have the same modelId, first in registry order wins
  const multiLookup = buildRegistryLookup([
    geminiProvider(),
    {
      id: 'alt-gemini',
      name: 'Alt Gemini',
      type: 'openai-compatible',
      baseUrl: 'https://alt.example.com',
      apiKey: 'alt-key',
      models: [{
        id: 'alt-flash',
        modelId: 'gemini-2.5-flash',
        role: 'primary',
        costInputPer1M: 0.1,
        costOutputPer1M: 0.4,
        costCachedPer1M: 0.02,
        maxContextTokens: 1048576,
        maxOutputTokens: 65536,
      }],
    },
  ]);
  const firstWins = resolveModelFromRegistry(multiLookup, 'gemini-2.5-flash');
  assert.equal(firstWins.providerId, 'default-gemini');
  // Composite key targets the specific provider
  const altRoute = resolveModelFromRegistry(multiLookup, 'alt-gemini:gemini-2.5-flash');
  assert.equal(altRoute.providerId, 'alt-gemini');

  assert.equal(resolveModelFromRegistry(lookup, 'gpt-99-turbo'), null);
});

test('resolveModelFromRegistry preserves provider type model metadata costs and token profiles', () => {
  const lookup = buildRegistryLookup(fullRegistry());

  const openaiCompatible = resolveModelFromRegistry(lookup, 'gemini-2.5-flash');
  assert.equal(openaiCompatible.providerType, 'openai-compatible');
  assert.deepEqual(openaiCompatible.costs, {
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    cachedPer1M: 0.04,
  });
  assert.deepEqual(openaiCompatible.tokenProfile, {
    maxContextTokens: 1048576,
    maxOutputTokens: 65536,
  });
  assert.equal(openaiCompatible.modelMeta.tier, undefined);
  assert.equal(openaiCompatible.modelMeta.transport, undefined);

  const anthropic = resolveModelFromRegistry(lookup, 'claude-sonnet-4-6');
  assert.equal(anthropic.providerType, 'anthropic');

  const cortex = resolveModelFromRegistry(lookup, 'local-llmlab:gpt-5-low');
  assert.equal(cortex.providerType, 'cortex');
  assert.equal(cortex.modelMeta.tier, 'fast');
  assert.equal(cortex.modelMeta.transport, 'sync');
  assert.equal(cortex.modelMeta.role, 'fast');
});

test('resolveModelFromRegistry returns null for missing lookups or empty keys and defaults provider type when missing', () => {
  assert.equal(resolveModelFromRegistry(null, 'gemini-2.5-flash'), null);
  assert.equal(resolveModelFromRegistry(undefined, 'gemini-2.5-flash'), null);

  const lookup = buildRegistryLookup(twoProviderRegistry());
  for (const key of ['', null, '   ']) {
    assert.equal(resolveModelFromRegistry(lookup, key), null);
  }

  const noTypeLookup = buildRegistryLookup([{
    id: 'no-type',
    name: 'No Type',
    baseUrl: 'https://example.com',
    apiKey: 'key',
    enabled: true,
    models: [{
      id: 'nt-1',
      modelId: 'test-model',
      role: 'primary',
      costInputPer1M: 0,
      costOutputPer1M: 0,
      costCachedPer1M: 0,
      maxContextTokens: 8192,
      maxOutputTokens: 4096,
    }],
  }]);
  const noTypeRoute = resolveModelFromRegistry(noTypeLookup, 'test-model');
  assert.equal(noTypeRoute.providerType, 'openai-compatible');
});
