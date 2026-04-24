import { configFloat } from '../shared/settingsAccessor.js';
import { toFloat } from '../shared/valueNormalizers.js';

function round(value, digits = 6) {
  return Number.parseFloat(Number(value || 0).toFixed(digits));
}

function normalizeModel(value) {
  return String(value || '').trim().toLowerCase();
}

function splitModelKey(value = '') {
  const raw = String(value || '').trim();
  const idx = raw.indexOf(':');
  if (idx <= 0) return { provider: '', model: raw };
  return { provider: raw.slice(0, idx), model: raw.slice(idx + 1) };
}

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase();
}

function inferProviderKind(provider = {}, model = '') {
  const token = String(provider?.id || provider?.type || provider?.name || '').trim().toLowerCase();
  if (token.includes('openai') || token === 'oai') return 'openai';
  if (token.includes('anthropic') || token.includes('claude')) return 'anthropic';
  if (token.includes('gemini') || token.includes('google')) return 'gemini';
  if (token.includes('deepseek')) return 'deepseek';
  if (token.includes('xai') || token.includes('grok')) return 'xai';
  const modelToken = normalizeModel(model);
  if (modelToken.startsWith('gpt-') || modelToken.startsWith('o')) return 'openai';
  if (modelToken.startsWith('claude-')) return 'anthropic';
  if (modelToken.startsWith('gemini-')) return 'gemini';
  if (modelToken.startsWith('deepseek-')) return 'deepseek';
  if (modelToken.startsWith('grok-')) return 'xai';
  return '';
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

function parseProviderRegistry(registryJson) {
  if (Array.isArray(registryJson)) return registryJson;
  if (typeof registryJson !== 'string' || !registryJson.trim()) return [];
  try {
    const parsed = JSON.parse(registryJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildRegistryPricingMap(registryJson) {
  const output = {};
  for (const provider of parseProviderRegistry(registryJson)) {
    const providerId = normalizeProvider(provider?.id);
    if (!providerId) continue;
    const models = Array.isArray(provider?.models) ? provider.models : [];
    for (const modelEntry of models) {
      const model = normalizeModel(modelEntry?.modelId || modelEntry?.id);
      if (!model) continue;
      const normalizedEntry = normalizePricingEntry({
        inputPer1M: modelEntry?.costInputPer1M,
        outputPer1M: modelEntry?.costOutputPer1M,
        cachedInputPer1M: modelEntry?.costCachedPer1M,
      });
      if (!normalizedEntry) continue;
      output[`${providerId}:${model}`] = normalizedEntry;
      const providerKind = inferProviderKind(provider, model);
      if (providerKind && !output[`${providerKind}:${model}`]) {
        output[`${providerKind}:${model}`] = normalizedEntry;
      }
      if (!output[model]) {
        output[model] = normalizedEntry;
      }
    }
  }
  return output;
}

function resolveModelPricingFromRegistry(rates = {}, model = '', provider = '') {
  const split = splitModelKey(model);
  const token = normalizeModel(split.model);
  const providerToken = normalizeProvider(provider || split.provider);
  if (!token) return null;
  const map = rates.registryModelPricing || {};
  if (!map || typeof map !== 'object') return null;
  const providerMatch = providerToken ? map[`${providerToken}:${token}`] : null;
  if (providerMatch) return providerMatch;
  return map[token] || null;
}

function hasRegistryPricing(rates = {}) {
  return Boolean(
    rates.registryModelPricing
    && typeof rates.registryModelPricing === 'object'
    && Object.keys(rates.registryModelPricing).length > 0
  );
}

function zeroRates() {
  return {
    inputPer1M: 0,
    outputPer1M: 0,
    cachedInputPer1M: 0,
  };
}

function directRates(rates = {}) {
  if (
    rates.inputPer1M == null
    && rates.outputPer1M == null
    && rates.cachedInputPer1M == null
    && rates.llmCostInputPer1M == null
    && rates.llmCostOutputPer1M == null
    && rates.llmCostCachedInputPer1M == null
  ) {
    return zeroRates();
  }
  return {
    inputPer1M: rates.inputPer1M != null ? toFloat(rates.inputPer1M, 0) : configFloat(rates, 'llmCostInputPer1M'),
    outputPer1M: rates.outputPer1M != null ? toFloat(rates.outputPer1M, 0) : configFloat(rates, 'llmCostOutputPer1M'),
    cachedInputPer1M: rates.cachedInputPer1M != null ? toFloat(rates.cachedInputPer1M, 0) : configFloat(rates, 'llmCostCachedInputPer1M')
  };
}

function resolveModelSpecificRates(rates = {}, model = '', provider = '') {
  const token = normalizeModel(model);
  if (!token) return zeroRates();

  const registryRates = resolveModelPricingFromRegistry(rates, model, provider);
  if (registryRates) {
    return registryRates;
  }

  if (hasRegistryPricing(rates)) return zeroRates();
  return directRates(rates);
}

export function normalizeCostRates(config = {}) {
  return {
    registryModelPricing: buildRegistryPricingMap(config.llmProviderRegistryJson),
    llmCostInputPer1M: config.inputPer1M != null ? toFloat(config.inputPer1M, 0) : configFloat(config, 'llmCostInputPer1M'),
    llmCostOutputPer1M: config.outputPer1M != null ? toFloat(config.outputPer1M, 0) : configFloat(config, 'llmCostOutputPer1M'),
    llmCostCachedInputPer1M: config.cachedInputPer1M != null ? toFloat(config.cachedInputPer1M, 0) : configFloat(config, 'llmCostCachedInputPer1M'),
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

// WHY: Cached-token fields live in different paths per provider —
//   OpenAI / Gemini:  usage.prompt_tokens_details.cached_tokens (nested)
//   Anthropic:        usage.cache_read_input_tokens
//   DeepSeek:         usage.prompt_cache_hit_tokens
// Direct fields + fallback are preferred to keep pre-normalized payloads working.
function resolveCachedInputTokens(usage, fallback) {
  const parse = (v) => {
    const n = Number.parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  const direct = parse(usage.cached_prompt_tokens) ?? parse(usage.cached_input_tokens);
  if (direct != null) return direct;
  const details = usage.prompt_tokens_details;
  if (details && typeof details === 'object') {
    const nested = parse(details.cached_tokens);
    if (nested != null) return nested;
  }
  const anthropicRead = parse(usage.cache_read_input_tokens);
  if (anthropicRead != null) return anthropicRead;
  const deepseekHit = parse(usage.prompt_cache_hit_tokens);
  if (deepseekHit != null) return deepseekHit;
  const fromFallback = parse(fallback.cachedPromptTokens);
  return fromFallback ?? 0;
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
  const cachedPromptTokens = Math.max(0, resolveCachedInputTokens(usage, fallback));

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

export function computeLlmCostUsd({ usage = {}, rates = {}, model = '', provider = '' }) {
  const normalizedRates = resolveModelSpecificRates(rates, model, provider);
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
