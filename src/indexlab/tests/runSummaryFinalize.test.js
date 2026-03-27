// WHY: Integration test verifying that finalize() writes run-summary.json
// to the run directory and upserts it into run_artifacts SQL.

import { describe, it } from 'node:test';
import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { IndexLabRuntimeBridge } from '../runtimeBridge.js';
import {
  RUN_SUMMARY_SCHEMA_VERSION,
  RUN_SUMMARY_TOP_KEYS,
  RUN_SUMMARY_TELEMETRY_KEYS,
} from '../../features/indexing/api/contracts/runSummaryContract.js';

const sorted = (arr) => [...arr].sort();

function makeMockSpecDb() {
  const bridgeEvents = [];
  const runArtifacts = [];
  const runs = [];
  return {
    bridgeEvents,
    runArtifacts,
    runs,
    insertBridgeEvent(row) { bridgeEvents.push({ ...row }); },
    getBridgeEventsByRunId(runId, limit) {
      return bridgeEvents
        .filter(e => e.run_id === runId)
        .slice(0, limit)
        .map(e => ({
          ...e,
          payload: typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload,
        }));
    },
    upsertRunArtifact(row) {
      const idx = runArtifacts.findIndex(
        a => a.run_id === row.run_id && a.artifact_type === row.artifact_type
      );
      if (idx >= 0) runArtifacts[idx] = { ...row };
      else runArtifacts.push({ ...row });
    },
    getRunArtifact(runId, artifactType) {
      return runArtifacts.find(a => a.run_id === runId && a.artifact_type === artifactType) || null;
    },
    upsertRun(row) {
      const idx = runs.findIndex(r => r.run_id === row.run_id);
      if (idx >= 0) runs[idx] = { ...row };
      else runs.push({ ...row });
    },
  };
}

function row(overrides = {}) {
  return {
    runId: 'run-fin-001',
    event: 'run_started',
    ts: '2026-03-27T10:00:00Z',
    category: 'mouse',
    productId: 'prod-001',
    ...overrides,
  };
}

async function startBridge(specDb, runId = 'run-fin-001') {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rsf-'));
  const bridge = new IndexLabRuntimeBridge({
    outRoot: tmpDir,
    context: { category: 'mouse', productId: 'prod-001' },
    specDb,
  });
  bridge.onRuntimeEvent(row({ runId, event: 'run_started' }));
  await bridge.queue;
  return { bridge, tmpDir };
}

describe('runSummaryFinalize — run-summary.json written at finalize', () => {
  it('run-summary.json exists on disk after finalize', async () => {
    const specDb = makeMockSpecDb();
    const { bridge, tmpDir } = await startBridge(specDb);

    await bridge.finalize({ status: 'completed' });

    const summaryPath = path.join(bridge.runDir, 'run-summary.json');
    const stat = await fs.stat(summaryPath).catch(() => null);
    ok(stat, 'run-summary.json should exist on disk');

    const content = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
    strictEqual(content.schema_version, RUN_SUMMARY_SCHEMA_VERSION);
    deepStrictEqual(sorted(Object.keys(content)), sorted(RUN_SUMMARY_TOP_KEYS));
    deepStrictEqual(sorted(Object.keys(content.telemetry)), sorted(RUN_SUMMARY_TELEMETRY_KEYS));

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('run_artifacts SQL row exists with artifact_type=run_summary', async () => {
    const specDb = makeMockSpecDb();
    const { bridge, tmpDir } = await startBridge(specDb, 'run-fin-002');

    await bridge.finalize({ status: 'completed' });

    const artifact = specDb.getRunArtifact(bridge.runId, 'run_summary');
    ok(artifact, 'run_summary artifact should exist in SQL');
    strictEqual(artifact.artifact_type, 'run_summary');
    ok(artifact.payload, 'payload should be populated');
    strictEqual(artifact.payload.schema_version, RUN_SUMMARY_SCHEMA_VERSION);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('events array captures bridge_events emitted during run', async () => {
    const specDb = makeMockSpecDb();
    const { bridge, tmpDir } = await startBridge(specDb, 'run-fin-003');

    // Emit fetch events
    bridge.onRuntimeEvent(row({ runId: 'run-fin-003', event: 'source_fetch_started', url: 'https://a.com' }));
    bridge.onRuntimeEvent(row({ runId: 'run-fin-003', event: 'source_fetch_started', url: 'https://b.com' }));
    await bridge.queue;

    await bridge.finalize({ status: 'completed' });

    const artifact = specDb.getRunArtifact(bridge.runId, 'run_summary');
    ok(artifact, 'run_summary artifact should exist');
    const events = artifact.payload.telemetry?.events || [];
    // run_started event + 2 fetch_started dispatches, each may emit multiple bridge events
    ok(events.length >= 1, `Expected >= 1 events, got ${events.length}`);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('llm_agg is populated before tracker reset', async () => {
    const specDb = makeMockSpecDb();
    const { bridge, tmpDir } = await startBridge(specDb, 'run-fin-004');

    bridge.onRuntimeEvent(row({
      runId: 'run-fin-004', event: 'llm_call_started',
      worker_id: 'llm-001', reason: 'evidence_index', model: 'claude-haiku-4'
    }));
    bridge.onRuntimeEvent(row({
      runId: 'run-fin-004', event: 'llm_call_completed',
      worker_id: 'llm-001', reason: 'evidence_index', model: 'claude-haiku-4',
      prompt_tokens: 500, completion_tokens: 100, estimated_cost: 0.01
    }));
    await bridge.queue;

    await bridge.finalize({ status: 'completed' });

    const artifact = specDb.getRunArtifact(bridge.runId, 'run_summary');
    ok(artifact, 'run_summary artifact should exist');
    const llmAgg = artifact.payload.telemetry?.llm_agg;
    ok(llmAgg, 'llm_agg should be present');
    ok(llmAgg.total_calls >= 1, `Expected total_calls >= 1, got ${llmAgg.total_calls}`);

    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('finalize succeeds without specDb', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rsf-'));
    const bridge = new IndexLabRuntimeBridge({
      outRoot: tmpDir,
      context: { category: 'mouse', productId: 'prod-005' },
      specDb: null,
    });
    bridge.runId = 'run-fin-005';
    bridge.runDir = path.join(tmpDir, 'run-fin-005');
    bridge.runMetaPath = path.join(bridge.runDir, 'run.json');
    await fs.mkdir(bridge.runDir, { recursive: true });

    await bridge.finalize({ status: 'completed' });

    const summaryPath = path.join(bridge.runDir, 'run-summary.json');
    const stat = await fs.stat(summaryPath).catch(() => null);
    ok(stat, 'run-summary.json should exist even without specDb');

    const content = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
    deepStrictEqual(content.telemetry.events, [], 'events empty without specDb');

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
