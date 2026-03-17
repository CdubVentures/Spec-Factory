import type { LlmProviderEntry, LlmModelRole } from '../types/llmProviderRegistryTypes';

export interface DropdownModelOption {
  value: string;
  label: string;
  providerId: string | null;
}

export function buildModelDropdownOptions(
  flatModelOptions: readonly string[],
  registry: LlmProviderEntry[],
  roleFilter?: LlmModelRole | LlmModelRole[],
): DropdownModelOption[] {
  const result: DropdownModelOption[] = [];
  const registryModelIds = new Set<string>();

  // 1. Collect enabled registry models matching role filter
  for (const provider of registry) {
    if (!provider.enabled) continue;
    for (const model of provider.models) {
      if (roleFilter) {
        const roles = Array.isArray(roleFilter) ? roleFilter : [roleFilter];
        if (!roles.includes(model.role)) continue;
      }
      result.push({
        value: model.modelId,
        label: provider.name ? `${provider.name} / ${model.modelId}` : model.modelId,
        providerId: provider.id,
      });
      registryModelIds.add(model.modelId);
    }
  }

  // 2. Append flat options not already covered by registry (registry version wins)
  for (const modelId of flatModelOptions) {
    if (registryModelIds.has(modelId)) continue;
    result.push({
      value: modelId,
      label: modelId,
      providerId: null,
    });
  }

  return result;
}
