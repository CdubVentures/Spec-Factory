// WHY: Thin adapter bridging frontierDb callsites to spec.sqlite crawlLedgerStore.
// Exposes identical method names so callsites need zero changes to their call patterns.
// Key behavioral change: getQueryRecord returns null when cooldown expires (was permanent cache).

import { canonicalizeUrl } from '../../../../research/urlNormalize.js';
import { stableHashString } from '../../../../shared/stableHash.js';

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function makeQueryHash(productId, query) {
  return stableHashString(`${String(productId || '').trim().toLowerCase()}::${normalizeQuery(query)}`);
}

function nowIso() {
  return new Date().toISOString();
}

function statusCategory(code) {
  const s = Number(code) || 0;
  return {
    ok: s >= 200 && s < 300 ? 1 : 0,
    redirect: s >= 300 && s < 400 ? 1 : 0,
    blocked: s === 403 || s === 429 ? 1 : 0,
    notfound: s === 404 ? 1 : 0,
    gone: s === 410 ? 1 : 0,
    server_error: s >= 500 ? 1 : 0,
    timeout: 0,
  };
}

/**
 * @param {{ specDb: object, productId: string, category: string, runId: string, queryCooldownDays: number }} opts
 */
export function createCrawlLedgerAdapter({ specDb, productId, category, runId, queryCooldownDays = 30 }) {
  const pid = String(productId || '');
  const cat = String(category || '');
  const rid = String(runId || '');
  const cooldownMs = Math.max(0, Number(queryCooldownDays) || 30) * 86400000;

  function canonicalize(url) {
    return canonicalizeUrl(url);
  }

  function getUrlRow(url) {
    const normalized = canonicalizeUrl(url);
    if (!normalized.canonical_url) return null;
    return specDb.getUrlCrawlEntry(normalized.canonical_url, pid) || null;
  }

  function recordFetch({
    url, status = 0, finalUrl = '', contentType = '',
    contentHash = '', bytes = 0, elapsedMs = 0, error = '',
  } = {}) {
    const normalized = canonicalizeUrl(url);
    if (!normalized.canonical_url) return null;
    const ts = nowIso();
    const sc = statusCategory(status);
    const timeoutCount = (Number(status) === 0 && error) ? 1 : 0;

    specDb.upsertUrlCrawlEntry({
      canonical_url: normalized.canonical_url,
      product_id: pid,
      category: cat,
      original_url: String(url || ''),
      domain: normalized.domain || '',
      path_sig: normalized.path_sig || '',
      final_url: String(finalUrl || ''),
      content_hash: String(contentHash || ''),
      content_type: String(contentType || ''),
      http_status: Number(status) || 0,
      bytes: Number(bytes) || 0,
      elapsed_ms: Number(elapsedMs) || 0,
      fetch_count: 1,
      ok_count: sc.ok,
      blocked_count: sc.blocked,
      timeout_count: timeoutCount,
      server_error_count: sc.server_error,
      redirect_count: sc.redirect,
      notfound_count: sc.notfound,
      gone_count: sc.gone,
      first_seen_ts: ts,
      last_seen_ts: ts,
      first_seen_run_id: rid,
      last_seen_run_id: rid,
    });

    return {
      canonical_url: normalized.canonical_url,
      original_url: url,
      domain: normalized.domain || '',
      path_sig: normalized.path_sig || '',
      last_status: Number(status) || 0,
      fetch_count: 1,
    };
  }

  function getQueryRecord({ productId: qPid, query } = {}) {
    const hash = makeQueryHash(qPid || pid, query);
    return specDb.getQueryCooldown(hash, String(qPid || pid));
  }

  function recordQuery({
    productId: qPid, query, provider = '', fields = [], results = [],
    tier = null, group_key = null, normalized_key = null, hint_source = null,
  } = {}) {
    const text = normalizeQuery(query);
    if (!text) return null;
    const resolvedPid = String(qPid || pid);
    const hash = makeQueryHash(resolvedPid, text);
    const ts = nowIso();
    const cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();

    specDb.upsertQueryCooldown({
      query_hash: hash,
      product_id: resolvedPid,
      category: cat,
      query_text: text,
      provider: String(provider || ''),
      tier: tier || null,
      group_key: group_key || null,
      normalized_key: normalized_key || null,
      hint_source: hint_source || null,
      attempt_count: 1,
      result_count: Array.isArray(results) ? results.length : 0,
      last_executed_at: ts,
      cooldown_until: cooldownUntil,
    });

    return { query_hash: hash, query_text: text };
  }

  function aggregateDomainStats(domains) {
    return specDb.aggregateDomainStats(
      Array.isArray(domains) ? domains : [],
      pid,
    );
  }

  function buildQueryExecutionHistory(histPid) {
    return specDb.buildQueryExecutionHistory(String(histPid || pid));
  }

  function close() {
    // no-op — specDb lifecycle managed elsewhere
  }

  return {
    canonicalize,
    getUrlRow,
    recordFetch,
    getQueryRecord,
    recordQuery,
    aggregateDomainStats,
    buildQueryExecutionHistory,
    close,
  };
}
