import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../../../db/specDb.js';
import { seedFromCheckpoint } from '../seedFromCheckpoint.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function makeCrawlCheckpoint(overrides = {}) {
  return {
    schema_version: 2,
    checkpoint_type: 'crawl',
    created_at: '2026-03-29T10:00:00.000Z',
    run: {
      run_id: 'run-seed-001',
      category: 'mouse',
      product_id: 'mouse-razer-viper',
      s3_key: 'specs/inputs/mouse/products/mouse-razer-viper.json',
      duration_ms: 5000,
      status: 'completed',
    },
    identity: { brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro', variant: '' },
    fetch_plan: { total_queued: 5, seed_count: 2, approved_count: 2, blocked_count: 0 },
    counters: { urls_crawled: 3, urls_successful: 2, urls_blocked: 1, urls_failed: 0, urls_timeout_rescued: 0 },
    artifacts: { html_dir: 'html', screenshot_dir: 'screenshots', video_dir: 'video' },
    sources: [
      { url: 'https://razer.com/page', final_url: 'https://razer.com/page', status: 200, success: true, blocked: false, block_reason: null, worker_id: 'fetch-1', content_hash: 'a'.repeat(64), html_file: 'aaaaaaaaaaaa.html.gz', screenshot_count: 2, video_file: 'fetch-1.webm', timeout_rescued: false, fetch_error: null },
      { url: 'https://rtings.com/review', final_url: 'https://rtings.com/review', status: 200, success: true, blocked: false, block_reason: null, worker_id: 'fetch-2', content_hash: 'b'.repeat(64), html_file: 'bbbbbbbbbbbb.html.gz', screenshot_count: 0, video_file: 'fetch-2.webm', timeout_rescued: false, fetch_error: null },
      { url: 'https://blocked.com', final_url: 'https://blocked.com', status: 403, success: false, blocked: true, block_reason: 'status_403', worker_id: 'fetch-3', content_hash: null, html_file: null, screenshot_count: 0, video_file: null, timeout_rescued: false, fetch_error: null },
    ],
    needset: { total_fields: 10, fields: [] },
    search_profile: { status: 'executed', query_rows: [] },
    run_summary: { validated: true, confidence: 0.85 },
    ...overrides,
  };
}

