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
  extract: { model: 'llmModelPlan', fallbackModel: 'llmPlanFallbackModel' },
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
    return 'extract';
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
  if (
    token === 'validate' ||
    token.startsWith('validate_')
  ) {
    return 'validate';
  }
  return 'extract';
}

function roleKeySet(role) {
  return ROLE_KEYS[role] || ROLE_KEYS.extract;
}

function baseRouteForRole(config = {}, role = 'extract') {
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

// WHY: Writer model is an independent model for Phase 2 (formatting) when
// jsonStrict is off. Same shape as fallback (model + useReasoning + reasoningModel)
// but serves a different purpose. Returns null when no writer model configured.
function resolvePhaseWriterModel(config = {}, phase = '') {
  const cap = capitalize(String(phase || '').trim());
  if (!cap) return '';
  const useReasoning = Boolean(config[`_resolved${cap}WriterUseReasoning`]);
  const suffix = useReasoning ? 'WriterReasoningModel' : 'WriterModel';
  return normalized(config[`_resolved${cap}${suffix}`]);
}

function resolveWriterRoute(config = {}, { role = 'plan', phase = '' } = {}) {
  const writerModel = resolvePhaseWriterModel(config, phase);
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

function fallbackRouteForRole(config = {}, role = 'extract') {
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

function routeFingerprint(route = {}) {
  return [
    normalized(route.provider).toLowerCase(),
    normalized(route.baseUrl).toLowerCase(),
    normalized(route.model).toLowerCase()
  ].join('::');
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
    || token.includes('validate')
  ) return 'reasoning';
  return 'default';
}

// WHY: extract/validate/write all alias to the plan model (configPostMerge).
// registryEntry is optional; when present its maxOutputTokens acts as a hard ceiling.
export function roleTokenCap(config = {}, role = 'extract', reason = '', isFallback = false, registryEntry) {
  const group = reasonTokenGroup(reason);
  let cap;
  if (role === 'plan' && group === 'triage') {
    cap = isFallback
      ? configInt(config, 'llmMaxOutputTokensPlanFallback')
      : configInt(config, 'llmMaxOutputTokensTriage');
  } else if (role === 'plan' && group === 'reasoning') {
    cap = isFallback
      ? configInt(config, 'llmMaxOutputTokensPlanFallback')
      : configInt(config, 'llmMaxOutputTokensReasoning');
  } else if (role === 'plan') {
    cap = isFallback
      ? configInt(config, 'llmMaxOutputTokensPlanFallback')
      : configInt(config, 'llmMaxOutputTokensPlan');
  } else {
    // extract, validate, write, and any unknown role — all use plan default path
    cap = isFallback
      ? configInt(config, 'llmMaxOutputTokensPlanFallback')
      : configInt(config, 'llmMaxOutputTokensPlan');
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

function roleReasoningCap(config = {}, role = 'extract', reason = '', isFallback = false) {
  const fallbackCap = roleTokenCap(config, role, reason, isFallback);
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
  const alignedFallback = fallback;
  const effectiveOverride = normalized(modelOverride) || (phase ? resolvePhaseModel(config, phase) : '');
  if (effectiveOverride && normalized(effectiveOverride) === normalized(fallback.model)) {
    return null;
  }
  const primary = resolveLlmRoute(config, {
    reason,
    role: resolvedRole,
    modelOverride: effectiveOverride,
  });
  if (routeFingerprint(primary) === routeFingerprint(alignedFallback)) {
    return null;
  }
  return alignedFallback;
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

  // WHY: Phase-level web_search and thinking flags from LLM settings panel.
  const phaseWebSearch = resolvePhaseFlag(config, phase, 'WebSearch');
  const phaseThinking = resolvePhaseFlag(config, phase, 'Thinking');
  const phaseThinkingEffort = resolvePhaseString(config, phase, 'ThinkingEffort');
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
  const reasoningMode = resolvePhaseReasoning(config, phase);

  const primaryTokenCap = roleTokenCap(config, resolvedRole, reason, false, primary._registryEntry);
  const fallbackTokenCap = roleTokenCap(config, resolvedRole, reason, true, fallback?._registryEntry);
  const primaryReasoningBudget = roleReasoningCap(config, resolvedRole, reason, false);
  const fallbackReasoningBudget = roleReasoningCap(config, resolvedRole, reason, true);
  // WHY: Phase-level token cap from panel takes precedence over role-level cap.
  // When disableLimits is on, skip all artificial caps — model hardware max applies in llmClient.
  const phaseDisableLimits = resolvePhaseDisableLimits(config, phase);
  const phaseTokenCap = resolvePhaseTokenCap(config, phase);
  const resolvedMaxTokens = phaseDisableLimits
    ? 0
    : (phaseTokenCap > 0
      ? Math.min(phaseTokenCap, primaryTokenCap || phaseTokenCap)
      : primaryTokenCap);
  // WHY: disableLimits must also zero the reasoning budget, otherwise
  // roleReasoningCap's min(llmReasoningBudget, roleTokenCap) re-imposes
  // a cap that starves the visible output (e.g. 4096 total with xhigh
  // reasoning → model spends 6K on thinking, truncates the JSON).
  const resolvedReasoningBudget = phaseDisableLimits ? 0 : primaryReasoningBudget;

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
      }, labQueueDelayMs);
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
    phase_token_cap: phaseTokenCap,
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
      deepseek_default_max_output_tokens: 8192
    },
    costRates,
    onUsage,
    reasoningMode: Boolean(reasoningMode),
    reasoningBudget: Number(resolvedReasoningBudget || 0),
    maxTokens: Number(resolvedMaxTokens || 0),
    timeoutMs: resolvedTimeoutMs,
    logger,
    onStreamChunk
  };

  // Cost flow-through: prefer registry costs over flat config keys
  const effectiveCostRates = buildEffectiveCostRates(primary._registryEntry, costRates);

  const effectiveSharedParams = { ...sharedParams, costRates: effectiveCostRates };

  // Dispatch-type seam: cortex providers use a different transport
  if (primary._registryEntry?.providerType === 'cortex') {
    throw new Error('cortex provider dispatch not yet re-implemented — route via openai-compatible provider or remove cortex entry');
  }

  // WHY: Shared fallback dispatch — extracted to avoid duplicating fallback logic
  // in both the single-call and two-phase paths.
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
    const effectiveFallbackCostRates = buildEffectiveCostRates(fallback._registryEntry, costRates);
    const fallbackMaxTokens = phaseDisableLimits
      ? 0
      : (phaseTokenCap > 0
        ? Math.min(phaseTokenCap, fallbackTokenCap || phaseTokenCap)
        : fallbackTokenCap);
    const fbWebSearch = resolvePhaseFlag(config, phase, 'FallbackWebSearch');
    const fbThinking = resolvePhaseFlag(config, phase, 'FallbackThinking');
    onModelResolved?.({ model: fallback.model, provider: fallback.provider, isFallback: true, accessMode: fallback._registryEntry?.accessMode || 'api', thinking: Boolean(fbThinking), webSearch: Boolean(fbWebSearch) });
    const fbThinkingEffort = resolvePhaseString(config, phase, 'FallbackThinkingEffort');
    const capFb = capitalize(String(phase || '').trim());
    const fbReasoning = capFb ? Boolean(config[`_resolved${capFb}FallbackUseReasoning`]) : false;
    const fallbackBakedEffort = extractEffortFromModelName(fallback.model);
    const fbRequestOptions = {
      ...(baseRequestOptions || {}),
      ...(fbWebSearch ? { web_search: true } : {}),
      ...(fbThinking && !fallbackBakedEffort ? { reasoning_effort: fbThinkingEffort || 'medium' } : {}),
    };
    const effectiveFbRequestOptions = Object.keys(fbRequestOptions).length > 0 ? fbRequestOptions : baseRequestOptions;

    return wrapLabQueue(fallback, () => callLlmProvider({
      ...sharedParams,
      costRates: effectiveFallbackCostRates,
      requestOptions: effectiveFbRequestOptions,
      reasoningMode: Boolean(fbReasoning),
      route: {
        model: fallback.model, apiKey: fallback.apiKey, baseUrl: fallback.baseUrl,
        provider: fallback.provider, accessMode: fallback._registryEntry?.accessMode || '',
      },
      reasoningBudget: Number(fallbackReasoningBudget || 0),
      maxTokens: Number(fallbackMaxTokens || 0),
      providerHealth,
      usageContext: {
        ...sharedParams.usageContext,
        default_output_token_cap: fallbackTokenCap,
        fallback_attempt: true,
        fallback_from_model: primary.model || null
      }
    }));
  };

  // WHY: When jsonStrict is false AND a jsonSchema is provided, split into two phases:
  // Phase 1 uses the primary model for free-form research (no schema constraint).
  // Phase 2 uses a dedicated writer model to format into the schema.
  const useWriterPhase = !jsonStrictEnabled && jsonSchema;

  if (useWriterPhase) {
    onModelResolved?.({ model: primary.model, provider: primary.provider, isFallback: false, accessMode: primary._registryEntry?.accessMode || 'api', thinking: Boolean(phaseThinking), webSearch: Boolean(phaseWebSearch) });
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
      // Research failed → fall back to single-call WITH schema (existing fallback behavior)
      logger?.warn?.('llm_writer_research_failed_falling_back', {
        reason,
        role: resolvedRole,
        phase: phase || null,
        message: error.message,
      });
      return dispatchFallback(error);
    }

    onPhaseChange?.('writer');

    // Phase 2: Format — dedicated writer model (or primary if no writer configured), WITH schema
    const writerRoute = resolveWriterRoute(config, { role: resolvedRole, phase }) || primary;
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

    // WHY: Writer panel has its own reasoning/thinking flags (same shape as fallback).
    const capW = capitalize(String(phase || '').trim());
    const writerReasoning = capW ? Boolean(config[`_resolved${capW}WriterUseReasoning`]) : false;
    const writerThinking = resolvePhaseFlag(config, phase, 'WriterThinking');
    const writerThinkingEffort = resolvePhaseString(config, phase, 'WriterThinkingEffort');
    const writerBakedEffort = extractEffortFromModelName(writerRoute.model);
    const writerRequestOptions = {
      ...(writerThinking && !writerBakedEffort ? { reasoning_effort: writerThinkingEffort || 'medium' } : {}),
    };
    const effectiveWriterRequestOptions = Object.keys(writerRequestOptions).length > 0 ? writerRequestOptions : null;

    return wrapLabQueue(writerRoute, () => callLlmProvider({
      ...sharedParams,
      system: writerSystem,
      user,
      jsonSchema,
      costRates: effectiveWriterCostRates,
      requestOptions: effectiveWriterRequestOptions,
      reasoningMode: Boolean(writerReasoning),
      reasoningBudget: 0,
      maxTokens: Number(primaryTokenCap || 0),
      route: {
        model: writerRoute.model, apiKey: writerRoute.apiKey, baseUrl: writerRoute.baseUrl,
        provider: writerRoute.provider, accessMode: writerRoute._registryEntry?.accessMode || '',
      },
      providerHealth,
      usageContext: {
        ...sharedParams.usageContext,
        writer_phase: true,
        research_model: primary.model,
      },
    }));
  }

  // Existing single-call behavior (jsonStrict: true or no jsonSchema)
  onModelResolved?.({ model: primary.model, provider: primary.provider, isFallback: false, accessMode: primary._registryEntry?.accessMode || 'api', thinking: Boolean(phaseThinking), webSearch: Boolean(phaseWebSearch) });
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
