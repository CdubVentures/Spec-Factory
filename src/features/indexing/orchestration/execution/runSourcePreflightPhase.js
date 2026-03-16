export async function runSourcePreflightPhase({
  syncRuntimeOverridesFn = async () => ({}),
  applyRuntimeOverridesToPlannerFn = () => {},
  planner = {},
  llmContext = {},
  runtimePauseAnnounced = false,
  logger = null,
  runtimeControlKey = '',
  waitFn = async () => {},
  nowMsFn = () => Date.now(),
  startMs = 0,
  maxRunSeconds = 0,
  normalizeHostTokenFn = (value = '') => String(value || ''),
  hostFromHttpUrlFn = () => '',
  ensureHostBudgetRowFn = () => ({}),
  hostBudgetByHost = new Map(),
  attemptedSourceUrls = new Set(),
} = {}) {
  const runtimeOverrides = await syncRuntimeOverridesFn();
  applyRuntimeOverridesToPlannerFn(planner, runtimeOverrides);
  llmContext.forcedHighFields = runtimeOverrides.force_high_fields || [];

  if (runtimeOverrides.pause) {
    if (!runtimePauseAnnounced) {
      logger?.info?.('runtime_pause_applied', {
        reason: 'runtime_override',
        control_key: runtimeControlKey
      });
      runtimePauseAnnounced = true;
    }
    await waitFn(1000);
    return {
      runtimePauseAnnounced,
      preflight: { mode: 'skip' }
    };
  }

  if (runtimePauseAnnounced) {
    logger?.info?.('runtime_pause_resumed', {
      reason: 'runtime_override'
    });
    runtimePauseAnnounced = false;
  }

  const elapsedSeconds = (nowMsFn() - startMs) / 1000;
  if (elapsedSeconds >= maxRunSeconds) {
    logger?.warn?.('max_run_seconds_reached', { maxRunSeconds });
    return {
      runtimePauseAnnounced,
      preflight: { mode: 'stop' }
    };
  }

  const source = planner?.next?.();
  if (!source) {
    return {
      runtimePauseAnnounced,
      preflight: { mode: 'skip' }
    };
  }

  const sourceHost = normalizeHostTokenFn(source.host || hostFromHttpUrlFn(source.url || ''));
  const hostBudgetRow = ensureHostBudgetRowFn(hostBudgetByHost, sourceHost);
  attemptedSourceUrls.add(String(source.url || '').trim());
  return {
    runtimePauseAnnounced,
    preflight: {
      mode: 'process',
      source,
      sourceHost,
      hostBudgetRow
    }
  };
}
