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
