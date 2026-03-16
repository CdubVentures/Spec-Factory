import { isDiscoveryOnlySourceUrl, isHttpPreferredStaticSourceUrl } from '../shared/urlHelpers.js';

export async function runSourceFetchPhase({
  workerId = '',
  source = {},
  sourceHost = '',
  hostBudgetRow = { started_count: 0, completed_count: 0 },
  fetcher = null,
  fetcherMode = '',
  fetchModeOverride = '',
  fetchWithModeFn = null,
  config = {},
  logger = null,
  fetchHostConcurrencyGate = null,
  runWithRetryFn = async (task) => task(),
  classifyFetchOutcomeFn = () => 'error',
  bumpHostOutcomeFn = () => {},
  applyHostBudgetBackoffFn = () => {},
  resolveHostBudgetStateFn = () => ({ score: 0, state: 'open' }),
  toIntFn = (value, fallback = 0) => Number(value || fallback),
  resumeFetchFailedUrls = new Set(),
  frontierDb = null,
  productId = '',
  maybeApplyBlockedDomainCooldownFn = () => {},
  repairQueryContext = {},
  maybeEmitRepairQueryFn = () => false,
  traceWriter = null,
  nowMsFn = () => Date.now(),
} = {}) {
  const sourceRequiresJs = Boolean(source?.requires_js) || source?.crawlConfig?.method === 'playwright';
  const discoveryOnlySource = isDiscoveryOnlySourceUrl(String(source?.url || '').trim());
  const staticHttpPreferredSource = isHttpPreferredStaticSourceUrl(source);
  const requestedFetchMode = String(
    fetchModeOverride
    || (discoveryOnlySource ? 'http' : '')
    || (staticHttpPreferredSource ? 'http' : '')
    || (sourceRequiresJs ? 'playwright' : '')
    || fetcherMode
    || ''
  ).trim() || 'playwright';
  const finalizeFetchFailure = async ({
    status = 0,
    message = '',
    contentType = '',
    html = '',
    bytes = 0,
    fetchDurationMs = 0,
    fetcherModeUsed = requestedFetchMode,
  } = {}) => {
    const failureMessage = String(message || (status > 0 ? `HTTP ${status}` : 'fetch failed')).trim() || 'fetch failed';
    const fetchFailureOutcome = classifyFetchOutcomeFn({
      status,
      message: failureMessage,
      contentType,
      html,
    });
    hostBudgetRow.completed_count += 1;
    bumpHostOutcomeFn(hostBudgetRow, fetchFailureOutcome);
    applyHostBudgetBackoffFn(hostBudgetRow, {
      status,
      outcome: fetchFailureOutcome,
      config,
    });
    const hostBudgetAfterFailure = resolveHostBudgetStateFn(hostBudgetRow);
    logger?.error?.('source_fetch_failed', {
      url: source.url,
      host: source.host,
      fetcher_kind: fetcherModeUsed,
      fetch_ms: fetchDurationMs,
      status,
      outcome: fetchFailureOutcome,
      host_budget_score: hostBudgetAfterFailure.score,
      host_budget_state: hostBudgetAfterFailure.state,
      message: failureMessage,
    });
    resumeFetchFailedUrls.add(String(source.url || '').trim());
    const frontierFetchRow = frontierDb?.recordFetch?.({
      productId,
      url: source.url,
      status,
      elapsedMs: fetchDurationMs,
      error: failureMessage,
    });
    const cooldownUntil = String(
      frontierFetchRow?.cooldown?.next_retry_ts || frontierFetchRow?.cooldown_next_retry_ts || ''
    ).trim();
    const repairReason = status === 410
      ? 'status_410'
      : status === 404
        ? 'status_404'
        : '';
    if (repairReason) {
      logger?.info?.('repair_handoff_evaluated', {
        source_url: String(source.url || '').trim() || null,
        host: String(source.host || sourceHost || '').trim() || null,
        status,
        outcome: fetchFailureOutcome,
        reason: repairReason,
        cooldown_until: cooldownUntil || null,
        failure_stage: 'fetch_failure',
        decision: 'emit'
      });
      maybeEmitRepairQueryFn({
        ...repairQueryContext,
        source,
        sourceUrl: source.url,
        statusCode: status,
        reason: repairReason,
        cooldownUntil,
        logger: repairQueryContext.logger || logger,
      });
    } else {
      logger?.info?.('repair_handoff_evaluated', {
        source_url: String(source.url || '').trim() || null,
        host: String(source.host || sourceHost || '').trim() || null,
        status,
        outcome: fetchFailureOutcome,
        reason: null,
        cooldown_until: cooldownUntil || null,
        failure_stage: 'fetch_failure',
        decision: 'skip',
        skip_reason: 'status_not_repairable'
      });
    }
    maybeApplyBlockedDomainCooldownFn({
      source,
      statusCode: status,
      message: failureMessage,
    });
    if (traceWriter) {
      const fetchTrace = await traceWriter.writeJson({
        section: 'fetch',
        prefix: 'fetch',
        payload: {
          url: source.url,
          host: source.host,
          status,
          fetch_ms: fetchDurationMs,
          outcome: fetchFailureOutcome,
          error: failureMessage,
          bytes,
        },
        ringSize: Math.max(10, toIntFn(config.runtimeTraceFetchRing, 30)),
      });
      logger?.info?.('fetch_trace_written', {
        url: source.url,
        status,
        content_type: contentType || null,
        trace_path: fetchTrace.trace_path,
      });
    }
    return {
      ok: false,
      error: new Error(failureMessage),
      fetchFailureOutcome,
      fetcherModeUsed,
    };
  };

  source.worker_id = workerId;
  hostBudgetRow.started_count += 1;
  const hostBudgetAtStart = resolveHostBudgetStateFn(hostBudgetRow);
  logger?.info?.('source_fetch_started', {
    url: source.url,
    host: source.host,
    tier: source.tier,
    role: source.role,
    approved_domain: source.approvedDomain,
    fetcher_kind: requestedFetchMode,
    host_budget_score: hostBudgetAtStart.score,
    host_budget_state: hostBudgetAtStart.state
  });

  const fetchStartedAtMs = nowMsFn();
  try {
    const sourceFetchWrapperAttempts = Math.max(1, toIntFn(config.sourceFetchWrapperAttempts, 1));
    const sourceFetchWrapperBackoffMs = Math.max(0, toIntFn(config.sourceFetchWrapperBackoffMs, 0));
    const pageData = await fetchHostConcurrencyGate.run({
      key: sourceHost || source.host,
      task: () =>
        runWithRetryFn(
          () => {
            if (typeof fetchWithModeFn === 'function') {
              return fetchWithModeFn(source, requestedFetchMode);
            }
            return fetcher.fetch(source);
          },
          {
            attempts: sourceFetchWrapperAttempts,
            shouldRetry: (error, { attempt, maxAttempts }) => {
              if (attempt >= maxAttempts) {
                return false;
              }
              const message = String(error?.message || '').toLowerCase();
              return (
                message.includes('no_result')
                || message.includes('timeout')
                || message.includes('timed out')
                || message.includes('network')
              );
            },
            onRetry: (error, { attempt, maxAttempts }) => {
              logger?.warn?.('source_fetch_wrapper_retry', {
                url: source.url,
                host: source.host,
                attempt,
                max_attempts: maxAttempts,
                reason: String(error?.message || 'retryable_error')
              });
            },
            backoffMs: sourceFetchWrapperBackoffMs
          }
        )
    });
    const fetchDurationMs = Math.max(0, nowMsFn() - fetchStartedAtMs);
    const fetcherModeUsed = String(pageData?.fetchTelemetry?.fetcher_kind || requestedFetchMode).trim() || requestedFetchMode;
    const fetchStatus = Number.parseInt(String(pageData?.status || 0), 10) || 0;
    const fetchContentType = String(pageData?.contentType || pageData?.content_type || '').trim();
    const shouldTreatFetchResultAsFailure = (
      fetchStatus === 0
      || fetchStatus >= 400
      || Boolean(pageData?.blockedByRobots)
      || pageData?.ok === false
    );
    if (shouldTreatFetchResultAsFailure) {
      return finalizeFetchFailure({
        status: fetchStatus,
        message: String(pageData?.error || '').trim(),
        contentType: fetchContentType,
        html: pageData?.html || '',
        bytes: toIntFn(pageData?.bytes, 0),
        fetchDurationMs,
        fetcherModeUsed,
      });
    }
    return {
      ok: true,
      pageData,
      fetchDurationMs,
      fetcherModeUsed,
    };
  } catch (error) {
    return finalizeFetchFailure({
      status: 0,
      message: error.message,
      fetchDurationMs: Math.max(0, nowMsFn() - fetchStartedAtMs),
      fetcherModeUsed: requestedFetchMode,
    });
  }
}
