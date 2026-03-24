import { configFloat } from '../shared/settingsAccessor.js';
import { toFloat } from '../shared/valueNormalizers.js';

function round(value, digits = 6) {
  return Number.parseFloat(Number(value || 0).toFixed(digits));
}

function normalizeModel(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePricingEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const inputPer1M = toFloat(entry.inputPer1M ?? entry.input_per_1m ?? entry.input, NaN);
  const outputPer1M = toFloat(entry.outputPer1M ?? entry.output_per_1m ?? entry.output, NaN);
  const cachedInputPer1M = toFloat(
    entry.cachedInputPer1M ?? entry.cached_input_per_1m ?? entry.cached_input ?? entry.cached,
    NaN
  );
  if (!Number.isFinite(inputPer1M) && !Number.isFinite(outputPer1M) && !Number.isFinite(cachedInputPer1M)) {
    return null;
  }
  return {
    inputPer1M: Number.isFinite(inputPer1M) ? inputPer1M : 0,
    outputPer1M: Number.isFinite(outputPer1M) ? outputPer1M : 0,
    cachedInputPer1M: Number.isFinite(cachedInputPer1M) ? cachedInputPer1M : 0
  };
}

function resolveModelPricingMap(rates = {}) {
  const map = rates.llmModelPricingMap || rates.modelPricing || {};
  if (!map || typeof map !== 'object') return {};
  const output = {};
  for (const [rawModel, rawEntry] of Object.entries(map)) {
    const model = String(rawModel || '').trim();
    if (!model) continue;
    const normalizedEntry = normalizePricingEntry(rawEntry);
    if (!normalizedEntry) continue;
    output[model] = normalizedEntry;
  }
  return output;
}

function resolveModelPricingFromMap(rates = {}, model = '') {
  const token = normalizeModel(model);
  if (!token) return null;
  const map = resolveModelPricingMap(rates);
  let exact = null;
  let prefix = null;
  for (const [rawModel, rawEntry] of Object.entries(map)) {
    const modelToken = normalizeModel(rawModel);
    if (!modelToken) continue;
    if (token === modelToken) {
      exact = rawEntry;
      break;
    }
    if (token.startsWith(modelToken) || modelToken.startsWith(token)) {
      if (!prefix || modelToken.length > normalizeModel(prefix._model || '').length) {
        prefix = { ...rawEntry, _model: rawModel };
      }
    }
  }
  if (exact) return exact;
  if (prefix) {
    const { _model, ...rest } = prefix;
    return rest;
  }
  return null;
}

function resolveModelSpecificRates(rates = {}, model = '') {
  const token = normalizeModel(model);
  // WHY: inputPer1M alias is a non-registry passthrough from costRates objects
  const output = {
    inputPer1M: rates.inputPer1M != null ? toFloat(rates.inputPer1M, 1.25) : configFloat(rates, 'llmCostInputPer1M'),
    outputPer1M: rates.outputPer1M != null ? toFloat(rates.outputPer1M, 10) : configFloat(rates, 'llmCostOutputPer1M'),
    cachedInputPer1M: rates.cachedInputPer1M != null ? toFloat(rates.cachedInputPer1M, 0.125) : configFloat(rates, 'llmCostCachedInputPer1M')
  };

  const applyIfValid = (value, setter) => {
    const num = toFloat(value, -1);
    if (num >= 0) {
      setter(num);
    }
  };

  const fromMap = resolveModelPricingFromMap(rates, model);
  if (fromMap) {
    output.inputPer1M = toFloat(fromMap.inputPer1M, output.inputPer1M);
    output.outputPer1M = toFloat(fromMap.outputPer1M, output.outputPer1M);
    output.cachedInputPer1M = toFloat(fromMap.cachedInputPer1M, output.cachedInputPer1M);
    return output;
  }

  return output;
}

export function normalizeCostRates(config = {}) {
  return {
    llmCostInputPer1M: config.inputPer1M != null ? toFloat(config.inputPer1M, 1.25) : configFloat(config, 'llmCostInputPer1M'),
    llmCostOutputPer1M: config.outputPer1M != null ? toFloat(config.outputPer1M, 10) : configFloat(config, 'llmCostOutputPer1M'),
    llmCostCachedInputPer1M: config.cachedInputPer1M != null ? toFloat(config.cachedInputPer1M, 0.125) : configFloat(config, 'llmCostCachedInputPer1M'),
    llmModelPricingMap: resolveModelPricingMap(config)
  };
}

export function estimateTokensFromText(value) {
  const text = String(value || '');
  if (!text) {
    return 0;
  }
  // Conservative estimate for mixed JSON/text payloads.
  return Math.max(1, Math.ceil(text.length / 3.8));
}

export function normalizeUsage(usage = {}, fallback = {}) {
  const promptTokens = Math.max(
    0,
    Number.parseInt(
      String(
        usage.prompt_tokens ??
        usage.input_tokens ??
        fallback.promptTokens ??
        0
      ),
      10
    ) || 0
  );
  const completionTokens = Math.max(
    0,
    Number.parseInt(
      String(
        usage.completion_tokens ??
        usage.output_tokens ??
        fallback.completionTokens ??
        0
      ),
      10
    ) || 0
  );
  const cachedPromptTokens = Math.max(
    0,
    Number.parseInt(
      String(
        usage.cached_prompt_tokens ??
        usage.cached_input_tokens ??
        fallback.cachedPromptTokens ??
        0
      ),
      10
    ) || 0
  );

  const totalTokens = Math.max(
    promptTokens + completionTokens,
    Number.parseInt(
      String(usage.total_tokens ?? usage.totalTokens ?? fallback.totalTokens ?? 0),
      10
    ) || 0
  );

  return {
    promptTokens,
    completionTokens,
    cachedPromptTokens,
    totalTokens,
    estimated: Boolean(fallback.estimated)
  };
}

export function computeLlmCostUsd({ usage = {}, rates = {}, model = '' }) {
  const normalizedRates = resolveModelSpecificRates(rates, model);
  const inputTokens = Math.max(0, usage.promptTokens || 0);
  const outputTokens = Math.max(0, usage.completionTokens || 0);
  const cachedInputTokens = Math.max(0, usage.cachedPromptTokens || 0);
  const billableInputTokens = Math.max(0, inputTokens - cachedInputTokens);

  const inputCost = (billableInputTokens / 1_000_000) * normalizedRates.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * normalizedRates.outputPer1M;
  const cachedInputCost = (cachedInputTokens / 1_000_000) * normalizedRates.cachedInputPer1M;
  const totalCostUsd = inputCost + outputCost + cachedInputCost;

  return {
    costUsd: round(totalCostUsd, 8),
    components: {
      inputCost: round(inputCost, 8),
      outputCost: round(outputCost, 8),
      cachedInputCost: round(cachedInputCost, 8)
    }
  };
}
