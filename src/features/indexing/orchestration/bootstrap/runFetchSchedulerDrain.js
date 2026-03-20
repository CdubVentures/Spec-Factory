import { configInt } from '../../../../shared/settingsAccessor.js';

function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`runFetchSchedulerDrain requires ${name}`);
  }
}

function buildSchedulerConfig(config = {}) {
  return {
    concurrency: config.concurrency,
    perHostDelayMs: config.perHostMinDelayMs,
    maxRetries: configInt(config, 'fetchSchedulerMaxRetries'),
    defaultConcurrency: config.fetchSchedulerDefaultConcurrency,
    defaultPerHostDelayMs: config.fetchSchedulerDefaultDelayMs,
    defaultMaxRetries: config.fetchSchedulerDefaultMaxRetries,
    retryWaitMs: config.fetchSchedulerRetryWaitMs,
  };
}

function buildScheduledSource(preflight = {}) {
  const source = preflight?.source && typeof preflight.source === 'object'
    ? preflight.source
    : {};
  const url = String(source.url || preflight.url || '').trim();
  const host = String(preflight.sourceHost || source.host || preflight.host || '').trim();

  return {
    ...preflight,
    ...source,
    source,
    url,
    host,
  };
}

export async function runFetchSchedulerDrain({
  planner,
  config = {},
  initialMode = '',
  prepareNextPlannerSourceFn,
  fetchFn,
  fetchWithModeFn,
  shouldSkipFn,
  shouldStopFn,
  classifyOutcomeFn,
  onFetchError,
  onSkipped,
  emitEvent,
  createFetchSchedulerFn,
} = {}) {
  validateFunctionArg('prepareNextPlannerSourceFn', prepareNextPlannerSourceFn);
  validateFunctionArg('fetchFn', fetchFn);
  validateFunctionArg('shouldSkipFn', shouldSkipFn);
  validateFunctionArg('shouldStopFn', shouldStopFn);
  validateFunctionArg('onFetchError', onFetchError);
  validateFunctionArg('onSkipped', onSkipped);
  validateFunctionArg('emitEvent', emitEvent);
  validateFunctionArg('createFetchSchedulerFn', createFetchSchedulerFn);

  const prefetchQueue = [];
  while (planner.hasNext()) {
    const preflight = await prepareNextPlannerSourceFn();
    if (preflight.mode === 'stop') break;
    if (preflight.mode !== 'process') continue;
    prefetchQueue.push(buildScheduledSource(preflight));
  }

  const scheduler = createFetchSchedulerFn(buildSchedulerConfig(config));
  await scheduler.drainQueue({
    sources: {
      hasNext() { return prefetchQueue.length > 0; },
      next() { return prefetchQueue.shift(); },
    },
    initialMode,
    fetchFn,
    fetchWithMode: fetchWithModeFn,
    shouldSkip: shouldSkipFn,
    shouldStop: shouldStopFn,
    classifyOutcome: classifyOutcomeFn,
    onFetchResult: () => {},
    onFetchError,
    onSkipped,
    emitEvent,
  });
}
