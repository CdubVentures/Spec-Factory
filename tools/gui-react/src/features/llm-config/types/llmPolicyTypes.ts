// WHY: TypeScript mirror of src/core/llm/llmPolicySchema.js composite shape.
// This is the frontend SSOT for what an LlmPolicy looks like.

export interface LlmPolicyModels {
  plan: string;
  reasoning: string;
  planFallback: string;
  reasoningFallback: string;
}

export interface LlmPolicyProvider {
  id: string;
  baseUrl: string;
  planProvider: string;
  planBaseUrl: string;
}

export interface LlmPolicyApiKeys {
  gemini: string;
  deepseek: string;
  anthropic: string;
  openai: string;
  plan: string;
}

export interface LlmPolicyTokens {
  maxOutput: number;
  maxTokens: number;
  plan: number;
  reasoning: number;
  planFallback: number;
  reasoningFallback: number;
}

export interface LlmPolicyReasoning {
  enabled: boolean;
  budget: number;
  mode: boolean;
}

export interface LlmPolicyExtraction {
  cacheDir: string;
  cacheTtlMs: number;
  maxSnippetChars: number;
  maxSnippetsPerBatch: number;
  skipLowSignal: boolean;
  maxBatchesPerProduct: number;
  maxCallsPerProductTotal: number;
  maxCallsPerRound: number;
  maxEvidenceChars: number;
}

export interface LlmPolicyBudget {
  monthlyUsd: number;
  perProductUsd: number;
  costInputPer1M: number;
  costOutputPer1M: number;
  costCachedInputPer1M: number;
}

export interface LlmPolicyVerify {
  mode: boolean;
  sampleRate: number;
}

export interface LlmPhaseOverride {
  baseModel?: string;
  reasoningModel?: string;
  useReasoning?: boolean;
  maxOutputTokens?: number | null;
}

export interface LlmProviderRegistryEntry {
  id: string;
  name?: string;
  type?: string;
  baseUrl?: string;
  apiKey?: string;
  enabled?: boolean;
  models?: Array<{
    id: string;
    modelId: string;
    role?: string;
    costInputPer1M?: number;
    costOutputPer1M?: number;
    costCachedPer1M?: number;
    maxContextTokens?: number | null;
    maxOutputTokens?: number | null;
  }>;
}

export interface LlmPolicy {
  models: LlmPolicyModels;
  provider: LlmPolicyProvider;
  apiKeys: LlmPolicyApiKeys;
  tokens: LlmPolicyTokens;
  reasoning: LlmPolicyReasoning;
  phaseOverrides: Record<string, Partial<LlmPhaseOverride>>;
  providerRegistry: LlmProviderRegistryEntry[];
  extraction: LlmPolicyExtraction;
  budget: LlmPolicyBudget;
  verify: LlmPolicyVerify;
  timeoutMs: number;
  writeSummary: boolean;
}

export type LlmPolicyGroup = keyof Pick<
  LlmPolicy,
  'models' | 'provider' | 'apiKeys' | 'tokens' | 'reasoning' | 'extraction' | 'budget' | 'verify'
>;
