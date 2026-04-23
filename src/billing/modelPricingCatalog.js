function toNum(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEntry(entry = {}) {
  return {
    inputPer1M: toNum(entry.inputPer1M ?? entry.input_per_1m ?? entry.input, 0),
    outputPer1M: toNum(entry.outputPer1M ?? entry.output_per_1m ?? entry.output, 0),
    cachedInputPer1M: toNum(
      entry.cachedInputPer1M
      ?? entry.cached_input_per_1m
      ?? entry.cached_input
      ?? entry.cached,
      0
    )
  };
}

export const LLM_PRICING_AS_OF = '2026-04-23';

export const LLM_PRICING_SOURCES = {
  openai: 'https://openai.com/api/pricing/',
  anthropic: 'https://www.anthropic.com/pricing',
  gemini: 'https://ai.google.dev/gemini-api/docs/pricing',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing'
};

const CANONICAL_MODEL_PRICING = {
  'gpt-5': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125 },
  'gpt-5-mini': { inputPer1M: 0.25, outputPer1M: 2, cachedInputPer1M: 0.025 },
  'gpt-5-nano': { inputPer1M: 0.05, outputPer1M: 0.4, cachedInputPer1M: 0.005 },
  'gpt-5.1': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125 },
  'gpt-5.1-mini': { inputPer1M: 0.25, outputPer1M: 2, cachedInputPer1M: 0.025 },
  'gpt-5.1-nano': { inputPer1M: 0.05, outputPer1M: 0.4, cachedInputPer1M: 0.005 },
  'gpt-5.2': { inputPer1M: 1.75, outputPer1M: 14, cachedInputPer1M: 0.175 },
  'gpt-5.2-mini': { inputPer1M: 0.35, outputPer1M: 2.8, cachedInputPer1M: 0.035 },
  'gpt-5.2-nano': { inputPer1M: 0.07, outputPer1M: 0.56, cachedInputPer1M: 0.007 },
  'gpt-5.2-pro': { inputPer1M: 21, outputPer1M: 168, cachedInputPer1M: 2.1 },
  'gpt-5.3-codex': { inputPer1M: 1.75, outputPer1M: 14, cachedInputPer1M: 0.175 },
  'gpt-5.3-codex-spark': { inputPer1M: 0, outputPer1M: 0, cachedInputPer1M: 0 },
  'gpt-5.4': { inputPer1M: 2.5, outputPer1M: 15, cachedInputPer1M: 0.25 },
  'gpt-5.4-mini': { inputPer1M: 0.75, outputPer1M: 4.5, cachedInputPer1M: 0.075 },
  'gpt-5.5': { inputPer1M: 5, outputPer1M: 30, cachedInputPer1M: 0.5 },
  'gpt-5-chat-latest': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125 },
  'gpt-5.1-chat-latest': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125 },
  'gpt-5.2-chat-latest': { inputPer1M: 1.75, outputPer1M: 14, cachedInputPer1M: 0.175 },
  'gpt-5-codex': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125 },
  'gpt-5.1-codex': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125 },
  'gpt-5.2-codex': { inputPer1M: 1.75, outputPer1M: 14, cachedInputPer1M: 0.175 },
  'gpt-4.1': { inputPer1M: 2, outputPer1M: 8, cachedInputPer1M: 0.5 },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6, cachedInputPer1M: 0.1 },
  'gpt-4.1-nano': { inputPer1M: 0.1, outputPer1M: 0.4, cachedInputPer1M: 0.025 },
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10, cachedInputPer1M: 1.25 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075 },
  'gemini-3.1-pro-preview': { inputPer1M: 2, outputPer1M: 12, cachedInputPer1M: 0.2 },
  'gemini-3.1-flash-lite-preview': { inputPer1M: 0.25, outputPer1M: 1.5, cachedInputPer1M: 0.025 },
  'gemini-3-flash-preview': { inputPer1M: 0.5, outputPer1M: 3, cachedInputPer1M: 0.05 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10, cachedInputPer1M: 0.125 },
  'gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5, cachedInputPer1M: 0.03 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.1, outputPer1M: 0.4, cachedInputPer1M: 0.01 },
  'claude-opus-4-6': { inputPer1M: 5, outputPer1M: 25, cachedInputPer1M: 0.5 },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15, cachedInputPer1M: 0.3 },
  'claude-opus-4-5': { inputPer1M: 5, outputPer1M: 25, cachedInputPer1M: 0.5 },
  'claude-sonnet-4-5': { inputPer1M: 3, outputPer1M: 15, cachedInputPer1M: 0.3 },
  'claude-opus-4-1': { inputPer1M: 15, outputPer1M: 75, cachedInputPer1M: 1.5 },
  'claude-haiku-4-5': { inputPer1M: 1, outputPer1M: 5, cachedInputPer1M: 0.1 },
  'deepseek-chat': { inputPer1M: 0.27, outputPer1M: 1.1, cachedInputPer1M: 0.07 },
  'deepseek-reasoner': { inputPer1M: 0.55, outputPer1M: 2.19, cachedInputPer1M: 0.14 }
};

const ALIAS_MODEL_PRICING = {
  'gpt-5-low': CANONICAL_MODEL_PRICING['gpt-5-mini'],
  'gpt-5.1-low': CANONICAL_MODEL_PRICING['gpt-5.1-mini'],
  'gpt-5.1-high': CANONICAL_MODEL_PRICING['gpt-5.1'],
  'gpt-5.2-high': CANONICAL_MODEL_PRICING['gpt-5.2'],
  'gpt-5.2-xhigh': CANONICAL_MODEL_PRICING['gpt-5.2-pro']
};

export function buildDefaultModelPricingMap() {
  const output = {};
  for (const [model, entry] of Object.entries(CANONICAL_MODEL_PRICING)) {
    output[model] = normalizeEntry(entry);
  }
  for (const [model, entry] of Object.entries(ALIAS_MODEL_PRICING)) {
    output[model] = normalizeEntry(entry);
  }
  return output;
}

export function mergeModelPricingMaps(baseMap = {}, overrideMap = {}) {
  const merged = {};
  for (const [model, entry] of Object.entries(baseMap || {})) {
    merged[String(model || '').trim()] = normalizeEntry(entry);
  }
  for (const [model, entry] of Object.entries(overrideMap || {})) {
    const token = String(model || '').trim();
    if (!token) continue;
    merged[token] = normalizeEntry(entry);
  }
  return merged;
}
