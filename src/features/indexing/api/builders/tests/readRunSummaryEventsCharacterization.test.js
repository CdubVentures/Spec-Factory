// WHY: Characterization test locking down readRunSummaryEvents behavior before
// the SQL-only reader cleanup. Verifies that Tier 1 (run_summary artifact) is
// used when bridge_events are purged (the post-finalize state for completed runs).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  initIndexLabDataBuilders,
  readRunSummaryEvents,
  readIndexLabRunEvents,
} from '../indexlabDataBuilders.js';
import { SpecDb } from '../../../../../db/specDb.js';
import { RUN_SUMMARY_SCHEMA_VERSION } from '../../contracts/runSummaryContract.js';

function createMemorySpecDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function makeSummaryPayload(events = []) {
  return {
    schema_version: RUN_SUMMARY_SCHEMA_VERSION,
    telemetry: {
      meta: { run_id: 'run-char-001', category: 'mouse', product_id: 'p1', status: 'completed' },
      events,
      llm_agg: { total_calls: 0 },
      observability: {},
    },
  };
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

describe('readRunSummaryEvents characterization', () => {
  test('Tier 1: returns events from run_summary artifact when bridge_events are purged', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'char-summary-'));
    const specDb = createMemorySpecDb();

    const frozenEvents = [
      { run_id: 'run-char-001', category: 'mouse', product_id: 'p1', ts: '2026-01-01T00:00:01Z', stage: 'fetch', event: 'fetch_started', payload: { url: 'https://a.com' } },
      { run_id: 'run-char-001', category: 'mouse', product_id: 'p1', ts: '2026-01-01T00:00:02Z', stage: 'fetch', event: 'fetch_finished', payload: { status: 200 } },
    ];

    // Write run_summary artifact to SQL (simulates finalize)
    specDb.upsertRunArtifact({
      run_id: 'run-char-001',
      artifact_type: 'run_summary',
      category: 'mouse',
      payload: makeSummaryPayload(frozenEvents),
    });

    // bridge_events are purged (empty — simulates post-finalize state)
    // No bridge events inserted — getBridgeEventsByRunId returns []

    initBuilders(tmpDir, specDb);

    const events = await readRunSummaryEvents('run-char-001', 2000, { category: 'mouse' });

    assert.equal(events.length, 2, 'should return 2 events from run_summary artifact');
    assert.equal(events[0].event, 'fetch_started');
    assert.equal(events[1].event, 'fetch_finished');
    assert.equal(events[0].payload.url, 'https://a.com');
  });

  test('Tier 2: falls back to bridge_events when run_summary artifact missing', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'char-fallback-'));
    const specDb = createMemorySpecDb();

    // No run_summary artifact — simulates active/running run
    // Bridge events exist (not yet purged)
    specDb.insertBridgeEvent({
      run_id: 'run-char-002',
      category: 'mouse',
      product_id: 'p1',
      ts: '2026-01-01T00:00:01Z',
      stage: 'search',
      event: 'search_started',
      payload: JSON.stringify({ query: 'test' }),
    });

    initBuilders(tmpDir, specDb);

    const events = await readRunSummaryEvents('run-char-002', 2000, { category: 'mouse' });

    assert.equal(events.length, 1, 'should fall back to bridge_events');
    assert.equal(events[0].event, 'search_started');
  });

  test('readIndexLabRunEvents returns empty when bridge_events purged (documents bug)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'char-bug-'));
    const specDb = createMemorySpecDb();

    // run_summary artifact exists but bridge_events are purged
    specDb.upsertRunArtifact({
      run_id: 'run-char-003',
      artifact_type: 'run_summary',
      category: 'mouse',
      payload: makeSummaryPayload([
        { run_id: 'run-char-003', category: 'mouse', product_id: 'p1', ts: 't', stage: 's', event: 'e', payload: {} },
      ]),
    });

    initBuilders(tmpDir, specDb);

    // readIndexLabRunEvents does NOT check run_summary artifact — only bridge_events
    const events = await readIndexLabRunEvents('run-char-003', 2000, { category: 'mouse' });

    assert.equal(events.length, 0, 'readIndexLabRunEvents returns empty for purged bridge_events (this is the bug)');
  });
});
