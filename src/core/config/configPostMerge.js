// WHY: Post-merge normalization extracted from config.js (Phase 6).
// Applies canonical defaults, overrides, coercions, and fallback chains.

import { assembleLlmPolicy } from '../llm/llmPolicySchema.js';
import { providerFromModelToken } from '../llm/providerMeta.js';
import { buildRegistryLookup } from '../llm/routeResolver.js';
import { gateCapabilities, capabilitiesFromLookup } from '../../shared/modelCapabilityGate.js';
import { LLM_PHASE_DEFS } from './llmPhaseDefs.js';
import {
  runtimeSettingDefault,
  normalizePricingSources,
  normalizeModelOutputTokenMap,
  normalizeUserAgent,
  DEFAULT_USER_AGENT,
} from './configNormalizers.js';
import { toTokenInt, parseTokenPresetList } from './envParsers.js';
import { applyCanonicalSettingsDefaults } from './settingsClassification.js';
import { LLM_PRICING_AS_OF, LLM_PRICING_SOURCES } from '../../billing/pricingMetadata.js';
import { mergeDefaultApiModelsIntoRegistry } from '../llm/providerRegistryDefaults.js';

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
  merged.llmBaseUrl = merged.llmBaseUrl || merged.openaiBaseUrl;
  merged.llmModelPlan = merged.llmModelPlan || merged.openaiModelPlan;
  // WHY: Model stack simplified — one base model, one reasoning model.
  // Phase overrides still allow per-phase model selection via llmPhaseOverridesJson.
  merged.llmModelReasoning = merged.llmModelReasoning || merged.llmModelPlan;

  // --- Pricing map + token normalization ---
  merged.llmModelPricingMap = {};
  merged.llmPricingAsOf = String(merged.llmPricingAsOf || LLM_PRICING_AS_OF);
  merged.llmPricingSources = normalizePricingSources(merged.llmPricingSources || LLM_PRICING_SOURCES);
  merged.llmProviderRegistryJson = mergeDefaultApiModelsIntoRegistry(
    merged.llmProviderRegistryJson,
    runtimeSettingDefault('llmProviderRegistryJson')
  );
  merged.llmModelOutputTokenMap = normalizeModelOutputTokenMap(merged.llmModelOutputTokenMap || {});
  merged.llmOutputTokenPresets = parseTokenPresetList(
    merged.llmOutputTokenPresets,
    [256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096, 8192]
  );

  // --- llmMaxOutputTokens chain ---
  merged.llmMaxOutputTokensPlan = toTokenInt(merged.llmMaxOutputTokensPlan, toTokenInt(merged.llmMaxOutputTokens, 1200));
  merged.llmMaxOutputTokensReasoning = toTokenInt(merged.llmMaxOutputTokensReasoning, toTokenInt(merged.llmReasoningBudget, merged.llmMaxOutputTokens));

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

  upsertTokenProfile('deepseek-v4-flash', { defaultOutputTokens: 2048, maxOutputTokens: 384000 });
  upsertTokenProfile('deepseek-v4-pro', { defaultOutputTokens: 4096, maxOutputTokens: 384000 });
  upsertTokenProfile('gemini-2.5-flash-lite', { defaultOutputTokens: 4096, maxOutputTokens: 8192 });
  upsertTokenProfile('gemini-2.5-flash', { defaultOutputTokens: 3072, maxOutputTokens: 8192 });
  upsertTokenProfile('gpt-5-low', { defaultOutputTokens: 3072, maxOutputTokens: 16384 });
  upsertTokenProfile('gpt-5.1-low', { defaultOutputTokens: 3072, maxOutputTokens: 16384 });
  upsertTokenProfile('gpt-5.1-high', { defaultOutputTokens: 4096, maxOutputTokens: 16384 });
  upsertTokenProfile('gpt-5.2-high', { defaultOutputTokens: 4096, maxOutputTokens: 16384 });
  upsertTokenProfile('gpt-5.2-xhigh', { defaultOutputTokens: 6144, maxOutputTokens: 16384 });

  // --- openai alias sync ---
  merged.openaiBaseUrl = merged.llmBaseUrl;
  merged.openaiModelExtract = merged.llmModelExtract;
  merged.openaiModelPlan = merged.llmModelPlan;

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

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  for (const def of LLM_PHASE_DEFS) {
    const phaseOverride = overrides[def.id] || {};

    // WHY: Writer is a global phase with no inherited primary model, no
    // jsonStrict knob, no webSearch. Fallback inherits the global fallback by
    // default and can be overridden by writer.* phase override fields.
    if (def.id === 'writer') {
      const baseModel = phaseOverride.baseModel || '';
      const reasoningModel = phaseOverride.reasoningModel || merged.llmModelReasoning || '';
      const useReasoning = phaseOverride.useReasoning ?? false;
      const fallbackModel = phaseOverride.fallbackModel || merged[def.globalFallbackModel] || '';
      const fallbackReasoningModel = phaseOverride.fallbackReasoningModel || merged[def.globalFallbackReasoningModel] || '';
      const fallbackUseReasoning = phaseOverride.fallbackUseReasoning ?? false;
      const effectiveWriter = useReasoning ? reasoningModel : baseModel;
      const effectiveFallback = fallbackUseReasoning ? fallbackReasoningModel : fallbackModel;
      const writerCaps = capabilitiesFromLookup(merged._registryLookup, effectiveWriter);
      const writerGated = gateCapabilities(
        { thinking: phaseOverride.thinking, thinkingEffort: phaseOverride.thinkingEffort, webSearch: false },
        writerCaps,
      );
      const fallbackCaps = capabilitiesFromLookup(merged._registryLookup, effectiveFallback);
      const fallbackGated = gateCapabilities(
        { thinking: phaseOverride.fallbackThinking, thinkingEffort: phaseOverride.fallbackThinkingEffort, webSearch: false },
        fallbackCaps,
      );
      merged._resolvedWriterBaseModel         = baseModel;
      merged._resolvedWriterReasoningModel    = reasoningModel;
      merged._resolvedWriterUseReasoning      = useReasoning;
      merged._resolvedWriterMaxOutputTokens   = phaseOverride.maxOutputTokens ?? merged.llmMaxOutputTokensPlan;
      merged._resolvedWriterTimeoutMs         = phaseOverride.timeoutMs ?? merged.llmTimeoutMs;
      merged._resolvedWriterMaxContextTokens  = phaseOverride.maxContextTokens ?? merged.llmMaxTokens;
      merged._resolvedWriterReasoningBudget   = phaseOverride.reasoningBudget ?? merged.llmReasoningBudget;
      merged._resolvedWriterThinking          = writerGated.thinking;
      merged._resolvedWriterThinkingEffort    = writerGated.thinkingEffort;
      merged._resolvedWriterDisableLimits     = phaseOverride.disableLimits ?? false;
      merged._resolvedWriterFallbackModel          = fallbackModel;
      merged._resolvedWriterFallbackReasoningModel = fallbackReasoningModel;
      merged._resolvedWriterFallbackUseReasoning   = fallbackUseReasoning;
      merged._resolvedWriterFallbackThinking       = fallbackGated.thinking;
      merged._resolvedWriterFallbackThinkingEffort = fallbackGated.thinkingEffort;
      merged._resolvedWriterFallbackWebSearch      = false;
      continue;
    }

    const prefix = `_resolved${capitalize(def.id)}`;

    const baseModel = phaseOverride.baseModel || merged[def.globalModel];
    const reasoningModel = phaseOverride.reasoningModel || merged.llmModelReasoning;
    const useReasoning = phaseOverride.useReasoning ?? merged[def.groupToggle] ?? false;
    const fallbackModel = phaseOverride.fallbackModel || merged[def.globalFallbackModel] || '';
    const fallbackReasoningModel = phaseOverride.fallbackReasoningModel || merged[def.globalFallbackReasoningModel] || '';
    const fallbackUseReasoning = phaseOverride.fallbackUseReasoning ?? false;

    // WHY: Mask stored capability toggles by each role's target model. A stale
    // thinking=true left over from a prior lab-model selection must not leak into
    // LLM calls or UI when the current model doesn't declare that capability.
    const primaryCaps = capabilitiesFromLookup(merged._registryLookup, useReasoning ? reasoningModel : baseModel);
    const primaryGated = gateCapabilities(
      { thinking: phaseOverride.thinking, thinkingEffort: phaseOverride.thinkingEffort, webSearch: phaseOverride.webSearch },
      primaryCaps,
    );
    const fallbackCaps = capabilitiesFromLookup(merged._registryLookup, fallbackUseReasoning ? fallbackReasoningModel : fallbackModel);
    const fallbackGated = gateCapabilities(
      { thinking: phaseOverride.fallbackThinking, thinkingEffort: phaseOverride.fallbackThinkingEffort, webSearch: phaseOverride.fallbackWebSearch },
      fallbackCaps,
    );

    merged[`${prefix}BaseModel`] = baseModel;
    merged[`${prefix}ReasoningModel`] = reasoningModel;
    merged[`${prefix}UseReasoning`] = useReasoning;
    merged[`${prefix}MaxOutputTokens`] = phaseOverride.maxOutputTokens ?? merged[def.globalTokens];
    merged[`${prefix}TimeoutMs`] = phaseOverride.timeoutMs ?? merged[def.globalTimeout];
    merged[`${prefix}MaxContextTokens`] = phaseOverride.maxContextTokens ?? merged[def.globalContextTokens];
    merged[`${prefix}ReasoningBudget`] = phaseOverride.reasoningBudget ?? merged[def.globalReasoningBudget];
    merged[`${prefix}WebSearch`] = primaryGated.webSearch;
    merged[`${prefix}Thinking`] = primaryGated.thinking;
    merged[`${prefix}ThinkingEffort`] = primaryGated.thinkingEffort;
    merged[`${prefix}FallbackModel`]          = fallbackModel;
    merged[`${prefix}FallbackReasoningModel`] = fallbackReasoningModel;
    merged[`${prefix}FallbackUseReasoning`]   = fallbackUseReasoning;
    merged[`${prefix}FallbackThinking`]       = fallbackGated.thinking;
    merged[`${prefix}FallbackThinkingEffort`] = fallbackGated.thinkingEffort;
    merged[`${prefix}FallbackWebSearch`]      = fallbackGated.webSearch;
    merged[`${prefix}DisableLimits`]          = phaseOverride.disableLimits ?? false;
    merged[`${prefix}JsonStrict`]             = phaseOverride.jsonStrict ?? true;
  }

  // WHY: Cache the assembled composite so routing.js can read it without
  // re-assembling on every call. This is the bridge from flat keys to
  // the composite policy object.
  merged._llmPolicy = assembleLlmPolicy(merged);
}
