// WHY: Exhaustive boundary tests for deletionStore — the service that cascades
// deletes through all SQL tables, rewrites checkpoint JSON, and removes filesystem
// artifacts. Tests verify that all three persistence layers (SQL, checkpoints,
// filesystem) are cleaned and that re-seed paths are blocked after deletion.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SpecDb } from '../../specDb.js';
import { createDeletionStore } from '../deletionStore.js';

// ── Factories ────────────────────────────────────────────────────────────────

const CAT = 'mouse';
const PID_A = 'mouse-aaa';
const PID_B = 'mouse-bbb';
const RUN_1 = '20260401010000-aaa111';
const RUN_2 = '20260401020000-bbb222';
const RUN_3 = '20260401030000-ccc333';
const URL_1 = 'https://example.com/mouse-a';
const URL_2 = 'https://other.com/mouse-a';
const HASH_1 = 'aabbccddee01';
const HASH_2 = 'ffeeddccbb02';

function createHarness() {
  const specDb = new SpecDb({ dbPath: ':memory:', category: CAT });
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deletion-test-'));
  const fsRoots = {
    runs: path.join(tmpRoot, 'runs'),
    output: path.join(tmpRoot, 'output'),
    products: path.join(tmpRoot, 'products'),
  };
  fs.mkdirSync(fsRoots.runs, { recursive: true });
  fs.mkdirSync(fsRoots.output, { recursive: true });
  fs.mkdirSync(fsRoots.products, { recursive: true });

  const store = createDeletionStore({ db: specDb.db, category: CAT });
  return { specDb, store, fsRoots, tmpRoot };
}

function cleanup(harness) {
  harness.specDb.close();
  fs.rmSync(harness.tmpRoot, { recursive: true, force: true });
}

