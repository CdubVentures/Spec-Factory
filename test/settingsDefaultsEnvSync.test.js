import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadConfig } from '../src/config.js';
import { CONFIG_MANIFEST_DEFAULTS, CONFIG_MANIFEST_KEYS } from '../src/core/config/manifest.js';
import {
  CONVERGENCE_SETTINGS_KEYS,
  RUNTIME_SETTINGS_KEYS,
  RUNTIME_SETTINGS_ROUTE_GET,
} from '../src/features/settings-authority/settingsContract.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';

const SECRET_RUNTIME_KEYS = new Set([
  'llmPlanApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'cortexApiKey',
  'eloSupabaseAnonKey',
]);
const NON_CANONICAL_RUNTIME_KEYS = new Set([
  'localOutputRoot',
]);
const CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS = new Set([
  'fetchConcurrency',
  'perHostMinDelayMs',
  'fetchPerHostConcurrencyCap',
  'discoveryEnabled',
  'discoveryMaxDiscovered',
  'llmExtractMaxSnippetsPerBatch',
  'llmMaxCallsPerProductTotal',
  'fetchSchedulerEnabled',
  'fetchSchedulerInternalsMapJson',
  'dynamicFetchRetryBudget',
  'dynamicFetchRetryBackoffMs',
  'frontierBlockedDomainThreshold',
  'serpRerankerWeightMapJson',
  'pageGotoTimeoutMs',
  'pageNetworkIdleTimeoutMs',
  'postLoadWaitMs',
  'runtimeScreencastEnabled',
  'runtimeScreencastFps',
  'runtimeScreencastQuality',
  'runtimeScreencastMaxWidth',
  'runtimeScreencastMaxHeight',
  'userAgent',
]);
// WHY: NeedSet scoring knobs (requiredWeightMap, multipliers, identity thresholds)
// were removed in Phase 12 NeedSet Legacy Removal. No runtime defaults needed.
const REQUIRED_NEEDSET_RUNTIME_DEFAULT_KEYS = [];

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

function isSecretEnvKey(key) {
  return (
    /(API_KEY|SECRET|TOKEN|ACCESS_KEY_ID|SECRET_ACCESS_KEY|ANON_KEY)$/.test(key)
    || key === 'BING_SEARCH_KEY'
  );
}

const MANUAL_ENV_KEY_MAP = Object.freeze({
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
  fetchSchedulerInternalsMapJson: 'FETCH_SCHEDULER_INTERNALS_MAP_JSON',
  automationQueueStorageEngine: 'AUTOMATION_QUEUE_STORAGE_ENGINE',
  capturePageScreenshotSelectors: 'CAPTURE_PAGE_SCREENSHOT_SELECTORS',
  categoryAuthorityRoot: 'HELPER_FILES_ROOT',
});

function resolveManualEnvKey(configKey) {
  return MANUAL_ENV_KEY_MAP[configKey] || null;
}

function buildKnownConfigEnvKeys() {
  return [
    ...new Set([
      ...Object.keys(CONFIG_MANIFEST_DEFAULTS || {}),
      ...Object.values(MANUAL_ENV_KEY_MAP),
    ]),
  ];
}

