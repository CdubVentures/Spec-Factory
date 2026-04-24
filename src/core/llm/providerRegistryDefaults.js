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

function modelKey(model = {}) {
  return String(model?.modelId || model?.id || '').trim();
}

function isDefaultOwnedModel(model = {}, defaultProvider = {}) {
  const providerId = String(defaultProvider?.id || '').trim();
  const modelId = String(model?.id || '').trim();
  return Boolean(providerId && modelId.startsWith(`${providerId}-`));
}

function mergeModelDefaults(existingModels, defaultModels, defaultProvider = {}) {
  const defaultsByKey = new Map(defaultModels.map((model) => [modelKey(model), model]).filter(([key]) => key));
  const existingKeys = new Set();
  const refreshedModels = existingModels
    .filter((model) => defaultsByKey.has(modelKey(model)) || !isDefaultOwnedModel(model, defaultProvider))
    .map((model) => {
      const key = modelKey(model);
      if (!key) return model;
      existingKeys.add(key);
      const defaultModel = defaultsByKey.get(key);
      return defaultModel ? { ...model, ...defaultModel } : model;
    });
  const missingDefaults = defaultModels.filter((model) => {
    const key = modelKey(model);
    return key && !existingKeys.has(key);
  });
  return [...refreshedModels, ...missingDefaults];
}

function mergeProviderModels(provider = {}, defaultProvider = {}) {
  if (provider.accessMode === 'lab' || String(provider.id || '').startsWith('lab-')) return provider;
  const existingModels = Array.isArray(provider.models) ? provider.models : [];
  const defaultModels = Array.isArray(defaultProvider.models) ? defaultProvider.models : [];
  if (defaultModels.length === 0) return provider;

  const models = mergeModelDefaults(existingModels, defaultModels, defaultProvider);
  return { ...provider, models };
}

export function mergeDefaultApiModelsIntoRegistry(registryJson, defaultRegistryJson) {
  const registry = parseRegistry(registryJson);
  const defaults = parseRegistry(defaultRegistryJson);
  if (!registry.length || !defaults.length) return registryJson;

  const providersById = new Map(registry.map((provider) => [String(provider?.id || '').trim(), provider]));
  const merged = registry.map((provider) => {
    const id = String(provider?.id || '').trim();
    const defaultProvider = defaults.find((entry) => String(entry?.id || '').trim() === id);
    return defaultProvider ? mergeProviderModels(provider, defaultProvider) : provider;
  });

  for (const defaultProvider of defaults) {
    const id = String(defaultProvider?.id || '').trim();
    if (!id || providersById.has(id)) continue;
    merged.push(defaultProvider);
  }

  return JSON.stringify(merged);
}