/** Seed a minimal run with rows across all run-linked tables. */
function seedRun(specDb, { runId, productId, url, contentHash }) {
  const cat = specDb.category;
  const now = new Date().toISOString();

  // runs
  specDb.upsertRun({
    run_id: runId, category: cat, product_id: productId,
    status: 'completed', started_at: now, ended_at: now,
    stage_cursor: '', identity_fingerprint: '', identity_lock_status: '',
    dedupe_mode: '', s3key: '', out_root: '', counters: {},
  });

  // product_runs
  specDb.upsertProductRun({
    product_id: productId, run_id: runId, is_latest: true,
    summary: null, validated: false, confidence: 0,
    cost_usd_run: 0.01, sources_attempted: 1, run_at: now,
  });

  // run_artifacts
  specDb.upsertRunArtifact({
    run_id: runId, artifact_type: 'needset', category: cat,
    payload: { fields: ['weight'] },
  });

  // crawl_sources
  specDb.insertCrawlSource({
    content_hash: contentHash, category: cat, product_id: productId,
    run_id: runId, source_url: url, final_url: url,
    host: new URL(url).hostname, http_status: 200,
    file_path: `${contentHash.slice(0, 12)}.html.gz`,
    has_screenshot: true, crawled_at: now,
  });

  // source_screenshots
  specDb.insertScreenshot({
    screenshot_id: `ss_${runId}_${contentHash.slice(0, 8)}`,
    content_hash: contentHash, category: cat, product_id: productId,
    run_id: runId, source_url: url, host: new URL(url).hostname,
    selector: '', format: 'jpg', width: 1920, height: 1080,
    size_bytes: 5000, file_path: `screenshot-fetch-1-${contentHash.slice(0, 8)}-00-full.jpg`,
    captured_at: now, doc_kind: 'product_page', source_tier: 1,
  });

  // source_videos
  specDb.insertVideo({
    video_id: `vid_${runId}`,
    content_hash: contentHash, category: cat, product_id: productId,
    run_id: runId, source_url: url, host: new URL(url).hostname,
    worker_id: 'fetch-1', format: 'webm', width: 1920, height: 1080,
    size_bytes: 10000, duration_ms: 5000,
    file_path: 'fetch-1.webm', captured_at: now,
  });

  // billing_entries
  specDb.insertBillingEntry({
    provider: 'google', model: 'gemini-2.5-pro', category: cat,
    product_id: productId, run_id: runId, round: 1,
    prompt_tokens: 100, completion_tokens: 50, cached_prompt_tokens: 0,
    total_tokens: 150, cost_usd: 0.01, reason: 'extraction',
    host: '', url_count: 1, evidence_chars: 500, estimated_usage: false,
    meta: '{}',
  });

  // bridge_events
  specDb.insertBridgeEvent({ run_id: runId, category: cat, product_id: productId, ts: now, stage: 'crawl', event: 'start', payload: '{}' });

  // knob_snapshots
  specDb.insertKnobSnapshot({ category: cat, run_id: runId, ts: now, mismatch_count: 0, total_knobs: 5, entries: '{}' });

  // query_index
  specDb.insertQueryIndexEntry({ category: cat, ts: now, product_id: productId, query: `${productId} specs`, provider: 'google', result_count: 10, field_yield: 3 });

  // url_index
  specDb.insertUrlIndexEntry({ category: cat, ts: now, run_id: runId, url, host: new URL(url).hostname, tier: 1, doc_kind: 'product_page', fields_filled: 5, fetch_success: true });

  // prompt_index
  specDb.insertPromptIndexEntry({ category: cat, ts: now, run_id: runId, prompt_version: 'v1', model: 'gemini-2.5-pro', token_count: 500, success: true });

  // url_crawl_ledger
  specDb.upsertUrlCrawlEntry({
    canonical_url: url, product_id: productId, category: cat,
    original_url: url, domain: new URL(url).hostname, final_url: url,
    content_hash: contentHash, http_status: 200, elapsed_ms: 500,
    fetch_count: 1, ok_count: 1, blocked_count: 0, timeout_count: 0,
    first_seen_ts: now, last_seen_ts: now,
    first_seen_run_id: runId, last_seen_run_id: runId,
  });

  // query_cooldowns
  specDb.upsertQueryCooldown({
    query_hash: `qh_${runId}`, product_id: productId, category: cat,
    query_text: `${productId} specs`, provider: 'google',
    tier: 1, group_key: 'search', normalized_key: `${productId} specs`,
    hint_source: 'needset', attempt_count: 1, result_count: 10,
    last_executed_at: now, cooldown_until: '2026-05-01T00:00:00.000Z',
  });

  // candidates
  specDb.insertCandidate({
    candidate_id: `cand_${runId}_weight`, category: cat, product_id: productId,
    field_key: 'weight', value: '80g', normalized_value: '80',
    score: 0.95, rank: 1, source_url: url, source_host: new URL(url).hostname,
    source_root_domain: new URL(url).hostname, source_tier: 1,
    source_method: 'llm_extract', approved_domain: true,
    snippet_id: `sn_${contentHash.slice(0, 8)}`, snippet_hash: contentHash.slice(0, 16),
    snippet_text: 'Weight: 80g', quote: 'Weight: 80g',
    evidence_url: url, run_id: runId,
  });

  // candidate_reviews
  specDb.upsertReview({
    candidateId: `cand_${runId}_weight`,
    contextType: 'item', contextId: productId,
    aiReviewStatus: 'accepted', aiConfidence: 0.95,
    aiReason: 'consistent', aiReviewModel: 'gemini-2.5-pro',
  });

  // source_registry (camelCase API via llmRouteSourceStore)
  specDb.upsertSourceRegistry({
    sourceId: `src_${runId}_${contentHash.slice(0, 8)}`,
    category: cat, itemIdentifier: productId, productId,
    runId, sourceUrl: url, sourceHost: new URL(url).hostname,
    sourceRootDomain: new URL(url).hostname, sourceTier: 1,
    sourceMethod: 'crawl',
  });


  // curation_suggestions (use run+url combo for uniqueness)
  specDb.db.prepare(`INSERT OR IGNORE INTO curation_suggestions (suggestion_id, category, suggestion_type, field_key, value, normalized_value, status, source, product_id, run_id, first_seen_at, last_seen_at)
    VALUES (?, ?, 'field', 'weight', '80g', '80', 'pending', 'pipeline', ?, ?, ?, ?)`).run(`sug_${runId}_${contentHash.slice(0, 6)}`, cat, productId, runId, now, now);

  // component_review_queue
  specDb.db.prepare(`INSERT OR IGNORE INTO component_review_queue (review_id, category, component_type, field_key, raw_query, matched_component, match_type, name_score, property_score, combined_score, product_id, run_id, status)
    VALUES (?, ?, 'sensor', 'sensor', 'PAW3950', 'PAW3950', 'exact', 1.0, 1.0, 1.0, ?, ?, 'pending')`).run(`crq_${runId}_${contentHash.slice(0, 6)}`, cat, productId, runId);

  // field_history
  specDb.upsertFieldHistory({
    category: cat, product_id: productId, field_key: 'weight',
    round: 1, run_id: runId,
    history_json: JSON.stringify([{ run_id: runId, value: '80g' }]),
  });

  // source_corpus (camelCase API via sourceIntelStore)
  specDb.upsertSourceCorpusDoc({
    url, category: cat, host: new URL(url).hostname,
    rootDomain: new URL(url).hostname, path: new URL(url).pathname,
    title: 'Mouse A', snippet: 'Weight: 80g', tier: 1, role: 'product_page',
    fields: '["weight"]', methods: '["llm_extract"]',
    identityMatch: true, approvedDomain: true,
    brand: 'TestBrand', modelName: 'TestModel', variant: '',
  });


}

