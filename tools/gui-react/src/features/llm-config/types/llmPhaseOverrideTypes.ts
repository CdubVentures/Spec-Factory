export interface LlmPhaseOverride {
  baseModel: string;
  reasoningModel: string;
  useReasoning: boolean;
  maxOutputTokens: number | null;
}

export type LlmOverridePhaseId = 'needset' | 'searchPlanner' | 'brandResolver' | 'serpSelector' | 'extraction' | 'validate' | 'write';

export type LlmPhaseOverrides = {
  [K in LlmOverridePhaseId]?: Partial<LlmPhaseOverride>;
};
