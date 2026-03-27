import test from 'node:test';
import assert from 'node:assert/strict';
import { MetricsWriter } from '../metricsWriter.js';

// ---------------------------------------------------------------------------
// Runtime Metrics Writer Tests
// ---------------------------------------------------------------------------

function mockStorage() {
  const written = [];
  return {
    written,
    appendText(key, text, opts) {
      written.push({ key, text, opts });
    }
  };
}

// =========================================================================
// SECTION 1: Basic metric emission
// =========================================================================

test('metrics writer: counter emits correct type', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({ storage, metricsKey: '_runtime/metrics.jsonl' });
  writer._flushSize = 1;
  await writer.counter('llm.calls', 1, { provider: 'openai' });
  assert.equal(storage.written.length, 1);
  const lines = storage.written[0].text.trim().split('\n');
  const row = JSON.parse(lines[0]);
  assert.equal(row.metric, 'llm.calls');
  assert.equal(row.type, 'counter');
  assert.equal(row.value, 1);
  assert.equal(row.labels.provider, 'openai');
  assert.ok(row.ts);
});

test('metrics writer: gauge emits correct type', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({ storage, metricsKey: '_runtime/metrics.jsonl' });
  writer._flushSize = 1;
  await writer.gauge('pipeline.active_fetches', 5);
  const row = JSON.parse(storage.written[0].text.trim());
  assert.equal(row.type, 'gauge');
  assert.equal(row.value, 5);
});

test('metrics writer: timing emits duration in ms', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({ storage, metricsKey: '_runtime/metrics.jsonl' });
  writer._flushSize = 1;
  await writer.timing('llm.call_duration', 1234, { model: 'gpt-4' });
  const row = JSON.parse(storage.written[0].text.trim());
  assert.equal(row.type, 'timing');
  assert.equal(row.value, 1234);
  assert.equal(row.labels.model, 'gpt-4');
});

// =========================================================================
// SECTION 2: Buffering and flush
// =========================================================================

test('metrics writer: buffers until flushSize', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({ storage, metricsKey: '_runtime/metrics.jsonl' });
  writer._flushSize = 3;
  await writer.counter('a', 1);
  await writer.counter('b', 1);
  assert.equal(storage.written.length, 0);
  await writer.counter('c', 1);
  assert.equal(storage.written.length, 1);
  const lines = storage.written[0].text.trim().split('\n');
  assert.equal(lines.length, 3);
});

test('metrics writer: explicit flush writes remaining buffer', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({ storage, metricsKey: '_runtime/metrics.jsonl' });
  writer._flushSize = 100;
  await writer.counter('x', 1);
  await writer.counter('y', 2);
  assert.equal(storage.written.length, 0);
  await writer.flush();
  assert.equal(storage.written.length, 1);
  const lines = storage.written[0].text.trim().split('\n');
  assert.equal(lines.length, 2);
});

test('metrics writer: flush with empty buffer is a no-op', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({ storage, metricsKey: '_runtime/metrics.jsonl' });
  await writer.flush();
  assert.equal(storage.written.length, 0);
});

// =========================================================================
// SECTION 3: Default labels
// =========================================================================

test('metrics writer: default labels merged into every metric', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({
    storage,
    metricsKey: '_runtime/metrics.jsonl',
    defaultLabels: { env: 'test', host: 'localhost' }
  });
  writer._flushSize = 1;
  await writer.counter('ops', 1, { category: 'mouse' });
  const row = JSON.parse(storage.written[0].text.trim());
  assert.equal(row.labels.env, 'test');
  assert.equal(row.labels.host, 'localhost');
  assert.equal(row.labels.category, 'mouse');
});

test('metrics writer: per-metric labels override defaults', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({
    storage,
    defaultLabels: { env: 'prod' }
  });
  writer._flushSize = 1;
  await writer.counter('ops', 1, { env: 'staging' });
  const row = JSON.parse(storage.written[0].text.trim());
  assert.equal(row.labels.env, 'staging');
});

// =========================================================================
// SECTION 4: Metric name sanitization
// =========================================================================

test('metrics writer: sanitizes metric names', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({ storage });
  writer._flushSize = 1;
  await writer.counter('LLM Call!! Duration', 1);
  const row = JSON.parse(storage.written[0].text.trim());
  assert.equal(row.metric, 'llm_call_duration');
});

// =========================================================================
// SECTION 5: Snapshot
// =========================================================================

test('metrics writer: snapshot returns current state', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({
    storage,
    metricsKey: '_runtime/metrics.jsonl',
    defaultLabels: { env: 'test' }
  });
  await writer.counter('a', 1);
  const snap = writer.snapshot();
  assert.equal(snap.metrics_key, '_runtime/metrics.jsonl');
  assert.equal(snap.buffered, 1);
  assert.equal(snap.default_labels.env, 'test');
});

// =========================================================================
// SECTION 6: Edge cases
// =========================================================================

test('metrics writer: handles non-finite values as 0', async () => {
  const storage = mockStorage();
  const writer = new MetricsWriter({ storage });
  writer._flushSize = 1;
  await writer.gauge('bad', NaN);
  const row = JSON.parse(storage.written[0].text.trim());
  assert.equal(row.value, 0);
});

test('metrics writer: works without storage (no-op flush)', async () => {
  const writer = new MetricsWriter({});
  await writer.counter('test', 1);
  await writer.flush();
  // No error thrown
  assert.ok(true);
});

// =========================================================================
// SECTION 7: SQL path (specDb)
// =========================================================================

test('metrics writer: flush writes to specDb.insertMetric when specDb is provided', async () => {
  const inserted = [];
  const specDb = { insertMetric(entry) { inserted.push(entry); } };
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 100;
  await writer.counter('llm.calls', 3, { provider: 'deepseek' });
  await writer.gauge('active_fetches', 7);
  await writer.flush();

  assert.equal(inserted.length, 2);
  assert.equal(inserted[0].name, 'llm.calls');
  assert.equal(inserted[0].metric_type, 'counter');
  assert.equal(inserted[0].value, 3);
  assert.ok(inserted[0].labels.includes('deepseek'));
  assert.equal(inserted[1].name, 'active_fetches');
  assert.equal(inserted[1].metric_type, 'gauge');
  assert.equal(inserted[1].value, 7);
});

test('metrics writer: specDb path skips storage.appendText', async () => {
  const storage = mockStorage();
  const specDb = { insertMetric() {} };
  const writer = new MetricsWriter({ storage, specDb });
  writer._flushSize = 1;
  await writer.counter('test', 1);
  assert.equal(storage.written.length, 0, 'storage should not be touched when specDb is present');
});

test('metrics writer: specDb flush clears buffer', async () => {
  const specDb = { insertMetric() {} };
  const writer = new MetricsWriter({ specDb });
  writer._flushSize = 100;
  await writer.counter('a', 1);
  await writer.counter('b', 2);
  assert.equal(writer.snapshot().buffered, 2);
  await writer.flush();
  assert.equal(writer.snapshot().buffered, 0);
});
