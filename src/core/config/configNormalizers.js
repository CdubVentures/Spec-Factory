// WHY: Pure normalizer functions and frozen defaults used by config.js at assembly time.
// Phase 2 — extended with all normalizers + frozen default constants from config.js.

import { clampIntFromMap, clampFloatFromMap, toTokenInt } from './envParsers.js';
import { SETTINGS_DEFAULTS } from '../../shared/settingsDefaults.js';
import { LLM_PRICING_SOURCES } from '../../billing/modelPricingCatalog.js';

// ---------------------------------------------------------------------------
// Settings defaults accessors
// ---------------------------------------------------------------------------

const RUNTIME_SETTINGS_DEFAULTS = Object.freeze(SETTINGS_DEFAULTS?.runtime || {});
const CONVERGENCE_SETTINGS_DEFAULTS = Object.freeze(SETTINGS_DEFAULTS?.convergence || {});

export function runtimeSettingDefault(key) {
  if (!Object.hasOwn(RUNTIME_SETTINGS_DEFAULTS, key)) {
    throw new Error(`runtimeSettingDefault: unknown key "${key}" — not in registry`);
  }
  return RUNTIME_SETTINGS_DEFAULTS[key];
}

export function convergenceSettingDefault(key, fallback) {
  return Object.hasOwn(CONVERGENCE_SETTINGS_DEFAULTS, key)
    ? CONVERGENCE_SETTINGS_DEFAULTS[key]
    : fallback;
}

export function parseRuntimeJsonDefault(key, fallback) {
  const raw = Object.hasOwn(RUNTIME_SETTINGS_DEFAULTS, key) ? RUNTIME_SETTINGS_DEFAULTS[key] : '';
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

// ---------------------------------------------------------------------------
// Frozen default constants (computed once at import time)
// ---------------------------------------------------------------------------

export const SEARCH_PROFILE_CAP_DEFAULTS = parseRuntimeJsonDefault('searchProfileCapMapJson', {
  deterministicAliasCap: 6,
  llmAliasValidationCap: 12,
  llmDocHintQueriesCap: 3,
  llmFieldTargetQueriesCap: 3,
  dedupeQueriesCap: 24
});

export const RETRIEVAL_INTERNALS_DEFAULTS = parseRuntimeJsonDefault('retrievalInternalsMapJson', {
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

export const PARSING_CONFIDENCE_BASE_DEFAULTS = parseRuntimeJsonDefault('parsingConfidenceBaseMapJson', {
  network_json: 1,
  embedded_state: 0.85,
  json_ld: 0.9,
  microdata: 0.88,
  opengraph: 0.8,
  microformat_rdfa: 0.78
});

export const REPAIR_DEDUPE_RULE_DEFAULT = 'domain_once';
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Map normalizers (moved from config.js Phase 2)
// ---------------------------------------------------------------------------

export function normalizeSearchProfileCapMap(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    deterministicAliasCap: clampIntFromMap(source, 'deterministicAliasCap', SEARCH_PROFILE_CAP_DEFAULTS.deterministicAliasCap, 1, 20),
    llmAliasValidationCap: clampIntFromMap(source, 'llmAliasValidationCap', SEARCH_PROFILE_CAP_DEFAULTS.llmAliasValidationCap, 1, 32),
    llmDocHintQueriesCap: clampIntFromMap(source, 'llmDocHintQueriesCap', SEARCH_PROFILE_CAP_DEFAULTS.llmDocHintQueriesCap, 1, 20),
    llmFieldTargetQueriesCap: clampIntFromMap(source, 'llmFieldTargetQueriesCap', SEARCH_PROFILE_CAP_DEFAULTS.llmFieldTargetQueriesCap, 1, 20),
    dedupeQueriesCap: clampIntFromMap(source, 'dedupeQueriesCap', SEARCH_PROFILE_CAP_DEFAULTS.dedupeQueriesCap, 1, 200),
  };
}

export function normalizeRetrievalInternalsMap(input = {}) {
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

export function normalizeParsingConfidenceBaseMap(input = {}) {
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

// ---------------------------------------------------------------------------
// Scalar normalizers (moved from config.js Phase 2)
// ---------------------------------------------------------------------------

export function normalizeRepairDedupeRule(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'domain_once' || normalized === 'domain_and_status' || normalized === 'none') {
    return normalized;
  }
  return REPAIR_DEDUPE_RULE_DEFAULT;
}

export function normalizeModelPricingMap(input = {}) {
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

export function normalizePricingSources(input = {}) {
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

export function normalizeModelOutputTokenMap(input = {}) {
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

export function normalizeOutputMode(value, fallback = 'dual') {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'local' || token === 'dual' || token === 's3') {
    return token;
  }
  return fallback;
}

export function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function normalizeWrappedString(value) {
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

export function normalizeUserAgent(value, fallback = DEFAULT_USER_AGENT) {
  const normalized = normalizeWrappedString(value);
  return normalized || fallback;
}