function withUnsetEnv(keys, fn) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) {
      delete process.env[key];
    }
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('convergence defaults and canonical runtime defaults are sourced from shared settings defaults', () => {
  const runtimeConfigKeyMap = buildRuntimeConfigKeyMap();
  withUnsetEnv(buildKnownConfigEnvKeys(), () => {
    const config = loadConfig({ runProfile: 'standard' });

    for (const key of CONVERGENCE_SETTINGS_KEYS) {
      assert.equal(
        SETTINGS_DEFAULTS.convergence[key],
        config[key],
        `convergence default "${key}" should match config.${key}`,
      );
    }

    for (const key of CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS) {
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
});

test('shared runtime defaults are the single default owner when env is not explicit', () => {
  const runtimeConfigKeyMap = buildRuntimeConfigKeyMap();
  const canonicalRuntimeKeys = Object.keys(SETTINGS_DEFAULTS.runtime).filter((key) => (
    !SECRET_RUNTIME_KEYS.has(key)
    && !NON_CANONICAL_RUNTIME_KEYS.has(key)
  ));

  withUnsetEnv(buildKnownConfigEnvKeys(), () => {
    const config = loadConfig({ runProfile: 'standard' });

    for (const key of canonicalRuntimeKeys) {
      const configKey = runtimeConfigKeyMap.get(key) || key;
      if (!Object.hasOwn(config, configKey)) continue;
      assert.deepEqual(
        config[configKey],
        SETTINGS_DEFAULTS.runtime[key],
        `runtime default "${key}" should resolve from settingsDefaults.js via config.${configKey}`,
      );
    }
  });
});

test('needset runtime scoring knobs were retired in Phase 12 Legacy Removal', () => {
  // WHY: All NeedSet scoring/weight knobs were removed. This test confirms they stay absent.
  const runtimeDefaults = SETTINGS_DEFAULTS.runtime || {};
  const retiredKeys = [
    'needsetRequiredWeightIdentity',
    'needsetRequiredWeightCritical',
    'needsetRequiredWeightRequired',
    'needsetRequiredWeightExpected',
    'needsetRequiredWeightOptional',
    'needsetMissingMultiplier',
    'needsetTierDeficitMultiplier',
    'needsetMinRefsDeficitMultiplier',
    'needsetConflictMultiplier',
    'needsetIdentityLockThreshold',
    'needsetIdentityProvisionalThreshold',
    'needsetDefaultIdentityAuditLimit',
  ];
  for (const key of retiredKeys) {
    assert.equal(
      Object.hasOwn(runtimeDefaults, key),
      false,
      `retired needset knob '${key}' should be absent from runtime defaults`,
    );
  }
});

test('hotfix-sensitive runtime defaults stay aligned across shared defaults and config fallbacks', () => {
  const rows = [
    { settingsKey: 'fetchConcurrency', configKey: 'concurrency', envKey: 'CONCURRENCY' },
    { settingsKey: 'perHostMinDelayMs', configKey: 'perHostMinDelayMs', envKey: 'PER_HOST_MIN_DELAY_MS' },
    { settingsKey: 'fetchPerHostConcurrencyCap', configKey: 'fetchPerHostConcurrencyCap', envKey: 'FETCH_PER_HOST_CONCURRENCY_CAP' },
    { settingsKey: 'discoveryEnabled', configKey: 'discoveryEnabled', envKey: 'DISCOVERY_ENABLED' },
    { settingsKey: 'discoveryMaxDiscovered', configKey: 'discoveryMaxDiscovered', envKey: 'DISCOVERY_MAX_DISCOVERED' },
    { settingsKey: 'serpTriageMinScore', configKey: 'serpTriageMinScore', envKey: 'SERP_TRIAGE_MIN_SCORE' },
    { settingsKey: 'serpTriageMaxUrls', configKey: 'serpTriageMaxUrls', envKey: 'SERP_TRIAGE_MAX_URLS' },
    { settingsKey: 'serpRerankerWeightMapJson', configKey: 'serpRerankerWeightMapJson', envKey: 'SERP_RERANKER_WEIGHT_MAP_JSON' },
    { settingsKey: 'llmExtractMaxSnippetsPerBatch', configKey: 'llmExtractMaxSnippetsPerBatch', envKey: 'LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH' },
    { settingsKey: 'llmMaxCallsPerProductTotal', configKey: 'llmMaxCallsPerProductTotal', envKey: 'LLM_MAX_CALLS_PER_PRODUCT_TOTAL' },
    { settingsKey: 'fetchSchedulerEnabled', configKey: 'fetchSchedulerEnabled', envKey: 'FETCH_SCHEDULER_ENABLED' },
    { settingsKey: 'fetchSchedulerInternalsMapJson', configKey: 'fetchSchedulerInternalsMapJson', envKey: 'FETCH_SCHEDULER_INTERNALS_MAP_JSON' },
    { settingsKey: 'dynamicFetchRetryBudget', configKey: 'dynamicFetchRetryBudget', envKey: 'DYNAMIC_FETCH_RETRY_BUDGET' },
    { settingsKey: 'dynamicFetchRetryBackoffMs', configKey: 'dynamicFetchRetryBackoffMs', envKey: 'DYNAMIC_FETCH_RETRY_BACKOFF_MS' },
    { settingsKey: 'frontierBlockedDomainThreshold', configKey: 'frontierBlockedDomainThreshold', envKey: 'FRONTIER_BLOCKED_DOMAIN_THRESHOLD' },
    { settingsKey: 'pageGotoTimeoutMs', configKey: 'pageGotoTimeoutMs', envKey: 'PAGE_GOTO_TIMEOUT_MS' },
    { settingsKey: 'postLoadWaitMs', configKey: 'postLoadWaitMs', envKey: 'POST_LOAD_WAIT_MS' },
    { settingsKey: 'userAgent', configKey: 'userAgent', envKey: 'USER_AGENT' },
  ];

  const getSharedDefault = (settingsKey) =>
    SETTINGS_DEFAULTS.runtime?.[settingsKey] ?? SETTINGS_DEFAULTS.convergence?.[settingsKey];

  withUnsetEnv(rows.map(({ envKey }) => envKey), () => {
    const config = loadConfig({ runProfile: 'standard' });

    for (const { settingsKey, configKey } of rows) {
      const sharedDefault = getSharedDefault(settingsKey);
      assert.notEqual(sharedDefault, undefined, `shared defaults should define ${settingsKey}`);
      assert.equal(
        config[configKey],
        sharedDefault,
        `config fallback ${configKey} should match shared default ${settingsKey}`,
      );
    }
  });
});

test('Phase 5 retired identity/consensus/retrieval/evidence/json-map knobs are absent from settings defaults and config', () => {
  const config = loadConfig({ runProfile: 'standard' });
  const runtimeDefaults = SETTINGS_DEFAULTS.runtime || {};
  const convergenceDefaults = SETTINGS_DEFAULTS.convergence || {};

  const retiredRuntimeKeys = [
    'identityGatePublishThreshold',
    'identityGateBaseMatchThreshold',
    'qualityGateIdentityThreshold',
    'consensusWeightedMajorityThreshold',
    'consensusStrictAcceptanceDomainCount',
    'consensusConfidenceScoringBase',
    'consensusPassTargetIdentityStrong',
    'consensusPassTargetNormal',
    'allowBelowPassTargetFill',
    'consensusMethodWeightNetworkJson',
    'consensusMethodWeightAdapterApi',
    'consensusMethodWeightStructuredMeta',
    'consensusMethodWeightPdf',
    'consensusMethodWeightTableKv',
    'consensusMethodWeightDom',
    'consensusMethodWeightLlmExtractBase',
    'consensusPolicyBonus',
    'consensusRelaxedAcceptanceDomainCount',
    'consensusInstrumentedFieldThreshold',
    'retrievalTierWeightTier1',
    'retrievalTierWeightTier2',
    'retrievalTierWeightTier3',
    'retrievalTierWeightTier4',
    'retrievalTierWeightTier5',
    'retrievalDocKindWeightManualPdf',
    'retrievalDocKindWeightSpecPdf',
    'retrievalDocKindWeightSupport',
    'retrievalDocKindWeightLabReview',
    'retrievalDocKindWeightProductPage',
    'retrievalDocKindWeightOther',
    'retrievalMethodWeightTable',
    'retrievalMethodWeightKv',
    'retrievalMethodWeightJsonLd',
    'retrievalMethodWeightLlmExtract',
    'retrievalMethodWeightHelperSupportive',
    'retrievalAnchorScorePerMatch',
    'retrievalIdentityScorePerMatch',
    'retrievalUnitMatchBonus',
    'retrievalDirectFieldMatchBonus',
    'evidenceTextMaxChars',
    'retrievalInternalsMapJson',
    'evidencePackLimitsMapJson',
    'parsingConfidenceBaseMapJson',
  ];
  for (const key of retiredRuntimeKeys) {
    assert.equal(Object.hasOwn(runtimeDefaults, key), false, `retired knob '${key}' should be absent from runtime defaults`);
    assert.equal(Object.hasOwn(config, key), false, `retired knob '${key}' should be absent from config`);
    assert.equal(Object.hasOwn(convergenceDefaults, key), false, `retired knob '${key}' should be absent from convergence defaults`);
  }
});

test('retired bing endpoint stays removed from settings defaults and config', () => {
  const config = loadConfig({ runProfile: 'standard' });
  assert.equal(Object.hasOwn(SETTINGS_DEFAULTS.runtime, 'bingSearchEndpoint'), false);
  assert.equal(Object.hasOwn(config, 'bingSearchEndpoint'), false);
});

test('.env files are secret-only', () => {
  for (const filePath of ['.env', '.env.example']) {
    const envKeys = readEnvKeysFromFile(filePath);
    for (const envKey of envKeys) {
      assert.equal(
        isSecretEnvKey(envKey),
        true,
        `${filePath} should only declare secret env keys, found ${envKey}`,
      );
    }
  }
});

test('retired CSE/paid search knobs are removed from config/default/manifest surfaces', () => {
  const config = loadConfig({ runProfile: 'standard' });
  const manifestKeys = new Set(CONFIG_MANIFEST_KEYS || []);
  const runtimeDefaults = SETTINGS_DEFAULTS.runtime || {};

  const retiredConfigKeys = [
    'bingSearchKey',
    'googleCseKey',
    'googleCseCx',
    'disableGoogleCse',
    'cseRescueOnlyMode',
    'cseRescueRequiredIteration',
  ];
  for (const key of retiredConfigKeys) {
    assert.equal(Object.hasOwn(config, key), false, `config should not expose retired key ${key}`);
    assert.equal(Object.hasOwn(runtimeDefaults, key), false, `settings defaults should not include retired key ${key}`);
  }

  const retiredManifestEnvKeys = [
    'BING_SEARCH_KEY',
    'GOOGLE_CSE_KEY',
    'GOOGLE_CSE_CX',
    'DISABLE_GOOGLE_CSE',
    'CSE_RESCUE_ONLY_MODE',
    'CSE_RESCUE_REQUIRED_ITERATION',
  ];
  for (const envKey of retiredManifestEnvKeys) {
    assert.equal(manifestKeys.has(envKey), false, `manifest should not expose retired env ${envKey}`);
  }
});

test('repo env files remove retired Google CSE declarations', () => {
  const retiredEnvKeys = [
    'GOOGLE_CSE_KEY',
    'GOOGLE_CSE_CX',
    'DISABLE_GOOGLE_CSE',
    'CSE_RESCUE_ONLY_MODE',
    'CSE_RESCUE_REQUIRED_ITERATION',
  ];

  for (const filePath of ['.env', '.env.example']) {
    const envKeys = readEnvKeysFromFile(filePath);
    for (const envKey of retiredEnvKeys) {
      assert.equal(
        envKeys.has(envKey),
        false,
        `${filePath} should not declare retired env ${envKey}`,
      );
    }
  }
});
