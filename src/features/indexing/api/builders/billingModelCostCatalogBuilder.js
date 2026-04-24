import { providerFromModelToken } from '../../../../core/llm/providerMeta.js';

const PROVIDER_ORDER = ['openai', 'anthropic', 'google', 'deepseek', 'xai', 'generic'];

function round(value) {
  return Math.round((Number(value) || 0) * 100000000) / 100000000;
}

function num(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProviderId(provider = '', model = '') {
  const token = String(provider || '').trim().toLowerCase();
  if (token.includes('openai') || token === 'oai') return 'openai';
  if (token.includes('anthropic') || token.includes('claude')) return 'anthropic';
  if (token.includes('gemini') || token.includes('google')) return 'google';
  if (token.includes('deepseek')) return 'deepseek';
  if (token.includes('xai') || token.includes('grok')) return 'xai';
  const inferred = providerFromModelToken(model);
  if (inferred === 'gemini') return 'google';
  if (inferred === 'openai' || inferred === 'anthropic' || inferred === 'deepseek' || inferred === 'xai') return inferred;
  return 'generic';
}

function providerLabel(kind, explicit = '') {
  const label = String(explicit || '').trim();
  if (label) return label;
  return {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    deepseek: 'DeepSeek',
    xai: 'xAI',
    generic: 'Other',
  }[kind] || 'Other';
}

function normalizeRates(entry = {}) {
  return {
    input_per_1m: num(entry.inputPer1M ?? entry.input_per_1m ?? entry.input),
    output_per_1m: num(entry.outputPer1M ?? entry.output_per_1m ?? entry.output),
    cached_input_per_1m: num(
      entry.cachedInputPer1M
      ?? entry.cached_input_per_1m
      ?? entry.cached_input
      ?? entry.cached
    ),
  };
}

function registryPricingSource(provider = {}) {
  const id = String(provider?.id || '').trim();
  if (provider?.accessMode === 'lab' || id.startsWith('lab-')) return 'llm_lab';
  return 'provider_registry';
}

function parseRegistry(json) {
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeToken(value = '') {
  return String(value || '').trim().toLowerCase();
}

function registryProviderId(provider = {}, providerKind = 'generic') {
  return normalizeToken(provider?.id) || providerKind || 'generic';
}

function registryAccessMode(provider = {}) {
  const id = normalizeToken(provider?.id);
  return provider?.accessMode === 'lab' || id.startsWith('lab-') ? 'lab' : 'api';
}

function makeRowKey(providerId = '', model = '') {
  return `${normalizeToken(providerId)}:${String(model || '').trim()}`;
}

function splitModelKey(key) {
  const raw = String(key || '').trim();
  const idx = raw.indexOf(':');
  if (idx < 0) return { provider: '', model: raw };
  return {
    provider: raw.slice(0, idx),
    model: raw.slice(idx + 1),
  };
}

function emptyUsage() {
  return {
    calls: 0,
    cost_usd: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    cached_prompt_tokens: 0,
    sent_tokens: 0,
  };
}

function aggregateUsage(byModel = {}) {
  return Object.entries(byModel || {}).map(([key, row]) => {
    const { provider, model } = splitModelKey(key);
    const providerId = normalizeToken(provider);
    return {
      provider: providerId,
      provider_kind: normalizeProviderId(providerId, model),
      model,
      access_mode: providerId.startsWith('lab-') ? 'lab' : 'api',
      current: {
        calls: num(row.calls),
        cost_usd: num(row.cost_usd),
        prompt_tokens: num(row.prompt_tokens),
        completion_tokens: num(row.completion_tokens),
        cached_prompt_tokens: num(row.cached_prompt_tokens),
        sent_tokens: num(row.sent_tokens),
      },
    };
  }).filter((usage) => usage.model);
}

function buildRegistryRow({ provider = {}, providerKind = 'generic', providerId = 'generic', modelEntry = {} } = {}) {
  const model = String(modelEntry?.modelId || modelEntry?.id || '').trim();
  const providerName = String(provider?.name || '').trim();
  const rates = normalizeRates({
    inputPer1M: modelEntry?.costInputPer1M,
    outputPer1M: modelEntry?.costOutputPer1M,
    cachedInputPer1M: modelEntry?.costCachedPer1M,
  });
  const accessMode = registryAccessMode(provider);
  return {
    model,
    provider: providerId,
    provider_label: providerLabel(providerKind, providerName),
    provider_kind: providerKind,
    role: String(modelEntry?.role || 'primary'),
    access_modes: [accessMode],
    pricing_source: registryPricingSource(provider),
    registry_provider_id: providerId,
    registry_provider_label: providerLabel(providerKind, providerName),
    input_per_1m: rates.input_per_1m,
    output_per_1m: rates.output_per_1m,
    cached_input_per_1m: rates.cached_input_per_1m,
    max_context_tokens: num(modelEntry?.maxContextTokens) || null,
    max_output_tokens: num(modelEntry?.maxOutputTokens) || null,
    current: emptyUsage(),
  };
}

function mergeAccessModes(a = [], b = []) {
  return [...new Set([...a, ...b].filter(Boolean))].sort();
}

function rowIsLab(row) {
  return row.access_modes.includes('lab') || normalizeToken(row.provider).startsWith('lab-');
}

function usageMatchScore(usage, row) {
  if (usage.model !== row.model) return null;
  const usageProvider = normalizeToken(usage.provider);
  const rowProvider = normalizeToken(row.provider);
  const rowRegistryProvider = normalizeToken(row.registry_provider_id);
  const usageIsLab = usageProvider.startsWith('lab-');
  const isLabRow = rowIsLab(row);
  if (usageIsLab || isLabRow) {
    return usageProvider && (usageProvider === rowProvider || usageProvider === rowRegistryProvider) ? 0 : null;
  }
  if (usageProvider && (usageProvider === rowProvider || usageProvider === rowRegistryProvider)) return 0;
  if (usageProvider && usage.provider_kind === row.provider_kind) return 1;
  if (!usageProvider && normalizeProviderId('', usage.model) === row.provider_kind) return 2;
  return null;
}

function findUsageRow(rows, usage) {
  return [...rows.values()]
    .map((row) => ({ row, score: usageMatchScore(usage, row) }))
    .filter((candidate) => candidate.score !== null)
    .sort((a, b) => a.score - b.score || a.row.provider.localeCompare(b.row.provider))[0]?.row || null;
}

function applyUsage(row, usage) {
  row.access_modes = mergeAccessModes(row.access_modes, [usage.access_mode]);
  row.current = {
    calls: row.current.calls + usage.current.calls,
    cost_usd: row.current.cost_usd + usage.current.cost_usd,
    prompt_tokens: row.current.prompt_tokens + usage.current.prompt_tokens,
    completion_tokens: row.current.completion_tokens + usage.current.completion_tokens,
    cached_prompt_tokens: row.current.cached_prompt_tokens + usage.current.cached_prompt_tokens,
    sent_tokens: row.current.sent_tokens + usage.current.sent_tokens,
  };
}

function providerSortRank(kind) {
  const index = PROVIDER_ORDER.indexOf(kind);
  return index < 0 ? PROVIDER_ORDER.length : index;
}

export function buildBillingModelCostCatalog({ config = {}, rollup = {}, month = '' } = {}) {
  const rows = new Map();

  for (const provider of parseRegistry(config.llmProviderRegistryJson)) {
    const models = Array.isArray(provider?.models) ? provider.models : [];
    for (const modelEntry of models) {
      const model = String(modelEntry?.modelId || modelEntry?.id || '').trim();
      if (!model) continue;
      const providerKind = normalizeProviderId(provider?.id || provider?.type || provider?.name, model);
      const providerId = registryProviderId(provider, providerKind);
      rows.set(makeRowKey(providerId, model), buildRegistryRow({ provider, providerKind, providerId, modelEntry }));
    }
  }

  for (const usage of aggregateUsage(rollup.by_model)) {
    const row = findUsageRow(rows, usage);
    if (row) applyUsage(row, usage);
  }

  const providers = new Map();
  for (const row of rows.values()) {
    const id = row.provider || 'generic';
    const bucket = providers.get(id) || {
      id,
      label: row.provider_label || providerLabel(row.provider_kind),
      kind: row.provider_kind || 'generic',
      model_count: 0,
      used_model_count: 0,
      current_cost_usd: 0,
      highest_output_per_1m: 0,
      models: [],
    };
    bucket.models.push(row);
    bucket.model_count += 1;
    if (row.current.calls > 0) bucket.used_model_count += 1;
    bucket.current_cost_usd += row.current.cost_usd;
    bucket.highest_output_per_1m = Math.max(bucket.highest_output_per_1m, row.output_per_1m);
    providers.set(id, bucket);
  }

  const providerRows = [...providers.values()]
    .map((provider) => ({
      ...provider,
      current_cost_usd: round(provider.current_cost_usd),
      models: provider.models
        .map((row) => ({ ...row, current: { ...row.current, cost_usd: round(row.current.cost_usd) } }))
        .sort((a, b) => b.current.cost_usd - a.current.cost_usd || b.output_per_1m - a.output_per_1m || a.model.localeCompare(b.model)),
    }))
    .sort((a, b) => {
      const spend = b.current_cost_usd - a.current_cost_usd;
      if (spend !== 0) return spend;
      return providerSortRank(a.kind) - providerSortRank(b.kind) || a.label.localeCompare(b.label);
    });

  const allModels = providerRows.flatMap((provider) => provider.models);
  return {
    month,
    pricing_meta: {
      as_of: String(config.llmPricingAsOf || '').trim() || null,
      sources: config.llmPricingSources && typeof config.llmPricingSources === 'object'
        ? config.llmPricingSources
        : {},
    },
    totals: {
      providers: providerRows.length,
      models: allModels.length,
      used_models: allModels.filter((row) => row.current.calls > 0).length,
      current_cost_usd: round(allModels.reduce((sum, row) => sum + row.current.cost_usd, 0)),
      highest_output_per_1m: Math.max(0, ...allModels.map((row) => row.output_per_1m)),
    },
    providers: providerRows,
  };
}
