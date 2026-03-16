export function runSourceSkipBeforeFetchPhase({
  runtimeOverrides = {},
  source = {},
  sourceHost = '',
  hostBudgetRow = { dedupe_hits: 0 },
  logger = null,
  resumeCooldownSkippedUrls = new Set(),
  frontierDb = null,
  noteHostRetryTsFn = () => {},
  resolveHostBudgetStateFn = () => ({ score: 0, state: 'open' }),
} = {}) {
  if ((runtimeOverrides.blocked_domains || []).includes(String(source.host || '').toLowerCase().replace(/^www\./, ''))) {
    logger?.info?.('runtime_domain_block_applied', {
      host: source.host,
      url: source.url
    });
    resumeCooldownSkippedUrls.add(String(source.url || '').trim());
    return true;
  }

  const cooldownDecision = frontierDb?.shouldSkipUrl?.(source.url) || { skip: false };
  if (cooldownDecision.skip) {
    hostBudgetRow.dedupe_hits += 1;
    noteHostRetryTsFn(hostBudgetRow, cooldownDecision.next_retry_ts || '');
    const hostBudget = resolveHostBudgetStateFn(hostBudgetRow);
    logger?.info?.('source_fetch_skipped', {
      url: source.url,
      host: sourceHost || source.host || '',
      skip_reason: 'cooldown',
      reason: cooldownDecision.reason || 'frontier_cooldown',
      next_retry_ts: cooldownDecision.next_retry_ts || null,
      host_budget_score: hostBudget.score,
      host_budget_state: hostBudget.state
    });
    logger?.info?.('url_cooldown_applied', {
      url: source.url,
      status: null,
      cooldown_seconds: null,
      next_retry_ts: cooldownDecision.next_retry_ts || null,
      reason: cooldownDecision.reason || 'frontier_cooldown'
    });
    resumeCooldownSkippedUrls.add(String(source.url || '').trim());
    return true;
  }

  const hostBudgetBeforeFetch = resolveHostBudgetStateFn(hostBudgetRow);
  if (hostBudgetBeforeFetch.state === 'blocked') {
    logger?.info?.('source_fetch_skipped', {
      url: source.url,
      host: sourceHost || source.host || '',
      skip_reason: 'blocked_budget',
      reason: 'host_budget_blocked',
      next_retry_ts: hostBudgetBeforeFetch.next_retry_ts || null,
      host_budget_score: hostBudgetBeforeFetch.score,
      host_budget_state: hostBudgetBeforeFetch.state
    });
    resumeCooldownSkippedUrls.add(String(source.url || '').trim());
    return true;
  }
  if (hostBudgetBeforeFetch.state === 'backoff') {
    logger?.info?.('source_fetch_skipped', {
      url: source.url,
      host: sourceHost || source.host || '',
      skip_reason: 'retry_later',
      reason: 'host_budget_backoff',
      next_retry_ts: hostBudgetBeforeFetch.next_retry_ts || null,
      host_budget_score: hostBudgetBeforeFetch.score,
      host_budget_state: hostBudgetBeforeFetch.state
    });
    resumeCooldownSkippedUrls.add(String(source.url || '').trim());
    return true;
  }

  return false;
}
