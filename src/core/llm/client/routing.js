import { callLlmProvider } from './llmClient.js';
import { resolveModelFromRegistry, stripCompositeKey } from '../routeResolver.js';
import { configInt, configBool, configValue } from '../../../shared/settingsAccessor.js';
import { providerFromModelToken, defaultBaseUrlForProvider, bootstrapApiKeyForProvider, KNOWN_PROVIDERS, normalizeProvider } from '../providerMeta.js';
import { enqueueLabCall } from '../labQueue.js';

// WHY: All roles alias to plan model via configPostMerge. ROLE_KEYS only needs
// model + fallbackModel. Provider/baseUrl/apiKey resolved via registry or bootstrap.
const ROLE_KEYS = {
  plan: { model: 'llmModelPlan', fallbackModel: 'llmPlanFallbackModel' },
  triage: { model: 'llmModelPlan', fallbackModel: 'llmPlanFallbackModel' },
  validate: { model: 'llmModelPlan', fallbackModel: 'llmPlanFallbackModel' },
  write: { model: 'llmModelPlan', fallbackModel: 'llmPlanFallbackModel' },
};

// WHY: Phase-aware model resolution. configPostMerge writes _resolved<Phase>BaseModel,
// _resolved<Phase>ReasoningModel, _resolved<Phase>UseReasoning per phase. This function
// is the single resolver so callers don't duplicate the fallback chain.
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// WHY: Single resolver for phase-aware reasoning. Callers never duplicate this chain.
// SSOT: _resolved${Phase}UseReasoning (from panel phase overrides) → llmPlanUseReasoning (panel global) → false.
// llmReasoningMode is a legacy key and is NOT part of this chain.
export function resolvePhaseReasoning(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return configBool(config, 'llmPlanUseReasoning');
  return Boolean(
    config[`_resolved${cap}UseReasoning`] ?? configValue(config, 'llmPlanUseReasoning')
  );
}

// WHY: Shared with frontend (LlmPhaseSection.tsx) per O(1) scaling rule.
import { extractEffortFromModelName } from '../../../shared/effortFromModelName.js';
import { resolveEffortLabel } from '../../../shared/resolveEffortLabel.js';
export { extractEffortFromModelName };

export function resolvePhaseModel(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return String(configValue(config, 'llmModelPlan')).trim();

  const useReasoning = resolvePhaseReasoning(config, phase);

  if (useReasoning) {
    const reasoning = String(
      config[`_resolved${cap}ReasoningModel`]
      || configValue(config, 'llmModelReasoning')
      || config[`_resolved${cap}BaseModel`]
      || configValue(config, 'llmModelPlan')
    ).trim();
    return reasoning;
  }

  return String(
    config[`_resolved${cap}BaseModel`]
    || configValue(config, 'llmModelPlan')
  ).trim();
}

function normalized(value) {
  return String(value || '').trim();
}

function routeRoleFromReason(reason = '') {
  const token = normalized(reason).toLowerCase();
  if (!token) {
    return 'plan';
  }
  if (
    token === 'plan' ||
    token.startsWith('plan_') ||
    token.startsWith('search_planner') ||
    token.startsWith('verify_extract_fast') ||
    token.includes('discovery_planner')
  ) {
    return 'plan';
  }
  if (
    token === 'write' ||
    token === 'summary' ||
    token.startsWith('write_') ||
    token.includes('summary')
  ) {
    return 'write';
  }
  return 'plan';
}

function roleKeySet(role) {
  return ROLE_KEYS[role] || ROLE_KEYS.plan;
}

function baseRouteForRole(config = {}, role = 'plan') {
  const keys = roleKeySet(role);
  const modelKey = normalized(String(configValue(config, keys.model)));

  // Registry is sole authority for provider/baseUrl/apiKey
  const resolved = resolveModelFromRegistry(config._registryLookup, modelKey);
  if (resolved) {
    return {
      role,
      provider: resolved.providerType,
      model: resolved.modelId,
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey || bootstrapApiKeyForProvider(config, providerFromModelToken(resolved.modelId)),
      _registryEntry: resolved,
    };
  }

  // Last resort: infer provider from model name, use bootstrap keys
  const inferred = providerFromModelToken(modelKey);
  return {
    role,
    provider: inferred,
    model: modelKey,
    baseUrl: defaultBaseUrlForProvider(inferred),
    apiKey: bootstrapApiKeyForProvider(config, inferred),
  };
}

