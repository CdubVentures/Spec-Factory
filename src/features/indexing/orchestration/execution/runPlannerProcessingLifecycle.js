function collectRepairEventsFromLogger({
  logger = {},
  config = {},
} = {}) {
  return (logger.events || [])
    .filter((eventRow) => eventRow && eventRow.event === 'repair_query_enqueued')
    .map((eventRow) => ({
      domain: String(eventRow.domain || eventRow.host || '').trim(),
      query: String(eventRow.query || '').trim(),
      field_targets: eventRow.field_targets || [],
      provider: String(eventRow.provider || config.searchEngines || '').trim(),
      reason: String(eventRow.reason || '').trim(),
      source_url: String(eventRow.source_url || '').trim(),
    }));
}

function refreshTerminalReasonFromBudget({
  terminalReason = '',
  config = {},
  startMs = 0,
  nowFn = () => Date.now(),
} = {}) {
  if (terminalReason) {
    return String(terminalReason).trim();
  }

  const maxRunMs = Number(config.maxRunSeconds || 0) * 1000;
  if (maxRunMs > 0 && (nowFn() - startMs) >= maxRunMs) {
    return 'max_run_seconds_reached';
  }

  return '';
}

function mergePlannerProcessingState(currentState = {}, nextState = {}) {
  return {
    ...currentState,
    ...nextState,
    runtimePauseAnnounced:
      nextState.runtimePauseAnnounced === undefined
        ? currentState.runtimePauseAnnounced
        : nextState.runtimePauseAnnounced,
    artifactSequence:
      nextState.artifactSequence === undefined
        ? currentState.artifactSequence
        : nextState.artifactSequence,
    phase08FieldContexts:
      nextState.phase08FieldContexts === undefined
        ? currentState.phase08FieldContexts
        : nextState.phase08FieldContexts,
    phase08PrimeRows:
      nextState.phase08PrimeRows === undefined
        ? currentState.phase08PrimeRows
        : nextState.phase08PrimeRows,
    llmSourcesUsed:
      nextState.llmSourcesUsed === undefined
        ? currentState.llmSourcesUsed
        : nextState.llmSourcesUsed,
    llmCandidatesAccepted:
      nextState.llmCandidatesAccepted === undefined
        ? currentState.llmCandidatesAccepted
        : nextState.llmCandidatesAccepted,
    terminalReason: String(
      nextState.terminalReason === undefined
        ? currentState.terminalReason || ''
        : nextState.terminalReason || '',
    ).trim(),
    hypothesisFollowupRoundsExecuted:
      nextState.hypothesisFollowupRoundsExecuted === undefined
        ? currentState.hypothesisFollowupRoundsExecuted
        : nextState.hypothesisFollowupRoundsExecuted,
    hypothesisFollowupSeededUrls:
      nextState.hypothesisFollowupSeededUrls === undefined
        ? currentState.hypothesisFollowupSeededUrls
        : nextState.hypothesisFollowupSeededUrls,
  };
}

export async function runPlannerProcessingLifecycle({
  initialState = {},
  logger = {},
  config = {},
  planner = {},
  startMs = 0,
  nowFn = () => Date.now(),
  processPlannerQueueFn = async () => ({}),
  runRepairSearchPhaseFn = async () => ({}),
  runSearchFn = async () => [],
  buildHypothesisFollowupsContextFn = (state = {}) => state,
  runHypothesisFollowupsFn = async () => ({}),
  resolveHypothesisFollowupStateFn = ({ followupResult = {} } = {}) => followupResult,
  stopFetchersFn = async () => {},
} = {}) {
  let state = mergePlannerProcessingState(initialState, {});

  const runProcessPlannerQueueAndMerge = async () => {
    const nextState = await processPlannerQueueFn(state);
    state = mergePlannerProcessingState(state, nextState);
    return nextState;
  };

  try {
    await runProcessPlannerQueueAndMerge();
    state = mergePlannerProcessingState(state, {
      terminalReason: refreshTerminalReasonFromBudget({
        terminalReason: state.terminalReason,
        config,
        startMs,
        nowFn,
      }),
    });

    const repairEvents = collectRepairEventsFromLogger({ logger, config });
    if (!state.terminalReason && repairEvents.length > 0) {
      await runRepairSearchPhaseFn({
        logger,
        repairEvents,
        planner,
        config,
        processPlannerQueueFn: runProcessPlannerQueueAndMerge,
        runSearchFn,
        startMs,
        nowFn,
      });
    }

    state = mergePlannerProcessingState(state, {
      terminalReason: refreshTerminalReasonFromBudget({
        terminalReason: state.terminalReason,
        config,
        startMs,
        nowFn,
      }),
    });

    if (!state.terminalReason) {
      const followupResult = await runHypothesisFollowupsFn(
        buildHypothesisFollowupsContextFn(state),
      );
      state = mergePlannerProcessingState(
        state,
        resolveHypothesisFollowupStateFn({ followupResult }),
      );
    }

    state = mergePlannerProcessingState(state, {
      terminalReason: refreshTerminalReasonFromBudget({
        terminalReason: state.terminalReason,
        config,
        startMs,
        nowFn,
      }),
    });

    return state;
  } finally {
    await stopFetchersFn();
  }
}
