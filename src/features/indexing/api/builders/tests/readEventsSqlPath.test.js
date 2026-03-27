import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  readIndexLabRunEvents,
} from '../indexlabDataBuilders.js';
import { SpecDb } from '../../../../../db/specDb.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMemorySpecDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function seedBridgeEvents(specDb, runId, events) {
  for (const evt of events) {
    specDb.insertBridgeEvent({
      run_id: runId,
      category: 'mouse',
      product_id: 'mouse-test-01',
      ts: evt.ts || '2026-01-01T00:00:00.000Z',
      stage: evt.stage || 'fetch',
      event: evt.event || 'fetch_started',
      payload: evt.payload || {},
    });
  }
}

async function createNdjsonFixture(rootDir, runId, events = []) {
  const runDir = path.join(rootDir, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'run.json'),
    JSON.stringify({ run_id: runId, status: 'completed' }),
  );
  const text = events.map((e) => JSON.stringify(e)).join('\n');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), text ? `${text}\n` : '');
}

function initBuilders(indexLabRoot, specDb = null) {
  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot: indexLabRoot,
    storage: {
      resolveOutputKey: (...p) => p.join('/'),
      resolveInputKey: (...p) => p.join('/'),
      readJsonOrNull: async () => null,
    },
    config: {},
    getSpecDbReady: specDb ? async () => specDb : async () => null,
    isProcessRunning: () => false,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('readIndexLabRunEvents SQL path (Step 2b)', () => {
  test('returns SQL rows when category + specDb available', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-read-'));
    const specDb = createMemorySpecDb();
    seedBridgeEvents(specDb, 'run-sql-001', [
      { event: 'fetch_started', ts: '2026-01-01T00:00:01Z', stage: 'fetch', payload: { url: 'https://example.com' } },
      { event: 'fetch_finished', ts: '2026-01-01T00:00:02Z', stage: 'fetch', payload: { status: 200 } },
    ]);
    initBuilders(tmpDir, specDb);

    const rows = await readIndexLabRunEvents('run-sql-001', 2000, { category: 'mouse' });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].event, 'fetch_started');
    assert.equal(rows[1].event, 'fetch_finished');
    assert.equal(rows[0].stage, 'fetch');
  });

  test('SQL path returns payload as parsed object (not string)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-read-'));
    const specDb = createMemorySpecDb();
    seedBridgeEvents(specDb, 'run-sql-002', [
      { event: 'fetch_started', payload: { url: 'https://example.com', worker_id: 'w-0' } },
    ]);
    initBuilders(tmpDir, specDb);

    const rows = await readIndexLabRunEvents('run-sql-002', 2000, { category: 'mouse' });

    assert.equal(rows.length, 1);
    assert.equal(typeof rows[0].payload, 'object');
    assert.equal(rows[0].payload.url, 'https://example.com');
    assert.equal(rows[0].payload.worker_id, 'w-0');
  });

  test('returns empty array when category NOT provided (no NDJSON fallback)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-read-'));
    const specDb = createMemorySpecDb();
    seedBridgeEvents(specDb, 'run-fallback-001', [
      { event: 'sql_event' },
    ]);
    initBuilders(tmpDir, specDb);

    // No category → returns [] (NDJSON fallback removed in 2c)
    const rows = await readIndexLabRunEvents('run-fallback-001', 2000);
    assert.deepEqual(rows, []);
  });

  test('returns empty array when SQL has no events for run', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-read-'));
    const specDb = createMemorySpecDb();
    // No events seeded for this run
    initBuilders(tmpDir, specDb);

    // SQL returns empty → falls through to NDJSON → also empty (no fixture)
    const rows = await readIndexLabRunEvents('run-empty-001', 2000, { category: 'mouse' });
    assert.deepEqual(rows, []);
  });

  test('SQL path respects limit parameter', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-read-'));
    const specDb = createMemorySpecDb();
    seedBridgeEvents(specDb, 'run-limit-001', [
      { event: 'a', ts: '2026-01-01T00:00:01Z' },
      { event: 'b', ts: '2026-01-01T00:00:02Z' },
      { event: 'c', ts: '2026-01-01T00:00:03Z' },
      { event: 'd', ts: '2026-01-01T00:00:04Z' },
      { event: 'e', ts: '2026-01-01T00:00:05Z' },
    ]);
    initBuilders(tmpDir, specDb);

    const rows = await readIndexLabRunEvents('run-limit-001', 3, { category: 'mouse' });
    assert.equal(rows.length, 3);
    assert.equal(rows[0].event, 'c');
    assert.equal(rows[2].event, 'e');
  });
});
