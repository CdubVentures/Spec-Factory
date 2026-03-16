import type { RuntimeStepId } from './RuntimeFlowStepRegistry';

interface RuntimeFlowControlLockInputs {
  dynamicCrawleeEnabled: boolean;
  scannedPdfOcrEnabled: boolean;
  phase2LlmEnabled: boolean;
  reextractIndexed: boolean;
  runtimeTraceEnabled: boolean;
}

interface RuntimeFlowStepEnabledInputs {
  dynamicCrawleeEnabled: boolean;
  scannedPdfOcrEnabled: boolean;
}

export interface RuntimeFlowControlLocks {
  dynamicFetchControlsLocked: boolean;
  ocrControlsLocked: boolean;
  plannerControlsLocked: boolean;
  plannerModelLocked: boolean;
  triageModelLocked: boolean;
  reextractWindowLocked: boolean;
  traceControlsLocked: boolean;
}

export function deriveRuntimeFlowControlLocks({
  dynamicCrawleeEnabled,
  scannedPdfOcrEnabled,
  phase2LlmEnabled,
  reextractIndexed,
  runtimeTraceEnabled,
}: RuntimeFlowControlLockInputs): RuntimeFlowControlLocks {
  return {
    dynamicFetchControlsLocked: !dynamicCrawleeEnabled,
    ocrControlsLocked: !scannedPdfOcrEnabled,
    plannerControlsLocked: false,
    plannerModelLocked: !phase2LlmEnabled,
    triageModelLocked: false,
    reextractWindowLocked: !reextractIndexed,
    traceControlsLocked: !runtimeTraceEnabled,
  };
}

export function deriveRuntimeStepEnabledMap({
  dynamicCrawleeEnabled,
  scannedPdfOcrEnabled,
}: RuntimeFlowStepEnabledInputs): Record<RuntimeStepId, boolean> {
  return {
    'run-setup': true,
    'run-output': true,
    'scoring-evidence': true,
    'automation': true,
    'observability-trace': true,
    'fetch-network': true,
    'browser-rendering': dynamicCrawleeEnabled,
    'parsing': true,
    ocr: scannedPdfOcrEnabled,
    'planner-triage': true,
    'llm-cortex': true,
  };
}
