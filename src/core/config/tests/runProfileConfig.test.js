import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../../config.js';

test('loadConfig derives default model from registry SSOT, not API key presence', () => {
  const keys = [
    'OPENAI_API_KEY',
    'DEEPSEEK_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL_EXTRACT',
    'LLM_REASONING_MODE'
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
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
    // Per-provider keys still stored for bootstrapApiKey lookup
    assert.equal(cfg.deepseekApiKey, 'ds-test-key');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
});
