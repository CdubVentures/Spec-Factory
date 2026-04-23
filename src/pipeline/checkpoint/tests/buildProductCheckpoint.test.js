import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProductCheckpoint } from '../buildProductCheckpoint.js';

const SAMPLE_SOURCES = [
  { url: 'https://razer.com/page', final_url: 'https://razer.com/page', status: 200, success: true, content_hash: 'abc123', html_file: 'abc123abc123.html.gz', screenshot_count: 2, worker_id: 'fetch-1' },
  { url: 'https://rtings.com/review', final_url: 'https://rtings.com/review', status: 200, success: true, content_hash: 'def456', html_file: 'def456def456.html.gz', screenshot_count: 1, worker_id: 'fetch-2' },
];

describe('buildProductCheckpoint — schema', () => {
  test('schema_version is 1 and checkpoint_type is product', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.equal(cp.schema_version, 1);
    assert.equal(cp.checkpoint_type, 'product');
  });

  test('updated_at is ISO string', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.match(cp.updated_at, /^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('buildProductCheckpoint — identity', () => {
  test('identity fields propagated', () => {
    const identity = { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Wireless', sku: 'RZ01', title: 'Razer Viper V3 Pro' };
    const cp = buildProductCheckpoint({ identity, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.equal(cp.identity.brand, 'Razer');
    assert.equal(cp.identity.model, 'Viper V3 Pro');
    assert.equal(cp.identity.variant, 'Wireless');
    assert.equal(cp.identity.sku, 'RZ01');
    assert.equal(cp.identity.title, 'Razer Viper V3 Pro');
  });

  test('missing identity fields default to empty string', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.equal(cp.identity.brand, '');
    assert.equal(cp.identity.model, '');
    assert.equal(cp.identity.variant, '');
  });

  test('null identity defaults all fields', () => {
    const cp = buildProductCheckpoint({ identity: null, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.equal(cp.identity.brand, '');
  });
});

describe('buildProductCheckpoint — product fields', () => {
  test('product_id and category propagated', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'mouse-test', runId: 'run-001', sources: [] });
    assert.equal(cp.product_id, 'mouse-test');
    assert.equal(cp.category, 'mouse');
  });

  test('latest_run_id set to runId', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-007', sources: [] });
    assert.equal(cp.latest_run_id, 'run-007');
  });

  test('runs_completed is 1', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.equal(cp.runs_completed, 1);
  });

  test('checkpoint does not include fields or provenance keys', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.equal('fields' in cp, false, 'fields key should not exist');
    assert.equal('provenance' in cp, false, 'provenance key should not exist');
  });
});

describe('buildProductCheckpoint — sources', () => {
  test('sources mapped with host extracted from URL', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: SAMPLE_SOURCES });
    assert.equal(cp.sources.length, 2);
    assert.equal(cp.sources[0].host, 'razer.com');
    assert.equal(cp.sources[1].host, 'rtings.com');
  });

  test('sources have first_seen and last_seen set to runId', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: SAMPLE_SOURCES });
    assert.equal(cp.sources[0].first_seen_run_id, 'run-001');
    assert.equal(cp.sources[0].last_seen_run_id, 'run-001');
  });

  test('sources preserve content_hash and html_file', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: SAMPLE_SOURCES });
    assert.equal(cp.sources[0].content_hash, 'abc123');
    assert.equal(cp.sources[0].html_file, 'abc123abc123.html.gz');
  });

  test('empty sources array', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.deepEqual(cp.sources, []);
  });

  test('B6 — mapProductSource forwards hint_source / tier / providers when present on src', () => {
    const sources = [{
      url: 'https://rtings.com/x', status: 200, content_hash: 'h1',
      hint_source: 'tier1_seed', tier: 'seed', providers: ['serper'],
    }];
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources });
    assert.equal(cp.sources[0].hint_source, 'tier1_seed');
    assert.equal(cp.sources[0].tier, 'seed');
    assert.deepEqual(cp.sources[0].providers, ['serper']);
  });

  test('B6 — mapProductSource defaults triage fields to null when missing', () => {
    const sources = [{ url: 'https://rtings.com/x', status: 200, content_hash: 'h1' }];
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources });
    assert.equal(cp.sources[0].hint_source, null);
    assert.equal(cp.sources[0].tier, null);
    assert.equal(cp.sources[0].providers, null);
  });

  test('A1 — mapProductSource forwards crawl4ai_file when present', () => {
    const sources = [{ url: 'https://rtings.com/x', status: 200, content_hash: 'h1', crawl4ai_file: 'abc123abc123.json' }];
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources });
    assert.equal(cp.sources[0].crawl4ai_file, 'abc123abc123.json');
  });

  test('A1 — mapProductSource defaults crawl4ai_file to null when missing', () => {
    const sources = [{ url: 'https://rtings.com/x', status: 200, content_hash: 'h1' }];
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources });
    assert.equal(cp.sources[0].crawl4ai_file, null);
  });
});

describe('buildProductCheckpoint — query_cooldowns', () => {
  test('query_cooldowns defaults to empty array when omitted', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.deepEqual(cp.query_cooldowns, []);
  });

  test('query_cooldowns carries through when provided', () => {
    const cooldowns = [
      { query_hash: 'h1', query_text: 'razer viper specs', tier: 'seed', provider: '', cooldown_until: '2026-05-01T00:00:00Z', attempt_count: 1 },
      { query_hash: 'h2', query_text: 'razer viper rtings.com', tier: 'seed', provider: 'rtings.com', cooldown_until: '2026-05-01T00:00:00Z', attempt_count: 2 },
    ];
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [], queryCooldowns: cooldowns });
    assert.equal(cp.query_cooldowns.length, 2);
    assert.equal(cp.query_cooldowns[0].query_hash, 'h1');
    assert.equal(cp.query_cooldowns[1].provider, 'rtings.com');
  });
});

describe('buildProductCheckpoint — field_histories (tier-3 progression rebuild)', () => {
  test('field_histories defaults to {} when omitted (backward compat)', () => {
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [] });
    assert.deepEqual(cp.field_histories, {});
  });

  test('field_histories carries through when provided', () => {
    const histories = {
      weight: { query_count: 3, existing_queries: ['q1', 'q2', 'q3'], domains_tried: ['rtings.com'] },
      dpi: { query_count: 1, existing_queries: ['q4'], domains_tried: [] },
    };
    const cp = buildProductCheckpoint({ identity: {}, category: 'mouse', productId: 'test', runId: 'run-001', sources: [], fieldHistories: histories });
    assert.deepEqual(cp.field_histories, histories);
  });
});
