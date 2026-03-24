/**
 * Batch-oriented crawl processing lifecycle.
 * Pre-populates all fetch workers as queued (visible in GUI immediately after discovery),
 * then drains the planner in batches through Crawlee's concurrent engine.
 */

import { classifyBlockStatus } from '../features/crawl/bypassStrategies.js';

function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

export async function runCrawlProcessingLifecycle({
  planner,
  session,
  frontierDb,
  settings,
  logger,
  startMs,
  maxRunMs,
}) {
  const crawlResults = [];
  const batchSize = (session.slotCount || 4) * 2;

  // WHY: Pre-populate ALL fetch workers as queued so the GUI shows them
  // immediately after domain classifier finishes (grayed out, sequential).
  let workerSeq = 0;
  const workerIdMap = new Map();
  const allQueued = planner.peekAll?.() ?? [];
  for (const source of allQueued) {
    if (!source?.url) continue;
    workerSeq++;
    const workerId = `fetch-${workerSeq}`;
    workerIdMap.set(source.url, workerId);
    logger?.info?.('source_fetch_queued', {
      worker_id: workerId,
      url: source.url,
      host: safeHostname(source.url),
      state: 'queued',
      seq: workerSeq,
    });
  }

  // Set phase cursor to crawl stage
  logger?.info?.('crawl_phase_started', {
    total_queued: workerSeq,
    phase_cursor: 'phase_09_crawl',
  });

  while (planner.hasNext()) {
    if (maxRunMs > 0 && (Date.now() - startMs) >= maxRunMs) break;

    const batch = [];
    while (batch.length < batchSize && planner.hasNext()) {
      const source = planner.next();
      if (!source?.url) continue;

      const skip = frontierDb?.shouldSkipUrl?.(source.url);
      if (skip?.skip) {
        logger?.info?.('crawl_url_skipped', { url: source.url, reason: skip.reason });
        continue;
      }
      batch.push(source.url);
    }
    if (batch.length === 0) break;

    const settled = await session.processBatch(batch, { workerIdMap });

    for (let i = 0; i < settled.length; i++) {
      const entry = settled[i];
      const url = batch[i] || '';

      if (entry.status === 'fulfilled') {
        const result = entry.value;
        const { blocked, blockReason } = classifyBlockStatus({
          status: result.status, html: result.html,
        });
        result.blocked = blocked;
        result.blockReason = blockReason;
        result.success = !blocked && result.status > 0 && result.status < 400;

        try {
          frontierDb?.recordFetch?.({
            url: result.url,
            status: result.status,
            finalUrl: result.finalUrl,
            elapsedMs: result.fetchDurationMs || 0,
          });
        } catch { /* swallow frontier errors */ }

        crawlResults.push(result);
      } else {
        try {
          frontierDb?.recordFetch?.({
            url,
            status: 0,
            error: entry.reason?.message || '',
          });
        } catch { /* swallow */ }

        crawlResults.push({
          success: false, url, finalUrl: url, status: 0,
          blocked: false, blockReason: null, screenshots: [],
          html: '', fetchDurationMs: 0, attempts: 1, bypassUsed: null,
          workerId: workerIdMap.get(url) || null,
        });
      }
    }
  }

  return { crawlResults };
}
