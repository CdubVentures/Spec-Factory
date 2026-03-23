export function resolveScreencastCallback(config = {}) {
  return config.runtimeScreencastEnabled && typeof config.onScreencastFrame === 'function'
    ? config.onScreencastFrame
    : undefined;
}

export function createRunProductFetcherFactory({
  fetcherConfig,
  logger,
  screencastCallback,
  DryRunFetcherClass,
  HttpFetcherClass,
  CrawleeFetcherClass,
  PlaywrightFetcherClass,
} = {}) {
  return (mode = '') => {
    const resolvedMode = String(mode || '').trim().toLowerCase();

    if (resolvedMode === 'dryrun') {
      return new DryRunFetcherClass(fetcherConfig, logger);
    }
    if (resolvedMode === 'http') {
      return new HttpFetcherClass(fetcherConfig, logger);
    }
    if (resolvedMode === 'crawlee') {
      return new CrawleeFetcherClass(fetcherConfig, logger, { onScreencastFrame: screencastCallback });
    }
    if (resolvedMode === '' || resolvedMode === 'playwright') {
      return new PlaywrightFetcherClass(fetcherConfig, logger, { onScreencastFrame: screencastCallback });
    }
    return null;
  };
}
