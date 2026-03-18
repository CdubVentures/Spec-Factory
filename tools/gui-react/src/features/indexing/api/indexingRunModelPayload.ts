type IndexingRunModelPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunModelPayloadInput {
  searchEngines: string;
  searchEnginesFallback: string;
  llmModelPlan: string;
  llmMaxOutputTokensPlan: number;
  llmModelReasoning: string;
  llmMaxOutputTokensReasoning: number;
  llmPlanFallbackModel: string;
  llmReasoningFallbackModel: string;
  llmMaxOutputTokensPlanFallback: number;
  llmMaxOutputTokensReasoningFallback: number;
}

export function buildIndexingRunModelPayload(
  input: BuildIndexingRunModelPayloadInput,
): Record<string, IndexingRunModelPayloadPrimitive> {
  return {
    searchEngines: input.searchEngines,
    searchEnginesFallback: input.searchEnginesFallback,
    llmModelPlan: input.llmModelPlan,
    runProfile: 'standard',
    llmMaxOutputTokensPlan: input.llmMaxOutputTokensPlan,
    llmModelReasoning: input.llmModelReasoning,
    llmMaxOutputTokensReasoning: input.llmMaxOutputTokensReasoning,
    llmPlanFallbackModel: input.llmPlanFallbackModel,
    llmReasoningFallbackModel: input.llmReasoningFallbackModel,
    llmMaxOutputTokensPlanFallback: input.llmMaxOutputTokensPlanFallback,
    llmMaxOutputTokensReasoningFallback: input.llmMaxOutputTokensReasoningFallback,
  };
}
