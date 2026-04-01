import test from 'node:test';
import assert from 'node:assert/strict';
import { registerIndexlabRoutes } from '../indexlabRoutes.js';

const MOCK_QUERY_ROWS = [
  { query: 'razer viper v3 pro specs', provider: 'google', result_count: 10, field_yield: ['weight', 'sensor'], run_id: 'r1', category: 'mouse', ts: '2026-01-01' },
  { query: 'razer viper v3 pro specs', provider: 'google', result_count: 8, field_yield: ['weight'], run_id: 'r2', category: 'mouse', ts: '2026-01-02' },
  { query: 'razer viper v3 pro weight', provider: 'google', result_count: 5, field_yield: ['weight', 'cable', 'shape'], run_id: 'r1', category: 'mouse', ts: '2026-01-01' },
  { query: 'razer viper v3 pro dpi', provider: 'bing', result_count: 3, field_yield: [], run_id: 'r1', category: 'mouse', ts: '2026-01-01' },
  { query: 'razer viper v3 pro dpi', provider: 'bing', result_count: 2, field_yield: [], run_id: 'r2', category: 'mouse', ts: '2026-01-02' },
];
const MOCK_URL_ROWS = [
  { url: 'https://example.com/spec', host: 'example.com', tier: 1, doc_kind: 'spec', fields_filled: ['weight'], fetch_success: true, run_id: 'r1', ts: '2026-01-01' },
  { url: 'https://example.com/spec', host: 'example.com', tier: 1, doc_kind: 'spec', fields_filled: ['weight', 'sensor'], fetch_success: true, run_id: 'r2', ts: '2026-01-02' },
  { url: 'https://other.com/review', host: 'other.com', tier: 2, doc_kind: 'review', fields_filled: [], fetch_success: false, run_id: 'r1', ts: '2026-01-01' },
];
const MOCK_PROMPT_ROWS = [
  { prompt_version: 'extract_v2', model: 'gpt-4', token_count: 500, success: true, run_id: 'r1', category: 'mouse', ts: '2026-01-01' },
  { prompt_version: 'extract_v2', model: 'gpt-4', token_count: 600, success: true, run_id: 'r2', category: 'mouse', ts: '2026-01-02' },
];
const MOCK_KNOB_ROWS = [];

function createMockCtx(overrides = {}) {
  const responses = [];
  const mockSpecDb = {
    getQueryIndexByCategory: () => MOCK_QUERY_ROWS,
    getUrlIndexByCategory: () => MOCK_URL_ROWS,
    getPromptIndexByCategory: () => MOCK_PROMPT_ROWS,
    getKnobSnapshots: () => MOCK_KNOB_ROWS,
  };
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
      readIndexLabRunPrimeSources: async () => null,
      readIndexLabRunDynamicFetchDashboard: async () => null,
      readIndexLabRunSourceIndexingPackets: async () => null,
      readIndexLabRunItemIndexingPacket: async () => null,
      readIndexLabRunRunMetaPacket: async () => null,
      readIndexLabRunSerpExplorer: async () => null,
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
  assert.equal(responses[0].body.total, MOCK_QUERY_ROWS.length);
});

test('GET /indexlab/indexes/url-summary returns summary with category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map([['category', 'mouse']]);
  await handler(['indexlab', 'indexes', 'url-summary'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.category, 'mouse');
  assert.equal(responses[0].body.total, MOCK_URL_ROWS.length);
});

test('GET /indexlab/indexes/prompt-summary returns summary with category', async () => {
  const { ctx, responses } = createMockCtx();
  const handler = registerIndexlabRoutes(ctx);
  const params = new Map([['category', 'mouse']]);
  await handler(['indexlab', 'indexes', 'prompt-summary'], params, 'GET', {}, {});
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.category, 'mouse');
  assert.equal(responses[0].body.total_calls, MOCK_PROMPT_ROWS.length);
});