/** Seed product identity rows (not deleted by deleteProductHistory). */
function seedProductIdentity(specDb, { productId }) {
  specDb.upsertProduct({
    category: specDb.category, product_id: productId,
    brand: 'TestBrand', model: 'TestModel', base_model: 'TestModel', variant: '',
    status: 'active', seed_urls: '[]', identifier: '', brand_identifier: '',
  });
  specDb.upsertQueueProduct({
    category: specDb.category, product_id: productId,
    status: 'complete', priority: 3, last_run_id: null,
    rounds_completed: 0, last_completed_at: null,
  });
}

/** Create filesystem artifacts for a run. */
function seedRunFilesystem(fsRoots, { runId, productId, category, contentHash, url }) {
  // Run directory
  const runDir = path.join(fsRoots.runs, runId);
  const htmlDir = path.join(runDir, 'html');
  const ssDir = path.join(runDir, 'screenshots');
  const vidDir = path.join(runDir, 'video');
  fs.mkdirSync(htmlDir, { recursive: true });
  fs.mkdirSync(ssDir, { recursive: true });
  fs.mkdirSync(vidDir, { recursive: true });

  fs.writeFileSync(path.join(htmlDir, `${contentHash.slice(0, 12)}.html.gz`), 'fake-html');
  fs.writeFileSync(path.join(ssDir, `screenshot-fetch-1-${contentHash.slice(0, 8)}-00-full.jpg`), 'fake-ss');
  fs.writeFileSync(path.join(vidDir, 'fetch-1.webm'), 'fake-video');
  fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify({
    schema_version: 2, checkpoint_type: 'crawl',
    run: { run_id: runId, category, product_id: productId, status: 'completed' },
    sources: [{ url, content_hash: contentHash, html_file: `${contentHash.slice(0, 12)}.html.gz`, screenshot_count: 1, video_file: 'fetch-1.webm', status: 200 }],
    counters: { urls_crawled: 1, urls_successful: 1 },
  }));

  // Output directory
  const outputRunDir = path.join(fsRoots.output, category, productId, 'runs', runId, 'analysis');
  fs.mkdirSync(outputRunDir, { recursive: true });
  fs.writeFileSync(path.join(outputRunDir, 'search_profile.json'), '{}');

  // Extracted sources (re-seed path via seed.js)
  const extractedDir = path.join(fsRoots.output, category, productId, 'runs', runId, 'extracted', `${new URL(url).hostname}__0000`);
  fs.mkdirSync(extractedDir, { recursive: true });
  fs.writeFileSync(path.join(extractedDir, 'candidates.json'), '[{"field":"weight","value":"80g"}]');
}

