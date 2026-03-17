import type { LlmProviderEntry, LlmProviderModel, LlmProviderType, LlmModelRole } from '../types/llmProviderRegistryTypes';

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
        health: entry.health ?? 'gray',
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
  const serializable = registry.map(({ expanded, health, ...rest }) => rest);
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
    if (!provider.enabled) continue;
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

export function resolveProviderForModel(
  registry: LlmProviderEntry[],
  modelId: string,
): LlmProviderEntry | undefined {
  if (!modelId || !modelId.trim()) return undefined;
  return registry.find(
    (p) => p.enabled && p.models.some((m) => m.modelId === modelId),
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
  const model = provider.models.find((m) => m.modelId === selectedBaseModel);
  if (!model) return null;
  return {
    llmProvider: provider.type === 'openai-compatible' ? 'openai' : provider.type,
    llmBaseUrl: provider.baseUrl,
    llmCostInputPer1M: model.costInputPer1M,
    llmCostOutputPer1M: model.costOutputPer1M,
    llmCostCachedInputPer1M: model.costCachedPer1M,
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
    enabled: true,
    expanded: true,
    health: 'gray',
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
