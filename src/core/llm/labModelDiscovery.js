// WHY: Fetch-at-boot registry sync — pulls fresh model lists from running
// LLM Lab instances and merges into the provider registry. Adding a model
// to LLM Lab makes it immediately available in Spec Factory.
import { extractEffortFromModelName } from '../../shared/effortFromModelName.js';
import { buildRegistryLookup } from './routeResolver.js';

const LAB_FETCH_TIMEOUT_MS = 2000;

const LAB_PROVIDER_PREFIX = {
  'lab-openai': 'oai',
  'lab-gemini': 'gemini',
  'lab-claude': 'claude',
};

/** Transform a Lab registry response into Spec Factory LlmProviderModel entries. */
export function transformLabRegistryToModels(labRegistry, providerPrefix) {
  const models = labRegistry?.models;
  if (!Array.isArray(models) || models.length === 0) return [];
  return models.map((m) => {
    const modelId = String(m.id || '');
    const efforts = Array.isArray(m.efforts) ? m.efforts : [];
    const bakedEffort = extractEffortFromModelName(modelId);
    const hasEfforts = efforts.length > 0;
    const isMinimal = modelId.endsWith('-minimal');
    const thinking = isMinimal ? false : (hasEfforts || Boolean(bakedEffort));
    const normalized = modelId.replace(/[^a-z0-9]/gi, '');
    return {
      id: `lab-${providerPrefix}-${normalized}`,
      modelId,
      role: bakedEffort === 'xhigh' ? 'reasoning' : 'primary',
      accessMode: 'lab',
      costInputPer1M: Number(m.costInputPer1M || 0),
      costOutputPer1M: Number(m.costOutputPer1M || 0),
      costCachedPer1M: Number(m.costCachedPer1M || 0),
      maxContextTokens: m.maxContextTokens ?? null,
      maxOutputTokens: m.maxOutputTokens ?? null,
      thinking,
      webSearch: Boolean(m.capabilities?.web_search),
      ...(hasEfforts ? { thinkingEffortOptions: efforts } : {}),
    };
  });
}

/** Merge synced Lab models into an existing provider registry JSON string. */
export function mergeLabModelsIntoRegistry(registryJson, syncedProviders) {
  if (!syncedProviders || syncedProviders.size === 0) return registryJson;
  let registry;
  try { registry = JSON.parse(registryJson); } catch { return registryJson; }
  if (!Array.isArray(registry)) return registryJson;
  for (const [providerId, models] of syncedProviders) {
    const existing = registry.find((p) => p.id === providerId);
    if (existing) {
      existing.models = models;
    } else {
      registry.push({ id: providerId, name: providerId, type: 'openai-compatible', baseUrl: '', apiKey: 'session', accessMode: 'lab', models });
    }
  }
  return JSON.stringify(registry);
}

/** Fetch Lab registries and merge into config (non-blocking, call with .catch). */
export async function syncLabRegistryIntoConfig(config, { logger } = {}) {
  let registry;
  try { registry = JSON.parse(config.llmProviderRegistryJson); } catch { return; }
  if (!Array.isArray(registry)) return;
  const labProviders = registry.filter((p) => p.accessMode === 'lab' && p.baseUrl);
  if (!labProviders.length) return;

  const syncedProviders = new Map();
  const fetches = labProviders.map(async (prov) => {
    try {
      const url = `${prov.baseUrl.replace(/\/+$/, '')}/model-registry`;
      const res = await fetch(url, { signal: AbortSignal.timeout(LAB_FETCH_TIMEOUT_MS) });
      if (!res.ok) return;
      const data = await res.json();
      const prefix = LAB_PROVIDER_PREFIX[prov.id] || prov.id.replace('lab-', '');
      const models = transformLabRegistryToModels(data, prefix);
      if (models.length > 0) syncedProviders.set(prov.id, models);
    } catch (err) {
      logger?.warn?.('lab_registry_sync_failed', { provider: prov.id, message: err.message });
    }
  });
  await Promise.allSettled(fetches);

  if (syncedProviders.size === 0) return;
  config.llmProviderRegistryJson = mergeLabModelsIntoRegistry(config.llmProviderRegistryJson, syncedProviders);
  config._registryLookup = buildRegistryLookup(config.llmProviderRegistryJson);
  logger?.info?.('lab_registry_synced', {
    providers: [...syncedProviders.keys()],
    total_models: [...syncedProviders.values()].reduce((a, m) => a + m.length, 0),
  });
}
