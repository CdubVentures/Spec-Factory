type IndexingRunLearningPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunLearningPayloadInput {
  llmWriteSummary: boolean;
  llmProvider: string;
  llmBaseUrl: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  indexingCategoryAuthorityEnabled: boolean;
  userAgent: string;
  selfImproveEnabled: boolean;
  parsedMaxHypothesisItems: number;
  parsedHypothesisAutoFollowupRounds: number;
  parsedHypothesisFollowupUrlsPerRound: number;
  searxngBaseUrl: string;
  llmPlanProvider: string;
  llmPlanBaseUrl: string;
  llmPlanApiKey: string;
  llmExtractionCacheDir: string;
  parsedLlmExtractionCacheTtlMs: number;
  parsedLlmMaxCallsPerProductTotal: number;

  parsedLlmExtractMaxSnippetsPerBatch: number;
  parsedLlmExtractMaxSnippetChars: number;
  llmExtractMinSnippetChars: number;
  llmExtractSkipLowSignal: boolean;
  llmReasoningMode: boolean | string;
  parsedLlmReasoningBudget: number;
  parsedLlmMonthlyBudgetUsd: number;
  parsedLlmPerProductBudgetUsd: number;
}

export function buildIndexingRunLearningPayload(
  input: BuildIndexingRunLearningPayloadInput,
): Record<string, IndexingRunLearningPayloadPrimitive> {
  return {
    llmWriteSummary: input.llmWriteSummary,
    llmProvider: String(input.llmProvider || '').trim(),
    llmBaseUrl: String(input.llmBaseUrl || '').trim(),
    openaiApiKey: String(input.openaiApiKey || '').trim(),
    anthropicApiKey: String(input.anthropicApiKey || '').trim(),
    indexingCategoryAuthorityEnabled: input.indexingCategoryAuthorityEnabled,
    userAgent: String(input.userAgent || '').trim(),
    selfImproveEnabled: input.selfImproveEnabled,
    maxHypothesisItems: Math.max(1, input.parsedMaxHypothesisItems),
    hypothesisAutoFollowupRounds: Math.max(0, input.parsedHypothesisAutoFollowupRounds),
    hypothesisFollowupUrlsPerRound: Math.max(1, input.parsedHypothesisFollowupUrlsPerRound),
    searxngBaseUrl: String(input.searxngBaseUrl || '').trim(),
    llmPlanProvider: String(input.llmPlanProvider || '').trim(),
    llmPlanBaseUrl: String(input.llmPlanBaseUrl || '').trim(),
    llmPlanApiKey: String(input.llmPlanApiKey || '').trim(),
    llmExtractionCacheDir: String(input.llmExtractionCacheDir || '').trim(),
    llmExtractionCacheTtlMs: Math.max(60000, input.parsedLlmExtractionCacheTtlMs),
    llmMaxCallsPerProductTotal: Math.max(1, input.parsedLlmMaxCallsPerProductTotal),

    llmExtractMaxSnippetsPerBatch: Math.max(1, input.parsedLlmExtractMaxSnippetsPerBatch),
    llmExtractMaxSnippetChars: Math.max(input.llmExtractMinSnippetChars, input.parsedLlmExtractMaxSnippetChars),
    llmExtractSkipLowSignal: input.llmExtractSkipLowSignal,
    llmReasoningMode: input.llmReasoningMode,
    llmReasoningBudget: Math.max(256, input.parsedLlmReasoningBudget),
    llmMonthlyBudgetUsd: Math.max(0, input.parsedLlmMonthlyBudgetUsd),
    llmPerProductBudgetUsd: Math.max(0, input.parsedLlmPerProductBudgetUsd),
  };
}
