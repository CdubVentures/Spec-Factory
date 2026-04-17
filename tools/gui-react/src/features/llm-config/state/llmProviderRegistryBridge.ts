import type { LlmProviderEntry, LlmProviderModel, LlmProviderType, LlmModelRole } from '../types/llmProviderRegistryTypes.ts';

let nextProviderId = 1;
let nextModelId = 1;

function generateProviderId(): string {
  return `provider-${Date.now()}-${nextProviderId++}`;
}

function generateModelId(): string {
  return `model-${Date.now()}-${nextModelId++}`;
}

export function parseProviderRegistry(json: string): LlmProviderEntry[] {
  if (!json || !json.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is LlmProviderEntry =>
          typeof entry === 'object' && entry !== null && typeof entry.id === 'string',
      )
      .map((entry) => ({
        ...entry,
        expanded: entry.expanded ?? true,
        // Migrate persisted 'base' role → 'primary'
        models: (entry.models ?? []).map((m: LlmProviderModel) =>
          m.role === ('base' as string) ? { ...m, role: 'primary' as LlmModelRole } : m,
        ),
      }));
  } catch {
    return [];
  }
}

export function serializeProviderRegistry(registry: LlmProviderEntry[]): string {
  if (registry.length === 0) return '';
  const serializable = registry.map(({ expanded, ...rest }) => rest);
  return JSON.stringify(serializable);
}

export interface CollectedModelOption {
  modelId: string;
  providerId: string;
  providerName: string;
  role: LlmModelRole;
  maxOutputTokens: number | null;
}

export function collectModelOptions(
  registry: LlmProviderEntry[],
  roleFilter?: LlmModelRole,
): CollectedModelOption[] {
  const result: CollectedModelOption[] = [];
  for (const provider of registry) {
    for (const model of provider.models) {
      if (roleFilter && model.role !== roleFilter) continue;
      result.push({
        modelId: model.modelId,
        providerId: provider.id,
        providerName: provider.name,
        role: model.role,
        maxOutputTokens: model.maxOutputTokens,
      });
    }
  }
  return result;
}

// WHY: Dropdown values use composite keys (providerId:modelId) to disambiguate
// when the same modelId exists in multiple providers (e.g., API and Lab).
// The backend routeResolver already supports composite keys natively.
export function parseModelKey(key: string): { providerId: string | null; modelId: string } {
  if (!key) return { providerId: null, modelId: '' };
  const idx = key.indexOf(':');
  if (idx > 0) return { providerId: key.slice(0, idx), modelId: key.slice(idx + 1) };
  return { providerId: null, modelId: key };
}

export function resolveProviderForModel(
  registry: LlmProviderEntry[],
  key: string,
): LlmProviderEntry | undefined {
  if (!key || !key.trim()) return undefined;
  const { providerId, modelId } = parseModelKey(key);
  if (providerId) {
    return registry.find(
      (p) => p.id === providerId && p.models.some((m) => m.modelId === modelId),
    );
  }
  return registry.find(
    (p) => p.models.some((m) => m.modelId === modelId),
  );
}

export interface FlatKeyBridgeResult {
  llmProvider: string;
  llmBaseUrl: string;
  llmCostInputPer1M: number;
  llmCostOutputPer1M: number;
  llmCostCachedInputPer1M: number;
}

export function bridgeRegistryToFlatKeys(
  registry: LlmProviderEntry[],
  selectedBaseModel: string,
): FlatKeyBridgeResult | null {
  const provider = resolveProviderForModel(registry, selectedBaseModel);
  if (!provider) return null;
  const { modelId } = parseModelKey(selectedBaseModel);
  const model = provider.models.find((m) => m.modelId === modelId);
  if (!model) return null;
  return {
    llmProvider: provider.type === 'openai-compatible' ? 'openai' : provider.type,
    llmBaseUrl: provider.baseUrl,
    llmCostInputPer1M: model.costInputPer1M,
    llmCostOutputPer1M: model.costOutputPer1M,
    llmCostCachedInputPer1M: model.costCachedPer1M,
  };
}

export interface CostBridgeResult {
  llmCostInputPer1M: number;
  llmCostOutputPer1M: number;
  llmCostCachedInputPer1M: number;
}

/**
 * Cost-only subset of bridgeRegistryToFlatKeys.
 * WHY: onRegistryChange needs to re-sync flat cost fields when model costs
 * are edited in the Provider Registry panel, without touching provider/URL.
 */
export function syncCostsFromRegistry(
  registry: LlmProviderEntry[],
  selectedBaseModel: string,
): CostBridgeResult | null {
  const bridged = bridgeRegistryToFlatKeys(registry, selectedBaseModel);
  if (!bridged) return null;
  return {
    llmCostInputPer1M: bridged.llmCostInputPer1M,
    llmCostOutputPer1M: bridged.llmCostOutputPer1M,
    llmCostCachedInputPer1M: bridged.llmCostCachedInputPer1M,
  };
}

export const DEFAULT_BASE_URLS: Record<LlmProviderType, string> = {
  'openai-compatible': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  ollama: 'http://localhost:11434',
};

export function createDefaultProvider(type: LlmProviderType): LlmProviderEntry {
  return {
    id: generateProviderId(),
    name: '',
    type,
    baseUrl: DEFAULT_BASE_URLS[type] ?? '',
    apiKey: '',
    expanded: true,
    models: [],
  };
}

export function createDefaultModel(): LlmProviderModel {
  return {
    id: generateModelId(),
    modelId: '',
    role: 'primary',
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costCachedPer1M: 0,
    maxContextTokens: null,
    maxOutputTokens: null,
  };
}
