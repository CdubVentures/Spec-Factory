export type LlmProviderType = 'openai-compatible' | 'anthropic' | 'ollama' | 'cortex';
export type LlmModelRole = 'primary' | 'reasoning' | 'fast' | 'embedding';

export interface LlmProviderModel {
  id: string;
  modelId: string;
  role: LlmModelRole;
  costInputPer1M: number;
  costOutputPer1M: number;
  costCachedPer1M: number;
  maxContextTokens: number | null;
  maxOutputTokens: number | null;
}

export type LlmProviderHealthStatus = 'green' | 'gray' | 'red';

export interface LlmProviderEntry {
  id: string;
  name: string;
  type: LlmProviderType;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
  expanded: boolean;
  health?: LlmProviderHealthStatus;
  models: LlmProviderModel[];
}