/** Create product.json checkpoint. */
function seedProductCheckpoint(fsRoots, { productId, category, runIds, sources }) {
  const productDir = path.join(fsRoots.products, productId);
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'product.json'), JSON.stringify({
    schema_version: 1, checkpoint_type: 'product',
    product_id: productId, category,
    identity: { brand: 'TestBrand', model: 'TestModel', variant: '', seed_urls: [], status: 'active' },
    latest_run_id: runIds[runIds.length - 1],
    runs_completed: runIds.length,
    sources: sources || [],
    query_cooldowns: runIds.map((rid) => ({ query_hash: `qh_${rid}`, query_text: `${productId} specs`, cooldown_until: '2026-05-01T00:00:00.000Z' })),
    updated_at: new Date().toISOString(),
  }));
}

/** Count rows in a table, optionally filtered. */
function countRows(db, table, where = '', params = []) {
  const sql = where ? `SELECT COUNT(*) as n FROM ${table} WHERE ${where}` : `SELECT COUNT(*) as n FROM ${table}`;
  return db.prepare(sql).get(...params).n;
}

// ── deleteRun tests ──────────────────────────────────────────────────────────

test('deleteRun — deletes all SQL rows for a single run', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedProductCheckpoint(h.fsRoots, {
      productId: PID_A, category: CAT, runIds: [RUN_1],
      sources: [{ url: URL_1, content_hash: HASH_1, first_seen_run_id: RUN_1, last_seen_run_id: RUN_1 }],
    });

    const result = h.store.deleteRun({ runId: RUN_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, true);

    // All run-linked tables should be empty
    assert.equal(countRows(h.specDb.db, 'runs', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'product_runs', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'run_artifacts', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'crawl_sources', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'source_screenshots', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'source_videos', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'billing_entries', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'bridge_events', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'knob_snapshots', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'query_index', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'url_index', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'prompt_index', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'candidates', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'candidate_reviews'), 0);
    assert.equal(countRows(h.specDb.db, 'curation_suggestions', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'component_review_queue', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'field_history', 'run_id = ?', [RUN_1]), 0);
    assert.equal(countRows(h.specDb.db, 'query_cooldowns', "product_id = ?", [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'url_crawl_ledger', "product_id = ?", [PID_A]), 0);

    // Source lineage cascade
    assert.equal(countRows(h.specDb.db, 'source_registry', 'run_id = ?', [RUN_1]), 0);

    // Product identity must survive
    assert.equal(countRows(h.specDb.db, 'products', 'product_id = ?', [PID_A]), 1);
    assert.equal(countRows(h.specDb.db, 'product_queue', 'product_id = ?', [PID_A]), 1);
  } finally {
    cleanup(h);
  }
});

test('deleteRun — deletes filesystem artifacts (run dir + output dir)', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedProductCheckpoint(h.fsRoots, {
      productId: PID_A, category: CAT, runIds: [RUN_1],
      sources: [{ url: URL_1, content_hash: HASH_1, first_seen_run_id: RUN_1, last_seen_run_id: RUN_1 }],
    });

    h.store.deleteRun({ runId: RUN_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    // Run directory gone
    assert.equal(fs.existsSync(path.join(h.fsRoots.runs, RUN_1)), false);
    // Output run directory gone
    assert.equal(fs.existsSync(path.join(h.fsRoots.output, CAT, PID_A, 'runs', RUN_1)), false);
  } finally {
    cleanup(h);
  }
});

