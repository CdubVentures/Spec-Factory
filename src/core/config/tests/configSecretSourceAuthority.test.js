import test from 'node:test';
import assert from 'node:assert/strict';
import { withSavedEnv } from './helpers/configTestHarness.js';
import { hasExplicitSettingEnv } from '../settingsClassification.js';
import { assembleConfigFromRegistry } from '../configAssembly.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../../../shared/settingsRegistry.js';
import { createManifestApplicator, buildRawConfig } from '../configBuilder.js';

// ── Step 1: DEEPSEEK_API_KEY must not trigger provider inference ─────────────

test('DEEPSEEK_API_KEY alone does not trigger explicit provider env', () => {
  const envKeys = [
    'DEEPSEEK_API_KEY',
    'LLM_PROVIDER', 'LLM_BASE_URL', 'OPENAI_BASE_URL',
    'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT',
    'LLM_MODEL_PLAN', 'OPENAI_MODEL_PLAN',
    'LLM_MODEL_REASONING',
  ];

  return withSavedEnv(envKeys, () => {
    for (const key of envKeys) delete process.env[key];
    process.env.DEEPSEEK_API_KEY = 'dk-test-123';

    // Build explicitEnvKeys the same way configBuilder does:
    // only keys present and non-empty in process.env
    const explicitEnvKeys = new Set(
      Object.entries(process.env)
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
        .map(([k]) => k)
    );

    assert.equal(
      hasExplicitSettingEnv('llmProvider', 'llmProvider', explicitEnvKeys),
      false,
      'DEEPSEEK_API_KEY should not count as explicit provider env',
    );
    assert.equal(
      hasExplicitSettingEnv('llmBaseUrl', 'llmBaseUrl', explicitEnvKeys),
      false,
      'DEEPSEEK_API_KEY should not count as explicit baseUrl env',
    );
    assert.equal(
      hasExplicitSettingEnv('llmModelPlan', 'llmModelPlan', explicitEnvKeys),
      false,
      'DEEPSEEK_API_KEY should not count as explicit modelPlan env',
    );
    assert.equal(
      hasExplicitSettingEnv('llmModelReasoning', 'llmModelReasoning', explicitEnvKeys),
      false,
      'DEEPSEEK_API_KEY should not count as explicit modelReasoning env',
    );
  });
});

// ── Step 2: Generic assembly skips secret registry entries ───────────────────

test('assembleConfigFromRegistry ignores env for secret entries', () => {
  const envKeys = ['GOOGLE_SEARCH_PROXY_URLS_JSON', 'CRAWLEE_PROXY_URLS_JSON', 'BRAVE_API_KEY'];

  return withSavedEnv(envKeys, () => {
    process.env.GOOGLE_SEARCH_PROXY_URLS_JSON = '["http://proxy:8080"]';
    process.env.CRAWLEE_PROXY_URLS_JSON = '["http://proxy:9090"]';
    process.env.BRAVE_API_KEY = 'brave-test-key';

    const cfg = assembleConfigFromRegistry(RUNTIME_SETTINGS_REGISTRY);

    assert.equal(cfg.googleSearchProxyUrlsJson, '',
      'google proxy should be registry default, not env');
    assert.equal(cfg.crawleeProxyUrlsJson, '',
      'crawlee proxy should be registry default, not env');
    assert.equal(cfg.braveApiKey, '',
      'brave API key should be registry default, not env');
  });
});

// ── Step 3: buildRawConfig ignores env for API keys ──────────────────────────

test('buildRawConfig produces empty string for API keys even when env is set', () => {
  const envKeys = [
    'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY', 'SERPER_API_KEY',
  ];

  return withSavedEnv(envKeys, () => {
    process.env.GEMINI_API_KEY = 'gem-test';
    process.env.ANTHROPIC_API_KEY = 'ant-test';
    process.env.DEEPSEEK_API_KEY = 'ds-test';
    process.env.OPENAI_API_KEY = 'oai-test';
    process.env.SERPER_API_KEY = 'serp-test';

    const manifestApplicator = createManifestApplicator({});
    const { cfg } = buildRawConfig({ manifestApplicator });

    assert.equal(cfg.geminiApiKey, '', 'gemini key should not come from env');
    assert.equal(cfg.anthropicApiKey, '', 'anthropic key should not come from env');
    assert.equal(cfg.deepseekApiKey, '', 'deepseek key should not come from env');
    assert.equal(cfg.openaiApiKey, '', 'openai key should not come from env');
    assert.equal(cfg.serperApiKey, '', 'serper key should not come from env');
  });
});
