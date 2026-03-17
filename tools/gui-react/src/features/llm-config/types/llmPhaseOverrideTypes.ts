export interface LlmPhaseOverride {
  baseModel: string;
  reasoningModel: string;
  useReasoning: boolean;
  maxOutputTokens: number | null;
}

export type LlmPhaseId = 'needset' | 'searchPlanner' | 'brandResolver' | 'serpTriage' | 'domainClassifier';

export type LlmPhaseOverrides = {
  [K in LlmPhaseId]?: Partial<LlmPhaseOverride>;
};
