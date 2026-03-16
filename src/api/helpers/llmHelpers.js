import { normalizeModelToken, toInt, toFloat, hasKnownValue, parseCsvTokens } from './valueNormalizers.js';

export function llmProviderFromModel(model) {
  const token = normalizeModelToken(model);
  if (!token) return 'openai';
  if (token.startsWith('gemini')) return 'gemini';
  if (token.startsWith('deepseek')) return 'deepseek';
  return 'openai';
}

export function classifyLlmTracePhase(purpose = '', routeRole = '') {
  const reason = String(purpose || '').trim().toLowerCase();
  const role = String(routeRole || '').trim().toLowerCase();
  if (role === 'extract') return 'extract';
  if (role === 'validate') return 'validate';
  if (role === 'write') return 'write';
  if (role === 'plan') return 'plan';
  if (
    reason.includes('discovery_planner') ||
    reason.includes('search_profile') ||
    reason.includes('searchprofile')
  ) {
    return 'phase_02';
  }
  if (
    reason.includes('serp') ||
    reason.includes('triage') ||
    reason.includes('rerank') ||
    reason.includes('discovery_query_plan')
  ) {
    return 'phase_03';
  }
  if (reason.includes('extract')) return 'extract';
  if (reason.includes('validate') || reason.includes('verify')) return 'validate';
  if (reason.includes('write') || reason.includes('summary')) return 'write';
  if (reason.includes('planner') || reason.includes('plan')) return 'plan';
  return 'other';
}

export function resolveLlmRoleDefaults(cfg = {}) {
  return {
    plan: String(cfg.llmModelPlan || '').trim(),
    fast: String(cfg.llmModelFast || '').trim(),
    triage: String(cfg.llmModelTriage || cfg.cortexModelRerankFast || cfg.cortexModelSearchFast || cfg.llmModelFast || '').trim(),
    reasoning: String(cfg.llmModelReasoning || '').trim(),
    extract: String(cfg.llmModelExtract || '').trim(),
    validate: String(cfg.llmModelValidate || '').trim(),
    write: String(cfg.llmModelWrite || '').trim()
  };
}

export function resolveLlmKnobDefaults(cfg = {}) {
  const modelDefaults = resolveLlmRoleDefaults(cfg);
  const tokenDefaults = {
    plan: toInt(cfg.llmMaxOutputTokensPlan, toInt(cfg.llmMaxOutputTokens, 1200)),
    fast: toInt(cfg.llmMaxOutputTokensFast, toInt(cfg.llmMaxOutputTokensPlan, 1200)),
    triage: toInt(cfg.llmMaxOutputTokensTriage, toInt(cfg.llmMaxOutputTokensFast, 1200)),
    reasoning: toInt(cfg.llmMaxOutputTokensReasoning, toInt(cfg.llmReasoningBudget, 4096)),
    extract: toInt(cfg.llmMaxOutputTokensExtract, toInt(cfg.llmExtractMaxTokens, 1200)),
    validate: toInt(cfg.llmMaxOutputTokensValidate, toInt(cfg.llmMaxOutputTokens, 1200)),
    write: toInt(cfg.llmMaxOutputTokensWrite, toInt(cfg.llmMaxOutputTokens, 1200))
  };
  return {
    phase_02_planner: {
      model: String(cfg.llmModelPlan || '').trim(),
      token_cap: tokenDefaults.plan
    },
    phase_03_triage: {
      model: String(cfg.llmModelTriage || '').trim(),
      token_cap: tokenDefaults.triage
    },
    fast_pass: {
      model: modelDefaults.fast,
      token_cap: tokenDefaults.fast
    },
    reasoning_pass: {
      model: modelDefaults.reasoning,
      token_cap: tokenDefaults.reasoning
    },
    extract_role: {
      model: modelDefaults.extract,
      token_cap: tokenDefaults.extract
    },
    validate_role: {
      model: modelDefaults.validate,
      token_cap: tokenDefaults.validate
    },
    write_role: {
      model: modelDefaults.write,
      token_cap: tokenDefaults.write
    },
    fallback_plan: {
      model: String(cfg.llmPlanFallbackModel || '').trim(),
      token_cap: toInt(cfg.llmMaxOutputTokensPlanFallback, tokenDefaults.plan)
    },
    fallback_extract: {
      model: String(cfg.llmExtractFallbackModel || '').trim(),
      token_cap: toInt(cfg.llmMaxOutputTokensExtractFallback, tokenDefaults.extract)
    },
    fallback_validate: {
      model: String(cfg.llmValidateFallbackModel || '').trim(),
      token_cap: toInt(cfg.llmMaxOutputTokensValidateFallback, tokenDefaults.validate)
    },
    fallback_write: {
      model: String(cfg.llmWriteFallbackModel || '').trim(),
      token_cap: toInt(cfg.llmMaxOutputTokensWriteFallback, tokenDefaults.write)
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
  if (modelToken.startsWith('deepseek-chat')) {
    return {
      input_per_1m: toFloat(cfg?.llmCostInputPer1MDeepseekChat, defaultRates.input_per_1m),
      output_per_1m: toFloat(cfg?.llmCostOutputPer1MDeepseekChat, defaultRates.output_per_1m),
      cached_input_per_1m: toFloat(cfg?.llmCostCachedInputPer1MDeepseekChat, defaultRates.cached_input_per_1m)
    };
  }
  if (modelToken.startsWith('deepseek-reasoner')) {
    return {
      input_per_1m: toFloat(cfg?.llmCostInputPer1MDeepseekReasoner, defaultRates.input_per_1m),
      output_per_1m: toFloat(cfg?.llmCostOutputPer1MDeepseekReasoner, defaultRates.output_per_1m),
      cached_input_per_1m: toFloat(cfg?.llmCostCachedInputPer1MDeepseekReasoner, defaultRates.cached_input_per_1m)
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
  const candidates = [
    cfg.llmModelPlan,
    cfg.llmModelFast,
    cfg.llmModelTriage,
    cfg.llmModelExtract,
    cfg.llmModelReasoning,
    cfg.llmModelValidate,
    cfg.llmModelWrite,
    cfg.cortexModelFast,
    cfg.cortexModelSearchFast,
    cfg.cortexModelRerankFast,
    cfg.cortexModelSearchDeep,
    cfg.cortexModelReasoningDeep,
    cfg.cortexModelVision,
    cfg.llmPlanFallbackModel,
    cfg.llmExtractFallbackModel,
    cfg.llmValidateFallbackModel,
    cfg.llmWriteFallbackModel,
    ...parseCsvTokens(cfg.llmModelCatalog || '')
  ];
  if (cfg.llmModelPricingMap && typeof cfg.llmModelPricingMap === 'object') {
    candidates.push(...Object.keys(cfg.llmModelPricingMap));
  }
  candidates.push(
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'deepseek-chat',
    'deepseek-reasoner'
  );
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
