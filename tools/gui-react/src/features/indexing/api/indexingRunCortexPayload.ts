type IndexingRunCortexPayloadPrimitive = string | number | boolean;

export interface BuildIndexingRunCortexPayloadInput {
  cortexEnabled: boolean;
  cortexAsyncEnabled: boolean;
  cortexBaseUrl: string;
  cortexApiKey: string;
  cortexAsyncBaseUrl: string;
  cortexAsyncSubmitPath: string;
  cortexAsyncStatusPath: string;
  parsedCortexSyncTimeoutMs: number;
  parsedCortexAsyncPollIntervalMs: number;
  parsedCortexAsyncMaxWaitMs: number;
  parsedCortexEnsureReadyTimeoutMs: number;
  parsedCortexStartReadyTimeoutMs: number;
  parsedCortexFailureThreshold: number;
  parsedCortexCircuitOpenMs: number;
  cortexModelFast: string;
  cortexModelDom: string;
  cortexModelReasoningDeep: string;
  cortexModelVision: string;
  cortexModelSearchFast: string;
  cortexModelRerankFast: string;
  cortexAutoStart: boolean;
  parsedCortexEscalateConfidenceLt: number;
  cortexEscalateIfConflict: boolean;
  cortexEscalateCriticalOnly: boolean;
  parsedCortexMaxDeepFieldsPerProduct: number;
}

export function buildIndexingRunCortexPayload(
  input: BuildIndexingRunCortexPayloadInput,
): Record<string, IndexingRunCortexPayloadPrimitive> {
  return {
    cortexEnabled: input.cortexEnabled,
    cortexAsyncEnabled: input.cortexAsyncEnabled,
    cortexBaseUrl: String(input.cortexBaseUrl || '').trim(),
    cortexApiKey: String(input.cortexApiKey || '').trim(),
    cortexAsyncBaseUrl: String(input.cortexAsyncBaseUrl || '').trim(),
    cortexAsyncSubmitPath: String(input.cortexAsyncSubmitPath || '').trim(),
    cortexAsyncStatusPath: String(input.cortexAsyncStatusPath || '').trim(),
    cortexSyncTimeoutMs: Math.max(1000, input.parsedCortexSyncTimeoutMs),
    cortexAsyncPollIntervalMs: Math.max(250, input.parsedCortexAsyncPollIntervalMs),
    cortexAsyncMaxWaitMs: Math.max(1000, input.parsedCortexAsyncMaxWaitMs),
    cortexEnsureReadyTimeoutMs: Math.max(1000, input.parsedCortexEnsureReadyTimeoutMs),
    cortexStartReadyTimeoutMs: Math.max(1000, input.parsedCortexStartReadyTimeoutMs),
    cortexFailureThreshold: Math.max(1, input.parsedCortexFailureThreshold),
    cortexCircuitOpenMs: Math.max(1000, input.parsedCortexCircuitOpenMs),
    cortexModelFast: String(input.cortexModelFast || '').trim(),
    cortexModelDom: String(input.cortexModelDom || '').trim(),
    cortexModelReasoningDeep: String(input.cortexModelReasoningDeep || '').trim(),
    cortexModelVision: String(input.cortexModelVision || '').trim(),
    cortexModelSearchFast: String(input.cortexModelSearchFast || '').trim(),
    cortexModelRerankFast: String(input.cortexModelRerankFast || '').trim(),
    cortexAutoStart: input.cortexAutoStart,
    cortexEscalateConfidenceLt: Math.max(0, Math.min(1, input.parsedCortexEscalateConfidenceLt)),
    cortexEscalateIfConflict: input.cortexEscalateIfConflict,
    cortexEscalateCriticalOnly: input.cortexEscalateCriticalOnly,
    cortexMaxDeepFieldsPerProduct: Math.max(1, input.parsedCortexMaxDeepFieldsPerProduct),
  };
}
