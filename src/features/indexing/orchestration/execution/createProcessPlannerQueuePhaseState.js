export function createProcessPlannerQueuePhaseState({ initialState = {} } = {}) {
  let runtimePauseAnnounced = Boolean(initialState.runtimePauseAnnounced);
  let fetchWorkerSeq = Number.isFinite(Number(initialState.fetchWorkerSeq))
    ? Number(initialState.fetchWorkerSeq)
    : 0;
  let artifactSequence = Number.isFinite(Number(initialState.artifactSequence))
    ? Number(initialState.artifactSequence)
    : 0;
  let terminalReason = String(initialState.terminalReason || '').trim();
  let runtimeOverrides = initialState.runtimeOverrides || {};
  let phaseState = {
    phase08FieldContexts: initialState.phase08FieldContexts || [],
    phase08PrimeRows: initialState.phase08PrimeRows || [],
    llmSourcesUsed: initialState.llmSourcesUsed || [],
    llmCandidatesAccepted: initialState.llmCandidatesAccepted || [],
  };

  return {
    getRuntimePauseAnnounced() {
      return runtimePauseAnnounced;
    },
    setRuntimePauseAnnounced(value) {
      runtimePauseAnnounced = Boolean(value);
    },
    getFetchWorkerSeq() {
      return fetchWorkerSeq;
    },
    setFetchWorkerSeq(value) {
      fetchWorkerSeq = Number.isFinite(Number(value)) ? Number(value) : 0;
    },
    getArtifactSequence() {
      return artifactSequence;
    },
    setArtifactSequence(value) {
      artifactSequence = Number.isFinite(Number(value)) ? Number(value) : 0;
    },
    getTerminalReason() {
      return terminalReason;
    },
    setTerminalReason(value) {
      terminalReason = String(value || '').trim();
    },
    getRuntimeOverrides() {
      return runtimeOverrides;
    },
    setRuntimeOverrides(value) {
      runtimeOverrides = value || {};
    },
    getPhaseState() {
      return { ...phaseState };
    },
    setPhaseState(nextPhaseState = {}) {
      phaseState = {
        ...phaseState,
        ...nextPhaseState,
      };
    },
    toResult() {
      return {
        runtimePauseAnnounced,
        fetchWorkerSeq,
        artifactSequence,
        ...(terminalReason ? { terminalReason } : {}),
        ...phaseState,
      };
    },
  };
}

export const createProcessPlannerQueueMutableState = createProcessPlannerQueuePhaseState;
