// WHY: Post-merge normalization extracted from config.js (Phase 6).
// Applies canonical defaults, overrides, coercions, clamping, and fallback chains.
// Clamping ranges derive from shared SSOT (settingsClampingRanges).

import { inferLlmProvider } from './llmModelResolver.js';
import { buildRegistryLookup } from '../llm/routeResolver.js';
import {
  normalizeModelPricingMap,
  normalizePricingSources,
  normalizeModelOutputTokenMap,
  normalizeOutputMode,
  normalizeUserAgent,
  normalizeStaticDomMode,
  normalizePdfBackend,
  normalizeScannedPdfOcrBackend,
  normalizeBaseUrl,
  DEFAULT_USER_AGENT,
} from './configNormalizers.js';
import { toTokenInt, parseTokenPresetList, parseBoolEnv } from './envParsers.js';
import { applyCanonicalSettingsDefaults } from './settingsClassification.js';
import {
  SETTINGS_CLAMPING_INT_RANGE_MAP,
  SETTINGS_CLAMPING_FLOAT_RANGE_MAP,
} from '../../shared/settingsClampingRanges.js';
import {
  buildDefaultModelPricingMap,
  LLM_PRICING_AS_OF,
  LLM_PRICING_SOURCES,
  mergeModelPricingMaps,
} from '../../billing/modelPricingCatalog.js';

// ---------------------------------------------------------------------------
// SSOT clamping helpers — derive min/max from route contract
// ---------------------------------------------------------------------------

function clampIntFromRoute(merged, key, routeKey) {
  const range = SETTINGS_CLAMPING_INT_RANGE_MAP[routeKey];
  if (!range) return;
  const val = Number.parseInt(String(merged[key] ?? ''), 10);
  merged[key] = Number.isFinite(val)
    ? Math.max(range.min, Math.min(range.max, val))
    : merged[key];
}

