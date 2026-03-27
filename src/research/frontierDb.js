import { canonicalizeUrl } from './urlNormalize.js';
import { toInt, toFloat } from '../shared/valueNormalizers.js';

function nowMs() {
  return Date.now();
}

function nowIso() {
  return new Date().toISOString();
}

import { stableHashString } from '../shared/stableHash.js';

function normalizeQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function makeQueryHash(productId, query) {
  return stableHashString(`${String(productId || '').trim().toLowerCase()}::${normalizeQuery(query)}`);
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function initialState() {
  return {
    version: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
    queries: {},
    urls: {},
    recent_fetches: [],
    domain_stats: {},
    path_stats: {},
    product_index: {}
  };
}

function statusBucket(status) {
  const code = toInt(status, 0);
  if (code >= 200 && code < 300) return 'ok_count';
  if (code >= 300 && code < 400) return 'redirect_count';
  if (code === 404) return 'notfound_count';
  if (code === 410) return 'gone_count';
  if (code === 429) return 'blocked_count';
  if (code >= 400 && code < 500) return 'blocked_count';
  if (code >= 500) return 'server_error_count';
  return 'other_count';
}

export class FrontierDb {
  constructor({
    storage,
    key,
    config = {}
  } = {}) {
    this.storage = storage;
    this.key = String(key || '').trim() || '_intel/frontier/frontier.json';
    this.config = config || {};
    this.state = initialState();
  }

  canonicalize(url) {
    return canonicalizeUrl(url);
  }

  _queryRow(productId, query) {
    const queryHash = makeQueryHash(productId, query);
    const row = this.state.queries[queryHash];
    return {
      queryHash,
      row: row && typeof row === 'object' ? row : null
    };
  }

  getQueryRecord({ productId, query } = {}) {
    const { row } = this._queryRow(productId, query);
    if (!row) {
      return null;
    }
    return {
      ...row,
      fields: ensureArray(row.fields),
      results: ensureArray(row.results)
    };
  }

  recordQuery({
    productId,
    query,
    provider,
    fields = [],
    results = [],
    tier = null,
    group_key = null,
    normalized_key = null,
    hint_source = null,
    ts = nowIso()
  } = {}) {
    const normalized = normalizeQuery(query);
    if (!normalized) {
      return null;
    }
    const queryHash = makeQueryHash(productId, normalized);
    const existing = ensureObject(this.state.queries[queryHash]);
    const next = {
      query_hash: queryHash,
      product_id: String(productId || ''),
      query_text: normalized,
      provider: String(provider || ''),
      fields: [...new Set((fields || []).map((field) => String(field || '').trim()).filter(Boolean))],
      attempts: toInt(existing.attempts, 0) + 1,
      first_ts: existing.first_ts || ts,
      last_ts: ts,
      results: ensureArray(results).slice(0, 25).map((row, idx) => ({
        rank: toInt(row?.rank, idx + 1),
        url: String(row?.url || '').trim(),
        title: String(row?.title || '').trim(),
        host: String(row?.host || '').trim(),
        snippet: String(row?.snippet || '').slice(0, 400)
      })),
      tier: tier || existing.tier || null,
      group_key: group_key || existing.group_key || null,
      normalized_key: normalized_key || existing.normalized_key || null,
      hint_source: hint_source || existing.hint_source || null,
    };
    this.state.queries[queryHash] = next;
    const productIndex = ensureObject(this.state.product_index[next.product_id]);
    productIndex.last_query_hash = queryHash;
    productIndex.last_query_ts = ts;
    this.state.product_index[next.product_id] = productIndex;
    this.state.updated_at = nowIso();
    return {
      query_hash: queryHash,
      query_text: normalized
    };
  }

  getUrlRow(url) {
    const normalized = this.canonicalize(url);
    if (!normalized.canonical_url) {
      return null;
    }
    return ensureObject(this.state.urls[normalized.canonical_url]);
  }

  recordFetch({
    productId,
    url,
    status = 0,
    finalUrl = '',
    contentType = '',
    contentHash = '',
    bytes = 0,
    elapsedMs = 0,
    error = '',
    fieldsFound = [],
    confidence = 0,
    conflictFlag = false,
    ts = nowIso()
  } = {}) {
    const normalized = this.canonicalize(url || finalUrl);
    if (!normalized.canonical_url) {
      return null;
    }
    const key = normalized.canonical_url;
    const existing = ensureObject(this.state.urls[key]);
    const fetchCount = toInt(existing.fetch_count, 0) + 1;
    const row = {
      canonical_url: key,
      original_url: String(url || ''),
      domain: normalized.domain,
      path_sig: normalized.path_sig,
      first_seen_ts: existing.first_seen_ts || ts,
      last_seen_ts: ts,
      last_status: toInt(status, 0),
      last_final_url: String(finalUrl || ''),
      content_type: String(contentType || ''),
      content_hash: String(contentHash || ''),
      fetch_count: fetchCount,
      retries_count: toInt(existing.retries_count, 0) + (toInt(status, 0) >= 400 || toInt(status, 0) === 0 ? 1 : 0),
      fields_found: [...new Set([...(existing.fields_found || []), ...(fieldsFound || [])])],
      avg_confidence: Number.parseFloat((
        (
          toFloat(existing.avg_confidence, 0) * Math.max(0, fetchCount - 1) +
          toFloat(confidence, 0)
        ) / Math.max(1, fetchCount)
      ).toFixed(6)),
      conflict_count: toInt(existing.conflict_count, 0) + (conflictFlag ? 1 : 0),
    };
    this.state.urls[key] = row;

    const fetchRow = {
      ts,
      product_id: String(productId || ''),
      canonical_url: key,
      status: toInt(status, 0),
      final_url: String(finalUrl || ''),
      bytes: toInt(bytes, 0),
      elapsed_ms: toInt(elapsedMs, 0),
      error: String(error || '').slice(0, 500)
    };
    this.state.recent_fetches.push(fetchRow);
    if (this.state.recent_fetches.length > 2000) {
      this.state.recent_fetches = this.state.recent_fetches.slice(-2000);
    }

    this._updateYieldStats({
      domain: normalized.domain,
      pathSig: normalized.path_sig,
      status: toInt(status, 0),
      fieldsFound,
      confidence,
      conflictFlag,
      ts
    });
    this.state.updated_at = nowIso();
    return row;
  }

  _updateYieldStats({
    domain,
    pathSig,
    status,
    fieldsFound = [],
    confidence = 0,
    conflictFlag = false,
    ts = nowIso()
  } = {}) {
    const fieldList = [...new Set((fieldsFound || []).map((field) => String(field || '').trim()).filter(Boolean))];
    const domainKeys = fieldList.length ? fieldList : ['__all__'];
    for (const fieldKey of domainKeys) {
      const domainStatKey = `${domain}|${fieldKey}`;
      const stat = ensureObject(this.state.domain_stats[domainStatKey]);
      stat.domain = domain;
      stat.field_key = fieldKey;
      const bucket = statusBucket(status);
      stat[bucket] = toInt(stat[bucket], 0) + 1;
      stat.success_count = toInt(stat.success_count, 0) + (status >= 200 && status < 400 ? 1 : 0);
      stat.conflict_count = toInt(stat.conflict_count, 0) + (conflictFlag ? 1 : 0);
      const seen = toInt(stat.sample_count, 0) + 1;
      stat.sample_count = seen;
      stat.avg_confidence = Number.parseFloat((
        ((toFloat(stat.avg_confidence, 0) * (seen - 1)) + toFloat(confidence, 0)) / Math.max(1, seen)
      ).toFixed(6));
      stat.last_seen_ts = ts;
      this.state.domain_stats[domainStatKey] = stat;
    }

    const pathKey = `${domain}|${pathSig}`;
    const path = ensureObject(this.state.path_stats[pathKey]);
    path.domain = domain;
    path.path_sig = pathSig;
    const bucket = statusBucket(status);
    path[bucket] = toInt(path[bucket], 0) + 1;
    path.last_seen_ts = ts;
    this.state.path_stats[pathKey] = path;
  }

  // WHY: Builds the queryExecutionHistory shape consumed by deriveSeedStatus()
  // and computeGroupQueryCount() in searchPlanningContext.js.
  buildQueryExecutionHistory(productId) {
    const product = String(productId || '').trim();
    const queryRows = Object.values(this.state.queries || {}).filter(
      (row) => String(row?.product_id || '').trim() === product
    );
    const queries = queryRows.map((row) => {
      const results = ensureArray(row.results);
      const hasResults = results.length > 0;
      const lastTs = row.last_ts ? Date.parse(row.last_ts) : null;
      return {
        query_text: row.query_text || '',
        tier: row.tier || null,
        group_key: row.group_key || null,
        normalized_key: row.normalized_key || null,
        source_name: row.hint_source === 'tier1_seed' ? (row.query_text || '').split(' ').pop() : null,
        status: hasResults ? 'scrape_complete' : 'pending',
        completed_at_ms: hasResults && lastTs ? lastTs : null,
        new_fields_closed: 0,
        pending_count: hasResults ? 0 : 1,
      };
    });
    return { queries };
  }

  aggregateDomainStats(domains) {
    const now = nowMs();
    const results = new Map();
    for (const domain of domains || []) {
      const key = String(domain || '').trim().toLowerCase();
      if (!key) continue;

      const statKey = `${key}|__all__`;
      const stat = ensureObject(this.state.domain_stats[statKey]);

      const okCount = toInt(stat.success_count, 0);
      const blockedCount = toInt(stat.blocked_count, 0);
      const sampleCount = toInt(stat.sample_count, 0);

      // WHY: Compute latency + cooldown from per-URL records for this domain.
      let totalElapsedMs = 0;
      let fetchCountFromUrls = 0;
      let maxCooldownMs = 0;
      let lastBlockedTs = null;

      for (const urlRow of Object.values(this.state.urls || {})) {
        if (String(urlRow?.domain || '').toLowerCase() !== key) continue;
        fetchCountFromUrls += toInt(urlRow.fetch_count, 0);

        const lastStatus = toInt(urlRow.last_status, 0);
        if (lastStatus === 403 || lastStatus === 429) {
          const ts = String(urlRow.last_seen_ts || '').trim();
          if (ts && (!lastBlockedTs || ts > lastBlockedTs)) {
            lastBlockedTs = ts;
          }
        }
      }

      // WHY: Average latency from recent_fetches for this domain.
      let latencyCount = 0;
      for (const fetch of this.state.recent_fetches || []) {
        const urlRow = ensureObject(this.state.urls[fetch.canonical_url]);
        if (String(urlRow?.domain || '').toLowerCase() !== key) continue;
        const elapsed = toInt(fetch.elapsed_ms, 0);
        if (elapsed > 0) {
          totalElapsedMs += elapsed;
          latencyCount++;
        }
      }

      const fetchCount = fetchCountFromUrls || sampleCount;
      const successRate = fetchCount > 0 ? okCount / fetchCount : 0;
      const avgLatencyMs = latencyCount > 0 ? Math.round(totalElapsedMs / latencyCount) : 0;

      results.set(key, {
        fetch_count: fetchCount,
        ok_count: okCount,
        blocked_count: blockedCount,
        timeout_count: toInt(stat.other_count, 0),
        success_rate: Number.parseFloat(successRate.toFixed(4)),
        avg_latency_ms: avgLatencyMs,
        cooldown_remaining_ms: Math.round(maxCooldownMs),
        last_blocked_ts: lastBlockedTs,
      });
    }
    return results;
  }
}

let _FrontierDbSqlite = null;
try {
  const mod = await import('./frontierSqlite.js');
  _FrontierDbSqlite = mod.FrontierDbSqlite;
} catch {
  // better-sqlite3 not installed — SQLite backend unavailable
}

export function createFrontier({ storage, key, config = {} } = {}) {
  const hardcodedKey = '_intel/frontier/frontier.json';
  if (_FrontierDbSqlite) {
    try {
      const dbPath = hardcodedKey.replace(/\.json$/, '.db');
      if (typeof config._logger?.info === 'function') {
        config._logger.info('frontier_sqlite_enabled', { dbPath });
      }
      return new _FrontierDbSqlite({ dbPath, config });
    } catch (err) {
      if (typeof config._logger?.info === 'function') {
        config._logger.info('frontier_sqlite_fallback', {
          message: `SQLite init failed (${err.message}), falling back to JSON`
        });
      }
    }
  }
  return new FrontierDb({ storage, key: hardcodedKey, config });
}
