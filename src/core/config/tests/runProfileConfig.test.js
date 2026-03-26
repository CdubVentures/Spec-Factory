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
    assert.equal(cfg.deepseekApiKey, 'ds-test-key');
  });
});
