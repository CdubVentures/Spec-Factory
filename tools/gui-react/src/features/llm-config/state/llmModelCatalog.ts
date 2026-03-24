import type { LlmProviderEntry, LlmModelRole } from '../types/llmProviderRegistryTypes.ts';
import { compareModelsByRoleTokensCost } from './llmModelDropdownOptions.ts';

export interface ModelCatalogEntry {
  providerName: string;
  providerId: string;
  modelId: string;
  role: LlmModelRole;
  maxContextTokens: number | null;
  maxOutputTokens: number | null;
  costInputPer1M: number;
  costOutputPer1M: number;
  costCachedPer1M: number;
}

export interface ModelPricingEntry {
  model: string;
  provider?: string;
  input_per_1m?: number;
  output_per_1m?: number;
  cached_input_per_1m?: number;
}

export interface ModelTokenProfileEntry {
  model: string;
  default_output_tokens?: number;
  max_output_tokens?: number;
}

export interface BuildModelCatalogInput {
  registry: LlmProviderEntry[];
  flatModelOptions: readonly string[];
  modelPricing?: ModelPricingEntry[];
  modelTokenProfiles?: ModelTokenProfileEntry[];
}

export function buildModelCatalogEntries(input: BuildModelCatalogInput): ModelCatalogEntry[] {
  const { registry, flatModelOptions, modelPricing, modelTokenProfiles } = input;
  const entries: ModelCatalogEntry[] = [];
  const seenModelIds = new Set<string>();

  // 1. Registry models (full metadata, take precedence)
  for (const provider of registry) {
    if (!provider.enabled) continue;
    for (const model of provider.models) {
      entries.push({
        providerName: provider.name,
        providerId: provider.id,
        modelId: model.modelId,
        role: model.role,
        maxContextTokens: model.maxContextTokens,
        maxOutputTokens: model.maxOutputTokens,
        costInputPer1M: model.costInputPer1M,
        costOutputPer1M: model.costOutputPer1M,
        costCachedPer1M: model.costCachedPer1M,
      });
      seenModelIds.add(model.modelId);
    }
  }

  // Build pricing + token profile lookups for flat model enrichment
  const pricingMap = new Map<string, ModelPricingEntry>();
  for (const row of modelPricing ?? []) {
    if (row.model) pricingMap.set(row.model, row);
  }
  const tokenProfileMap = new Map<string, ModelTokenProfileEntry>();
  for (const row of modelTokenProfiles ?? []) {
    if (row.model) tokenProfileMap.set(row.model, row);
  }

  // 2. Flat-list models not already covered by registry
  for (const modelId of flatModelOptions) {
    if (seenModelIds.has(modelId)) continue;
    seenModelIds.add(modelId);

    const pricing = pricingMap.get(modelId);
    const tokenProfile = tokenProfileMap.get(modelId);

    entries.push({
      providerName: pricing?.provider ?? '',
      providerId: '',
      modelId,
      role: 'primary',
      maxContextTokens: null,
      maxOutputTokens: tokenProfile?.max_output_tokens ?? null,
      costInputPer1M: pricing?.input_per_1m ?? 0,
      costOutputPer1M: pricing?.output_per_1m ?? 0,
      costCachedPer1M: pricing?.cached_input_per_1m ?? 0,
    });
  }

  entries.sort(compareModelsByRoleTokensCost);

  return entries;
}