// WHY: Per-key finder tier router. Resolves a difficulty tier → full 6-field model
// bundle from policy.keyFinderTiers. Cascade:
//   1) tier[difficulty] is "configured" → use that tier's bundle
//   2) tiers.fallback                   → bundle-level inheritance
//   3) policy.models.plan               → last-resort for the model id only
// A tier counts as configured when EITHER `model` is set OR
// (`useReasoning` is true AND `reasoningModel` is set). This mirrors the LLM
// Config panel for every other phase — a user who picks "use reasoning + this
// reasoning model" for a tier should not silently fall back because the base
// model field is empty. Whole-bundle inheritance (not per-field) — per Phase 2
// spec: tiers without a configured model inherit the full fallback bundle so
// reasoning/thinking/web flags don't drift from the fallback configuration.
export function resolvePhaseModelByTier(policy = {}, difficulty = '') {
  const tiers = policy.keyFinderTiers || {};
  const tier = tiers[String(difficulty || '').trim()];
  const fallback = tiers.fallback || {};
  const tierConfigured = !!tier && (
    !!tier.model
    || (Boolean(tier.useReasoning) && !!tier.reasoningModel)
  );
  const effective = tierConfigured ? tier : fallback;
  return {
    model: String(effective.model || policy.models?.plan || '').trim(),
    useReasoning: Boolean(effective.useReasoning),
    reasoningModel: String(effective.reasoningModel || '').trim(),
    thinking: Boolean(effective.thinking),
    thinkingEffort: String(effective.thinkingEffort || ''),
    webSearch: Boolean(effective.webSearch),
  };
}

// WHY: Phase-aware fallback resolution. The fallback panel mirrors the base model
// panel — it has its own model, reasoning toggle, reasoning model, thinking, and
// web search. This function resolves the effective fallback model using the
// fallback's own useReasoning toggle (not the primary's).
export function resolvePhaseFallbackModel(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return '';
  const fbUseReasoning = Boolean(config[`_resolved${cap}FallbackUseReasoning`]);
  const suffix = fbUseReasoning ? 'FallbackReasoningModel' : 'FallbackModel';
  return normalized(config[`_resolved${cap}${suffix}`]);
}

// WHY: Phase-level "disable limits" toggle. When true, callLlmWithRouting
// skips artificial token/timeout caps — only model hardware max applies.
export function resolvePhaseDisableLimits(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return false;
  return Boolean(config[`_resolved${cap}DisableLimits`]);
}

// WHY: Phase-level jsonStrict toggle. When false, callLlmWithRouting splits into
// two calls: Phase 1 (research, no schema) + Phase 2 (writer, with schema).
function resolvePhaseJsonStrict(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return true;
  return config[`_resolved${cap}JsonStrict`] ?? true;
}

// WHY: Writer is a global first-class phase (not per-source-phase sub-keys).
// Any source phase with jsonStrict=false triggers the same global writer for
// Phase 2 (formatting). Reads _resolvedWriterBaseModel / _resolvedWriterReasoningModel
// gated by _resolvedWriterUseReasoning. Returns empty when no writer configured.
function resolveWriterModel(config = {}) {
  const useReasoning = Boolean(config._resolvedWriterUseReasoning);
  const suffix = useReasoning ? 'ReasoningModel' : 'BaseModel';
  return normalized(config[`_resolvedWriter${suffix}`]);
}

function resolveWriterRoute(config = {}, { role = 'plan' } = {}) {
  const writerModel = resolveWriterModel(config);
  if (!writerModel) return null;

  const resolved = resolveModelFromRegistry(config._registryLookup, writerModel);
  if (resolved) {
    return {
      role,
      provider: resolved.providerType,
      model: resolved.modelId,
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey || bootstrapApiKeyForProvider(config, providerFromModelToken(resolved.modelId)),
      _registryEntry: resolved,
    };
  }

  const inferred = providerFromModelToken(writerModel);
  return {
    role,
    provider: inferred,
    model: writerModel,
    baseUrl: defaultBaseUrlForProvider(inferred),
    apiKey: bootstrapApiKeyForProvider(config, inferred),
  };
}

function fallbackRouteForRole(config = {}, role = 'plan') {
  const keys = roleKeySet(role);
  const model = normalized(String(configValue(config, keys.fallbackModel)));
  if (!model) {
    return null;
  }

  // Registry is sole authority for fallback model too
  const resolved = resolveModelFromRegistry(config._registryLookup, model);
  if (resolved) {
    return {
      role,
      provider: resolved.providerType,
      model: resolved.modelId,
      baseUrl: resolved.baseUrl,
      apiKey: resolved.apiKey || bootstrapApiKeyForProvider(config, providerFromModelToken(resolved.modelId)),
      _registryEntry: resolved,
    };
  }

  // Last resort: infer provider from model name, use bootstrap keys
  const inferred = providerFromModelToken(model);
  return {
    role,
    provider: inferred,
    model,
    baseUrl: defaultBaseUrlForProvider(inferred),
    apiKey: bootstrapApiKeyForProvider(config, inferred),
  };
}

