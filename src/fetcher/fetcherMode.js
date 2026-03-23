export function selectFetcherMode(config = {}) {
  if (Object.prototype.hasOwnProperty.call(config, 'dryRun') && Boolean(config.dryRun)) {
    return 'dryrun';
  }

  if (Object.prototype.hasOwnProperty.call(config, 'preferHttpFetcher') && Boolean(config.preferHttpFetcher)) {
    return 'http';
  }

  if (Object.prototype.hasOwnProperty.call(config, 'dynamicCrawleeEnabled') && Boolean(config.dynamicCrawleeEnabled)) {
    return 'crawlee';
  }

  return 'playwright';
}
