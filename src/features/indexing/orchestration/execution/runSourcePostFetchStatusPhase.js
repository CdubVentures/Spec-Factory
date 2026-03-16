export function runSourcePostFetchStatusPhase({
  discoveryOnlySource = false,
  sourceStatusCode = 0,
  sourceUrl = '',
  source = {},
  manufacturerBrandMismatch = false,
  successfulSourceMetaByUrl = new Map(),
  planner = null,
  logger = null,
  nowIsoFn = () => new Date().toISOString(),
} = {}) {
  if (!discoveryOnlySource && sourceStatusCode >= 200 && sourceStatusCode < 400) {
    successfulSourceMetaByUrl.set(sourceUrl, {
      last_success_at: nowIsoFn(),
      status: sourceStatusCode
    });
  }

  if (manufacturerBrandMismatch) {
    const removedCount = planner?.blockHost?.(source.host, 'brand_mismatch') || 0;
    logger?.warn?.('manufacturer_host_blocked', {
      host: source.host,
      url: source.url,
      reason: 'brand_mismatch',
      removed_count: removedCount
    });
  }

  if (discoveryOnlySource) {
    logger?.info?.('source_discovery_only', {
      url: sourceUrl
    });
  }
}
