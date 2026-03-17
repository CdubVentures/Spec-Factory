import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, validateConfig, loadDotEnvFile } from '../src/config.js';
import { SETTINGS_DEFAULTS } from '../src/shared/settingsDefaults.js';

// ---------------------------------------------------------------------------
// Phase 0 — Characterization tests for config.js
//
// These tests lock down the CURRENT behavior of loadConfig(), validateConfig(),
// and loadDotEnvFile() as a safety net before any extraction/refactor.
// ---------------------------------------------------------------------------

// =========================================================================
// SECTION 1: loadConfig() default value snapshot
// =========================================================================

test('CHAR config: loadConfig() with clean env returns expected critical defaults', () => {
  const cfg = loadConfig();

  // Core pipeline defaults
  assert.equal(typeof cfg.maxUrlsPerProduct, 'number');
  assert.ok(cfg.maxUrlsPerProduct > 0);
  assert.equal(typeof cfg.maxCandidateUrls, 'number');
  assert.ok(cfg.maxCandidateUrls > 0);
  assert.equal(cfg.runProfile, 'standard');
  assert.equal(cfg.discoveryEnabled, true);
  assert.equal(cfg.fetchCandidateSources, true);

  // Hardcoded invariants — must always be true
  assert.equal(cfg.serpTriageEnabled, true);
  assert.equal(cfg.llmSerpRerankEnabled, true);
  assert.equal(cfg.enableSchema4SearchPlan, true);

  // Concurrency / fetch defaults
  assert.equal(typeof cfg.concurrency, 'number');
  assert.equal(typeof cfg.perHostMinDelayMs, 'number');
  assert.equal(typeof cfg.fetchPerHostConcurrencyCap, 'number');
  assert.equal(cfg.discoveryQueryConcurrency, 2);
  assert.equal(cfg.discoveryResultsPerQuery, 10);

  // Output defaults
  assert.equal(typeof cfg.outputMode, 'string');
  assert.equal(typeof cfg.localInputRoot, 'string');
  assert.equal(typeof cfg.localOutputRoot, 'string');

  // S3 defaults
  assert.equal(typeof cfg.s3Bucket, 'string');
  assert.equal(typeof cfg.s3InputPrefix, 'string');
  assert.equal(typeof cfg.s3OutputPrefix, 'string');
  assert.ok(!cfg.s3InputPrefix.endsWith('/'));
  assert.ok(!cfg.s3OutputPrefix.endsWith('/'));

  // LLM model keys exist
  assert.equal(typeof cfg.llmModelExtract, 'string');
  assert.equal(typeof cfg.llmModelPlan, 'string');
  assert.equal(typeof cfg.llmModelFast, 'string');
  assert.equal(typeof cfg.llmModelTriage, 'string');
  assert.equal(typeof cfg.llmModelReasoning, 'string');
  assert.equal(typeof cfg.llmModelValidate, 'string');
  assert.equal(typeof cfg.llmModelWrite, 'string');
  assert.equal(typeof cfg.llmProvider, 'string');

  // LLM budget defaults
  assert.equal(typeof cfg.llmMonthlyBudgetUsd, 'number');
  assert.equal(typeof cfg.llmPerProductBudgetUsd, 'number');
  assert.equal(cfg.llmDisableBudgetGuards, false);

  // Token map defaults
  assert.equal(typeof cfg.llmMaxOutputTokens, 'number');
  assert.equal(typeof cfg.llmMaxOutputTokensPlan, 'number');
  assert.equal(typeof cfg.llmMaxOutputTokensExtract, 'number');
  assert.equal(typeof cfg.llmMaxOutputTokensValidate, 'number');
  assert.equal(typeof cfg.llmMaxOutputTokensWrite, 'number');

  // Token presets
  assert.ok(Array.isArray(cfg.llmOutputTokenPresets));
  assert.ok(cfg.llmOutputTokenPresets.length > 0);

  // Cortex defaults
  assert.equal(cfg.cortexEnabled, false);
  assert.equal(typeof cfg.cortexBaseUrl, 'string');
  assert.equal(typeof cfg.cortexApiKey, 'string');

  // Normalizer map outputs
  assert.equal(typeof cfg.searchProfileCapMap, 'object');
  assert.ok(cfg.searchProfileCapMap !== null);
  assert.equal(typeof cfg.searchProfileCapMap.deterministicAliasCap, 'number');

  assert.equal(typeof cfg.serpRerankerWeightMap, 'object');
  assert.ok(cfg.serpRerankerWeightMap !== null);
  assert.equal(typeof cfg.serpRerankerWeightMap.identityStrongBonus, 'number');

  assert.equal(typeof cfg.fetchSchedulerInternalsMap, 'object');
  assert.ok(cfg.fetchSchedulerInternalsMap !== null);
  assert.equal(typeof cfg.fetchSchedulerInternalsMap.defaultDelayMs, 'number');

  assert.equal(typeof cfg.retrievalInternalsMap, 'object');
  assert.ok(cfg.retrievalInternalsMap !== null);

  assert.equal(typeof cfg.evidencePackLimitsMap, 'object');
  assert.ok(cfg.evidencePackLimitsMap !== null);

  assert.equal(typeof cfg.parsingConfidenceBaseMap, 'object');
  assert.ok(cfg.parsingConfidenceBaseMap !== null);

  // Pricing map
  assert.equal(typeof cfg.llmModelPricingMap, 'object');
  assert.ok(cfg.llmModelPricingMap !== null);

  // Model output token map (upserts should have populated known models)
  assert.equal(typeof cfg.llmModelOutputTokenMap, 'object');
  assert.ok(cfg.llmModelOutputTokenMap !== null);
  assert.ok('deepseek-chat' in cfg.llmModelOutputTokenMap);
  assert.ok('deepseek-reasoner' in cfg.llmModelOutputTokenMap);
  assert.ok('gemini-2.5-flash-lite' in cfg.llmModelOutputTokenMap);

  // Screencast defaults
  assert.equal(typeof cfg.runtimeScreencastEnabled, 'boolean');
  assert.equal(typeof cfg.runtimeScreencastFps, 'number');
  assert.equal(typeof cfg.runtimeScreencastQuality, 'number');
});

