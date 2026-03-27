import test from 'node:test';
import assert from 'node:assert/strict';
import { SpecDb } from '../specDb.js';

function makeDb() {
  const specDb = new SpecDb({ dbPath: ':memory:', category: 'test' });
  return { db: specDb.db, specDb };
}

test('metrics table exists after schema creation', () => {
  const { db } = makeDb();
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='metrics'").get();
  assert.ok(row, 'metrics table should exist');
});

test('insertMetric roundtrip — INSERT and SELECT', () => {
  const { db, specDb } = makeDb();

  specDb.insertMetric({
    ts: '2026-03-27T12:00:00.000Z',
    metric_type: 'counter',
    name: 'llm.calls',
    value: 1,
    labels: JSON.stringify({ provider: 'openai' }),
  });

  const rows = db.prepare('SELECT * FROM metrics').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ts, '2026-03-27T12:00:00.000Z');
  assert.equal(rows[0].metric_type, 'counter');
  assert.equal(rows[0].name, 'llm.calls');
  assert.equal(rows[0].value, 1);
  assert.equal(JSON.parse(rows[0].labels).provider, 'openai');
});

test('insertMetricsBatch inserts multiple rows in a transaction', () => {
  const { db, specDb } = makeDb();

  specDb.insertMetricsBatch([
    { ts: '2026-03-27T12:00:00.000Z', metric_type: 'counter', name: 'a', value: 1, labels: '{}' },
    { ts: '2026-03-27T12:00:01.000Z', metric_type: 'gauge', name: 'b', value: 5, labels: '{}' },
    { ts: '2026-03-27T12:00:02.000Z', metric_type: 'timing', name: 'c', value: 1234, labels: '{}' },
  ]);

  const rows = db.prepare('SELECT * FROM metrics ORDER BY ts').all();
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, 'a');
  assert.equal(rows[1].name, 'b');
  assert.equal(rows[2].name, 'c');
  assert.equal(rows[2].value, 1234);
});

test('insertMetric uses defaults for missing fields', () => {
  const { db, specDb } = makeDb();

  specDb.insertMetric({ ts: '2026-03-27T12:00:00.000Z' });

  const row = db.prepare('SELECT * FROM metrics').get();
  assert.equal(row.metric_type, 'gauge');
  assert.equal(row.name, 'unknown');
  assert.equal(row.value, 0);
  assert.equal(row.labels, '{}');
});
