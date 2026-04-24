// WHY: Fetch-at-boot registry sync — pulls fresh model lists from running
// LLM Lab instances and merges into the provider registry. Adding a model
// to LLM Lab makes it immediately available in Spec Factory.
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractEffortFromModelName } from '../../shared/effortFromModelName.js';
import { buildRegistryLookup } from './routeResolver.js';

const LAB_FETCH_TIMEOUT_MS = 2000;
const DEFAULT_LAB_REGISTRY_PATH = path.resolve(process.cwd(), '..', 'LLM Lab', 'app', 'models', 'model_registry.json');

const LAB_PROVIDER_PREFIX = {
  'lab-openai': 'oai',
  'lab-gemini': 'gemini',
  'lab-claude': 'claude',
};

const LAB_PROVIDER_REGISTRY_KEY = {
  'lab-openai': 'openai',
  'lab-gemini': 'gemini',
  'lab-claude': 'claude',
};

const LAB_PROVIDER_KEY_FROM_PREFIX = {
  oai: 'openai',
  gemini: 'gemini',
  claude: 'claude',
};

function providerRegistryKey(providerPrefix, providerId) {
  return LAB_PROVIDER_REGISTRY_KEY[providerId] || LAB_PROVIDER_KEY_FROM_PREFIX[providerPrefix] || providerPrefix;
}

function selectLabRegistryModels(labRegistry, providerPrefix, providerId) {
  if (Array.isArray(labRegistry?.models)) return labRegistry.models;
  const registryKey = providerRegistryKey(providerPrefix, providerId);
  const providerModels = labRegistry?.providers?.[registryKey]?.models;
  return Array.isArray(providerModels) ? providerModels : [];
}

async function readLocalLabRegistry(labRegistryPath, logger) {
  try {
    const content = await fs.readFile(labRegistryPath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      logger?.warn?.('lab_registry_file_read_failed', { path: labRegistryPath, message: err.message });
    }
    return null;
  }
}

/** Transform a Lab registry response into Spec Factory LlmProviderModel entries. */
export function transformLabRegistryToModels(labRegistry, providerPrefix, providerId) {
  const models = selectLabRegistryModels(labRegistry, providerPrefix, providerId);
  if (models.length === 0) return [];
  return models.map((m) => {
    const modelId = String(m.id || '');
    const efforts = Array.isArray(m.efforts) ? m.efforts : [];
    const bakedEffort = extractEffortFromModelName(modelId);
    const hasEfforts = efforts.length > 0;
    const isMinimal = modelId.endsWith('-minimal');
    const thinking = isMinimal ? false : (hasEfforts || Boolean(bakedEffort));
    // WHY: Models with effort options or baked-in effort are reasoning-capable.
    const isReasoning = hasEfforts || Boolean(bakedEffort);
    const normalized = modelId.replace(/[^a-z0-9]/gi, '');
    return {
      id: `lab-${providerPrefix}-${normalized}`,
      modelId,
      role: isReasoning ? 'reasoning' : 'primary',
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
export async function syncLabRegistryIntoConfig(config, {
  logger,
  labRegistryPath = DEFAULT_LAB_REGISTRY_PATH,
  fetchRegistry = fetch,
} = {}) {
  let registry;
  try { registry = JSON.parse(config.llmProviderRegistryJson); } catch { return; }
  if (!Array.isArray(registry)) return;
  const labProviders = registry.filter((p) => p.accessMode === 'lab' && p.baseUrl);
  if (!labProviders.length) return;

  const syncedProviders = new Map();
  const localLabRegistry = await readLocalLabRegistry(labRegistryPath, logger);
  for (const prov of labProviders) {
    const prefix = LAB_PROVIDER_PREFIX[prov.id] || prov.id.replace('lab-', '');
    const models = transformLabRegistryToModels(localLabRegistry, prefix, prov.id);
    if (models.length > 0) syncedProviders.set(prov.id, models);
  }

  const fetches = labProviders.filter((prov) => !syncedProviders.has(prov.id)).map(async (prov) => {
    try {
      const url = `${prov.baseUrl.replace(/\/+$/, '')}/model-registry`;
      const res = await fetchRegistry(url, { signal: AbortSignal.timeout(LAB_FETCH_TIMEOUT_MS) });
      if (!res.ok) return;
      const data = await res.json();
      const prefix = LAB_PROVIDER_PREFIX[prov.id] || prov.id.replace('lab-', '');
      const models = transformLabRegistryToModels(data, prefix, prov.id);
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