// =========================================================================
// SECTION 2: localMode override behavior
// =========================================================================

test('CHAR config: localMode=true forces outputMode=local and mirrorToS3=false', () => {
  const cfg = loadConfig({ localMode: true });
  assert.equal(cfg.outputMode, 'local');
  assert.equal(cfg.mirrorToS3, false);
});

test('CHAR config: localMode=false uses default outputMode', () => {
  const cfg = loadConfig({ localMode: false });
  assert.equal(typeof cfg.outputMode, 'string');
  assert.ok(['local', 'dual', 's3'].includes(cfg.outputMode));
});

// =========================================================================
// SECTION 3: LLM fallback chain behavior
// =========================================================================

test('CHAR config: LLM model roles all resolve to a string', () => {
  const cfg = loadConfig();
  const roles = [
    'llmModelExtract', 'llmModelPlan', 'llmModelFast',
    'llmModelTriage', 'llmModelReasoning',
    'llmModelValidate', 'llmModelWrite'
  ];
  for (const role of roles) {
    assert.equal(typeof cfg[role], 'string', `${role} must be a string`);
    assert.ok(cfg[role].length > 0, `${role} must not be empty`);
  }
});

test('CHAR config: LLM role-specific providers fall back to llmProvider', () => {
  const cfg = loadConfig();
  // Post-merge: role providers should be set (fall back to llmProvider)
  assert.equal(cfg.llmPlanProvider, cfg.llmProvider);
  assert.equal(cfg.llmExtractProvider, cfg.llmProvider);
  assert.equal(cfg.llmValidateProvider, cfg.llmProvider);
  assert.equal(cfg.llmWriteProvider, cfg.llmProvider);
});

test('CHAR config: LLM role-specific base URLs fall back to llmBaseUrl', () => {
  const cfg = loadConfig();
  assert.equal(cfg.llmPlanBaseUrl, cfg.llmBaseUrl);
  assert.equal(cfg.llmExtractBaseUrl, cfg.llmBaseUrl);
  assert.equal(cfg.llmValidateBaseUrl, cfg.llmBaseUrl);
  assert.equal(cfg.llmWriteBaseUrl, cfg.llmBaseUrl);
});

test('CHAR config: LLM role-specific API keys fall back to llmApiKey', () => {
  const cfg = loadConfig();
  assert.equal(cfg.llmPlanApiKey, cfg.llmApiKey);
  assert.equal(cfg.llmExtractApiKey, cfg.llmApiKey);
  assert.equal(cfg.llmValidateApiKey, cfg.llmApiKey);
  assert.equal(cfg.llmWriteApiKey, cfg.llmApiKey);
});