function makeProductCheckpoint(overrides = {}) {
  return {
    schema_version: 1,
    checkpoint_type: 'product',
    product_id: 'mouse-razer-viper',
    category: 'mouse',
    identity: { brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro', variant: '' },
    latest_run_id: 'run-seed-001',
    runs_completed: 2,
    sources: [
      { url: 'https://razer.com/page', final_url: 'https://razer.com/page', host: 'razer.com', content_hash: 'a'.repeat(64), html_file: 'aaaaaaaaaaaa.html.gz', screenshot_count: 2, status: 200, first_seen_run_id: 'run-seed-001', last_seen_run_id: 'run-seed-001' },
    ],
    fields: {},
    provenance: {},
    updated_at: '2026-03-29T10:05:00.000Z',
    ...overrides,
  };
}

// ── Crawl checkpoint tests ──────────────────────────────────────────────────

describe('seedFromCheckpoint: crawl', () => {
  test('seeds runs table with correct fields', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    const run = db.getRunByRunId('run-seed-001');
    assert.ok(run);
    assert.equal(run.category, 'mouse');
    assert.equal(run.product_id, 'mouse-razer-viper');
    assert.equal(run.status, 'completed');
    assert.equal(run.s3key, 'specs/inputs/mouse/products/mouse-razer-viper.json');
    assert.equal(run.started_at, '2026-03-29T10:00:00.000Z');
    assert.deepEqual(run.counters, { urls_crawled: 3, urls_successful: 2, urls_blocked: 1, urls_failed: 0, urls_timeout_rescued: 0 });
  });

  test('seeds needset run_artifact', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    const art = db.getRunArtifact('run-seed-001', 'needset');
    assert.ok(art);
    assert.deepEqual(art.payload, { total_fields: 10, fields: [] });
  });

  test('seeds search_profile run_artifact', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    const art = db.getRunArtifact('run-seed-001', 'search_profile');
    assert.ok(art);
    assert.deepEqual(art.payload, { status: 'executed', query_rows: [] });
  });

  test('seeds run_summary run_artifact', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    const art = db.getRunArtifact('run-seed-001', 'run_summary');
    assert.ok(art);
    assert.deepEqual(art.payload, { validated: true, confidence: 0.85 });
  });

  test('skips null needset artifact', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint({ needset: null }) });
    const art = db.getRunArtifact('run-seed-001', 'needset');
    assert.equal(art, null);
  });

  test('seeds crawl_sources for sources with content_hash', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    const sources = db.getCrawlSourcesByProduct('mouse-razer-viper');
    assert.equal(sources.length, 2);
    const byHash = new Map(sources.map((s) => [s.content_hash, s]));
    const razer = byHash.get('a'.repeat(64));
    assert.ok(razer);
    assert.equal(razer.host, 'razer.com');
    assert.equal(razer.http_status, 200);
    assert.equal(razer.has_screenshot, 1);
    assert.equal(razer.source_url, 'https://razer.com/page');
    const rtings = byHash.get('b'.repeat(64));
    assert.ok(rtings);
    assert.equal(rtings.host, 'rtings.com');
    assert.equal(rtings.has_screenshot, 0);
  });

  test('skips sources with null content_hash', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    const sources = db.getCrawlSourcesByProduct('mouse-razer-viper');
    const hashes = sources.map((s) => s.content_hash);
    assert.ok(!hashes.includes(null));
    assert.ok(!hashes.includes(''));
    assert.equal(sources.length, 2);
  });

  test('seeds run_sources with checkpoint source metadata for deleted-DB rebuild', () => {
    const db = createHarness();
    seedFromCheckpoint({
      specDb: db,
      checkpoint: makeCrawlCheckpoint({
        sources: [
          {
            url: 'https://razer.com/manual.pdf',
            final_url: 'https://razer.com/manual.pdf',
            status: 200,
            content_hash: 'c'.repeat(64),
            html_file: 'cccccccccccc.html.gz',
            screenshot_count: 1,
            source_tier: 1,
            doc_kind: 'manual',
            content_type: 'application/pdf',
            size_bytes: 4096,
            has_pdf: true,
            has_ldjson: true,
            has_dom_snippet: true,
          },
        ],
      }),
    });

    const rows = db.getRunSourcesByRunId('run-seed-001');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source_url, 'https://razer.com/manual.pdf');
    assert.equal(rows[0].source_tier, 1);
    assert.equal(rows[0].doc_kind, 'manual');
    assert.equal(rows[0].content_type, 'application/pdf');
    assert.equal(rows[0].size_bytes, 4096);
    assert.equal(rows[0].has_pdf, 1);
    assert.equal(rows[0].has_ldjson, 1);
    assert.equal(rows[0].has_dom_snippet, 1);
  });

  test('returns correct summary counts', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    assert.equal(result.type, 'crawl');
    assert.equal(result.runs_seeded, 1);
    assert.equal(result.sources_seeded, 2);
    // 3 original (needset + search_profile + run_summary) + run_checkpoint (reconstructed from counters)
    assert.equal(result.artifacts_seeded, 4);
    assert.equal(result.product_id, 'mouse-razer-viper');
    assert.equal(result.category, 'mouse');
    assert.equal(result.product_seeded, false);
    assert.equal(result.queue_seeded, false);
  });

  test('empty sources array → sources_seeded=0', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint({ sources: [] }) });
    assert.equal(result.sources_seeded, 0);
    const sources = db.getCrawlSourcesByProduct('mouse-razer-viper');
    assert.equal(sources.length, 0);
  });

  test('null run_summary + needset + search_profile → only run_checkpoint artifact', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({
      specDb: db,
      checkpoint: makeCrawlCheckpoint({ needset: null, search_profile: null, run_summary: null }),
    });
    // WHY: run_checkpoint is still reconstructed from counters even when other artifacts are null
    assert.equal(result.artifacts_seeded, 1);
  });

  test('seeds brand_resolution artifact from checkpoint', () => {
    const db = createHarness();
    const brandResolution = { scope: 'brand', brand: 'Razer', status: 'resolved', confidence: 0.95 };
    const result = seedFromCheckpoint({
      specDb: db,
      checkpoint: makeCrawlCheckpoint({ brand_resolution: brandResolution }),
    });
    const art = db.getRunArtifact('run-seed-001', 'brand_resolution');
    assert.ok(art);
    assert.equal(art.payload.brand, 'Razer');
    assert.equal(art.payload.confidence, 0.95);
    assert.ok(result.artifacts_seeded >= 4);
  });

  test('skips null brand_resolution gracefully', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({
      specDb: db,
      checkpoint: makeCrawlCheckpoint({ brand_resolution: null }),
    });
    const art = db.getRunArtifact('run-seed-001', 'brand_resolution');
    assert.equal(art, null);
  });

  test('reconstructs run_checkpoint artifact from counters', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    const art = db.getRunArtifact('run-seed-001', 'run_checkpoint');
    assert.ok(art);
    assert.equal(art.payload.urls_crawled, 3);
    assert.equal(art.payload.urls_successful, 2);
  });

  test('artifact count includes brand_resolution + run_checkpoint', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({
      specDb: db,
      checkpoint: makeCrawlCheckpoint({
        brand_resolution: { scope: 'brand', brand: 'Razer', status: 'resolved' },
      }),
    });
    // 3 original (needset + search_profile + run_summary) + brand_resolution + run_checkpoint = 5
    assert.equal(result.artifacts_seeded, 5);
  });

  test('seeds runtime_ops_panels artifact from v3 checkpoint', () => {
    const db = createHarness();
    const panels = { prefetch: { brand_resolver: { status: 'resolved' } } };
    const result = seedFromCheckpoint({
      specDb: db,
      checkpoint: makeCrawlCheckpoint({ runtime_ops_panels: panels }),
    });
    const art = db.getRunArtifact('run-seed-001', 'runtime_ops_panels');
    assert.ok(art);
    assert.deepEqual(art.payload, panels);
    // needset + search_profile + run_summary + runtime_ops_panels + run_checkpoint = 5
    assert.equal(result.artifacts_seeded, 5);
  });

  test('skips null runtime_ops_panels gracefully', () => {
    const db = createHarness();
    seedFromCheckpoint({
      specDb: db,
      checkpoint: makeCrawlCheckpoint({ runtime_ops_panels: null }),
    });
    const art = db.getRunArtifact('run-seed-001', 'runtime_ops_panels');
    assert.equal(art, null);
  });
});

