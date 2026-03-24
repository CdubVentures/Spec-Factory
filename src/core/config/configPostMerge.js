// WHY: Post-merge normalization extracted from config.js (Phase 6).
// Applies canonical defaults, overrides, coercions, and fallback chains.

import { assembleLlmPolicy } from '../llm/llmPolicySchema.js';
import { providerFromModelToken } from '../llm/providerMeta.js';
import { buildRegistryLookup } from '../llm/routeResolver.js';
import {
  normalizeModelPricingMap,
  normalizePricingSources,
  normalizeModelOutputTokenMap,
  normalizeUserAgent,
  DEFAULT_USER_AGENT,
} from './configNormalizers.js';
import { toTokenInt, parseTokenPresetList } from './envParsers.js';
import { applyCanonicalSettingsDefaults } from './settingsClassification.js';
import {
  buildDefaultModelPricingMap,
  LLM_PRICING_AS_OF,
  LLM_PRICING_SOURCES,
  mergeModelPricingMaps,
} from '../../billing/modelPricingCatalog.js';

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

  // --- userAgent ---
  merged.userAgent = normalizeUserAgent(merged.userAgent, DEFAULT_USER_AGENT);

  // --- LLM provider inference + model fallback chains ---
  // WHY: llmProvider is set by configBuilder from the registry SSOT.
  // Fallback infers provider from the model name for backward compat.
  if (!merged.llmProvider) {
    const m = String(merged.llmModelPlan || merged.llmModelExtract || '').toLowerCase();
    merged.llmProvider = providerFromModelToken(m) || 'openai';
  }
  merged.llmApiKey = merged.llmApiKey || merged.openaiApiKey;
  merged.llmBaseUrl = merged.llmBaseUrl || merged.openaiBaseUrl;
  merged.llmModelExtract = merged.llmModelExtract || merged.openaiModelExtract;
  merged.llmModelPlan = merged.llmModelPlan || merged.openaiModelPlan;
  // WHY: Model stack simplified — one base model, one reasoning model.
  // Phase overrides still allow per-phase model selection via llmPhaseOverridesJson.
  merged.llmModelReasoning = merged.llmModelReasoning || merged.llmModelPlan;

  // --- LLM provider/baseUrl/apiKey fallbacks ---
  merged.llmPlanProvider = merged.llmPlanProvider || merged.llmProvider;
  merged.llmPlanBaseUrl = merged.llmPlanBaseUrl || merged.llmBaseUrl;
  merged.llmPlanApiKey = merged.llmPlanApiKey || merged.llmApiKey;
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
  merged.llmMaxOutputTokensReasoning = toTokenInt(merged.llmMaxOutputTokensReasoning, toTokenInt(merged.llmReasoningBudget, merged.llmMaxOutputTokens));
  merged.llmMaxOutputTokensPlanFallback = toTokenInt(merged.llmMaxOutputTokensPlanFallback, merged.llmMaxOutputTokensPlan);

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

  upsertTokenProfile('deepseek-chat', { defaultOutputTokens: 2048, maxOutputTokens: 8192 });
  upsertTokenProfile('deepseek-reasoner', { defaultOutputTokens: 4096, maxOutputTokens: 64000 });
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
  merged.openaiModelWrite = merged.llmModelPlan;
  merged.openaiTimeoutMs = merged.llmTimeoutMs;

  merged.runProfile = 'standard';

  // WHY: registry lookup is SSOT for model→provider routing
  merged._registryLookup = buildRegistryLookup(merged.llmProviderRegistryJson);

  resolvePhaseOverrides(merged);

  return merged;
}

// ---------------------------------------------------------------------------
// Phase-level LLM override resolver
// ---------------------------------------------------------------------------

export function resolvePhaseOverrides(merged) {
  let overrides = {};
  try {
    overrides = JSON.parse(merged.llmPhaseOverridesJson || '{}') || {};
  } catch { /* use empty */ }
  if (typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {};

  const PHASE_DEFS = [
    { id: 'needset',          globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'searchPlanner',    globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'brandResolver',    globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensPlan' },
    { id: 'serpSelector',    globalModel: 'llmModelPlan', groupToggle: 'llmPlanUseReasoning', globalTokens: 'llmMaxOutputTokensTriage' },
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

  // WHY: Cache the assembled composite so routing.js can read it without
  // re-assembling on every call. This is the bridge from flat keys to
  // the composite policy object.
  merged._llmPolicy = assembleLlmPolicy(merged);
}
