import test from 'node:test';
import assert from 'node:assert/strict';
import { EventLogger } from '../../logger.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a minimal mock specDb that captures insertRuntimeEvent calls. */
function createMockSpecDb() {
  const rows = [];
  return {
    rows,
    insertRuntimeEvent(event) {
      rows.push({ ...event });
    },
  };
}

function makeLogger(overrides = {}) {
  return new EventLogger({
    context: { runId: 'run-parity-001' },
    runId: 'run-parity-001',
    category: 'mouse',
    ...overrides,
  });
}

// ── Contract: specDb wiring ──────────────────────────────────────────────────

test('logger with specDb inserts into runtime_events on every push', () => {
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  logger.info('discovery_query_started', { query: 'razer viper v3 pro specs', provider: 'serper' });
  logger.info('source_fetch_queued', { url: 'https://razer.com/viper', host: 'razer.com' });

  assert.equal(specDb.rows.length, 2, 'should insert one row per logger.info() call');
});

test('logger without specDb skips SQL silently', () => {
  const logger = makeLogger({ specDb: null });

  // Should not throw
  logger.info('discovery_query_started', { query: 'test' });
  logger.warn('test_warning', { reason: 'test' });
  logger.error('test_error', { message: 'boom' });

  assert.equal(logger.events.length, 3, 'events still accumulate in memory');
});

test('logger with specDb whose insertRuntimeEvent throws does not break push', () => {
  const specDb = {
    insertRuntimeEvent() { throw new Error('DB locked'); },
  };
  const logger = makeLogger({ specDb });

  // Should not throw — best-effort pattern
  logger.info('some_event', { key: 'value' });
  assert.equal(logger.events.length, 1, 'event still accumulated despite SQL error');
});

// ── Schema shape contract ────────────────────────────────────────────────────

test('SQL row has correct shape: ts, level, event, category, product_id, run_id, data', () => {
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb, category: 'mouse' });
  logger.setContext({ category: 'mouse', productId: 'mouse-razer-viper' });

  logger.info('source_processed', { url: 'https://razer.com', host: 'razer.com', candidate_count: 5 });

  const [row] = specDb.rows;
  assert.ok(row.ts, 'ts must be present');
  assert.equal(row.level, 'info');
  assert.equal(row.event, 'source_processed');
  assert.equal(row.category, 'mouse');
  assert.ok(row.run_id, 'run_id must be present');
  assert.equal(typeof row.data, 'string', 'data must be a JSON string');
});

test('SQL data column contains full raw payload as JSON', () => {
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  const payload = { url: 'https://example.com', host: 'example.com', candidate_count: 3, status: 200 };
  logger.info('source_processed', payload);

  const parsed = JSON.parse(specDb.rows[0].data);
  assert.equal(parsed.url, 'https://example.com');
  assert.equal(parsed.host, 'example.com');
  assert.equal(parsed.candidate_count, 3);
  assert.equal(parsed.status, 200);
});

test('SQL level reflects warn and error correctly', () => {
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  logger.info('info_event');
  logger.warn('warn_event');
  logger.error('error_event');

  assert.equal(specDb.rows[0].level, 'info');
  assert.equal(specDb.rows[1].level, 'warn');
  assert.equal(specDb.rows[2].level, 'error');
});

// ── Raw event type coverage ──────────────────────────────────────────────────

test('all common pipeline event types reach SQL via logger', () => {
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  const pipelineEventTypes = [
    'run_started',
    'run_context',
    'run_completed',
    'search_profile_generated',
    'source_fetch_queued',
    'source_fetch_started',
    'source_fetch_skipped',
    'source_fetch_retrying',
    'source_fetch_failed',
    'source_processed',
    'fields_filled_from_source',
    'visual_asset_captured',
    'needset_computed',
    'brand_resolved',
    'search_plan_generated',
    'discovery_query_started',
    'discovery_query_completed',
    'search_request_throttled',
    'llm_call_started',
    'llm_call_completed',
    'llm_call_failed',
    'bootstrap_step',
    'browser_pool_warming',
    'browser_pool_warmed',
    'prime_sources_built',
    'serp_selector_completed',
    'domains_classified',
  ];

  for (const eventType of pipelineEventTypes) {
    logger.info(eventType, { test: true });
  }

  assert.equal(specDb.rows.length, pipelineEventTypes.length,
    'every pipeline event type should produce exactly one SQL row');

  const sqlEventTypes = new Set(specDb.rows.map((r) => r.event));
  for (const eventType of pipelineEventTypes) {
    assert.ok(sqlEventTypes.has(eventType),
      `event type "${eventType}" should be present in SQL`);
  }
});

