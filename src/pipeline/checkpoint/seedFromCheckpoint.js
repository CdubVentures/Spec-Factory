// WHY: Pure function that rebuilds SQL state from checkpoint files (run.json / product.json)
// when the database is lost or needs recovery. All writes are hash-gated: if the checkpoint
// content hasn't changed, the seed is skipped. When content changes, affected rows are wiped
// and re-inserted in a single transaction for atomicity.

import { normalizeProductIdentity } from '../../features/catalog/identity/identityDedup.js';
import { sha256Hex } from '../../shared/contentHash.js';

function extractHost(url) {
  try { return new URL(String(url || '')).hostname; } catch { return ''; }
}

function seedCrawlCheckpoint(specDb, cp) {
  const run = cp.run || {};
  const counters = cp.counters || {};
  const createdAt = cp.created_at || new Date().toISOString();
  let artifactsSeeded = 0;
  let sourcesSeeded = 0;

  specDb.upsertRun({
    run_id: run.run_id || '',
    category: run.category || '',
    product_id: run.product_id || '',
    status: run.status || 'completed',
    started_at: createdAt,
    ended_at: createdAt,
    stage_cursor: '',
    identity_fingerprint: '',
    identity_lock_status: '',
    dedupe_mode: '',
    s3key: run.s3_key || '',
    out_root: '',
    counters,
  });

  const runId = run.run_id || '';
  const category = run.category || '';

  if (cp.needset) {
    specDb.upsertRunArtifact({ run_id: runId, artifact_type: 'needset', category, payload: cp.needset });
    artifactsSeeded += 1;
  }
  if (cp.search_profile) {
    specDb.upsertRunArtifact({ run_id: runId, artifact_type: 'search_profile', category, payload: cp.search_profile });
    artifactsSeeded += 1;
  }
  if (cp.run_summary) {
    specDb.upsertRunArtifact({ run_id: runId, artifact_type: 'run_summary', category, payload: cp.run_summary });
    artifactsSeeded += 1;
  }
  if (cp.brand_resolution) {
    specDb.upsertRunArtifact({ run_id: runId, artifact_type: 'brand_resolution', category, payload: cp.brand_resolution });
    artifactsSeeded += 1;
  }
  if (cp.runtime_ops_panels) {
    specDb.upsertRunArtifact({ run_id: runId, artifact_type: 'runtime_ops_panels', category, payload: cp.runtime_ops_panels });
    artifactsSeeded += 1;
  }
  // WHY: Reconstruct run_checkpoint from counters already in the checkpoint.
  // The original run_checkpoint artifact is written by writeCrawlCheckpoint after
  // the checkpoint file is created, so it may not be in the JSON. The counters
  // (the valuable data) are always present.
  if (counters.urls_crawled > 0 || counters.urls_successful > 0) {
    specDb.upsertRunArtifact({
      run_id: runId, artifact_type: 'run_checkpoint', category,
      payload: { urls_crawled: counters.urls_crawled || 0, urls_successful: counters.urls_successful || 0, checkpoint_path: '' },
    });
    artifactsSeeded += 1;
  }

  const sources = Array.isArray(cp.sources) ? cp.sources : [];
  for (const src of sources) {
    if (!src.content_hash) continue;
    specDb.insertCrawlSource({
      content_hash: src.content_hash,
      category,
      product_id: run.product_id || '',
      run_id: runId,
      source_url: src.url || '',
      final_url: src.final_url || '',
      host: extractHost(src.url),
      http_status: src.status || 0,
      file_path: src.html_file || '',
      has_screenshot: (src.screenshot_count || 0) > 0,
      crawled_at: createdAt,
    });
    // WHY: Rebuild url_crawl_ledger from checkpoint sources.
    if (typeof specDb.upsertUrlCrawlEntry === 'function') {
      const host = String(src.domain || '') || extractHost(src.url);
      specDb.upsertUrlCrawlEntry({
        canonical_url: src.url || '',
        product_id: run.product_id || '',
        category,
        original_url: src.url || '',
        domain: host,
        final_url: src.final_url || '',
        content_hash: src.content_hash,
        http_status: src.status || 0,
        elapsed_ms: src.elapsed_ms || 0,
        fetch_count: src.fetch_count || 1,
        ok_count: src.ok_count || 0,
        blocked_count: src.blocked_count || 0,
        timeout_count: src.timeout_count || 0,
        first_seen_ts: createdAt,
        last_seen_ts: createdAt,
        first_seen_run_id: runId,
        last_seen_run_id: runId,
      });
    }
    sourcesSeeded += 1;
  }

  return {
    type: 'crawl',
    product_id: run.product_id || '',
    category,
    runs_seeded: 1,
    sources_seeded: sourcesSeeded,
    artifacts_seeded: artifactsSeeded,
    product_seeded: false,
    queue_seeded: false,
  };
}

