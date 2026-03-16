import { createPlannerQueueRuntime } from './createPlannerQueueRuntime.js';
import { runPlannerQueueDispatchPhase } from './runPlannerQueueDispatchPhase.js';

export function buildProcessPlannerQueuePhaseCallsiteContext(context = {}) {
  return {
    plannerQueueRuntime: createPlannerQueueRuntime({
      context: { ...context },
    }),
    runPlannerQueueDispatchPhaseFn: runPlannerQueueDispatchPhase,
  };
}
