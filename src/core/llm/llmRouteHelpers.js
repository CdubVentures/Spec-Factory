import { normalizeModelToken, toInt, toFloat, hasKnownValue, parseCsvTokens } from '../../shared/valueNormalizers.js';
import { resolveModelFromRegistry, resolveModelCosts, resolveModelTokenProfile } from './routeResolver.js';
import { providerFromModelToken } from './providerMeta.js';
import { buildDefaultModelPricingMap } from '../../billing/modelPricingCatalog.js';

export function llmProviderFromModel(model, registryLookup) {
  // Registry-first: if registry knows this model, use its providerType
  if (registryLookup) {
    const resolved = resolveModelFromRegistry(registryLookup, normalizeModelToken(model));
    if (resolved?.providerType) return resolved.providerType;
  }
  // Prefix fallback via shared provider metadata
  return providerFromModelToken(model) || 'openai';
}

export function resolveLlmRoleDefaults(cfg = {}) {
  const plan = String(cfg.llmModelPlan || '').trim();
  return {
    plan,
    triage: plan,
    reasoning: String(cfg.llmModelReasoning || '').trim(),
    extract: plan,
    write: plan
  };
}

export function resolveLlmKnobDefaults(cfg = {}) {
  const modelDefaults = resolveLlmRoleDefaults(cfg);
  const planTokenDefault = toInt(cfg.llmMaxOutputTokensPlan, toInt(cfg.llmMaxOutputTokens, 1200));
  const tokenDefaults = {
    plan: planTokenDefault,
    triage: toInt(cfg.llmMaxOutputTokensTriage, planTokenDefault),
    reasoning: toInt(cfg.llmMaxOutputTokensReasoning, toInt(cfg.llmReasoningBudget, 4096))
  };
  return {
    'llm:search-planner': {
      model: modelDefaults.plan,
      token_cap: tokenDefaults.plan
    },
    'llm:triage': {
      model: modelDefaults.plan,
      token_cap: tokenDefaults.triage
    },
    reasoning_pass: {
      model: modelDefaults.reasoning,
      token_cap: tokenDefaults.reasoning
    },
    // WHY: Fallback inherits the phase's token cap from the primary. Surface
    // the plan-phase cap here so knob-defaults consumers see the same ceiling.
    fallback_plan: {
      model: String(cfg.llmPlanFallbackModel || '').trim(),
      token_cap: tokenDefaults.plan
    }
  };
}

export function resolvePricingForModel(cfg, model) {
  const modelToken = normalizeModelToken(model);
  const defaultRates = {
    input_per_1m: toFloat(cfg?.llmCostInputPer1M, 1.25),
    output_per_1m: toFloat(cfg?.llmCostOutputPer1M, 10),
    cached_input_per_1m: toFloat(cfg?.llmCostCachedInputPer1M, 0.125)
  };
  if (!modelToken) {
    return defaultRates;
  }
  // Registry-first: try registry costs before pricingMap/flat keys
  if (cfg?._registryLookup) {
    const registryCosts = resolveModelCosts(cfg._registryLookup, modelToken);
    if (registryCosts && (registryCosts.inputPer1M > 0 || registryCosts.outputPer1M > 0)) {
      return {
        input_per_1m: registryCosts.inputPer1M,
        output_per_1m: registryCosts.outputPer1M,
        cached_input_per_1m: registryCosts.cachedInputPer1M || 0,
      };
    }
  }
  const pricingMap = (cfg?.llmModelPricingMap && typeof cfg.llmModelPricingMap === 'object')
    ? cfg.llmModelPricingMap
    : {};
  let selected = null;
  let selectedKey = '';
  for (const [rawModel, rawRates] of Object.entries(pricingMap)) {
    const key = normalizeModelToken(rawModel);
    if (!key || !rawRates || typeof rawRates !== 'object') continue;
    const isMatch = modelToken === key || modelToken.startsWith(key) || key.startsWith(modelToken);
    if (!isMatch) continue;
    if (!selected || key.length > selectedKey.length) {
      selected = rawRates;
      selectedKey = key;
    }
  }
  if (selected) {
    return {
      input_per_1m: toFloat(selected.inputPer1M ?? selected.input_per_1m ?? selected.input, defaultRates.input_per_1m),
      output_per_1m: toFloat(selected.outputPer1M ?? selected.output_per_1m ?? selected.output, defaultRates.output_per_1m),
      cached_input_per_1m: toFloat(
        selected.cachedInputPer1M ?? selected.cached_input_per_1m ?? selected.cached_input ?? selected.cached,
        defaultRates.cached_input_per_1m
      )
    };
  }
  return defaultRates;
}