// ── Documented asymmetries (characterization) ────────────────────────────────
// These tests document KNOWN differences between runtime_events SQL and
// run_events.ndjson. They are not failures — they capture the current state
// as input for Step 2's design.

test('ASYMMETRY: SQL stores raw event names, not bridge-transformed names', () => {
  // The bridge renames events before writing to NDJSON:
  //   source_fetch_queued → fetch_queued
  //   discovery_query_started → search_started
  //   llm_call_started → llm_started
  // But the logger writes the ORIGINAL name to SQL.
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  logger.info('source_fetch_queued', { url: 'https://example.com' });
  logger.info('discovery_query_started', { query: 'test' });
  logger.info('llm_call_started', { reason: 'extract' });

  // SQL has the raw names — NOT the bridge-renamed names
  assert.equal(specDb.rows[0].event, 'source_fetch_queued');  // NDJSON has: fetch_queued
  assert.equal(specDb.rows[1].event, 'discovery_query_started');  // NDJSON has: search_started
  assert.equal(specDb.rows[2].event, 'llm_call_started');  // NDJSON has: llm_started
});

test('ASYMMETRY: SQL has no stage column — stage only exists in NDJSON', () => {
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  logger.info('source_fetch_queued', { url: 'https://example.com' });

  const row = specDb.rows[0];
  // runtime_events schema: ts, level, event, category, product_id, run_id, data
  // There is no 'stage' field — the bridge adds stage during emit()
  assert.equal(row.stage, undefined, 'runtime_events has no stage column');
});

test('ASYMMETRY: 1:N synthesis — one raw event can produce multiple NDJSON rows', () => {
  // source_processed in the bridge generates 3 NDJSON events:
  //   1. (fetch, fetch_finished)
  //   2. (parse, source_processed)
  //   3. (parse, parse_finished)
  // But the logger writes exactly 1 SQL row for source_processed.
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  logger.info('source_processed', {
    url: 'https://example.com',
    status: 200,
    candidate_count: 5,
  });

  assert.equal(specDb.rows.length, 1, 'SQL: 1 row per raw event');
  assert.equal(specDb.rows[0].event, 'source_processed');
  // NDJSON would have 3+ rows (fetch_finished, source_processed, parse_finished)
  // This asymmetry will be resolved in Step 2.
});

test('ASYMMETRY: 5 event types have bridge handlers that do NOT emit to NDJSON', () => {
  // These events reach SQL (via logger) but NOT run_events.ndjson
  // (their bridge handlers only update state, don't call emit())
  const nonEmittingEvents = [
    'run_started',
    'search_profile_generated',
    'bootstrap_step',
    'browser_pool_warming',
    'browser_pool_warmed',
  ];

  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  for (const event of nonEmittingEvents) {
    logger.info(event, { test: true });
  }

  assert.equal(specDb.rows.length, 5, 'all 5 reach SQL');
  // But in run_events.ndjson, these would produce 0 direct rows
  // (run_started triggers startStage which emits search_started, but
  //  the run_started event itself is not emitted)
});

test('ASYMMETRY: SQL product_id extraction uses data.productId or data.product_id', () => {
  const specDb = createMockSpecDb();
  const logger = makeLogger({ specDb });

  logger.info('test_event', { productId: 'mouse-abc' });
  assert.equal(specDb.rows[0].product_id, 'mouse-abc');

  logger.info('test_event', { product_id: 'mouse-xyz' });
  assert.equal(specDb.rows[1].product_id, 'mouse-xyz');
});