export function buildEffectiveCostRates(registryEntry, callerCostRates) {
  const costs = registryEntry?.costs;
  if (!costs) return callerCostRates;
  return {
    llmCostInputPer1M: costs.inputPer1M,
    llmCostOutputPer1M: costs.outputPer1M,
    llmCostCachedInputPer1M: costs.cachedPer1M,
  };
}

function toIntToken(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function reasonTokenGroup(reason = '') {
  const token = normalized(reason).toLowerCase();
  if (!token) return 'default';
  if (token.includes('serp') || token.includes('triage') || token.includes('rerank')) return 'triage';
  if (
    token.includes('planner_reason')
    || token.includes('reasoning')
    || token.includes('verify_extract_reason')
  ) return 'reasoning';
  return 'default';
}

// WHY: extract/validate/write all alias to the plan model (configPostMerge).
// registryEntry is optional; when present its maxOutputTokens acts as a hard ceiling.
// Fallback uses the same phase cap as primary — no separate fallback budget.
export function roleTokenCap(config = {}, role = 'extract', reason = '', registryEntry) {
  const group = reasonTokenGroup(reason);
  let cap;
  if (role === 'plan' && group === 'triage') {
    cap = configInt(config, 'llmMaxOutputTokensTriage');
  } else if (role === 'plan' && group === 'reasoning') {
    cap = configInt(config, 'llmMaxOutputTokensReasoning');
  } else {
    // plan, extract, validate, write, and any unknown role — all use plan default path
    cap = configInt(config, 'llmMaxOutputTokensPlan');
  }

  // Registry ceiling: never exceed the model's declared maxOutputTokens
  const registryMax = registryEntry?.tokenProfile?.maxOutputTokens;
  if (registryMax != null && registryMax > 0) {
    return Math.min(cap, registryMax);
  }
  return cap;
}

// WHY: Phase-level token cap from LLM panel. configPostMerge writes _resolved${Phase}MaxOutputTokens.
// Returns 0 when no phase cap is configured, letting roleTokenCap handle it.
function resolvePhaseTokenCap(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return 0;
  return Math.max(0, Number(config[`_resolved${cap}MaxOutputTokens`] || 0));
}

// WHY: Phase-level timeout from LLM panel. configPostMerge writes _resolved${Phase}TimeoutMs.
// Returns 0 when no phase timeout is configured, letting the caller's default win.
export function resolvePhaseTimeoutMs(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return 0;
  return Math.max(0, Number(config[`_resolved${cap}TimeoutMs`] || 0));
}

// WHY: Phase-level context token cap from LLM panel. configPostMerge writes _resolved${Phase}MaxContextTokens.
export function resolvePhaseMaxContextTokens(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return 0;
  return Math.max(0, Number(config[`_resolved${cap}MaxContextTokens`] || 0));
}

// WHY: Phase-level reasoning budget from LLM panel. configPostMerge writes _resolved${Phase}ReasoningBudget.
// Returns 0 when no phase-level budget is configured, letting roleReasoningCap fall back to global.
export function resolvePhaseReasoningBudget(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return 0;
  return Math.max(0, Number(config[`_resolved${cap}ReasoningBudget`] || 0));
}

// WHY: Resolves per-phase boolean flags from config.
// configPostMerge writes _resolved${Phase}WebSearch, _resolved${Phase}Thinking.
function resolvePhaseFlag(config = {}, phase = '', flagSuffix = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap || !flagSuffix) return false;
  return Boolean(config[`_resolved${cap}${flagSuffix}`]);
}

// WHY: Resolves per-phase string values from config.
// configPostMerge writes _resolved${Phase}ThinkingEffort.
function resolvePhaseString(config = {}, phase = '', suffix = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap || !suffix) return '';
  return String(config[`_resolved${cap}${suffix}`] || '');
}

function roleReasoningCap(config = {}, role = 'extract', reason = '') {
  const fallbackCap = roleTokenCap(config, role, reason);
  const configured = configInt(config, 'llmReasoningBudget');
  if (configured <= 0) return fallbackCap;
  if (fallbackCap <= 0) return configured;
  return Math.min(configured, fallbackCap);
}

