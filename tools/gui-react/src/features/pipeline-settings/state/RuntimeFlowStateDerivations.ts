import type { RuntimeStepId } from './RuntimeFlowStepRegistry';

interface RuntimeFlowControlLockInputs {
  runtimeTraceEnabled: boolean;
}

export interface RuntimeFlowControlLocks {
  plannerControlsLocked: boolean;
  plannerModelLocked: boolean;
  triageModelLocked: boolean;
  traceControlsLocked: boolean;
}

export function deriveRuntimeFlowControlLocks({
  runtimeTraceEnabled,
}: RuntimeFlowControlLockInputs): RuntimeFlowControlLocks {
  return {
    plannerControlsLocked: false,
    plannerModelLocked: false,
    triageModelLocked: false,
    traceControlsLocked: !runtimeTraceEnabled,
  };
}

export function deriveRuntimeStepEnabledMap(): Record<RuntimeStepId, boolean> {
  return {
    'run-setup': true,
    'run-output': true,
    'automation': true,
    'observability-trace': true,
    'fetch-network': true,
    'browser-rendering': true,
    'parsing': true,
  };
}
