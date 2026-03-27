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
      queryIndexSummary: () => ({ total: 0, dead_count: 0, top_yield: [], provider_breakdown: {} }),
      urlIndexSummary: () => ({ total: 0, reuse_distribution: {}, high_yield: [], tier_breakdown: {} }),
      highYieldUrls: () => [],
      promptIndexSummary: () => ({ total_calls: 0, total_tokens: 0, unique_versions: 0, versions: [], model_breakdown: {} }),
      readKnobSnapshots: () => [],
      evaluateAllSections: (runData) => ({
        section_results: {},
        verdicts: { defaults_aligned: 'RED', crawl_alive: 'RED', parser_alive: 'RED', extraction_alive: 'RED', publishable_alive: 'RED' },
        total_checks: 149, pass_count: 0, fail_count: 10, skip_count: 139
      }),
      buildEvidenceReport: (runData) => ({ run_id: null, scenario: null }),
      buildEffectiveSettingsSnapshot: (config) => ({ ts: '2026-03-09T12:00:00.000Z', searchEngines: 'bing,brave,duckduckgo' }),
      ...overrides
    },
    responses
  };
}

test('GET /indexlab/live-crawl/check-catalog returns catalog metadata', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map();
  await handler(['indexlab', 'live-crawl', 'check-catalog'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.total_checks, 142);
  assert.ok(Array.isArray(responses[0].body.sections));
  assert.ok(Array.isArray(responses[0].body.verdicts));
});

test('GET /indexlab/live-crawl/evaluate returns evaluation with verdicts', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map();
  await handler(['indexlab', 'live-crawl', 'evaluate'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.ok(responses[0].body.verdicts);
  assert.equal(responses[0].body.total_checks, 149);
});

test('GET /indexlab/live-crawl/settings-snapshot returns snapshot', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map();
  await handler(['indexlab', 'live-crawl', 'settings-snapshot'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.ok(responses[0].body.ts);
  assert.equal(responses[0].body.searchEngines, 'bing,brave,duckduckgo');
});
