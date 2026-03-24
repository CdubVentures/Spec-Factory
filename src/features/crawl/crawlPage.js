/**
 * crawlPage — the single entry point for crawling a URL.
 * Opens page via CrawlSession, classifies blocks, records to frontier DB.
 */

import { classifyBlockStatus } from './bypassStrategies.js';

export async function crawlPage({ url, settings, frontierDb, session, logger } = {}) {
  const startMs = Date.now();
  let sessionResult = null;
  let error = null;

  try {
    sessionResult = await session.processUrl(url);
  } catch (err) {
    error = err;
  }

  const fetchDurationMs = Date.now() - startMs;
  const status = sessionResult?.status ?? 0;
  const html = sessionResult?.html ?? '';
  const finalUrl = sessionResult?.finalUrl ?? url;
  const screenshots = sessionResult?.screenshots ?? [];

  const { blocked, blockReason } = error
    ? { blocked: false, blockReason: null }
    : classifyBlockStatus({ status, html });

  const success = !error && !blocked && status > 0 && status < 400;

  // Record to frontier DB (always, success or failure)
  try {
    frontierDb?.recordFetch?.({
      url,
      status,
      finalUrl,
      elapsedMs: fetchDurationMs,
      error: error?.message ?? '',
    });
  } catch {
    // swallow frontier errors — never crash the crawl loop
  }

  return {
    success,
    url,
    finalUrl,
    status,
    blocked,
    blockReason,
    screenshots,
    html,
    fetchDurationMs,
    attempts: 1,
    bypassUsed: null,
  };
}
