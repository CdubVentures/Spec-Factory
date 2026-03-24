import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../../config.js';
import { applyRuntimeSettingsToConfig } from '../userSettingsService.js';

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
    maxPagesPerDomain: '33',
    __unknownRuntimeKey__: 'drop-me',
  });

  assert.equal(config.maxPagesPerDomain, 33);
  assert.equal(Object.hasOwn(config, '__unknownRuntimeKey__'), false);
});

test('applyRuntimeSettingsToConfig refreshes resolved phase models when phase overrides change', () => {
  const config = loadConfig();

  applyRuntimeSettingsToConfig(config, {
    llmPhaseOverridesJson: JSON.stringify({
      needset: { baseModel: 'gpt-5-low' },
      extraction: { baseModel: 'deepseek-chat' },
      serpSelector: { useReasoning: true, reasoningModel: 'deepseek-reasoner' },
    }),
  });

  assert.equal(config._resolvedNeedsetBaseModel, 'gpt-5-low');
  assert.equal(config._resolvedExtractionBaseModel, 'deepseek-chat');
  assert.equal(config._resolvedSerpSelectorUseReasoning, true);
  assert.equal(config._resolvedSerpSelectorReasoningModel, 'deepseek-reasoner');

  applyRuntimeSettingsToConfig(config, { llmPhaseOverridesJson: '{}' });

  assert.equal(config._resolvedNeedsetBaseModel, config.llmModelPlan);
  assert.equal(config._resolvedExtractionBaseModel, config.llmModelPlan);
});

test('applyRuntimeSettingsToConfig refreshes resolved phase defaults when llmModelPlan changes', () => {
  const config = loadConfig();

  applyRuntimeSettingsToConfig(config, { llmModelPlan: 'gemini-2.5-flash' });

  assert.equal(config._resolvedNeedsetBaseModel, 'gemini-2.5-flash');
  assert.equal(config._resolvedSerpSelectorBaseModel, 'gemini-2.5-flash');
  assert.equal(config._resolvedSearchPlannerBaseModel, 'gemini-2.5-flash');
  assert.equal(config._resolvedBrandResolverBaseModel, 'gemini-2.5-flash');
});

test('applyRuntimeSettingsToConfig rebuilds registry lookup when provider registry changes', () => {
  const config = loadConfig();

  applyRuntimeSettingsToConfig(config, {
    llmProviderRegistryJson: makeProviderRegistryJson(),
  });

  assert.equal(config._registryLookup.modelIndex.size, 2);
  const alpha = config._registryLookup.modelIndex.get('test-model-alpha');
  assert.ok(alpha);
  assert.equal(alpha[0].baseUrl, 'https://test.example.com');
  assert.equal(alpha[0].apiKey, 'test-key-123');
});
