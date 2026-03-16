import { buildFetchSchedulerDrainContext } from '../bootstrap/buildFetchSchedulerDrainContext.js';
import { buildFetchSchedulerDrainPhaseCallsiteContext } from '../bootstrap/buildFetchSchedulerDrainPhaseCallsiteContext.js';
import { buildProcessPlannerQueueExecutionContexts } from './buildProcessPlannerQueueExecutionContexts.js';
import { buildSourceQueuePhasePayload } from './buildSourceQueuePhasePayload.js';
import { resolveSourceFetchProcessingDispatchState } from './resolveSourceFetchProcessingDispatchState.js';
import { resolveSourcePreflightDispatchState } from './resolveSourcePreflightDispatchState.js';
import { runFetchSchedulerDrain } from '../bootstrap/runFetchSchedulerDrain.js';
import { runSourceFetchProcessingDispatchPhase } from './runSourceFetchProcessingDispatchPhase.js';
import { runSourcePreflightDispatchPhase } from './runSourcePreflightDispatchPhase.js';
import { runSourceSkipDispatchPhase } from './runSourceSkipDispatchPhase.js';

function toNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function createPlannerQueueRuntime({
  context = {},
  buildProcessPlannerQueueExecutionContextsFn = buildProcessPlannerQueueExecutionContexts,
  runSourcePreflightDispatchPhaseFn = runSourcePreflightDispatchPhase,
  resolveSourcePreflightDispatchStateFn = resolveSourcePreflightDispatchState,
  runSourceFetchProcessingDispatchPhaseFn = runSourceFetchProcessingDispatchPhase,
  buildSourceQueuePhasePayloadFn = buildSourceQueuePhasePayload,
  resolveSourceFetchProcessingDispatchStateFn = resolveSourceFetchProcessingDispatchState,
  runSourceSkipDispatchPhaseFn = runSourceSkipDispatchPhase,
  runFetchSchedulerDrainFn = runFetchSchedulerDrain,
  buildFetchSchedulerDrainContextFn = buildFetchSchedulerDrainContext,
  buildFetchSchedulerDrainPhaseCallsiteContextFn = buildFetchSchedulerDrainPhaseCallsiteContext,
} = {}) {
  return {
    getRuntimeOverrides() {
      return context.runtimeOverrides || {};
    },
    buildPlannerQueueDispatchInput({ state = {} } = {}) {
      const runtimeOverrides = state.runtimeOverrides === undefined
        ? (context.runtimeOverrides || {})
        : (state.runtimeOverrides || {});
      const executionContexts = buildProcessPlannerQueueExecutionContextsFn({
        ...context,
        runtimeOverrides,
      });

      return {
        config: context.config,
        planner: context.planner,
        initialMode: context.fetcherMode,
        startMs: toNumber(context.startMs, 0),
        runtimePauseAnnounced: Boolean(state.runtimePauseAnnounced),
        fetchWorkerSeq: toNumber(state.fetchWorkerSeq, 0),
        artifactSequence: toNumber(state.artifactSequence, 0),
        sourcePreflightDispatchContext: executionContexts.sourcePreflightDispatchContext,
        sourceFetchProcessingDispatchContext: executionContexts.sourceFetchProcessingDispatchContext,
        sourceSkipDispatchContext: executionContexts.sourceSkipDispatchContext,
        logger: context.logger,
        runSourcePreflightDispatchPhaseFn,
        resolveSourcePreflightDispatchStateFn,
        runSourceFetchProcessingDispatchPhaseFn,
        buildSourceQueuePhasePayloadFn,
        resolveSourceFetchProcessingDispatchStateFn,
        runSourceSkipDispatchPhaseFn,
        runFetchSchedulerDrainFn,
        buildFetchSchedulerDrainContextFn,
        buildFetchSchedulerDrainPhaseCallsiteContextFn,
        createFetchScheduler: context.createFetchScheduler,
      };
    },
  };
}
