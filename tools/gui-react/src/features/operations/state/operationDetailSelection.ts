import type { LlmCallRecord, LlmCallSummary, Operation } from './operationsStore.ts';

function activeSummaryToPendingCall(call: LlmCallSummary): LlmCallRecord {
  return {
    callIndex: call.callIndex,
    ...(call.callId ? { callId: call.callId } : {}),
    timestamp: call.timestamp,
    prompt: { system: '', user: '' },
    response: null,
    ...(call.model ? { model: call.model } : {}),
    ...(call.variant ? { variant: call.variant } : {}),
    ...(call.mode ? { mode: call.mode } : {}),
    ...(call.lane ? { lane: call.lane } : {}),
    ...(call.label ? { label: call.label } : {}),
    ...(call.isFallback !== undefined ? { isFallback: call.isFallback } : {}),
    ...(call.thinking !== undefined ? { thinking: call.thinking } : {}),
    ...(call.webSearch !== undefined ? { webSearch: call.webSearch } : {}),
    ...(call.effortLevel ? { effortLevel: call.effortLevel } : {}),
    ...(call.accessMode ? { accessMode: call.accessMode } : {}),
    ...(call.usage !== undefined ? { usage: call.usage } : {}),
  };
}

function activeCallPlaceholders(summary: Operation): ReadonlyArray<LlmCallRecord> {
  const activeCalls = summary.activeLlmCalls ?? [];
  if (activeCalls.length === 0) return [];
  return activeCalls.map(activeSummaryToPendingCall);
}

export function selectOperationDetailDisplay(
  summary: Operation,
  detail: Operation | null | undefined,
): Operation {
  const base = detail ?? summary;
  if (base.llmCalls.length > 0) return base;

  const placeholders = activeCallPlaceholders(summary);
  if (placeholders.length === 0) return base;

  return { ...base, llmCalls: placeholders };
}
