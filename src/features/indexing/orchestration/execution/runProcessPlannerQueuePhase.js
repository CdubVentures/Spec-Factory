import { createProcessPlannerQueuePhaseState } from './createProcessPlannerQueuePhaseState.js';
import { createPlannerQueueRuntime } from './createPlannerQueueRuntime.js';
import { runPlannerQueueDispatchPhase } from './runPlannerQueueDispatchPhase.js';

export async function runProcessPlannerQueuePhase({
  initialState = {},
  context = {},
  plannerQueueRuntime = null,
  createPlannerQueueRuntimeFn = createPlannerQueueRuntime,
  runPlannerQueueDispatchPhaseFn = runPlannerQueueDispatchPhase,
} = {}) {
  const resolvedPlannerQueueRuntime = plannerQueueRuntime || createPlannerQueueRuntimeFn({ context });
  const initialRuntimeOverrides = initialState.runtimeOverrides === undefined
    ? resolvedPlannerQueueRuntime.getRuntimeOverrides()
    : initialState.runtimeOverrides;
  const processPlannerQueuePhaseState = createProcessPlannerQueuePhaseState({
    initialState: {
      ...initialState,
      runtimeOverrides: initialRuntimeOverrides,
    },
  });

  const plannerQueueDispatchState = await runPlannerQueueDispatchPhaseFn({
    ...resolvedPlannerQueueRuntime.buildPlannerQueueDispatchInput({
      state: {
        runtimePauseAnnounced: processPlannerQueuePhaseState.getRuntimePauseAnnounced(),
        fetchWorkerSeq: processPlannerQueuePhaseState.getFetchWorkerSeq(),
        artifactSequence: processPlannerQueuePhaseState.getArtifactSequence(),
        runtimeOverrides: processPlannerQueuePhaseState.getRuntimeOverrides(),
      },
    }),
  });

  processPlannerQueuePhaseState.setRuntimePauseAnnounced(plannerQueueDispatchState.runtimePauseAnnounced);
  processPlannerQueuePhaseState.setFetchWorkerSeq(plannerQueueDispatchState.fetchWorkerSeq);
  processPlannerQueuePhaseState.setArtifactSequence(plannerQueueDispatchState.artifactSequence);
  processPlannerQueuePhaseState.setTerminalReason(plannerQueueDispatchState.terminalReason);
  processPlannerQueuePhaseState.setPhaseState({
    phase08FieldContexts: plannerQueueDispatchState.phase08FieldContexts || initialState.phase08FieldContexts || [],
    phase08PrimeRows: plannerQueueDispatchState.phase08PrimeRows || initialState.phase08PrimeRows || [],
    llmSourcesUsed: plannerQueueDispatchState.llmSourcesUsed || initialState.llmSourcesUsed || [],
    llmCandidatesAccepted: plannerQueueDispatchState.llmCandidatesAccepted || initialState.llmCandidatesAccepted || [],
  });

  return processPlannerQueuePhaseState.toResult();
}