// =========================================================================
// SECTION 4: Post-merge clamping behavior
// =========================================================================

test('CHAR config: staticDomTargetMatchThreshold is clamped to [0, 1]', () => {
  const cfgHigh = loadConfig({ staticDomTargetMatchThreshold: 5.0 });
  assert.ok(cfgHigh.staticDomTargetMatchThreshold <= 1);
  assert.ok(cfgHigh.staticDomTargetMatchThreshold >= 0);

  const cfgLow = loadConfig({ staticDomTargetMatchThreshold: -1.0 });
  assert.ok(cfgLow.staticDomTargetMatchThreshold >= 0);
});

test('CHAR config: staticDomMaxEvidenceSnippets is clamped to [10, 500]', () => {
  const cfgHigh = loadConfig({ staticDomMaxEvidenceSnippets: 9999 });
  assert.ok(cfgHigh.staticDomMaxEvidenceSnippets <= 500);

  const cfgLow = loadConfig({ staticDomMaxEvidenceSnippets: 1 });
  assert.ok(cfgLow.staticDomMaxEvidenceSnippets >= 10);
});

test('CHAR config: pdfBackendRouterTimeoutMs is clamped to [10000, 300000]', () => {
  const cfgHigh = loadConfig({ pdfBackendRouterTimeoutMs: 999999 });
  assert.ok(cfgHigh.pdfBackendRouterTimeoutMs <= 300_000);

  const cfgLow = loadConfig({ pdfBackendRouterTimeoutMs: 100 });
  assert.ok(cfgLow.pdfBackendRouterTimeoutMs >= 10_000);
});

test('CHAR config: pdfBackendRouterMaxPages is clamped to [1, 300]', () => {
  const cfgHigh = loadConfig({ pdfBackendRouterMaxPages: 1000 });
  assert.ok(cfgHigh.pdfBackendRouterMaxPages <= 300);

  const cfgLow = loadConfig({ pdfBackendRouterMaxPages: 0 });
  assert.ok(cfgLow.pdfBackendRouterMaxPages >= 1);
});

test('CHAR config: scannedPdfOcrMaxPages is clamped to [1, 100]', () => {
  const cfgHigh = loadConfig({ scannedPdfOcrMaxPages: 999 });
  assert.ok(cfgHigh.scannedPdfOcrMaxPages <= 100);

  const cfgLow = loadConfig({ scannedPdfOcrMaxPages: 0 });
  assert.ok(cfgLow.scannedPdfOcrMaxPages >= 1);
});

test('CHAR config: scannedPdfOcrMinConfidence is clamped to [0, 1]', () => {
  const cfgHigh = loadConfig({ scannedPdfOcrMinConfidence: 2.0 });
  assert.ok(cfgHigh.scannedPdfOcrMinConfidence <= 1);

  const cfgLow = loadConfig({ scannedPdfOcrMinConfidence: -1.0 });
  assert.ok(cfgLow.scannedPdfOcrMinConfidence >= 0);
});

// =========================================================================
// SECTION 5: normalizer output shapes
// =========================================================================

test('CHAR config: pdfPreferredBackend normalizes invalid values to auto', () => {
  const cfg = loadConfig({ pdfPreferredBackend: 'nonsense' });
  assert.equal(cfg.pdfPreferredBackend, 'auto');
});

test('CHAR config: scannedPdfOcrBackend normalizes invalid values to auto', () => {
  const cfg = loadConfig({ scannedPdfOcrBackend: 'nonsense' });
  assert.equal(cfg.scannedPdfOcrBackend, 'auto');
});

test('CHAR config: staticDomMode normalizes invalid values to cheerio', () => {
  const cfg = loadConfig({ staticDomMode: 'nonsense' });
  assert.equal(cfg.staticDomMode, 'cheerio');
});

test('CHAR config: outputMode normalizes invalid values', () => {
  const cfg = loadConfig({ outputMode: 'nonsense' });
  assert.ok(['local', 'dual', 's3'].includes(cfg.outputMode));
});

// =========================================================================
// SECTION 6: openai mirror keys are synced
// =========================================================================

