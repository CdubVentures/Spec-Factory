import test from 'node:test';
import assert from 'node:assert/strict';
import { registerIndexlabRoutes } from '../indexlabRoutes.js';

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
      queryIndexSummary: () => ({ total: 5, dead_count: 1, top_yield: [], provider_breakdown: {} }),
      urlIndexSummary: () => ({ total: 3, reuse_distribution: {}, high_yield: [], tier_breakdown: {} }),
      highYieldUrls: () => ['https://good.com'],
      promptIndexSummary: () => ({ total_calls: 2, total_tokens: 500, unique_versions: 1, versions: [], model_breakdown: {} }),
      readKnobSnapshots: () => [{ ts: '2026-01-01T00:00:00.000Z' }],
      ...overrides
    },
    responses
  };
}

test('GET /indexlab/indexes/query-summary returns 400 without category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map();
  await handler(['indexlab', 'indexes', 'query-summary'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 400);
});

test('GET /indexlab/indexes/query-summary returns summary with category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map([['category', 'mouse']]);
  await handler(['indexlab', 'indexes', 'query-summary'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.category, 'mouse');
  assert.equal(responses[0].body.total, 5);
});

test('GET /indexlab/indexes/url-summary returns summary with category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map([['category', 'mouse']]);
  await handler(['indexlab', 'indexes', 'url-summary'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.category, 'mouse');
  assert.equal(responses[0].body.total, 3);
});

test('GET /indexlab/indexes/prompt-summary returns summary with category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map([['category', 'mouse']]);
  await handler(['indexlab', 'indexes', 'prompt-summary'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.category, 'mouse');
  assert.equal(responses[0].body.total_calls, 2);
});
