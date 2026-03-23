// WHY: Config literal builder + manifest applicator extracted from config.js (Phase 7).
// createManifestApplicator encapsulates manifest state in a closure (no module-level let).
// buildRawConfig returns the raw cfg object + explicitEnvKeys before post-merge normalization.

import path from 'node:path';
import { hasS3EnvCreds, defaultChatmockDir } from './llmModelResolver.js';
import { providerFromModelToken } from '../llm/providerMeta.js';
import {
  buildDefaultModelPricingMap,
  LLM_PRICING_AS_OF,
  LLM_PRICING_SOURCES,
  mergeModelPricingMaps
} from '../../billing/modelPricingCatalog.js';
import { normalizeDynamicFetchPolicyMap } from '../../fetcher/dynamicFetchPolicy.js';
import {
  normalizeArticleExtractorPolicyMap,
  runtimeSettingDefault,
  convergenceSettingDefault,
  normalizeSearchProfileCapMap,
  normalizeFetchSchedulerInternalsMap,
  normalizeRetrievalInternalsMap,
  normalizeEvidencePackLimitsMap,
  normalizeParsingConfidenceBaseMap,
  normalizeRepairDedupeRule,
  normalizeModelPricingMap,
  normalizePricingSources,
  normalizeModelOutputTokenMap,
  normalizeOutputMode,
  normalizeStaticDomMode,
  normalizePdfBackend,
  normalizeScannedPdfOcrBackend,
  REPAIR_DEDUPE_RULE_DEFAULT,
  DEFAULT_USER_AGENT
} from './configNormalizers.js';
import {
  parseIntEnv,
  parseFloatEnv,
  parseBoolEnv,
  parseJsonEnv,
  toTokenInt,
  parseTokenPresetList
} from './envParsers.js';
import {
  explicitEnvValue,
} from './settingsClassification.js';
import { defaultLocalOutputRoot } from './runtimeArtifactRoots.js';
import { SETTINGS_DEFAULTS } from '../../shared/settingsDefaults.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../../shared/settingsRegistry.js';
import { assembleConfigFromRegistry } from './configAssembly.js';

