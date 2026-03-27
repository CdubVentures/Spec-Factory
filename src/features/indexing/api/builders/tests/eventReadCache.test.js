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

const REAL_DATE_NOW = Date.now;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function initBuilders(indexLabRoot, specDb) {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readIndexLabRunEvents cache (SQL path)', () => {
  test.afterEach(() => {
    Date.now = REAL_DATE_NOW;
  });

  test('second call within TTL returns same array reference (cache hit)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-cache-'));
    try {
      const specDb = createMemorySpecDb();
      seedBridgeEvents(specDb, 'run-cache-1', [
        { event: 'fetch_started', ts: '2026-01-01T00:00:00Z' },
        { event: 'fetch_finished', ts: '2026-01-01T00:00:01Z' },
      ]);
      initBuilders(tmpDir, specDb);

      const first = await readIndexLabRunEvents('run-cache-1', 2000, { category: 'mouse' });
      const second = await readIndexLabRunEvents('run-cache-1', 2000, { category: 'mouse' });

      assert.equal(first.length, 2);
      assert.equal(first, second, 'same reference means cache hit');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('call after TTL returns fresh data (cache miss)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-cache-'));
    try {
      let nowMs = Date.parse('2026-01-01T00:00:00Z');
      Date.now = () => nowMs;
      const specDb = createMemorySpecDb();
      seedBridgeEvents(specDb, 'run-cache-2', [
        { event: 'a', ts: '2026-01-01T00:00:00Z' },
      ]);
      initBuilders(tmpDir, specDb);

      const first = await readIndexLabRunEvents('run-cache-2', 2000, { category: 'mouse' });
      assert.equal(first.length, 1);

      // Insert a new event into SQL while cache is live
      specDb.insertBridgeEvent({
        run_id: 'run-cache-2', category: 'mouse', product_id: 'mouse-test-01',
        ts: '2026-01-01T00:00:01Z', stage: 'fetch', event: 'b', payload: {},
      });

      // Advance virtual time past the TTL
      nowMs += 5_500;

      const afterTtl = await readIndexLabRunEvents('run-cache-2', 2000, { category: 'mouse' });
      assert.equal(afterTtl.length, 2, 'fresh read after TTL should pick up new event');
      assert.notEqual(first, afterTtl, 'different reference means fresh read');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('different limit is a separate cache entry', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-cache-'));
    try {
      const specDb = createMemorySpecDb();
      seedBridgeEvents(specDb, 'run-cache-3', Array.from({ length: 10 }, (_, i) => ({
        event: `evt-${i}`,
        ts: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
      })));
      initBuilders(tmpDir, specDb);

      const full = await readIndexLabRunEvents('run-cache-3', 10, { category: 'mouse' });
      const limited = await readIndexLabRunEvents('run-cache-3', 3, { category: 'mouse' });

      assert.equal(full.length, 10);
      assert.equal(limited.length, 3);
      assert.notEqual(full, limited, 'different limits should be separate cache entries');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('initIndexLabDataBuilders clears the cache', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-cache-'));
    try {
      const specDb = createMemorySpecDb();
      seedBridgeEvents(specDb, 'run-cache-4', [
        { event: 'a', ts: '2026-01-01T00:00:00Z' },
      ]);
      initBuilders(tmpDir, specDb);

      const first = await readIndexLabRunEvents('run-cache-4', 2000, { category: 'mouse' });

      // Insert a new event while cache is live
      specDb.insertBridgeEvent({
        run_id: 'run-cache-4', category: 'mouse', product_id: 'mouse-test-01',
        ts: '2026-01-01T00:00:01Z', stage: 'fetch', event: 'b', payload: {},
      });

      // Re-init (should clear cache)
      initBuilders(tmpDir, specDb);

      const afterReinit = await readIndexLabRunEvents('run-cache-4', 2000, { category: 'mouse' });
      assert.equal(first.length, 1);
      assert.equal(afterReinit.length, 2, 'reinit should clear cache so fresh read picks up new event');
      assert.notEqual(first, afterReinit);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
