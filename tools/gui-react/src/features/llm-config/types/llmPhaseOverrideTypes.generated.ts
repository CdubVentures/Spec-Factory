// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

export interface LlmPhaseOverride {
  baseModel: string;
  reasoningModel: string;
  useReasoning: boolean;
  maxOutputTokens: number | null;
  timeoutMs: number | null;
  maxContextTokens: number | null;
  webSearch: boolean;
  thinking: boolean;
  thinkingEffort: string;
}

export type LlmOverridePhaseId = 'needset' | 'searchPlanner' | 'brandResolver' | 'serpSelector' | 'validate';

export type LlmPhaseOverrides = {
  [K in LlmOverridePhaseId]?: Partial<LlmPhaseOverride>;
};
