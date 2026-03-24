import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, validateConfig, loadDotEnvFile } from '../../../config.js';
import { SETTINGS_DEFAULTS } from '../../../shared/settingsDefaults.js';
import { applyPostMergeNormalization } from '../configPostMerge.js';

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
  assert.equal(cfg.runProfile, 'standard');
  assert.equal(cfg.discoveryEnabled, true);

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

  // LLM model keys exist (per-role aliases retired — only plan + reasoning)
  assert.equal(typeof cfg.llmModelPlan, 'string');
  assert.equal(typeof cfg.llmModelReasoning, 'string');
  assert.equal(typeof cfg.llmProvider, 'string');

  // LLM budget defaults
  assert.equal(typeof cfg.llmMonthlyBudgetUsd, 'number');
  assert.equal(typeof cfg.llmPerProductBudgetUsd, 'number');

  // Token map defaults (per-role token caps retired — only plan + reasoning)
  assert.equal(typeof cfg.llmMaxOutputTokens, 'number');
  assert.equal(typeof cfg.llmMaxOutputTokensPlan, 'number');

  // Token presets
  assert.ok(Array.isArray(cfg.llmOutputTokenPresets));
  assert.ok(cfg.llmOutputTokenPresets.length > 0);

  // Normalizer map outputs
  assert.equal(typeof cfg.searchProfileCapMap, 'object');
  assert.ok(cfg.searchProfileCapMap !== null);
  assert.equal(typeof cfg.searchProfileCapMap.deterministicAliasCap, 'number');

  assert.equal(typeof cfg.retrievalInternalsMap, 'object');
  assert.ok(cfg.retrievalInternalsMap !== null);

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

test('CHAR config: LLM model plan and reasoning resolve to a string', () => {
  const cfg = loadConfig();
  const roles = ['llmModelPlan', 'llmModelReasoning'];
  for (const role of roles) {
    assert.equal(typeof cfg[role], 'string', `${role} must be a string`);
    assert.ok(cfg[role].length > 0, `${role} must not be empty`);
  }
});

test('CHAR config: llmPlanApiKey falls back to llmApiKey', () => {
  const cfg = loadConfig();
  // WHY: llmPlanProvider/BaseUrl removed from configBuilder — routing uses
  // registry SSOT (composite keys). Only llmPlanApiKey survives as override seam.
  assert.equal(cfg.llmPlanApiKey, cfg.llmApiKey);
});

// WHY: Section 4 (post-merge clamping for staticDom*, pdfBackendRouter*, scannedPdfOcr*) removed —
// those settings were retired from the registry.

// WHY: Section 5 normalizer tests for pdfPreferredBackend, scannedPdfOcrBackend,
// staticDomMode removed — those settings were retired from the registry.

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
  assert.equal(cfg.openaiModelPlan, cfg.llmModelPlan);
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

test('CHAR config: llmMaxOutputTokens chain produces valid numbers', () => {
  const cfg = loadConfig();
  const tokenKeys = [
    'llmMaxOutputTokensPlan', 'llmMaxOutputTokensReasoning',
    'llmMaxOutputTokensPlanFallback',
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
    maxPagesPerDomain: 11,
  });
  assert.equal(cfg.maxPagesPerDomain, 11);
});

