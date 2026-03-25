import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../config.js';
import { CONFIG_MANIFEST_DEFAULTS, CONFIG_MANIFEST_KEYS } from '../../core/config/manifest.js';
import {
  RUNTIME_SETTINGS_KEYS,
  RUNTIME_SETTINGS_ROUTE_GET,
} from '../../features/settings-authority/settingsContract.js';
import { SETTINGS_DEFAULTS } from '../settingsDefaults.js';

const SECRET_RUNTIME_KEYS = new Set([
  'openaiApiKey',
  'anthropicApiKey',
]);

const NON_CANONICAL_RUNTIME_KEYS = new Set([
  'localOutputRoot',
  // These keys default to '' in settingsDefaults but alias to canonical plan values after merge.
  'llmModelTriage',
  'llmModelExtract',
  'llmModelValidate',
  'llmModelWrite',
  'llmExtractFallbackModel',
  'llmValidateFallbackModel',
  'llmWriteFallbackModel',
  'llmMaxOutputTokensTriage',
  // Per-role provider/baseUrl/apiKey values also alias to global defaults after merge.
  'llmExtractProvider',
  'llmExtractBaseUrl',
  'llmExtractApiKey',
  'llmValidateProvider',
  'llmValidateBaseUrl',
  'llmValidateApiKey',
  'llmWriteProvider',
  'llmWriteBaseUrl',
  'llmWriteApiKey',
]);

const RUNTIME_SETTINGS_KEY_SET = new Set(RUNTIME_SETTINGS_KEYS || []);

const RETIRED_RUNTIME_KEY_GROUPS = Object.freeze([
  Object.freeze({
    label: 'Phase 12 NeedSet legacy removal',
    keys: Object.freeze([
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
    ]),
  }),
  Object.freeze({
    label: 'Phase 5 identity/consensus/retrieval/evidence/json-map removal',
    keys: Object.freeze([
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
    ]),
  }),
  Object.freeze({
    label: 'retired paid-search/runtime knobs',
    keys: Object.freeze([
      'bingSearchEndpoint',
      'bingSearchKey',
      'googleCseKey',
      'googleCseCx',
      'disableGoogleCse',
      'cseRescueOnlyMode',
      'cseRescueRequiredIteration',
    ]),
  }),
]);

const RETIRED_MANIFEST_ENV_KEYS = Object.freeze([
  'BING_SEARCH_KEY',
  'GOOGLE_CSE_KEY',
  'GOOGLE_CSE_CX',
  'DISABLE_GOOGLE_CSE',
  'CSE_RESCUE_ONLY_MODE',
  'CSE_RESCUE_REQUIRED_ITERATION',
]);

const MANUAL_ENV_KEY_MAP = Object.freeze({
  llmModelTriage: 'LLM_MODEL_TRIAGE',
  llmModelReasoning: 'LLM_MODEL_REASONING',
  llmModelValidate: 'LLM_MODEL_VALIDATE',
  llmModelWrite: 'LLM_MODEL_WRITE',
  llmTimeoutMs: 'LLM_TIMEOUT_MS',
  llmBaseUrl: 'LLM_BASE_URL',
  capturePageScreenshotSelectors: 'CAPTURE_PAGE_SCREENSHOT_SELECTORS',
  categoryAuthorityRoot: 'HELPER_FILES_ROOT',
});

function buildRuntimeConfigKeyMap() {
  const pairs = [
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.floatMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap),
  ];
  return new Map(pairs);
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

test('shared runtime defaults are the single default owner when env is not explicit', () => {
  const runtimeConfigKeyMap = buildRuntimeConfigKeyMap();
  const canonicalRuntimeKeys = Object.keys(SETTINGS_DEFAULTS.runtime).filter((key) => (
    !SECRET_RUNTIME_KEYS.has(key)
    && !NON_CANONICAL_RUNTIME_KEYS.has(key)
  ));

  withUnsetEnv(buildKnownConfigEnvKeys(), () => {
    const config = loadConfig();

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

test('retired settings stay absent from runtime, config, and manifest contract surfaces', () => {
  const config = loadConfig();
  const manifestKeys = new Set(CONFIG_MANIFEST_KEYS || []);

  for (const { label, keys } of RETIRED_RUNTIME_KEY_GROUPS) {
    for (const key of keys) {
      assert.equal(
        RUNTIME_SETTINGS_KEY_SET.has(key),
        false,
        `${label} should not reintroduce runtime setting ${key}`,
      );
      assert.equal(
        Object.hasOwn(config, key),
        false,
        `${label} should not reintroduce config key ${key}`,
      );
    }
  }

  for (const envKey of RETIRED_MANIFEST_ENV_KEYS) {
    assert.equal(
      manifestKeys.has(envKey),
      false,
      `retired paid-search env should stay absent from manifest: ${envKey}`,
    );
  }
});
