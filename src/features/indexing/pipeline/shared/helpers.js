/**
 * Discovery Helpers
 *
 * Extracted from searchDiscovery.js (Phase 4A of structural decomposition).
 * Contains 10 helper functions: 6 pure, 4 with I/O (storage reads/writes).
 */
import { extractRootDomain } from '../../../../shared/valueNormalizers.js';
import { normalizeHost } from './hostParser.js';

// ---------------------------------------------------------------------------
// runWithConcurrency — generic concurrency pool
// ---------------------------------------------------------------------------

export async function runWithConcurrency(items = [], concurrency = 1, worker) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return [];
  }
  const limit = Math.max(1, Number.parseInt(String(concurrency || 1), 10) || 1);
  const output = new Array(list.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) {
        return;
      }
      output[index] = await worker(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, () => runWorker()));
  return output;
}

// ---------------------------------------------------------------------------
// loadLearningArtifacts — async storage reads for learning data
// ---------------------------------------------------------------------------

export async function loadLearningArtifacts({
  storage,
  category
}) {
  const base = storage.resolveOutputKey('_learning', category);
  const [lexicon, queryTemplates, fieldYield] = await Promise.all([
    storage.readJsonOrNull(`${base}/field_lexicon.json`),
    storage.readJsonOrNull(`${base}/query_templates.json`),
    storage.readJsonOrNull(`${base}/field_yield.json`)
  ]);
  return {
    lexicon: lexicon || {},
    queryTemplates: queryTemplates || {},
    fieldYield: fieldYield || {}
  };
}

// ---------------------------------------------------------------------------
// buildQueryAttemptStats — aggregates search attempt statistics
// ---------------------------------------------------------------------------

export function buildQueryAttemptStats(rows = []) {
  const byQuery = new Map();
  for (const row of rows || []) {
    const query = String(row?.query || '').trim();
    if (!query) {
      continue;
    }
    if (!byQuery.has(query)) {
      byQuery.set(query, {
        query,
        attempts: 0,
        result_count: 0,
        providers: [],
        cooldown_skipped: false
      });
    }
    const bucket = byQuery.get(query);
    bucket.attempts += 1;
    bucket.result_count += Math.max(0, Number.parseInt(String(row?.result_count || 0), 10) || 0);
    const provider = String(row?.provider || '').trim();
    if (provider && !bucket.providers.includes(provider)) {
      bucket.providers.push(provider);
    }
    const reasonCode = String(row?.reason_code || '').trim();
    if (reasonCode === 'frontier_query_cache' || reasonCode === 'cooldown_skip') {
      bucket.cooldown_skipped = true;
    }
  }
  return [...byQuery.values()].sort((a, b) => b.result_count - a.result_count || a.query.localeCompare(b.query));
}

// ---------------------------------------------------------------------------
// ensureCategorySourceLookups — hydrates derived host lookup structures
// ---------------------------------------------------------------------------

export function ensureCategorySourceLookups(categoryConfig = {}) {
  const sourceHosts = Array.isArray(categoryConfig?.sourceHosts)
    ? [...categoryConfig.sourceHosts]
    : [];
  const sourceHostMap = categoryConfig?.sourceHostMap instanceof Map
    ? new Map(categoryConfig.sourceHostMap)
    : new Map();
  for (const row of sourceHosts) {
    const host = normalizeHost(row?.host);
    if (!host || sourceHostMap.has(host)) continue;
    sourceHostMap.set(host, { ...row, host });
  }

  const approvedRootDomains = categoryConfig?.approvedRootDomains instanceof Set
    ? new Set(categoryConfig.approvedRootDomains)
    : new Set();
  for (const row of sourceHosts) {
    const host = normalizeHost(row?.host);
    if (!host) continue;
    approvedRootDomains.add(extractRootDomain(host));
  }

  return {
    ...categoryConfig,
    sourceHosts,
    sourceHostMap,
    approvedRootDomains,
    sourceRegistry: categoryConfig?.sourceRegistry && typeof categoryConfig.sourceRegistry === 'object'
      ? categoryConfig.sourceRegistry
      : {},
  };
}