test('deleteRun — rewrites product.json to remove deleted run references', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRun(h.specDb, { runId: RUN_2, productId: PID_A, url: URL_2, contentHash: HASH_2 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_2, productId: PID_A, category: CAT, contentHash: HASH_2, url: URL_2 });
    seedProductCheckpoint(h.fsRoots, {
      productId: PID_A, category: CAT, runIds: [RUN_1, RUN_2],
      sources: [
        { url: URL_1, content_hash: HASH_1, first_seen_run_id: RUN_1, last_seen_run_id: RUN_1 },
        { url: URL_2, content_hash: HASH_2, first_seen_run_id: RUN_2, last_seen_run_id: RUN_2 },
      ],
    });

    h.store.deleteRun({ runId: RUN_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    const cpPath = path.join(h.fsRoots.products, PID_A, 'product.json');
    const cp = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
    // Source from RUN_1 removed; source from RUN_2 kept
    assert.equal(cp.sources.length, 1);
    assert.equal(cp.sources[0].url, URL_2);
    // latest_run_id updated to surviving run
    assert.equal(cp.latest_run_id, RUN_2);
    // runs_completed decremented
    assert.equal(cp.runs_completed, 1);
    // query_cooldowns for deleted run removed
    const hasDeletedCooldown = cp.query_cooldowns.some((cd) => cd.query_hash === `qh_${RUN_1}`);
    assert.equal(hasDeletedCooldown, false);
  } finally {
    cleanup(h);
  }
});

test('deleteRun — preserves other run data when two runs exist', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRun(h.specDb, { runId: RUN_2, productId: PID_A, url: URL_2, contentHash: HASH_2 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_2, productId: PID_A, category: CAT, contentHash: HASH_2, url: URL_2 });

    h.store.deleteRun({ runId: RUN_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    // RUN_2 data fully intact
    assert.equal(countRows(h.specDb.db, 'runs', 'run_id = ?', [RUN_2]), 1);
    assert.equal(countRows(h.specDb.db, 'product_runs', 'run_id = ?', [RUN_2]), 1);
    assert.equal(countRows(h.specDb.db, 'crawl_sources', 'run_id = ?', [RUN_2]), 1);
    assert.equal(countRows(h.specDb.db, 'candidates', 'run_id = ?', [RUN_2]), 1);
    assert.equal(countRows(h.specDb.db, 'source_registry', 'run_id = ?', [RUN_2]), 1);
    // RUN_2 filesystem intact
    assert.equal(fs.existsSync(path.join(h.fsRoots.runs, RUN_2)), true);
  } finally {
    cleanup(h);
  }
});

test('deleteRun — returns deletion manifest with counts', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedProductCheckpoint(h.fsRoots, {
      productId: PID_A, category: CAT, runIds: [RUN_1],
      sources: [{ url: URL_1, content_hash: HASH_1, first_seen_run_id: RUN_1, last_seen_run_id: RUN_1 }],
    });

    const result = h.store.deleteRun({ runId: RUN_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, true);
    assert.equal(result.run_id, RUN_1);
    assert.equal(typeof result.sql.rows_deleted, 'number');
    assert.ok(result.sql.rows_deleted > 0);
    assert.equal(result.fs.run_dir_deleted, true);
    assert.equal(result.fs.output_dir_deleted, true);
    assert.equal(result.fs.product_json_updated, true);
  } finally {
    cleanup(h);
  }
});

test('deleteRun — no-op for nonexistent run returns ok false', () => {
  const h = createHarness();
  try {
    const result = h.store.deleteRun({ runId: 'nonexistent', productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, false);
  } finally {
    cleanup(h);
  }
});

test('deleteRun — handles missing product.json gracefully', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    // No product.json created

    const result = h.store.deleteRun({ runId: RUN_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, true);
    assert.equal(result.fs.product_json_updated, false);
    // SQL still cleaned
    assert.equal(countRows(h.specDb.db, 'runs', 'run_id = ?', [RUN_1]), 0);
  } finally {
    cleanup(h);
  }
});

// ── deleteUrl tests ──────────────────────────────────────────────────────────