export function resolveLlmRoute(config = {}, { reason = '', role = '', modelOverride = '', phase = '' } = {}) {
  const resolvedRole = role || routeRoleFromReason(reason);
  const route = baseRouteForRole(config, resolvedRole);
  // WHY: phase-aware auto-resolution — if no explicit modelOverride, derive from phase config
  const effectiveOverride = normalized(modelOverride) || (phase ? resolvePhaseModel(config, phase) : '');
  const overrideModel = normalized(effectiveOverride);
  if (overrideModel) {
    const enforceRoleProvider = Boolean(config.llmForceRoleModelProvider);
    if (enforceRoleProvider) {
      const roleProvider = normalizeProvider(route.provider || providerFromModelToken(route.model));
      const overrideProvider = providerFromModelToken(overrideModel);
      if (roleProvider && overrideProvider && roleProvider !== overrideProvider) {
        return route;
      }
    }
    // Re-resolve override model through registry if available
    if (config._registryLookup) {
      const overrideResolved = resolveModelFromRegistry(config._registryLookup, overrideModel);
      if (overrideResolved) {
        route.provider = overrideResolved.providerType;
        route.model = overrideResolved.modelId;
        route.baseUrl = overrideResolved.baseUrl;
        route.apiKey = overrideResolved.apiKey || route.apiKey;
        route._registryEntry = overrideResolved;
        return route;
      }
    }
    // WHY: Override model not in registry — infer provider from model name.
    // Composite keys ("providerId:modelId") must be split so
    // providerFromModelToken receives a bare model ID, not "lab-openai:gpt-5-low".
    delete route._registryEntry;
    route.model = stripCompositeKey(overrideModel);
    const inferred = providerFromModelToken(route.model);
    route.provider = inferred;
    route.baseUrl = defaultBaseUrlForProvider(inferred);
    route.apiKey = bootstrapApiKeyForProvider(config, inferred);
  }
  return route;
}

export function resolveLlmFallbackRoute(config = {}, { reason = '', role = '', modelOverride = '', phase = '' } = {}) {
  const resolvedRole = role || routeRoleFromReason(reason);

  // WHY: Phase-specific fallback takes precedence over global role fallback.
  // If a phase has its own fallback model configured, use it instead of the global.
  const phaseFallbackModel = phase ? resolvePhaseFallbackModel(config, phase) : '';
  let fallback;
  if (phaseFallbackModel) {
    // Resolve the phase-specific fallback model through registry
    const resolved = resolveModelFromRegistry(config._registryLookup, phaseFallbackModel);
    if (resolved) {
      fallback = {
        role: resolvedRole,
        provider: resolved.providerType,
        model: resolved.modelId,
        baseUrl: resolved.baseUrl,
        apiKey: resolved.apiKey || bootstrapApiKeyForProvider(config, providerFromModelToken(resolved.modelId)),
        _registryEntry: resolved,
      };
    } else {
      const inferred = providerFromModelToken(phaseFallbackModel);
      fallback = {
        role: resolvedRole,
        provider: inferred,
        model: phaseFallbackModel,
        baseUrl: defaultBaseUrlForProvider(inferred),
        apiKey: bootstrapApiKeyForProvider(config, inferred),
      };
    }
  } else {
    fallback = fallbackRouteForRole(config, resolvedRole);
  }

  if (!fallback) {
    return null;
  }
  // WHY: No dedup between primary and fallback. If the user configured the
  // same model for both, honor that — LLM outputs are stochastic and a
  // resample on the same model can recover from schema/parse failures.
  return fallback;
}

export function hasLlmRouteApiKey(config = {}, { reason = '', role = '' } = {}) {
  const route = resolveLlmRoute(config, { reason, role });
  if (route.apiKey) {
    return true;
  }
  const fallback = resolveLlmFallbackRoute(config, { reason, role });
  return Boolean(fallback?.apiKey);
}

export function hasAnyLlmApiKey(config = {}) {
  for (const role of Object.keys(ROLE_KEYS)) {
    if (hasLlmRouteApiKey(config, { role })) {
      return true;
    }
  }
  return false;
}

function publicRouteView(route = {}) {
  return {
    provider: route.provider || null,
    base_url: route.baseUrl || null,
    model: route.model || null,
    api_key_present: Boolean(route.apiKey)
  };
}

export function llmRoutingSnapshot(config = {}) {
  const roles = Object.keys(ROLE_KEYS);
  const snapshot = {};
  for (const role of roles) {
    const primary = baseRouteForRole(config, role);
    const fallback = fallbackRouteForRole(config, role);
    snapshot[role] = {
      primary: publicRouteView(primary),
      fallback: fallback ? publicRouteView(fallback) : null
    };
  }
  return snapshot;
}

