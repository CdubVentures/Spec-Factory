import test from 'node:test';
import assert from 'node:assert/strict';
import { applyResearchArtifactsContext } from '../src/features/indexing/orchestration/index.js';

function parseJsonBuffer(buffer) {
  return JSON.parse(Buffer.from(buffer).toString('utf8'));
}

test('applyResearchArtifactsContext is a no-op when research mode is disabled', async () => {
  const writes = [];
  const summary = {};

  await applyResearchArtifactsContext({
    uberAggressiveMode: false,
    frontierDb: null,
    uberOrchestrator: null,
    storage: {
      resolveOutputKey: () => 'unused',
      writeObject: async (...args) => writes.push(args),
    },
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run_123',
    discoveryResult: {},
    previousFinalSpec: {},
    normalized: {},
    fieldOrder: [],
    summary,
    runtimeMode: 'balanced',
  });

  assert.equal(writes.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(summary, 'research'), false);
});

test('applyResearchArtifactsContext persists research artifacts and stamps summary pointers', async () => {
  const writes = [];
  const summary = {};

  const storage = {
    resolveOutputKey: (...parts) => parts.join('/'),
    writeObject: async (key, body, meta) => {
      writes.push({ key, body, meta });
    },
  };

  await applyResearchArtifactsContext({
    uberAggressiveMode: true,
    frontierDb: {
      frontierSnapshot: ({ limit }) => ({ limit, rows: [{ url: 'https://example.com/spec' }] }),
    },
    uberOrchestrator: {
      buildCoverageDelta: ({ previousSpec, currentSpec, fieldOrder }) => ({
        previous_known_count: Object.keys(previousSpec).length,
        current_known_count: Object.keys(currentSpec).length,
        delta_known: 1,
        gained_fields: fieldOrder.slice(0, 1),
        lost_fields: [],
      }),
    },
    storage,
    category: 'mouse',
    productId: 'mouse-product',
    runId: 'run_456',
    discoveryResult: {
      uber_search_plan: { source: 'planner', queries: ['mouse specs'] },
      search_journal: [{ q: 'mouse specs', provider: 'searxng' }],
      queries: ['mouse specs'],
    },
    previousFinalSpec: {
      fields: {
        weight_g: '55',
      },
    },
    normalized: {
      fields: {
        weight_g: '54',
        battery_life: '95h',
      },
    },
    fieldOrder: ['weight_g', 'battery_life'],
    summary,
    runtimeMode: 'uber_aggressive',
  });

  assert.equal(writes.length, 4);
  assert.equal(writes[0].key.endsWith('/search_plan.json'), true);
  assert.equal(writes[1].key.endsWith('/search_journal.jsonl'), true);
  assert.equal(writes[2].key.endsWith('/frontier_snapshot.json'), true);
  assert.equal(writes[3].key.endsWith('/coverage_delta.json'), true);

  assert.equal(writes[0].meta.contentType, 'application/json');
  assert.equal(writes[1].meta.contentType, 'application/x-ndjson');
  assert.equal(writes[2].meta.contentType, 'application/json');
  assert.equal(writes[3].meta.contentType, 'application/json');

  const searchPlanPayload = parseJsonBuffer(writes[0].body);
  assert.equal(searchPlanPayload.source, 'planner');

  const frontierSnapshotPayload = parseJsonBuffer(writes[2].body);
  assert.equal(frontierSnapshotPayload.limit, 200);

  const coverageDeltaPayload = parseJsonBuffer(writes[3].body);
  assert.equal(coverageDeltaPayload.delta_known, 1);
  assert.equal(Array.isArray(coverageDeltaPayload.gained_fields), true);

  assert.equal(summary.research.mode, 'uber_aggressive');
  assert.equal(summary.research.search_plan_key.endsWith('/search_plan.json'), true);
  assert.equal(summary.research.search_journal_key.endsWith('/search_journal.jsonl'), true);
  assert.equal(summary.research.frontier_snapshot_key.endsWith('/frontier_snapshot.json'), true);
  assert.equal(summary.research.coverage_delta_key.endsWith('/coverage_delta.json'), true);
});
