export function buildFetcherStartContext({
  fetcher,
  fetcherMode,
  config,
  logger,
  fetcherConfig,
  HttpFetcherClass,
} = {}) {
  return {
    fetcher,
    fetcherMode,
    config,
    logger,
    fetcherConfig,
    createHttpFetcherFn: (configArg, loggerArg) =>
      new HttpFetcherClass(configArg, loggerArg),
  };
}
