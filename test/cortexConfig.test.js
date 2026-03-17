import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

function withEnv(pairs, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(pairs)) {
    previous.set(key, process.env[key]);
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('loadConfig reads Phase 11 cortex environment settings', () => {
  withEnv({
    CORTEX_ENABLED: 'true',
    CHATMOCK_DIR: 'C:\\Users\\Chris\\Desktop\\ChatMock',
    CHATMOCK_COMPOSE_FILE: 'C:\\Users\\Chris\\Desktop\\ChatMock\\docker-compose.yml',
    CORTEX_BASE_URL: 'http://localhost:8000/v1',
    CORTEX_MODEL_FAST: 'gpt-5-low',
    CORTEX_MODEL_REASONING_DEEP: 'gpt-5-high',
    CORTEX_MAX_DEEP_FIELDS_PER_PRODUCT: '9'
  }, () => {
    const config = loadConfig();
    assert.equal(config.cortexEnabled, true);
    assert.equal(config.chatmockDir.endsWith('ChatMock'), true);
    assert.equal(config.cortexBaseUrl, 'http://localhost:8000/v1');
    assert.equal(config.cortexModelFast, 'gpt-5-low');
    assert.equal(config.cortexModelReasoningDeep, 'gpt-5-high');
    assert.equal(config.cortexMaxDeepFieldsPerProduct, 9);
  });
});

test('loadConfig reads role-based LLM routing settings and safe fast-model default', () => {
  withEnv({
    LLM_PROVIDER: 'deepseek',
    LLM_BASE_URL: 'https://api.deepseek.com',
    LLM_API_KEY: 'k-main',
    LLM_MODEL_EXTRACT: 'deepseek-reasoner',
    LLM_MODEL_PLAN: 'gemini-2.5-flash-lite',
    LLM_MODEL_FAST: null,
    LLM_MODEL_WRITE: 'gpt-5-low',
    LLM_PLAN_PROVIDER: 'openai',
    LLM_PLAN_BASE_URL: 'http://localhost:8000/v1',
    LLM_PLAN_API_KEY: 'key-plan',
    LLM_PLAN_FALLBACK_MODEL: 'deepseek-chat',
    LLM_PLAN_FALLBACK_PROVIDER: 'deepseek',
    LLM_PLAN_FALLBACK_BASE_URL: 'https://api.deepseek.com',
    LLM_PLAN_FALLBACK_API_KEY: 'k-fallback'
  }, () => {
    const config = loadConfig();
    assert.equal(config.llmModelFast, 'deepseek-reasoner');
    assert.equal(config.llmModelWrite, 'gpt-5-low');
    assert.equal(config.llmPlanProvider, 'openai');
    assert.equal(config.llmPlanBaseUrl, 'http://localhost:8000/v1');
    assert.equal(config.llmPlanApiKey, 'key-plan');
    assert.equal(config.llmPlanFallbackModel, 'deepseek-chat');
    assert.equal(config.llmPlanFallbackProvider, 'deepseek');
    assert.equal(config.llmPlanFallbackBaseUrl, 'https://api.deepseek.com');
    assert.equal(config.llmPlanFallbackApiKey, 'k-fallback');
  });
});

test('loadConfig resolves indexingCategoryAuthorityEnabled from default config', () => {
  const config = loadConfig();
  assert.equal(typeof config.indexingCategoryAuthorityEnabled, 'boolean');
});
