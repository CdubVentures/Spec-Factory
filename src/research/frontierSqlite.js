/**
 * SQLite-backed Frontier DB (Gap #2).
 *
 * Drop-in replacement for the JSON-based FrontierDb.
 * Uses better-sqlite3 for synchronous, fast, single-file storage.
 * Same API contract as FrontierDb.
 */

import Database from 'better-sqlite3';
import { canonicalizeUrl } from './urlNormalize.js';
import { toInt } from '../shared/valueNormalizers.js';

function nowIso() {
  return new Date().toISOString();
}

import { stableHashString } from '../shared/stableHash.js';

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function makeQueryHash(productId, query) {
  return stableHashString(`${String(productId || '').trim().toLowerCase()}::${normalizeQuery(query)}`);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS queries (
    query_hash TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    query_text TEXT NOT NULL,
    provider TEXT DEFAULT '',
    fields TEXT DEFAULT '[]',
    attempts INTEGER DEFAULT 1,
    first_ts TEXT NOT NULL,
    last_ts TEXT NOT NULL,
    results TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS urls (
    canonical_url TEXT PRIMARY KEY,
    original_url TEXT DEFAULT '',
    domain TEXT DEFAULT '',
    path_sig TEXT DEFAULT '',
    product_id TEXT DEFAULT '',
    first_seen_ts TEXT NOT NULL,
    last_seen_ts TEXT NOT NULL,
    last_status INTEGER DEFAULT 0,
    last_final_url TEXT DEFAULT '',
    content_type TEXT DEFAULT '',
    content_hash TEXT DEFAULT '',
    bytes INTEGER DEFAULT 0,
    elapsed_ms INTEGER DEFAULT 0,
    fetch_count INTEGER DEFAULT 0,
    ok_count INTEGER DEFAULT 0,
    redirect_count INTEGER DEFAULT 0,
    notfound_count INTEGER DEFAULT 0,
    gone_count INTEGER DEFAULT 0,
    blocked_count INTEGER DEFAULT 0,
    server_error_count INTEGER DEFAULT 0,
    timeout_count INTEGER DEFAULT 0,
    fields_found TEXT DEFAULT '[]',
    avg_confidence REAL DEFAULT 0,
    conflict_count INTEGER DEFAULT 0,
    cooldown_next_retry_ts TEXT DEFAULT '',
    cooldown_reason TEXT DEFAULT '',
    cooldown_seconds INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS yields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canonical_url TEXT NOT NULL,
    field_key TEXT NOT NULL,
    value_hash TEXT DEFAULT '',
    confidence REAL DEFAULT 0,
    conflict_flag INTEGER DEFAULT 0,
    ts TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_queries_product ON queries(product_id);
  CREATE INDEX IF NOT EXISTS idx_urls_domain ON urls(domain);
  CREATE INDEX IF NOT EXISTS idx_urls_product ON urls(product_id);
  CREATE INDEX IF NOT EXISTS idx_urls_last_seen ON urls(last_seen_ts);
  CREATE INDEX IF NOT EXISTS idx_yields_url ON yields(canonical_url);
`;

export class FrontierDbSqlite {
  constructor({ dbPath, config = {} } = {}) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA);
    this._migrateTierColumns();
  }

  // WHY: Idempotent migration — adds tier metadata columns to existing databases.
  _migrateTierColumns() {
    const migrations = [
      'ALTER TABLE queries ADD COLUMN tier TEXT DEFAULT NULL',
      'ALTER TABLE queries ADD COLUMN group_key TEXT DEFAULT NULL',
      'ALTER TABLE queries ADD COLUMN normalized_key TEXT DEFAULT NULL',
      'ALTER TABLE queries ADD COLUMN hint_source TEXT DEFAULT NULL',
    ];
    for (const sql of migrations) {
      try { this.db.exec(sql); } catch { /* column already exists */ }
    }
  }

  canonicalize(url) {
    return canonicalizeUrl(url);
  }

  // --- Queries ---

  getQueryRecord({ productId, query } = {}) {
    const hash = makeQueryHash(productId, query);
    const row = this.db.prepare('SELECT * FROM queries WHERE query_hash = ?').get(hash);
    if (!row) {
      return null;
    }
    return {
      ...row,
      fields: JSON.parse(row.fields || '[]'),
      results: JSON.parse(row.results || '[]'),
      tier: row.tier || null,
      group_key: row.group_key || null,
      normalized_key: row.normalized_key || null,
      hint_source: row.hint_source || null,
    };
  }

  recordQuery({
    productId, query, provider = '', fields = [], results = [],
    tier = null, group_key = null, normalized_key = null, hint_source = null,
    ts = nowIso(),
  } = {}) {
    const text = normalizeQuery(query);
    if (!text) return null;
    const hash = makeQueryHash(productId, text);
    const fieldsJson = JSON.stringify([...new Set(fields.filter(Boolean))]);
    const resultsJson = JSON.stringify((results || []).slice(0, 25).map((r) => ({
      rank: r.rank || 0,
      url: String(r.url || ''),
      title: String(r.title || ''),
      host: String(r.host || ''),
      snippet: String(r.snippet || '').slice(0, 400)
    })));

    const existing = this.db.prepare('SELECT attempts, tier, group_key, normalized_key, hint_source FROM queries WHERE query_hash = ?').get(hash);
    // WHY: Same semantics as JSON FrontierDb — new values win, but fall back to existing if not provided.
    const resolvedTier = tier || existing?.tier || null;
    const resolvedGroupKey = group_key || existing?.group_key || null;
    const resolvedNormalizedKey = normalized_key || existing?.normalized_key || null;
    const resolvedHintSource = hint_source || existing?.hint_source || null;

    if (existing) {
      this.db.prepare(
        'UPDATE queries SET attempts = attempts + 1, last_ts = ?, provider = ?, fields = ?, results = ?, tier = ?, group_key = ?, normalized_key = ?, hint_source = ? WHERE query_hash = ?'
      ).run(ts, provider, fieldsJson, resultsJson, resolvedTier, resolvedGroupKey, resolvedNormalizedKey, resolvedHintSource, hash);
    } else {
      this.db.prepare(
        'INSERT INTO queries (query_hash, product_id, query_text, provider, fields, attempts, first_ts, last_ts, results, tier, group_key, normalized_key, hint_source) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)'
      ).run(hash, String(productId || ''), text, provider, fieldsJson, ts, ts, resultsJson, resolvedTier, resolvedGroupKey, resolvedNormalizedKey, resolvedHintSource);
    }

    return { query_hash: hash, query_text: text };
  }

  // --- URLs ---

  getUrlRow(url) {
    const normalized = this.canonicalize(url);
    if (!normalized.canonical_url) return null;
    const row = this.db.prepare('SELECT * FROM urls WHERE canonical_url = ?').get(normalized.canonical_url);
    if (!row) return null;
    return {
      ...row,
      fields_found: JSON.parse(row.fields_found || '[]'),
    };
  }

  recordFetch({
    productId = '', url, status = 0, finalUrl = '', contentType = '',
    contentHash = '', bytes = 0, elapsedMs = 0, error = '',
    fieldsFound = [], confidence = 0, conflictFlag = false, ts = nowIso()
  } = {}) {
    const normalized = this.canonicalize(url);
    if (!normalized.canonical_url) return null;

    const canonicalUrl = normalized.canonical_url;
    const statusCode = toInt(status, 0);

    const existing = this.db.prepare('SELECT * FROM urls WHERE canonical_url = ?').get(canonicalUrl);

    // Merge fields_found
    let mergedFields = fieldsFound.filter(Boolean);
    if (existing) {
      const prev = JSON.parse(existing.fields_found || '[]');
      mergedFields = [...new Set([...prev, ...mergedFields])];
    }

    const fetchCount = existing ? existing.fetch_count + 1 : 1;

    if (existing) {
      const okDelta = (statusCode >= 200 && statusCode < 300) ? 1 : 0;
      const redirectDelta = (statusCode >= 300 && statusCode < 400) ? 1 : 0;
      const notfoundDelta = statusCode === 404 ? 1 : 0;
      const goneDelta = statusCode === 410 ? 1 : 0;
      const blockedDelta = statusCode === 403 || statusCode === 429 ? 1 : 0;
      const serverErrDelta = statusCode >= 500 ? 1 : 0;
      const timeoutDelta = (statusCode === 0 && error) ? 1 : 0;
      const conflictDelta = conflictFlag ? 1 : 0;

      this.db.prepare(`
        UPDATE urls SET
          last_seen_ts = ?, last_status = ?, last_final_url = ?,
          content_type = ?, content_hash = ?, bytes = ?, elapsed_ms = ?,
          fetch_count = fetch_count + 1,
          ok_count = ok_count + ?, redirect_count = redirect_count + ?,
          notfound_count = notfound_count + ?, gone_count = gone_count + ?,
          blocked_count = blocked_count + ?, server_error_count = server_error_count + ?,
          timeout_count = timeout_count + ?,
          fields_found = ?, conflict_count = conflict_count + ?
        WHERE canonical_url = ?
      `).run(
        ts, statusCode, finalUrl || '', contentType, contentHash, bytes, elapsedMs,
        okDelta, redirectDelta, notfoundDelta, goneDelta, blockedDelta, serverErrDelta, timeoutDelta,
        JSON.stringify(mergedFields), conflictDelta,
        canonicalUrl
      );
    } else {
      this.db.prepare(`
        INSERT INTO urls (
          canonical_url, original_url, domain, path_sig, product_id,
          first_seen_ts, last_seen_ts, last_status, last_final_url,
          content_type, content_hash, bytes, elapsed_ms,
          fetch_count, ok_count, redirect_count, notfound_count, gone_count,
          blocked_count, server_error_count, timeout_count,
          fields_found, avg_confidence, conflict_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        canonicalUrl, url, normalized.domain || '', normalized.path_sig || '', productId,
        ts, ts, statusCode, finalUrl || '',
        contentType, contentHash, bytes, elapsedMs,
        (statusCode >= 200 && statusCode < 300) ? 1 : 0,
        (statusCode >= 300 && statusCode < 400) ? 1 : 0,
        statusCode === 404 ? 1 : 0,
        statusCode === 410 ? 1 : 0,
        (statusCode === 403 || statusCode === 429) ? 1 : 0,
        statusCode >= 500 ? 1 : 0,
        (statusCode === 0 && error) ? 1 : 0,
        JSON.stringify(mergedFields), confidence, conflictFlag ? 1 : 0
      );
    }

    return {
      canonical_url: canonicalUrl,
      original_url: url,
      domain: normalized.domain || '',
      path_sig: normalized.path_sig || '',
      first_seen_ts: existing ? existing.first_seen_ts : ts,
      last_seen_ts: ts,
      last_status: statusCode,
      last_final_url: finalUrl || '',
      content_type: contentType,
      content_hash: contentHash,
      fetch_count: fetchCount,
      fields_found: mergedFields,
      avg_confidence: confidence,
      conflict_count: existing ? existing.conflict_count + (conflictFlag ? 1 : 0) : (conflictFlag ? 1 : 0),
    };
  }

  aggregateDomainStats(domains) {
    const now = Date.now();
    const results = new Map();
    for (const domain of domains || []) {
      const key = String(domain || '').trim().toLowerCase();
      if (!key) continue;

      const rows = this.db.prepare(
        'SELECT fetch_count, ok_count, blocked_count, timeout_count, elapsed_ms, last_status, last_seen_ts, cooldown_next_retry_ts FROM urls WHERE domain = ?'
      ).all(key);

      let fetchCount = 0;
      let okCount = 0;
      let blockedCount = 0;
      let timeoutCount = 0;
      let totalElapsedMs = 0;
      let latencyCount = 0;
      let maxCooldownMs = 0;
      let lastBlockedTs = null;

      for (const row of rows) {
        fetchCount += toInt(row.fetch_count, 0);
        okCount += toInt(row.ok_count, 0);
        blockedCount += toInt(row.blocked_count, 0);
        timeoutCount += toInt(row.timeout_count, 0);
        const elapsed = toInt(row.elapsed_ms, 0);
        if (elapsed > 0) {
          totalElapsedMs += elapsed;
          latencyCount++;
        }
        const nextRetryTs = String(row.cooldown_next_retry_ts || '').trim();
        if (nextRetryTs) {
          const nextMs = Date.parse(nextRetryTs);
          if (Number.isFinite(nextMs) && nextMs > now) {
            maxCooldownMs = Math.max(maxCooldownMs, nextMs - now);
          }
        }
        const lastStatus = toInt(row.last_status, 0);
        if (lastStatus === 403 || lastStatus === 429) {
          const ts = String(row.last_seen_ts || '').trim();
          if (ts && (!lastBlockedTs || ts > lastBlockedTs)) {
            lastBlockedTs = ts;
          }
        }
      }

      const successRate = fetchCount > 0 ? okCount / fetchCount : 0;
      const avgLatencyMs = latencyCount > 0 ? Math.round(totalElapsedMs / latencyCount) : 0;

      results.set(key, {
        fetch_count: fetchCount,
        ok_count: okCount,
        blocked_count: blockedCount,
        timeout_count: timeoutCount,
        success_rate: Number.parseFloat(successRate.toFixed(4)),
        avg_latency_ms: avgLatencyMs,
        cooldown_remaining_ms: Math.round(maxCooldownMs),
        last_blocked_ts: lastBlockedTs,
      });
    }
    return results;
  }

  buildQueryExecutionHistory(productId) {
    const product = String(productId || '').trim();
    const queryRows = this.db.prepare('SELECT * FROM queries WHERE product_id = ?').all(product);
    const queries = queryRows.map((row) => {
      const results = JSON.parse(row.results || '[]');
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

  close() {
    this.db.close();
  }
}
