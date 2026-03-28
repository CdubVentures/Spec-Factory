import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricsWriter } from '../metricsWriter.js';

// ---------------------------------------------------------------------------
// Runtime Metrics Writer Tests (SQL-only — NDJSON fallback removed in Wave B4)
// ---------------------------------------------------------------------------

function mockSpecDb() {
  const inserted = [];
  return {
    inserted,
    insertMetric(entry) { inserted.push(entry); }
  };
}

// =========================================================================
// SECTION 1: Basic metric emission
// =========================================================================

test('metrics writer: counter emits correct type', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 1;
  await writer.counter('llm.calls', 1, { provider: 'openai' });
  assert.equal(specDb.inserted.length, 1);
  assert.equal(specDb.inserted[0].name, 'llm.calls');
  assert.equal(specDb.inserted[0].metric_type, 'counter');
  assert.equal(specDb.inserted[0].value, 1);
  assert.ok(specDb.inserted[0].labels.includes('openai'));
  assert.ok(specDb.inserted[0].ts);
});

test('metrics writer: gauge emits correct type', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 1;
  await writer.gauge('pipeline.active_fetches', 5);
  assert.equal(specDb.inserted[0].metric_type, 'gauge');
  assert.equal(specDb.inserted[0].value, 5);
});

test('metrics writer: timing emits duration in ms', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 1;
  await writer.timing('llm.call_duration', 1234, { model: 'gpt-4' });
  assert.equal(specDb.inserted[0].metric_type, 'timing');
  assert.equal(specDb.inserted[0].value, 1234);
  assert.ok(specDb.inserted[0].labels.includes('gpt-4'));
});

// =========================================================================
// SECTION 2: Buffering and flush
// =========================================================================

test('metrics writer: buffers until flushSize', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 3;
  await writer.counter('a', 1);
  await writer.counter('b', 1);
  assert.equal(specDb.inserted.length, 0);
  await writer.counter('c', 1);
  assert.equal(specDb.inserted.length, 3);
});

test('metrics writer: explicit flush writes remaining buffer', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 100;
  await writer.counter('x', 1);
  await writer.counter('y', 2);
  assert.equal(specDb.inserted.length, 0);
  await writer.flush();
  assert.equal(specDb.inserted.length, 2);
});

test('metrics writer: flush with empty buffer is a no-op', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  await writer.flush();
  assert.equal(specDb.inserted.length, 0);
});

// =========================================================================
// SECTION 3: Default labels
// =========================================================================

test('metrics writer: default labels merged into every metric', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({
    specDb,
    defaultLabels: { env: 'test', host: 'localhost' }
  });
  writer._flushSize = 1;
  await writer.counter('ops', 1, { category: 'mouse' });
  const labels = JSON.parse(specDb.inserted[0].labels);
  assert.equal(labels.env, 'test');
  assert.equal(labels.host, 'localhost');
  assert.equal(labels.category, 'mouse');
});

test('metrics writer: per-metric labels override defaults', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({
    specDb,
    defaultLabels: { env: 'prod' }
  });
  writer._flushSize = 1;
  await writer.counter('ops', 1, { env: 'staging' });
  const labels = JSON.parse(specDb.inserted[0].labels);
  assert.equal(labels.env, 'staging');
});

// =========================================================================
// SECTION 4: Metric name sanitization
// =========================================================================

test('metrics writer: sanitizes metric names', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 1;
  await writer.counter('LLM Call!! Duration', 1);
  assert.equal(specDb.inserted[0].name, 'llm_call_duration');
});

// =========================================================================
// SECTION 5: Snapshot
// =========================================================================

test('metrics writer: snapshot returns current state', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({
    specDb,
    defaultLabels: { env: 'test' }
  });
  await writer.counter('a', 1);
  const snap = writer.snapshot();
  assert.equal(snap.buffered, 1);
  assert.equal(snap.default_labels.env, 'test');
});

// =========================================================================
// SECTION 6: Edge cases
// =========================================================================

test('metrics writer: handles non-finite values as 0', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 1;
  await writer.gauge('bad', NaN);
  assert.equal(specDb.inserted[0].value, 0);
});

test('metrics writer: works without specDb (silent no-op flush)', async () => {
  const writer = new MetricsWriter({});
  await writer.counter('test', 1);
  await writer.flush();
  assert.equal(writer.snapshot().buffered, 0);
});

// =========================================================================
// SECTION 7: SQL path (specDb)
// =========================================================================

test('metrics writer: flush writes to specDb.insertMetric when specDb is provided', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 100;
  await writer.counter('llm.calls', 3, { provider: 'deepseek' });
  await writer.gauge('active_fetches', 7);
  await writer.flush();

  assert.equal(specDb.inserted.length, 2);
  assert.equal(specDb.inserted[0].name, 'llm.calls');
  assert.equal(specDb.inserted[0].metric_type, 'counter');
  assert.equal(specDb.inserted[0].value, 3);
  assert.ok(specDb.inserted[0].labels.includes('deepseek'));
  assert.equal(specDb.inserted[1].name, 'active_fetches');
  assert.equal(specDb.inserted[1].metric_type, 'gauge');
  assert.equal(specDb.inserted[1].value, 7);
});

test('metrics writer: specDb flush clears buffer', async () => {
  const specDb = mockSpecDb();
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 100;
  await writer.counter('a', 1);
  await writer.counter('b', 2);
  assert.equal(writer.snapshot().buffered, 2);
  await writer.flush();
  assert.equal(writer.snapshot().buffered, 0);
});
