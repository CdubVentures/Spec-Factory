import type { LlmCallRecord, LlmCallSummary, Operation } from './operationsStore.ts';

function isPendingCall(call: LlmCallRecord): boolean {
  return call.response === null || call.response === undefined;
}

function fromLegacyCall(call: LlmCallRecord): LlmCallSummary {
  return {
    callIndex: call.callIndex,
    ...(call.callId ? { callId: call.callId } : {}),
    timestamp: call.timestamp,
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
    responseStatus: isPendingCall(call) ? 'pending' : 'done',
  };
}

export function selectActiveLlmCallSummaries(op: Operation): ReadonlyArray<LlmCallSummary> {
  if (op.activeLlmCalls && op.activeLlmCalls.length > 0) return op.activeLlmCalls;
  return op.llmCalls.filter(isPendingCall).map(fromLegacyCall);
}
