import fs from 'node:fs';
import path from 'node:path';
import {
  buildDefaultModelPricingMap,
  LLM_PRICING_AS_OF,
  LLM_PRICING_SOURCES,
  mergeModelPricingMaps
} from './billing/modelPricingCatalog.js';
import { normalizeDynamicFetchPolicyMap } from './fetcher/dynamicFetchPolicy.js';
import { normalizeArticleExtractorPolicyMap } from './core/config/configNormalizers.js';
import {
  CONVERGENCE_SETTINGS_KEYS,
  RUNTIME_SETTINGS_ROUTE_GET,
} from './core/config/settingsKeyMap.js';
import { CONFIG_MANIFEST_DEFAULTS } from './core/config/manifest.js';
import { defaultLocalOutputRoot } from './core/config/runtimeArtifactRoots.js';
import { SETTINGS_DEFAULTS } from './shared/settingsDefaults.js';

let manifestDefaultsApplied = false;
const manifestDefaultedEnvKeys = new Set();
const RUNTIME_SETTINGS_DEFAULTS = Object.freeze(SETTINGS_DEFAULTS?.runtime || {});
const CONVERGENCE_SETTINGS_DEFAULTS = Object.freeze(SETTINGS_DEFAULTS?.convergence || {});
const LEGACY_HELPER_ROOT_ENV = `HELPER${'_FILES'}_ROOT`;

function applyManifestDefaultsToProcessEnv() {
  if (manifestDefaultsApplied) return;
  for (const [key, defaultValue] of Object.entries(CONFIG_MANIFEST_DEFAULTS || {})) {
    if (process.env[key] !== undefined && process.env[key] !== '') continue;
    const value = String(defaultValue ?? '').trim();
    if (value === '') continue;
    process.env[key] = value;
    manifestDefaultedEnvKeys.add(key);
  }
  manifestDefaultsApplied = true;
}

function parseIntEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : defaultValue;
}

function parseFloatEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : defaultValue;
}

function parseBoolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') {
    return defaultValue;
  }
  const norm = String(raw).trim().toLowerCase();
  return norm === '1' || norm === 'true' || norm === 'yes' || norm === 'on';
}

function parseJsonEnv(name, defaultValue = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

function runtimeSettingDefault(key, fallback) {
  return Object.hasOwn(RUNTIME_SETTINGS_DEFAULTS, key)
    ? RUNTIME_SETTINGS_DEFAULTS[key]
    : fallback;
}

function convergenceSettingDefault(key, fallback) {
  return Object.hasOwn(CONVERGENCE_SETTINGS_DEFAULTS, key)
    ? CONVERGENCE_SETTINGS_DEFAULTS[key]
    : fallback;
}

function parseRuntimeJsonDefault(key, fallback) {
  const raw = runtimeSettingDefault(key, '');
  if (typeof raw !== 'string' || raw.trim() === '') {
    return Object.freeze({ ...fallback });
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.freeze({ ...fallback, ...parsed });
    }
  } catch {
    // Fall back to the baked safety defaults if the shared JSON string is malformed.
  }
  return Object.freeze({ ...fallback });
}

const SEARCH_PROFILE_CAP_DEFAULTS = parseRuntimeJsonDefault('searchProfileCapMapJson', {
  deterministicAliasCap: 6,
  llmAliasValidationCap: 12,
  llmDocHintQueriesCap: 3,
  llmFieldTargetQueriesCap: 3,
  dedupeQueriesCap: 24
});

const SERP_RERANKER_WEIGHT_DEFAULTS = parseRuntimeJsonDefault('serpRerankerWeightMapJson', {
  identityStrongBonus: 2.0,
  identityPartialBonus: 0.8,
  identityWeakBonus: 0,
  identityNoneBonus: -1.5,
  brandPresenceBonus: 2.5,
  modelPresenceBonus: 2.5,
  specManualKeywordBonus: 1.3,
  reviewBenchmarkBonus: 0.9,
  forumRedditPenalty: -0.9,
  brandInHostnameBonus: 1.2,
  wikipediaPenalty: -1.0,
  variantGuardPenalty: -3.0,
  multiModelHintPenalty: -1.5,
  tier1Bonus: 1.5,
  tier2Bonus: 0.5,
  hostHealthDownrankPenalty: -0.4,
  hostHealthExcludePenalty: -2.0,
  operatorRiskPenalty: -0.5,
  fieldAffinityBonus: 0.5,
  diversityPenaltyPerDupe: -0.3,
  needsetCoverageBonus: 0.2,
});

const FETCH_SCHEDULER_INTERNALS_DEFAULTS = parseRuntimeJsonDefault('fetchSchedulerInternalsMapJson', {
  defaultDelayMs: 300,
  defaultConcurrency: 3,
  defaultMaxRetries: 1,
  retryWaitMs: 15000
});

const RETRIEVAL_INTERNALS_DEFAULTS = parseRuntimeJsonDefault('retrievalInternalsMapJson', {
  evidenceTierWeightMultiplier: 2.6,
  evidenceDocWeightMultiplier: 1.5,
  evidenceMethodWeightMultiplier: 0.85,
  evidencePoolMaxRows: 4000,
  snippetsPerSourceCap: 120,
  maxHitsCap: 80,
  evidenceRefsLimit: 12,
  reasonBadgesLimit: 8,
  retrievalAnchorsLimit: 6,
  primeSourcesMaxCap: 20,
  fallbackEvidenceMaxRows: 6000,
  provenanceOnlyMinRows: 24
});

const EVIDENCE_PACK_LIMITS_DEFAULTS = parseRuntimeJsonDefault('evidencePackLimitsMapJson', {
  headingsLimit: 120,
  chunkMaxLength: 3000,
  specSectionsLimit: 8
});



const PARSING_CONFIDENCE_BASE_DEFAULTS = parseRuntimeJsonDefault('parsingConfidenceBaseMapJson', {
  network_json: 1,
  embedded_state: 0.85,
  json_ld: 0.9,
  microdata: 0.88,
  opengraph: 0.8,
  microformat_rdfa: 0.78
});

