// WHY: Pure function that rebuilds SQL state from checkpoint files (run.json / product.json)
// when the database is lost or needs recovery. All writes are idempotent upserts wrapped
// in a single transaction for atomicity.

import { cleanVariant, isFabricatedVariant } from '../../features/catalog/identity/identityDedup.js';

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

  specDb.upsertProductRun({
    product_id: run.product_id || '',
    run_id: run.run_id || '',
    is_latest: true,
    summary: cp.run_summary || null,
    validated: cp.run_summary?.validated || false,
    confidence: cp.run_summary?.confidence || 0,
    cost_usd_run: 0,
    sources_attempted: counters.urls_crawled || 0,
    run_at: createdAt,
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
  const identity = cp.identity || {};
  const model = String(identity.model || '').trim();
  const baseModel = String(identity.base_model || model).trim();
  // WHY: Fabricated variants (tokens already in model) must never reach the DB.
  // Use base_model for the check when available — variant tokens naturally
  // appear in the full model name but NOT in the base_model.
  let variant = cleanVariant(identity.variant);
  const fabricationRef = baseModel !== model ? baseModel : model;
  if (variant && isFabricatedVariant(fabricationRef, variant)) {
    variant = '';
  }

  specDb.upsertProduct({
    category: cp.category || '',
    product_id: cp.product_id || '',
    brand: identity.brand || '',
    model,
    base_model: baseModel,
    variant,
    status: identity.status || 'active',
    seed_urls: Array.isArray(identity.seed_urls) ? JSON.stringify(identity.seed_urls) : (identity.seed_urls || null),
    identifier: identity.identifier || null,
    brand_identifier: identity.brand_identifier || '',
  });

  specDb.upsertQueueProduct({
    category: cp.category || '',
    product_id: cp.product_id || '',
    status: 'complete',
    priority: 3,
    last_run_id: cp.latest_run_id || null,
    rounds_completed: cp.runs_completed || 1,
    last_completed_at: cp.updated_at || null,
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

  return {
    type: 'product',
    product_id: cp.product_id || '',
    category: cp.category || '',
    runs_seeded: 0,
    sources_seeded: 0,
    artifacts_seeded: 0,
    cooldowns_seeded: cooldownsSeeded,
    product_seeded: true,
    queue_seeded: true,
  };
}

export function seedFromCheckpoint({ specDb, checkpoint }) {
  if (!specDb) throw new Error('seedFromCheckpoint requires specDb');
  if (!checkpoint || !checkpoint.checkpoint_type) {
    throw new Error('seedFromCheckpoint requires a valid checkpoint with checkpoint_type');
  }

  const type = String(checkpoint.checkpoint_type).trim();
  if (type !== 'crawl' && type !== 'product') {
    throw new Error(`Unknown checkpoint_type: ${type}`);
  }

  const seed = type === 'crawl' ? seedCrawlCheckpoint : seedProductCheckpoint;
  const tx = specDb.db.transaction(() => seed(specDb, checkpoint));
  return tx();
}
