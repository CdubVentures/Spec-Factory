type IndexingRunModelPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunModelPayloadInput {
  searchProvider: string;
  llmModelPlan: string;
  llmModelTriage: string;
  llmMaxOutputTokensPlan: number;
  llmModelFast: string;
  llmMaxOutputTokensFast: number;
  llmMaxOutputTokensTriage: number;
  llmModelReasoning: string;
  llmMaxOutputTokensReasoning: number;
  llmModelExtract: string;
  llmMaxOutputTokensExtract: number;
  llmModelValidate: string;
  llmMaxOutputTokensValidate: number;
  llmModelWrite: string;
  llmMaxOutputTokensWrite: number;
  llmPlanFallbackModel: string;
  llmMaxOutputTokensPlanFallback: number;
  llmMaxOutputTokensExtractFallback: number;
  llmMaxOutputTokensValidateFallback: number;
  llmMaxOutputTokensWriteFallback: number;
}

export function buildIndexingRunModelPayload(
  input: BuildIndexingRunModelPayloadInput,
): Record<string, IndexingRunModelPayloadPrimitive> {
  return {
    searchProvider: input.searchProvider,
    llmModelPlan: input.llmModelPlan,
    llmModelTriage: input.llmModelTriage,
    runProfile: 'standard',
    llmMaxOutputTokensPlan: input.llmMaxOutputTokensPlan,
    llmModelFast: input.llmModelFast,
    llmMaxOutputTokensFast: input.llmMaxOutputTokensFast,
    llmMaxOutputTokensTriage: input.llmMaxOutputTokensTriage,
    llmModelReasoning: input.llmModelReasoning,
    llmMaxOutputTokensReasoning: input.llmMaxOutputTokensReasoning,
    llmModelExtract: input.llmModelExtract,
    llmMaxOutputTokensExtract: input.llmMaxOutputTokensExtract,
    llmModelValidate: input.llmModelValidate,
    llmMaxOutputTokensValidate: input.llmMaxOutputTokensValidate,
    llmModelWrite: input.llmModelWrite,
    llmMaxOutputTokensWrite: input.llmMaxOutputTokensWrite,
    llmPlanFallbackModel: input.llmPlanFallbackModel,
    llmMaxOutputTokensPlanFallback: input.llmMaxOutputTokensPlanFallback,
    llmMaxOutputTokensExtractFallback: input.llmMaxOutputTokensExtractFallback,
    llmMaxOutputTokensValidateFallback: input.llmMaxOutputTokensValidateFallback,
    llmMaxOutputTokensWriteFallback: input.llmMaxOutputTokensWriteFallback,
  };
}
