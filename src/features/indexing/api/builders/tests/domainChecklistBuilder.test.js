import test from 'node:test';
import assert from 'node:assert/strict';

import { createDomainChecklistBuilder } from '../domainChecklistBuilder.js';

function makeBuilder(overrides = {}) {
  return createDomainChecklistBuilder({
    readGzipJsonlEvents: async () => [],
    readJsonlEvents: async () => [],
    ...overrides,
  });
}

function makeStorage() {
  return {
    resolveOutputKey: (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join('/'),
    readJsonOrNull: async () => null,
  };
}

// --- Guards ---

test('missing category returns empty response with category_required note', async () => {
  const { buildIndexingDomainChecklist } = makeBuilder();
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
  });
  assert.equal(result.category, null);
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.milestones.primary_domains, []);
  assert.deepEqual(result.domain_field_yield, []);
  assert.deepEqual(result.repair_queries, []);
  assert.deepEqual(result.bad_url_patterns, []);
  assert.ok(result.notes.includes('category_required'));
});

test('empty events produce valid structure with empty rows', async () => {
  const { buildIndexingDomainChecklist } = makeBuilder();
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-test-brand-model',
    runId: 'run-abc',
  });
  assert.equal(result.category, 'mouse');
  assert.equal(result.productId, 'mouse-test-brand-model');
  assert.equal(result.runId, 'run-abc');
  assert.deepEqual(result.rows, []);
  assert.ok(Array.isArray(result.domain_field_yield));
  assert.ok(Array.isArray(result.repair_queries));
  assert.ok(Array.isArray(result.bad_url_patterns));
  assert.ok(Array.isArray(result.notes));
});

// --- Event filtering ---

test('events filtered by category', async () => {
  const events = [
    { event: 'source_fetch_started', category: 'mouse', productId: 'mouse-test-brand-model', url: 'https://razer.com/page', ts: '2026-01-01T00:00:00Z', runId: 'r1' },
    { event: 'source_fetch_started', category: 'keyboard', productId: 'mouse-test-brand-model', url: 'https://corsair.com/page', ts: '2026-01-01T00:00:01Z', runId: 'r1' },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readGzipJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-test-brand-model',
    runId: 'r1',
  });
  const domains = result.rows.map((r) => r.domain);
  assert.ok(domains.includes('razer.com'), 'should include razer.com');
  assert.ok(!domains.includes('corsair.com'), 'should exclude corsair.com (wrong category)');
});

test('events filtered by productId', async () => {
  const events = [
    { event: 'source_fetch_started', category: 'mouse', productId: 'mouse-razer-viper', url: 'https://razer.com/viper', ts: '2026-01-01T00:00:00Z', runId: 'r1' },
    { event: 'source_fetch_started', category: 'mouse', productId: 'mouse-logitech-gpro', url: 'https://logitech.com/gpro', ts: '2026-01-01T00:00:01Z', runId: 'r1' },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readGzipJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-razer-viper',
    runId: 'r1',
  });
  const domains = result.rows.map((r) => r.domain);
  assert.ok(domains.includes('razer.com'), 'should include matching product domain');
  assert.ok(!domains.includes('logitech.com'), 'should exclude non-matching product domain');
});

// --- Run resolution ---

test('resolves runId from events when not provided', async () => {
  const events = [
    { event: 'source_fetch_started', category: 'mouse', url: 'https://example.com/a', ts: '2026-01-01T00:00:00Z', runId: 'run-old' },
    { event: 'source_fetch_started', category: 'mouse', url: 'https://example.com/b', ts: '2026-01-01T00:01:00Z', runId: 'run-latest' },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
  });
  assert.equal(result.runId, 'run-latest');
});

test('falls back to time window when no runId resolved', async () => {
  const recentTs = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const events = [
    { event: 'source_fetch_started', category: 'mouse', url: 'https://example.com/a', ts: recentTs },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    windowMinutes: 120,
  });
  assert.ok(result.notes.includes('no_run_id_resolved_using_time_window'));
  assert.equal(result.rows.length, 1);
});

// --- Buckets ---

test('source_fetch_started creates domain bucket', async () => {
  const events = [
    { event: 'source_fetch_started', category: 'mouse', productId: 'mouse-razer-viper', url: 'https://razer.com/viper', ts: '2026-01-01T00:00:00Z', runId: 'r1' },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readGzipJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-razer-viper',
    runId: 'r1',
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].domain, 'razer.com');
  assert.equal(result.rows[0].urls_selected, 1);
});

test('source_processed increments completed_count and outcome', async () => {
  const events = [
    { event: 'source_fetch_started', category: 'mouse', productId: 'mouse-razer-viper', url: 'https://razer.com/page', ts: '2026-01-01T00:00:00.000Z', runId: 'r1' },
    { event: 'source_processed', category: 'mouse', productId: 'mouse-razer-viper', url: 'https://razer.com/page', ts: '2026-01-01T00:00:01.000Z', runId: 'r1', status: 200, fetch_outcome: 'ok', candidate_count: 3 },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readGzipJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-razer-viper',
    runId: 'r1',
  });
  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.equal(row.pages_fetched_ok, 1);
  assert.equal(row.pages_indexed, 1);
  assert.ok(row.outcome_counts.ok >= 1);
});

