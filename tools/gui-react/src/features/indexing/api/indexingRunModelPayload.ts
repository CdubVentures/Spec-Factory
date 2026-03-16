type IndexingRunModelPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunModelPayloadInput {
  searchProvider: string;
  phase2LlmEnabled: boolean;
  phase2LlmModel: string;
  phase3LlmModel: string;
  llmTokensPlan: number;
  llmModelFast: string;
  llmTokensFast: number;
  llmTokensTriage: number;
  llmModelReasoning: string;
  llmTokensReasoning: number;
  llmModelExtract: string;
  llmTokensExtract: number;
  llmModelValidate: string;
  llmTokensValidate: number;
  llmModelWrite: string;
  llmTokensWrite: number;
  llmPlanFallbackModel: string;
  llmTokensPlanFallback: number;
  llmTokensExtractFallback: number;
  llmTokensValidateFallback: number;
  llmTokensWriteFallback: number;
}

export function buildIndexingRunModelPayload(
  input: BuildIndexingRunModelPayloadInput,
): Record<string, IndexingRunModelPayloadPrimitive> {
  return {
    searchProvider: input.searchProvider,
    phase2LlmEnabled: input.phase2LlmEnabled,
    llmPlanDiscoveryQueries: input.phase2LlmEnabled,
    phase2LlmModel: input.phase2LlmModel,
    phase3LlmModel: input.phase3LlmModel,
    runProfile: 'standard',
    llmModelPlan: input.phase2LlmModel,
    llmMaxOutputTokensPlan: input.llmTokensPlan,
    llmTokensPlan: input.llmTokensPlan,
    llmModelFast: input.llmModelFast,
    llmMaxOutputTokensFast: input.llmTokensFast,
    llmTokensFast: input.llmTokensFast,
    llmModelTriage: input.phase3LlmModel,
    llmMaxOutputTokensTriage: input.llmTokensTriage,
    llmTokensTriage: input.llmTokensTriage,
    llmModelReasoning: input.llmModelReasoning,
    llmMaxOutputTokensReasoning: input.llmTokensReasoning,
    llmTokensReasoning: input.llmTokensReasoning,
    llmModelExtract: input.llmModelExtract,
    llmMaxOutputTokensExtract: input.llmTokensExtract,
    llmTokensExtract: input.llmTokensExtract,
    llmModelValidate: input.llmModelValidate,
    llmMaxOutputTokensValidate: input.llmTokensValidate,
    llmTokensValidate: input.llmTokensValidate,
    llmModelWrite: input.llmModelWrite,
    llmMaxOutputTokensWrite: input.llmTokensWrite,
    llmTokensWrite: input.llmTokensWrite,
    llmPlanFallbackModel: input.llmPlanFallbackModel,
    llmMaxOutputTokensPlanFallback: input.llmTokensPlanFallback,
    llmTokensPlanFallback: input.llmTokensPlanFallback,
    llmMaxOutputTokensExtractFallback: input.llmTokensExtractFallback,
    llmTokensExtractFallback: input.llmTokensExtractFallback,
    llmMaxOutputTokensValidateFallback: input.llmTokensValidateFallback,
    llmTokensValidateFallback: input.llmTokensValidateFallback,
    llmMaxOutputTokensWriteFallback: input.llmTokensWriteFallback,
    llmTokensWriteFallback: input.llmTokensWriteFallback,
  };
}
