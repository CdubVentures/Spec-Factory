import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  readIndexLabRunEvents,
} from '../src/features/indexing/api/builders/indexlabDataBuilders.js';

const REAL_DATE_NOW = Date.now;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createRunFixture(rootDir, runId, events = []) {
  const runDir = path.join(rootDir, runId);
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(
    path.join(runDir, 'run.json'),
    JSON.stringify({ run_id: runId, status: 'completed' }),
  );
  const text = events.map((e) => JSON.stringify(e)).join('\n');
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), text ? `${text}\n` : '');
}

function initBuilders(indexLabRoot) {
  initIndexLabDataBuilders({
    indexLabRoot,
    outputRoot: indexLabRoot,
    storage: {
      resolveOutputKey: (...p) => p.join('/'),
      resolveInputKey: (...p) => p.join('/'),
      readJsonOrNull: async () => null,
    },
    config: {},
    getSpecDbReady: () => false,
    isProcessRunning: () => false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readIndexLabRunEvents cache', () => {
  test.afterEach(() => {
    Date.now = REAL_DATE_NOW;
  });

  test('second call within TTL returns same array reference (cache hit)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-cache-'));
    try {
      const events = [
        { event: 'fetch_started', ts: '2026-01-01T00:00:00Z' },
        { event: 'fetch_finished', ts: '2026-01-01T00:00:01Z' },
      ];
      await createRunFixture(tmpDir, 'run-cache-1', events);
      initBuilders(tmpDir);

      const first = await readIndexLabRunEvents('run-cache-1');
      const second = await readIndexLabRunEvents('run-cache-1');

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
      await createRunFixture(tmpDir, 'run-cache-2', [{ event: 'a', ts: '2026-01-01T00:00:00Z' }]);
      initBuilders(tmpDir);

      const first = await readIndexLabRunEvents('run-cache-2');
      assert.equal(first.length, 1);

      // Append a new event to disk while cache is live
      const eventsPath = path.join(tmpDir, 'run-cache-2', 'run_events.ndjson');
      await fs.appendFile(eventsPath, JSON.stringify({ event: 'b', ts: '2026-01-01T00:00:01Z' }) + '\n');

      // Advance virtual time past the TTL instead of sleeping.
      nowMs += 5_500;

      const afterTtl = await readIndexLabRunEvents('run-cache-2');
      assert.equal(afterTtl.length, 2, 'fresh read after TTL should pick up new event');
      assert.notEqual(first, afterTtl, 'different reference means fresh read');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  test('different limit is a separate cache entry', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'event-cache-'));
    try {
      const events = Array.from({ length: 10 }, (_, i) => ({
        event: `evt-${i}`,
        ts: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
      }));
      await createRunFixture(tmpDir, 'run-cache-3', events);
      initBuilders(tmpDir);

      const full = await readIndexLabRunEvents('run-cache-3', 10);
      const limited = await readIndexLabRunEvents('run-cache-3', 3);

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
      await createRunFixture(tmpDir, 'run-cache-4', [{ event: 'a', ts: '2026-01-01T00:00:00Z' }]);
      initBuilders(tmpDir);

      const first = await readIndexLabRunEvents('run-cache-4');

      // Append event
      const eventsPath = path.join(tmpDir, 'run-cache-4', 'run_events.ndjson');
      await fs.appendFile(eventsPath, JSON.stringify({ event: 'b', ts: '2026-01-01T00:00:01Z' }) + '\n');

      // Re-init (should clear cache)
      initBuilders(tmpDir);

      const afterReinit = await readIndexLabRunEvents('run-cache-4');
      assert.equal(first.length, 1);
      assert.equal(afterReinit.length, 2, 'reinit should clear cache so fresh read picks up new event');
      assert.notEqual(first, afterReinit);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