test('CHAR config: undefined overrides are filtered out', () => {
  const cfg = loadConfig({ maxPagesPerDomain: undefined });
  assert.ok(cfg.maxPagesPerDomain > 0);
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

test('CHAR validate: all 3 validation rules produce correct codes', () => {
  // Rule 1: LLM_NO_API_KEY (warning)
  const r1 = validateConfig(loadConfig({ llmApiKey: '' }));
  assert.ok(r1.warnings.some(w => w.code === 'LLM_NO_API_KEY'));

  // Rule 2: DISCOVERY_NO_SEARCH_PROVIDER (warning)
  const r2 = validateConfig(loadConfig({ searchEngines: '' }));
  assert.ok(r2.warnings.some(w => w.code === 'DISCOVERY_NO_SEARCH_PROVIDER'));

  // Rule 3: S3_MODE_NO_CREDS (warning)
  const r3 = validateConfig({ outputMode: 's3', mirrorToS3: false });
  assert.ok(r3.warnings.some(w => w.code === 'S3_MODE_NO_CREDS'));
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
  // Registry is empty — no convergence keys should propagate
  const convergenceKeys = [];
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


// WHY: fetchSchedulerInternalsMap test removed — setting retired from registry.

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

// WHY: parsingConfidenceBaseMap test removed — setting retired from registry.

// WHY: Section 13 (fetchSchedulerInternalsMapJson roundtrip) removed — setting retired.
// retrievalInternalsMapJson was also previously retired.

// =========================================================================
// SECTION 14: category authority / helper files defaults
// =========================================================================

test('CHAR config: category authority root has sensible default', () => {
  const cfg = loadConfig();
  assert.equal(typeof cfg.categoryAuthorityRoot, 'string');
  assert.ok(cfg.categoryAuthorityRoot.length > 0);
  // helperFilesRoot removed — canonical key is categoryAuthorityRoot
  assert.strictEqual(cfg.helperFilesRoot, undefined);
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
// Fix 3: extraction/validate/write phases inherit reasoning from llmPlanUseReasoning
// =========================================================================

test('CHAR config: extraction/validate/write phases inherit useReasoning from llmPlanUseReasoning when true', () => {
  // WHY: groupToggle for extraction/validate/write must be 'llmPlanUseReasoning',
  // not null. When null, resolved value is always false regardless of the toggle.
  // Pass llmPlanUseReasoning as an override so canonical defaults don't clobber it.
  const resolved = applyPostMergeNormalization(
    { ...SETTINGS_DEFAULTS },
    { llmPlanUseReasoning: true },
    new Set(),
  );
  assert.equal(resolved._resolvedExtractionUseReasoning, true,
    'extraction useReasoning must inherit true from llmPlanUseReasoning');
  assert.equal(resolved._resolvedValidateUseReasoning, true,
    'validate useReasoning must inherit true from llmPlanUseReasoning');
  assert.equal(resolved._resolvedWriteUseReasoning, true,
    'write useReasoning must inherit true from llmPlanUseReasoning');
});

// =========================================================================
// SECTION 18: Model stack simplification — aliasing
// =========================================================================

test('model aliasing: per-role model keys stripped from config surface', () => {
  const cfg = loadConfig();
  // WHY: configPostMerge aliases them internally, but settingsKeyMap
  // removes triage/validate/write from the GET route. Extract survives
  // because it seeds openaiModelExtract sync.
  const removedRoles = ['llmModelTriage', 'llmModelValidate', 'llmModelWrite'];
  for (const role of removedRoles) {
    assert.equal(cfg[role], undefined,
      `${role} should be stripped from config surface`);
  }
  assert.equal(typeof cfg.llmModelExtract, 'string');
});

test('model aliasing: llmModelReasoning preserves its own value (not aliased to plan)', () => {
  const cfg = loadConfig();
  assert.equal(typeof cfg.llmModelReasoning, 'string');
  assert.ok(cfg.llmModelReasoning.length > 0);
});

test('model aliasing: explicit llmModelPlan override sets plan model', () => {
  const cfg = loadConfig({ llmModelPlan: 'test-model-xyz' });
  assert.equal(cfg.llmModelPlan, 'test-model-xyz');
});

// =========================================================================
// SECTION 19: Fallback model aliasing
// =========================================================================

test('fallback aliasing: per-role fallback model keys are removed from config', () => {
  const cfg = loadConfig();
  assert.equal(cfg.llmExtractFallbackModel, undefined,
    'llmExtractFallbackModel should no longer exist');
  assert.equal(cfg.llmValidateFallbackModel, undefined,
    'llmValidateFallbackModel should no longer exist');
  assert.equal(cfg.llmWriteFallbackModel, undefined,
    'llmWriteFallbackModel should no longer exist');
});

// =========================================================================
// SECTION 20: Token cap aliasing
// =========================================================================

test('token cap aliasing: per-role token cap keys are removed from config', () => {
  const cfg = loadConfig();
  const deadTokenKeys = [
    'llmMaxOutputTokensExtract', 'llmMaxOutputTokensValidate',
    'llmMaxOutputTokensWrite',
  ];
  for (const key of deadTokenKeys) {
    assert.equal(cfg[key], undefined, `${key} should no longer exist in config`);
  }
  assert.equal(typeof cfg.llmMaxOutputTokensTriage, 'number',
    'llmMaxOutputTokensTriage remains the live triage-phase cap');
});

test('token cap aliasing: per-role fallback token cap keys are removed from config', () => {
  const cfg = loadConfig();
  assert.equal(cfg.llmMaxOutputTokensExtractFallback, undefined,
    'llmMaxOutputTokensExtractFallback should no longer exist');
  assert.equal(cfg.llmMaxOutputTokensValidateFallback, undefined,
    'llmMaxOutputTokensValidateFallback should no longer exist');
  assert.equal(cfg.llmMaxOutputTokensWriteFallback, undefined,
    'llmMaxOutputTokensWriteFallback should no longer exist');
});

// =========================================================================
// SECTION 21: PHASE_DEFS — all phases use llmPlanUseReasoning
// =========================================================================

test('PHASE_DEFS: triage phases (brandResolver, serpSelector) use llmPlanUseReasoning', () => {
  const resolved = applyPostMergeNormalization(
    { ...SETTINGS_DEFAULTS },
    { llmPlanUseReasoning: true },
    new Set(),
  );
  assert.equal(resolved._resolvedBrandResolverUseReasoning, true,
    'brandResolver must inherit from llmPlanUseReasoning');
  assert.equal(resolved._resolvedSerpSelectorUseReasoning, true,
    'serpSelector must inherit from llmPlanUseReasoning');
});

test('PHASE_DEFS: all phases resolve baseModel to llmModelPlan', () => {
  const resolved = applyPostMergeNormalization(
    { ...SETTINGS_DEFAULTS },
    { llmModelPlan: 'unified-model' },
    new Set(),
  );
  const phases = [
    'Needset', 'SearchPlanner', 'BrandResolver', 'SerpSelector',
    'Extraction', 'Validate', 'Write',
  ];
  for (const phase of phases) {
    assert.equal(resolved[`_resolved${phase}BaseModel`], 'unified-model',
      `${phase} baseModel must resolve to llmModelPlan`);
  }
});
