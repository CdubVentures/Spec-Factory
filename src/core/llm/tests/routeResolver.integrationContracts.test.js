import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveLlmFallbackRoute,
  resolveLlmRoute,
} from '../client/routing.js';
import {
  deepseekProvider,
  geminiProvider,
  registryIntegrationConfig,
} from './fixtures/routeResolverFixtures.js';

test('resolveLlmRoute returns a registry-resolved primary route', () => {
  const config = registryIntegrationConfig([geminiProvider()]);
  const route = resolveLlmRoute(config, { role: 'extract' });

  assert.equal(route.provider, 'openai-compatible');
  assert.equal(route.model, 'gemini-2.5-flash');
  assert.equal(route.baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assert.equal(route.apiKey, 'gem-key');
  assert.ok(route._registryEntry);
  assert.equal(route._registryEntry.providerId, 'default-gemini');
});

test('resolveLlmRoute re-resolves model overrides through the registry', () => {
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

test('resolveLlmRoute infers provider metadata when the registry is empty', () => {
  const config = {
    _registryLookup: { providers: new Map(), modelIndex: new Map(), compositeIndex: new Map() },
    llmApiKey: 'flat-key',
    llmModelPlan: 'gpt-4.1-mini',
  };
  const route = resolveLlmRoute(config, { role: 'extract' });

  assert.equal(route.provider, 'openai');
  assert.equal(route.model, 'gpt-4.1-mini');
  assert.equal(route.apiKey, 'flat-key');
  assert.equal(route.baseUrl, 'https://api.openai.com');
  assert.ok(!route._registryEntry);
});

test('resolveLlmFallbackRoute returns a distinct registry-resolved fallback route', () => {
  const config = registryIntegrationConfig(
    [geminiProvider(), deepseekProvider()],
    {
      llmModelPlan: 'gemini-2.5-flash',
      llmPlanFallbackModel: 'deepseek-chat',
    },
  );
  const fallback = resolveLlmFallbackRoute(config, { role: 'extract' });

  assert.ok(fallback);
  assert.equal(fallback.provider, 'openai-compatible');
  assert.equal(fallback.model, 'deepseek-chat');
  assert.equal(fallback.baseUrl, 'https://api.deepseek.com');
  assert.equal(fallback.apiKey, 'ds-key');
  assert.ok(fallback._registryEntry);
});
