// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

export interface LlmPhaseOverride {
  baseModel: string;
  reasoningModel: string;
  fallbackModel: string;
  fallbackReasoningModel: string;
  fallbackUseReasoning: boolean;
  fallbackThinking: boolean;
  fallbackThinkingEffort: string;
  fallbackWebSearch: boolean;
  useReasoning: boolean;
  maxOutputTokens: number | null;
  timeoutMs: number | null;
  maxContextTokens: number | null;
  reasoningBudget: number | null;
  webSearch: boolean;
  thinking: boolean;
  thinkingEffort: string;
  disableLimits: boolean;
  jsonStrict: boolean;
  writerModel: string;
  writerReasoningModel: string;
  writerUseReasoning: boolean;
  writerThinking: boolean;
  writerThinkingEffort: string;
}

export type LlmOverridePhaseId = 'needset' | 'searchPlanner' | 'brandResolver' | 'serpSelector' | 'validate' | 'colorFinder' | 'imageFinder' | 'imageEvaluator' | 'releaseDateFinder';

export type LlmPhaseOverrides = {
  [K in LlmOverridePhaseId]?: Partial<LlmPhaseOverride>;
};