// WHY: Registry is SSOT for model→provider routing. Derive default model
// from the first enabled primary-role entry, not from which API keys
// happen to be present in the environment.
function resolveRegistryDefaults() {
  let entries = [];
  try {
    const json = runtimeSettingDefault('llmProviderRegistryJson');
    entries = JSON.parse(typeof json === 'string' ? json : JSON.stringify(json));
  } catch { /* empty */ }
  if (!Array.isArray(entries)) entries = [];

  for (const entry of entries) {
    if (!entry?.enabled) continue;
    const models = Array.isArray(entry.models) ? entry.models : [];
    const primary = models.find(m => m?.role === 'primary' && m?.modelId);
    if (primary) {
      const model = String(primary.modelId).trim();
      const provider = providerFromModelToken(model) || 'openai';
      return { provider, model, baseUrl: String(entry.baseUrl || '').trim() };
    }
  }
  return { provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' };
}

function resolveBootstrapApiKey(registryProvider) {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
  if (registryProvider === 'gemini' && process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (registryProvider === 'deepseek' && process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  return process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
}

export function createManifestApplicator(manifestDefaults) {
  let manifestDefaultsApplied = false;
  const manifestDefaultedEnvKeys = new Set();

  function apply() {
    if (manifestDefaultsApplied) return;
    for (const [key, defaultValue] of Object.entries(manifestDefaults || {})) {
      if (process.env[key] !== undefined && process.env[key] !== '') continue;
      const value = String(defaultValue ?? '').trim();
      if (value === '') continue;
      process.env[key] = value;
      manifestDefaultedEnvKeys.add(key);
    }
    manifestDefaultsApplied = true;
  }

  function getDefaultedEnvKeys() {
    return manifestDefaultedEnvKeys;
  }

  function wasApplied() {
    return manifestDefaultsApplied;
  }

  return { apply, getDefaultedEnvKeys, wasApplied, _manifestDefaults: manifestDefaults };
}

export function buildRawConfig({ manifestApplicator }) {
  const manifestDefaults = manifestApplicator._manifestDefaults;
  const manifestDefaultedEnvKeys = manifestApplicator.getDefaultedEnvKeys();

  const explicitCategoryAuthorityRoot = String(process.env.CATEGORY_AUTHORITY_ROOT || '').trim();
  const explicitLegacyHelperRoot = String(process.env.HELPER_FILES_ROOT || '').trim();
  const explicitEnvKeys = new Set(
    Object.entries(process.env)
      .filter(([key, value]) => {
        if (value === undefined || value === null || String(value) === '') return false;
        if (!manifestDefaultedEnvKeys.has(key)) return true;
        return String(value) !== String(manifestDefaults?.[key] ?? '');
      })
      .map(([key]) => key)
  );
  manifestApplicator.apply();

  // Treat manifest-injected env as fallback defaults, not explicit operator intent.
  const explicitLlmProvider = explicitEnvValue('LLM_PROVIDER', explicitEnvKeys).trim().toLowerCase();
  const explicitLlmBaseUrl = explicitEnvValue('LLM_BASE_URL', explicitEnvKeys);
  const explicitLlmModelExtract = explicitEnvValue('LLM_MODEL_EXTRACT', explicitEnvKeys);
  const explicitLlmModelPlan = explicitEnvValue('LLM_MODEL_PLAN', explicitEnvKeys);
  const explicitLlmModelReasoning = explicitEnvValue('LLM_MODEL_REASONING', explicitEnvKeys);
  const explicitLlmPlanProvider = explicitEnvValue('LLM_PLAN_PROVIDER', explicitEnvKeys).trim().toLowerCase();
  const explicitLlmPlanBaseUrl = explicitEnvValue('LLM_PLAN_BASE_URL', explicitEnvKeys);

  const parsedCandidateUrls = Number.parseInt(String(process.env.MAX_CANDIDATE_URLS || ''), 10);
  const registryDefaults = resolveRegistryDefaults();
  const defaultModel = explicitLlmModelExtract || registryDefaults.model;
  const resolvedApiKey = resolveBootstrapApiKey(registryDefaults.provider);
  const resolvedBaseUrl = explicitLlmBaseUrl || registryDefaults.baseUrl;
  const timeoutMs = parseIntEnv('LLM_TIMEOUT_MS', runtimeSettingDefault('llmTimeoutMs'));
  const envOutputMode = normalizeOutputMode(process.env.OUTPUT_MODE || 'dual', 'dual');
  const hasS3Creds = hasS3EnvCreds();
  const defaultMirrorToS3 = envOutputMode !== 'local' && hasS3Creds;
  const normalizedFetchSchedulerInternalsMap = normalizeFetchSchedulerInternalsMap(
    parseJsonEnv('FETCH_SCHEDULER_INTERNALS_MAP_JSON', {})
  );
  const normalizedRetrievalInternalsMap = normalizeRetrievalInternalsMap({});
  const normalizedEvidencePackLimitsMap = normalizeEvidencePackLimitsMap({});
  const normalizedParsingConfidenceBaseMap = normalizeParsingConfidenceBaseMap({});
  const normalizedArticleExtractorDomainPolicyMap = normalizeArticleExtractorPolicyMap(
    parseJsonEnv('ARTICLE_EXTRACTOR_DOMAIN_POLICY_MAP_JSON', {})
  );
  const articleExtractorDomainPolicyMapJson = Object.keys(normalizedArticleExtractorDomainPolicyMap).length > 0
    ? JSON.stringify(normalizedArticleExtractorDomainPolicyMap)
    : '';
  const normalizedDynamicFetchPolicyMap = normalizeDynamicFetchPolicyMap(
    parseJsonEnv('DYNAMIC_FETCH_POLICY_MAP_JSON', {})
  );
  const dynamicFetchPolicyMapJson = Object.keys(normalizedDynamicFetchPolicyMap).length > 0
    ? JSON.stringify(normalizedDynamicFetchPolicyMap)
    : '';
  const resolvedCategoryAuthorityRoot =
    explicitCategoryAuthorityRoot ||
    explicitLegacyHelperRoot ||
    process.env.CATEGORY_AUTHORITY_ROOT ||
    process.env.HELPER_FILES_ROOT ||
    'category_authority';

  // WHY: O(1) scaling — simple settings assembled from registry SSOT.
  // Custom entries below override the generic values where needed.
  const simpleCfg = assembleConfigFromRegistry(RUNTIME_SETTINGS_REGISTRY);

  const cfg = {
    // --- O(1) generic assembly: all SIMPLE settings from registry SSOT ---
    ...simpleCfg,

    // --- Post-processed strings ---
    s3InputPrefix: (process.env.S3_INPUT_PREFIX || runtimeSettingDefault('s3InputPrefix')).replace(/\/+$/, ''),
    s3OutputPrefix: (process.env.S3_OUTPUT_PREFIX || runtimeSettingDefault('s3OutputPrefix')).replace(/\/+$/, ''),
    repairDedupeRule: normalizeRepairDedupeRule(process.env['REPAIR_DEDUPE_RULE'] || REPAIR_DEDUPE_RULE_DEFAULT),
    indexingResumeMode: (process.env.INDEXING_RESUME_MODE || runtimeSettingDefault('indexingResumeMode')).trim().toLowerCase(),
    staticDomMode: normalizeStaticDomMode(process.env.STATIC_DOM_MODE || runtimeSettingDefault('staticDomMode')),
    batchStrategy: (process.env.BATCH_STRATEGY || runtimeSettingDefault('batchStrategy')).toLowerCase(),
    capturePageScreenshotFormat: String(process.env.CAPTURE_PAGE_SCREENSHOT_FORMAT || 'jpeg').trim().toLowerCase() === 'png' ? 'png' : 'jpeg',
    capturePageScreenshotSelectors: String(process.env.CAPTURE_PAGE_SCREENSHOT_SELECTORS || 'table,[data-spec-table],.specs-table,.spec-table,.specifications').trim(),

    // --- Computed / multi-env values ---
    maxCandidateUrls: Number.isFinite(parsedCandidateUrls) ? parsedCandidateUrls : runtimeSettingDefault('maxCandidateUrls'),
    userAgent: process.env.USER_AGENT || SETTINGS_DEFAULTS.runtime.userAgent || DEFAULT_USER_AGENT,
    outputMode: envOutputMode,
    mirrorToS3: parseBoolEnv('MIRROR_TO_S3', runtimeSettingDefault('mirrorToS3')),
    localInputRoot: process.env.LOCAL_INPUT_ROOT || runtimeSettingDefault('localInputRoot'),
    localOutputRoot: process.env.LOCAL_OUTPUT_ROOT || defaultLocalOutputRoot(),
    runtimeEventsKey: process.env.RUNTIME_EVENTS_KEY || runtimeSettingDefault('runtimeEventsKey'),
    searchEngines: process.env.SEARCH_ENGINES || runtimeSettingDefault('searchEngines'),
    searchEnginesFallback: process.env.SEARCH_ENGINES_FALLBACK || runtimeSettingDefault('searchEnginesFallback'),
    searxngBaseUrl: process.env.SEARXNG_BASE_URL || runtimeSettingDefault('searxngBaseUrl'),
    searxngDefaultBaseUrl: process.env.SEARXNG_DEFAULT_BASE_URL || runtimeSettingDefault('searxngBaseUrl'),
    serpTriageMinScore: parseIntEnv('SERP_TRIAGE_MIN_SCORE', convergenceSettingDefault('serpTriageMinScore', 3)),

    // --- API keys (direct env read) ---
    serperApiKey: process.env.SERPER_API_KEY || runtimeSettingDefault('serperApiKey'),
    eloSupabaseAnonKey: process.env.ELO_SUPABASE_ANON_KEY || '',
    eloSupabaseEndpoint: process.env.ELO_SUPABASE_ENDPOINT || runtimeSettingDefault('eloSupabaseEndpoint'),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',

    // --- LLM model / provider resolution chain ---
    llmForceRoleModelProvider: parseBoolEnv('LLM_FORCE_ROLE_MODEL_PROVIDER', false),
    llmProvider: explicitLlmProvider || registryDefaults.provider,
    llmApiKey: resolvedApiKey,
    llmBaseUrl: resolvedBaseUrl,
    llmModelExtract: explicitLlmModelExtract || defaultModel,
    llmModelPlan: explicitLlmModelPlan || explicitLlmModelExtract || defaultModel,
    llmModelReasoning: explicitLlmModelReasoning || explicitLlmModelExtract || defaultModel,
    llmPhaseOverridesJson: runtimeSettingDefault('llmPhaseOverridesJson'),
    llmProviderRegistryJson: runtimeSettingDefault('llmProviderRegistryJson'),
    llmPlanProvider: explicitLlmPlanProvider,
    llmPlanBaseUrl: explicitLlmPlanBaseUrl,
    llmPlanApiKey: process.env.LLM_PLAN_API_KEY || '',
    llmPlanFallbackModel: process.env.LLM_PLAN_FALLBACK_MODEL || '',
    llmModelCatalog: process.env.LLM_MODEL_CATALOG || '',
    llmModelPricingMap: mergeModelPricingMaps(
      buildDefaultModelPricingMap(),
      normalizeModelPricingMap(parseJsonEnv('LLM_MODEL_PRICING_JSON', {}))
    ),
    llmPricingAsOf: String(process.env.LLM_PRICING_AS_OF || LLM_PRICING_AS_OF),
    llmPricingSources: normalizePricingSources(parseJsonEnv('LLM_PRICING_SOURCES_JSON', LLM_PRICING_SOURCES)),
    llmTimeoutMs: timeoutMs,
    llmOutputTokenPresets: parseTokenPresetList(
      process.env.LLM_OUTPUT_TOKEN_PRESETS,
      [256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192]
    ),
    llmVerifyAggressiveAlways: parseBoolEnv('LLM_VERIFY_AGGRESSIVE_ALWAYS', false),
    llmVerifyAggressiveBatchCount: parseIntEnv('LLM_VERIFY_AGGRESSIVE_BATCH_COUNT', 3),
    llmModelOutputTokenMap: normalizeModelOutputTokenMap(parseJsonEnv('LLM_MODEL_OUTPUT_TOKEN_MAP_JSON', {})),

    // --- OpenAI aliases (computed from LLM chain) ---
    openaiApiKey: resolvedApiKey,
    openaiBaseUrl: resolvedBaseUrl,
    openaiModelExtract: explicitLlmModelExtract || defaultModel,
    openaiModelPlan: explicitLlmModelPlan || explicitLlmModelExtract || defaultModel,
    openaiModelWrite: explicitLlmModelPlan || explicitLlmModelExtract || defaultModel,
    openaiMaxInputChars: parseIntEnv('OPENAI_MAX_INPUT_CHARS', parseIntEnv('LLM_MAX_EVIDENCE_CHARS', 50_000)),
    openaiTimeoutMs: timeoutMs,

    // --- JSON map normalization + sub-fields ---
    fetchSchedulerInternalsMap: normalizedFetchSchedulerInternalsMap,
    fetchSchedulerInternalsMapJson: JSON.stringify(normalizedFetchSchedulerInternalsMap),
    fetchSchedulerDefaultDelayMs: parseIntEnv('FETCH_SCHEDULER_DEFAULT_DELAY_MS', normalizedFetchSchedulerInternalsMap.defaultDelayMs),
    fetchSchedulerDefaultConcurrency: parseIntEnv('FETCH_SCHEDULER_DEFAULT_CONCURRENCY', normalizedFetchSchedulerInternalsMap.defaultConcurrency),
    fetchSchedulerDefaultMaxRetries: parseIntEnv('FETCH_SCHEDULER_DEFAULT_MAX_RETRIES', normalizedFetchSchedulerInternalsMap.defaultMaxRetries),
    fetchSchedulerRetryWaitMs: parseIntEnv('FETCH_SCHEDULER_RETRY_WAIT_MS', normalizedFetchSchedulerInternalsMap.retryWaitMs),
    retrievalInternalsMap: normalizedRetrievalInternalsMap,
    retrievalEvidenceTierWeightMultiplier: normalizedRetrievalInternalsMap.evidenceTierWeightMultiplier,
    retrievalEvidenceDocWeightMultiplier: normalizedRetrievalInternalsMap.evidenceDocWeightMultiplier,
    retrievalEvidenceMethodWeightMultiplier: normalizedRetrievalInternalsMap.evidenceMethodWeightMultiplier,
    retrievalEvidencePoolMaxRows: normalizedRetrievalInternalsMap.evidencePoolMaxRows,
    retrievalSnippetsPerSourceCap: normalizedRetrievalInternalsMap.snippetsPerSourceCap,
    retrievalMaxHitsCap: normalizedRetrievalInternalsMap.maxHitsCap,
    retrievalEvidenceRefsLimit: normalizedRetrievalInternalsMap.evidenceRefsLimit,
    retrievalReasonBadgesLimit: normalizedRetrievalInternalsMap.reasonBadgesLimit,
    retrievalAnchorsLimit: normalizedRetrievalInternalsMap.retrievalAnchorsLimit,
    retrievalPrimeSourcesMaxCap: normalizedRetrievalInternalsMap.primeSourcesMaxCap,
    retrievalFallbackEvidenceMaxRows: normalizedRetrievalInternalsMap.fallbackEvidenceMaxRows,
    retrievalProvenanceOnlyMinRows: normalizedRetrievalInternalsMap.provenanceOnlyMinRows,
    evidencePackLimitsMap: normalizedEvidencePackLimitsMap,
    parsingConfidenceBaseMap: normalizedParsingConfidenceBaseMap,
    evidenceHeadingsLimit: normalizedEvidencePackLimitsMap.headingsLimit,
    evidenceChunkMaxLength: normalizedEvidencePackLimitsMap.chunkMaxLength,
    evidenceSpecSectionsLimit: normalizedEvidencePackLimitsMap.specSectionsLimit,
    articleExtractorDomainPolicyMap: normalizedArticleExtractorDomainPolicyMap,
    articleExtractorDomainPolicyMapJson,
    dynamicFetchPolicyMap: normalizedDynamicFetchPolicyMap,
    dynamicFetchPolicyMapJson,
    searchProfileCapMap: normalizeSearchProfileCapMap(parseJsonEnv('SEARCH_PROFILE_CAP_MAP_JSON', {})),
    searchProfileCapMapJson: JSON.stringify(normalizeSearchProfileCapMap(parseJsonEnv('SEARCH_PROFILE_CAP_MAP_JSON', {}))),

    // --- Chatmock ---
    chatmockDir: process.env.CHATMOCK_DIR || defaultChatmockDir(),
    chatmockComposeFile: process.env.CHATMOCK_COMPOSE_FILE || path.join(process.env.CHATMOCK_DIR || defaultChatmockDir(), 'docker-compose.yml'),

    // --- Category authority ---
    categoryAuthorityEnabled: parseBoolEnv('HELPER_FILES_ENABLED', runtimeSettingDefault('categoryAuthorityEnabled')),
    categoryAuthorityRoot: resolvedCategoryAuthorityRoot,

    // --- DefaultsOnly entries that configBuilder still needs ---
    discoveryEnabled: parseBoolEnv('DISCOVERY_ENABLED', runtimeSettingDefault('discoveryEnabled')),
    helperSupportiveFillMissing: parseBoolEnv('HELPER_SUPPORTIVE_FILL_MISSING', runtimeSettingDefault('helperSupportiveFillMissing')),
    indexingCategoryAuthorityEnabled: parseBoolEnv('INDEXING_HELPER_FILES_ENABLED', runtimeSettingDefault('indexingCategoryAuthorityEnabled')),
    runtimeControlFile: process.env.RUNTIME_CONTROL_FILE || runtimeSettingDefault('runtimeControlFile'),

    // --- Hardcoded constants ---
    searchGlobalRps: 0,
    searchGlobalBurst: 0,
    searchPerHostRps: 0,
    searchPerHostBurst: 0,
    runProfile: 'standard',
    fetchCandidateSources: true,
    consensusLlmWeightTier1: 0.60,
    consensusLlmWeightTier2: 0.40,
    consensusLlmWeightTier3: 0.20,
    consensusLlmWeightTier4: 0.15,
    consensusTier1Weight: 1.00,
    consensusTier2Weight: 0.80,
    consensusTier3Weight: 0.45,
    consensusTier4Weight: 0.25,
    retrievalMaxHitsPerField: 24,
    retrievalMaxPrimeSources: 10,
    retrievalIdentityFilterEnabled: true,
    automationQueueStorageEngine: 'sqlite',
    runtimeScreenshotMode: 'last_only',
    accuracyMode: 'production',
    chartExtractionEnabled: true,
    fieldRulesEngineEnforceEvidence: parseBoolEnv('FIELD_RULES_ENGINE_ENFORCE_EVIDENCE', true),
    runtimeOpsWorkbenchEnabled: parseBoolEnv('RUNTIME_OPS_WORKBENCH_ENABLED', true),
    indexingHelperFilesEnabled: false,
    helperFilesEnabled: true,
    helperSupportiveEnabled: true,
    helperSupportiveMaxSources: 12,
    helperAutoSeedTargets: true,
    helperActiveSyncLimit: 0,
    daemonGracefulShutdownTimeoutMs: 60000,
    indexingResumeRetryPersistLimit: parseIntEnv('INDEXING_RESUME_RETRY_PERSIST_LIMIT', 80),
    indexingResumeSuccessPersistLimit: parseIntEnv('INDEXING_RESUME_SUCCESS_PERSIST_LIMIT', 240),
    indexingReextractSeedLimit: parseIntEnv('INDEXING_REEXTRACT_SEED_LIMIT', 8),
    indexingSchemaPacketsSchemaRoot: process.env.INDEXING_SCHEMA_PACKETS_SCHEMA_ROOT || '',
  };

  return { cfg, explicitEnvKeys };
}
