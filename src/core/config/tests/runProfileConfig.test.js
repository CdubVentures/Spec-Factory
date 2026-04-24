import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../../config.js';
import { withSavedEnv } from './helpers/configTestHarness.js';

test('loadConfig derives default model from registry SSOT, not API key presence', () => {
  const keys = [
    'OPENAI_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL_EXTRACT',
    'LLM_REASONING_MODE',
  ];

  return withSavedEnv(keys, () => {
    delete process.env.OPENAI_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'ds-test-key';
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL_EXTRACT;
    delete process.env.LLM_REASONING_MODE;

    const cfg = loadConfig({});
    // WHY: Registry SSOT (settingsDefaults.llmProviderRegistryJson) determines
    // the default model, not which API keys are present. Gemini is the first
    // enabled primary-role entry in the default registry.
    assert.equal(cfg.llmModelPlan, 'gemini-2.5-flash');
    assert.equal(cfg.llmProvider, 'gemini');
    assert.equal(cfg.llmReasoningMode, true);
    // WHY: API keys are no longer read from env — SQL is sole authority.
    assert.equal(cfg.deepseekApiKey, '');
  });
});

test('loadConfig does not read OPENAI_API_KEY from env (SQL is sole authority)', () => {
  const keys = ['OPENAI_API_KEY'];

  return withSavedEnv(keys, () => {
    process.env.OPENAI_API_KEY = 'openai-test-key';

    const cfg = loadConfig({});
    assert.equal(cfg.openaiApiKey, '');
  });
});

test('loadConfig default provider registry carries OpenAI API model pricing in the model entry', () => {
  const cfg = loadConfig({});
  const registry = JSON.parse(cfg.llmProviderRegistryJson);
  const openai = registry.find((provider) => provider.id === 'default-openai');
  assert.ok(openai);
  const gpt55 = openai.models.find((model) => model.modelId === 'gpt-5.5');
  assert.ok(gpt55);
  assert.equal(gpt55.costInputPer1M, 5);
  assert.equal(gpt55.costOutputPer1M, 30);
  assert.equal(gpt55.costCachedPer1M, 0.5);
  assert.deepEqual(gpt55.thinkingEffortOptions, ['low', 'medium', 'high', 'xhigh']);
  assert.equal(gpt55.webSearch, true);
  const gpt54 = openai.models.find((model) => model.modelId === 'gpt-5.4');
  assert.ok(gpt54);
  assert.equal(gpt54.costInputPer1M, 2.5);
  assert.equal(gpt54.costOutputPer1M, 15);
  assert.equal(gpt54.costCachedPer1M, 0.25);
  const gpt54Mini = openai.models.find((model) => model.modelId === 'gpt-5.4-mini');
  assert.ok(gpt54Mini);
  assert.equal(gpt54Mini.costInputPer1M, 0.75);
  assert.equal(gpt54Mini.costOutputPer1M, 4.5);
  assert.equal(gpt54Mini.costCachedPer1M, 0.075);
});

test('loadConfig refreshes stale default API model pricing from the registry SSOT', () => {
  const staleRegistry = [{
    id: 'default-openai',
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'saved-key',
    models: [{
      id: 'default-openai-gpt54',
      modelId: 'gpt-5.4',
      role: 'reasoning',
      costInputPer1M: 2.5,
      costOutputPer1M: 15,
      costCachedPer1M: 1.25,
      maxContextTokens: 1050000,
      maxOutputTokens: 128000,
    }],
  }];
  const cfg = loadConfig({ llmProviderRegistryJson: JSON.stringify(staleRegistry) });
  const registry = JSON.parse(cfg.llmProviderRegistryJson);
  const openai = registry.find((provider) => provider.id === 'default-openai');
  assert.ok(openai);
  assert.equal(openai.apiKey, 'saved-key');
  const gpt54 = openai.models.find((model) => model.modelId === 'gpt-5.4');
  assert.ok(gpt54);
  assert.equal(gpt54.costCachedPer1M, 0.25);
  assert.equal(gpt54.thinking, true);
  const gpt55 = openai.models.find((model) => model.modelId === 'gpt-5.5');
  assert.ok(gpt55);
  assert.equal(gpt55.costInputPer1M, 5);
});

test('loadConfig prunes stale default API models that are no longer in the registry SSOT', () => {
  const staleRegistry = [{
    id: 'default-openai',
    name: 'OpenAI',
    type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'saved-key',
    models: [{
      id: 'default-openai-gpt-5-2-pro',
      modelId: 'gpt-5.2-pro',
      role: 'reasoning',
      costInputPer1M: 21,
      costOutputPer1M: 168,
      costCachedPer1M: 2.1,
      maxContextTokens: 400000,
      maxOutputTokens: 128000,
    }],
  }];
  const cfg = loadConfig({ llmProviderRegistryJson: JSON.stringify(staleRegistry) });
  const registry = JSON.parse(cfg.llmProviderRegistryJson);
  const openai = registry.find((provider) => provider.id === 'default-openai');
  assert.ok(openai);
  assert.equal(openai.apiKey, 'saved-key');
  assert.equal(openai.models.some((model) => model.modelId === 'gpt-5.2-pro'), false);
  assert.ok(openai.models.find((model) => model.modelId === 'gpt-5.5'));
});