test('deleteUrl — removes URL-scoped SQL rows across all runs', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_2, contentHash: HASH_2 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });

    const result = h.store.deleteUrl({ url: URL_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, true);

    // URL_1 rows gone
    assert.equal(countRows(h.specDb.db, 'crawl_sources', 'source_url = ? AND product_id = ?', [URL_1, PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'source_screenshots', 'source_url = ? AND product_id = ?', [URL_1, PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'source_videos', 'source_url = ? AND product_id = ?', [URL_1, PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'candidates', 'source_url = ? AND product_id = ?', [URL_1, PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'source_registry', 'source_url = ? AND product_id = ?', [URL_1, PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'url_crawl_ledger', 'canonical_url = ? AND product_id = ?', [URL_1, PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'source_corpus', "url = ?", [URL_1]), 0);

    // URL_2 rows intact
    assert.equal(countRows(h.specDb.db, 'crawl_sources', 'source_url = ? AND product_id = ?', [URL_2, PID_A]), 1);
    assert.equal(countRows(h.specDb.db, 'candidates', 'source_url = ? AND product_id = ?', [URL_2, PID_A]), 1);
  } finally {
    cleanup(h);
  }
});

test('deleteUrl — deletes filesystem artifacts for that URL only', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });

    h.store.deleteUrl({ url: URL_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    // HTML file for this URL's content_hash gone
    assert.equal(fs.existsSync(path.join(h.fsRoots.runs, RUN_1, 'html', `${HASH_1.slice(0, 12)}.html.gz`)), false);
    // Run directory itself still exists (may have other URLs)
    assert.equal(fs.existsSync(path.join(h.fsRoots.runs, RUN_1)), true);
  } finally {
    cleanup(h);
  }
});

test('deleteUrl — rewrites product.json to remove URL source entry', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedProductCheckpoint(h.fsRoots, {
      productId: PID_A, category: CAT, runIds: [RUN_1],
      sources: [
        { url: URL_1, content_hash: HASH_1, first_seen_run_id: RUN_1, last_seen_run_id: RUN_1 },
        { url: URL_2, content_hash: HASH_2, first_seen_run_id: RUN_1, last_seen_run_id: RUN_1 },
      ],
    });

    h.store.deleteUrl({ url: URL_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    const cp = JSON.parse(fs.readFileSync(path.join(h.fsRoots.products, PID_A, 'product.json'), 'utf8'));
    assert.equal(cp.sources.length, 1);
    assert.equal(cp.sources[0].url, URL_2);
  } finally {
    cleanup(h);
  }
});

test('deleteUrl — rewrites run.json to remove URL from sources', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });

    h.store.deleteUrl({ url: URL_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    const runJson = JSON.parse(fs.readFileSync(path.join(h.fsRoots.runs, RUN_1, 'run.json'), 'utf8'));
    const hasUrl = runJson.sources.some((s) => s.url === URL_1);
    assert.equal(hasUrl, false);
  } finally {
    cleanup(h);
  }
});

test('deleteUrl — does not delete the run record itself', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });

    h.store.deleteUrl({ url: URL_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    // Run metadata still exists
    assert.equal(countRows(h.specDb.db, 'runs', 'run_id = ?', [RUN_1]), 1);
    assert.equal(countRows(h.specDb.db, 'product_runs', 'run_id = ?', [RUN_1]), 1);
  } finally {
    cleanup(h);
  }
});

test('deleteUrl — removes extracted source directory from output', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });

    h.store.deleteUrl({ url: URL_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    // Extracted directory for this host should be gone
    const hostDir = path.join(h.fsRoots.output, CAT, PID_A, 'runs', RUN_1, 'extracted', 'example.com__0000');
    assert.equal(fs.existsSync(hostDir), false);
  } finally {
    cleanup(h);
  }
});

// ── deleteProductHistory tests ───────────────────────────────────────────────

