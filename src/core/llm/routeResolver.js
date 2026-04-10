// WHY: Unified route resolver — registry is SSOT for model→provider routing.
// Composite keys ("providerId:modelId") disambiguate same model across providers.
// Provider `type` tells the dispatcher HOW to call (openai-compatible, anthropic, etc.).

const EMPTY_LOOKUP = Object.freeze({
  providers: new Map(),
  modelIndex: new Map(),
  compositeIndex: new Map(),
});

function parseRegistry(registryJson) {
  if (Array.isArray(registryJson)) return registryJson;
  if (typeof registryJson !== 'string' || !registryJson.trim()) return [];
  try {
    const parsed = JSON.parse(registryJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildResolvedRoute(provider, model) {
  const { id: modelEntryId, modelId, role, accessMode: modelAccessMode, costInputPer1M, costOutputPer1M, costCachedPer1M, maxContextTokens, maxOutputTokens, ...extraFields } = model;
  // WHY: accessMode is SSOT for lab vs API — from registry declaration, not URL heuristics.
  // Model-level accessMode takes precedence, then provider-level, then default 'api'.
  const accessMode = String(modelAccessMode || provider.accessMode || 'api').trim();
  return {
    providerId: provider.id,
    providerName: provider.name,
    providerType: provider.type || 'openai-compatible',
    accessMode,
    modelId,
    baseUrl: provider.baseUrl || '',
    apiKey: provider.apiKey || '',
    costs: {
      inputPer1M: Number(costInputPer1M || 0),
      outputPer1M: Number(costOutputPer1M || 0),
      cachedPer1M: Number(costCachedPer1M || 0),
    },
    tokenProfile: {
      maxContextTokens: maxContextTokens ?? null,
      maxOutputTokens: maxOutputTokens ?? null,
    },
    modelMeta: { role, ...extraFields },
  };
}

export function buildRegistryLookup(registryJson) {
  const entries = parseRegistry(registryJson);
  if (!entries.length) return EMPTY_LOOKUP;

  const providers = new Map();
  const modelIndex = new Map();
  const compositeIndex = new Map();

  for (const entry of entries) {
    const id = String(entry?.id || '').trim();
    if (!id) continue;

    providers.set(id, {
      id,
      name: entry.name || '',
      type: entry.type || 'openai-compatible',
      baseUrl: entry.baseUrl || '',
      apiKey: entry.apiKey || '',
    });

    const models = Array.isArray(entry.models) ? entry.models : [];
    for (const model of models) {
      const modelId = String(model?.modelId || '').trim();
      if (!modelId) continue;

      const resolved = buildResolvedRoute(entry, model);

      const compositeKey = `${id}:${modelId}`;
      compositeIndex.set(compositeKey, resolved);

      const existing = modelIndex.get(modelId) || [];
      existing.push(resolved);
      modelIndex.set(modelId, existing);
    }
  }

  return { providers, modelIndex, compositeIndex };
}

// WHY: Composite keys ("providerId:modelId") are a routing concern.
// Display and storage should always use the bare model ID.
export function stripCompositeKey(modelKey = '') {
  const key = String(modelKey || '').trim();
  const colonIdx = key.indexOf(':');
  return colonIdx > 0 ? key.slice(colonIdx + 1) : key;
}

export function resolveModelFromRegistry(lookup, modelKey) {
  if (!lookup || !lookup.compositeIndex) return null;
  const key = String(modelKey || '').trim();
  if (!key) return null;

  // Composite key: "providerId:modelId"
  const colonIndex = key.indexOf(':');
  if (colonIndex > 0) {
    return lookup.compositeIndex.get(key) || null;
  }

  // Bare key: first entry in modelIndex
  const routes = lookup.modelIndex.get(key);
  if (!routes || !routes.length) return null;
  return routes[0];
}

export function resolveModelCosts(lookup, modelKey, fallbackRates) {
  const defaultRates = { inputPer1M: 0, outputPer1M: 0, cachedInputPer1M: 0 };
  const route = resolveModelFromRegistry(lookup, modelKey);
  if (!route) return fallbackRates || defaultRates;
  return {
    inputPer1M: route.costs.inputPer1M,
    outputPer1M: route.costs.outputPer1M,
    cachedInputPer1M: route.costs.cachedPer1M,
  };
}

export function resolveModelTokenProfile(lookup, modelKey) {
  const route = resolveModelFromRegistry(lookup, modelKey);
  if (!route) return null;
  return { ...route.tokenProfile };
}