function clampFloatFromRoute(merged, key, routeKey) {
  const range = SETTINGS_CLAMPING_FLOAT_RANGE_MAP[routeKey];
  if (!range) return;
  const val = Number.parseFloat(String(merged[key] ?? ''));
  merged[key] = Number.isFinite(val)
    ? Math.max(range.min, Math.min(range.max, val))
    : merged[key];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function applyPostMergeNormalization(cfg, overrides, explicitEnvKeys) {
  const canonicalCfg = applyCanonicalSettingsDefaults(cfg, explicitEnvKeys);

  const filtered = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  );

  const merged = {
    ...canonicalCfg,
    ...filtered,
  };

  // --- localMode / outputMode / mirrorToS3 coercion ---
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

  // --- userAgent ---
  merged.userAgent = normalizeUserAgent(merged.userAgent, DEFAULT_USER_AGENT);

  // --- LLM provider inference + model fallback chains ---
  merged.llmProvider = merged.llmProvider || inferLlmProvider(
    merged.llmBaseUrl || merged.openaiBaseUrl,
    merged.llmModelExtract || merged.openaiModelExtract,
    Boolean(process.env.DEEPSEEK_API_KEY)
  );
  merged.llmApiKey = merged.llmApiKey || merged.openaiApiKey;
  merged.llmBaseUrl = merged.llmBaseUrl || merged.openaiBaseUrl;
  merged.llmModelExtract = merged.llmModelExtract || merged.openaiModelExtract;
  merged.llmModelPlan = merged.llmModelPlan || merged.openaiModelPlan;
  // WHY: Model stack simplified — one base model, one reasoning model.
  // Per-role keys are aliases for backward compat. Phase overrides
  // still allow per-phase model selection via llmPhaseOverridesJson.
  merged.llmModelReasoning = merged.llmModelReasoning || merged.llmModelPlan;
  merged.llmModelTriage = merged.llmModelPlan;
  merged.llmModelFast = merged.llmModelPlan;
  merged.llmModelExtract = merged.llmModelPlan;
  merged.llmModelValidate = merged.llmModelPlan;
  merged.llmModelWrite = merged.llmModelPlan;

  // Fallback aliases — one base fallback, one reasoning fallback
  merged.llmExtractFallbackModel = merged.llmPlanFallbackModel;
  merged.llmValidateFallbackModel = merged.llmPlanFallbackModel;
  merged.llmWriteFallbackModel = merged.llmPlanFallbackModel;

  // --- Normalizer calls ---
  merged.staticDomMode = normalizeStaticDomMode(merged.staticDomMode, 'cheerio');
  merged.pdfPreferredBackend = normalizePdfBackend(merged.pdfPreferredBackend || 'auto', 'auto');
  merged.scannedPdfOcrBackend = normalizeScannedPdfOcrBackend(merged.scannedPdfOcrBackend || 'auto', 'auto');
  // --- Route-contract-derived clamping (11 keys) ---
  clampFloatFromRoute(merged, 'staticDomTargetMatchThreshold', 'staticDomTargetMatchThreshold');
  clampIntFromRoute(merged, 'staticDomMaxEvidenceSnippets', 'staticDomMaxEvidenceSnippets');
  clampIntFromRoute(merged, 'pdfBackendRouterTimeoutMs', 'pdfBackendRouterTimeoutMs');
  clampIntFromRoute(merged, 'pdfBackendRouterMaxPages', 'pdfBackendRouterMaxPages');
  clampIntFromRoute(merged, 'pdfBackendRouterMaxPairs', 'pdfBackendRouterMaxPairs');
  clampIntFromRoute(merged, 'pdfBackendRouterMaxTextPreviewChars', 'pdfBackendRouterMaxTextPreviewChars');
  clampIntFromRoute(merged, 'scannedPdfOcrMaxPages', 'scannedPdfOcrMaxPages');
  clampIntFromRoute(merged, 'scannedPdfOcrMaxPairs', 'scannedPdfOcrMaxPairs');
  clampIntFromRoute(merged, 'scannedPdfOcrMinCharsPerPage', 'scannedPdfOcrMinCharsPerPage');
  clampIntFromRoute(merged, 'scannedPdfOcrMinLinesPerPage', 'scannedPdfOcrMinLinesPerPage');
  clampFloatFromRoute(merged, 'scannedPdfOcrMinConfidence', 'scannedPdfOcrMinConfidence');

  // --- Role-specific LLM provider/baseUrl/apiKey fallbacks ---
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
  // --- Pricing map + token normalization ---
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

  // --- llmMaxOutputTokens chain ---
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

  // Token cap aliases — all roles use plan caps
  merged.llmMaxOutputTokensTriage = merged.llmMaxOutputTokensPlan;
  merged.llmMaxOutputTokensFast = merged.llmMaxOutputTokensPlan;
  merged.llmMaxOutputTokensExtract = merged.llmMaxOutputTokensPlan;
  merged.llmMaxOutputTokensValidate = merged.llmMaxOutputTokensPlan;
  merged.llmMaxOutputTokensWrite = merged.llmMaxOutputTokensPlan;
  merged.llmMaxOutputTokensExtractFallback = merged.llmMaxOutputTokensPlanFallback;
  merged.llmMaxOutputTokensValidateFallback = merged.llmMaxOutputTokensPlanFallback;
  merged.llmMaxOutputTokensWriteFallback = merged.llmMaxOutputTokensPlanFallback;

  // --- Token profile upserts ---
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
    merged.llmModelOutputTokenMap[model] = { defaultOutputTokens, maxOutputTokens };
  };

  upsertTokenProfile('deepseek-chat', {
    defaultOutputTokens: merged.deepseekChatMaxOutputDefault,
    maxOutputTokens: merged.deepseekChatMaxOutputMaximum,
  });
  upsertTokenProfile('deepseek-reasoner', {
    defaultOutputTokens: merged.deepseekReasonerMaxOutputDefault,
    maxOutputTokens: merged.deepseekReasonerMaxOutputMaximum,
  });
  upsertTokenProfile('gemini-2.5-flash-lite', { defaultOutputTokens: 4096, maxOutputTokens: 8192 });
  upsertTokenProfile('gemini-2.5-flash', { defaultOutputTokens: 3072, maxOutputTokens: 8192 });
  upsertTokenProfile('gpt-5-low', { defaultOutputTokens: 3072, maxOutputTokens: 16384 });
  upsertTokenProfile('gpt-5.1-low', { defaultOutputTokens: 3072, maxOutputTokens: 16384 });
  upsertTokenProfile('gpt-5.1-high', { defaultOutputTokens: 4096, maxOutputTokens: 16384 });
  upsertTokenProfile('gpt-5.2-high', { defaultOutputTokens: 4096, maxOutputTokens: 16384 });
  upsertTokenProfile('gpt-5.2-xhigh', { defaultOutputTokens: 6144, maxOutputTokens: 16384 });

  // --- openai key sync + runProfile + manufacturer clamping ---
  merged.llmTimeoutMs = merged.llmTimeoutMs || merged.openaiTimeoutMs;
  merged.openaiApiKey = merged.llmApiKey;
  merged.openaiBaseUrl = merged.llmBaseUrl;
  merged.openaiModelExtract = merged.llmModelExtract;
  merged.openaiModelPlan = merged.llmModelPlan;
  merged.openaiModelWrite = merged.llmModelWrite;
  merged.openaiTimeoutMs = merged.llmTimeoutMs;

  merged.runProfile = 'standard';

  // --- preferHttpFetcher override ---
  const hasExplicitPreferHttpFetcherOverride = Object.prototype.hasOwnProperty.call(filtered, 'preferHttpFetcher');
  const hasEnvPreferHttpFetcherOverride = Object.prototype.hasOwnProperty.call(process.env, 'PREFER_HTTP_FETCHER');

  if (hasExplicitPreferHttpFetcherOverride) {
    merged.preferHttpFetcher = Boolean(filtered.preferHttpFetcher);
  } else if (hasEnvPreferHttpFetcherOverride) {
    merged.preferHttpFetcher = parseBoolEnv('PREFER_HTTP_FETCHER', merged.preferHttpFetcher);
  }

  // WHY: registry lookup is SSOT for model→provider routing
  merged._registryLookup = buildRegistryLookup(merged.llmProviderRegistryJson);

  resolvePhaseOverrides(merged);

  return merged;
}

// ---------------------------------------------------------------------------
// Phase-level LLM override resolver
// ---------------------------------------------------------------------------

function resolvePhaseOverrides(merged) {
  let overrides = {};
  try {
    overrides = JSON.parse(merged.llmPhaseOverridesJson || '{}') || {};
  } catch { /* use empty */ }
  if (typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {};

  const PHASE_DEFS = [
    { id: 'needset',          globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'searchPlanner',    globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'brandResolver',    globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'serpTriage',       globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'domainClassifier', globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'extraction',       globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'validate',         globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'write',            globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
  ];

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  for (const def of PHASE_DEFS) {
    const phaseOverride = overrides[def.id] || {};
    const prefix = `_resolved${capitalize(def.id)}`;

    merged[`${prefix}BaseModel`] = phaseOverride.baseModel || merged[def.globalModel];
    merged[`${prefix}ReasoningModel`] = phaseOverride.reasoningModel || merged.llmModelReasoning;
    merged[`${prefix}UseReasoning`] = phaseOverride.useReasoning ?? merged[def.groupToggle] ?? false;
    merged[`${prefix}MaxOutputTokens`] = phaseOverride.maxOutputTokens ?? merged[def.globalTokens];
  }
}
