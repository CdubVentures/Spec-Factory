import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadConfig, loadDotEnvFile } from '../src/config.js';
import {
  CONVERGENCE_SETTINGS_KEYS,
  RUNTIME_SETTINGS_KEYS,
  RUNTIME_SETTINGS_ROUTE_GET,
} from '../src/api/services/settingsContract.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';

const SECRET_RUNTIME_KEYS = new Set([
  'bingSearchKey',
  'googleCseKey',
  'llmPlanApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'cortexApiKey',
  'eloSupabaseAnonKey',
]);

function buildRuntimeConfigKeyMap() {
  const pairs = [
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.floatMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap),
  ];
  return new Map(pairs);
}

function readEnvKeysFromFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  for (const row of text.split(/\r?\n/g)) {
    const token = String(row || '').trim();
    if (!token || token.startsWith('#')) continue;
    const separator = token.indexOf('=');
    if (separator <= 0) continue;
    keys.add(token.slice(0, separator));
  }
  return keys;
}

function buildConfigKeyToEnvKeyMap() {
  const text = fs.readFileSync('src/config.js', 'utf8');
  const map = new Map();
  for (const row of text.split(/\r?\n/g)) {
    const keyMatch = row.match(/^\s*([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const configKey = keyMatch[1];
    const rhs = keyMatch[2];
    const envMatch =
      rhs.match(/parse(?:Int|Float|Bool|Json)Env\(\s*'([A-Z0-9_]+)'/) ||
      rhs.match(/process\.env\.([A-Z0-9_]+)/) ||
      rhs.match(/process\.env\[['"]([A-Z0-9_]+)['"]\]/);
    if (!envMatch) continue;
    if (!map.has(configKey)) {
      map.set(configKey, envMatch[1]);
    }
  }
  return map;
}

function resolveManualEnvKey(configKey) {
  const manual = Object.freeze({
    llmModelTriage: 'LLM_MODEL_TRIAGE',
    llmModelFast: 'LLM_MODEL_FAST',
    llmModelReasoning: 'LLM_MODEL_REASONING',
    llmModelValidate: 'LLM_MODEL_VALIDATE',
    llmModelWrite: 'LLM_MODEL_WRITE',
    llmTimeoutMs: 'LLM_TIMEOUT_MS',
    llmBaseUrl: 'LLM_BASE_URL',
    openaiApiKey: 'LLM_API_KEY',
    outputMode: 'OUTPUT_MODE',
    userAgent: 'USER_AGENT',
    maxCandidateUrls: 'MAX_CANDIDATE_URLS_PER_PRODUCT',
    searchProfileCapMapJson: 'SEARCH_PROFILE_CAP_MAP_JSON',
    serpRerankerWeightMapJson: 'SERP_RERANKER_WEIGHT_MAP_JSON',
    dynamicFetchPolicyMap: 'DYNAMIC_FETCH_POLICY_MAP_JSON',
    dynamicFetchPolicyMapJson: 'DYNAMIC_FETCH_POLICY_MAP_JSON',
    articleExtractorDomainPolicyMapJson: 'ARTICLE_EXTRACTOR_DOMAIN_POLICY_MAP_JSON',
    retrievalInternalsMapJson: 'RETRIEVAL_INTERNALS_MAP_JSON',
    evidencePackLimitsMapJson: 'EVIDENCE_PACK_LIMITS_MAP_JSON',
    identityGateThresholdBoundsMapJson: 'IDENTITY_GATE_THRESHOLD_BOUNDS_MAP_JSON',
    parsingConfidenceBaseMapJson: 'PARSING_CONFIDENCE_BASE_MAP_JSON',
    fetchSchedulerInternalsMapJson: 'FETCH_SCHEDULER_INTERNALS_MAP_JSON',
    visualAssetHeroSelectorMapJson: 'VISUAL_ASSET_HERO_SELECTOR_MAP_JSON',
    automationQueueStorageEngine: 'AUTOMATION_QUEUE_STORAGE_ENGINE',
    capturePageScreenshotSelectors: 'CAPTURE_PAGE_SCREENSHOT_SELECTORS',
  });
  return manual[configKey] || null;
}

test('pipeline defaults are sourced from .env-backed config', () => {
  loadDotEnvFile('.env');
  const config = loadConfig();
  const runtimeConfigKeyMap = buildRuntimeConfigKeyMap();

  for (const key of CONVERGENCE_SETTINGS_KEYS) {
    assert.equal(
      SETTINGS_DEFAULTS.convergence[key],
      config[key],
      `convergence default "${key}" should match config.${key}`,
    );
  }

  for (const key of RUNTIME_SETTINGS_KEYS) {
    if (SECRET_RUNTIME_KEYS.has(key)) continue;
    const configKey = runtimeConfigKeyMap.get(key) || key;
    assert.equal(
      Object.hasOwn(config, configKey),
      true,
      `runtime default "${key}" should map to config.${configKey}`,
    );
    assert.deepEqual(
      SETTINGS_DEFAULTS.runtime[key],
      config[configKey],
      `runtime default "${key}" should match config.${configKey}`,
    );
  }
});

test('pipeline runtime/convergence defaults are explicitly declared in .env', () => {
  const runtimeConfigKeyMap = buildRuntimeConfigKeyMap();
  const configKeyToEnvKey = buildConfigKeyToEnvKeyMap();
  const envKeys = readEnvKeysFromFile('.env');

  for (const key of CONVERGENCE_SETTINGS_KEYS) {
    const envKey = configKeyToEnvKey.get(key) || resolveManualEnvKey(key);
    assert.equal(envKey !== null, true, `convergence key "${key}" should resolve to an env variable`);
    assert.equal(envKeys.has(envKey), true, `convergence key "${key}" should be declared in .env via ${envKey}`);
  }

  for (const key of RUNTIME_SETTINGS_KEYS) {
    if (SECRET_RUNTIME_KEYS.has(key)) continue;
    const configKey = runtimeConfigKeyMap.get(key) || key;
    const envKey = configKeyToEnvKey.get(configKey) || resolveManualEnvKey(configKey);
    assert.equal(envKey !== null, true, `runtime key "${key}" should resolve to an env variable`);
    assert.equal(envKeys.has(envKey), true, `runtime key "${key}" should be declared in .env via ${envKey}`);
  }
});
