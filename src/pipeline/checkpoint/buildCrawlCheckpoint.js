// WHY: Pure function that builds a crawl checkpoint manifest from pipeline
// results. The checkpoint is a small JSON index that points to all per-URL
// artifacts (HTML, screenshots, videos) on disk. It captures enough metadata
// to rebuild SQL (crawl_sources, source_screenshots) if the DB is lost.

import { computePageContentHash } from '../../shared/contentHash.js';

function mapSource(result) {
  const html = String(result.html ?? '');
  const contentHash = computePageContentHash(html) || null;
  const workerId = String(result.workerId || '').trim();
  const blocked = Boolean(result.blocked);
  const fetchError = String(result.fetchError || '').trim() || null;
  const success = !blocked && !fetchError;

  return {
    url: String(result.url || ''),
    final_url: String(result.finalUrl || result.url || ''),
    status: Number(result.status || 0),
    success,
    blocked,
    block_reason: blocked ? String(result.blockReason || '') : null,
    worker_id: workerId || null,
    content_hash: contentHash,
    html_file: contentHash ? `${contentHash.slice(0, 12)}.html.gz` : null,
    screenshot_count: (result.screenshots || []).length,
    video_file: workerId ? `${workerId}.webm` : null,
    timeout_rescued: Boolean(result.timeoutRescued),
    fetch_error: fetchError,
    // WHY: B6 — triage metadata joined into crawlResults upstream by
    // enrichCrawlResults(). Forwarded here so run.json sources[] carry
    // evidence-tier scoring inputs.
    hint_source: result.hint_source || null,
    tier: result.tier || null,
    providers: result.providers || null,
  };
}

/**
 * @param {{ crawlResults: Array, runId: string, category: string, productId: string, s3Key: string, startMs: number, fetchPlanStats?: object, needset?: object, searchProfile?: object, runSummary?: object, status?: string, identityLock?: object, bridgeCounters?: object }} opts
 * @returns {object} Run checkpoint manifest (run.json)
 */
export function buildCrawlCheckpoint({ crawlResults, runId, category, productId, s3Key, startMs, fetchPlanStats, needset, searchProfile, runSummary, brandResolution, status, identityLock, runtimeOpsPanels, bridgeCounters } = {}) {
  const results = Array.isArray(crawlResults) ? crawlResults : [];
  const sources = results.map(mapSource);
  const stats = fetchPlanStats || {};
  const id = identityLock || {};

  // WHY: B12 — runs.counters was only ever getting URL-level counts because
  // checkpoint.counters didn't carry bridge counters (pages_checked,
  // parse_completed, indexed_docs, fields_filled, search_workers). On server
  // boot, scanAndSeedCheckpoints reseeds runs.counters from checkpoint.counters
  // and overwrites whatever writeRunMeta had written. Merge bridge counters
  // beneath URL counters so both survive the round-trip.
  const bridgeCountersSafe = (bridgeCounters && typeof bridgeCounters === 'object') ? bridgeCounters : null;

  return {
    schema_version: runtimeOpsPanels ? 3 : 2,
    checkpoint_type: 'crawl',
    created_at: new Date().toISOString(),
    run: {
      run_id: String(runId || ''),
      category: String(category || ''),
      product_id: String(productId || ''),
      s3_key: String(s3Key || ''),
      duration_ms: Math.max(0, Date.now() - (Number(startMs) || Date.now())),
      status: String(status || 'completed'),
    },
    identity: {
      brand: String(id.brand || ''),
      base_model: String(id.base_model || ''),
      model: String(id.model || ''),
      variant: String(id.variant || ''),
      sku: String(id.sku || ''),
      title: String(id.title || ''),
    },
    fetch_plan: {
      total_queued: Number(stats.total_queued || 0),
      seed_count: Number(stats.seed_count || 0),
      approved_count: Number(stats.approved_count || 0),
      blocked_count: Number(stats.blocked_count || 0),
    },
    counters: {
      ...(bridgeCountersSafe || {}),
      urls_crawled: sources.length,
      urls_successful: sources.filter((s) => s.success).length,
      urls_blocked: sources.filter((s) => s.blocked).length,
      urls_failed: sources.filter((s) => !s.success && !s.blocked).length,
      urls_timeout_rescued: sources.filter((s) => s.timeout_rescued).length,
    },
    artifacts: {
      html_dir: 'html',
      screenshot_dir: 'screenshots',
      video_dir: 'video',
    },
    sources,
    needset: needset || null,
    search_profile: searchProfile || null,
    run_summary: runSummary || null,
    brand_resolution: brandResolution || null,
    ...(runtimeOpsPanels ? { runtime_ops_panels: runtimeOpsPanels } : {}),
  };
}
