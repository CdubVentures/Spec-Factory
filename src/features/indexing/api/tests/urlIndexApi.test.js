import test from 'node:test';
import assert from 'node:assert/strict';
import { registerIndexlabRoutes } from '../indexlabRoutes.js';

const mockSpecDb = {
  getQueryIndexByCategory: () => [],
  getUrlIndexByCategory: () => [],
  getPromptIndexByCategory: () => [],
  getKnobSnapshots: () => [
    { ts: '2026-03-01T00:00:00.000Z', entries: [], mismatch_count: 0, total_knobs: 0 },
  ],
};

function createMockCtx(overrides = {}) {
  const responses = [];
  return {
    ctx: {
      jsonRes: (_res, status, body) => { responses.push({ status, body }); return true; },
      toInt: (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; },
      toFloat: (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; },
      safeJoin: (...args) => args.join('/'),
      safeReadJson: async () => null,
      path: { join: (...args) => args.join('/') },
      INDEXLAB_ROOT: '/tmp/indexlab',
      processStatus: () => ({ running: false }),
      getSpecDb: () => mockSpecDb,
      readIndexLabRunMeta: async () => null,
      resolveIndexLabRunDirectory: async () => '',
      readIndexLabRunEvents: async () => [],
      readRunSummaryEvents: async () => [],
      readIndexLabRunNeedSet: async () => null,
      readIndexLabRunSearchProfile: async () => null,
      readIndexLabRunPhase07Retrieval: async () => null,
      readIndexLabRunPhase08Extraction: async () => null,
      readIndexLabRunDynamicFetchDashboard: async () => null,
      readIndexLabRunSourceIndexingPackets: async () => null,
      readIndexLabRunItemIndexingPacket: async () => null,
      readIndexLabRunRunMetaPacket: async () => null,
      readIndexLabRunSerpExplorer: async () => null,
      readIndexLabRunLlmTraces: async () => null,
      readIndexLabRunAutomationQueue: async () => null,
      readIndexLabRunEvidenceIndex: async () => null,
      listIndexLabRuns: async () => [],
      buildRoundSummaryFromEvents: () => ({}),
      buildSearchHints: () => [],
      buildAnchorsSuggestions: () => [],
      buildKnownValuesSuggestions: () => [],
      ...overrides
    },
    responses
  };
}

test('GET /indexlab/indexes/knob-snapshots returns 400 without category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map();
  await handler(['indexlab', 'indexes', 'knob-snapshots'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 400);
});

test('GET /indexlab/indexes/knob-snapshots returns snapshots with category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map([['category', 'mouse']]);
  await handler(['indexlab', 'indexes', 'knob-snapshots'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.category, 'mouse');
  assert.ok(Array.isArray(responses[0].body.snapshots));
  assert.equal(responses[0].body.snapshots.length, 1);
});

test('GET /indexlab/indexes/url-summary returns 400 without category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map();
  await handler(['indexlab', 'indexes', 'url-summary'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 400);
});