test('deleteProductHistory — clears all run data but preserves product identity', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRun(h.specDb, { runId: RUN_2, productId: PID_A, url: URL_2, contentHash: HASH_2 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_2, productId: PID_A, category: CAT, contentHash: HASH_2, url: URL_2 });
    seedProductCheckpoint(h.fsRoots, {
      productId: PID_A, category: CAT, runIds: [RUN_1, RUN_2],
      sources: [
        { url: URL_1, content_hash: HASH_1, first_seen_run_id: RUN_1, last_seen_run_id: RUN_1 },
        { url: URL_2, content_hash: HASH_2, first_seen_run_id: RUN_2, last_seen_run_id: RUN_2 },
      ],
    });

    const result = h.store.deleteProductHistory({ productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, true);

    // All run-linked tables empty for this product
    assert.equal(countRows(h.specDb.db, 'runs', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'product_runs', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'run_artifacts', 'run_id IN (?, ?)', [RUN_1, RUN_2]), 0);
    assert.equal(countRows(h.specDb.db, 'crawl_sources', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'source_screenshots', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'source_videos', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'billing_entries', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'candidates', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'candidate_reviews'), 0);
    assert.equal(countRows(h.specDb.db, 'curation_suggestions', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'component_review_queue', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'source_registry', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'field_history', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'query_cooldowns', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'url_crawl_ledger', 'product_id = ?', [PID_A]), 0);
    assert.equal(countRows(h.specDb.db, 'bridge_events', 'run_id IN (?, ?)', [RUN_1, RUN_2]), 0);
    assert.equal(countRows(h.specDb.db, 'knob_snapshots', 'run_id IN (?, ?)', [RUN_1, RUN_2]), 0);
    assert.equal(countRows(h.specDb.db, 'prompt_index', 'run_id IN (?, ?)', [RUN_1, RUN_2]), 0);

    // Product identity preserved
    assert.equal(countRows(h.specDb.db, 'products', 'product_id = ?', [PID_A]), 1);
    // product_queue reset but not deleted
    const queueRow = h.specDb.db.prepare('SELECT * FROM product_queue WHERE product_id = ?').get(PID_A);
    assert.ok(queueRow);
    assert.equal(queueRow.last_run_id, null);
    assert.equal(queueRow.rounds_completed, 0);
  } finally {
    cleanup(h);
  }
});

test('deleteProductHistory — deletes all filesystem artifacts', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRun(h.specDb, { runId: RUN_2, productId: PID_A, url: URL_2, contentHash: HASH_2 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_2, productId: PID_A, category: CAT, contentHash: HASH_2, url: URL_2 });

    h.store.deleteProductHistory({ productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    assert.equal(fs.existsSync(path.join(h.fsRoots.runs, RUN_1)), false);
    assert.equal(fs.existsSync(path.join(h.fsRoots.runs, RUN_2)), false);
    assert.equal(fs.existsSync(path.join(h.fsRoots.output, CAT, PID_A)), false);
  } finally {
    cleanup(h);
  }
});

test('deleteProductHistory — resets product.json to identity-only state', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedProductCheckpoint(h.fsRoots, {
      productId: PID_A, category: CAT, runIds: [RUN_1],
      sources: [{ url: URL_1, content_hash: HASH_1, first_seen_run_id: RUN_1, last_seen_run_id: RUN_1 }],
    });

    h.store.deleteProductHistory({ productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    const cp = JSON.parse(fs.readFileSync(path.join(h.fsRoots.products, PID_A, 'product.json'), 'utf8'));
    assert.equal(cp.checkpoint_type, 'product');
    assert.equal(cp.product_id, PID_A);
    assert.ok(cp.identity);
    assert.equal(cp.identity.brand, 'TestBrand');
    assert.deepEqual(cp.sources, []);
    assert.deepEqual(cp.query_cooldowns, []);
    assert.equal(cp.runs_completed, 0);
    assert.equal(cp.latest_run_id, '');
  } finally {
    cleanup(h);
  }
});