export function resolveTokenProfileForModel(cfg, model) {
  const modelToken = normalizeModelToken(model);
  const defaultFallback = {
    default_output_tokens: toInt(cfg?.llmMaxOutputTokens, 1200),
    max_output_tokens: toInt(cfg?.llmMaxTokens, 16384)
  };
  if (!modelToken) {
    return defaultFallback;
  }
  // Registry-first: try registry token profile before outputTokenMap/flat keys
  if (cfg?._registryLookup) {
    const registryProfile = resolveModelTokenProfile(cfg._registryLookup, modelToken);
    if (registryProfile && registryProfile.maxOutputTokens > 0) {
      return {
        default_output_tokens: registryProfile.maxContextTokens > 0
          ? Math.min(defaultFallback.default_output_tokens, registryProfile.maxOutputTokens)
          : defaultFallback.default_output_tokens,
        max_output_tokens: registryProfile.maxOutputTokens,
      };
    }
  }
  const map = (cfg?.llmModelOutputTokenMap && typeof cfg.llmModelOutputTokenMap === 'object')
    ? cfg.llmModelOutputTokenMap
    : {};
  let selected = null;
  let selectedKey = '';
  for (const [rawModel, rawProfile] of Object.entries(map)) {
    const key = normalizeModelToken(rawModel);
    if (!key || !rawProfile || typeof rawProfile !== 'object') continue;
    const isMatch = modelToken === key || modelToken.startsWith(key) || key.startsWith(modelToken);
    if (!isMatch) continue;
    if (!selected || key.length > selectedKey.length) {
      selected = rawProfile;
      selectedKey = key;
    }
  }
  const defaultOutput = toInt(
    selected?.defaultOutputTokens ?? selected?.default_output_tokens,
    defaultFallback.default_output_tokens
  );
  const maxOutput = toInt(
    selected?.maxOutputTokens ?? selected?.max_output_tokens,
    defaultFallback.max_output_tokens
  );
  return {
    default_output_tokens: defaultOutput > 0 ? defaultOutput : defaultFallback.default_output_tokens,
    max_output_tokens: maxOutput > 0 ? maxOutput : defaultFallback.max_output_tokens
  };
}

export function collectLlmModels(cfg = {}) {
  // WHY: Include actively configured models + all canonical catalog models.
  const candidates = [
    cfg.llmModelPlan,
    cfg.llmModelReasoning,
    cfg.llmPlanFallbackModel,
    cfg.llmReasoningFallbackModel,
    ...parseCsvTokens(cfg.llmModelCatalog || ''),
    ...Object.keys(buildDefaultModelPricingMap()),
  ];
  const seen = new Set();
  const rows = [];
  for (const model of candidates) {
    const value = String(model || '').trim();
    if (!value) continue;
    const token = normalizeModelToken(value);
    if (seen.has(token)) continue;
    seen.add(token);
    rows.push(value);
  }
  rows.sort((a, b) => a.localeCompare(b));
  return rows;
}

export function deriveTrafficLightCounts({ summary = {}, provenance = {} } = {}, buildTrafficLightFn = null) {
  const fromSummary = summary?.traffic_light?.counts
    || summary?.traffic_light
    || summary?.trafficLight?.counts
    || summary?.trafficLight;
  if (fromSummary && typeof fromSummary === 'object') {
    const green = toInt(fromSummary.green, 0);
    const yellow = toInt(fromSummary.yellow, 0);
    const red = toInt(fromSummary.red, 0);
    if (green > 0 || yellow > 0 || red > 0) {
      return { green, yellow, red };
    }
  }

  if (buildTrafficLightFn) {
    try {
      const computed = buildTrafficLightFn({
        fieldOrder: Object.keys(provenance || {}),
        provenance,
        fieldReasoning: summary?.field_reasoning || {}
      });
      const green = toInt(computed?.counts?.green, 0);
      const yellow = toInt(computed?.counts?.yellow, 0);
      const red = toInt(computed?.counts?.red, 0);
      if (green > 0 || yellow > 0 || red > 0) {
        return { green, yellow, red };
      }
    } catch {
      // non-fatal, fall back to simple bucket counts below
    }
  }

  const skip = new Set(['id', 'brand', 'model', 'base_model', 'category']);
  let green = 0;
  let yellow = 0;
  let red = 0;
  for (const [field, row] of Object.entries(provenance || {})) {
    if (skip.has(field)) continue;
    const value = row?.value;
    const known = hasKnownValue(value);
    const meets = row?.meets_pass_target === true;
    if (known && meets) green += 1;
    else if (known) yellow += 1;
    else red += 1;
  }
  return { green, yellow, red };
}
