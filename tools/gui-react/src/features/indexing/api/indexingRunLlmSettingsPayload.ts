type IndexingRunLlmSettingsPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunLlmSettingsPayloadInput {
  parsedLlmMaxCallsPerRound: number;
  parsedLlmMaxOutputTokens: number;
  llmMinOutputTokens: number;
  parsedLlmVerifySampleRate: number;
  parsedLlmMaxBatchesPerProduct: number;
  parsedLlmMaxEvidenceChars: number;
  parsedLlmMaxTokens: number;
  parsedLlmTimeoutMs: number;
  parsedLlmCostInputPer1M: number;
  parsedLlmCostOutputPer1M: number;
  parsedLlmCostCachedInputPer1M: number;
  llmVerifyMode: boolean | string;
  parsedEndpointSignalLimit: number;
  parsedEndpointSuggestionLimit: number;
  parsedEndpointNetworkScanLimit: number;
}

export function buildIndexingRunLlmSettingsPayload(
  input: BuildIndexingRunLlmSettingsPayloadInput,
): Record<string, IndexingRunLlmSettingsPayloadPrimitive> {
  return {
    llmMaxCallsPerRound: Math.max(1, input.parsedLlmMaxCallsPerRound),
    llmMaxOutputTokens: Math.max(input.llmMinOutputTokens, input.parsedLlmMaxOutputTokens),
    llmVerifySampleRate: Math.max(1, input.parsedLlmVerifySampleRate),
    llmMaxBatchesPerProduct: Math.max(1, input.parsedLlmMaxBatchesPerProduct),
    llmMaxEvidenceChars: Math.max(1000, input.parsedLlmMaxEvidenceChars),
    llmMaxTokens: Math.max(256, input.parsedLlmMaxTokens),
    llmTimeoutMs: Math.max(1000, input.parsedLlmTimeoutMs),
    llmCostInputPer1M: Math.max(0, input.parsedLlmCostInputPer1M),
    llmCostOutputPer1M: Math.max(0, input.parsedLlmCostOutputPer1M),
    llmCostCachedInputPer1M: Math.max(0, input.parsedLlmCostCachedInputPer1M),
    llmVerifyMode: input.llmVerifyMode,
    endpointSignalLimit: Math.max(1, input.parsedEndpointSignalLimit),
    endpointSuggestionLimit: Math.max(1, input.parsedEndpointSuggestionLimit),
    endpointNetworkScanLimit: Math.max(50, input.parsedEndpointNetworkScanLimit),
  };
}