test('source_fetch_skipped with cooldown increments dedupe_hits', async () => {
  const events = [
    { event: 'source_fetch_skipped', category: 'mouse', productId: 'mouse-razer-viper', url: 'https://razer.com/page', ts: '2026-01-01T00:00:00Z', runId: 'r1', skip_reason: 'cooldown' },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readGzipJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-razer-viper',
    runId: 'r1',
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].dedupe_hits, 1);
});

// --- Repair ---

test('repair_query_enqueued collects deduped repair rows', async () => {
  const pid = 'mouse-razer-viper';
  const events = [
    { event: 'repair_query_enqueued', category: 'mouse', productId: pid, url: 'https://razer.com/repair', query: 'razer viper v3 pro specs', reason: 'missing_field', ts: '2026-01-01T00:00:00Z', runId: 'r1' },
    { event: 'repair_query_enqueued', category: 'mouse', productId: pid, url: 'https://razer.com/repair', query: 'razer viper v3 pro specs', reason: 'missing_field', ts: '2026-01-01T00:00:01Z', runId: 'r1' },
    { event: 'repair_query_enqueued', category: 'mouse', productId: pid, url: 'https://razer.com/repair2', query: 'razer viper v3 pro weight', reason: 'low_confidence', ts: '2026-01-01T00:00:02Z', runId: 'r1' },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readGzipJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: pid,
    runId: 'r1',
  });
  assert.equal(result.repair_queries.length, 2, 'duplicate should be deduped');
  assert.ok(result.repair_queries.some((r) => r.query === 'razer viper v3 pro specs'));
  assert.ok(result.repair_queries.some((r) => r.query === 'razer viper v3 pro weight'));
});

// --- Evidence ---

test('provenance cross-ref increments evidence_used', async () => {
  const events = [
    { event: 'source_fetch_started', category: 'mouse', productId: 'mouse-razer-viper', url: 'https://razer.com/page', ts: '2026-01-01T00:00:00Z', runId: 'r1' },
  ];
  const provenance = {
    fields: {
      weight: {
        value: '58g',
        confidence: 0.95,
        pass_target: 1,
        meets_pass_target: true,
        evidence: [
          { url: 'https://razer.com/page', host: 'razer.com', role: 'manufacturer' }
        ]
      }
    }
  };
  const storage = makeStorage();
  storage.readJsonOrNull = async (key) => {
    if (key.includes('provenance')) return provenance;
    return null;
  };
  const { buildIndexingDomainChecklist } = makeBuilder({
    readGzipJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage,
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-razer-viper',
    runId: 'r1',
  });
  const razerRow = result.rows.find((r) => r.domain === 'razer.com');
  assert.ok(razerRow, 'razer.com row should exist');
  assert.ok(razerRow.evidence_used >= 1, 'evidence_used should be incremented');
  assert.ok(razerRow.fields_covered >= 1, 'fields_covered should be incremented');
});

// --- Milestones ---

test('manufacturer domain detected from site_kind', async () => {
  const events = [
    { event: 'source_fetch_started', category: 'mouse', productId: 'mouse-razer-viper', url: 'https://razer.com/product/viper-v3-pro', ts: '2026-01-01T00:00:00Z', runId: 'r1', role: 'manufacturer' },
    { event: 'source_processed', category: 'mouse', productId: 'mouse-razer-viper', url: 'https://razer.com/product/viper-v3-pro', ts: '2026-01-01T00:00:01Z', runId: 'r1', status: 200, fetch_outcome: 'ok', candidate_count: 1 },
  ];
  const { buildIndexingDomainChecklist } = makeBuilder({
    readGzipJsonlEvents: async () => events,
  });
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-razer-viper',
    runId: 'r1',
  });
  assert.equal(result.milestones.manufacturer_domain, 'razer.com');
  assert.ok(result.milestones.manufacturer !== null, 'manufacturer milestones should exist');
  assert.equal(result.milestones.manufacturer.domain, 'razer.com');
});

// --- Output shape ---

test('full output has all required top-level keys', async () => {
  const { buildIndexingDomainChecklist } = makeBuilder();
  const result = await buildIndexingDomainChecklist({
    storage: makeStorage(),
    config: {},
    outputRoot: '/tmp/out',
    category: 'mouse',
    productId: 'mouse-test-brand-model',
    runId: 'run-abc',
  });
  const requiredKeys = [
    'category', 'productId', 'runId', 'window_minutes', 'generated_at',
    'rows', 'milestones', 'domain_field_yield', 'repair_queries',
    'bad_url_patterns', 'notes'
  ];
  for (const key of requiredKeys) {
    assert.ok(key in result, `missing top-level key: ${key}`);
  }
  assert.ok('manufacturer_domain' in result.milestones);
  assert.ok('manufacturer' in result.milestones);
  assert.ok('primary_domains' in result.milestones);
});