// ── Product checkpoint tests ────────────────────────────────────────────────

describe('seedFromCheckpoint: product', () => {
  test('seeds products table with identity', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint() });
    const product = db.getProduct('mouse-razer-viper');
    assert.ok(product);
    assert.equal(product.brand, 'Razer');
    assert.equal(product.model, 'Viper V3 Pro');
    assert.equal(product.variant, '');
    assert.equal(product.status, 'active');
  });

  test('returns correct summary', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint() });
    assert.equal(result.type, 'product');
    assert.equal(result.product_seeded, true);
    assert.equal(result.queue_seeded, true);
    assert.equal(result.runs_seeded, 0);
    assert.equal(result.sources_seeded, 1);
    assert.equal(result.artifacts_seeded, 0);
    assert.equal(result.product_id, 'mouse-razer-viper');
    assert.equal(result.category, 'mouse');
  });
});

// ── Cross-cutting tests ─────────────────────────────────────────────────────

describe('seedFromCheckpoint: validation', () => {
  test('throws on null checkpoint', () => {
    const db = createHarness();
    assert.throws(() => seedFromCheckpoint({ specDb: db, checkpoint: null }), /requires a valid checkpoint/);
  });

  test('throws on unknown checkpoint_type', () => {
    const db = createHarness();
    assert.throws(
      () => seedFromCheckpoint({ specDb: db, checkpoint: { checkpoint_type: 'unknown' } }),
      /Unknown checkpoint_type/,
    );
  });

  test('throws on null specDb', () => {
    assert.throws(
      () => seedFromCheckpoint({ specDb: null, checkpoint: makeCrawlCheckpoint() }),
      /requires specDb/,
    );
  });

  test('idempotency: product seeded twice → same row', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint();
    seedFromCheckpoint({ specDb: db, checkpoint: cp });
    seedFromCheckpoint({ specDb: db, checkpoint: cp });
    const product = db.getProduct('mouse-razer-viper');
    assert.ok(product);
    assert.equal(product.brand, 'Razer');
  });

  test('return type field = crawl', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeCrawlCheckpoint() });
    assert.equal(result.type, 'crawl');
  });

  test('return type field = product', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint() });
    assert.equal(result.type, 'product');
  });
});