test('CHAR config: openai* keys are synced with llm* keys post-merge', () => {
  const cfg = loadConfig();
  assert.equal(cfg.openaiApiKey, cfg.llmApiKey);
  assert.equal(cfg.openaiBaseUrl, cfg.llmBaseUrl);
  assert.equal(cfg.openaiModelExtract, cfg.llmModelExtract);
  assert.equal(cfg.openaiModelPlan, cfg.llmModelPlan);
  assert.equal(cfg.openaiModelWrite, cfg.llmModelWrite);
  assert.equal(cfg.openaiTimeoutMs, cfg.llmTimeoutMs);
});

// =========================================================================
// SECTION 7: token profile upsert behavior
// =========================================================================

test('CHAR config: known model token profiles are populated in llmModelOutputTokenMap', () => {
  const cfg = loadConfig();
  const map = cfg.llmModelOutputTokenMap;
  const expectedModels = [
    'deepseek-chat', 'deepseek-reasoner',
    'gemini-2.5-flash-lite', 'gemini-2.5-flash',
    'gpt-5-low', 'gpt-5.1-low', 'gpt-5.1-high',
    'gpt-5.2-high', 'gpt-5.2-xhigh'
  ];
  for (const model of expectedModels) {
    assert.ok(model in map, `${model} should be in llmModelOutputTokenMap`);
    assert.equal(typeof map[model].defaultOutputTokens, 'number');
    assert.equal(typeof map[model].maxOutputTokens, 'number');
    assert.ok(map[model].defaultOutputTokens > 0, `${model} defaultOutputTokens should be > 0`);
    assert.ok(map[model].maxOutputTokens > 0, `${model} maxOutputTokens should be > 0`);
  }
});

// =========================================================================
// SECTION 8: llmMaxOutputTokens* post-merge chain
// =========================================================================

test('CHAR config: llmMaxOutputTokens role chain produces valid numbers', () => {
  const cfg = loadConfig();
  const tokenKeys = [
    'llmMaxOutputTokensPlan', 'llmMaxOutputTokensFast',
    'llmMaxOutputTokensTriage', 'llmMaxOutputTokensReasoning',
    'llmMaxOutputTokensExtract', 'llmMaxOutputTokensValidate',
    'llmMaxOutputTokensWrite',
    'llmMaxOutputTokensPlanFallback', 'llmMaxOutputTokensExtractFallback',
    'llmMaxOutputTokensValidateFallback', 'llmMaxOutputTokensWriteFallback'
  ];
  for (const key of tokenKeys) {
    assert.equal(typeof cfg[key], 'number', `${key} must be a number`);
    assert.ok(cfg[key] >= 0, `${key} must be >= 0`);
  }
});

// =========================================================================
// SECTION 9: overrides take precedence
// =========================================================================

test('CHAR config: explicit overrides take precedence over defaults', () => {
  const cfg = loadConfig({
    maxUrlsPerProduct: 77,
    maxPagesPerDomain: 11,
    cortexEnabled: true,
    cortexBaseUrl: 'http://test.example.com'
  });
  assert.equal(cfg.maxUrlsPerProduct, 77);
  assert.equal(cfg.maxPagesPerDomain, 11);
  assert.equal(cfg.cortexEnabled, true);
  assert.equal(cfg.cortexBaseUrl, 'http://test.example.com');
});

test('CHAR config: undefined overrides are filtered out', () => {
  const cfg = loadConfig({ maxUrlsPerProduct: undefined });
  assert.ok(cfg.maxUrlsPerProduct > 0);
});

// =========================================================================
// SECTION 10: validateConfig characterization
// =========================================================================

