export function buildSourceSkipBeforeFetchPhaseContext({
  logger,
  resumeCooldownSkippedUrls,
  frontierDb,
  noteHostRetryTsFn,
  resolveHostBudgetStateFn,
} = {}) {
  return {
    logger,
    resumeCooldownSkippedUrls,
    frontierDb,
    noteHostRetryTsFn,
    resolveHostBudgetStateFn,
  };
}
