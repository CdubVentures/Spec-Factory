/**
 * Batch-oriented crawl processing lifecycle.
 * Drains the planner into a single sorted array (strict slot→rank order),
 * pre-populates all fetch workers as queued, then processes in batches.
 */

import { classifyBlockStatus } from '../features/crawl/bypassStrategies.js';

function safeHostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// WHY: Sort all planner entries strictly by search slot then SERP rank.
// Manufacturer/seed URLs without triage_passthrough get slot assignments
// via host-level fallback (same host as a slotted search result URL).
function sortBySlotRank(sources) {
  // Build host → best slot+rank from entries that already have slot info
  const hostSlotMap = {};
  for (const source of sources) {
    const slot = source.triage_passthrough?.search_slot;
    const rank = source.triage_passthrough?.search_rank;
    if (!slot || rank == null) continue;
    const host = safeHostname(source.url);
    if (!host) continue;
    if (!hostSlotMap[host]
        || slot < hostSlotMap[host].slot
        || (slot === hostSlotMap[host].slot && rank < hostSlotMap[host].rank)) {
      hostSlotMap[host] = { slot, rank };
    }
  }

  // Assign slot to non-slotted entries via host fallback
  const consumedHosts = new Set();
  for (const source of sources) {
    if (source.triage_passthrough?.search_slot) continue;
    const host = safeHostname(source.url);
    const fallback = hostSlotMap[host];
    if (fallback && !consumedHosts.has(host)) {
      if (!source.triage_passthrough) source.triage_passthrough = {};
      source.triage_passthrough.search_slot = fallback.slot;
      source.triage_passthrough.search_rank = fallback.rank;
      consumedHosts.add(host);
    }
  }

  sources.sort((a, b) => {
    const slotA = a.triage_passthrough?.search_slot ?? '\xff';
    const slotB = b.triage_passthrough?.search_slot ?? '\xff';
    if (slotA !== slotB) return slotA < slotB ? -1 : 1;
    const rankA = Number(a.triage_passthrough?.search_rank) || Infinity;
    const rankB = Number(b.triage_passthrough?.search_rank) || Infinity;
    if (rankA !== rankB) return rankA - rankB;
    return (a.tier ?? 99) - (b.tier ?? 99);
  });
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

  // WHY: Pre-drain ALL planner URLs into a single array so we can sort
  // strictly by slot→rank across all queue tiers. Safe because the planner
  // only receives new URLs during search/discovery phases, which are
  // complete before this lifecycle runs.
  const allSources = [];
  while (planner.hasNext()) {
    const source = planner.next();
    if (source?.url) allSources.push(source);
  }

  sortBySlotRank(allSources);

  // Pre-populate ALL fetch workers in slot order so the GUI shows them
  // immediately after domain classifier finishes.
  let workerSeq = 0;
  const workerIdMap = new Map();
  for (const source of allSources) {
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

  logger?.info?.('crawl_phase_started', {
    total_queued: workerSeq,
    phase_cursor: 'phase_09_crawl',
  });

  // Process batches in slot order
  let offset = 0;
  while (offset < allSources.length) {
    if (maxRunMs > 0 && (Date.now() - startMs) >= maxRunMs) break;

    const batch = [];
    while (batch.length < batchSize && offset < allSources.length) {
      const source = allSources[offset++];
      batch.push(source.url);
    }
    if (batch.length === 0) continue;

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
