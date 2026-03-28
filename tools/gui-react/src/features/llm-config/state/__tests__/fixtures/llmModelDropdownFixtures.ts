import type { LlmProviderEntry, LlmProviderModel, LlmModelRole } from '../../types/llmProviderRegistryTypes.ts';

export function makeProvider(
  overrides: Partial<LlmProviderEntry> & { id: string; name: string },
): LlmProviderEntry {
  return {
    type: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    expanded: false,
    models: [],
    ...overrides,
  };
}

export function makeModel(
  modelId: string,
  role: LlmModelRole = 'primary',
  overrides?: Partial<LlmProviderModel>,
): LlmProviderModel {
  return {
    id: `m-${modelId}`,
    modelId,
    role,
    costInputPer1M: 0,
    costOutputPer1M: 0,
    costCachedPer1M: 0,
    maxContextTokens: null,
    maxOutputTokens: null,
    ...overrides,
  };
}
