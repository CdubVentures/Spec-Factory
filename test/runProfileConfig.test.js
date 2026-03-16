import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('loadConfig uses DeepSeek fallback key and defaults when OPENAI_API_KEY is missing', () => {
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
    assert.equal(cfg.openaiApiKey, 'ds-test-key');
    assert.equal(cfg.llmBaseUrl, 'https://api.deepseek.com');
    assert.equal(cfg.openaiBaseUrl, 'https://api.deepseek.com');
    assert.equal(cfg.llmModelExtract, 'deepseek-reasoner');
    assert.equal(cfg.openaiModelExtract, 'deepseek-reasoner');
    assert.equal(cfg.llmModelPlan, 'deepseek-reasoner');
    assert.equal(cfg.openaiModelPlan, 'deepseek-reasoner');
    assert.equal(cfg.llmReasoningMode, true);
    assert.equal(cfg.llmProvider, 'deepseek');
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