// ── Query cooldown persistence tests ──────────────────────────────────────────

describe('seedFromCheckpoint: query_cooldowns via product checkpoint', () => {
  const SAMPLE_COOLDOWNS = [
    { query_hash: 'h1', query_text: 'razer viper specifications', provider: '', tier: 'seed', group_key: null, normalized_key: null, hint_source: 'tier1_seed', attempt_count: 1, result_count: 5, last_executed_at: '2026-03-29T10:00:00Z', cooldown_until: '2026-04-28T10:00:00Z' },
    { query_hash: 'h2', query_text: 'razer viper rtings.com', provider: 'rtings.com', tier: 'seed', group_key: null, normalized_key: null, hint_source: 'tier1_seed', attempt_count: 2, result_count: 8, last_executed_at: '2026-03-29T10:01:00Z', cooldown_until: '2026-04-28T10:01:00Z' },
    { query_hash: 'h3', query_text: 'razer viper sensor performance', provider: 'serper', tier: 'group_search', group_key: 'sensor_performance', normalized_key: null, hint_source: 'tier2_group', attempt_count: 1, result_count: 10, last_executed_at: '2026-03-29T10:02:00Z', cooldown_until: '2026-04-28T10:02:00Z' },
  ];

  test('seeds query_cooldowns from product checkpoint', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint({ query_cooldowns: SAMPLE_COOLDOWNS });
    const result = seedFromCheckpoint({ specDb: db, checkpoint: cp });
    assert.equal(result.cooldowns_seeded, 3);
    const history = db.buildQueryExecutionHistory('mouse-razer-viper');
    assert.equal(history.queries.length, 3);
  });

  test('re-seeding same product is idempotent', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint({ query_cooldowns: SAMPLE_COOLDOWNS });
    seedFromCheckpoint({ specDb: db, checkpoint: cp });
    seedFromCheckpoint({ specDb: db, checkpoint: cp });
    const history = db.buildQueryExecutionHistory('mouse-razer-viper');
    assert.equal(history.queries.length, 3);
  });

  test('skips cooldowns without query_hash or cooldown_until', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint({
      query_cooldowns: [
        { query_hash: '', query_text: 'no hash', cooldown_until: '2026-04-28T10:00:00Z' },
        { query_hash: 'h1', query_text: 'no cooldown', cooldown_until: '' },
        ...SAMPLE_COOLDOWNS,
      ],
    });
    const result = seedFromCheckpoint({ specDb: db, checkpoint: cp });
    assert.equal(result.cooldowns_seeded, 3);
  });

  test('empty query_cooldowns is fine', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint({ query_cooldowns: [] });
    const result = seedFromCheckpoint({ specDb: db, checkpoint: cp });
    assert.equal(result.cooldowns_seeded, 0);
  });

  test('missing query_cooldowns is fine (backward compat)', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint() });
    assert.equal(result.cooldowns_seeded, 0);
  });
});