test('CHAR validate: default config is valid', () => {
  const cfg = loadConfig();
  const result = validateConfig(cfg);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('CHAR validate: all 5 validation rules produce correct codes', () => {
  // Rule 1: LLM_NO_API_KEY (warning)
  const r1 = validateConfig(loadConfig({ llmApiKey: '' }));
  assert.ok(r1.warnings.some(w => w.code === 'LLM_NO_API_KEY'));

  // Rule 2: DISCOVERY_NO_SEARCH_PROVIDER (warning)
  const r2 = validateConfig(loadConfig({ searchProvider: 'none' }));
  assert.ok(r2.warnings.some(w => w.code === 'DISCOVERY_NO_SEARCH_PROVIDER'));

  // Rule 3: CORTEX_NO_BASE_URL (error)
  const r3 = validateConfig(loadConfig({ cortexEnabled: true, cortexBaseUrl: '' }));
  assert.equal(r3.valid, false);
  assert.ok(r3.errors.some(e => e.code === 'CORTEX_NO_BASE_URL'));

  // Rule 4: S3_MODE_NO_CREDS (warning)
  const r4 = validateConfig({ outputMode: 's3', mirrorToS3: false });
  assert.ok(r4.warnings.some(w => w.code === 'S3_MODE_NO_CREDS'));

  // Rule 5: BUDGET_GUARDS_DISABLED (warning)
  const r5 = validateConfig(loadConfig({ llmDisableBudgetGuards: true }));
  assert.ok(r5.warnings.some(w => w.code === 'BUDGET_GUARDS_DISABLED'));
});

test('CHAR validate: return shape is { valid, errors, warnings }', () => {
  const result = validateConfig(loadConfig());
  assert.ok('valid' in result);
  assert.ok('errors' in result);
  assert.ok('warnings' in result);
  assert.equal(typeof result.valid, 'boolean');
  assert.ok(Array.isArray(result.errors));
  assert.ok(Array.isArray(result.warnings));
});

// =========================================================================
// SECTION 11: convergence settings defaults propagation
// =========================================================================

test('CHAR config: convergence keys from SETTINGS_DEFAULTS propagate to config', () => {
  const cfg = loadConfig();
  const convergenceKeys = [
    'serpTriageMinScore', 'serpTriageMaxUrls',
  ];
  for (const key of convergenceKeys) {
    assert.ok(key in cfg, `${key} must exist in config`);
  }
});

// =========================================================================
// SECTION 12: JSON map normalizer integration
// =========================================================================

test('CHAR config: searchProfileCapMap has all expected keys', () => {
  const cfg = loadConfig();
  const expected = ['deterministicAliasCap', 'llmAliasValidationCap', 'llmDocHintQueriesCap', 'llmFieldTargetQueriesCap', 'dedupeQueriesCap'];
  for (const key of expected) {
    assert.ok(key in cfg.searchProfileCapMap, `searchProfileCapMap must have ${key}`);
    assert.equal(typeof cfg.searchProfileCapMap[key], 'number');
  }
});

test('CHAR config: serpRerankerWeightMap has all 21 expected keys', () => {
  const cfg = loadConfig();
  const expected = [
    'identityStrongBonus', 'identityPartialBonus', 'identityWeakBonus', 'identityNoneBonus',
    'brandPresenceBonus', 'modelPresenceBonus', 'specManualKeywordBonus', 'reviewBenchmarkBonus',
    'forumRedditPenalty', 'brandInHostnameBonus', 'wikipediaPenalty', 'variantGuardPenalty',
    'multiModelHintPenalty', 'tier1Bonus', 'tier2Bonus',
    'hostHealthDownrankPenalty', 'hostHealthExcludePenalty', 'operatorRiskPenalty',
    'fieldAffinityBonus', 'diversityPenaltyPerDupe', 'needsetCoverageBonus'
  ];
  assert.equal(Object.keys(cfg.serpRerankerWeightMap).length, 21);
  for (const key of expected) {
    assert.ok(key in cfg.serpRerankerWeightMap, `serpRerankerWeightMap must have ${key}`);
    assert.equal(typeof cfg.serpRerankerWeightMap[key], 'number');
  }
});

test('CHAR config: fetchSchedulerInternalsMap has all expected keys', () => {
  const cfg = loadConfig();
  const expected = ['defaultDelayMs', 'defaultConcurrency', 'defaultMaxRetries', 'retryWaitMs'];
  for (const key of expected) {
    assert.ok(key in cfg.fetchSchedulerInternalsMap, `fetchSchedulerInternalsMap must have ${key}`);
    assert.equal(typeof cfg.fetchSchedulerInternalsMap[key], 'number');
  }
});

test('CHAR config: retrievalInternalsMap has all expected keys', () => {
  const cfg = loadConfig();
  const expected = [
    'evidenceTierWeightMultiplier', 'evidenceDocWeightMultiplier', 'evidenceMethodWeightMultiplier',
    'evidencePoolMaxRows', 'snippetsPerSourceCap', 'maxHitsCap',
    'evidenceRefsLimit', 'reasonBadgesLimit', 'retrievalAnchorsLimit',
    'primeSourcesMaxCap', 'fallbackEvidenceMaxRows', 'provenanceOnlyMinRows'
  ];
  for (const key of expected) {
    assert.ok(key in cfg.retrievalInternalsMap, `retrievalInternalsMap must have ${key}`);
    assert.equal(typeof cfg.retrievalInternalsMap[key], 'number');
  }
});

test('CHAR config: parsingConfidenceBaseMap has all expected keys', () => {
  const cfg = loadConfig();
  const expected = ['network_json', 'embedded_state', 'json_ld', 'microdata', 'opengraph', 'microformat_rdfa'];
  for (const key of expected) {
    assert.ok(key in cfg.parsingConfidenceBaseMap, `parsingConfidenceBaseMap must have ${key}`);
    assert.equal(typeof cfg.parsingConfidenceBaseMap[key], 'number');
  }
});

// =========================================================================
// SECTION 13: JSON serialized map roundtrip
// =========================================================================

test('CHAR config: searchProfileCapMapJson is valid JSON matching searchProfileCapMap', () => {
  const cfg = loadConfig();
  const parsed = JSON.parse(cfg.searchProfileCapMapJson);
  assert.deepStrictEqual(parsed, cfg.searchProfileCapMap);
});

test('CHAR config: serpRerankerWeightMapJson matches serpRerankerWeightMap exactly (SSOT)', () => {
  const cfg = loadConfig();
  const parsed = JSON.parse(cfg.serpRerankerWeightMapJson);
  assert.deepStrictEqual(parsed, cfg.serpRerankerWeightMap);
});

test('CHAR config: fetchSchedulerInternalsMapJson is valid JSON matching fetchSchedulerInternalsMap', () => {
  const cfg = loadConfig();
  const parsed = JSON.parse(cfg.fetchSchedulerInternalsMapJson);
  assert.deepStrictEqual(parsed, cfg.fetchSchedulerInternalsMap);
});

// WHY: retrievalInternalsMapJson was retired — object map retrievalInternalsMap
// is now the sole representation. Roundtrip test removed.

// =========================================================================
// SECTION 14: category authority / helper files defaults
// =========================================================================

test('CHAR config: category authority root has sensible default', () => {
  const cfg = loadConfig();
  assert.equal(typeof cfg.categoryAuthorityRoot, 'string');
  assert.ok(cfg.categoryAuthorityRoot.length > 0);
  // helperFilesRoot should match categoryAuthorityRoot
  assert.equal(cfg.helperFilesRoot, cfg.categoryAuthorityRoot);
});

test('CHAR config: indexingCategoryAuthorityEnabled defaults to false', () => {
  const cfg = loadConfig();
  assert.equal(cfg.indexingCategoryAuthorityEnabled, false);
});

// =========================================================================
// SECTION 15: loadConfig is idempotent (calling twice gives same shape)
// =========================================================================

test('CHAR config: loadConfig called twice returns consistent shapes', () => {
  const cfg1 = loadConfig();
  const cfg2 = loadConfig();
  const keys1 = Object.keys(cfg1).sort();
  const keys2 = Object.keys(cfg2).sort();
  assert.deepStrictEqual(keys1, keys2);
});

// =========================================================================
// SECTION 17: SSOT — serpRerankerWeightMapJson has all 21 keys
// =========================================================================

test('SSOT: SETTINGS_DEFAULTS.runtime.serpRerankerWeightMapJson has all 21 reranker keys', () => {
  const parsed = JSON.parse(SETTINGS_DEFAULTS.runtime.serpRerankerWeightMapJson);
  const expected = [
    'identityStrongBonus', 'identityPartialBonus', 'identityWeakBonus', 'identityNoneBonus',
    'brandPresenceBonus', 'modelPresenceBonus', 'specManualKeywordBonus', 'reviewBenchmarkBonus',
    'forumRedditPenalty', 'brandInHostnameBonus', 'wikipediaPenalty', 'variantGuardPenalty',
    'multiModelHintPenalty', 'tier1Bonus', 'tier2Bonus',
    'hostHealthDownrankPenalty', 'hostHealthExcludePenalty', 'operatorRiskPenalty',
    'fieldAffinityBonus', 'diversityPenaltyPerDupe', 'needsetCoverageBonus'
  ];
  assert.equal(Object.keys(parsed).length, 21, `Expected 21 keys, got ${Object.keys(parsed).length}`);
  for (const key of expected) {
    assert.ok(key in parsed, `serpRerankerWeightMapJson must have ${key}`);
    assert.equal(typeof parsed[key], 'number');
  }
});
