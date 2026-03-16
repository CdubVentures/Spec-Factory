export async function runFetcherStartPhase({
  fetcher,
  fetcherMode = '',
  config = {},
  logger = {},
  fetcherConfig = {},
  createHttpFetcherFn,
} = {}) {
  let nextFetcher = fetcher;
  let nextFetcherMode = fetcherMode;
  let fetcherStartFallbackReason = null;

  try {
    await nextFetcher.start();
  } catch (error) {
    fetcherStartFallbackReason = error.message;
    if (config.dryRun || nextFetcherMode === 'http') {
      throw error;
    }
    logger.warn('fetcher_start_failed', {
      fetcher_mode: nextFetcherMode,
      message: error.message,
    });
    nextFetcher = createHttpFetcherFn(fetcherConfig, logger);
    nextFetcherMode = 'http';
    await nextFetcher.start();
    logger.info('fetcher_fallback_enabled', {
      fetcher_mode: nextFetcherMode,
    });
  }

  return {
    fetcher: nextFetcher,
    fetcherMode: nextFetcherMode,
    fetcherStartFallbackReason,
  };
}
