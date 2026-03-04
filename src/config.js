import fs from 'node:fs';
import path from 'node:path';
import {
  buildDefaultModelPricingMap,
  LLM_PRICING_AS_OF,
  LLM_PRICING_SOURCES,
  mergeModelPricingMaps
} from './billing/modelPricingCatalog.js';
import { normalizeDynamicFetchPolicyMap } from './fetcher/dynamicFetchPolicy.js';
import { normalizeArticleExtractorPolicyMap } from './extract/articleExtractorPolicy.js';
import { CONFIG_MANIFEST_DEFAULTS } from './core/config/manifest.js';

let manifestDefaultsApplied = false;

function applyManifestDefaultsToProcessEnv() {
  if (manifestDefaultsApplied) return;
  for (const [key, defaultValue] of Object.entries(CONFIG_MANIFEST_DEFAULTS || {})) {
    if (process.env[key] !== undefined && process.env[key] !== '') continue;
    const value = String(defaultValue ?? '').trim();
    if (value === '') continue;
    process.env[key] = value;
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

const SEARCH_PROFILE_CAP_DEFAULTS = Object.freeze({
  deterministicAliasCap: 6,
  llmAliasValidationCap: 12,
  llmDocHintQueriesCap: 3,
  llmFieldTargetQueriesCap: 3,
  dedupeQueriesCap: 24
});

const SERP_RERANKER_WEIGHT_DEFAULTS = Object.freeze({
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
  tier2Bonus: 0.5
});

const FETCH_SCHEDULER_INTERNALS_DEFAULTS = Object.freeze({
  defaultDelayMs: 300,
  defaultConcurrency: 2,
  defaultMaxRetries: 1,
  retryWaitMs: 60000
});

const RETRIEVAL_INTERNALS_DEFAULTS = Object.freeze({
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

const EVIDENCE_PACK_LIMITS_DEFAULTS = Object.freeze({
  headingsLimit: 120,
  chunkMaxLength: 3000,
  specSectionsLimit: 8
});

const IDENTITY_GATE_THRESHOLD_BOUNDS_DEFAULTS = Object.freeze({
  thresholdFloor: 0.62,
  thresholdCeiling: 0.92
});

const PARSING_CONFIDENCE_BASE_DEFAULTS = Object.freeze({
  network_json: 1,
  embedded_state: 0.85,
  json_ld: 0.9,
  microdata: 0.88,
  opengraph: 0.8,
  microformat_rdfa: 0.78
});

const REPAIR_DEDUPE_RULE_DEFAULT = 'domain_once';
const AUTOMATION_QUEUE_STORAGE_ENGINE_DEFAULT = 'sqlite';

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

function normalizeIdentityGateThresholdBoundsMap(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const thresholdFloor = clampFloatFromMap(source, 'thresholdFloor', IDENTITY_GATE_THRESHOLD_BOUNDS_DEFAULTS.thresholdFloor, 0, 1);
  const thresholdCeilingRaw = clampFloatFromMap(source, 'thresholdCeiling', IDENTITY_GATE_THRESHOLD_BOUNDS_DEFAULTS.thresholdCeiling, 0, 1);
  const thresholdCeiling = Math.max(thresholdFloor, thresholdCeilingRaw);
  return {
    thresholdFloor,
    thresholdCeiling
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

export function normalizeRunProfile(value) {
  const token = String(value || '').trim().toLowerCase();
  if (['thorough', 'deep', 'full', 'max'].includes(token)) {
    return 'thorough';
  }
  if (['fast', 'quick', 'lean'].includes(token)) {
    return 'fast';
  }
  return 'standard';
}

function intMax(current, floor) {
  return Math.max(Number.parseInt(String(current || 0), 10) || 0, floor);
}

function intMin(current, ceiling) {
  const parsed = Number.parseInt(String(current || 0), 10) || 0;
  return Math.min(parsed, ceiling);
}

export function applyRunProfile(config, profile) {
  const normalizedProfile = normalizeRunProfile(profile || config.runProfile);
  const next = {
    ...config,
    runProfile: normalizedProfile
  };

  if (normalizedProfile === 'thorough') {
    next.maxRunSeconds = intMax(next.maxRunSeconds, 3600);
    next.maxUrlsPerProduct = intMax(next.maxUrlsPerProduct, 220);
    next.maxCandidateUrls = intMax(next.maxCandidateUrls, 280);
    next.maxPagesPerDomain = intMax(next.maxPagesPerDomain, 8);
    next.maxManufacturerUrlsPerProduct = intMax(next.maxManufacturerUrlsPerProduct, 140);
    next.maxManufacturerPagesPerDomain = intMax(next.maxManufacturerPagesPerDomain, 50);
    next.manufacturerReserveUrls = intMax(next.manufacturerReserveUrls, 100);
    next.maxJsonBytes = intMax(next.maxJsonBytes, 6_000_000);
    next.maxGraphqlReplays = intMax(next.maxGraphqlReplays, 20);
    next.maxHypothesisItems = intMax(next.maxHypothesisItems, 120);
    next.maxNetworkResponsesPerPage = intMax(next.maxNetworkResponsesPerPage, 2500);
    next.endpointNetworkScanLimit = intMax(next.endpointNetworkScanLimit, 1800);
    next.endpointSignalLimit = intMax(next.endpointSignalLimit, 120);
    next.endpointSuggestionLimit = intMax(next.endpointSuggestionLimit, 36);
    next.hypothesisAutoFollowupRounds = intMax(next.hypothesisAutoFollowupRounds, 2);
    next.hypothesisFollowupUrlsPerRound = intMax(next.hypothesisFollowupUrlsPerRound, 24);
    next.pageGotoTimeoutMs = intMax(next.pageGotoTimeoutMs, 45_000);
    next.pageNetworkIdleTimeoutMs = intMax(next.pageNetworkIdleTimeoutMs, 15_000);
    next.postLoadWaitMs = intMax(next.postLoadWaitMs, 10_000);
    next.autoScrollEnabled = true;
    next.autoScrollPasses = intMax(next.autoScrollPasses, 3);
    next.autoScrollDelayMs = intMax(next.autoScrollDelayMs, 1200);
    next.discoveryEnabled = true;
    next.fetchCandidateSources = true;
    next.discoveryMaxQueries = intMax(next.discoveryMaxQueries, 24);
    next.discoveryResultsPerQuery = intMax(next.discoveryResultsPerQuery, 20);
    next.discoveryMaxDiscovered = intMax(next.discoveryMaxDiscovered, 300);
    next.discoveryQueryConcurrency = intMax(next.discoveryQueryConcurrency, 8);
    next.llmPlanDiscoveryQueries = true;
    next.manufacturerBroadDiscovery = true;
    next.preferHttpFetcher = false;
  } else if (normalizedProfile === 'fast') {
    next.maxRunSeconds = intMin(next.maxRunSeconds, 180);
    next.maxUrlsPerProduct = intMin(next.maxUrlsPerProduct, 12);
    next.maxCandidateUrls = intMin(next.maxCandidateUrls, 20);
    next.maxPagesPerDomain = intMin(next.maxPagesPerDomain, 2);
    next.maxManufacturerUrlsPerProduct = intMin(next.maxManufacturerUrlsPerProduct, 10);
    next.maxManufacturerPagesPerDomain = intMin(next.maxManufacturerPagesPerDomain, 5);
    next.manufacturerReserveUrls = intMin(next.manufacturerReserveUrls, 4);
    next.discoveryMaxQueries = intMin(next.discoveryMaxQueries, 4);
    next.discoveryResultsPerQuery = intMin(next.discoveryResultsPerQuery, 6);
    next.discoveryMaxDiscovered = intMin(next.discoveryMaxDiscovered, 60);
    next.discoveryQueryConcurrency = intMax(next.discoveryQueryConcurrency, 4);
    next.perHostMinDelayMs = intMin(next.perHostMinDelayMs, 150);
    next.pageGotoTimeoutMs = intMin(next.pageGotoTimeoutMs, 12_000);
    next.pageNetworkIdleTimeoutMs = intMin(next.pageNetworkIdleTimeoutMs, 1_500);
    next.endpointSignalLimit = intMin(next.endpointSignalLimit, 24);
    next.endpointSuggestionLimit = intMin(next.endpointSuggestionLimit, 8);
    next.endpointNetworkScanLimit = intMin(next.endpointNetworkScanLimit, 400);
    next.hypothesisAutoFollowupRounds = intMin(next.hypothesisAutoFollowupRounds, 0);
    next.hypothesisFollowupUrlsPerRound = intMin(next.hypothesisFollowupUrlsPerRound, 8);
    next.postLoadWaitMs = intMin(next.postLoadWaitMs, 0);
    next.autoScrollEnabled = false;
    next.autoScrollPasses = 0;
    next.preferHttpFetcher = true;
  }

  next.manufacturerReserveUrls = Math.max(
    0,
    Math.min(next.maxUrlsPerProduct, next.manufacturerReserveUrls)
  );
  next.maxManufacturerUrlsPerProduct = Math.max(
    1,
    Math.min(next.maxUrlsPerProduct, next.maxManufacturerUrlsPerProduct)
  );

  return next;
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

export function loadDotEnvFile(dotEnvPath = '.env') {
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
    if (process.env[key] !== undefined && process.env[key] !== '') {
      continue;
    }

    const rawValue = withoutExport.slice(separatorIndex + 1);
    process.env[key] = parseDotEnvValue(rawValue);
  }

  return true;
}

export function loadConfig(overrides = {}) {
  applyManifestDefaultsToProcessEnv();

  const maxCandidateUrlsFromEnv =
    process.env.MAX_CANDIDATE_URLS_PER_PRODUCT ||
    process.env.MAX_CANDIDATE_URLS;

  const parsedCandidateUrls = Number.parseInt(String(maxCandidateUrlsFromEnv || ''), 10);
  const hasDeepSeekKey = Boolean(process.env.DEEPSEEK_API_KEY);
  const resolvedApiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
  const resolvedBaseUrl = process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL ||
    (hasDeepSeekKey ? 'https://api.deepseek.com' : 'https://api.openai.com');
  const defaultModel = process.env.LLM_MODEL_EXTRACT || (hasDeepSeekKey ? 'deepseek-reasoner' : 'gpt-4.1-mini');
  const timeoutMs = parseIntEnv('LLM_TIMEOUT_MS', parseIntEnv('OPENAI_TIMEOUT_MS', 40_000));
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
  const normalizedIdentityGateThresholdBoundsMap = normalizeIdentityGateThresholdBoundsMap(
    parseJsonEnv('IDENTITY_GATE_THRESHOLD_BOUNDS_MAP_JSON', {})
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
  const normalizedVisualAssetHeroSelectorMap = parseJsonEnv('VISUAL_ASSET_HERO_SELECTOR_MAP_JSON', {});
  const visualAssetHeroSelectorMapJson = Object.keys(normalizedVisualAssetHeroSelectorMap).length > 0
    ? JSON.stringify(normalizedVisualAssetHeroSelectorMap)
    : '';

  const cfg = {
    awsRegion: process.env.AWS_REGION || 'us-east-2',
    s3Bucket: process.env.S3_BUCKET || 'my-spec-harvester-data',
    s3InputPrefix: (process.env.S3_INPUT_PREFIX || 'specs/inputs').replace(/\/+$/, ''),
    s3OutputPrefix: (process.env.S3_OUTPUT_PREFIX || 'specs/outputs').replace(/\/+$/, ''),
    maxUrlsPerProduct: parseIntEnv('MAX_URLS_PER_PRODUCT', 20),
    maxCandidateUrls: Number.isFinite(parsedCandidateUrls) ? parsedCandidateUrls : 50,
    maxPagesPerDomain: parseIntEnv('MAX_PAGES_PER_DOMAIN', 2),
    manufacturerDeepResearchEnabled: parseBoolEnv('MANUFACTURER_DEEP_RESEARCH_ENABLED', true),
    maxManufacturerUrlsPerProduct: parseIntEnv('MAX_MANUFACTURER_URLS_PER_PRODUCT', 20),
    maxManufacturerPagesPerDomain: parseIntEnv('MAX_MANUFACTURER_PAGES_PER_DOMAIN', 8),
    manufacturerReserveUrls: parseIntEnv('MANUFACTURER_RESERVE_URLS', 10),
    maxRunSeconds: parseIntEnv('MAX_RUN_SECONDS', 300),
    maxJsonBytes: parseIntEnv('MAX_JSON_BYTES', 2_000_000),
    maxPdfBytes: parseIntEnv('MAX_PDF_BYTES', 8_000_000),
    pdfBackendRouterEnabled: parseBoolEnv('PDF_BACKEND_ROUTER_ENABLED', false),
    pdfPreferredBackend: process.env.PDF_PREFERRED_BACKEND || 'auto',
    pdfBackendRouterTimeoutMs: parseIntEnv('PDF_BACKEND_ROUTER_TIMEOUT_MS', 120_000),
    pdfBackendRouterMaxPages: parseIntEnv('PDF_BACKEND_ROUTER_MAX_PAGES', 60),
    pdfBackendRouterMaxPairs: parseIntEnv('PDF_BACKEND_ROUTER_MAX_PAIRS', 5000),
    pdfBackendRouterMaxTextPreviewChars: parseIntEnv('PDF_BACKEND_ROUTER_MAX_TEXT_PREVIEW_CHARS', 20_000),
    scannedPdfOcrEnabled: parseBoolEnv('SCANNED_PDF_OCR_ENABLED', true),
    scannedPdfOcrPromoteCandidates: parseBoolEnv('SCANNED_PDF_OCR_PROMOTE_CANDIDATES', true),
    scannedPdfOcrBackend: process.env.SCANNED_PDF_OCR_BACKEND || 'auto',
    scannedPdfOcrMaxPages: parseIntEnv('SCANNED_PDF_OCR_MAX_PAGES', 4),
    scannedPdfOcrMaxPairs: parseIntEnv('SCANNED_PDF_OCR_MAX_PAIRS', 800),
    scannedPdfOcrMinCharsPerPage: parseIntEnv('SCANNED_PDF_OCR_MIN_CHARS_PER_PAGE', 30),
    scannedPdfOcrMinLinesPerPage: parseIntEnv('SCANNED_PDF_OCR_MIN_LINES_PER_PAGE', 2),
    scannedPdfOcrMinConfidence: parseFloatEnv('SCANNED_PDF_OCR_MIN_CONFIDENCE', 0.5),
    concurrency: parseIntEnv('CONCURRENCY', 2),
    perHostMinDelayMs: parseIntEnv('PER_HOST_MIN_DELAY_MS', 300),
    laneConcurrencySearch: parseIntEnv('LANE_CONCURRENCY_SEARCH', 2),
    laneConcurrencyFetch: parseIntEnv('LANE_CONCURRENCY_FETCH', 4),
    laneConcurrencyParse: parseIntEnv('LANE_CONCURRENCY_PARSE', 4),
    laneConcurrencyLlm: parseIntEnv('LANE_CONCURRENCY_LLM', 2),
    fetchSchedulerEnabled: parseBoolEnv('FETCH_SCHEDULER_ENABLED', false),
    fetchSchedulerMaxRetries: parseIntEnv('FETCH_SCHEDULER_MAX_RETRIES', 1),
    fetchSchedulerFallbackWaitMs: parseIntEnv('FETCH_SCHEDULER_FALLBACK_WAIT_MS', 60000),
    fetchSchedulerInternalsMap: normalizedFetchSchedulerInternalsMap,
    fetchSchedulerInternalsMapJson: JSON.stringify(normalizedFetchSchedulerInternalsMap),
    fetchSchedulerDefaultDelayMs: parseIntEnv('FETCH_SCHEDULER_DEFAULT_DELAY_MS', normalizedFetchSchedulerInternalsMap.defaultDelayMs),
    fetchSchedulerDefaultConcurrency: parseIntEnv('FETCH_SCHEDULER_DEFAULT_CONCURRENCY', normalizedFetchSchedulerInternalsMap.defaultConcurrency),
    fetchSchedulerDefaultMaxRetries: parseIntEnv('FETCH_SCHEDULER_DEFAULT_MAX_RETRIES', normalizedFetchSchedulerInternalsMap.defaultMaxRetries),
    fetchSchedulerRetryWaitMs: parseIntEnv('FETCH_SCHEDULER_RETRY_WAIT_MS', normalizedFetchSchedulerInternalsMap.retryWaitMs),
    userAgent:
      process.env.USER_AGENT ||
      'Mozilla/5.0 (compatible; EGSpecHarvester/1.0; +https://eggear.com)',
    localMode: parseBoolEnv('LOCAL_MODE', false),
    dryRun: parseBoolEnv('DRY_RUN', false),
    outputMode: envOutputMode,
    mirrorToS3: parseBoolEnv('MIRROR_TO_S3', defaultMirrorToS3),
    mirrorToS3Input: parseBoolEnv('MIRROR_TO_S3_INPUT', false),
    localInputRoot: process.env.LOCAL_INPUT_ROOT || process.env.LOCAL_S3_ROOT || 'fixtures/s3',
    localOutputRoot: process.env.LOCAL_OUTPUT_ROOT || 'out',
    runtimeEventsKey: process.env.RUNTIME_EVENTS_KEY || '_runtime/events.jsonl',
    writeMarkdownSummary: parseBoolEnv('WRITE_MARKDOWN_SUMMARY', true),
    runProfile: normalizeRunProfile(process.env.RUN_PROFILE || 'standard'),
    discoveryEnabled: parseBoolEnv('DISCOVERY_ENABLED', false),
    fetchCandidateSources: parseBoolEnv('FETCH_CANDIDATE_SOURCES', true),
    discoveryMaxQueries: parseIntEnv('DISCOVERY_MAX_QUERIES', 6),
    discoveryResultsPerQuery: parseIntEnv('DISCOVERY_RESULTS_PER_QUERY', 10),
    discoveryMaxDiscovered: parseIntEnv('DISCOVERY_MAX_DISCOVERED', 80),
    discoveryQueryConcurrency: parseIntEnv('DISCOVERY_QUERY_CONCURRENCY', 4),
    searchProvider: process.env.SEARCH_PROVIDER || 'none',
    searxngBaseUrl: process.env.SEARXNG_BASE_URL || process.env.SEARXNG_URL || '',
    searxngDefaultBaseUrl: process.env.SEARXNG_DEFAULT_BASE_URL || 'http://127.0.0.1:8080',
    bingSearchKey: process.env.BING_SEARCH_KEY || '',
    bingSearchEndpoint: process.env.BING_SEARCH_ENDPOINT || '',
    googleCseKey: process.env.GOOGLE_CSE_KEY || '',
    googleCseCx: process.env.GOOGLE_CSE_CX || '',
    disableGoogleCse: parseBoolEnv('DISABLE_GOOGLE_CSE', false),
    cseRescueOnlyMode: parseBoolEnv('CSE_RESCUE_ONLY_MODE', true),
    cseRescueRequiredIteration: parseIntEnv('CSE_RESCUE_REQUIRED_ITERATION', 2),
    duckduckgoEnabled: parseBoolEnv('DUCKDUCKGO_ENABLED', true),
    duckduckgoBaseUrl: process.env.DUCKDUCKGO_BASE_URL || 'https://html.duckduckgo.com/html/',
    duckduckgoTimeoutMs: parseIntEnv('DUCKDUCKGO_TIMEOUT_MS', 8_000),
    duckduckgoUserAgent: process.env.DUCKDUCKGO_USER_AGENT || 'Mozilla/5.0 (compatible; SpecFactory/1.0)',
    eloSupabaseAnonKey: process.env.ELO_SUPABASE_ANON_KEY || '',
    eloSupabaseEndpoint: process.env.ELO_SUPABASE_ENDPOINT || '',
    llmEnabled: parseBoolEnv('LLM_ENABLED', false),
    llmWriteSummary: parseBoolEnv('LLM_WRITE_SUMMARY', false),
    llmPlanDiscoveryQueries: parseBoolEnv('LLM_PLAN_DISCOVERY_QUERIES', true),
    llmProvider: (process.env.LLM_PROVIDER || '').trim().toLowerCase(),
    llmApiKey: resolvedApiKey,
    llmBaseUrl: resolvedBaseUrl,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    llmModelExtract: process.env.LLM_MODEL_EXTRACT || defaultModel,
    llmModelPlan: process.env.LLM_MODEL_PLAN || process.env.LLM_MODEL_EXTRACT || defaultModel,
    llmModelFast:
      process.env.LLM_MODEL_FAST ||
      process.env.LLM_MODEL_EXTRACT ||
      defaultModel,
    llmModelTriage:
      process.env.LLM_MODEL_TRIAGE ||
      process.env.CORTEX_MODEL_RERANK_FAST ||
      process.env.CORTEX_MODEL_SEARCH_FAST ||
      process.env.LLM_MODEL_FAST ||
      process.env.LLM_MODEL_PLAN ||
      process.env.LLM_MODEL_EXTRACT ||
      defaultModel,
    llmModelReasoning:
      process.env.LLM_MODEL_REASONING ||
      process.env.LLM_MODEL_EXTRACT ||
      defaultModel,
    llmModelValidate:
      process.env.LLM_MODEL_VALIDATE ||
      process.env.LLM_MODEL_PLAN ||
      process.env.LLM_MODEL_EXTRACT ||
      defaultModel,
    llmModelWrite:
      process.env.LLM_MODEL_WRITE ||
      process.env.LLM_MODEL_VALIDATE ||
      process.env.LLM_MODEL_PLAN ||
      process.env.LLM_MODEL_EXTRACT ||
      defaultModel,
    llmPlanProvider: (process.env.LLM_PLAN_PROVIDER || '').trim().toLowerCase(),
    llmPlanBaseUrl: process.env.LLM_PLAN_BASE_URL || '',
    llmPlanApiKey: process.env.LLM_PLAN_API_KEY || '',
    llmFallbackEnabled: parseBoolEnv('LLM_FALLBACK_ENABLED', false),
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
    llmSerpRerankEnabled: parseBoolEnv('LLM_SERP_RERANK_ENABLED', true),
    llmModelCatalog: process.env.LLM_MODEL_CATALOG || '',
    llmModelPricingMap: mergeModelPricingMaps(
      buildDefaultModelPricingMap(),
      normalizeModelPricingMap(parseJsonEnv('LLM_MODEL_PRICING_JSON', {}))
    ),
    llmPricingAsOf: String(process.env.LLM_PRICING_AS_OF || LLM_PRICING_AS_OF),
    llmPricingSources: normalizePricingSources(parseJsonEnv('LLM_PRICING_SOURCES_JSON', LLM_PRICING_SOURCES)),
    cortexEnabled: parseBoolEnv('CORTEX_ENABLED', false),
    chatmockDir: process.env.CHATMOCK_DIR || defaultChatmockDir(),
    chatmockComposeFile: process.env.CHATMOCK_COMPOSE_FILE
      || path.join(process.env.CHATMOCK_DIR || defaultChatmockDir(), 'docker-compose.yml'),
    cortexBaseUrl: process.env.CORTEX_BASE_URL || 'http://localhost:5001/v1',
    cortexApiKey: process.env.CORTEX_API_KEY || 'key',
    cortexAsyncBaseUrl: process.env.CORTEX_ASYNC_BASE_URL || 'http://localhost:4000/api',
    cortexAsyncSubmitPath: process.env.CORTEX_ASYNC_SUBMIT_PATH || '/jobs',
    cortexAsyncStatusPath: process.env.CORTEX_ASYNC_STATUS_PATH || '/jobs/{id}',
    cortexAsyncEnabled: parseBoolEnv('CORTEX_ASYNC_ENABLED', true),
    cortexModelFast: process.env.CORTEX_MODEL_FAST || 'gpt-5-low',
    cortexModelAudit: process.env.CORTEX_MODEL_AUDIT || process.env.CORTEX_MODEL_FAST || 'gpt-5-low',
    cortexModelDom: process.env.CORTEX_MODEL_DOM || process.env.CORTEX_MODEL_FAST || 'gpt-5-low',
    cortexModelReasoningDeep: process.env.CORTEX_MODEL_REASONING_DEEP || 'gpt-5-high',
    cortexModelVision: process.env.CORTEX_MODEL_VISION || process.env.CORTEX_MODEL_REASONING_DEEP || 'gpt-5-high',
    cortexModelSearchFast: process.env.CORTEX_MODEL_SEARCH_FAST || process.env.CORTEX_MODEL_FAST || 'gpt-5-low',
    cortexModelRerankFast: process.env.CORTEX_MODEL_RERANK_FAST || process.env.CORTEX_MODEL_SEARCH_FAST || process.env.CORTEX_MODEL_FAST || 'gpt-5-low',
    cortexModelSearchDeep: process.env.CORTEX_MODEL_SEARCH_DEEP || process.env.CORTEX_MODEL_REASONING_DEEP || 'gpt-5-high',
    cortexEscalateConfidenceLt: parseFloatEnv('CORTEX_ESCALATE_CONFIDENCE_LT', 0.85),
    cortexEscalateIfConflict: parseBoolEnv('CORTEX_ESCALATE_IF_CONFLICT', true),
    cortexEscalateCriticalOnly: parseBoolEnv('CORTEX_ESCALATE_CRITICAL_ONLY', true),
    cortexMaxDeepFieldsPerProduct: parseIntEnv('CORTEX_MAX_DEEP_FIELDS_PER_PRODUCT', 12),
    aggressiveModeEnabled: parseBoolEnv('AGGRESSIVE_MODE_ENABLED', false),
    aggressiveConfidenceThreshold: parseFloatEnv('AGGRESSIVE_CONFIDENCE_THRESHOLD', 0.85),
    aggressiveMaxSearchQueries: parseIntEnv('AGGRESSIVE_MAX_SEARCH_QUERIES', 5),
    aggressiveEvidenceAuditEnabled: parseBoolEnv('AGGRESSIVE_EVIDENCE_AUDIT_ENABLED', true),
    aggressiveEvidenceAuditBatchSize: parseIntEnv('AGGRESSIVE_EVIDENCE_AUDIT_BATCH_SIZE', 60),
    aggressiveMaxTimePerProductMs: parseIntEnv('AGGRESSIVE_MAX_TIME_PER_PRODUCT_MS', 600_000),
    aggressiveThoroughFromRound: parseIntEnv('AGGRESSIVE_THOROUGH_FROM_ROUND', 2),
    aggressiveRound1MaxUrls: parseIntEnv('AGGRESSIVE_ROUND1_MAX_URLS', 90),
    aggressiveRound1MaxCandidateUrls: parseIntEnv('AGGRESSIVE_ROUND1_MAX_CANDIDATE_URLS', 120),
    aggressiveLlmMaxCallsPerRound: parseIntEnv('AGGRESSIVE_LLM_MAX_CALLS_PER_ROUND', 16),
    aggressiveLlmMaxCallsPerProductTotal: parseIntEnv('AGGRESSIVE_LLM_MAX_CALLS_PER_PRODUCT_TOTAL', 48),
    aggressiveLlmTargetMaxFields: parseIntEnv('AGGRESSIVE_LLM_TARGET_MAX_FIELDS', 75),
    aggressiveLlmDiscoveryPasses: parseIntEnv('AGGRESSIVE_LLM_DISCOVERY_PASSES', 3),
    aggressiveLlmDiscoveryQueryCap: parseIntEnv('AGGRESSIVE_LLM_DISCOVERY_QUERY_CAP', 24),
    uberAggressiveEnabled: parseBoolEnv('UBER_AGGRESSIVE_ENABLED', false),
    uberMaxUrlsPerProduct: parseIntEnv('UBER_MAX_URLS_PER_PRODUCT', 25),
    uberMaxUrlsPerDomain: parseIntEnv('UBER_MAX_URLS_PER_DOMAIN', 6),
    uberMaxRounds: parseIntEnv('UBER_MAX_ROUNDS', 6),
    identityGatePublishThreshold: parseFloatEnv('IDENTITY_GATE_PUBLISH_THRESHOLD', 0.70),
    identityGateBaseMatchThreshold: parseFloatEnv('IDENTITY_GATE_BASE_MATCH_THRESHOLD', 0.80),
    identityGateEasyAmbiguityReduction: parseFloatEnv('IDENTITY_GATE_EASY_AMBIGUITY_REDUCTION', -0.15),
    identityGateMediumAmbiguityReduction: parseFloatEnv('IDENTITY_GATE_MEDIUM_AMBIGUITY_REDUCTION', -0.10),
    identityGateHardAmbiguityReduction: parseFloatEnv('IDENTITY_GATE_HARD_AMBIGUITY_REDUCTION', -0.02),
    identityGateVeryHardAmbiguityIncrease: parseFloatEnv('IDENTITY_GATE_VERY_HARD_AMBIGUITY_INCREASE', 0.01),
    identityGateExtraHardAmbiguityIncrease: parseFloatEnv('IDENTITY_GATE_EXTRA_HARD_AMBIGUITY_INCREASE', 0.03),
    identityGateMissingStrongIdPenalty: parseFloatEnv('IDENTITY_GATE_MISSING_STRONG_ID_PENALTY', -0.05),
    identityGateHardMissingStrongIdIncrease: parseFloatEnv('IDENTITY_GATE_HARD_MISSING_STRONG_ID_INCREASE', 0.03),
    identityGateVeryHardMissingStrongIdIncrease: parseFloatEnv('IDENTITY_GATE_VERY_HARD_MISSING_STRONG_ID_INCREASE', 0.05),
    identityGateExtraHardMissingStrongIdIncrease: parseFloatEnv('IDENTITY_GATE_EXTRA_HARD_MISSING_STRONG_ID_INCREASE', 0.08),
    identityGateNumericTokenBoost: parseFloatEnv('IDENTITY_GATE_NUMERIC_TOKEN_BOOST', 0.10),
    identityGateNumericRangeThreshold: parseIntEnv('IDENTITY_GATE_NUMERIC_RANGE_THRESHOLD', 3),
    identityGateThresholdBoundsMap: normalizedIdentityGateThresholdBoundsMap,
    identityGateThresholdBoundsMapJson: JSON.stringify(normalizedIdentityGateThresholdBoundsMap),
    identityGateThresholdFloor: parseFloatEnv('IDENTITY_GATE_THRESHOLD_FLOOR', normalizedIdentityGateThresholdBoundsMap.thresholdFloor),
    identityGateThresholdCeiling: parseFloatEnv('IDENTITY_GATE_THRESHOLD_CEILING', normalizedIdentityGateThresholdBoundsMap.thresholdCeiling),
    qualityGateIdentityThreshold: parseFloatEnv('QUALITY_GATE_IDENTITY_THRESHOLD', 0.70),
    convergenceMaxRounds: parseIntEnv('CONVERGENCE_MAX_ROUNDS', 3),
    convergenceNoProgressLimit: parseIntEnv('CONVERGENCE_NO_PROGRESS_LIMIT', 2),
    convergenceMaxLowQualityRounds: parseIntEnv('CONVERGENCE_MAX_LOW_QUALITY_ROUNDS', 1),
    convergenceIdentityFailFastRounds: parseIntEnv('CONVERGENCE_IDENTITY_FAIL_FAST_ROUNDS', 1),
    convergenceLowQualityConfidence: parseFloatEnv('CONVERGENCE_LOW_QUALITY_CONFIDENCE', 0.20),
    convergenceMaxDispatchQueries: parseIntEnv('CONVERGENCE_MAX_DISPATCH_QUERIES', 20),
    convergenceMaxTargetFields: parseIntEnv('CONVERGENCE_MAX_TARGET_FIELDS', 30),
    needsetEvidenceDecayDays: parseIntEnv('NEEDSET_EVIDENCE_DECAY_DAYS', 14),
    needsetEvidenceDecayFloor: parseFloatEnv('NEEDSET_EVIDENCE_DECAY_FLOOR', 0.30),
    needsetRequiredWeightIdentity: parseFloatEnv('NEEDSET_REQUIRED_WEIGHT_IDENTITY', 5),
    needsetRequiredWeightCritical: parseFloatEnv('NEEDSET_REQUIRED_WEIGHT_CRITICAL', 4),
    needsetRequiredWeightRequired: parseFloatEnv('NEEDSET_REQUIRED_WEIGHT_REQUIRED', 2),
    needsetRequiredWeightExpected: parseFloatEnv('NEEDSET_REQUIRED_WEIGHT_EXPECTED', 1),
    needsetRequiredWeightOptional: parseFloatEnv('NEEDSET_REQUIRED_WEIGHT_OPTIONAL', 1),
    needsetMissingMultiplier: parseFloatEnv('NEEDSET_MISSING_MULTIPLIER', 2),
    needsetTierDeficitMultiplier: parseFloatEnv('NEEDSET_TIER_DEFICIT_MULTIPLIER', 2),
    needsetMinRefsDeficitMultiplier: parseFloatEnv('NEEDSET_MIN_REFS_DEFICIT_MULTIPLIER', 1.5),
    needsetConflictMultiplier: parseFloatEnv('NEEDSET_CONFLICT_MULTIPLIER', 1.5),
    needsetIdentityLockThreshold: parseFloatEnv('NEEDSET_IDENTITY_LOCK_THRESHOLD', 0.95),
    needsetIdentityProvisionalThreshold: parseFloatEnv('NEEDSET_IDENTITY_PROVISIONAL_THRESHOLD', 0.70),
    needsetDefaultIdentityAuditLimit: parseIntEnv('NEEDSET_DEFAULT_IDENTITY_AUDIT_LIMIT', 24),
    consensusMethodWeightNetworkJson: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_NETWORK_JSON', 1.00),
    consensusMethodWeightAdapterApi: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_ADAPTER_API', 0.95),
    consensusMethodWeightStructuredMeta: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_STRUCTURED_META', 0.90),
    consensusMethodWeightPdf: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_PDF', 0.82),
    consensusMethodWeightTableKv: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_TABLE_KV', 0.78),
    consensusMethodWeightDom: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_DOM', 0.40),
    consensusMethodWeightLlmExtractBase: parseFloatEnv('CONSENSUS_METHOD_WEIGHT_LLM_EXTRACT_BASE', 0.20),
    consensusPolicyBonus: parseFloatEnv('CONSENSUS_POLICY_BONUS', 0.30),
    consensusWeightedMajorityThreshold: parseFloatEnv('CONSENSUS_WEIGHTED_MAJORITY_THRESHOLD', 1.10),
    consensusStrictAcceptanceDomainCount: parseIntEnv('CONSENSUS_STRICT_ACCEPTANCE_DOMAIN_COUNT', 3),
    consensusRelaxedAcceptanceDomainCount: parseIntEnv('CONSENSUS_RELAXED_ACCEPTANCE_DOMAIN_COUNT', 2),
    consensusInstrumentedFieldThreshold: parseIntEnv('CONSENSUS_INSTRUMENTED_FIELD_THRESHOLD', 3),
    consensusConfidenceScoringBase: parseFloatEnv('CONSENSUS_CONFIDENCE_SCORING_BASE', 0.70),
    consensusPassTargetIdentityStrong: parseIntEnv('CONSENSUS_PASS_TARGET_IDENTITY_STRONG', 5),
    consensusPassTargetNormal: parseIntEnv('CONSENSUS_PASS_TARGET_NORMAL', 3),
    evidenceTextMaxChars: parseIntEnv('EVIDENCE_TEXT_MAX_CHARS', 5000),
    needsetCapIdentityLocked: parseFloatEnv('NEEDSET_CAP_IDENTITY_LOCKED', 1.00),
    needsetCapIdentityProvisional: parseFloatEnv('NEEDSET_CAP_IDENTITY_PROVISIONAL', 0.74),
    needsetCapIdentityConflict: parseFloatEnv('NEEDSET_CAP_IDENTITY_CONFLICT', 0.39),
    needsetCapIdentityUnlocked: parseFloatEnv('NEEDSET_CAP_IDENTITY_UNLOCKED', 0.59),
    consensusLlmWeightTier1: parseFloatEnv('CONSENSUS_LLM_WEIGHT_TIER1', 0.60),
    consensusLlmWeightTier2: parseFloatEnv('CONSENSUS_LLM_WEIGHT_TIER2', 0.40),
    consensusLlmWeightTier3: parseFloatEnv('CONSENSUS_LLM_WEIGHT_TIER3', 0.20),
    consensusLlmWeightTier4: parseFloatEnv('CONSENSUS_LLM_WEIGHT_TIER4', 0.15),
    consensusTier1Weight: parseFloatEnv('CONSENSUS_TIER1_WEIGHT', 1.00),
    consensusTier2Weight: parseFloatEnv('CONSENSUS_TIER2_WEIGHT', 0.80),
    consensusTier3Weight: parseFloatEnv('CONSENSUS_TIER3_WEIGHT', 0.45),
    consensusTier4Weight: parseFloatEnv('CONSENSUS_TIER4_WEIGHT', 0.25),
    serpTriageMinScore: parseIntEnv('SERP_TRIAGE_MIN_SCORE', 5),
    serpTriageMaxUrls: parseIntEnv('SERP_TRIAGE_MAX_URLS', 12),
    serpTriageEnabled: parseBoolEnv('SERP_TRIAGE_ENABLED', true),
    retrievalMaxHitsPerField: parseIntEnv('RETRIEVAL_MAX_HITS_PER_FIELD', 24),
    retrievalMaxPrimeSources: parseIntEnv('RETRIEVAL_MAX_PRIME_SOURCES', 8),
    retrievalIdentityFilterEnabled: parseBoolEnv('RETRIEVAL_IDENTITY_FILTER_ENABLED', true),
    retrievalTierWeightTier1: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER1', 3.00),
    retrievalTierWeightTier2: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER2', 2.00),
    retrievalTierWeightTier3: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER3', 1.00),
    retrievalTierWeightTier4: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER4', 0.65),
    retrievalTierWeightTier5: parseFloatEnv('RETRIEVAL_TIER_WEIGHT_TIER5', 0.40),
    retrievalDocKindWeightManualPdf: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_MANUAL_PDF', 1.50),
    retrievalDocKindWeightSpecPdf: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_SPEC_PDF', 1.40),
    retrievalDocKindWeightSupport: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_SUPPORT', 1.10),
    retrievalDocKindWeightLabReview: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_LAB_REVIEW', 0.95),
    retrievalDocKindWeightProductPage: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_PRODUCT_PAGE', 0.75),
    retrievalDocKindWeightOther: parseFloatEnv('RETRIEVAL_DOC_KIND_WEIGHT_OTHER', 0.55),
    retrievalMethodWeightTable: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_TABLE', 1.25),
    retrievalMethodWeightKv: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_KV', 1.15),
    retrievalMethodWeightJsonLd: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_JSON_LD', 1.10),
    retrievalMethodWeightLlmExtract: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_LLM_EXTRACT', 0.85),
    retrievalMethodWeightHelperSupportive: parseFloatEnv('RETRIEVAL_METHOD_WEIGHT_HELPER_SUPPORTIVE', 0.65),
    retrievalAnchorScorePerMatch: parseFloatEnv('RETRIEVAL_ANCHOR_SCORE_PER_MATCH', 0.42),
    retrievalIdentityScorePerMatch: parseFloatEnv('RETRIEVAL_IDENTITY_SCORE_PER_MATCH', 0.28),
    retrievalUnitMatchBonus: parseFloatEnv('RETRIEVAL_UNIT_MATCH_BONUS', 0.35),
    retrievalDirectFieldMatchBonus: parseFloatEnv('RETRIEVAL_DIRECT_FIELD_MATCH_BONUS', 0.65),
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
    specDbDir: process.env.SPEC_DB_DIR || '.specfactory_tmp',
    frontierDbPath: process.env.FRONTIER_DB_PATH || '_intel/frontier/frontier.json',
    frontierEnableSqlite: parseBoolEnv('FRONTIER_ENABLE_SQLITE', true),
    frontierStripTrackingParams: parseBoolEnv('FRONTIER_STRIP_TRACKING_PARAMS', true),
    frontierQueryCooldownSeconds: parseIntEnv('FRONTIER_QUERY_COOLDOWN_SECONDS', 6 * 60 * 60),
    frontierCooldown404Seconds: parseIntEnv('FRONTIER_COOLDOWN_404', 72 * 60 * 60),
    frontierCooldown404RepeatSeconds: parseIntEnv('FRONTIER_COOLDOWN_404_REPEAT', 14 * 24 * 60 * 60),
    frontierCooldown410Seconds: parseIntEnv('FRONTIER_COOLDOWN_410', 90 * 24 * 60 * 60),
    frontierCooldownTimeoutSeconds: parseIntEnv('FRONTIER_COOLDOWN_TIMEOUT', 6 * 60 * 60),
    frontierCooldown403BaseSeconds: parseIntEnv('FRONTIER_COOLDOWN_403_BASE', 30 * 60),
    frontierCooldown429BaseSeconds: parseIntEnv('FRONTIER_COOLDOWN_429_BASE', 15 * 60),
    frontierBackoffMaxExponent: parseIntEnv('FRONTIER_BACKOFF_MAX_EXPONENT', 4),
    frontierPathPenaltyNotfoundThreshold: parseIntEnv('FRONTIER_PATH_PENALTY_NOTFOUND_THRESHOLD', 3),
    frontierBlockedDomainThreshold: parseIntEnv('FRONTIER_BLOCKED_DOMAIN_THRESHOLD', 2),
    frontierRepairSearchEnabled: parseBoolEnv('FRONTIER_REPAIR_SEARCH_ENABLED', true),
    repairDedupeRule: normalizeRepairDedupeRule(process.env['REPAIR_DEDUPE_RULE'] || REPAIR_DEDUPE_RULE_DEFAULT),
    automationQueueStorageEngine: normalizeAutomationQueueStorageEngine(
      process.env['AUTOMATION_QUEUE_STORAGE_ENGINE'] || AUTOMATION_QUEUE_STORAGE_ENGINE_DEFAULT
    ),
    runtimeTraceEnabled: parseBoolEnv('RUNTIME_TRACE_ENABLED', true),
    runtimeTraceFetchRing: parseIntEnv('RUNTIME_TRACE_FETCH_RING', 30),
    runtimeTraceLlmRing: parseIntEnv('RUNTIME_TRACE_LLM_RING', 50),
    runtimeTraceLlmPayloads: parseBoolEnv('RUNTIME_TRACE_LLM_PAYLOADS', true),
    indexingResumeMode: (process.env.INDEXING_RESUME_MODE || 'auto').trim().toLowerCase(),
    indexingResumeMaxAgeHours: parseIntEnv('INDEXING_RESUME_MAX_AGE_HOURS', 48),
    indexingResumeSeedLimit: parseIntEnv('INDEXING_RESUME_SEED_LIMIT', 24),
    indexingResumePersistLimit: parseIntEnv('INDEXING_RESUME_PERSIST_LIMIT', 160),
    indexingResumeRetryPersistLimit: parseIntEnv('INDEXING_RESUME_RETRY_PERSIST_LIMIT', 80),
    indexingResumeSuccessPersistLimit: parseIntEnv('INDEXING_RESUME_SUCCESS_PERSIST_LIMIT', 240),
    indexingSchemaPacketsValidationEnabled: parseBoolEnv('INDEXING_SCHEMA_PACKETS_VALIDATION_ENABLED', true),
    indexingSchemaPacketsValidationStrict: parseBoolEnv('INDEXING_SCHEMA_PACKETS_VALIDATION_STRICT', true),
    indexingSchemaPacketsSchemaRoot: process.env.INDEXING_SCHEMA_PACKETS_SCHEMA_ROOT || '',
    indexingReextractEnabled: parseBoolEnv('INDEXING_REEXTRACT_ENABLED', true),
    indexingReextractAfterHours: parseIntEnv('INDEXING_REEXTRACT_AFTER_HOURS', 24),
    indexingReextractSeedLimit: parseIntEnv('INDEXING_REEXTRACT_SEED_LIMIT', 8),
    indexingHelperFilesEnabled: parseBoolEnv('INDEXING_HELPER_FILES_ENABLED', false),
    runtimeControlFile: process.env.RUNTIME_CONTROL_FILE || '_runtime/control/runtime_overrides.json',
    runtimeCaptureScreenshots: parseBoolEnv('RUNTIME_CAPTURE_SCREENSHOTS', false),
    runtimeScreenshotMode: process.env.RUNTIME_SCREENSHOT_MODE || 'last_only',
    cortexSyncTimeoutMs: parseIntEnv('CORTEX_SYNC_TIMEOUT_MS', 60_000),
    cortexAsyncPollIntervalMs: parseIntEnv('CORTEX_ASYNC_POLL_INTERVAL_MS', 5_000),
    cortexAsyncMaxWaitMs: parseIntEnv('CORTEX_ASYNC_MAX_WAIT_MS', 900_000),
    cortexAutoStart: parseBoolEnv('CORTEX_AUTO_START', true),
    cortexAutoRestartOnAuth: parseBoolEnv('CORTEX_AUTO_RESTART_ON_AUTH', true),
    cortexEnsureReadyTimeoutMs: parseIntEnv('CORTEX_ENSURE_READY_TIMEOUT_MS', 15_000),
    cortexStartReadyTimeoutMs: parseIntEnv('CORTEX_START_READY_TIMEOUT_MS', 60_000),
    cortexFailureThreshold: parseIntEnv('CORTEX_FAILURE_THRESHOLD', 3),
    cortexCircuitOpenMs: parseIntEnv('CORTEX_CIRCUIT_OPEN_MS', 30_000),
    llmTimeoutMs: timeoutMs,
    openaiApiKey: resolvedApiKey,
    openaiBaseUrl: resolvedBaseUrl,
    openaiModelExtract: process.env.OPENAI_MODEL_EXTRACT || process.env.LLM_MODEL_EXTRACT || defaultModel,
    openaiModelPlan:
      process.env.OPENAI_MODEL_PLAN ||
      process.env.LLM_MODEL_PLAN ||
      process.env.OPENAI_MODEL_EXTRACT ||
      process.env.LLM_MODEL_EXTRACT ||
      defaultModel,
    openaiModelWrite:
      process.env.OPENAI_MODEL_WRITE ||
      process.env.LLM_MODEL_VALIDATE ||
      process.env.LLM_MODEL_PLAN ||
      process.env.LLM_MODEL_EXTRACT ||
      process.env.OPENAI_MODEL_EXTRACT ||
      defaultModel,
    openaiMaxInputChars: parseIntEnv(
      'OPENAI_MAX_INPUT_CHARS',
      parseIntEnv('LLM_MAX_EVIDENCE_CHARS', 50_000)
    ),
    openaiTimeoutMs: timeoutMs,
    llmReasoningMode: parseBoolEnv('LLM_REASONING_MODE', hasDeepSeekKey),
    llmReasoningBudget: parseIntEnv('LLM_REASONING_BUDGET', 32768),
    llmMaxTokens: parseIntEnv('LLM_MAX_TOKENS', 16384),
    llmExtractReasoningBudget: parseIntEnv('LLM_EXTRACT_REASONING_BUDGET', 4096),
    llmExtractMaxTokens: parseIntEnv('LLM_EXTRACT_MAX_TOKENS', 1200),
    llmExtractMaxSnippetsPerBatch: parseIntEnv('LLM_EXTRACT_MAX_SNIPPETS_PER_BATCH', 6),
    llmExtractMaxSnippetChars: parseIntEnv('LLM_EXTRACT_MAX_SNIPPET_CHARS', 900),
    llmExtractSkipLowSignal: parseBoolEnv('LLM_EXTRACT_SKIP_LOW_SIGNAL', true),
    llmVerifyMode: parseBoolEnv('LLM_VERIFY_MODE', false),
    llmVerifySampleRate: parseIntEnv('LLM_VERIFY_SAMPLE_RATE', 10),
    llmVerifyAggressiveAlways: parseBoolEnv('LLM_VERIFY_AGGRESSIVE_ALWAYS', false),
    llmVerifyAggressiveBatchCount: parseIntEnv('LLM_VERIFY_AGGRESSIVE_BATCH_COUNT', 3),
    llmMaxOutputTokens: parseIntEnv('LLM_MAX_OUTPUT_TOKENS', 1200),
    llmMaxOutputTokensPlan: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_PLAN', parseIntEnv('LLM_MAX_OUTPUT_TOKENS', 1200)),
    llmMaxOutputTokensFast: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_FAST', parseIntEnv('LLM_MAX_OUTPUT_TOKENS', 1200)),
    llmMaxOutputTokensTriage: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_TRIAGE', parseIntEnv('LLM_MAX_OUTPUT_TOKENS', 1200)),
    llmMaxOutputTokensReasoning: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_REASONING', parseIntEnv('LLM_REASONING_BUDGET', 32768)),
    llmMaxOutputTokensExtract: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_EXTRACT', parseIntEnv('LLM_EXTRACT_MAX_TOKENS', 1200)),
    llmMaxOutputTokensValidate: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_VALIDATE', parseIntEnv('LLM_MAX_OUTPUT_TOKENS', 1200)),
    llmMaxOutputTokensWrite: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_WRITE', parseIntEnv('LLM_MAX_OUTPUT_TOKENS', 1200)),
    llmMaxOutputTokensPlanFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_PLAN_FALLBACK', parseIntEnv('LLM_MAX_OUTPUT_TOKENS_PLAN', 1200)),
    llmMaxOutputTokensExtractFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_EXTRACT_FALLBACK', parseIntEnv('LLM_MAX_OUTPUT_TOKENS_EXTRACT', 1200)),
    llmMaxOutputTokensValidateFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_VALIDATE_FALLBACK', parseIntEnv('LLM_MAX_OUTPUT_TOKENS_VALIDATE', 1200)),
    llmMaxOutputTokensWriteFallback: parseIntEnv('LLM_MAX_OUTPUT_TOKENS_WRITE_FALLBACK', parseIntEnv('LLM_MAX_OUTPUT_TOKENS_WRITE', 1200)),
    llmOutputTokenPresets: parseTokenPresetList(
      process.env.LLM_OUTPUT_TOKEN_PRESETS,
      [256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192]
    ),
    llmCostInputPer1M: parseFloatEnv('LLM_COST_INPUT_PER_1M', 1.25),
    llmCostOutputPer1M: parseFloatEnv('LLM_COST_OUTPUT_PER_1M', 10),
    llmCostCachedInputPer1M: parseFloatEnv('LLM_COST_CACHED_INPUT_PER_1M', 0.125),
    llmCostInputPer1MDeepseekChat: parseFloatEnv('LLM_COST_INPUT_PER_1M_DEEPSEEK_CHAT', -1),
    llmCostOutputPer1MDeepseekChat: parseFloatEnv('LLM_COST_OUTPUT_PER_1M_DEEPSEEK_CHAT', -1),
    llmCostCachedInputPer1MDeepseekChat: parseFloatEnv('LLM_COST_CACHED_INPUT_PER_1M_DEEPSEEK_CHAT', -1),
    llmCostInputPer1MDeepseekReasoner: parseFloatEnv('LLM_COST_INPUT_PER_1M_DEEPSEEK_REASONER', -1),
    llmCostOutputPer1MDeepseekReasoner: parseFloatEnv('LLM_COST_OUTPUT_PER_1M_DEEPSEEK_REASONER', -1),
    llmCostCachedInputPer1MDeepseekReasoner: parseFloatEnv('LLM_COST_CACHED_INPUT_PER_1M_DEEPSEEK_REASONER', -1),
    llmMonthlyBudgetUsd: parseFloatEnv('LLM_MONTHLY_BUDGET_USD', 200),
    llmPerProductBudgetUsd: parseFloatEnv('LLM_PER_PRODUCT_BUDGET_USD', 0.1),
    llmDisableBudgetGuards: parseBoolEnv('LLM_DISABLE_BUDGET_GUARDS', false),
    llmMaxBatchesPerProduct: parseIntEnv('LLM_MAX_BATCHES_PER_PRODUCT', 7),
    llmExtractionCacheEnabled: parseBoolEnv('LLM_EXTRACTION_CACHE_ENABLED', true),
    llmExtractionCacheDir: process.env.LLM_EXTRACTION_CACHE_DIR || '.specfactory_tmp/llm_cache',
    llmExtractionCacheTtlMs: parseIntEnv('LLM_EXTRACTION_CACHE_TTL_MS', 7 * 24 * 60 * 60 * 1000),
    llmMaxCallsPerProductTotal: parseIntEnv('LLM_MAX_CALLS_PER_PRODUCT_TOTAL', 10),
    llmMaxCallsPerProductFast: parseIntEnv('LLM_MAX_CALLS_PER_PRODUCT_FAST', 2),
    llmMaxCallsPerRound: parseIntEnv('LLM_MAX_CALLS_PER_ROUND', 4),
    llmMaxEvidenceChars: parseIntEnv('LLM_MAX_EVIDENCE_CHARS', 60_000),
    deepseekModelVersion: process.env.DEEPSEEK_MODEL_VERSION || '',
    deepseekContextLength: process.env.DEEPSEEK_CONTEXT_LENGTH || '',
    deepseekChatMaxOutputDefault: parseIntEnv('DEEPSEEK_CHAT_MAX_OUTPUT_DEFAULT', 2048),
    deepseekChatMaxOutputMaximum: parseIntEnv('DEEPSEEK_CHAT_MAX_OUTPUT_MAXIMUM', 4096),
    deepseekReasonerMaxOutputDefault: parseIntEnv('DEEPSEEK_REASONER_MAX_OUTPUT_DEFAULT', 4096),
    deepseekReasonerMaxOutputMaximum: parseIntEnv('DEEPSEEK_REASONER_MAX_OUTPUT_MAXIMUM', 8192),
    llmModelOutputTokenMap: normalizeModelOutputTokenMap(parseJsonEnv('LLM_MODEL_OUTPUT_TOKEN_MAP_JSON', {})),
    deepseekFeatures: process.env.DEEPSEEK_FEATURES || '',
    accuracyMode: (process.env.ACCURACY_MODE || 'balanced').trim().toLowerCase(),
    importsRoot: process.env.IMPORTS_ROOT || 'imports',
    importsPollSeconds: parseIntEnv('IMPORTS_POLL_SECONDS', 10),
    daemonConcurrency: parseIntEnv('DAEMON_CONCURRENCY', 3),
    reCrawlStaleAfterDays: parseIntEnv('RECRAWL_STALE_AFTER_DAYS', 30),
    daemonGracefulShutdownTimeoutMs: parseIntEnv('DAEMON_GRACEFUL_SHUTDOWN_TIMEOUT_MS', 60_000),
    driftDetectionEnabled: parseBoolEnv('DRIFT_DETECTION_ENABLED', true),
    driftPollSeconds: parseIntEnv('DRIFT_POLL_SECONDS', 24 * 60 * 60),
    driftScanMaxProducts: parseIntEnv('DRIFT_SCAN_MAX_PRODUCTS', 250),
    driftAutoRepublish: parseBoolEnv('DRIFT_AUTO_REPUBLISH', true),
    helperFilesEnabled: parseBoolEnv('HELPER_FILES_ENABLED', true),
    helperFilesRoot: process.env.HELPER_FILES_ROOT || 'helper_files',
    helperSupportiveEnabled: parseBoolEnv('HELPER_SUPPORTIVE_ENABLED', true),
    helperSupportiveFillMissing: parseBoolEnv('HELPER_SUPPORTIVE_FILL_MISSING', true),
    helperSupportiveMaxSources: parseIntEnv('HELPER_SUPPORTIVE_MAX_SOURCES', 6),
    helperAutoSeedTargets: parseBoolEnv('HELPER_AUTO_SEED_TARGETS', true),
    helperActiveSyncLimit: parseIntEnv('HELPER_ACTIVE_SYNC_LIMIT', 0),
    graphqlReplayEnabled: parseBoolEnv('GRAPHQL_REPLAY_ENABLED', true),
    maxGraphqlReplays: parseIntEnv('MAX_GRAPHQL_REPLAYS', 5),
    maxNetworkResponsesPerPage: parseIntEnv('MAX_NETWORK_RESPONSES_PER_PAGE', 1200),
    pageGotoTimeoutMs: parseIntEnv('PAGE_GOTO_TIMEOUT_MS', 15_000),
    pageNetworkIdleTimeoutMs: parseIntEnv('PAGE_NETWORK_IDLE_TIMEOUT_MS', 2_000),
    postLoadWaitMs: parseIntEnv('POST_LOAD_WAIT_MS', 0),
    articleExtractorV2Enabled: parseBoolEnv('ARTICLE_EXTRACTOR_V2', true),
    articleExtractorMinChars: parseIntEnv('ARTICLE_EXTRACTOR_MIN_CHARS', 700),
    articleExtractorMinScore: parseIntEnv('ARTICLE_EXTRACTOR_MIN_SCORE', 45),
    articleExtractorMaxChars: parseIntEnv('ARTICLE_EXTRACTOR_MAX_CHARS', 24_000),
    articleExtractorDomainPolicyMap: normalizedArticleExtractorDomainPolicyMap,
    articleExtractorDomainPolicyMapJson,
    htmlTableExtractorV2: parseBoolEnv('HTML_TABLE_EXTRACTOR_V2', true),
    staticDomExtractorEnabled: parseBoolEnv('STATIC_DOM_EXTRACTOR_ENABLED', true),
    staticDomMode: normalizeStaticDomMode(process.env.STATIC_DOM_MODE || 'cheerio'),
    staticDomTargetMatchThreshold: parseFloatEnv('STATIC_DOM_TARGET_MATCH_THRESHOLD', 0.55),
    staticDomMaxEvidenceSnippets: parseIntEnv('STATIC_DOM_MAX_EVIDENCE_SNIPPETS', 120),
    structuredMetadataExtructEnabled: parseBoolEnv('STRUCTURED_METADATA_EXTRUCT_ENABLED', false),
    structuredMetadataExtructUrl: process.env.STRUCTURED_METADATA_EXTRUCT_URL || 'http://127.0.0.1:8011/extract/structured',
    structuredMetadataExtructTimeoutMs: parseIntEnv('STRUCTURED_METADATA_EXTRUCT_TIMEOUT_MS', 2000),
    structuredMetadataExtructMaxItemsPerSurface: parseIntEnv('STRUCTURED_METADATA_EXTRUCT_MAX_ITEMS_PER_SURFACE', 200),
    structuredMetadataExtructCacheEnabled: parseBoolEnv('STRUCTURED_METADATA_EXTRUCT_CACHE_ENABLED', true),
    structuredMetadataExtructCacheLimit: parseIntEnv('STRUCTURED_METADATA_EXTRUCT_CACHE_LIMIT', 400),
    dynamicCrawleeEnabled: parseBoolEnv('DYNAMIC_CRAWLEE_ENABLED', true),
    crawleeHeadless: parseBoolEnv('CRAWLEE_HEADLESS', true),
    crawleeRequestHandlerTimeoutSecs: parseIntEnv('CRAWLEE_REQUEST_HANDLER_TIMEOUT_SECS', 75),
    dynamicFetchRetryBudget: parseIntEnv('DYNAMIC_FETCH_RETRY_BUDGET', 2),
    dynamicFetchRetryBackoffMs: parseIntEnv('DYNAMIC_FETCH_RETRY_BACKOFF_MS', 1200),
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
    preferHttpFetcher: parseBoolEnv('PREFER_HTTP_FETCHER', false),
    capturePageScreenshotEnabled: parseBoolEnv('CAPTURE_PAGE_SCREENSHOT_ENABLED', true),
    capturePageScreenshotFormat: String(process.env.CAPTURE_PAGE_SCREENSHOT_FORMAT || 'jpeg').trim().toLowerCase() === 'png'
      ? 'png'
      : 'jpeg',
    capturePageScreenshotQuality: parseIntEnv('CAPTURE_PAGE_SCREENSHOT_QUALITY', 62),
    capturePageScreenshotMaxBytes: parseIntEnv('CAPTURE_PAGE_SCREENSHOT_MAX_BYTES', 2_200_000),
    capturePageScreenshotSelectors: String(
      process.env.CAPTURE_PAGE_SCREENSHOT_SELECTORS ||
      'table,[data-spec-table],.specs-table,.spec-table,.specifications'
    ).trim(),
    visualAssetCaptureEnabled: parseBoolEnv('VISUAL_ASSET_CAPTURE_ENABLED', true),
    visualAssetCaptureMaxPerSource: parseIntEnv('VISUAL_ASSET_CAPTURE_MAX_PER_SOURCE', 5),
    visualAssetStoreOriginal: parseBoolEnv('VISUAL_ASSET_STORE_ORIGINAL', true),
    visualAssetRetentionDays: parseIntEnv('VISUAL_ASSET_RETENTION_DAYS', 30),
    visualAssetPhashEnabled: parseBoolEnv('VISUAL_ASSET_PHASH_ENABLED', true),
    visualAssetReviewFormat: String(process.env.VISUAL_ASSET_REVIEW_FORMAT || 'webp').trim().toLowerCase(),
    visualAssetReviewLgMaxSide: parseIntEnv('VISUAL_ASSET_REVIEW_LG_MAX_SIDE', 1600),
    visualAssetReviewSmMaxSide: parseIntEnv('VISUAL_ASSET_REVIEW_SM_MAX_SIDE', 768),
    visualAssetReviewLgQuality: parseIntEnv('VISUAL_ASSET_REVIEW_LG_QUALITY', 75),
    visualAssetReviewSmQuality: parseIntEnv('VISUAL_ASSET_REVIEW_SM_QUALITY', 65),
    visualAssetRegionCropMaxSide: parseIntEnv('VISUAL_ASSET_REGION_CROP_MAX_SIDE', 1024),
    visualAssetRegionCropQuality: parseIntEnv('VISUAL_ASSET_REGION_CROP_QUALITY', 70),
    visualAssetLlmMaxBytes: parseIntEnv('VISUAL_ASSET_LLM_MAX_BYTES', 512000),
    visualAssetMinWidth: parseIntEnv('VISUAL_ASSET_MIN_WIDTH', 320),
    visualAssetMinHeight: parseIntEnv('VISUAL_ASSET_MIN_HEIGHT', 320),
    visualAssetMinSharpness: parseFloatEnv('VISUAL_ASSET_MIN_SHARPNESS', 80),
    visualAssetMinEntropy: parseFloatEnv('VISUAL_ASSET_MIN_ENTROPY', 2.5),
    visualAssetMaxPhashDistance: parseIntEnv('VISUAL_ASSET_MAX_PHASH_DISTANCE', 10),
    visualAssetHeroSelectorMapJson,
    chartExtractionEnabled: parseBoolEnv('CHART_EXTRACTION_ENABLED', true),
    domSnippetMaxChars: parseIntEnv('DOM_SNIPPET_MAX_CHARS', 3600),
    autoScrollEnabled: parseBoolEnv('AUTO_SCROLL_ENABLED', false),
    autoScrollPasses: parseIntEnv('AUTO_SCROLL_PASSES', 0),
    autoScrollDelayMs: parseIntEnv('AUTO_SCROLL_DELAY_MS', 900),
    robotsTxtCompliant: parseBoolEnv('ROBOTS_TXT_COMPLIANT', true),
    robotsTxtTimeoutMs: parseIntEnv('ROBOTS_TXT_TIMEOUT_MS', 6000),
    endpointSignalLimit: parseIntEnv('ENDPOINT_SIGNAL_LIMIT', 30),
    endpointSuggestionLimit: parseIntEnv('ENDPOINT_SUGGESTION_LIMIT', 12),
    endpointNetworkScanLimit: parseIntEnv('ENDPOINT_NETWORK_SCAN_LIMIT', 600),
    manufacturerBroadDiscovery: parseBoolEnv('MANUFACTURER_BROAD_DISCOVERY', false),
    manufacturerSeedSearchUrls: parseBoolEnv('MANUFACTURER_SEED_SEARCH_URLS', false),
    allowBelowPassTargetFill: parseBoolEnv('ALLOW_BELOW_PASS_TARGET_FILL', false),
    selfImproveEnabled: parseBoolEnv('SELF_IMPROVE_ENABLED', true),
    learningConfidenceThreshold: parseFloatEnv('LEARNING_CONFIDENCE_THRESHOLD', 0.85),
    componentLexiconDecayDays: parseIntEnv('COMPONENT_LEXICON_DECAY_DAYS', 90),
    componentLexiconExpireDays: parseIntEnv('COMPONENT_LEXICON_EXPIRE_DAYS', 180),
    fieldAnchorsDecayDays: parseIntEnv('FIELD_ANCHORS_DECAY_DAYS', 60),
    urlMemoryDecayDays: parseIntEnv('URL_MEMORY_DECAY_DAYS', 120),
    maxHypothesisItems: parseIntEnv('MAX_HYPOTHESIS_ITEMS', 50),
    hypothesisAutoFollowupRounds: parseIntEnv('HYPOTHESIS_AUTO_FOLLOWUP_ROUNDS', 0),
    hypothesisFollowupUrlsPerRound: parseIntEnv('HYPOTHESIS_FOLLOWUP_URLS_PER_ROUND', 12),
    fieldRewardHalfLifeDays: parseIntEnv('FIELD_REWARD_HALF_LIFE_DAYS', 45),
    batchStrategy: (process.env.BATCH_STRATEGY || 'bandit').toLowerCase(),
    fieldRulesEngineEnforceEvidence: parseBoolEnv(
      'FIELD_RULES_ENGINE_ENFORCE_EVIDENCE',
      parseBoolEnv('AGGRESSIVE_MODE_ENABLED', false) || parseBoolEnv('UBER_AGGRESSIVE_ENABLED', false)
    ),

    // SQLite migration feature flags (dual-write controls)
    queueJsonWrite: parseBoolEnv('QUEUE_JSON_WRITE', false),
    billingJsonWrite: parseBoolEnv('BILLING_JSON_WRITE', false),
    brainJsonWrite: parseBoolEnv('BRAIN_JSON_WRITE', false),
    intelJsonWrite: parseBoolEnv('INTEL_JSON_WRITE', false),
    corpusJsonWrite: parseBoolEnv('CORPUS_JSON_WRITE', false),
    learningJsonWrite: parseBoolEnv('LEARNING_JSON_WRITE', false),
    cacheJsonWrite: parseBoolEnv('CACHE_JSON_WRITE', false),
    eventsJsonWrite: parseBoolEnv('EVENTS_JSON_WRITE', true),
    runtimeOpsWorkbenchEnabled: parseBoolEnv('RUNTIME_OPS_WORKBENCH_ENABLED', true),
    authoritySnapshotEnabled: parseBoolEnv('AUTHORITY_SNAPSHOT_ENABLED', true),
    runtimeScreencastEnabled: parseBoolEnv('RUNTIME_SCREENCAST_ENABLED', true),
    runtimeScreencastFps: parseIntEnv('RUNTIME_SCREENCAST_FPS', 10),
    runtimeScreencastQuality: parseIntEnv('RUNTIME_SCREENCAST_QUALITY', 50),
    runtimeScreencastMaxWidth: parseIntEnv('RUNTIME_SCREENCAST_MAX_WIDTH', 1280),
    runtimeScreencastMaxHeight: parseIntEnv('RUNTIME_SCREENCAST_MAX_HEIGHT', 720),
    runtimeAutoSaveEnabled: parseBoolEnv('RUNTIME_AUTOSAVE_ENABLED', true)
  };

  const filtered = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  );

  const merged = {
    ...cfg,
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
    defaultOutputTokens: 2048,
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

  return applyRunProfile(
    merged,
    filtered.runProfile || cfg.runProfile
  );
}

export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Rule 1: LLM enabled requires API key
  if (config.llmEnabled && !config.llmApiKey) {
    errors.push({
      code: 'LLM_NO_API_KEY',
      message: 'LLM_ENABLED=true but LLM_API_KEY is not set'
    });
  }

  // Rule 2: Discovery enabled requires search provider
  if (config.discoveryEnabled && config.searchProvider === 'none') {
    errors.push({
      code: 'DISCOVERY_NO_SEARCH_PROVIDER',
      message: 'DISCOVERY_ENABLED=true but SEARCH_PROVIDER is "none"'
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

  // Rule 5: Aggressive mode should have frontier enabled
  if (config.aggressiveModeEnabled && !config.frontierEnableSqlite && !config.frontierDbPath) {
    warnings.push({
      code: 'AGGRESSIVE_NO_FRONTIER',
      message: 'AGGRESSIVE_MODE_ENABLED=true but frontier DB is not configured'
    });
  }

  // Rule 6: manufacturerReserveUrls should not exceed maxUrlsPerProduct
  if (config.maxUrlsPerProduct < config.manufacturerReserveUrls) {
    warnings.push({
      code: 'MANUFACTURER_RESERVE_EXCEEDS_MAX',
      message: `manufacturerReserveUrls (${config.manufacturerReserveUrls}) > maxUrlsPerProduct (${config.maxUrlsPerProduct})`
    });
  }

  // Rule 7: Uber aggressive requires aggressive mode
  if (config.uberAggressiveEnabled && !config.aggressiveModeEnabled) {
    warnings.push({
      code: 'UBER_WITHOUT_AGGRESSIVE',
      message: 'UBER_AGGRESSIVE_ENABLED=true but AGGRESSIVE_MODE_ENABLED=false'
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
