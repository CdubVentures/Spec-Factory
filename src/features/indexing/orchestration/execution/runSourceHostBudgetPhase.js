export function runSourceHostBudgetPhase({
  hostBudgetRow = {
    completed_count: 0,
    parse_fail_count: 0,
    evidence_used: 0
  },
  pageData = {},
  sourceFetchOutcome = '',
  knownCandidatesFromSource = [],
  sourceStatusCode = 0,
  frontierFetchRow = null,
  config = {},
  bumpHostOutcomeFn = () => {},
  noteHostRetryTsFn = () => {},
  applyHostBudgetBackoffFn = () => {},
  resolveHostBudgetStateFn = () => ({
    score: 0,
    state: 'open'
  }),
} = {}) {
  hostBudgetRow.completed_count += 1;
  const isRobotsBlock = Boolean(pageData.blockedByRobots);
  bumpHostOutcomeFn(hostBudgetRow, isRobotsBlock ? 'not_found' : sourceFetchOutcome);
  if (sourceFetchOutcome === 'bad_content') {
    hostBudgetRow.parse_fail_count += 1;
  }
  if (knownCandidatesFromSource.length > 0) {
    hostBudgetRow.evidence_used += 1;
  }

  const hostCooldownUntil = String(
    frontierFetchRow?.cooldown?.next_retry_ts || frontierFetchRow?.cooldown_next_retry_ts || ''
  ).trim();
  if (hostCooldownUntil) {
    noteHostRetryTsFn(hostBudgetRow, hostCooldownUntil);
  } else if (!isRobotsBlock) {
    applyHostBudgetBackoffFn(hostBudgetRow, {
      status: sourceStatusCode,
      outcome: sourceFetchOutcome,
      config
    });
  }

  return {
    hostBudgetAfterSource: resolveHostBudgetStateFn(hostBudgetRow),
  };
}