// ── Field histories persistence tests (tier-3 enrichment progression rebuild) ──

describe('seedFromCheckpoint: field_histories via product checkpoint', () => {
  const SAMPLE_HISTORIES = {
    weight: {
      query_count: 3,
      existing_queries: ['razer viper weight', 'razer viper mass', 'razer viper grams'],
      domains_tried: ['rtings.com', 'techpowerup.com'],
      host_classes_tried: ['review'],
      evidence_classes_tried: ['review'],
      urls_examined_count: 2,
      no_value_attempts: 0,
      duplicate_attempts_suppressed: 0,
      query_modes_tried_for_key: ['key_search'],
    },
    dpi: {
      query_count: 2,
      existing_queries: ['razer viper dpi', 'razer viper sensitivity'],
      domains_tried: [],
      host_classes_tried: [],
      evidence_classes_tried: [],
      urls_examined_count: 0,
      no_value_attempts: 0,
      duplicate_attempts_suppressed: 0,
      query_modes_tried_for_key: ['key_search'],
    },
  };

  test('seeds field_histories artifact from product checkpoint', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint({ field_histories: SAMPLE_HISTORIES });
    seedFromCheckpoint({ specDb: db, checkpoint: cp });
    const artifact = db.getRunArtifact('run-seed-001', 'field_histories');
    assert.ok(artifact, 'field_histories artifact must be persisted');
    assert.deepEqual(artifact.payload, SAMPLE_HISTORIES);
  });

  test('empty field_histories is a no-op (no artifact written)', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint({ field_histories: {} });
    seedFromCheckpoint({ specDb: db, checkpoint: cp });
    const artifact = db.getRunArtifact('run-seed-001', 'field_histories');
    assert.equal(artifact, null, 'no artifact for empty histories');
  });

  test('missing field_histories is fine (backward compat — old product.json without the field)', () => {
    const db = createHarness();
    // makeProductCheckpoint default does NOT include field_histories
    seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint() });
    const artifact = db.getRunArtifact('run-seed-001', 'field_histories');
    assert.equal(artifact, null);
  });

  test('re-seeding same product is idempotent (artifact upserts cleanly)', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint({ field_histories: SAMPLE_HISTORIES });
    seedFromCheckpoint({ specDb: db, checkpoint: cp });
    seedFromCheckpoint({ specDb: db, checkpoint: cp });
    const artifact = db.getRunArtifact('run-seed-001', 'field_histories');
    assert.ok(artifact);
    assert.deepEqual(artifact.payload, SAMPLE_HISTORIES);
  });
});

// ── Product checkpoint source seeding tests ─────────────────────────────────

