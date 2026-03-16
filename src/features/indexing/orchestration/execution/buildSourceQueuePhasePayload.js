export function buildSourceQueuePhasePayload({
  preflight = {}
} = {}) {
  return {
    source: preflight.source,
    sourceHost: preflight.sourceHost,
    hostBudgetRow: preflight.hostBudgetRow,
  };
}
