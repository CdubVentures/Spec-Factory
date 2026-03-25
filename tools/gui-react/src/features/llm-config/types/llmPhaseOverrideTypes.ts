export interface LlmPhaseOverride {
  baseModel: string;
  reasoningModel: string;
  useReasoning: boolean;
  maxOutputTokens: number | null;
  timeoutMs: number | null;
  maxContextTokens: number | null;
}

export type LlmOverridePhaseId = 'needset' | 'searchPlanner' | 'brandResolver' | 'serpSelector' | 'validate';

export type LlmPhaseOverrides = {
  [K in LlmOverridePhaseId]?: Partial<LlmPhaseOverride>;
};