describe('seedFromCheckpoint: product sources', () => {
  const TWO_SOURCES = [
    { url: 'https://razer.com/page', final_url: 'https://razer.com/page', host: 'razer.com', content_hash: 'a'.repeat(64), html_file: 'aaaaaaaaaaaa.html.gz', screenshot_count: 2, status: 200, first_seen_run_id: 'run-seed-001', last_seen_run_id: 'run-seed-001' },
    { url: 'https://rtings.com/review', final_url: 'https://rtings.com/review', host: 'rtings.com', content_hash: 'b'.repeat(64), html_file: 'bbbbbbbbbbbb.html.gz', screenshot_count: 0, status: 200, first_seen_run_id: 'run-seed-001', last_seen_run_id: 'run-seed-001' },
  ];

  test('sources with content_hash seed crawl_sources rows', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint({ sources: TWO_SOURCES }) });
    assert.equal(result.sources_seeded, 2);
    const sources = db.getCrawlSourcesByProduct('mouse-razer-viper');
    assert.equal(sources.length, 2);
    const byHash = new Map(sources.map((s) => [s.content_hash, s]));
    const razer = byHash.get('a'.repeat(64));
    assert.ok(razer);
    assert.equal(razer.source_url, 'https://razer.com/page');
    assert.equal(razer.host, 'razer.com');
    assert.equal(razer.http_status, 200);
    assert.equal(razer.has_screenshot, 1);
    assert.equal(razer.file_path, 'aaaaaaaaaaaa.html.gz');
    const rtings = byHash.get('b'.repeat(64));
    assert.ok(rtings);
    assert.equal(rtings.host, 'rtings.com');
    assert.equal(rtings.has_screenshot, 0);
  });

  test('empty sources array → sources_seeded=0, no crash', () => {
    const db = createHarness();
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint({ sources: [] }) });
    assert.equal(result.sources_seeded, 0);
    const sources = db.getCrawlSourcesByProduct('mouse-razer-viper');
    assert.equal(sources.length, 0);
  });

  test('missing sources key → sources_seeded=0, no crash (backward compat)', () => {
    const db = createHarness();
    const cp = makeProductCheckpoint();
    delete cp.sources;
    const result = seedFromCheckpoint({ specDb: db, checkpoint: cp });
    assert.equal(result.sources_seeded, 0);
  });

  test('sources without content_hash are skipped', () => {
    const db = createHarness();
    const sources = [
      ...TWO_SOURCES,
      { url: 'https://blocked.com', final_url: 'https://blocked.com', host: 'blocked.com', content_hash: null, html_file: null, screenshot_count: 0, status: 403, first_seen_run_id: 'run-seed-001', last_seen_run_id: 'run-seed-001' },
    ];
    const result = seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint({ sources }) });
    assert.equal(result.sources_seeded, 2);
    assert.equal(db.getCrawlSourcesByProduct('mouse-razer-viper').length, 2);
  });

  test('run_id uses last_seen_run_id, falls back to latest_run_id', () => {
    const db = createHarness();
    const sources = [
      { url: 'https://a.com', final_url: 'https://a.com', host: 'a.com', content_hash: 'c'.repeat(64), html_file: null, screenshot_count: 0, status: 200, first_seen_run_id: 'run-old', last_seen_run_id: 'run-specific' },
      { url: 'https://b.com', final_url: 'https://b.com', host: 'b.com', content_hash: 'd'.repeat(64), html_file: null, screenshot_count: 0, status: 200, first_seen_run_id: 'run-old' },
    ];
    seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint({ sources, latest_run_id: 'run-latest' }) });
    const rows = db.getCrawlSourcesByProduct('mouse-razer-viper');
    const byHash = new Map(rows.map((s) => [s.content_hash, s]));
    assert.equal(byHash.get('c'.repeat(64)).run_id, 'run-specific');
    assert.equal(byHash.get('d'.repeat(64)).run_id, 'run-latest');
  });

  test('hash-gated re-seed deletes old crawl_sources then reseeds', () => {
    const db = createHarness();
    const cp1 = makeProductCheckpoint({ sources: TWO_SOURCES });
    const raw1 = JSON.stringify(cp1);
    seedFromCheckpoint({ specDb: db, checkpoint: cp1, rawJson: raw1 });
    assert.equal(db.getCrawlSourcesByProduct('mouse-razer-viper').length, 2);

    const cp2 = makeProductCheckpoint({ sources: [TWO_SOURCES[0]] });
    const raw2 = JSON.stringify(cp2);
    seedFromCheckpoint({ specDb: db, checkpoint: cp2, rawJson: raw2 });
    assert.equal(db.getCrawlSourcesByProduct('mouse-razer-viper').length, 1);
  });

  test('url_crawl_ledger is NOT seeded from product checkpoint', () => {
    const db = createHarness();
    seedFromCheckpoint({ specDb: db, checkpoint: makeProductCheckpoint({ sources: TWO_SOURCES }) });
    const count = db.db.prepare('SELECT COUNT(*) as c FROM url_crawl_ledger').get().c;
    assert.equal(count, 0);
  });
});
