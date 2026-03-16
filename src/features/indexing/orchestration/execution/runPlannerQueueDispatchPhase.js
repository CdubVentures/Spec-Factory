export async function runPlannerQueueDispatchPhase({
  config = {},
  planner,
  initialMode = '',
  startMs = 0,
  runtimePauseAnnounced = false,
  fetchWorkerSeq = 0,
  artifactSequence = 0,
  sourcePreflightDispatchContext,
  sourceFetchProcessingDispatchContext,
  sourceSkipDispatchContext,
  logger,
  runSourcePreflightDispatchPhaseFn,
  resolveSourcePreflightDispatchStateFn,
  runSourceFetchProcessingDispatchPhaseFn,
  buildSourceQueuePhasePayloadFn,
  resolveSourceFetchProcessingDispatchStateFn,
  runSourceSkipDispatchPhaseFn,
  runFetchSchedulerDrainFn,
  buildFetchSchedulerDrainContextFn,
  buildFetchSchedulerDrainPhaseCallsiteContextFn,
  createFetchScheduler,
  nowMsFn = () => Date.now(),
} = {}) {
  let currentRuntimePauseAnnounced = Boolean(runtimePauseAnnounced);
  let currentFetchWorkerSeq = Number(fetchWorkerSeq || 0);
  let currentArtifactSequence = Number(artifactSequence || 0);
  let currentTerminalReason = '';

  const buildFetchError = (sourceFetch = {}) => {
    const sourceFetchError = sourceFetch.error;
    if (sourceFetchError instanceof Error) {
      sourceFetchError.fetchFailureOutcome = sourceFetch.fetchFailureOutcome;
      sourceFetchError.fetcherModeUsed = sourceFetch.fetcherModeUsed;
      return sourceFetchError;
    }

    const fallbackMessage = String(sourceFetch.fetchFailureOutcome || 'source_fetch_failed').trim() || 'source_fetch_failed';
    const fetchError = new Error(fallbackMessage);
    fetchError.fetchFailureOutcome = sourceFetch.fetchFailureOutcome;
    fetchError.fetcherModeUsed = sourceFetch.fetcherModeUsed;
    return fetchError;
  };

  const processPreflight = async () => {
    const sourcePreflightDispatchResult = await runSourcePreflightDispatchPhaseFn({
      runtimePauseAnnounced: currentRuntimePauseAnnounced,
      ...sourcePreflightDispatchContext,
    });
    const sourcePreflightDispatchState = resolveSourcePreflightDispatchStateFn({
      sourcePreflightDispatchResult,
    });

    currentRuntimePauseAnnounced = Boolean(sourcePreflightDispatchState.runtimePauseAnnounced);
    return sourcePreflightDispatchState.preflight || null;
  };

  const processPreflightPayload = async (
    preflight,
    {
      fetchModeOverride = '',
      skipBeforeFetch = true,
      throwOnFetchFailure = false,
    } = {}
  ) => {
    if (!preflight || preflight.mode !== 'process') {
      return { ok: false, skipped: true };
    }

    if (skipBeforeFetch) {
      const skipped = await runSourceSkipDispatchPhaseFn({
        preflight,
        ...sourceSkipDispatchContext,
      });

      if (skipped) {
        return { ok: false, skipped: true };
      }
    }

    const phasePayload = {
      ...buildSourceQueuePhasePayloadFn({ preflight }),
      fetchModeOverride,
    };
    const sourceFetchProcessingDispatchResult = await runSourceFetchProcessingDispatchPhaseFn({
      phasePayload,
      fetchWorkerSeq: currentFetchWorkerSeq,
      artifactSequence: currentArtifactSequence,
      ...sourceFetchProcessingDispatchContext,
    });
    const sourceFetchProcessingDispatchState = resolveSourceFetchProcessingDispatchStateFn({
      sourceFetchProcessingDispatchResult,
      fetchWorkerSeq: currentFetchWorkerSeq,
      artifactSequence: currentArtifactSequence,
    });

    currentFetchWorkerSeq = Number(sourceFetchProcessingDispatchState.fetchWorkerSeq || currentFetchWorkerSeq);
    currentArtifactSequence = Number(sourceFetchProcessingDispatchState.artifactSequence || currentArtifactSequence);

    if (!sourceFetchProcessingDispatchState.sourceFetchOk && throwOnFetchFailure) {
      throw buildFetchError(
        sourceFetchProcessingDispatchState.sourceFetch
        || sourceFetchProcessingDispatchResult.sourceFetch
        || {}
      );
    }

    return {
      ok: Boolean(sourceFetchProcessingDispatchState.sourceFetchOk),
      skipped: false,
      sourceFetch: sourceFetchProcessingDispatchState.sourceFetch || sourceFetchProcessingDispatchResult.sourceFetch || null,
    };
  };

  const shouldStopScheduler = () => {
    const elapsedMs = Math.max(0, nowMsFn() - startMs);
    const maxRunMs = Number(config.maxRunSeconds || 0) * 1000;
    return maxRunMs > 0 && elapsedMs >= maxRunMs;
  };

  if (config.fetchSchedulerEnabled) {
    while (planner?.hasNext?.() && !shouldStopScheduler()) {
      const schedulerContext = buildFetchSchedulerDrainContextFn({
        ...buildFetchSchedulerDrainPhaseCallsiteContextFn({
          planner,
          config,
          initialMode,
          prepareNextPlannerSource: processPreflight,
          fetchFn: (preflight) => processPreflightPayload(preflight, { throwOnFetchFailure: true }),
          fetchWithModeFn: (preflight, fetchModeOverride) => processPreflightPayload(preflight, {
            fetchModeOverride,
            skipBeforeFetch: false,
            throwOnFetchFailure: true,
          }),
          shouldSkipPreflight: (preflight) => !preflight || preflight.mode !== 'process',
          shouldStopScheduler,
          classifyOutcomeFn: (error) => {
            if (error?.fetchFailureOutcome) {
              return error.fetchFailureOutcome;
            }
            return String(error?.fetchFailureOutcome || '').trim() || 'fetch_error';
          },
          handleSchedulerFetchError: (preflight, error) => {
            logger?.error?.('fetch_scheduler_drain_failed', {
              url: preflight?.source?.url || '',
              message: error?.message || String(error || ''),
            });
          },
          handleSchedulerSkipped: (preflight) => {
            logger?.info?.('scheduler_source_skipped', {
              url: preflight?.source?.url || '',
            });
          },
          emitSchedulerEvent: (name, payload) => {
            logger?.info?.(name, payload);
          },
          createFetchScheduler,
        }),
      });

      await runFetchSchedulerDrainFn(schedulerContext);
    }

    return {
      runtimePauseAnnounced: currentRuntimePauseAnnounced,
      fetchWorkerSeq: currentFetchWorkerSeq,
      artifactSequence: currentArtifactSequence,
      ...(currentTerminalReason ? { terminalReason: currentTerminalReason } : {}),
    };
  }

  while (planner?.hasNext?.()) {
    const preflight = await processPreflight();
    if (!preflight) {
      break;
    }
    if (preflight.mode === 'stop') {
      currentTerminalReason = 'max_run_seconds_reached';
      break;
    }

    await processPreflightPayload(preflight);
  }

  return {
    runtimePauseAnnounced: currentRuntimePauseAnnounced,
    fetchWorkerSeq: currentFetchWorkerSeq,
    artifactSequence: currentArtifactSequence,
    ...(currentTerminalReason ? { terminalReason: currentTerminalReason } : {}),
  };
}
