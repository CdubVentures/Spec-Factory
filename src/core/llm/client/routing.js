import { callOpenAI } from './openaiClient.js';
import { resolveModelFromRegistry } from '../routeResolver.js';
import { configInt, configBool, configValue } from '../../../shared/settingsAccessor.js';

// WHY: All roles alias to plan model via configPostMerge. ROLE_KEYS only needs
// model + fallbackModel. Provider/baseUrl/apiKey resolved via registry or bootstrap.
const ROLE_KEYS = {
  plan: { model: 'llmModelPlan', fallbackModel: 'llmPlanFallbackModel' },
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

function normalizeProvider(value) {
  const token = normalized(value).toLowerCase();
  if (token === 'openai' || token === 'deepseek' || token === 'gemini') {
    return token;
  }
  return '';
}

// TODO: consolidate with routeResolver.js — registry should be sole provider authority
function providerFromModel(value) {
  const token = normalized(value).toLowerCase();
  if (!token) {
    return '';
  }
  if (token.startsWith('gemini')) {
    return 'gemini';
  }
  if (token.startsWith('deepseek')) {
    return 'deepseek';
  }
  return 'openai';
}

// WHY: No process.env reads at runtime — config object already has keys from configBuilder.
function bootstrapApiKey(config = {}, provider = '') {
  if (provider === 'gemini') return normalized(String(configValue(config, 'geminiApiKey')));
  if (provider === 'deepseek') return normalized(String(configValue(config, 'deepseekApiKey')));
  if (provider === 'anthropic') return normalized(String(configValue(config, 'anthropicApiKey')));
  // WHY: llmApiKey is not a registry key — legacy bootstrap fallback only
  return normalized(String(configValue(config, 'openaiApiKey'))) || normalized(config.llmApiKey || '');
}

function defaultBaseUrl(provider = '') {
  if (provider === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/openai';
  if (provider === 'deepseek') return 'https://api.deepseek.com';
  if (provider === 'anthropic') return 'https://api.anthropic.com';
  return 'https://api.openai.com';
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
      apiKey: resolved.apiKey || bootstrapApiKey(config, resolved.providerType),
      _registryEntry: resolved,
    };
  }

  // Last resort: infer provider from model name, use bootstrap keys
  const inferred = providerFromModel(modelKey);
  return {
    role,
    provider: inferred,
    model: modelKey,
    baseUrl: defaultBaseUrl(inferred),
    apiKey: bootstrapApiKey(config, inferred),
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
      apiKey: resolved.apiKey || bootstrapApiKey(config, resolved.providerType),
      _registryEntry: resolved,
    };
  }

  // Last resort: infer provider from model name, use bootstrap keys
  const inferred = providerFromModel(model);
  return {
    role,
    provider: inferred,
    model,
    baseUrl: defaultBaseUrl(inferred),
    apiKey: bootstrapApiKey(config, inferred),
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
// Dead per-role token keys (llmMaxOutputTokensExtract etc.) were removed — they
// were always undefined and fell through to llmMaxOutputTokens.
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
      const roleProvider = normalizeProvider(route.provider || providerFromModel(route.model));
      const overrideProvider = providerFromModel(overrideModel);
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
    // Override model not in registry — infer provider from model name
    delete route._registryEntry;
    route.model = overrideModel;
    const inferred = providerFromModel(overrideModel);
    route.provider = inferred;
    route.baseUrl = defaultBaseUrl(inferred);
    route.apiKey = bootstrapApiKey(config, inferred);
  }
  return route;
}

export function resolveLlmFallbackRoute(config = {}, { reason = '', role = '', modelOverride = '', phase = '' } = {}) {
  const resolvedRole = role || routeRoleFromReason(reason);
  const fallback = fallbackRouteForRole(config, resolvedRole);
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
  // WHY: llmApiKey is not a registry key — legacy bootstrap fallback
  if (normalized(config.llmApiKey || String(configValue(config, 'openaiApiKey')))) {
    return true;
  }
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
  const roles = ['plan', 'extract', 'validate', 'write'];
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
  logger
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
  const effectiveRequestOptions = (
    requestOptions && typeof requestOptions === 'object'
      ? requestOptions
      : (usageContext?.request_options && typeof usageContext.request_options === 'object'
          ? usageContext.request_options
          : null)
  );

  // WHY: Reasoning + tokens auto-resolved from config via phase. Callers never set these.
  // The LLM Settings panel is the SSOT — configPostMerge writes _resolved${Phase}* keys.
  const reasoningMode = resolvePhaseReasoning(config, phase);

  const primaryTokenCap = roleTokenCap(config, resolvedRole, reason, false, primary._registryEntry);
  const fallbackTokenCap = roleTokenCap(config, resolvedRole, reason, true, fallback?._registryEntry);
  const primaryReasoningBudget = roleReasoningCap(config, resolvedRole, reason, false);
  const fallbackReasoningBudget = roleReasoningCap(config, resolvedRole, reason, true);
  // WHY: Phase-level token cap from panel takes precedence over role-level cap.
  const phaseTokenCap = resolvePhaseTokenCap(config, phase);
  const resolvedMaxTokens = phaseTokenCap > 0
    ? Math.min(phaseTokenCap, primaryTokenCap || phaseTokenCap)
    : primaryTokenCap;
  const resolvedReasoningBudget = primaryReasoningBudget;

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
      developer_mode: usageContext?.developer_mode !== undefined
        ? Boolean(usageContext.developer_mode)
        : Boolean(config?.runtimeTraceLlmPayloads),
      model_token_profile_map: config?.llmModelOutputTokenMap || {},
      default_output_token_cap: primaryTokenCap,
      deepseek_default_max_output_tokens: Math.max(
        toIntToken(config?.deepseekChatMaxOutputMaximum, 4096),
        toIntToken(config?.deepseekReasonerMaxOutputMaximum, 8192)
      )
    },
    costRates,
    onUsage,
    reasoningMode: Boolean(reasoningMode),
    reasoningBudget: Number(resolvedReasoningBudget || 0),
    maxTokens: Number(resolvedMaxTokens || 0),
    timeoutMs,
    logger
  };

  // Cost flow-through: prefer registry costs over flat config keys
  const effectiveCostRates = buildEffectiveCostRates(primary._registryEntry, costRates);

  const effectiveSharedParams = { ...sharedParams, costRates: effectiveCostRates };

  // Dispatch-type seam: cortex providers use a different transport
  if (primary._registryEntry?.providerType === 'cortex') {
    throw new Error('cortex provider dispatch not yet re-implemented — route via openai-compatible provider or remove cortex entry');
  }

  try {
    return await callOpenAI({
      ...effectiveSharedParams,
      model: primary.model,
      apiKey: primary.apiKey,
      baseUrl: primary.baseUrl,
      provider: primary.provider
    });
  } catch (error) {
    if (!fallback) {
      throw error;
    }
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
    const fallbackMaxTokens = phaseTokenCap > 0
      ? Math.min(phaseTokenCap, fallbackTokenCap || phaseTokenCap)
      : fallbackTokenCap;
    return callOpenAI({
      ...sharedParams,
      costRates: effectiveFallbackCostRates,
      model: fallback.model,
      apiKey: fallback.apiKey,
      baseUrl: fallback.baseUrl,
      provider: fallback.provider,
      reasoningBudget: Number(fallbackReasoningBudget || 0),
      maxTokens: Number(fallbackMaxTokens || 0),
      usageContext: {
        ...sharedParams.usageContext,
        default_output_token_cap: fallbackTokenCap,
        fallback_attempt: true,
        fallback_from_model: primary.model || null
      }
    });
  }
}