test('deleteProductHistory — does not affect other products', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedProductIdentity(h.specDb, { productId: PID_B });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRun(h.specDb, { runId: RUN_2, productId: PID_B, url: URL_2, contentHash: HASH_2 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_2, productId: PID_B, category: CAT, contentHash: HASH_2, url: URL_2 });

    h.store.deleteProductHistory({ productId: PID_A, category: CAT, fsRoots: h.fsRoots });

    // PID_B fully intact
    assert.equal(countRows(h.specDb.db, 'runs', 'product_id = ?', [PID_B]), 1);
    assert.equal(countRows(h.specDb.db, 'product_runs', 'product_id = ?', [PID_B]), 1);
    assert.equal(countRows(h.specDb.db, 'crawl_sources', 'product_id = ?', [PID_B]), 1);
    assert.equal(countRows(h.specDb.db, 'candidates', 'product_id = ?', [PID_B]), 1);
    assert.equal(fs.existsSync(path.join(h.fsRoots.runs, RUN_2)), true);
  } finally {
    cleanup(h);
  }
});

test('deleteProductHistory — returns manifest with run count', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    seedRun(h.specDb, { runId: RUN_2, productId: PID_A, url: URL_2, contentHash: HASH_2 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_1, productId: PID_A, category: CAT, contentHash: HASH_1, url: URL_1 });
    seedRunFilesystem(h.fsRoots, { runId: RUN_2, productId: PID_A, category: CAT, contentHash: HASH_2, url: URL_2 });
    seedProductCheckpoint(h.fsRoots, {
      productId: PID_A, category: CAT, runIds: [RUN_1, RUN_2],
      sources: [],
    });

    const result = h.store.deleteProductHistory({ productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, true);
    assert.equal(result.product_id, PID_A);
    assert.equal(result.runs_deleted, 2);
    assert.ok(result.sql.rows_deleted > 0);
  } finally {
    cleanup(h);
  }
});

// ── Edge cases ───────────────────────────────────────────────────────────────

test('deleteRun — validates required params', () => {
  const h = createHarness();
  try {
    assert.throws(() => h.store.deleteRun({ productId: PID_A, category: CAT, fsRoots: h.fsRoots }), /runId/i);
    assert.throws(() => h.store.deleteRun({ runId: RUN_1, category: CAT, fsRoots: h.fsRoots }), /productId/i);
  } finally {
    cleanup(h);
  }
});

test('deleteUrl — validates required params', () => {
  const h = createHarness();
  try {
    assert.throws(() => h.store.deleteUrl({ productId: PID_A, category: CAT, fsRoots: h.fsRoots }), /url/i);
    assert.throws(() => h.store.deleteUrl({ url: URL_1, category: CAT, fsRoots: h.fsRoots }), /productId/i);
  } finally {
    cleanup(h);
  }
});

test('deleteProductHistory — validates required params', () => {
  const h = createHarness();
  try {
    assert.throws(() => h.store.deleteProductHistory({ category: CAT, fsRoots: h.fsRoots }), /productId/i);
  } finally {
    cleanup(h);
  }
});

test('deleteRun — handles missing run directory gracefully', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedRun(h.specDb, { runId: RUN_1, productId: PID_A, url: URL_1, contentHash: HASH_1 });
    // No filesystem artifacts created

    const result = h.store.deleteRun({ runId: RUN_1, productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, true);
    assert.equal(result.fs.run_dir_deleted, false);
    assert.equal(countRows(h.specDb.db, 'runs', 'run_id = ?', [RUN_1]), 0);
  } finally {
    cleanup(h);
  }
});

test('deleteProductHistory — no-op for product with no runs', () => {
  const h = createHarness();
  try {
    seedProductIdentity(h.specDb, { productId: PID_A });
    seedProductCheckpoint(h.fsRoots, { productId: PID_A, category: CAT, runIds: [], sources: [] });

    const result = h.store.deleteProductHistory({ productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, true);
    assert.equal(result.runs_deleted, 0);
    // Product identity still intact
    assert.equal(countRows(h.specDb.db, 'products', 'product_id = ?', [PID_A]), 1);
  } finally {
    cleanup(h);
  }
});

test('deleteUrl — no-op for URL not found returns ok false', () => {
  const h = createHarness();
  try {
    const result = h.store.deleteUrl({ url: 'https://nonexistent.com', productId: PID_A, category: CAT, fsRoots: h.fsRoots });
    assert.equal(result.ok, false);
  } finally {
    cleanup(h);
  }
});
