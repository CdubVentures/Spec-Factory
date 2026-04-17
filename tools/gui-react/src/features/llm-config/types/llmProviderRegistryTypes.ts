export type LlmProviderType = 'openai-compatible' | 'anthropic' | 'ollama';
export type LlmModelRole = 'primary' | 'reasoning' | 'embedding';
export type LlmAccessMode = 'api' | 'lab';

export interface LlmProviderModel {
  id: string;
  modelId: string;
  role: LlmModelRole;
  costInputPer1M: number;
  costOutputPer1M: number;
  costCachedPer1M: number;
  maxContextTokens: number | null;
  maxOutputTokens: number | null;
  accessMode?: LlmAccessMode;
  tier?: 'fast' | 'deep' | 'vision';
  transport?: 'sync' | 'async';
  thinking?: boolean;
  webSearch?: boolean;
  thinkingEffortOptions?: string[];
}

export interface LlmProviderEntry {
  id: string;
  name: string;
  type: LlmProviderType;
  baseUrl: string;
  apiKey: string;
  expanded: boolean;
  accessMode?: LlmAccessMode;
  models: LlmProviderModel[];
}
