import { configBool } from '../shared/settingsAccessor.js';

export function selectFetcherMode(config = {}) {
  if (configBool(config, 'dryRun')) {
    return 'dryrun';
  }

  if (configBool(config, 'preferHttpFetcher')) {
    return 'http';
  }

  if (configBool(config, 'dynamicCrawleeEnabled')) {
    return 'crawlee';
  }

  return 'playwright';
}
