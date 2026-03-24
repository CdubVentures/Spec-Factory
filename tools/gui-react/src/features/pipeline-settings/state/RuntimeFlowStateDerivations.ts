import type { RuntimeStepId } from './RuntimeFlowStepRegistry';

interface RuntimeFlowControlLockInputs {
  dynamicCrawleeEnabled: boolean;
  reextractIndexed: boolean;
  runtimeTraceEnabled: boolean;
}

interface RuntimeFlowStepEnabledInputs {
  dynamicCrawleeEnabled: boolean;
}

export interface RuntimeFlowControlLocks {
  dynamicFetchControlsLocked: boolean;
  plannerControlsLocked: boolean;
  plannerModelLocked: boolean;
  triageModelLocked: boolean;
  reextractWindowLocked: boolean;
  traceControlsLocked: boolean;
}

export function deriveRuntimeFlowControlLocks({
  dynamicCrawleeEnabled,
  reextractIndexed,
  runtimeTraceEnabled,
}: RuntimeFlowControlLockInputs): RuntimeFlowControlLocks {
  return {
    dynamicFetchControlsLocked: !dynamicCrawleeEnabled,
    plannerControlsLocked: false,
    plannerModelLocked: false,
    triageModelLocked: false,
    reextractWindowLocked: !reextractIndexed,
    traceControlsLocked: !runtimeTraceEnabled,
  };
}

export function deriveRuntimeStepEnabledMap({
  dynamicCrawleeEnabled,
}: RuntimeFlowStepEnabledInputs): Record<RuntimeStepId, boolean> {
  return {
    'run-setup': true,
    'run-output': true,
    'automation': true,
    'observability-trace': true,
    'fetch-network': true,
    'browser-rendering': dynamicCrawleeEnabled,
    'parsing': true,
  };
}
