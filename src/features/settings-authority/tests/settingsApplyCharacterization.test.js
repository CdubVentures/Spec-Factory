import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../../config.js';
import { applyRuntimeSettingsToConfig } from '../userSettingsService.js';
import {
  resolveLlmRoute,
  resolvePhaseModel,
  resolvePhaseReasoning,
} from '../../../core/llm/client/routing.js';

function makeProviderRegistryJson() {
  return JSON.stringify([{
    id: 'test-provider',
    name: 'Test',
    type: 'openai-compatible',
    baseUrl: 'https://test.example.com',
    apiKey: 'test-key-123',
    enabled: true,
    models: [
      { id: 'test-m1', modelId: 'test-model-alpha', role: 'primary', costInputPer1M: 1, costOutputPer1M: 2, costCachedPer1M: 0.1 },
      { id: 'test-m2', modelId: 'test-model-beta', role: 'reasoning', costInputPer1M: 3, costOutputPer1M: 6, costCachedPer1M: 0.3 },
    ],
  }]);
}

test('applyRuntimeSettingsToConfig applies sanitized runtime settings and ignores unknown keys', () => {
  const config = loadConfig();

  applyRuntimeSettingsToConfig(config, {
    domainClassifierUrlCap: '33',
    __unknownRuntimeKey__: 'drop-me',
  });

  assert.equal(config.domainClassifierUrlCap, 33);
  assert.equal(Object.hasOwn(config, '__unknownRuntimeKey__'), false);
});

test('applyRuntimeSettingsToConfig refreshes resolved phase models when phase overrides change', () => {
  const config = loadConfig();

  applyRuntimeSettingsToConfig(config, {
    llmPhaseOverridesJson: JSON.stringify({
      needset: { baseModel: 'gpt-5-low' },
      serpSelector: { useReasoning: true, reasoningModel: 'deepseek-reasoner' },
    }),
  });

  assert.equal(resolvePhaseModel(config, 'needset'), 'gpt-5-low');
  assert.equal(resolvePhaseReasoning(config, 'serpSelector'), true);
  assert.equal(resolvePhaseModel(config, 'serpSelector'), 'deepseek-reasoner');

  applyRuntimeSettingsToConfig(config, { llmPhaseOverridesJson: '{}' });

  assert.equal(resolvePhaseModel(config, 'needset'), config.llmModelPlan);
});

test('applyRuntimeSettingsToConfig refreshes resolved phase defaults when llmModelPlan changes', () => {
  const config = loadConfig();

  applyRuntimeSettingsToConfig(config, { llmModelPlan: 'gemini-2.5-flash' });

  assert.equal(resolvePhaseModel(config, 'needset'), 'gemini-2.5-flash');
  assert.equal(resolvePhaseModel(config, 'serpSelector'), 'gemini-2.5-flash');
  assert.equal(resolvePhaseModel(config, 'searchPlanner'), 'gemini-2.5-flash');
  assert.equal(resolvePhaseModel(config, 'brandResolver'), 'gemini-2.5-flash');
});

test('applyRuntimeSettingsToConfig rebuilds registry lookup when provider registry changes', () => {
  const config = loadConfig();

  applyRuntimeSettingsToConfig(config, {
    llmProviderRegistryJson: makeProviderRegistryJson(),
    llmModelPlan: 'test-model-alpha',
  });

  const route = resolveLlmRoute(config, { role: 'plan' });
  assert.equal(route.model, 'test-model-alpha');
  assert.equal(route.baseUrl, 'https://test.example.com');
  assert.equal(route.apiKey, 'test-key-123');
});

test('applyRuntimeSettingsToConfig bootstrap mode applies blank secrets from SQL (SQL is sole authority)', () => {
  const config = loadConfig({ geminiApiKey: 'gem-env-key' });

  applyRuntimeSettingsToConfig(config, {
    geminiApiKey: '',
  }, { mode: 'bootstrap' });

  assert.equal(config.geminiApiKey, '');
});

test('applyRuntimeSettingsToConfig bootstrap mode preserves the default provider registry when persisted registry is empty', () => {
  const config = loadConfig();
  const originalRegistry = config.llmProviderRegistryJson;

  assert.notEqual(originalRegistry, '[]');

  applyRuntimeSettingsToConfig(config, {
    llmProviderRegistryJson: '[]',
  }, { mode: 'bootstrap' });

  assert.equal(config.llmProviderRegistryJson, originalRegistry);
  assert.ok(config._registryLookup, 'registry lookup should remain populated');
});

test('applyRuntimeSettingsToConfig live mode still allows explicit secret clearing', () => {
  const config = loadConfig({ geminiApiKey: 'gem-env-key' });

  applyRuntimeSettingsToConfig(config, {
    geminiApiKey: '',
  });

  assert.equal(config.geminiApiKey, '');
});