const REPAIR_DEDUPE_RULE_DEFAULT = 'domain_once';
const AUTOMATION_QUEUE_STORAGE_ENGINE_DEFAULT = 'sqlite';
const DEFAULT_USER_AGENT = runtimeSettingDefault(
  'userAgent',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
);
const SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS = new Set([
  'llmPlanApiKey',
  'openaiApiKey',
  'anthropicApiKey',
  'cortexApiKey',
  'eloSupabaseAnonKey',
]);
const NON_CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS = new Set([
  'localOutputRoot',
]);
const CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS = new Set(
  Object.keys(RUNTIME_SETTINGS_DEFAULTS).filter((key) => (
    !SECRET_RUNTIME_DEFAULT_SETTINGS_KEYS.has(key)
    && !NON_CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS.has(key)
  ))
);
const EXPLICIT_ENV_KEY_OVERRIDES = new Map([
  ['fetchConcurrency', ['CONCURRENCY']],
  ['categoryAuthorityEnabled', ['HELPER_FILES_ENABLED']],
  ['helperFilesEnabled', ['HELPER_FILES_ENABLED']],
  ['indexingCategoryAuthorityEnabled', ['INDEXING_HELPER_FILES_ENABLED']],
  ['indexingHelperFilesEnabled', ['INDEXING_HELPER_FILES_ENABLED']],
  ['categoryAuthorityRoot', ['CATEGORY_AUTHORITY_ROOT', LEGACY_HELPER_ROOT_ENV]],
  ['helperFilesRoot', ['CATEGORY_AUTHORITY_ROOT', LEGACY_HELPER_ROOT_ENV]],
  ['articleExtractorV2Enabled', ['ARTICLE_EXTRACTOR_V2']],
  ['dynamicFetchPolicyMap', ['DYNAMIC_FETCH_POLICY_MAP_JSON']],
  ['dynamicFetchPolicyMapJson', ['DYNAMIC_FETCH_POLICY_MAP_JSON']],
  ['llmProvider', ['LLM_PROVIDER', 'LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmBaseUrl', ['LLM_BASE_URL', 'OPENAI_BASE_URL', 'DEEPSEEK_API_KEY']],
  ['llmModelExtract', ['LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmModelPlan', ['LLM_MODEL_PLAN', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_PLAN', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmModelTriage', ['LLM_MODEL_TRIAGE', 'LLM_MODEL_FAST', 'LLM_MODEL_PLAN', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmModelFast', ['LLM_MODEL_FAST', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmModelReasoning', ['LLM_MODEL_REASONING', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmModelValidate', ['LLM_MODEL_VALIDATE', 'LLM_MODEL_PLAN', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmModelWrite', ['LLM_MODEL_WRITE', 'LLM_MODEL_VALIDATE', 'LLM_MODEL_PLAN', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmPlanProvider', ['LLM_PLAN_PROVIDER', 'LLM_PROVIDER', 'LLM_BASE_URL', 'OPENAI_BASE_URL', 'LLM_MODEL_EXTRACT', 'OPENAI_MODEL_EXTRACT', 'DEEPSEEK_API_KEY']],
  ['llmPlanBaseUrl', ['LLM_PLAN_BASE_URL', 'LLM_BASE_URL', 'OPENAI_BASE_URL', 'DEEPSEEK_API_KEY']],
  ['runtimeScreencastEnabled', ['RUNTIME_SCREENCAST_ENABLED']],
  ['runtimeScreencastFps', ['RUNTIME_SCREENCAST_FPS']],
  ['runtimeScreencastQuality', ['RUNTIME_SCREENCAST_QUALITY']],
  ['runtimeScreencastMaxWidth', ['RUNTIME_SCREENCAST_MAX_WIDTH']],
  ['runtimeScreencastMaxHeight', ['RUNTIME_SCREENCAST_MAX_HEIGHT']],
]);

function buildRuntimeSettingsConfigKeyMap() {
  const pairs = [
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.floatMap),
    ...Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap),
  ];
  return new Map(pairs);
}

const RUNTIME_SETTINGS_CONFIG_KEY_MAP = buildRuntimeSettingsConfigKeyMap();

function toEnvKey(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toUpperCase();
}

function resolveSettingEnvKeys(settingKey, configKey) {
  return (
    EXPLICIT_ENV_KEY_OVERRIDES.get(settingKey)
    || EXPLICIT_ENV_KEY_OVERRIDES.get(configKey)
    || [toEnvKey(configKey || settingKey)]
  );
}

function hasExplicitSettingEnv(settingKey, configKey, explicitEnvKeys) {
  const envKeys = resolveSettingEnvKeys(settingKey, configKey);
  return envKeys.some((envKey) => explicitEnvKeys.has(envKey));
}

function explicitEnvValue(name, explicitEnvKeys) {
  if (!explicitEnvKeys.has(name)) {
    return '';
  }
  return String(process.env[name] ?? '');
}

function clampIntFromMap(source, key, fallback, min, max) {
  const parsed = Number.parseInt(String(source?.[key] ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampFloatFromMap(source, key, fallback, min, max) {
  const parsed = Number.parseFloat(String(source?.[key] ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeSearchProfileCapMap(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    deterministicAliasCap: clampIntFromMap(source, 'deterministicAliasCap', SEARCH_PROFILE_CAP_DEFAULTS.deterministicAliasCap, 1, 20),
    llmAliasValidationCap: clampIntFromMap(source, 'llmAliasValidationCap', SEARCH_PROFILE_CAP_DEFAULTS.llmAliasValidationCap, 1, 32),
    llmDocHintQueriesCap: clampIntFromMap(source, 'llmDocHintQueriesCap', SEARCH_PROFILE_CAP_DEFAULTS.llmDocHintQueriesCap, 1, 20),
    llmFieldTargetQueriesCap: clampIntFromMap(source, 'llmFieldTargetQueriesCap', SEARCH_PROFILE_CAP_DEFAULTS.llmFieldTargetQueriesCap, 1, 20),
    dedupeQueriesCap: clampIntFromMap(source, 'dedupeQueriesCap', SEARCH_PROFILE_CAP_DEFAULTS.dedupeQueriesCap, 1, 200),
  };
}

function normalizeSerpRerankerWeightMap(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    identityStrongBonus: clampFloatFromMap(source, 'identityStrongBonus', SERP_RERANKER_WEIGHT_DEFAULTS.identityStrongBonus, -20, 20),
    identityPartialBonus: clampFloatFromMap(source, 'identityPartialBonus', SERP_RERANKER_WEIGHT_DEFAULTS.identityPartialBonus, -20, 20),
    identityWeakBonus: clampFloatFromMap(source, 'identityWeakBonus', SERP_RERANKER_WEIGHT_DEFAULTS.identityWeakBonus, -20, 20),
    identityNoneBonus: clampFloatFromMap(source, 'identityNoneBonus', SERP_RERANKER_WEIGHT_DEFAULTS.identityNoneBonus, -20, 20),
    brandPresenceBonus: clampFloatFromMap(source, 'brandPresenceBonus', SERP_RERANKER_WEIGHT_DEFAULTS.brandPresenceBonus, -20, 20),
    modelPresenceBonus: clampFloatFromMap(source, 'modelPresenceBonus', SERP_RERANKER_WEIGHT_DEFAULTS.modelPresenceBonus, -20, 20),
    specManualKeywordBonus: clampFloatFromMap(source, 'specManualKeywordBonus', SERP_RERANKER_WEIGHT_DEFAULTS.specManualKeywordBonus, -20, 20),
    reviewBenchmarkBonus: clampFloatFromMap(source, 'reviewBenchmarkBonus', SERP_RERANKER_WEIGHT_DEFAULTS.reviewBenchmarkBonus, -20, 20),
    forumRedditPenalty: clampFloatFromMap(source, 'forumRedditPenalty', SERP_RERANKER_WEIGHT_DEFAULTS.forumRedditPenalty, -20, 20),
    brandInHostnameBonus: clampFloatFromMap(source, 'brandInHostnameBonus', SERP_RERANKER_WEIGHT_DEFAULTS.brandInHostnameBonus, -20, 20),
    wikipediaPenalty: clampFloatFromMap(source, 'wikipediaPenalty', SERP_RERANKER_WEIGHT_DEFAULTS.wikipediaPenalty, -20, 20),
    variantGuardPenalty: clampFloatFromMap(source, 'variantGuardPenalty', SERP_RERANKER_WEIGHT_DEFAULTS.variantGuardPenalty, -20, 20),
    multiModelHintPenalty: clampFloatFromMap(source, 'multiModelHintPenalty', SERP_RERANKER_WEIGHT_DEFAULTS.multiModelHintPenalty, -20, 20),
    tier1Bonus: clampFloatFromMap(source, 'tier1Bonus', SERP_RERANKER_WEIGHT_DEFAULTS.tier1Bonus, -20, 20),
    tier2Bonus: clampFloatFromMap(source, 'tier2Bonus', SERP_RERANKER_WEIGHT_DEFAULTS.tier2Bonus, -20, 20),
  };
}

function normalizeFetchSchedulerInternalsMap(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    defaultDelayMs: clampIntFromMap(source, 'defaultDelayMs', FETCH_SCHEDULER_INTERNALS_DEFAULTS.defaultDelayMs, 0, 600000),
    defaultConcurrency: clampIntFromMap(source, 'defaultConcurrency', FETCH_SCHEDULER_INTERNALS_DEFAULTS.defaultConcurrency, 1, 128),
    defaultMaxRetries: clampIntFromMap(source, 'defaultMaxRetries', FETCH_SCHEDULER_INTERNALS_DEFAULTS.defaultMaxRetries, 0, 20),
    retryWaitMs: clampIntFromMap(source, 'retryWaitMs', FETCH_SCHEDULER_INTERNALS_DEFAULTS.retryWaitMs, 0, 600000),
  };
}

function normalizeRetrievalInternalsMap(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    evidenceTierWeightMultiplier: clampFloatFromMap(source, 'evidenceTierWeightMultiplier', RETRIEVAL_INTERNALS_DEFAULTS.evidenceTierWeightMultiplier, 0, 20),
    evidenceDocWeightMultiplier: clampFloatFromMap(source, 'evidenceDocWeightMultiplier', RETRIEVAL_INTERNALS_DEFAULTS.evidenceDocWeightMultiplier, 0, 20),
    evidenceMethodWeightMultiplier: clampFloatFromMap(source, 'evidenceMethodWeightMultiplier', RETRIEVAL_INTERNALS_DEFAULTS.evidenceMethodWeightMultiplier, 0, 20),
    evidencePoolMaxRows: clampIntFromMap(source, 'evidencePoolMaxRows', RETRIEVAL_INTERNALS_DEFAULTS.evidencePoolMaxRows, 100, 20000),
    snippetsPerSourceCap: clampIntFromMap(source, 'snippetsPerSourceCap', RETRIEVAL_INTERNALS_DEFAULTS.snippetsPerSourceCap, 8, 300),
    maxHitsCap: clampIntFromMap(source, 'maxHitsCap', RETRIEVAL_INTERNALS_DEFAULTS.maxHitsCap, 1, 200),
    evidenceRefsLimit: clampIntFromMap(source, 'evidenceRefsLimit', RETRIEVAL_INTERNALS_DEFAULTS.evidenceRefsLimit, 1, 64),
    reasonBadgesLimit: clampIntFromMap(source, 'reasonBadgesLimit', RETRIEVAL_INTERNALS_DEFAULTS.reasonBadgesLimit, 1, 32),
    retrievalAnchorsLimit: clampIntFromMap(source, 'retrievalAnchorsLimit', RETRIEVAL_INTERNALS_DEFAULTS.retrievalAnchorsLimit, 1, 32),
    primeSourcesMaxCap: clampIntFromMap(source, 'primeSourcesMaxCap', RETRIEVAL_INTERNALS_DEFAULTS.primeSourcesMaxCap, 1, 50),
    fallbackEvidenceMaxRows: clampIntFromMap(source, 'fallbackEvidenceMaxRows', RETRIEVAL_INTERNALS_DEFAULTS.fallbackEvidenceMaxRows, 200, 20000),
    provenanceOnlyMinRows: clampIntFromMap(source, 'provenanceOnlyMinRows', RETRIEVAL_INTERNALS_DEFAULTS.provenanceOnlyMinRows, 0, 500),
  };
}

function normalizeEvidencePackLimitsMap(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    headingsLimit: clampIntFromMap(source, 'headingsLimit', EVIDENCE_PACK_LIMITS_DEFAULTS.headingsLimit, 1, 1000),
    chunkMaxLength: clampIntFromMap(source, 'chunkMaxLength', EVIDENCE_PACK_LIMITS_DEFAULTS.chunkMaxLength, 200, 20000),
    specSectionsLimit: clampIntFromMap(source, 'specSectionsLimit', EVIDENCE_PACK_LIMITS_DEFAULTS.specSectionsLimit, 1, 200),
  };
}



function normalizeParsingConfidenceBaseMap(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const microformatRdfaFallback = clampFloatFromMap(
    source,
    'microformat_rdfa',
    PARSING_CONFIDENCE_BASE_DEFAULTS.microformat_rdfa,
    0,
    2
  );
  const microformatRdfa = clampFloatFromMap(
    source,
    'microformat_rdfa',
    clampFloatFromMap(source, 'microformat', microformatRdfaFallback, 0, 2),
    0,
    2
  );
  return {
    network_json: clampFloatFromMap(source, 'network_json', PARSING_CONFIDENCE_BASE_DEFAULTS.network_json, 0, 2),
    embedded_state: clampFloatFromMap(source, 'embedded_state', PARSING_CONFIDENCE_BASE_DEFAULTS.embedded_state, 0, 2),
    json_ld: clampFloatFromMap(source, 'json_ld', PARSING_CONFIDENCE_BASE_DEFAULTS.json_ld, 0, 2),
    microdata: clampFloatFromMap(source, 'microdata', PARSING_CONFIDENCE_BASE_DEFAULTS.microdata, 0, 2),
    opengraph: clampFloatFromMap(source, 'opengraph', PARSING_CONFIDENCE_BASE_DEFAULTS.opengraph, 0, 2),
    microformat_rdfa: microformatRdfa,
  };
}

function applyCanonicalSettingsDefaults(cfg, explicitEnvKeys) {
  const next = { ...cfg };

  for (const key of CONVERGENCE_SETTINGS_KEYS) {
    if (!Object.hasOwn(CONVERGENCE_SETTINGS_DEFAULTS, key)) continue;
    if (hasExplicitSettingEnv(key, key, explicitEnvKeys)) continue;
    next[key] = CONVERGENCE_SETTINGS_DEFAULTS[key];
  }

  for (const key of CANONICAL_RUNTIME_DEFAULT_SETTINGS_KEYS) {
    if (!Object.hasOwn(RUNTIME_SETTINGS_DEFAULTS, key)) continue;
    const configKey = RUNTIME_SETTINGS_CONFIG_KEY_MAP.get(key) || key;
    if (hasExplicitSettingEnv(key, configKey, explicitEnvKeys)) continue;
    if (!Object.hasOwn(next, configKey)) continue;
    next[configKey] = RUNTIME_SETTINGS_DEFAULTS[key];
  }

  return next;
}

function normalizeRepairDedupeRule(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'domain_once' || normalized === 'domain_and_status' || normalized === 'none') {
    return normalized;
  }
  return REPAIR_DEDUPE_RULE_DEFAULT;
}

function normalizeAutomationQueueStorageEngine(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'sqlite' || normalized === 'memory') {
    return normalized;
  }
  return AUTOMATION_QUEUE_STORAGE_ENGINE_DEFAULT;
}

function normalizeModelPricingMap(input = {}) {
  const output = {};
  if (!input || typeof input !== 'object') {
    return output;
  }
  for (const [rawModel, rawRates] of Object.entries(input)) {
    const model = String(rawModel || '').trim();
    if (!model || !rawRates || typeof rawRates !== 'object') continue;
    const inPer1M = Number.parseFloat(String(rawRates.inputPer1M ?? rawRates.input_per_1m ?? rawRates.input ?? ''));
    const outPer1M = Number.parseFloat(String(rawRates.outputPer1M ?? rawRates.output_per_1m ?? rawRates.output ?? ''));
    const cachedPer1M = Number.parseFloat(String(rawRates.cachedInputPer1M ?? rawRates.cached_input_per_1m ?? rawRates.cached_input ?? rawRates.cached ?? ''));
    output[model] = {
      inputPer1M: Number.isFinite(inPer1M) ? inPer1M : 0,
      outputPer1M: Number.isFinite(outPer1M) ? outPer1M : 0,
      cachedInputPer1M: Number.isFinite(cachedPer1M) ? cachedPer1M : 0
    };
  }
  return output;
}

function normalizePricingSources(input = {}) {
  const output = {
    openai: String(LLM_PRICING_SOURCES.openai || ''),
    gemini: String(LLM_PRICING_SOURCES.gemini || ''),
    deepseek: String(LLM_PRICING_SOURCES.deepseek || '')
  };
  if (!input || typeof input !== 'object') {
    return output;
  }
  for (const [key, value] of Object.entries(input)) {
    const token = String(key || '').trim().toLowerCase();
    if (!token) continue;
    output[token] = String(value || '').trim();
  }
  return output;
}

function toTokenInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function normalizeModelOutputTokenMap(input = {}) {
  const output = {};
  if (!input || typeof input !== 'object') {
    return output;
  }
  for (const [rawModel, rawConfig] of Object.entries(input)) {
    const model = String(rawModel || '').trim();
    if (!model || !rawConfig || typeof rawConfig !== 'object') continue;
    const defaultOutputTokens = toTokenInt(
      rawConfig.defaultOutputTokens
      ?? rawConfig.default_output_tokens
      ?? rawConfig.default
      ?? rawConfig.defaultTokens,
      0
    );
    const maxOutputTokens = toTokenInt(
      rawConfig.maxOutputTokens
      ?? rawConfig.max_output_tokens
      ?? rawConfig.max
      ?? rawConfig.maximum,
      0
    );
    output[model] = {
      defaultOutputTokens: defaultOutputTokens > 0 ? defaultOutputTokens : 0,
      maxOutputTokens: maxOutputTokens > 0 ? maxOutputTokens : 0
    };
  }
  return output;
}

function parseTokenPresetList(value, fallback = []) {
  const parsed = String(value || '')
    .split(/[,\s]+/g)
    .map((item) => Number.parseInt(String(item || ''), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.max(128, Math.min(262144, Number(n))))
    .sort((a, b) => a - b);
  if (parsed.length === 0) {
    return [...fallback];
  }
  return [...new Set(parsed)];
}

function hasS3EnvCreds() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

function normalizeOutputMode(value, fallback = 'dual') {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'local' || token === 'dual' || token === 's3') {
    return token;
  }
  return fallback;
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function normalizeWrappedString(value) {
  const normalized = String(value || '').trim();
  if (normalized.length < 2) {
    return normalized;
  }
  const quote = normalized[0];
  if ((quote !== '"' && quote !== "'") || normalized.at(-1) !== quote) {
    return normalized;
  }
  return normalized.slice(1, -1).trim();
}

function normalizeUserAgent(value, fallback = DEFAULT_USER_AGENT) {
  const normalized = normalizeWrappedString(value);
  return normalized || fallback;
}

function normalizeStaticDomMode(value, fallback = 'cheerio') {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'regex_fallback') {
    return 'regex_fallback';
  }
  if (token === 'cheerio') {
    return 'cheerio';
  }
  return fallback;
}

function normalizePdfBackend(value, fallback = 'auto') {
  const token = String(value || '').trim().toLowerCase();
  if (['auto', 'pdfplumber', 'pymupdf', 'camelot', 'tabula', 'legacy'].includes(token)) {
    return token;
  }
  const fallbackToken = String(fallback || '').trim().toLowerCase();
  if (['auto', 'pdfplumber', 'pymupdf', 'camelot', 'tabula', 'legacy'].includes(fallbackToken)) {
    return fallbackToken;
  }
  return 'auto';
}

function normalizeScannedPdfOcrBackend(value, fallback = 'auto') {
  const token = String(value || '').trim().toLowerCase();
  if (['auto', 'tesseract', 'none'].includes(token)) {
    return token;
  }
  const fallbackToken = String(fallback || '').trim().toLowerCase();
  if (['auto', 'tesseract', 'none'].includes(fallbackToken)) {
    return fallbackToken;
  }
  return 'auto';
}

function defaultChatmockDir() {
  const profile = String(process.env.USERPROFILE || '').trim();
  if (!profile) {
    return '';
  }
  return path.join(profile, 'Desktop', 'ChatMock');
}

function inferLlmProvider(baseUrl, model, hasDeepSeekKey) {
  const baseToken = normalizeBaseUrl(baseUrl).toLowerCase();
  const modelToken = String(model || '').toLowerCase();
  if (baseToken.includes('deepseek.com') || modelToken.startsWith('deepseek') || hasDeepSeekKey) {
    return 'deepseek';
  }
  return 'openai';
}


function parseDotEnvValue(rawValue) {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }

  const commentIndex = trimmed.indexOf(' #');
  return (commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed).trim();
}

export function loadDotEnvFile(dotEnvPath = '.env', options = {}) {
  const overrideExisting = typeof options === 'boolean'
    ? options
    : Boolean(options?.overrideExisting);
  const overrideExistingKeys = Array.isArray(options?.overrideExistingKeys)
    ? new Set(options.overrideExistingKeys.map((key) => String(key || '').trim()).filter(Boolean))
    : null;
  const fullPath = path.resolve(dotEnvPath);
  let content = '';

  try {
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const withoutExport = trimmed.startsWith('export ')
      ? trimmed.slice('export '.length).trim()
      : trimmed;
    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    const hasExistingValue = process.env[key] !== undefined && process.env[key] !== '';
    const shouldOverrideKey = overrideExisting || Boolean(overrideExistingKeys?.has(key));
    if (hasExistingValue && !shouldOverrideKey) {
      continue;
    }

    const rawValue = withoutExport.slice(separatorIndex + 1);
    process.env[key] = parseDotEnvValue(rawValue);
  }

  return true;
}

export function loadConfig(overrides = {}) {
  const explicitCategoryAuthorityRoot = String(process.env.CATEGORY_AUTHORITY_ROOT || '').trim();
  const explicitHelperFilesRoot = String(process.env.HELPER_FILES_ROOT || '').trim();
  const explicitEnvKeys = new Set(
    Object.entries(process.env)
      .filter(([key, value]) => {
        if (value === undefined || value === null || String(value) === '') return false;
        if (!manifestDefaultedEnvKeys.has(key)) return true;
        return String(value) !== String(CONFIG_MANIFEST_DEFAULTS?.[key] ?? '');
      })
      .map(([key]) => key)
  );
  applyManifestDefaultsToProcessEnv();

  // Treat manifest-injected env as fallback defaults, not explicit operator intent.
  const explicitLlmProvider = explicitEnvValue('LLM_PROVIDER', explicitEnvKeys).trim().toLowerCase();
  const explicitLlmBaseUrl = explicitEnvValue('LLM_BASE_URL', explicitEnvKeys);
  const explicitOpenAiBaseUrl = explicitEnvValue('OPENAI_BASE_URL', explicitEnvKeys);
  const explicitLlmModelExtract = explicitEnvValue('LLM_MODEL_EXTRACT', explicitEnvKeys);
  const explicitOpenAiModelExtract = explicitEnvValue('OPENAI_MODEL_EXTRACT', explicitEnvKeys);
  const explicitLlmModelPlan = explicitEnvValue('LLM_MODEL_PLAN', explicitEnvKeys);
  const explicitOpenAiModelPlan = explicitEnvValue('OPENAI_MODEL_PLAN', explicitEnvKeys);
  const explicitLlmModelFast = explicitEnvValue('LLM_MODEL_FAST', explicitEnvKeys);
  const explicitLlmModelTriage = explicitEnvValue('LLM_MODEL_TRIAGE', explicitEnvKeys);
  const explicitLlmModelReasoning = explicitEnvValue('LLM_MODEL_REASONING', explicitEnvKeys);
  const explicitLlmModelValidate = explicitEnvValue('LLM_MODEL_VALIDATE', explicitEnvKeys);
  const explicitLlmModelWrite = explicitEnvValue('LLM_MODEL_WRITE', explicitEnvKeys);
  const explicitOpenAiModelWrite = explicitEnvValue('OPENAI_MODEL_WRITE', explicitEnvKeys);
  const explicitLlmPlanProvider = explicitEnvValue('LLM_PLAN_PROVIDER', explicitEnvKeys).trim().toLowerCase();
  const explicitLlmPlanBaseUrl = explicitEnvValue('LLM_PLAN_BASE_URL', explicitEnvKeys);

  const maxCandidateUrlsFromEnv =
    process.env.MAX_CANDIDATE_URLS_PER_PRODUCT ||
    process.env.MAX_CANDIDATE_URLS;

  const parsedCandidateUrls = Number.parseInt(String(maxCandidateUrlsFromEnv || ''), 10);
  const hasDeepSeekKey = Boolean(process.env.DEEPSEEK_API_KEY);
  const resolvedApiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const resolvedBaseUrl = explicitLlmBaseUrl || explicitOpenAiBaseUrl ||
    (hasDeepSeekKey ? 'https://api.deepseek.com' : 'https://api.openai.com');
  const defaultModel = explicitLlmModelExtract || explicitOpenAiModelExtract || (hasDeepSeekKey ? 'deepseek-reasoner' : 'gpt-4.1-mini');
  const timeoutMs = parseIntEnv('LLM_TIMEOUT_MS', parseIntEnv('OPENAI_TIMEOUT_MS', runtimeSettingDefault('llmTimeoutMs', 40_000)));
  const envOutputMode = normalizeOutputMode(process.env.OUTPUT_MODE || 'dual', 'dual');
  const hasS3Creds = hasS3EnvCreds();
  const defaultMirrorToS3 = envOutputMode !== 'local' && hasS3Creds;
  const normalizedFetchSchedulerInternalsMap = normalizeFetchSchedulerInternalsMap(
    parseJsonEnv('FETCH_SCHEDULER_INTERNALS_MAP_JSON', {})
  );
  const normalizedRetrievalInternalsMap = normalizeRetrievalInternalsMap(
    parseJsonEnv('RETRIEVAL_INTERNALS_MAP_JSON', {})
  );
  const normalizedEvidencePackLimitsMap = normalizeEvidencePackLimitsMap(
    parseJsonEnv('EVIDENCE_PACK_LIMITS_MAP_JSON', {})
  );
  const normalizedParsingConfidenceBaseMap = normalizeParsingConfidenceBaseMap(
    parseJsonEnv('PARSING_CONFIDENCE_BASE_MAP_JSON', {})
  );
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
    manufacturerDeepResearchEnabled: parseBoolEnv('MANUFACTURER_DEEP_RESEARCH_ENABLED', runtimeSettingDefault('manufacturerDeepResearchEnabled', true)),
    maxManufacturerUrlsPerProduct: parseIntEnv('MAX_MANUFACTURER_URLS_PER_PRODUCT', runtimeSettingDefault('maxManufacturerUrlsPerProduct', 20)),
    maxManufacturerPagesPerDomain: parseIntEnv('MAX_MANUFACTURER_PAGES_PER_DOMAIN', runtimeSettingDefault('maxManufacturerPagesPerDomain', 8)),
    manufacturerReserveUrls: parseIntEnv('MANUFACTURER_RESERVE_URLS', runtimeSettingDefault('manufacturerReserveUrls', 10)),
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
    scannedPdfOcrPromoteCandidates: parseBoolEnv('SCANNED_PDF_OCR_PROMOTE_CANDIDATES', runtimeSettingDefault('scannedPdfOcrPromoteCandidates', true)),
    scannedPdfOcrBackend: process.env.SCANNED_PDF_OCR_BACKEND || runtimeSettingDefault('scannedPdfOcrBackend', 'auto'),
    scannedPdfOcrMaxPages: parseIntEnv('SCANNED_PDF_OCR_MAX_PAGES', runtimeSettingDefault('scannedPdfOcrMaxPages', 4)),
    scannedPdfOcrMaxPairs: parseIntEnv('SCANNED_PDF_OCR_MAX_PAIRS', runtimeSettingDefault('scannedPdfOcrMaxPairs', 800)),
    scannedPdfOcrMinCharsPerPage: parseIntEnv('SCANNED_PDF_OCR_MIN_CHARS_PER_PAGE', runtimeSettingDefault('scannedPdfOcrMinCharsPerPage', 30)),
    scannedPdfOcrMinLinesPerPage: parseIntEnv('SCANNED_PDF_OCR_MIN_LINES_PER_PAGE', runtimeSettingDefault('scannedPdfOcrMinLinesPerPage', 2)),
    scannedPdfOcrMinConfidence: parseFloatEnv('SCANNED_PDF_OCR_MIN_CONFIDENCE', runtimeSettingDefault('scannedPdfOcrMinConfidence', 0.5)),
    concurrency: parseIntEnv('CONCURRENCY', runtimeSettingDefault('fetchConcurrency', 4)),
    perHostMinDelayMs: parseIntEnv('PER_HOST_MIN_DELAY_MS', runtimeSettingDefault('perHostMinDelayMs', 1500)),
    searchGlobalRps: parseIntEnv('SEARCH_GLOBAL_RPS', runtimeSettingDefault('searchGlobalRps', 0)),
    searchGlobalBurst: parseIntEnv('SEARCH_GLOBAL_BURST', runtimeSettingDefault('searchGlobalBurst', 0)),
    searchPerHostRps: parseIntEnv('SEARCH_PER_HOST_RPS', runtimeSettingDefault('searchPerHostRps', 0)),
    searchPerHostBurst: parseIntEnv('SEARCH_PER_HOST_BURST', runtimeSettingDefault('searchPerHostBurst', 0)),
    domainRequestRps: parseIntEnv('DOMAIN_REQUEST_RPS', runtimeSettingDefault('domainRequestRps', 0)),
    domainRequestBurst: parseIntEnv('DOMAIN_REQUEST_BURST', runtimeSettingDefault('domainRequestBurst', 0)),
    globalRequestRps: parseIntEnv('GLOBAL_REQUEST_RPS', runtimeSettingDefault('globalRequestRps', 0)),
    globalRequestBurst: parseIntEnv('GLOBAL_REQUEST_BURST', runtimeSettingDefault('globalRequestBurst', 0)),
    fetchPerHostConcurrencyCap: parseIntEnv('FETCH_PER_HOST_CONCURRENCY_CAP', runtimeSettingDefault('fetchPerHostConcurrencyCap', 1)),
    fetchSchedulerEnabled: parseBoolEnv('FETCH_SCHEDULER_ENABLED', runtimeSettingDefault('fetchSchedulerEnabled', false)),
    fetchSchedulerMaxRetries: parseIntEnv('FETCH_SCHEDULER_MAX_RETRIES', runtimeSettingDefault('fetchSchedulerMaxRetries', 1)),
    fetchSchedulerFallbackWaitMs: parseIntEnv('FETCH_SCHEDULER_FALLBACK_WAIT_MS', runtimeSettingDefault('fetchSchedulerFallbackWaitMs', 60000)),
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
    enableSourceRegistry: parseBoolEnv('ENABLE_SOURCE_REGISTRY', runtimeSettingDefault('enableSourceRegistry', true)),
    enableDomainHintResolverV2: parseBoolEnv('ENABLE_DOMAIN_HINT_RESOLVER_V2', runtimeSettingDefault('enableDomainHintResolverV2', true)),
    enableQueryCompiler: parseBoolEnv('ENABLE_QUERY_COMPILER', runtimeSettingDefault('enableQueryCompiler', true)),
    enableCoreDeepGates: parseBoolEnv('ENABLE_CORE_DEEP_GATES', runtimeSettingDefault('enableCoreDeepGates', true)),
    enableQueryIndex: parseBoolEnv('ENABLE_QUERY_INDEX', runtimeSettingDefault('enableQueryIndex', true)),
    enableUrlIndex: parseBoolEnv('ENABLE_URL_INDEX', runtimeSettingDefault('enableUrlIndex', true)),
    fetchCandidateSources: parseBoolEnv('FETCH_CANDIDATE_SOURCES', runtimeSettingDefault('fetchCandidateSources', true)),
    discoveryMaxQueries: parseIntEnv('DISCOVERY_MAX_QUERIES', runtimeSettingDefault('discoveryMaxQueries', 6)),
    discoveryResultsPerQuery: 10, // Hardcoded — fixed value, not tunable
    discoveryMaxDiscovered: parseIntEnv('DISCOVERY_MAX_DISCOVERED', runtimeSettingDefault('discoveryMaxDiscovered', 80)),
    discoveryQueryConcurrency: 1, // Hardcoded — search API rate-limits anyway
    searchProvider: process.env.SEARCH_PROVIDER || runtimeSettingDefault('searchProvider', 'dual'),
    searxngBaseUrl: process.env.SEARXNG_BASE_URL || process.env.SEARXNG_URL || runtimeSettingDefault('searxngBaseUrl', 'http://127.0.0.1:8080'),
    searxngDefaultBaseUrl: process.env.SEARXNG_DEFAULT_BASE_URL || runtimeSettingDefault('searxngBaseUrl', 'http://127.0.0.1:8080'),
    eloSupabaseAnonKey: process.env.ELO_SUPABASE_ANON_KEY || '',
    eloSupabaseEndpoint: process.env.ELO_SUPABASE_ENDPOINT || runtimeSettingDefault('eloSupabaseEndpoint', ''),
    llmEnabled: true, // Hardcoded — LLM is mandatory, no GUI toggle
    llmWriteSummary: parseBoolEnv('LLM_WRITE_SUMMARY', runtimeSettingDefault('llmWriteSummary', false)),
    llmPlanDiscoveryQueries: true, // Hardcoded — LLM query planning is mandatory
    enableSchema4SearchPlan: true, // Hardcoded — Schema 4 panel data required for live GUI
    phase2LlmEnabled: true, // Hardcoded — Schema 4 LLM planner must run to populate bundles/profile_influence
    llmForceRoleModelProvider: parseBoolEnv('LLM_FORCE_ROLE_MODEL_PROVIDER', false),
    llmProvider: explicitLlmProvider,
    llmApiKey: resolvedApiKey,
    llmBaseUrl: resolvedBaseUrl,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    llmModelExtract: explicitLlmModelExtract || explicitOpenAiModelExtract || defaultModel,
    llmModelPlan: explicitLlmModelPlan || explicitLlmModelExtract || explicitOpenAiModelPlan || explicitOpenAiModelExtract || defaultModel,
    llmModelFast:
      explicitLlmModelFast ||
      explicitLlmModelExtract ||
      explicitOpenAiModelExtract ||
      defaultModel,
    llmModelTriage:
      explicitLlmModelTriage ||
      process.env.CORTEX_MODEL_RERANK_FAST ||
      process.env.CORTEX_MODEL_SEARCH_FAST ||
      explicitLlmModelFast ||
      explicitLlmModelPlan ||
      explicitLlmModelExtract ||
      explicitOpenAiModelExtract ||
      defaultModel,
    llmModelReasoning:
      explicitLlmModelReasoning ||
      explicitLlmModelExtract ||
      explicitOpenAiModelExtract ||
      defaultModel,
    llmModelValidate:
      explicitLlmModelValidate ||
      explicitLlmModelPlan ||
      explicitLlmModelExtract ||
      explicitOpenAiModelPlan ||
      explicitOpenAiModelExtract ||
      defaultModel,
    llmModelWrite:
      explicitLlmModelWrite ||
      explicitLlmModelValidate ||
      explicitLlmModelPlan ||
      explicitLlmModelExtract ||
      explicitOpenAiModelWrite ||
      explicitOpenAiModelPlan ||
      explicitOpenAiModelExtract ||
      defaultModel,
    llmPlanProvider: explicitLlmPlanProvider,
    llmPlanBaseUrl: explicitLlmPlanBaseUrl,
    llmPlanApiKey: process.env.LLM_PLAN_API_KEY || '',
    llmPlanFallbackModel: process.env.LLM_PLAN_FALLBACK_MODEL || '',
    llmPlanFallbackProvider: (process.env.LLM_PLAN_FALLBACK_PROVIDER || '').trim().toLowerCase(),
    llmPlanFallbackBaseUrl: process.env.LLM_PLAN_FALLBACK_BASE_URL || '',
    llmPlanFallbackApiKey: process.env.LLM_PLAN_FALLBACK_API_KEY || '',
    llmExtractProvider: (process.env.LLM_EXTRACT_PROVIDER || '').trim().toLowerCase(),
    llmExtractBaseUrl: process.env.LLM_EXTRACT_BASE_URL || '',
    llmExtractApiKey: process.env.LLM_EXTRACT_API_KEY || '',
    llmExtractFallbackModel: process.env.LLM_EXTRACT_FALLBACK_MODEL || '',
    llmExtractFallbackProvider: (process.env.LLM_EXTRACT_FALLBACK_PROVIDER || '').trim().toLowerCase(),
    llmExtractFallbackBaseUrl: process.env.LLM_EXTRACT_FALLBACK_BASE_URL || '',
    llmExtractFallbackApiKey: process.env.LLM_EXTRACT_FALLBACK_API_KEY || '',
    llmValidateProvider: (process.env.LLM_VALIDATE_PROVIDER || '').trim().toLowerCase(),
    llmValidateBaseUrl: process.env.LLM_VALIDATE_BASE_URL || '',
    llmValidateApiKey: process.env.LLM_VALIDATE_API_KEY || '',
    llmValidateFallbackModel: process.env.LLM_VALIDATE_FALLBACK_MODEL || '',
    llmValidateFallbackProvider: (process.env.LLM_VALIDATE_FALLBACK_PROVIDER || '').trim().toLowerCase(),
    llmValidateFallbackBaseUrl: process.env.LLM_VALIDATE_FALLBACK_BASE_URL || '',
    llmValidateFallbackApiKey: process.env.LLM_VALIDATE_FALLBACK_API_KEY || '',
    llmWriteProvider: (process.env.LLM_WRITE_PROVIDER || '').trim().toLowerCase(),
    llmWriteBaseUrl: process.env.LLM_WRITE_BASE_URL || '',
    llmWriteApiKey: process.env.LLM_WRITE_API_KEY || '',
    llmWriteFallbackModel: process.env.LLM_WRITE_FALLBACK_MODEL || '',
    llmWriteFallbackProvider: (process.env.LLM_WRITE_FALLBACK_PROVIDER || '').trim().toLowerCase(),
    llmWriteFallbackBaseUrl: process.env.LLM_WRITE_FALLBACK_BASE_URL || '',
    llmWriteFallbackApiKey: process.env.LLM_WRITE_FALLBACK_API_KEY || '',
    llmSerpRerankEnabled: true,
    llmModelCatalog: process.env.LLM_MODEL_CATALOG || '',
    llmModelPricingMap: mergeModelPricingMaps(
      buildDefaultModelPricingMap(),
      normalizeModelPricingMap(parseJsonEnv('LLM_MODEL_PRICING_JSON', {}))
    ),
    llmPricingAsOf: String(process.env.LLM_PRICING_AS_OF || LLM_PRICING_AS_OF),
    llmPricingSources: normalizePricingSources(parseJsonEnv('LLM_PRICING_SOURCES_JSON', LLM_PRICING_SOURCES)),
    cortexEnabled: parseBoolEnv('CORTEX_ENABLED', runtimeSettingDefault('cortexEnabled', false)),
    chatmockDir: process.env.CHATMOCK_DIR || defaultChatmockDir(),
    chatmockComposeFile: process.env.CHATMOCK_COMPOSE_FILE
      || path.join(process.env.CHATMOCK_DIR || defaultChatmockDir(), 'docker-compose.yml'),
    cortexBaseUrl: process.env.CORTEX_BASE_URL || runtimeSettingDefault('cortexBaseUrl', 'http://localhost:5001/v1'),
    cortexApiKey: process.env.CORTEX_API_KEY || 'key',
    cortexAsyncBaseUrl: process.env.CORTEX_ASYNC_BASE_URL || runtimeSettingDefault('cortexAsyncBaseUrl', 'http://localhost:4000/api'),
    cortexAsyncSubmitPath: process.env.CORTEX_ASYNC_SUBMIT_PATH || runtimeSettingDefault('cortexAsyncSubmitPath', '/jobs'),
    cortexAsyncStatusPath: process.env.CORTEX_ASYNC_STATUS_PATH || runtimeSettingDefault('cortexAsyncStatusPath', '/jobs/{id}'),
    cortexAsyncEnabled: parseBoolEnv('CORTEX_ASYNC_ENABLED', runtimeSettingDefault('cortexAsyncEnabled', true)),
    cortexModelFast: process.env.CORTEX_MODEL_FAST || runtimeSettingDefault('cortexModelFast', 'gpt-5-low'),
    cortexModelDom: process.env.CORTEX_MODEL_DOM || process.env.CORTEX_MODEL_FAST || runtimeSettingDefault('cortexModelDom', 'gpt-5-low'),
    cortexModelReasoningDeep: process.env.CORTEX_MODEL_REASONING_DEEP || runtimeSettingDefault('cortexModelReasoningDeep', 'gpt-5-high'),
    cortexModelVision: process.env.CORTEX_MODEL_VISION || process.env.CORTEX_MODEL_REASONING_DEEP || runtimeSettingDefault('cortexModelVision', 'gpt-5-high'),
    cortexModelSearchFast: process.env.CORTEX_MODEL_SEARCH_FAST || process.env.CORTEX_MODEL_FAST || runtimeSettingDefault('cortexModelSearchFast', 'gpt-5-low'),
    cortexModelRerankFast: process.env.CORTEX_MODEL_RERANK_FAST || process.env.CORTEX_MODEL_SEARCH_FAST || process.env.CORTEX_MODEL_FAST || runtimeSettingDefault('cortexModelRerankFast', 'gpt-5-low'),
    cortexEscalateConfidenceLt: parseFloatEnv('CORTEX_ESCALATE_CONFIDENCE_LT', runtimeSettingDefault('cortexEscalateConfidenceLt', 0.85)),
    cortexEscalateIfConflict: parseBoolEnv('CORTEX_ESCALATE_IF_CONFLICT', runtimeSettingDefault('cortexEscalateIfConflict', true)),
    cortexEscalateCriticalOnly: parseBoolEnv('CORTEX_ESCALATE_CRITICAL_ONLY', runtimeSettingDefault('cortexEscalateCriticalOnly', true)),
    cortexMaxDeepFieldsPerProduct: parseIntEnv('CORTEX_MAX_DEEP_FIELDS_PER_PRODUCT', runtimeSettingDefault('cortexMaxDeepFieldsPerProduct', 12)),
    identityGatePublishThreshold: parseFloatEnv('IDENTITY_GATE_PUBLISH_THRESHOLD', runtimeSettingDefault('identityGatePublishThreshold', 0.75)),
    identityGateBaseMatchThreshold: parseFloatEnv('IDENTITY_GATE_BASE_MATCH_THRESHOLD', runtimeSettingDefault('identityGateBaseMatchThreshold', 0.80)),
    qualityGateIdentityThreshold: parseFloatEnv('QUALITY_GATE_IDENTITY_THRESHOLD', runtimeSettingDefault('qualityGateIdentityThreshold', 0.70)),
    consensusMethodWeightNetworkJson: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_NETWORK_JSON', runtimeSettingDefault('consensusMethodWeightNetworkJson', 1.00)),
    consensusMethodWeightAdapterApi: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_ADAPTER_API', runtimeSettingDefault('consensusMethodWeightAdapterApi', 0.95)),
    consensusMethodWeightStructuredMeta: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_STRUCTURED_META', runtimeSettingDefault('consensusMethodWeightStructuredMeta', 0.90)),
    consensusMethodWeightPdf: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_PDF', runtimeSettingDefault('consensusMethodWeightPdf', 0.82)),
    consensusMethodWeightTableKv: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_TABLE_KV', runtimeSettingDefault('consensusMethodWeightTableKv', 0.78)),
    consensusMethodWeightDom: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_DOM', runtimeSettingDefault('consensusMethodWeightDom', 0.40)),
    consensusMethodWeightLlmExtractBase: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_LLM_EXTRACT_BASE', runtimeSettingDefault('consensusMethodWeightLlmExtractBase', 0.20)),
    consensusPolicyBonus: parseFloatEnv('CONSENSUS_POLICY_BONUS', runtimeSettingDefault('consensusPolicyBonus', 0.30)),
    consensusWeightedMajorityThreshold: parseFloatEnv('CONSENSUS_WEIGHTED_MAJORITY_THRESHOLD', runtimeSettingDefault('consensusWeightedMajorityThreshold', 1.10)),
    consensusStrictAcceptanceDomainCount: parseIntEnv('CONSENSUS_STRICT_ACCEPTANCE_DOMAIN_COUNT', runtimeSettingDefault('consensusStrictAcceptanceDomainCount', 2)),
    consensusRelaxedAcceptanceDomainCount: parseIntEnv('CONSENSUS_RELAXED_ACCEPTANCE_DOMAIN_COUNT', runtimeSettingDefault('consensusRelaxedAcceptanceDomainCount', 2)),
    consensusInstrumentedFieldThreshold: parseIntEnv('CONSENSUS_INSTRUMENTED_FIELD_THRESHOLD', runtimeSettingDefault('consensusInstrumentedFieldThreshold', 3)),
    consensusConfidenceScoringBase: parseFloatEnv('CONSENSUS_CONFIDENCE_SCORING_BASE', runtimeSettingDefault('consensusConfidenceScoringBase', 0.70)),
    consensusPassTargetIdentityStrong: parseIntEnv('CONSENSUS_PASS_TARGET_IDENTITY_STRONG', runtimeSettingDefault('consensusPassTargetIdentityStrong', 4)),
    consensusPassTargetNormal: parseIntEnv('CONSENSUS_PASS_TARGET_NORMAL', runtimeSettingDefault('consensusPassTargetNormal', 2)),
    evidenceTextMaxChars: parseIntEnv('EVIDENCE_TEXT_MAX_CHARS', runtimeSettingDefault('evidenceTextMaxChars', 5000)),
    consensusLlmWeightTier1: parseFloatEnv('CONSENSUS_LLM_WEIGHT_TIER1', convergenceSettingDefault('consensusLlmWeightTier1', 0.60)),
    consensusLlmWeightTier2: parseFloatEnv('CONSENSUS_LLM_WEIGHT_TIER2', convergenceSettingDefault('consensusLlmWeightTier2', 0.40)),
    consensusLlmWeightTier3: parseFloatEnv('CONSENSUS_LLM_WEIGHT_TIER3', convergenceSettingDefault('consensusLlmWeightTier3', 0.20)),
    consensusLlmWeightTier4: parseFloatEnv('CONSENSUS_LLM_WEIGHT_TIER4', convergenceSettingDefault('consensusLlmWeightTier4', 0.15)),
    consensusTier1Weight: parseFloatEnv('CONSENSUS_TIER1_WEIGHT', convergenceSettingDefault('consensusTier1Weight', 1.00)),
    consensusTier2Weight: parseFloatEnv('CONSENSUS_TIER2_WEIGHT', convergenceSettingDefault('consensusTier2Weight', 0.80)),
    consensusTier3Weight: parseFloatEnv('CONSENSUS_TIER3_WEIGHT', convergenceSettingDefault('consensusTier3Weight', 0.45)),
    consensusTier4Weight: parseFloatEnv('CONSENSUS_TIER4_WEIGHT', convergenceSettingDefault('consensusTier4Weight', 0.25)),
    serpTriageMinScore: parseIntEnv('SERP_TRIAGE_MIN_SCORE', convergenceSettingDefault('serpTriageMinScore', 3)),
    serpTriageMaxUrls: parseIntEnv('SERP_TRIAGE_MAX_URLS', convergenceSettingDefault('serpTriageMaxUrls', 20)),
    serpTriageEnabled: true,
    retrievalMaxHitsPerField: parseIntEnv('RETRIEVAL_MAX_HITS_PER_FIELD', convergenceSettingDefault('retrievalMaxHitsPerField', 24)),
    retrievalMaxPrimeSources: parseIntEnv('RETRIEVAL_MAX_PRIME_SOURCES', convergenceSettingDefault('retrievalMaxPrimeSources', 8)),
    retrievalIdentityFilterEnabled: parseBoolEnv('RETRIEVAL_IDENTITY_FILTER_ENABLED', convergenceSettingDefault('retrievalIdentityFilterEnabled', true)),
    retrievalTierWeightTier1: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER1', runtimeSettingDefault('retrievalTierWeightTier1', 3.00)),
    retrievalTierWeightTier2: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER2', runtimeSettingDefault('retrievalTierWeightTier2', 2.00)),
    retrievalTierWeightTier3: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER3', runtimeSettingDefault('retrievalTierWeightTier3', 1.00)),
    retrievalTierWeightTier4: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER4', runtimeSettingDefault('retrievalTierWeightTier4', 0.65)),
    retrievalTierWeightTier5: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER5', runtimeSettingDefault('retrievalTierWeightTier5', 0.40)),
    retrievalDocKindWeightManualPdf: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_MANUAL_PDF', runtimeSettingDefault('retrievalDocKindWeightManualPdf', 1.50)),
    retrievalDocKindWeightSpecPdf: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_SPEC_PDF', runtimeSettingDefault('retrievalDocKindWeightSpecPdf', 1.40)),
    retrievalDocKindWeightSupport: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_SUPPORT', runtimeSettingDefault('retrievalDocKindWeightSupport', 1.10)),
    retrievalDocKindWeightLabReview: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_LAB_REVIEW', runtimeSettingDefault('retrievalDocKindWeightLabReview', 0.95)),
    retrievalDocKindWeightProductPage: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_PRODUCT_PAGE', runtimeSettingDefault('retrievalDocKindWeightProductPage', 0.75)),
    retrievalDocKindWeightOther: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_OTHER', runtimeSettingDefault('retrievalDocKindWeightOther', 0.55)),
    retrievalMethodWeightTable: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_TABLE', runtimeSettingDefault('retrievalMethodWeightTable', 1.25)),
    retrievalMethodWeightKv: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_KV', runtimeSettingDefault('retrievalMethodWeightKv', 1.15)),
    retrievalMethodWeightJsonLd: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_JSON_LD', runtimeSettingDefault('retrievalMethodWeightJsonLd', 1.10)),
    retrievalMethodWeightLlmExtract: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_LLM_EXTRACT', runtimeSettingDefault('retrievalMethodWeightLlmExtract', 0.85)),
    retrievalMethodWeightHelperSupportive: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_HELPER_SUPPORTIVE', runtimeSettingDefault('retrievalMethodWeightHelperSupportive', 0.65)),
    retrievalAnchorScorePerMatch: parseFloatEnv('RETRIEVAL_ANCHOR_SCORE_PER_MATCH', runtimeSettingDefault('retrievalAnchorScorePerMatch', 0.42)),
    retrievalIdentityScorePerMatch: parseFloatEnv('RETRIEVAL_IDENTITY_SCORE_PER_MATCH', runtimeSettingDefault('retrievalIdentityScorePerMatch', 0.28)),
    retrievalUnitMatchBonus: parseFloatEnv('RETRIEVAL_UNIT_MATCH_BONUS', runtimeSettingDefault('retrievalUnitMatchBonus', 0.35)),
    retrievalDirectFieldMatchBonus: parseFloatEnv('RETRIEVAL_DIRECT_FIELD_MATCH_BONUS', runtimeSettingDefault('retrievalDirectFieldMatchBonus', 0.65)),
    retrievalInternalsMap: normalizedRetrievalInternalsMap,
    retrievalInternalsMapJson: JSON.stringify(normalizedRetrievalInternalsMap),
    retrievalEvidenceTierWeightMultiplier: parseFloatEnv('RETRIEVAL_EVIDENCE_TIER_WEIGHT_MULTIPLIER', normalizedRetrievalInternalsMap.evidenceTierWeightMultiplier),
    retrievalEvidenceDocWeightMultiplier: parseFloatEnv('RETRIEVAL_EVIDENCE_DOC_WEIGHT_MULTIPLIER', normalizedRetrievalInternalsMap.evidenceDocWeightMultiplier),
    retrievalEvidenceMethodWeightMultiplier: parseFloatEnv('RETRIEVAL_EVIDENCE_METHOD_WEIGHT_MULTIPLIER', normalizedRetrievalInternalsMap.evidenceMethodWeightMultiplier),
    retrievalEvidencePoolMaxRows: parseIntEnv('RETRIEVAL_EVIDENCE_POOL_MAX_ROWS', normalizedRetrievalInternalsMap.evidencePoolMaxRows),
    retrievalSnippetsPerSourceCap: parseIntEnv('RETRIEVAL_SNIPPETS_PER_SOURCE_CAP', normalizedRetrievalInternalsMap.snippetsPerSourceCap),
    retrievalMaxHitsCap: parseIntEnv('RETRIEVAL_MAX_HITS_CAP', normalizedRetrievalInternalsMap.maxHitsCap),
    retrievalEvidenceRefsLimit: parseIntEnv('RETRIEVAL_EVIDENCE_REFS_LIMIT', normalizedRetrievalInternalsMap.evidenceRefsLimit),
    retrievalReasonBadgesLimit: parseIntEnv('RETRIEVAL_REASON_BADGES_LIMIT', normalizedRetrievalInternalsMap.reasonBadgesLimit),
    retrievalAnchorsLimit: parseIntEnv('RETRIEVAL_ANCHORS_LIMIT', normalizedRetrievalInternalsMap.retrievalAnchorsLimit),
    retrievalPrimeSourcesMaxCap: parseIntEnv('RETRIEVAL_PRIME_SOURCES_MAX_CAP', normalizedRetrievalInternalsMap.primeSourcesMaxCap),
    retrievalFallbackEvidenceMaxRows: parseIntEnv('RETRIEVAL_FALLBACK_EVIDENCE_MAX_ROWS', normalizedRetrievalInternalsMap.fallbackEvidenceMaxRows),
    retrievalProvenanceOnlyMinRows: parseIntEnv('RETRIEVAL_PROVENANCE_ONLY_MIN_ROWS', normalizedRetrievalInternalsMap.provenanceOnlyMinRows),
    evidencePackLimitsMap: normalizedEvidencePackLimitsMap,
    evidencePackLimitsMapJson: JSON.stringify(normalizedEvidencePackLimitsMap),
    parsingConfidenceBaseMap: normalizedParsingConfidenceBaseMap,
    parsingConfidenceBaseMapJson: JSON.stringify(normalizedParsingConfidenceBaseMap),
    evidenceHeadingsLimit: parseIntEnv('EVIDENCE_HEADINGS_LIMIT', normalizedEvidencePackLimitsMap.headingsLimit),
    evidenceChunkMaxLength: parseIntEnv('EVIDENCE_CHUNK_MAX_LENGTH', normalizedEvidencePackLimitsMap.chunkMaxLength),
    evidenceSpecSectionsLimit: parseIntEnv('EVIDENCE_SPEC_SECTIONS_LIMIT', normalizedEvidencePackLimitsMap.specSectionsLimit),
    specDbDir: process.env.SPEC_DB_DIR || runtimeSettingDefault('specDbDir', '.specfactory_tmp'),
    frontierDbPath: process.env.FRONTIER_DB_PATH || runtimeSettingDefault('frontierDbPath', '_intel/frontier/frontier.json'),
    frontierEnableSqlite: parseBoolEnv('FRONTIER_ENABLE_SQLITE', runtimeSettingDefault('frontierEnableSqlite', true)),
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
    frontierRepairSearchEnabled: parseBoolEnv('FRONTIER_REPAIR_SEARCH_ENABLED', runtimeSettingDefault('frontierRepairSearchEnabled', true)),
    repairDedupeRule: normalizeRepairDedupeRule(process.env['REPAIR_DEDUPE_RULE'] || REPAIR_DEDUPE_RULE_DEFAULT),
    automationQueueStorageEngine: normalizeAutomationQueueStorageEngine(
      process.env['AUTOMATION_QUEUE_STORAGE_ENGINE'] || AUTOMATION_QUEUE_STORAGE_ENGINE_DEFAULT
    ),
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
    [`indexing${'HelperFilesEnabled'}`]: parseBoolEnv('INDEXING_HELPER_FILES_ENABLED', runtimeSettingDefault('indexingHelperFilesEnabled', false)),
    runtimeControlFile: process.env.RUNTIME_CONTROL_FILE || runtimeSettingDefault('runtimeControlFile', '_runtime/control/runtime_overrides.json'),
    runtimeCaptureScreenshots: parseBoolEnv('RUNTIME_CAPTURE_SCREENSHOTS', runtimeSettingDefault('runtimeCaptureScreenshots', false)),
    runtimeScreenshotMode: process.env.RUNTIME_SCREENSHOT_MODE || runtimeSettingDefault('runtimeScreenshotMode', 'last_only'),
    cortexSyncTimeoutMs: parseIntEnv('CORTEX_SYNC_TIMEOUT_MS', runtimeSettingDefault('cortexSyncTimeoutMs', 60_000)),
    cortexAsyncPollIntervalMs: parseIntEnv('CORTEX_ASYNC_POLL_INTERVAL_MS', runtimeSettingDefault('cortexAsyncPollIntervalMs', 5_000)),
    cortexAsyncMaxWaitMs: parseIntEnv('CORTEX_ASYNC_MAX_WAIT_MS', runtimeSettingDefault('cortexAsyncMaxWaitMs', 900_000)),
    cortexAutoStart: parseBoolEnv('CORTEX_AUTO_START', runtimeSettingDefault('cortexAutoStart', true)),
    cortexEnsureReadyTimeoutMs: parseIntEnv('CORTEX_ENSURE_READY_TIMEOUT_MS', runtimeSettingDefault('cortexEnsureReadyTimeoutMs', 15_000)),
    cortexStartReadyTimeoutMs: parseIntEnv('CORTEX_START_READY_TIMEOUT_MS', runtimeSettingDefault('cortexStartReadyTimeoutMs', 60_000)),
    cortexFailureThreshold: parseIntEnv('CORTEX_FAILURE_THRESHOLD', runtimeSettingDefault('cortexFailureThreshold', 3)),
    cortexCircuitOpenMs: parseIntEnv('CORTEX_CIRCUIT_OPEN_MS', runtimeSettingDefault('cortexCircuitOpenMs', 30_000)),
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
      explicitOpenAiModelWrite ||
      explicitLlmModelValidate ||
      explicitLlmModelPlan ||
      explicitLlmModelExtract ||
      explicitOpenAiModelExtract ||
      defaultModel,
    openaiMaxInputChars: parseIntEnv(
      'OPENAI_MAX_INPUT_CHARS',
      parseIntEnv('LLM_MAX_EVIDENCE_CHARS', 50_000)
    ),
    openaiTimeoutMs: timeoutMs,
    llmReasoningMode: parseBoolEnv('LLM_REASONING_MODE', runtimeSettingDefault('llmReasoningMode', hasDeepSeekKey)),
    llmReasoningBudget: parseIntEnv('LLM_REASONING_BUDGET', runtimeSettingDefault('llmReasoningBudget', 32768)),
    llmMaxTokens: parseIntEnv('LLM_MAX_TOKENS', runtimeSettingDefault('llmMaxTokens', 16384)),
    llmExtractReasoningBudget: parseIntEnv('LLM_EXTRACT_REASONING_BUDGET', runtimeSettingDefault('llmExtractReasoningBudget', 4096)),
    llmExtractMaxTokens: parseIntEnv('LLM_EXTRACT_MAX_TOKENS', runtimeSettingDefault('llmExtractMaxTokens', 1200)),
    llmExtractMaxSnippetsPerBatch: parseIntEnv('LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH', runtimeSettingDefault('llmExtractMaxSnippetsPerBatch', 4)),
    llmExtractMaxSnippetChars: parseIntEnv('LLM_EXTRACT_MAX_SNIPPET_CHARS', runtimeSettingDefault('llmExtractMaxSnippetChars', 900)),
    llmExtractSkipLowSignal: parseBoolEnv('LLM_EXTRACT_SKIP_LOW_SIGNAL', runtimeSettingDefault('llmExtractSkipLowSignal', true)),
    llmVerifyMode: parseBoolEnv('LLM_VERIFY_MODE', runtimeSettingDefault('llmVerifyMode', false)),
    llmVerifySampleRate: parseIntEnv('LLM_VERIFY_SAMPLE_RATE', runtimeSettingDefault('llmVerifySampleRate', 10)),
    llmVerifyAggressiveAlways: parseBoolEnv('LLM_VERIFY_AGGRESSIVE_ALWAYS', false),
    llmVerifyAggressiveBatchCount: parseIntEnv('LLM_VERIFY_AGGRESSIVE_BATCH_COUNT', 3),
    llmMaxOutputTokens: parseIntEnv('LLM_MAX_OUTPUT_TOKENS', runtimeSettingDefault('llmMaxOutputTokens', 1200)),
    llmMaxOutputTokensPlan: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_PLAN', runtimeSettingDefault('llmMaxOutputTokensPlan', 4096)),
    llmMaxOutputTokensFast: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_FAST', runtimeSettingDefault('llmMaxOutputTokensFast', 1200)),
    llmMaxOutputTokensTriage: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_TRIAGE', runtimeSettingDefault('llmMaxOutputTokensTriage', 1200)),
    llmMaxOutputTokensReasoning: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_REASONING', runtimeSettingDefault('llmMaxOutputTokensReasoning', 32768)),
    llmMaxOutputTokensExtract: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_EXTRACT', runtimeSettingDefault('llmMaxOutputTokensExtract', 1200)),
    llmMaxOutputTokensValidate: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_VALIDATE', runtimeSettingDefault('llmMaxOutputTokensValidate', 1200)),
    llmMaxOutputTokensWrite: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_WRITE', runtimeSettingDefault('llmMaxOutputTokensWrite', 1200)),
    llmMaxOutputTokensPlanFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK', runtimeSettingDefault('llmMaxOutputTokensPlanFallback', 1200)),
    llmMaxOutputTokensExtractFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_EXTRACT_FALLBACK', runtimeSettingDefault('llmMaxOutputTokensExtractFallback', 1200)),
    llmMaxOutputTokensValidateFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_VALIDATE_FALLBACK', runtimeSettingDefault('llmMaxOutputTokensValidateFallback', 1200)),
    llmMaxOutputTokensWriteFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_WRITE_FALLBACK', runtimeSettingDefault('llmMaxOutputTokensWriteFallback', 1200)),
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
    llmDisableBudgetGuards: parseBoolEnv('LLM_DISABLE_BUDGET_GUARDS', runtimeSettingDefault('llmDisableBudgetGuards', false)),
    llmMaxBatchesPerProduct: parseIntEnv('LLM_MAX_BATCHES_PER_PRODUCT', runtimeSettingDefault('llmMaxBatchesPerProduct', 7)),
    llmExtractionCacheEnabled: parseBoolEnv('LLM_EXTRACTION_CACHE_ENABLED', runtimeSettingDefault('llmExtractionCacheEnabled', true)),
    llmExtractionCacheDir: process.env.LLM_EXTRACTION_CACHE_DIR || runtimeSettingDefault('llmExtractionCacheDir', '.specfactory_tmp/llm_cache'),
    llmExtractionCacheTtlMs: parseIntEnv('LLM_EXTRACTION_CACHE_TTL_MS', runtimeSettingDefault('llmExtractionCacheTtlMs', 7 * 24 * 60 * 60 * 1000)),
    llmMaxCallsPerProductTotal: parseIntEnv('LLM_MAX_CALLS_PER_PRODUCT_TOTAL', runtimeSettingDefault('llmMaxCallsPerProductTotal', 14)),
    llmMaxCallsPerProductFast: parseIntEnv('LLM_MAX_CALLS_PER_PRODUCT_FAST', runtimeSettingDefault('llmMaxCallsPerProductFast', 2)),
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
    daemonGracefulShutdownTimeoutMs: parseIntEnv('DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS', runtimeSettingDefault('daemonGracefulShutdownTimeoutMs', 60_000)),
    driftDetectionEnabled: parseBoolEnv('DRIFT_DETECTION_ENABLED', runtimeSettingDefault('driftDetectionEnabled', true)),
    driftPollSeconds: parseIntEnv('DRIFT_POLL_SECONDS', runtimeSettingDefault('driftPollSeconds', 24 * 60 * 60)),
    driftScanMaxProducts: parseIntEnv('DRIFT_SCAN_MAX_PRODUCTS', runtimeSettingDefault('driftScanMaxProducts', 250)),
    driftAutoRepublish: parseBoolEnv('DRIFT_AUTO_REPUBLISH', runtimeSettingDefault('driftAutoRepublish', true)),
    categoryAuthorityEnabled: parseBoolEnv('HELPER_FILES_ENABLED', runtimeSettingDefault('categoryAuthorityEnabled', true)),
    [`helper${'FilesEnabled'}`]: parseBoolEnv('HELPER_FILES_ENABLED', runtimeSettingDefault('helperFilesEnabled', true)),
    categoryAuthorityRoot: resolvedCategoryAuthorityRoot,
    [`helper${'FilesRoot'}`]: resolvedCategoryAuthorityRoot || process.env.HELPER_FILES_ROOT || 'category_authority',
    helperSupportiveEnabled: parseBoolEnv('HELPER_SUPPORTIVE_ENABLED', runtimeSettingDefault('helperSupportiveEnabled', true)),
    helperSupportiveFillMissing: parseBoolEnv('HELPER_SUPPORTIVE_FILL_MISSING', runtimeSettingDefault('helperSupportiveFillMissing', true)),
    helperSupportiveMaxSources: parseIntEnv('HELPER_SUPPORTIVE_MAX_SOURCES', runtimeSettingDefault('helperSupportiveMaxSources', 6)),
    helperAutoSeedTargets: parseBoolEnv('HELPER_AUTO_SEED_TARGETS', runtimeSettingDefault('helperAutoSeedTargets', true)),
    helperActiveSyncLimit: parseIntEnv('HELPER_ACTIVE_SYNC_LIMIT', runtimeSettingDefault('helperActiveSyncLimit', 0)),
    graphqlReplayEnabled: parseBoolEnv('GRAPHQL_REPLAY_ENABLED', runtimeSettingDefault('graphqlReplayEnabled', true)),
    maxGraphqlReplays: parseIntEnv('MAX_GRAPHQL_REPLAYS', runtimeSettingDefault('maxGraphqlReplays', 5)),
    maxNetworkResponsesPerPage: parseIntEnv('MAX_NETWORK_RESPONSES_PER_PAGE', runtimeSettingDefault('maxNetworkResponsesPerPage', 1200)),
    pageGotoTimeoutMs: parseIntEnv('PAGE_GOTO_TIMEOUT_MS', runtimeSettingDefault('pageGotoTimeoutMs', 12000)),
    pageNetworkIdleTimeoutMs: parseIntEnv('PAGE_NETWORK_IDLE_TIMEOUT_MS', runtimeSettingDefault('pageNetworkIdleTimeoutMs', 4_000)),
    postLoadWaitMs: parseIntEnv('POST_LOAD_WAIT_MS', runtimeSettingDefault('postLoadWaitMs', 200)),
    articleExtractorV2Enabled: parseBoolEnv('ARTICLE_EXTRACTOR_V2', runtimeSettingDefault('articleExtractorV2Enabled', true)),
    articleExtractorMinChars: parseIntEnv('ARTICLE_EXTRACTOR_MIN_CHARS', runtimeSettingDefault('articleExtractorMinChars', 700)),
    articleExtractorMinScore: parseIntEnv('ARTICLE_EXTRACTOR_MIN_SCORE', runtimeSettingDefault('articleExtractorMinScore', 45)),
    articleExtractorMaxChars: parseIntEnv('ARTICLE_EXTRACTOR_MAX_CHARS', runtimeSettingDefault('articleExtractorMaxChars', 24_000)),
    articleExtractorDomainPolicyMap: normalizedArticleExtractorDomainPolicyMap,
    articleExtractorDomainPolicyMapJson,
    htmlTableExtractorV2: parseBoolEnv('HTML_TABLE_EXTRACTOR_V2', runtimeSettingDefault('htmlTableExtractorV2', true)),
    staticDomExtractorEnabled: parseBoolEnv('STATIC_DOM_EXTRACTOR_ENABLED', runtimeSettingDefault('staticDomExtractorEnabled', true)),
    staticDomMode: normalizeStaticDomMode(process.env.STATIC_DOM_MODE || runtimeSettingDefault('staticDomMode', 'cheerio')),
    staticDomTargetMatchThreshold: parseFloatEnv('STATIC_DOM_TARGET_MATCH_THRESHOLD', runtimeSettingDefault('staticDomTargetMatchThreshold', 0.55)),
    staticDomMaxEvidenceSnippets: parseIntEnv('STATIC_DOM_MAX_EVIDENCE_SNIPPETS', runtimeSettingDefault('staticDomMaxEvidenceSnippets', 120)),
    structuredMetadataExtructEnabled: parseBoolEnv('STRUCTURED_METADATA_EXTRUCT_ENABLED', runtimeSettingDefault('structuredMetadataExtructEnabled', false)),
    structuredMetadataExtructUrl: process.env.STRUCTURED_METADATA_EXTRUCT_URL || runtimeSettingDefault('structuredMetadataExtructUrl', 'http://127.0.0.1:8011/extract/structured'),
    structuredMetadataExtructTimeoutMs: parseIntEnv('STRUCTURED_METADATA_EXTRUCT_TIMEOUT_MS', runtimeSettingDefault('structuredMetadataExtructTimeoutMs', 2000)),
    structuredMetadataExtructMaxItemsPerSurface: parseIntEnv('STRUCTURED_METADATA_EXTRUCT_MAX_ITEMS_PER_SURFACE', runtimeSettingDefault('structuredMetadataExtructMaxItemsPerSurface', 200)),
    structuredMetadataExtructCacheEnabled: parseBoolEnv('STRUCTURED_METADATA_EXTRUCT_CACHE_ENABLED', runtimeSettingDefault('structuredMetadataExtructCacheEnabled', true)),
    structuredMetadataExtructCacheLimit: parseIntEnv('STRUCTURED_METADATA_EXTRUCT_CACHE_LIMIT', runtimeSettingDefault('structuredMetadataExtructCacheLimit', 400)),
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
    chartExtractionEnabled: parseBoolEnv('CHART_EXTRACTION_ENABLED', runtimeSettingDefault('chartExtractionEnabled', true)),
    domSnippetMaxChars: parseIntEnv('DOM_SNIPPET_MAX_CHARS', runtimeSettingDefault('domSnippetMaxChars', 3600)),
    autoScrollEnabled: parseBoolEnv('AUTO_SCROLL_ENABLED', runtimeSettingDefault('autoScrollEnabled', false)),
    autoScrollPasses: parseIntEnv('AUTO_SCROLL_PASSES', runtimeSettingDefault('autoScrollPasses', 0)),
    autoScrollDelayMs: parseIntEnv('AUTO_SCROLL_DELAY_MS', runtimeSettingDefault('autoScrollDelayMs', 900)),
    robotsTxtCompliant: parseBoolEnv('ROBOTS_TXT_COMPLIANT', runtimeSettingDefault('robotsTxtCompliant', true)),
    robotsTxtTimeoutMs: parseIntEnv('ROBOTS_TXT_TIMEOUT_MS', runtimeSettingDefault('robotsTxtTimeoutMs', 6000)),
    endpointSignalLimit: parseIntEnv('ENDPOINT_SIGNAL_LIMIT', runtimeSettingDefault('endpointSignalLimit', 30)),
    endpointSuggestionLimit: parseIntEnv('ENDPOINT_SUGGESTION_LIMIT', runtimeSettingDefault('endpointSuggestionLimit', 12)),
    endpointNetworkScanLimit: parseIntEnv('ENDPOINT_NETWORK_SCAN_LIMIT', runtimeSettingDefault('endpointNetworkScanLimit', 600)),
    manufacturerBroadDiscovery: parseBoolEnv('MANUFACTURER_BROAD_DISCOVERY', runtimeSettingDefault('manufacturerBroadDiscovery', false)),
    manufacturerSeedSearchUrls: parseBoolEnv('MANUFACTURER_SEED_SEARCH_URLS', runtimeSettingDefault('manufacturerSeedSearchUrls', false)),
    manufacturerAutoPromote: parseBoolEnv('MANUFACTURER_AUTO_PROMOTE', runtimeSettingDefault('manufacturerAutoPromote', true)),
    allowBelowPassTargetFill: parseBoolEnv('ALLOW_BELOW_PASS_TARGET_FILL', runtimeSettingDefault('allowBelowPassTargetFill', false)),
    selfImproveEnabled: parseBoolEnv('SELF_IMPROVE_ENABLED', runtimeSettingDefault('selfImproveEnabled', true)),
    maxHypothesisItems: parseIntEnv('MAX_HYPOTHESIS_ITEMS', runtimeSettingDefault('maxHypothesisItems', 50)),
    hypothesisAutoFollowupRounds: parseIntEnv('HYPOTHESIS_AUTO_FOLLOWUP_ROUNDS', runtimeSettingDefault('hypothesisAutoFollowupRounds', 0)),
    hypothesisFollowupUrlsPerRound: parseIntEnv('HYPOTHESIS_FOLLOWUP_URLS_PER_ROUND', runtimeSettingDefault('hypothesisFollowupUrlsPerRound', 12)),
    fieldRewardHalfLifeDays: parseIntEnv('FIELD_REWARD_HALF_LIFE_DAYS', runtimeSettingDefault('fieldRewardHalfLifeDays', 45)),
    batchStrategy: (process.env.BATCH_STRATEGY || runtimeSettingDefault('batchStrategy', 'bandit')).toLowerCase(),
    fieldRulesEngineEnforceEvidence: parseBoolEnv('FIELD_RULES_ENGINE_ENFORCE_EVIDENCE', true),

    // SQLite migration feature flags (dual-write controls)
    queueJsonWrite: parseBoolEnv('QUEUE_JSON_WRITE', runtimeSettingDefault('queueJsonWrite', false)),
    billingJsonWrite: parseBoolEnv('BILLING_JSON_WRITE', runtimeSettingDefault('billingJsonWrite', false)),
    intelJsonWrite: parseBoolEnv('INTEL_JSON_WRITE', runtimeSettingDefault('intelJsonWrite', false)),
    corpusJsonWrite: parseBoolEnv('CORPUS_JSON_WRITE', runtimeSettingDefault('corpusJsonWrite', false)),
    learningJsonWrite: parseBoolEnv('LEARNING_JSON_WRITE', runtimeSettingDefault('learningJsonWrite', false)),
    cacheJsonWrite: parseBoolEnv('CACHE_JSON_WRITE', runtimeSettingDefault('cacheJsonWrite', false)),
    eventsJsonWrite: parseBoolEnv('EVENTS_JSON_WRITE', runtimeSettingDefault('eventsJsonWrite', true)),
    runtimeOpsWorkbenchEnabled: parseBoolEnv('RUNTIME_OPS_WORKBENCH_ENABLED', true),
    authoritySnapshotEnabled: parseBoolEnv('AUTHORITY_SNAPSHOT_ENABLED', runtimeSettingDefault('authoritySnapshotEnabled', true)),
    runtimeScreencastEnabled: parseBoolEnv('RUNTIME_SCREENCAST_ENABLED', runtimeSettingDefault('runtimeScreencastEnabled', true)),
    runtimeScreencastFps: parseIntEnv('RUNTIME_SCREENCAST_FPS', runtimeSettingDefault('runtimeScreencastFps', 2)),
    runtimeScreencastQuality: parseIntEnv('RUNTIME_SCREENCAST_QUALITY', runtimeSettingDefault('runtimeScreencastQuality', 50)),
    runtimeScreencastMaxWidth: parseIntEnv('RUNTIME_SCREENCAST_MAX_WIDTH', runtimeSettingDefault('runtimeScreencastMaxWidth', 1280)),
    runtimeScreencastMaxHeight: parseIntEnv('RUNTIME_SCREENCAST_MAX_HEIGHT', runtimeSettingDefault('runtimeScreencastMaxHeight', 720)),
    runtimeAutoSaveEnabled: parseBoolEnv('RUNTIME_AUTOSAVE_ENABLED', runtimeSettingDefault('runtimeAutoSaveEnabled', true))
  };

  const canonicalCfg = applyCanonicalSettingsDefaults(cfg, explicitEnvKeys);

  const filtered = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  );

  const merged = {
    ...canonicalCfg,
    ...filtered
  };
  if (merged.localMode === true && !filtered.outputMode) {
    merged.outputMode = 'local';
  }
  merged.outputMode = normalizeOutputMode(merged.outputMode, merged.localMode ? 'local' : 'dual');
  if (merged.outputMode === 'local') {
    merged.mirrorToS3 = false;
  }
  if (!merged.s3Bucket) {
    merged.mirrorToS3 = false;
  }
  merged.userAgent = normalizeUserAgent(merged.userAgent, DEFAULT_USER_AGENT);

  merged.llmProvider = merged.llmProvider || inferLlmProvider(
    merged.llmBaseUrl || merged.openaiBaseUrl,
    merged.llmModelExtract || merged.openaiModelExtract,
    Boolean(process.env.DEEPSEEK_API_KEY)
  );
  merged.llmApiKey = merged.llmApiKey || merged.openaiApiKey;
  merged.llmBaseUrl = merged.llmBaseUrl || merged.openaiBaseUrl;
  merged.llmModelExtract = merged.llmModelExtract || merged.openaiModelExtract;
  merged.llmModelPlan = merged.llmModelPlan || merged.openaiModelPlan;
  merged.llmModelFast = merged.llmModelFast || merged.llmModelExtract || merged.llmModelPlan;
  merged.llmModelTriage = merged.llmModelTriage || merged.cortexModelRerankFast || merged.cortexModelSearchFast || merged.llmModelFast;
  merged.llmModelReasoning = merged.llmModelReasoning || merged.llmModelExtract;
  merged.llmModelValidate = merged.llmModelValidate || merged.openaiModelWrite;
  merged.llmModelWrite = merged.llmModelWrite || merged.llmModelValidate;
  merged.staticDomMode = normalizeStaticDomMode(merged.staticDomMode, 'cheerio');
  merged.staticDomTargetMatchThreshold = Math.max(0, Math.min(
    1,
    Number.parseFloat(String(merged.staticDomTargetMatchThreshold ?? 0.55))
  ));
  merged.staticDomMaxEvidenceSnippets = Math.max(
    10,
    Math.min(500, Number.parseInt(String(merged.staticDomMaxEvidenceSnippets ?? 120), 10) || 120)
  );
  merged.pdfPreferredBackend = normalizePdfBackend(merged.pdfPreferredBackend || 'auto', 'auto');
  merged.pdfBackendRouterTimeoutMs = Math.max(
    10_000,
    Math.min(300_000, Number.parseInt(String(merged.pdfBackendRouterTimeoutMs ?? 120_000), 10) || 120_000)
  );
  merged.pdfBackendRouterMaxPages = Math.max(
    1,
    Math.min(300, Number.parseInt(String(merged.pdfBackendRouterMaxPages ?? 60), 10) || 60)
  );
  merged.pdfBackendRouterMaxPairs = Math.max(
    100,
    Math.min(20_000, Number.parseInt(String(merged.pdfBackendRouterMaxPairs ?? 5000), 10) || 5000)
  );
  merged.pdfBackendRouterMaxTextPreviewChars = Math.max(
    1000,
    Math.min(100_000, Number.parseInt(String(merged.pdfBackendRouterMaxTextPreviewChars ?? 20_000), 10) || 20_000)
  );
  merged.scannedPdfOcrBackend = normalizeScannedPdfOcrBackend(merged.scannedPdfOcrBackend || 'auto', 'auto');
  merged.scannedPdfOcrMaxPages = Math.max(
    1,
    Math.min(100, Number.parseInt(String(merged.scannedPdfOcrMaxPages ?? 8), 10) || 8)
  );
  merged.scannedPdfOcrMaxPairs = Math.max(
    50,
    Math.min(20_000, Number.parseInt(String(merged.scannedPdfOcrMaxPairs ?? 1200), 10) || 1200)
  );
  merged.scannedPdfOcrMinCharsPerPage = Math.max(
    1,
    Math.min(500, Number.parseInt(String(merged.scannedPdfOcrMinCharsPerPage ?? 45), 10) || 45)
  );
  merged.scannedPdfOcrMinLinesPerPage = Math.max(
    1,
    Math.min(100, Number.parseInt(String(merged.scannedPdfOcrMinLinesPerPage ?? 3), 10) || 3)
  );
  merged.scannedPdfOcrMinConfidence = Math.max(
    0,
    Math.min(1, Number.parseFloat(String(merged.scannedPdfOcrMinConfidence ?? 0.55)) || 0.55)
  );
  merged.structuredMetadataExtructUrl = normalizeBaseUrl(
    merged.structuredMetadataExtructUrl || 'http://127.0.0.1:8011/extract/structured'
  );
  merged.structuredMetadataExtructTimeoutMs = Math.max(
    250,
    Math.min(15_000, Number.parseInt(String(merged.structuredMetadataExtructTimeoutMs ?? 2000), 10) || 2000)
  );
  merged.structuredMetadataExtructMaxItemsPerSurface = Math.max(
    1,
    Math.min(1000, Number.parseInt(String(merged.structuredMetadataExtructMaxItemsPerSurface ?? 200), 10) || 200)
  );
  merged.structuredMetadataExtructCacheLimit = Math.max(
    32,
    Math.min(5000, Number.parseInt(String(merged.structuredMetadataExtructCacheLimit ?? 400), 10) || 400)
  );
  merged.llmPlanProvider = merged.llmPlanProvider || merged.llmProvider;
  merged.llmPlanBaseUrl = merged.llmPlanBaseUrl || merged.llmBaseUrl;
  merged.llmPlanApiKey = merged.llmPlanApiKey || merged.llmApiKey;
  merged.llmExtractProvider = merged.llmExtractProvider || merged.llmProvider;
  merged.llmExtractBaseUrl = merged.llmExtractBaseUrl || merged.llmBaseUrl;
  merged.llmExtractApiKey = merged.llmExtractApiKey || merged.llmApiKey;
  merged.llmValidateProvider = merged.llmValidateProvider || merged.llmProvider;
  merged.llmValidateBaseUrl = merged.llmValidateBaseUrl || merged.llmBaseUrl;
  merged.llmValidateApiKey = merged.llmValidateApiKey || merged.llmApiKey;
  merged.llmWriteProvider = merged.llmWriteProvider || merged.llmProvider;
  merged.llmWriteBaseUrl = merged.llmWriteBaseUrl || merged.llmBaseUrl;
  merged.llmWriteApiKey = merged.llmWriteApiKey || merged.llmApiKey;
  merged.cortexModelRerankFast = merged.cortexModelRerankFast || merged.cortexModelSearchFast || merged.llmModelTriage || merged.llmModelFast;
  merged.llmModelPricingMap = normalizeModelPricingMap(
    mergeModelPricingMaps(buildDefaultModelPricingMap(), merged.llmModelPricingMap || {})
  );
  merged.llmPricingAsOf = String(merged.llmPricingAsOf || LLM_PRICING_AS_OF);
  merged.llmPricingSources = normalizePricingSources(merged.llmPricingSources || LLM_PRICING_SOURCES);
  merged.llmModelOutputTokenMap = normalizeModelOutputTokenMap(merged.llmModelOutputTokenMap || {});
  merged.llmOutputTokenPresets = parseTokenPresetList(
    merged.llmOutputTokenPresets,
    [256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192]
  );
  merged.llmMaxOutputTokensPlan = toTokenInt(merged.llmMaxOutputTokensPlan, toTokenInt(merged.llmMaxOutputTokens, 1200));
  merged.llmMaxOutputTokensFast = toTokenInt(merged.llmMaxOutputTokensFast, merged.llmMaxOutputTokensPlan);
  merged.llmMaxOutputTokensTriage = toTokenInt(merged.llmMaxOutputTokensTriage, merged.llmMaxOutputTokensFast);
  merged.llmMaxOutputTokensReasoning = toTokenInt(merged.llmMaxOutputTokensReasoning, toTokenInt(merged.llmReasoningBudget, merged.llmMaxOutputTokens));
  merged.llmMaxOutputTokensExtract = toTokenInt(merged.llmMaxOutputTokensExtract, merged.llmMaxOutputTokensPlan);
  merged.llmMaxOutputTokensValidate = toTokenInt(merged.llmMaxOutputTokensValidate, merged.llmMaxOutputTokensPlan);
  merged.llmMaxOutputTokensWrite = toTokenInt(merged.llmMaxOutputTokensWrite, merged.llmMaxOutputTokensPlan);
  merged.llmMaxOutputTokensPlanFallback = toTokenInt(merged.llmMaxOutputTokensPlanFallback, merged.llmMaxOutputTokensPlan);
  merged.llmMaxOutputTokensExtractFallback = toTokenInt(merged.llmMaxOutputTokensExtractFallback, merged.llmMaxOutputTokensExtract);
  merged.llmMaxOutputTokensValidateFallback = toTokenInt(merged.llmMaxOutputTokensValidateFallback, merged.llmMaxOutputTokensValidate);
  merged.llmMaxOutputTokensWriteFallback = toTokenInt(merged.llmMaxOutputTokensWriteFallback, merged.llmMaxOutputTokensWrite);

  const upsertTokenProfile = (modelName, defaults = {}) => {
    const model = String(modelName || '').trim();
    if (!model) return;
    const existing = merged.llmModelOutputTokenMap[model] || {};
    const defaultOutputTokens = toTokenInt(
      existing.defaultOutputTokens,
      toTokenInt(defaults.defaultOutputTokens, 0)
    );
    const maxOutputTokens = toTokenInt(
      existing.maxOutputTokens,
      toTokenInt(defaults.maxOutputTokens, 0)
    );
    merged.llmModelOutputTokenMap[model] = {
      defaultOutputTokens,
      maxOutputTokens
    };
  };

  upsertTokenProfile('deepseek-chat', {
    defaultOutputTokens: merged.deepseekChatMaxOutputDefault,
    maxOutputTokens: merged.deepseekChatMaxOutputMaximum
  });
  upsertTokenProfile('deepseek-reasoner', {
    defaultOutputTokens: merged.deepseekReasonerMaxOutputDefault,
    maxOutputTokens: merged.deepseekReasonerMaxOutputMaximum
  });
  upsertTokenProfile('gemini-2.5-flash-lite', {
    defaultOutputTokens: 4096,
    maxOutputTokens: 8192
  });
  upsertTokenProfile('gemini-2.5-flash', {
    defaultOutputTokens: 3072,
    maxOutputTokens: 8192
  });
  upsertTokenProfile('gpt-5-low', {
    defaultOutputTokens: 3072,
    maxOutputTokens: 16384
  });
  upsertTokenProfile('gpt-5.1-low', {
    defaultOutputTokens: 3072,
    maxOutputTokens: 16384
  });
  upsertTokenProfile('gpt-5.1-high', {
    defaultOutputTokens: 4096,
    maxOutputTokens: 16384
  });
  upsertTokenProfile('gpt-5.2-high', {
    defaultOutputTokens: 4096,
    maxOutputTokens: 16384
  });
  upsertTokenProfile('gpt-5.2-xhigh', {
    defaultOutputTokens: 6144,
    maxOutputTokens: 16384
  });
  merged.llmTimeoutMs = merged.llmTimeoutMs || merged.openaiTimeoutMs;
  merged.openaiApiKey = merged.llmApiKey;
  merged.openaiBaseUrl = merged.llmBaseUrl;
  merged.openaiModelExtract = merged.llmModelExtract;
  merged.openaiModelPlan = merged.llmModelPlan;
  merged.openaiModelWrite = merged.llmModelWrite;
  merged.openaiTimeoutMs = merged.llmTimeoutMs;

  merged.runProfile = 'standard';
  merged.manufacturerReserveUrls = Math.max(0, Math.min(merged.maxUrlsPerProduct, merged.manufacturerReserveUrls));
  merged.maxManufacturerUrlsPerProduct = Math.max(1, Math.min(merged.maxUrlsPerProduct, merged.maxManufacturerUrlsPerProduct));

  const hasExplicitPreferHttpFetcherOverride = Object.prototype.hasOwnProperty.call(filtered, 'preferHttpFetcher');
  const hasEnvPreferHttpFetcherOverride = Object.prototype.hasOwnProperty.call(process.env, 'PREFER_HTTP_FETCHER');

  if (hasExplicitPreferHttpFetcherOverride) {
    merged.preferHttpFetcher = Boolean(filtered.preferHttpFetcher);
  } else if (hasEnvPreferHttpFetcherOverride) {
    merged.preferHttpFetcher = parseBoolEnv('PREFER_HTTP_FETCHER', merged.preferHttpFetcher);
  }

  return merged;
}

export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Rule 1: LLM is always on — missing API key is a warning (graceful degradation)
  if (!config.llmApiKey) {
    warnings.push({
      code: 'LLM_NO_API_KEY',
      message: 'LLM is enabled but LLM_API_KEY is not set — LLM enrichment will fail at runtime'
    });
  }

  // Rule 2: Discovery requires a search provider
  if (config.searchProvider === 'none') {
    warnings.push({
      code: 'DISCOVERY_NO_SEARCH_PROVIDER',
      message: 'SEARCH_PROVIDER is "none" — discovery search will be skipped'
    });
  }

  // Rule 3: Cortex enabled requires base URL
  if (config.cortexEnabled && !config.cortexBaseUrl) {
    errors.push({
      code: 'CORTEX_NO_BASE_URL',
      message: 'CORTEX_ENABLED=true but CORTEX_BASE_URL is not set'
    });
  }

  // Rule 4: S3 output mode requires AWS credentials
  if (config.outputMode === 's3' && !config.mirrorToS3) {
    warnings.push({
      code: 'S3_MODE_NO_CREDS',
      message: 'OUTPUT_MODE=s3 but AWS credentials not detected'
    });
  }

  // Rule 5: manufacturerReserveUrls should not exceed maxUrlsPerProduct
  if (config.maxUrlsPerProduct < config.manufacturerReserveUrls) {
    warnings.push({
      code: 'MANUFACTURER_RESERVE_EXCEEDS_MAX',
      message: `manufacturerReserveUrls (${config.manufacturerReserveUrls}) > maxUrlsPerProduct (${config.maxUrlsPerProduct})`
    });
  }

  // Rule 8: Budget guards disabled is risky
  if (config.llmDisableBudgetGuards) {
    warnings.push({
      code: 'BUDGET_GUARDS_DISABLED',
      message: 'LLM_DISABLE_BUDGET_GUARDS=true — no cost ceiling in effect'
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