export async function callLlmWithRouting({
  config,
  reason = '',
  role = '',
  phase = '',
  modelOverride = '',
  capabilityOverride = null,
  requestOptions = null,
  system,
  user,
  jsonSchema,
  usageContext = {},
  costRates,
  onUsage,
  timeoutMs = 40_000,
  providerHealth,
  logger,
  onPhaseChange,
  onModelResolved,
  onStreamChunk,
  onQueueWait,
  signal,
}) {
  const resolvedRole = role || routeRoleFromReason(reason);
  const primary = resolveLlmRoute(config, {
    reason,
    role: resolvedRole,
    modelOverride,
    phase,
  });
  const fallback = resolveLlmFallbackRoute(config, {
    reason,
    role: resolvedRole,
    modelOverride,
    phase,
  });
  const baseRequestOptions = (
    requestOptions && typeof requestOptions === 'object'
      ? requestOptions
      : (usageContext?.request_options && typeof usageContext.request_options === 'object'
          ? usageContext.request_options
          : null)
  );

  // WHY: Phase-level web_search / thinking / thinkingEffort flags. When a
  // per-call capabilityOverride is provided (e.g. keyFinder tier bundle), it
  // supersedes these reads. Limits (tokens, timeout, budget, disableLimits,
  // jsonStrict) deliberately stay phase-level — they're shared across tiers.
  const phaseWebSearch = capabilityOverride
    ? Boolean(capabilityOverride.webSearch)
    : resolvePhaseFlag(config, phase, 'WebSearch');
  const phaseThinking = capabilityOverride
    ? Boolean(capabilityOverride.thinking)
    : resolvePhaseFlag(config, phase, 'Thinking');
  const phaseThinkingEffort = capabilityOverride
    ? String(capabilityOverride.thinkingEffort || '')
    : resolvePhaseString(config, phase, 'ThinkingEffort');
  // WHY: Suffixed models (e.g. gpt-5.4-xhigh) carry effort in the name.
  // LLM Lab extracts it server-side. Sending reasoning_effort too would double-specify.
  const primaryBakedEffort = extractEffortFromModelName(primary.model);
  const mergedOptions = {
    ...(baseRequestOptions || {}),
    ...(phaseWebSearch ? { web_search: true } : {}),
    ...(phaseThinking && !primaryBakedEffort ? { reasoning_effort: phaseThinkingEffort || 'medium' } : {}),
  };
  const effectiveRequestOptions = Object.keys(mergedOptions).length > 0 ? mergedOptions : baseRequestOptions;

  // WHY: Reasoning + tokens auto-resolved from config via phase. Callers never set these.
  // The LLM Settings panel is the SSOT — configPostMerge writes _resolved${Phase}* keys.
  // capabilityOverride.useReasoning wins when a tier-aware caller supplies one.
  const reasoningMode = capabilityOverride
    ? Boolean(capabilityOverride.useReasoning)
    : resolvePhaseReasoning(config, phase);

  // WHY: Fallback shares the phase's call-level caps with the primary. Only
  // the registry ceiling may differ per model, so we compute both role caps
  // independently, but the phase cap gates both identically.
  const primaryTokenCap = roleTokenCap(config, resolvedRole, reason, primary._registryEntry);
  const fallbackTokenCap = roleTokenCap(config, resolvedRole, reason, fallback?._registryEntry);
  // WHY: Phase-level token cap from panel takes precedence over role-level cap.
  // When disableLimits is on, skip all artificial caps — model hardware max applies in llmClient.
  const phaseDisableLimits = resolvePhaseDisableLimits(config, phase);
  const phaseTokenCap = resolvePhaseTokenCap(config, phase);
  const resolvedMaxTokens = phaseDisableLimits
    ? 0
    : (phaseTokenCap > 0
      ? Math.min(phaseTokenCap, primaryTokenCap || phaseTokenCap)
      : primaryTokenCap);
  const fallbackMaxTokens = phaseDisableLimits
    ? 0
    : (phaseTokenCap > 0
      ? Math.min(phaseTokenCap, fallbackTokenCap || phaseTokenCap)
      : fallbackTokenCap);

  // WHY: Phase-level reasoning budget takes precedence over global.
  // disableLimits zeroes the reasoning budget, otherwise roleReasoningCap's
  // min(llmReasoningBudget, roleTokenCap) re-imposes a cap that starves the
  // visible output (e.g. 4096 total with xhigh reasoning → model spends 6K
  // on thinking, truncates the JSON). Fallback inherits the same budget.
  const phaseReasoningBudget = resolvePhaseReasoningBudget(config, phase);
  const baseReasoningCap = roleReasoningCap(config, resolvedRole, reason);
  const resolvedReasoningBudget = phaseDisableLimits
    ? 0
    : (phaseReasoningBudget > 0 ? phaseReasoningBudget : baseReasoningCap);

  // WHY: Phase-level context token cap from panel. Passed through to the
  // provider for telemetry and any future input-side enforcement.
  const phaseMaxContextTokens = resolvePhaseMaxContextTokens(config, phase);
  const resolvedMaxContextTokens = phaseDisableLimits ? 0 : phaseMaxContextTokens;

  // WHY: Phase-level timeout from panel. Falls back to caller's timeoutMs param.
  const phaseTimeoutMs = resolvePhaseTimeoutMs(config, phase);
  const resolvedTimeoutMs = phaseDisableLimits
    ? 1200000
    : (phaseTimeoutMs > 0 ? phaseTimeoutMs : timeoutMs);

  const jsonStrictEnabled = resolvePhaseJsonStrict(config, phase);

  // WHY: Lab-proxied calls serialize through a global queue to avoid overwhelming
  // the upstream ChatGPT session. Non-lab calls bypass entirely.
  const labQueueDelayMs = configInt(config, 'llmLabQueueDelayMs');
  const wrapLabQueue = (route, callFn) => {
    const isLab = route?._registryEntry?.accessMode === 'lab';
    if (isLab && labQueueDelayMs > 0) {
      const enqueueAt = Date.now();
      return enqueueLabCall(() => {
        const waitMs = Date.now() - enqueueAt;
        onQueueWait?.(waitMs);
        return callFn();
      }, labQueueDelayMs, signal);
    }
    return callFn();
  };

  logger?.info?.('llm_route_selected', {
    reason,
    role: resolvedRole,
    provider: primary.provider || null,
    model: primary.model || null,
    base_url: primary.baseUrl || null,
    fallback_base_url: fallback?.baseUrl || null,
    fallback_configured: Boolean(fallback),
    output_token_cap: primaryTokenCap,
    output_token_cap_fallback: fallbackTokenCap,
    reasoning_mode: reasoningMode,
    reasoning_budget: resolvedReasoningBudget,
    phase_token_cap: phaseTokenCap,
    phase_context_cap: phaseMaxContextTokens,
    phase_reasoning_budget: phaseReasoningBudget,
    json_strict: jsonStrictEnabled,
    two_phase_writer: !jsonStrictEnabled && Boolean(jsonSchema),
    phase: phase || null,
    reasoning_effort_config: phaseThinkingEffort || null,
    reasoning_effort_baked: primaryBakedEffort || null,
    reasoning_effort_sent: (phaseThinking && !primaryBakedEffort) ? (phaseThinkingEffort || 'medium') : null,
  });

  const sharedParams = {
    system,
    user,
    jsonSchema,
    requestOptions: effectiveRequestOptions,
    usageContext: {
      ...usageContext,
      reason,
      route_role: resolvedRole,
      model_token_profile_map: config?.llmModelOutputTokenMap || {},
      default_output_token_cap: primaryTokenCap,
      deepseek_default_max_output_tokens: 8192,
      effort_level: primaryBakedEffort || (phaseThinking ? (phaseThinkingEffort || 'medium') : ''),
      web_search_enabled: Boolean(phaseWebSearch),
      max_context_tokens: Number(resolvedMaxContextTokens || 0),
    },
    costRates,
    onUsage,
    reasoningMode: Boolean(reasoningMode),
    reasoningBudget: Number(resolvedReasoningBudget || 0),
    maxTokens: Number(resolvedMaxTokens || 0),
    maxContextTokens: Number(resolvedMaxContextTokens || 0),
    timeoutMs: resolvedTimeoutMs,
    logger,
    onStreamChunk,
    signal,
  };

  // Cost flow-through: prefer registry costs over flat config keys
  const effectiveCostRates = buildEffectiveCostRates(primary._registryEntry, costRates);

  const effectiveSharedParams = { ...sharedParams, costRates: effectiveCostRates };

  // Dispatch-type seam: cortex providers use a different transport
  if (primary._registryEntry?.providerType === 'cortex') {
    throw new Error('cortex provider dispatch not yet re-implemented — route via openai-compatible provider or remove cortex entry');
  }

  // WHY: Fallback inherits every call-level limit (maxTokens, maxContextTokens,
  // reasoningBudget, timeoutMs, jsonSchema, disableLimits) from the phase —
  // sharedParams already carries those. Only model-capability overrides differ:
  // fallback model id, cost rates, Fallback{WebSearch,Thinking,ThinkingEffort,UseReasoning},
  // and the fallback model's registry maxOutputTokens ceiling (fallbackMaxTokens).
  const buildFallbackCallParams = (extras = {}) => {
    const effectiveFallbackCostRates = buildEffectiveCostRates(fallback._registryEntry, costRates);
    const fbWebSearch = resolvePhaseFlag(config, phase, 'FallbackWebSearch');
    const fbThinking = resolvePhaseFlag(config, phase, 'FallbackThinking');
    const fbThinkingEffort = resolvePhaseString(config, phase, 'FallbackThinkingEffort');
    onModelResolved?.({ model: fallback.model, provider: fallback.provider, isFallback: true, accessMode: fallback._registryEntry?.accessMode || 'api', thinking: Boolean(fbThinking), webSearch: Boolean(fbWebSearch), effortLevel: resolveEffortLabel({ model: fallback.model, effortLevel: fbThinkingEffort, thinking: fbThinking }) });
    const capFb = capitalize(String(phase || '').trim());
    const fbReasoning = capFb ? Boolean(config[`_resolved${capFb}FallbackUseReasoning`]) : false;
    const fallbackBakedEffort = extractEffortFromModelName(fallback.model);
    const fbRequestOptions = {
      ...(baseRequestOptions || {}),
      ...(fbWebSearch ? { web_search: true } : {}),
      ...(fbThinking && !fallbackBakedEffort ? { reasoning_effort: fbThinkingEffort || 'medium' } : {}),
    };
    const effectiveFbRequestOptions = Object.keys(fbRequestOptions).length > 0 ? fbRequestOptions : baseRequestOptions;

    return {
      ...sharedParams,
      costRates: effectiveFallbackCostRates,
      requestOptions: effectiveFbRequestOptions,
      reasoningMode: Boolean(fbReasoning),
      route: {
        model: fallback.model, apiKey: fallback.apiKey, baseUrl: fallback.baseUrl,
        provider: fallback.provider, accessMode: fallback._registryEntry?.accessMode || '',
      },
      // Override maxTokens to apply the fallback model's registry ceiling;
      // reasoningBudget / maxContextTokens / timeoutMs inherit from sharedParams.
      maxTokens: Number(fallbackMaxTokens || 0),
      providerHealth,
      usageContext: {
        ...sharedParams.usageContext,
        default_output_token_cap: fallbackTokenCap,
        fallback_attempt: true,
        fallback_from_model: primary.model || null,
        effort_level: fallbackBakedEffort || (fbThinking ? (fbThinkingEffort || 'medium') : ''),
        web_search_enabled: Boolean(fbWebSearch),
      },
      ...extras,
    };
  };

  // WHY: Shared single-call fallback (for jsonStrict=true or no schema).
  const dispatchFallback = (error) => {
    if (!fallback) throw error;
    logger?.warn?.('llm_route_fallback', {
      reason,
      role: resolvedRole,
      primary_provider: primary.provider || null,
      primary_model: primary.model || null,
      primary_base_url: primary.baseUrl || null,
      fallback_provider: fallback.provider || null,
      fallback_model: fallback.model || null,
      fallback_base_url: fallback.baseUrl || null,
      message: error.message
    });
    return wrapLabQueue(fallback, () => callLlmProvider(buildFallbackCallParams()));
  };

  // WHY: Research-phase fallback. When jsonStrict=false and primary research
  // fails, the fallback model also runs research (no schema, rawTextMode) so the
  // writer phase can proceed with fallback-produced findings. Writer model is
  // phase-level (not per-attempt) and runs the same way regardless.
  const dispatchFallbackResearch = (error) => {
    if (!fallback) throw error;
    logger?.warn?.('llm_route_fallback_research', {
      reason,
      role: resolvedRole,
      primary_model: primary.model || null,
      fallback_model: fallback.model || null,
      message: error.message
    });
    return wrapLabQueue(fallback, () => callLlmProvider(buildFallbackCallParams({
      jsonSchema: null,
      rawTextMode: true,
    })));
  };

  // WHY: When jsonStrict is false AND a jsonSchema is provided, split into two phases:
  // Phase 1 uses the primary model for free-form research (no schema constraint).
  // Phase 2 uses a dedicated writer model to format into the schema.
  const useWriterPhase = !jsonStrictEnabled && jsonSchema;

  if (useWriterPhase) {
    onModelResolved?.({ model: primary.model, provider: primary.provider, isFallback: false, accessMode: primary._registryEntry?.accessMode || 'api', thinking: Boolean(phaseThinking), webSearch: Boolean(phaseWebSearch), effortLevel: resolveEffortLabel({ model: primary.model, effortLevel: phaseThinkingEffort, thinking: phaseThinking }) });
    let researchText;
    try {
      researchText = await wrapLabQueue(primary, () => callLlmProvider({
        ...effectiveSharedParams,
        jsonSchema: null,
        rawTextMode: true,
        route: {
          model: primary.model, apiKey: primary.apiKey, baseUrl: primary.baseUrl,
          provider: primary.provider, accessMode: primary._registryEntry?.accessMode || '',
        },
        providerHealth,
      }));
    } catch (error) {
      // WHY: Fallback mirrors primary's two-phase behavior — research (no schema)
      // with the fallback model, then the same writer phase continues.
      logger?.warn?.('llm_writer_research_failed_falling_back', {
        reason,
        role: resolvedRole,
        phase: phase || null,
        message: error.message,
      });
      researchText = await dispatchFallbackResearch(error);
    }

    onPhaseChange?.('writer');

    // Phase 2: Format — dedicated global writer model (or primary if no writer configured), WITH schema
    const writerRoute = resolveWriterRoute(config, { role: resolvedRole }) || primary;
    const writerSystem = [
      'You are a JSON formatter. Convert the research findings below into the required JSON schema.',
      'Do not perform additional research. Only extract, normalize, and format the findings.',
      '',
      'Task context (formatting rules):',
      system,
      '',
      'Research findings:',
      researchText,
    ].join('\n');

    const effectiveWriterCostRates = buildEffectiveCostRates(writerRoute._registryEntry, costRates);

    // WHY: Writer is global — reads _resolvedWriter* keys, not per-source-phase.
    const writerReasoning = Boolean(config._resolvedWriterUseReasoning);
    const writerThinking = Boolean(config._resolvedWriterThinking);
    const writerThinkingEffort = String(config._resolvedWriterThinkingEffort || '');
    const writerBakedEffort = extractEffortFromModelName(writerRoute.model);
    const writerRequestOptions = {
      ...(writerThinking && !writerBakedEffort ? { reasoning_effort: writerThinkingEffort || 'medium' } : {}),
    };
    const effectiveWriterRequestOptions = Object.keys(writerRequestOptions).length > 0 ? writerRequestOptions : null;

    // WHY: Writer owns its own limits — decoupled from source phase. disableLimits,
    // maxOutputTokens, timeoutMs, reasoningBudget, maxContextTokens all come from
    // _resolvedWriter* global keys (not _resolved${sourcePhase}*).
    const writerDisableLimits = Boolean(config._resolvedWriterDisableLimits);
    const writerPhaseTokenCap = Math.max(0, Number(config._resolvedWriterMaxOutputTokens || 0));
    const writerTimeoutMs = Math.max(0, Number(config._resolvedWriterTimeoutMs || 0));
    const writerReasoningBudget = Math.max(0, Number(config._resolvedWriterReasoningBudget || 0));
    const writerMaxContextTokens = Math.max(0, Number(config._resolvedWriterMaxContextTokens || 0));

    const writerRegistryMax = writerRoute._registryEntry?.tokenProfile?.maxOutputTokens;
    const writerCappedTokens = writerPhaseTokenCap > 0 && writerRegistryMax
      ? Math.min(writerPhaseTokenCap, writerRegistryMax)
      : (writerPhaseTokenCap || writerRegistryMax || primaryTokenCap);
    const writerResolvedMaxTokens = writerDisableLimits ? 0 : writerCappedTokens;
    const writerResolvedTimeoutMs = writerDisableLimits
      ? 1200000
      : (writerTimeoutMs > 0 ? writerTimeoutMs : timeoutMs);
    const writerResolvedReasoningBudget = writerDisableLimits
      ? 0
      : (writerReasoningBudget > 0 ? writerReasoningBudget : resolvedReasoningBudget);
    const writerResolvedMaxContextTokens = writerDisableLimits ? 0 : writerMaxContextTokens;

    return wrapLabQueue(writerRoute, () => callLlmProvider({
      ...sharedParams,
      system: writerSystem,
      user,
      jsonSchema,
      costRates: effectiveWriterCostRates,
      requestOptions: effectiveWriterRequestOptions,
      reasoningMode: Boolean(writerReasoning),
      route: {
        model: writerRoute.model, apiKey: writerRoute.apiKey, baseUrl: writerRoute.baseUrl,
        provider: writerRoute.provider, accessMode: writerRoute._registryEntry?.accessMode || '',
      },
      maxTokens: Number(writerResolvedMaxTokens || 0),
      timeoutMs: writerResolvedTimeoutMs,
      reasoningBudget: Number(writerResolvedReasoningBudget || 0),
      maxContextTokens: Number(writerResolvedMaxContextTokens || 0),
      providerHealth,
      usageContext: {
        ...sharedParams.usageContext,
        phase: 'writer',
        reason: 'writer_formatting',
        source_phase: phase || null,
        writer_phase: true,
        research_model: primary.model,
        effort_level: writerBakedEffort || (writerThinking ? (writerThinkingEffort || 'medium') : ''),
        web_search_enabled: false,
      },
    }));
  }

  // Existing single-call behavior (jsonStrict: true or no jsonSchema)
  onModelResolved?.({ model: primary.model, provider: primary.provider, isFallback: false, accessMode: primary._registryEntry?.accessMode || 'api', thinking: Boolean(phaseThinking), webSearch: Boolean(phaseWebSearch), effortLevel: resolveEffortLabel({ model: primary.model, effortLevel: phaseThinkingEffort, thinking: phaseThinking }) });
  try {
    return await wrapLabQueue(primary, () => callLlmProvider({
      ...effectiveSharedParams,
      route: {
        model: primary.model, apiKey: primary.apiKey, baseUrl: primary.baseUrl,
        provider: primary.provider, accessMode: primary._registryEntry?.accessMode || '',
      },
      providerHealth
    }));
  } catch (error) {
    return dispatchFallback(error);
  }
}
