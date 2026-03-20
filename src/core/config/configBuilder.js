// WHY: Config literal builder + manifest applicator extracted from config.js (Phase 7).
// createManifestApplicator encapsulates manifest state in a closure (no module-level let).
// buildRawConfig returns the raw cfg object + explicitEnvKeys before post-merge normalization.

import path from 'node:path';
import { hasS3EnvCreds, defaultChatmockDir } from './llmModelResolver.js';
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
  normalizeSerpRerankerWeightMap,
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

// WHY: Registry is SSOT for model→provider routing. Derive default model
// from the first enabled primary-role entry, not from which API keys
// happen to be present in the environment.
function resolveRegistryDefaults() {
  let entries = [];
  try {
    const json = runtimeSettingDefault('llmProviderRegistryJson', '[]');
    entries = JSON.parse(typeof json === 'string' ? json : JSON.stringify(json));
  } catch { /* empty */ }
  if (!Array.isArray(entries)) entries = [];

  for (const entry of entries) {
    if (!entry?.enabled) continue;
    const models = Array.isArray(entry.models) ? entry.models : [];
    const primary = models.find(m => m?.role === 'primary' && m?.modelId);
    if (primary) {
      const model = String(primary.modelId).trim();
      const provider = model.startsWith('gemini') ? 'gemini'
        : model.startsWith('deepseek') ? 'deepseek' : 'openai';
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
  const explicitHelperFilesRoot = String(process.env.HELPER_FILES_ROOT || '').trim();
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
  const explicitOpenAiBaseUrl = explicitEnvValue('OPENAI_BASE_URL', explicitEnvKeys);
  const explicitLlmModelExtract = explicitEnvValue('LLM_MODEL_EXTRACT', explicitEnvKeys);
  const explicitOpenAiModelExtract = explicitEnvValue('OPENAI_MODEL_EXTRACT', explicitEnvKeys);
  const explicitLlmModelPlan = explicitEnvValue('LLM_MODEL_PLAN', explicitEnvKeys);
  const explicitOpenAiModelPlan = explicitEnvValue('OPENAI_MODEL_PLAN', explicitEnvKeys);
  const explicitLlmModelReasoning = explicitEnvValue('LLM_MODEL_REASONING', explicitEnvKeys);
  const explicitLlmPlanProvider = explicitEnvValue('LLM_PLAN_PROVIDER', explicitEnvKeys).trim().toLowerCase();
  const explicitLlmPlanBaseUrl = explicitEnvValue('LLM_PLAN_BASE_URL', explicitEnvKeys);

  const maxCandidateUrlsFromEnv =
    process.env.MAX_CANDIDATE_URLS_PER_PRODUCT ||
    process.env.MAX_CANDIDATE_URLS;

  const parsedCandidateUrls = Number.parseInt(String(maxCandidateUrlsFromEnv || ''), 10);
  const registryDefaults = resolveRegistryDefaults();
  const defaultModel = explicitLlmModelExtract || explicitOpenAiModelExtract || registryDefaults.model;
  const resolvedApiKey = resolveBootstrapApiKey(registryDefaults.provider);
  const resolvedBaseUrl = explicitLlmBaseUrl || explicitOpenAiBaseUrl || registryDefaults.baseUrl;
  const timeoutMs = parseIntEnv('LLM_TIMEOUT_MS', parseIntEnv('OPENAI_TIMEOUT_MS', runtimeSettingDefault('llmTimeoutMs', 40_000)));
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
    explicitHelperFilesRoot ||
    process.env.CATEGORY_AUTHORITY_ROOT ||
    process.env.HELPER_FILES_ROOT ||
    'category_authority';

  const cfg = {
    awsRegion: process.env.AWS_REGION || runtimeSettingDefault('awsRegion', 'us-east-2'),
    s3Bucket: process.env.S3_BUCKET || runtimeSettingDefault('s3Bucket', 'my-spec-harvester-data'),
    s3InputPrefix: (process.env.S3_INPUT_PREFIX || runtimeSettingDefault('s3InputPrefix', 'specs/inputs')).replace(/\/+$/, ''),
    s3OutputPrefix: (process.env.S3_OUTPUT_PREFIX || runtimeSettingDefault('s3OutputPrefix', 'specs/outputs')).replace(/\/+$/, ''),
    maxUrlsPerProduct: parseIntEnv('MAX_URLS_PER_PRODUCT', runtimeSettingDefault('maxUrlsPerProduct', 20)),
    maxCandidateUrls: Number.isFinite(parsedCandidateUrls) ? parsedCandidateUrls : runtimeSettingDefault('maxCandidateUrls', 50),
    maxPagesPerDomain: parseIntEnv('MAX_PAGES_PER_DOMAIN', runtimeSettingDefault('maxPagesPerDomain', 2)),
    maxRunSeconds: parseIntEnv('MAX_RUN_SECONDS', runtimeSettingDefault('maxRunSeconds', 300)),
    maxJsonBytes: parseIntEnv('MAX_JSON_BYTES', runtimeSettingDefault('maxJsonBytes', 2_000_000)),
    maxPdfBytes: parseIntEnv('MAX_PDF_BYTES', runtimeSettingDefault('maxPdfBytes', 8_000_000)),
    pdfBackendRouterEnabled: parseBoolEnv('PDF_BACKEND_ROUTER_ENABLED', runtimeSettingDefault('pdfBackendRouterEnabled', false)),
    pdfPreferredBackend: process.env.PDF_PREFERRED_BACKEND || runtimeSettingDefault('pdfPreferredBackend', 'auto'),
    pdfBackendRouterTimeoutMs: parseIntEnv('PDF_BACKEND_ROUTER_TIMEOUT_MS', runtimeSettingDefault('pdfBackendRouterTimeoutMs', 120_000)),
    pdfBackendRouterMaxPages: parseIntEnv('PDF_BACKEND_ROUTER_MAX_PAGES', runtimeSettingDefault('pdfBackendRouterMaxPages', 60)),
    pdfBackendRouterMaxPairs: parseIntEnv('PDF_BACKEND_ROUTER_MAX_PAIRS', runtimeSettingDefault('pdfBackendRouterMaxPairs', 5000)),
    pdfBackendRouterMaxTextPreviewChars: parseIntEnv('PDF_BACKEND_ROUTER_MAX_TEXT_PREVIEW_CHARS', runtimeSettingDefault('pdfBackendRouterMaxTextPreviewChars', 20_000)),
    scannedPdfOcrEnabled: parseBoolEnv('SCANNED_PDF_OCR_ENABLED', runtimeSettingDefault('scannedPdfOcrEnabled', true)),
    scannedPdfOcrBackend: process.env.SCANNED_PDF_OCR_BACKEND || runtimeSettingDefault('scannedPdfOcrBackend', 'auto'),
    scannedPdfOcrMaxPages: parseIntEnv('SCANNED_PDF_OCR_MAX_PAGES', runtimeSettingDefault('scannedPdfOcrMaxPages', 4)),
    scannedPdfOcrMaxPairs: parseIntEnv('SCANNED_PDF_OCR_MAX_PAIRS', runtimeSettingDefault('scannedPdfOcrMaxPairs', 800)),
    scannedPdfOcrMinCharsPerPage: parseIntEnv('SCANNED_PDF_OCR_MIN_CHARS_PER_PAGE', runtimeSettingDefault('scannedPdfOcrMinCharsPerPage', 30)),
    scannedPdfOcrMinLinesPerPage: parseIntEnv('SCANNED_PDF_OCR_MIN_LINES_PER_PAGE', runtimeSettingDefault('scannedPdfOcrMinLinesPerPage', 2)),
    scannedPdfOcrMinConfidence: parseFloatEnv('SCANNED_PDF_OCR_MIN_CONFIDENCE', runtimeSettingDefault('scannedPdfOcrMinConfidence', 0.5)),
    concurrency: parseIntEnv('CONCURRENCY', runtimeSettingDefault('fetchConcurrency', 4)),
    perHostMinDelayMs: parseIntEnv('PER_HOST_MIN_DELAY_MS', runtimeSettingDefault('perHostMinDelayMs', 1500)),
    searchGlobalRps: 0,
    searchGlobalBurst: 0,
    searchPerHostRps: 0,
    searchPerHostBurst: 0,
    domainRequestRps: parseIntEnv('DOMAIN_REQUEST_RPS', runtimeSettingDefault('domainRequestRps', 0)),
    domainRequestBurst: parseIntEnv('DOMAIN_REQUEST_BURST', runtimeSettingDefault('domainRequestBurst', 0)),
    globalRequestRps: parseIntEnv('GLOBAL_REQUEST_RPS', runtimeSettingDefault('globalRequestRps', 0)),
    globalRequestBurst: parseIntEnv('GLOBAL_REQUEST_BURST', runtimeSettingDefault('globalRequestBurst', 0)),
    fetchPerHostConcurrencyCap: parseIntEnv('FETCH_PER_HOST_CONCURRENCY_CAP', runtimeSettingDefault('fetchPerHostConcurrencyCap', 1)),
    fetchSchedulerMaxRetries: parseIntEnv('FETCH_SCHEDULER_MAX_RETRIES', runtimeSettingDefault('fetchSchedulerMaxRetries', 1)),
    fetchSchedulerInternalsMap: normalizedFetchSchedulerInternalsMap,
    fetchSchedulerInternalsMapJson: JSON.stringify(normalizedFetchSchedulerInternalsMap),
    fetchSchedulerDefaultDelayMs: parseIntEnv('FETCH_SCHEDULER_DEFAULT_DELAY_MS', normalizedFetchSchedulerInternalsMap.defaultDelayMs),
    fetchSchedulerDefaultConcurrency: parseIntEnv('FETCH_SCHEDULER_DEFAULT_CONCURRENCY', normalizedFetchSchedulerInternalsMap.defaultConcurrency),
    fetchSchedulerDefaultMaxRetries: parseIntEnv('FETCH_SCHEDULER_DEFAULT_MAX_RETRIES', normalizedFetchSchedulerInternalsMap.defaultMaxRetries),
    fetchSchedulerRetryWaitMs: parseIntEnv('FETCH_SCHEDULER_RETRY_WAIT_MS', normalizedFetchSchedulerInternalsMap.retryWaitMs),
    userAgent:
      process.env.USER_AGENT ||
      SETTINGS_DEFAULTS.runtime.userAgent ||
      DEFAULT_USER_AGENT,
    localMode: parseBoolEnv('LOCAL_MODE', runtimeSettingDefault('localMode', false)),
    dryRun: parseBoolEnv('DRY_RUN', runtimeSettingDefault('dryRun', false)),
    outputMode: envOutputMode,
    mirrorToS3: parseBoolEnv('MIRROR_TO_S3', runtimeSettingDefault('mirrorToS3', defaultMirrorToS3)),
    mirrorToS3Input: parseBoolEnv('MIRROR_TO_S3_INPUT', runtimeSettingDefault('mirrorToS3Input', false)),
    localInputRoot: process.env.LOCAL_INPUT_ROOT || process.env.LOCAL_S3_ROOT || runtimeSettingDefault('localInputRoot', 'fixtures/s3'),
    localOutputRoot: process.env.LOCAL_OUTPUT_ROOT || defaultLocalOutputRoot(),
    runtimeEventsKey: process.env.RUNTIME_EVENTS_KEY || runtimeSettingDefault('runtimeEventsKey', '_runtime/events.jsonl'),
    writeMarkdownSummary: parseBoolEnv('WRITE_MARKDOWN_SUMMARY', runtimeSettingDefault('writeMarkdownSummary', true)),
    runProfile: 'standard',
    discoveryEnabled: parseBoolEnv('DISCOVERY_ENABLED', runtimeSettingDefault('discoveryEnabled', true)),
    fetchCandidateSources: parseBoolEnv('FETCH_CANDIDATE_SOURCES', runtimeSettingDefault('fetchCandidateSources', true)),
    discoveryMaxQueries: parseIntEnv('DISCOVERY_MAX_QUERIES', runtimeSettingDefault('discoveryMaxQueries', 10)),
    discoveryResultsPerQuery: 10, // Hardcoded — fixed value, not tunable
    discoveryMaxDiscovered: parseIntEnv('DISCOVERY_MAX_DISCOVERED', runtimeSettingDefault('discoveryMaxDiscovered', 80)),
    discoveryQueryConcurrency: 2, // Hardcoded — tuned for 2s inter-query delay
    searchEngines: process.env.SEARCH_ENGINES || process.env.SEARCH_PROVIDER || runtimeSettingDefault('searchEngines', 'google'),
    searchEnginesFallback: process.env.SEARCH_ENGINES_FALLBACK || runtimeSettingDefault('searchEnginesFallback', 'bing'),
    searxngBaseUrl: process.env.SEARXNG_BASE_URL || process.env.SEARXNG_URL || runtimeSettingDefault('searxngBaseUrl', 'http://127.0.0.1:8080'),
    searxngDefaultBaseUrl: process.env.SEARXNG_DEFAULT_BASE_URL || runtimeSettingDefault('searxngBaseUrl', 'http://127.0.0.1:8080'),
    searxngMinQueryIntervalMs: parseIntEnv('SEARXNG_MIN_QUERY_INTERVAL_MS', runtimeSettingDefault('searxngMinQueryIntervalMs', 2000)),
    // Google Crawlee settings
    googleSearchProxyUrlsJson: runtimeSettingDefault('googleSearchProxyUrlsJson', '[]'),
    googleSearchTimeoutMs: parseIntEnv('GOOGLE_SEARCH_TIMEOUT_MS', runtimeSettingDefault('googleSearchTimeoutMs', 30000)),
    googleSearchMinQueryIntervalMs: parseIntEnv('GOOGLE_SEARCH_MIN_QUERY_INTERVAL_MS', runtimeSettingDefault('googleSearchMinQueryIntervalMs', 1000)),
    googleSearchMaxRetries: parseIntEnv('GOOGLE_SEARCH_MAX_RETRIES', runtimeSettingDefault('googleSearchMaxRetries', 1)),
    googleSearchScreenshotsEnabled: parseBoolEnv('GOOGLE_SEARCH_SCREENSHOTS_ENABLED', runtimeSettingDefault('googleSearchScreenshotsEnabled', true)),
    eloSupabaseAnonKey: process.env.ELO_SUPABASE_ANON_KEY || '',
    eloSupabaseEndpoint: process.env.ELO_SUPABASE_ENDPOINT || runtimeSettingDefault('eloSupabaseEndpoint', ''),
    llmWriteSummary: parseBoolEnv('LLM_WRITE_SUMMARY', runtimeSettingDefault('llmWriteSummary', false)),
    llmForceRoleModelProvider: parseBoolEnv('LLM_FORCE_ROLE_MODEL_PROVIDER', false),
    llmProvider: explicitLlmProvider || registryDefaults.provider,
    llmApiKey: resolvedApiKey,
    llmBaseUrl: resolvedBaseUrl,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
    llmModelExtract: explicitLlmModelExtract || explicitOpenAiModelExtract || defaultModel,
    llmModelPlan: explicitLlmModelPlan || explicitLlmModelExtract || explicitOpenAiModelPlan || explicitOpenAiModelExtract || defaultModel,
    llmModelReasoning:
      explicitLlmModelReasoning ||
      explicitLlmModelExtract ||
      explicitOpenAiModelExtract ||
      defaultModel,
    llmPlanUseReasoning: parseBoolEnv('LLM_PLAN_USE_REASONING', runtimeSettingDefault('llmPlanUseReasoning', false)),
    llmReasoningFallbackModel: process.env.LLM_REASONING_FALLBACK_MODEL || runtimeSettingDefault('llmReasoningFallbackModel', ''),
    llmMaxOutputTokensReasoningFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_REASONING_FALLBACK', runtimeSettingDefault('llmMaxOutputTokensReasoningFallback', 16384)),
    llmPhaseOverridesJson: runtimeSettingDefault('llmPhaseOverridesJson', '{}'),
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
    chatmockDir: process.env.CHATMOCK_DIR || defaultChatmockDir(),
    chatmockComposeFile: process.env.CHATMOCK_COMPOSE_FILE
      || path.join(process.env.CHATMOCK_DIR || defaultChatmockDir(), 'docker-compose.yml'),
    consensusLlmWeightTier1: 0.60,
    consensusLlmWeightTier2: 0.40,
    consensusLlmWeightTier3: 0.20,
    consensusLlmWeightTier4: 0.15,
    consensusTier1Weight: 1.00,
    consensusTier2Weight: 0.80,
    consensusTier3Weight: 0.45,
    consensusTier4Weight: 0.25,
    serpTriageMinScore: parseIntEnv('SERP_TRIAGE_MIN_SCORE', convergenceSettingDefault('serpTriageMinScore', 3)),
    retrievalMaxHitsPerField: 24,
    retrievalMaxPrimeSources: 10,
    retrievalIdentityFilterEnabled: true,
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
    specDbDir: process.env.SPEC_DB_DIR || runtimeSettingDefault('specDbDir', '.specfactory_tmp'),
    frontierDbPath: process.env.FRONTIER_DB_PATH || runtimeSettingDefault('frontierDbPath', '_intel/frontier/frontier.json'),
    frontierStripTrackingParams: parseBoolEnv('FRONTIER_STRIP_TRACKING_PARAMS', runtimeSettingDefault('frontierStripTrackingParams', true)),
    frontierQueryCooldownSeconds: parseIntEnv('FRONTIER_QUERY_COOLDOWN_SECONDS', runtimeSettingDefault('frontierQueryCooldownSeconds', 6 * 60 * 60)),
    frontierCooldown404Seconds: parseIntEnv('FRONTIER_COOLDOWN_404', runtimeSettingDefault('frontierCooldown404Seconds', 72 * 60 * 60)),
    frontierCooldown404RepeatSeconds: parseIntEnv('FRONTIER_COOLDOWN_404_REPEAT', runtimeSettingDefault('frontierCooldown404RepeatSeconds', 14 * 24 * 60 * 60)),
    frontierCooldown410Seconds: parseIntEnv('FRONTIER_COOLDOWN_410', runtimeSettingDefault('frontierCooldown410Seconds', 90 * 24 * 60 * 60)),
    frontierCooldownTimeoutSeconds: parseIntEnv('FRONTIER_COOLDOWN_TIMEOUT', runtimeSettingDefault('frontierCooldownTimeoutSeconds', 6 * 60 * 60)),
    frontierCooldown403BaseSeconds: parseIntEnv('FRONTIER_COOLDOWN_403_BASE', runtimeSettingDefault('frontierCooldown403BaseSeconds', 30 * 60)),
    frontierCooldown429BaseSeconds: parseIntEnv('FRONTIER_COOLDOWN_429_BASE', runtimeSettingDefault('frontierCooldown429BaseSeconds', 10 * 60)),
    frontierBackoffMaxExponent: parseIntEnv('FRONTIER_BACKOFF_MAX_EXPONENT', runtimeSettingDefault('frontierBackoffMaxExponent', 4)),
    frontierPathPenaltyNotfoundThreshold: parseIntEnv('FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD', runtimeSettingDefault('frontierPathPenaltyNotfoundThreshold', 3)),
    frontierBlockedDomainThreshold: parseIntEnv('FRONTIER_BLOCKED_DOMAIN_THRESHOLD', runtimeSettingDefault('frontierBlockedDomainThreshold', 2)),
    repairDedupeRule: normalizeRepairDedupeRule(process.env['REPAIR_DEDUPE_RULE'] || REPAIR_DEDUPE_RULE_DEFAULT),
    automationQueueStorageEngine: 'sqlite',
    runtimeTraceEnabled: parseBoolEnv('RUNTIME_TRACE_ENABLED', runtimeSettingDefault('runtimeTraceEnabled', true)),
    runtimeTraceFetchRing: parseIntEnv('RUNTIME_TRACE_FETCH_RING', runtimeSettingDefault('runtimeTraceFetchRing', 30)),
    runtimeTraceLlmRing: parseIntEnv('RUNTIME_TRACE_LLM_RING', runtimeSettingDefault('runtimeTraceLlmRing', 50)),
    runtimeTraceLlmPayloads: parseBoolEnv('RUNTIME_TRACE_LLM_PAYLOADS', runtimeSettingDefault('runtimeTraceLlmPayloads', true)),
    indexingResumeMode: (process.env.INDEXING_RESUME_MODE || runtimeSettingDefault('indexingResumeMode', 'auto')).trim().toLowerCase(),
    indexingResumeMaxAgeHours: parseIntEnv('INDEXING_RESUME_MAX_AGE_HOURS', runtimeSettingDefault('indexingResumeMaxAgeHours', 48)),
    indexingResumeSeedLimit: parseIntEnv('INDEXING_RESUME_SEED_LIMIT', runtimeSettingDefault('indexingResumeSeedLimit', 24)),
    indexingResumePersistLimit: parseIntEnv('INDEXING_RESUME_PERSIST_LIMIT', runtimeSettingDefault('indexingResumePersistLimit', 160)),
    indexingResumeRetryPersistLimit: parseIntEnv('INDEXING_RESUME_RETRY_PERSIST_LIMIT', 80),
    indexingResumeSuccessPersistLimit: parseIntEnv('INDEXING_RESUME_SUCCESS_PERSIST_LIMIT', 240),
    indexingSchemaPacketsValidationEnabled: parseBoolEnv('INDEXING_SCHEMA_PACKETS_VALIDATION_ENABLED', runtimeSettingDefault('indexingSchemaPacketsValidationEnabled', true)),
    indexingSchemaPacketsValidationStrict: parseBoolEnv('INDEXING_SCHEMA_PACKETS_VALIDATION_STRICT', runtimeSettingDefault('indexingSchemaPacketsValidationStrict', true)),
    indexingSchemaPacketsSchemaRoot: process.env.INDEXING_SCHEMA_PACKETS_SCHEMA_ROOT || '',
    indexingReextractEnabled: parseBoolEnv('INDEXING_REEXTRACT_ENABLED', runtimeSettingDefault('indexingReextractEnabled', true)),
    indexingReextractAfterHours: parseIntEnv('INDEXING_REEXTRACT_AFTER_HOURS', runtimeSettingDefault('indexingReextractAfterHours', 24)),
    indexingReextractSeedLimit: parseIntEnv('INDEXING_REEXTRACT_SEED_LIMIT', 8),
    indexingCategoryAuthorityEnabled: parseBoolEnv('INDEXING_HELPER_FILES_ENABLED', runtimeSettingDefault('indexingCategoryAuthorityEnabled', false)),
    indexingHelperFilesEnabled: false,
    runtimeControlFile: process.env.RUNTIME_CONTROL_FILE || runtimeSettingDefault('runtimeControlFile', '_runtime/control/runtime_overrides.json'),
    runtimeScreenshotMode: 'last_only',
    llmTimeoutMs: timeoutMs,
    openaiApiKey: resolvedApiKey,
    openaiBaseUrl: resolvedBaseUrl,
    openaiModelExtract: explicitOpenAiModelExtract || explicitLlmModelExtract || defaultModel,
    openaiModelPlan:
      explicitOpenAiModelPlan ||
      explicitLlmModelPlan ||
      explicitOpenAiModelExtract ||
      explicitLlmModelExtract ||
      defaultModel,
    openaiModelWrite:
      explicitLlmModelPlan ||
      explicitLlmModelExtract ||
      explicitOpenAiModelExtract ||
      defaultModel,
    openaiMaxInputChars: parseIntEnv(
      'OPENAI_MAX_INPUT_CHARS',
      parseIntEnv('LLM_MAX_EVIDENCE_CHARS', 50_000)
    ),
    openaiTimeoutMs: timeoutMs,
    llmReasoningMode: parseBoolEnv('LLM_REASONING_MODE', runtimeSettingDefault('llmReasoningMode', true)),
    llmReasoningBudget: parseIntEnv('LLM_REASONING_BUDGET', runtimeSettingDefault('llmReasoningBudget', 32768)),
    llmMaxTokens: parseIntEnv('LLM_MAX_TOKENS', runtimeSettingDefault('llmMaxTokens', 16384)),
    llmExtractMaxSnippetsPerBatch: parseIntEnv('LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH', runtimeSettingDefault('llmExtractMaxSnippetsPerBatch', 4)),
    llmExtractMaxSnippetChars: parseIntEnv('LLM_EXTRACT_MAX_SNIPPET_CHARS', runtimeSettingDefault('llmExtractMaxSnippetChars', 900)),
    llmExtractSkipLowSignal: parseBoolEnv('LLM_EXTRACT_SKIP_LOW_SIGNAL', runtimeSettingDefault('llmExtractSkipLowSignal', true)),
    llmVerifyMode: parseBoolEnv('LLM_VERIFY_MODE', runtimeSettingDefault('llmVerifyMode', false)),
    llmVerifySampleRate: parseIntEnv('LLM_VERIFY_SAMPLE_RATE', runtimeSettingDefault('llmVerifySampleRate', 10)),
    llmVerifyAggressiveAlways: parseBoolEnv('LLM_VERIFY_AGGRESSIVE_ALWAYS', false),
    llmVerifyAggressiveBatchCount: parseIntEnv('LLM_VERIFY_AGGRESSIVE_BATCH_COUNT', 3),
    llmMaxOutputTokens: parseIntEnv('LLM_MAX_OUTPUT_TOKENS', runtimeSettingDefault('llmMaxOutputTokens', 1200)),
    llmMaxOutputTokensPlan: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_PLAN', runtimeSettingDefault('llmMaxOutputTokensPlan', 4096)),
    llmMaxOutputTokensReasoning: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_REASONING', runtimeSettingDefault('llmMaxOutputTokensReasoning', 32768)),
    llmMaxOutputTokensPlanFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK', runtimeSettingDefault('llmMaxOutputTokensPlanFallback', 1200)),
    llmOutputTokenPresets: parseTokenPresetList(
      process.env.LLM_OUTPUT_TOKEN_PRESETS,
      [256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192]
    ),
    llmCostInputPer1M: parseFloatEnv('LLM_COST_INPUT_PER_1M', runtimeSettingDefault('llmCostInputPer1M', 1.25)),
    llmCostOutputPer1M: parseFloatEnv('LLM_COST_OUTPUT_PER_1M', runtimeSettingDefault('llmCostOutputPer1M', 10)),
    llmCostCachedInputPer1M: parseFloatEnv('LLM_COST_CACHED_INPUT_PER_1M', runtimeSettingDefault('llmCostCachedInputPer1M', 0.125)),
    llmCostInputPer1MDeepseekChat: parseFloatEnv('LLM_COST_INPUT_PER_1M_DEEPSEEK_CHAT', -1),
    llmCostOutputPer1MDeepseekChat: parseFloatEnv('LLM_COST_OUTPUT_PER_1M_DEEPSEEK_CHAT', -1),
    llmCostCachedInputPer1MDeepseekChat: parseFloatEnv('LLM_COST_CACHED_INPUT_PER_1M_DEEPSEEK_CHAT', -1),
    llmCostInputPer1MDeepseekReasoner: parseFloatEnv('LLM_COST_INPUT_PER_1M_DEEPSEEK_REASONER', -1),
    llmCostOutputPer1MDeepseekReasoner: parseFloatEnv('LLM_COST_OUTPUT_PER_1M_DEEPSEEK_REASONER', -1),
    llmCostCachedInputPer1MDeepseekReasoner: parseFloatEnv('LLM_COST_CACHED_INPUT_PER_1M_DEEPSEEK_REASONER', -1),
    llmMonthlyBudgetUsd: parseFloatEnv('LLM_MONTHLY_BUDGET_USD', runtimeSettingDefault('llmMonthlyBudgetUsd', 200)),
    llmPerProductBudgetUsd: parseFloatEnv('LLM_PER_PRODUCT_BUDGET_USD', runtimeSettingDefault('llmPerProductBudgetUsd', 0.1)),
    llmMaxBatchesPerProduct: parseIntEnv('LLM_MAX_BATCHES_PER_PRODUCT', runtimeSettingDefault('llmMaxBatchesPerProduct', 7)),
    llmExtractionCacheDir: process.env.LLM_EXTRACTION_CACHE_DIR || runtimeSettingDefault('llmExtractionCacheDir', '.specfactory_tmp/llm_cache'),
    llmExtractionCacheTtlMs: parseIntEnv('LLM_EXTRACTION_CACHE_TTL_MS', runtimeSettingDefault('llmExtractionCacheTtlMs', 7 * 24 * 60 * 60 * 1000)),
    llmMaxCallsPerProductTotal: parseIntEnv('LLM_MAX_CALLS_PER_PRODUCT_TOTAL', runtimeSettingDefault('llmMaxCallsPerProductTotal', 14)),

    llmMaxCallsPerRound: parseIntEnv('LLM_MAX_CALLS_PER_ROUND', runtimeSettingDefault('llmMaxCallsPerRound', 4)),
    llmMaxEvidenceChars: parseIntEnv('LLM_MAX_EVIDENCE_CHARS', runtimeSettingDefault('llmMaxEvidenceChars', 60_000)),
    deepseekModelVersion: process.env.DEEPSEEK_MODEL_VERSION || '',
    deepseekContextLength: process.env.DEEPSEEK_CONTEXT_LENGTH || '',
    deepseekChatMaxOutputDefault: parseIntEnv('DEEPSEEK_CHAT_MAX_OUTPUT_DEFAULT', 2048),
    deepseekChatMaxOutputMaximum: parseIntEnv('DEEPSEEK_CHAT_MAX_OUTPUT_MAXIMUM', 4096),
    deepseekReasonerMaxOutputDefault: parseIntEnv('DEEPSEEK_REASONER_MAX_OUTPUT_DEFAULT', 4096),
    deepseekReasonerMaxOutputMaximum: parseIntEnv('DEEPSEEK_REASONER_MAX_OUTPUT_MAXIMUM', 8192),
    llmModelOutputTokenMap: normalizeModelOutputTokenMap(parseJsonEnv('LLM_MODEL_OUTPUT_TOKEN_MAP_JSON', {})),
    deepseekFeatures: process.env.DEEPSEEK_FEATURES || '',
    accuracyMode: 'production',
    importsRoot: process.env.IMPORTS_ROOT || runtimeSettingDefault('importsRoot', 'imports'),
    importsPollSeconds: parseIntEnv('IMPORTS_POLL_SECONDS', runtimeSettingDefault('importsPollSeconds', 10)),
    daemonConcurrency: parseIntEnv('DAEMON_CONCURRENCY', runtimeSettingDefault('daemonConcurrency', 3)),
    reCrawlStaleAfterDays: parseIntEnv('RECRAWL_STALE_AFTER_DAYS', runtimeSettingDefault('reCrawlStaleAfterDays', 30)),
    daemonGracefulShutdownTimeoutMs: 60000,
    driftDetectionEnabled: parseBoolEnv('DRIFT_DETECTION_ENABLED', runtimeSettingDefault('driftDetectionEnabled', true)),
    driftPollSeconds: parseIntEnv('DRIFT_POLL_SECONDS', runtimeSettingDefault('driftPollSeconds', 24 * 60 * 60)),
    driftScanMaxProducts: parseIntEnv('DRIFT_SCAN_MAX_PRODUCTS', runtimeSettingDefault('driftScanMaxProducts', 250)),
    driftAutoRepublish: parseBoolEnv('DRIFT_AUTO_REPUBLISH', runtimeSettingDefault('driftAutoRepublish', true)),
    categoryAuthorityEnabled: parseBoolEnv('HELPER_FILES_ENABLED', runtimeSettingDefault('categoryAuthorityEnabled', true)),
    helperFilesEnabled: true,
    categoryAuthorityRoot: resolvedCategoryAuthorityRoot,
    [`helper${'FilesRoot'}`]: resolvedCategoryAuthorityRoot || process.env.HELPER_FILES_ROOT || 'category_authority',
    helperSupportiveEnabled: true,
    helperSupportiveFillMissing: parseBoolEnv('HELPER_SUPPORTIVE_FILL_MISSING', runtimeSettingDefault('helperSupportiveFillMissing', true)),
    helperSupportiveMaxSources: 12,
    helperAutoSeedTargets: true,
    helperActiveSyncLimit: 0,
    graphqlReplayEnabled: parseBoolEnv('GRAPHQL_REPLAY_ENABLED', runtimeSettingDefault('graphqlReplayEnabled', true)),
    maxGraphqlReplays: parseIntEnv('MAX_GRAPHQL_REPLAYS', runtimeSettingDefault('maxGraphqlReplays', 5)),
    maxNetworkResponsesPerPage: parseIntEnv('MAX_NETWORK_RESPONSES_PER_PAGE', runtimeSettingDefault('maxNetworkResponsesPerPage', 1200)),
    pageGotoTimeoutMs: parseIntEnv('PAGE_GOTO_TIMEOUT_MS', runtimeSettingDefault('pageGotoTimeoutMs', 12000)),
    pageNetworkIdleTimeoutMs: parseIntEnv('PAGE_NETWORK_IDLE_TIMEOUT_MS', runtimeSettingDefault('pageNetworkIdleTimeoutMs', 4_000)),
    postLoadWaitMs: parseIntEnv('POST_LOAD_WAIT_MS', runtimeSettingDefault('postLoadWaitMs', 200)),
    articleExtractorMinChars: parseIntEnv('ARTICLE_EXTRACTOR_MIN_CHARS', runtimeSettingDefault('articleExtractorMinChars', 700)),
    articleExtractorMinScore: parseIntEnv('ARTICLE_EXTRACTOR_MIN_SCORE', runtimeSettingDefault('articleExtractorMinScore', 45)),
    articleExtractorMaxChars: parseIntEnv('ARTICLE_EXTRACTOR_MAX_CHARS', runtimeSettingDefault('articleExtractorMaxChars', 24_000)),
    articleExtractorDomainPolicyMap: normalizedArticleExtractorDomainPolicyMap,
    articleExtractorDomainPolicyMapJson,
    staticDomMode: normalizeStaticDomMode(process.env.STATIC_DOM_MODE || runtimeSettingDefault('staticDomMode', 'cheerio')),
    staticDomTargetMatchThreshold: parseFloatEnv('STATIC_DOM_TARGET_MATCH_THRESHOLD', runtimeSettingDefault('staticDomTargetMatchThreshold', 0.55)),
    staticDomMaxEvidenceSnippets: parseIntEnv('STATIC_DOM_MAX_EVIDENCE_SNIPPETS', runtimeSettingDefault('staticDomMaxEvidenceSnippets', 120)),
    dynamicCrawleeEnabled: parseBoolEnv('DYNAMIC_CRAWLEE_ENABLED', runtimeSettingDefault('dynamicCrawleeEnabled', true)),
    crawleeHeadless: parseBoolEnv('CRAWLEE_HEADLESS', runtimeSettingDefault('crawleeHeadless', true)),
    crawleeRequestHandlerTimeoutSecs: parseIntEnv('CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS', runtimeSettingDefault('crawleeRequestHandlerTimeoutSecs', 75)),
    dynamicFetchRetryBudget: parseIntEnv('DYNAMIC_FETCH_RETRY_BUDGET', runtimeSettingDefault('dynamicFetchRetryBudget', 2)),
    dynamicFetchRetryBackoffMs: parseIntEnv('DYNAMIC_FETCH_RETRY_BACKOFF_MS', runtimeSettingDefault('dynamicFetchRetryBackoffMs', 1200)),
    dynamicFetchPolicyMap: normalizedDynamicFetchPolicyMap,
    dynamicFetchPolicyMapJson,
    searchProfileCapMap: normalizeSearchProfileCapMap(
      parseJsonEnv('SEARCH_PROFILE_CAP_MAP_JSON', {})
    ),
    searchProfileCapMapJson: JSON.stringify(
      normalizeSearchProfileCapMap(parseJsonEnv('SEARCH_PROFILE_CAP_MAP_JSON', {}))
    ),
    serpRerankerWeightMap: normalizeSerpRerankerWeightMap(
      parseJsonEnv('SERP_RERANKER_WEIGHT_MAP_JSON', {})
    ),
    serpRerankerWeightMapJson: JSON.stringify(
      normalizeSerpRerankerWeightMap(parseJsonEnv('SERP_RERANKER_WEIGHT_MAP_JSON', {}))
    ),
    fetchBudgetMs: parseIntEnv('FETCH_BUDGET_MS', runtimeSettingDefault('fetchBudgetMs', 45_000)),
    preferHttpFetcher: parseBoolEnv('PREFER_HTTP_FETCHER', runtimeSettingDefault('preferHttpFetcher', true)),
    capturePageScreenshotEnabled: parseBoolEnv('CAPTURE_PAGE_SCREENSHOT_ENABLED', runtimeSettingDefault('capturePageScreenshotEnabled', true)),
    capturePageScreenshotFormat: String(process.env.CAPTURE_PAGE_SCREENSHOT_FORMAT || 'jpeg').trim().toLowerCase() === 'png'
      ? 'png'
      : 'jpeg',
    capturePageScreenshotQuality: parseIntEnv('CAPTURE_PAGE_SCREENSHOT_QUALITY', runtimeSettingDefault('capturePageScreenshotQuality', 50)),
    capturePageScreenshotMaxBytes: parseIntEnv('CAPTURE_PAGE_SCREENSHOT_MAX_BYTES', runtimeSettingDefault('capturePageScreenshotMaxBytes', 5_000_000)),
    capturePageScreenshotSelectors: String(
      process.env.CAPTURE_PAGE_SCREENSHOT_SELECTORS ||
      'table,[data-spec-table],.specs-table,.spec-table,.specifications'
    ).trim(),
    chartExtractionEnabled: true,
    domSnippetMaxChars: parseIntEnv('DOM_SNIPPET_MAX_CHARS', runtimeSettingDefault('domSnippetMaxChars', 3600)),
    autoScrollEnabled: parseBoolEnv('AUTO_SCROLL_ENABLED', runtimeSettingDefault('autoScrollEnabled', false)),
    autoScrollPasses: parseIntEnv('AUTO_SCROLL_PASSES', runtimeSettingDefault('autoScrollPasses', 0)),
    autoScrollDelayMs: parseIntEnv('AUTO_SCROLL_DELAY_MS', runtimeSettingDefault('autoScrollDelayMs', 900)),
    robotsTxtCompliant: parseBoolEnv('ROBOTS_TXT_COMPLIANT', runtimeSettingDefault('robotsTxtCompliant', true)),
    robotsTxtTimeoutMs: parseIntEnv('ROBOTS_TXT_TIMEOUT_MS', runtimeSettingDefault('robotsTxtTimeoutMs', 6000)),
    endpointSignalLimit: parseIntEnv('ENDPOINT_SIGNAL_LIMIT', runtimeSettingDefault('endpointSignalLimit', 30)),
    endpointSuggestionLimit: parseIntEnv('ENDPOINT_SUGGESTION_LIMIT', runtimeSettingDefault('endpointSuggestionLimit', 12)),
    endpointNetworkScanLimit: parseIntEnv('ENDPOINT_NETWORK_SCAN_LIMIT', runtimeSettingDefault('endpointNetworkScanLimit', 600)),
    manufacturerAutoPromote: parseBoolEnv('MANUFACTURER_AUTO_PROMOTE', runtimeSettingDefault('manufacturerAutoPromote', true)),
    selfImproveEnabled: parseBoolEnv('SELF_IMPROVE_ENABLED', runtimeSettingDefault('selfImproveEnabled', true)),
    maxHypothesisItems: parseIntEnv('MAX_HYPOTHESIS_ITEMS', runtimeSettingDefault('maxHypothesisItems', 50)),
    hypothesisAutoFollowupRounds: parseIntEnv('HYPOTHESIS_AUTO_FOLLOWUP_ROUNDS', runtimeSettingDefault('hypothesisAutoFollowupRounds', 0)),
    hypothesisFollowupUrlsPerRound: parseIntEnv('HYPOTHESIS_FOLLOWUP_URLS_PER_ROUND', runtimeSettingDefault('hypothesisFollowupUrlsPerRound', 12)),
    fieldRewardHalfLifeDays: parseIntEnv('FIELD_REWARD_HALF_LIFE_DAYS', runtimeSettingDefault('fieldRewardHalfLifeDays', 45)),
    batchStrategy: (process.env.BATCH_STRATEGY || runtimeSettingDefault('batchStrategy', 'bandit')).toLowerCase(),
    fieldRulesEngineEnforceEvidence: parseBoolEnv('FIELD_RULES_ENGINE_ENFORCE_EVIDENCE', true),

    eventsJsonWrite: parseBoolEnv('EVENTS_JSON_WRITE', runtimeSettingDefault('eventsJsonWrite', true)),
    runtimeOpsWorkbenchEnabled: parseBoolEnv('RUNTIME_OPS_WORKBENCH_ENABLED', true),
    runtimeScreencastEnabled: parseBoolEnv('RUNTIME_SCREENCAST_ENABLED', runtimeSettingDefault('runtimeScreencastEnabled', true)),
    runtimeScreencastFps: parseIntEnv('RUNTIME_SCREENCAST_FPS', runtimeSettingDefault('runtimeScreencastFps', 2)),
    runtimeScreencastQuality: parseIntEnv('RUNTIME_SCREENCAST_QUALITY', runtimeSettingDefault('runtimeScreencastQuality', 50)),
    runtimeScreencastMaxWidth: parseIntEnv('RUNTIME_SCREENCAST_MAX_WIDTH', runtimeSettingDefault('runtimeScreencastMaxWidth', 1280)),
    runtimeScreencastMaxHeight: parseIntEnv('RUNTIME_SCREENCAST_MAX_HEIGHT', runtimeSettingDefault('runtimeScreencastMaxHeight', 720)),
    runtimeAutoSaveEnabled: parseBoolEnv('RUNTIME_AUTOSAVE_ENABLED', runtimeSettingDefault('runtimeAutoSaveEnabled', true))
  };

  return { cfg, explicitEnvKeys };
}