function seedProductCheckpoint(specDb, cp) {
  const raw = cp.identity || {};
  // WHY: base_model is the identity primary key. model is derived from base_model + variant.
  const normalized = normalizeProductIdentity(
    cp.category, raw.brand, raw.base_model, raw.variant
  );

  specDb.upsertProduct({
    category: cp.category || '',
    product_id: cp.product_id || '',
    brand: normalized.brand,
    model: normalized.model,
    base_model: normalized.base_model,
    variant: normalized.variant,
    status: raw.status || 'active',
    identifier: raw.identifier || null,
    brand_identifier: raw.brand_identifier || '',
  });

  // WHY: Rebuild query_cooldowns so tier progression survives DB rebuild.
  // Product.json carries the latest cooldown snapshot — one row per unique query.
  const cooldowns = Array.isArray(cp.query_cooldowns) ? cp.query_cooldowns : [];
  let cooldownsSeeded = 0;
  for (const cd of cooldowns) {
    if (!cd.query_hash || !cd.cooldown_until) continue;
    if (typeof specDb.upsertQueryCooldown === 'function') {
      specDb.upsertQueryCooldown({
        query_hash: cd.query_hash,
        product_id: cp.product_id || '',
        category: cp.category || '',
        query_text: cd.query_text || '',
        provider: cd.provider || '',
        tier: cd.tier || null,
        group_key: cd.group_key || null,
        normalized_key: cd.normalized_key || null,
        hint_source: cd.hint_source || null,
        attempt_count: cd.attempt_count || 1,
        result_count: cd.result_count || 0,
        last_executed_at: cd.last_executed_at || cp.updated_at || '',
        cooldown_until: cd.cooldown_until,
      });
      cooldownsSeeded++;
    }
  }

  // WHY: Rehydrate field_histories artifact for the latest run so tier-3
  // enrichment progression survives DB deletion. Mirrors the query_cooldowns
  // rebuild path above — product.json is the durable SSOT.
  const fieldHistories = cp.field_histories;
  if (fieldHistories && typeof fieldHistories === 'object' && Object.keys(fieldHistories).length > 0) {
    const latestRunId = String(cp.latest_run_id || '').trim();
    if (latestRunId) {
      specDb.upsertRunArtifact({
        run_id: latestRunId,
        artifact_type: 'field_histories',
        category: cp.category || '',
        payload: fieldHistories,
      });
    }
  }

  // WHY: Rebuild crawl_sources from product.json.sources so URL index survives
  // DB deletion even when run.json files are missing. Does NOT seed url_crawl_ledger
  // because its additive counters would double-count when run.json is also present.
  const sources = Array.isArray(cp.sources) ? cp.sources : [];
  let sourcesSeeded = 0;
  for (const src of sources) {
    if (!src.content_hash) continue;
    specDb.insertCrawlSource({
      content_hash: src.content_hash,
      category: cp.category || '',
      product_id: cp.product_id || '',
      run_id: src.last_seen_run_id || cp.latest_run_id || '',
      source_url: src.url || '',
      final_url: src.final_url || '',
      host: src.host || extractHost(src.url),
      http_status: src.status || 0,
      file_path: src.html_file || '',
      has_screenshot: (src.screenshot_count || 0) > 0,
      crawled_at: cp.updated_at || '',
    });
    sourcesSeeded++;
  }

  return {
    type: 'product',
    product_id: cp.product_id || '',
    category: cp.category || '',
    runs_seeded: 0,
    sources_seeded: sourcesSeeded,
    artifacts_seeded: 0,
    cooldowns_seeded: cooldownsSeeded,
    product_seeded: true,
    queue_seeded: true,
  };
}

export function seedFromCheckpoint({ specDb, checkpoint, rawJson }) {
  if (!specDb) throw new Error('seedFromCheckpoint requires specDb');
  if (!checkpoint || !checkpoint.checkpoint_type) {
    throw new Error('seedFromCheckpoint requires a valid checkpoint with checkpoint_type');
  }

  const type = String(checkpoint.checkpoint_type).trim();
  if (type !== 'crawl' && type !== 'product') {
    throw new Error(`Unknown checkpoint_type: ${type}`);
  }

  // WHY: Per-file hash gate — skip if checkpoint content hasn't changed since last seed.
  // When content changes, wipe affected rows before re-inserting (inside the same transaction)
  // so removals from JSON propagate to SQL.
  if (rawJson) {
    const hashKey = type === 'crawl'
      ? `run:${checkpoint.run?.run_id || ''}`
      : `product:${checkpoint.product_id || ''}`;
    const currentHash = sha256Hex(rawJson);
    const storedHash = specDb.getFileSeedHash(hashKey);
    if (currentHash && currentHash === storedHash) {
      return {
        type,
        product_id: type === 'crawl' ? (checkpoint.run?.product_id || '') : (checkpoint.product_id || ''),
        category: type === 'crawl' ? (checkpoint.run?.category || '') : (checkpoint.category || ''),
        runs_seeded: 0, sources_seeded: 0, artifacts_seeded: 0,
        product_seeded: false, queue_seeded: false, cooldowns_seeded: 0,
        skipped: true,
      };
    }

    const seed = type === 'crawl' ? seedCrawlCheckpoint : seedProductCheckpoint;
    const tx = specDb.db.transaction(() => {
      if (type === 'crawl') {
        const runId = checkpoint.run?.run_id || '';
        if (runId) {
          specDb.db.prepare('DELETE FROM crawl_sources WHERE run_id = ?').run(runId);
          specDb.db.prepare('DELETE FROM run_sources WHERE run_id = ?').run(runId);
          specDb.db.prepare('DELETE FROM run_artifacts WHERE run_id = ?').run(runId);
        }
      } else {
        const pid = checkpoint.product_id || '';
        if (pid) {
          specDb.db.prepare('DELETE FROM query_cooldowns WHERE product_id = ?').run(pid);
          specDb.db.prepare('DELETE FROM crawl_sources WHERE product_id = ?').run(pid);
          specDb.db.prepare('DELETE FROM run_sources WHERE product_id = ?').run(pid);
        }
      }
      return seed(specDb, checkpoint);
    });
    const result = tx();
    specDb.setFileSeedHash(hashKey, currentHash);
    return result;
  }

  // Fallback: no rawJson provided (backward compat for tests / direct callers)
  const seed = type === 'crawl' ? seedCrawlCheckpoint : seedProductCheckpoint;
  const tx = specDb.db.transaction(() => seed(specDb, checkpoint));
  return tx();
}
