import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { registerIndexlabRoutes } from '../indexlabRoutes.js';

// ── mock helpers ────────────────────────────────────────────
function jsonRes(res, code, body) {
  res.statusCode = code;
  res.body = body;
  return true;
}

function toInt(v, fallback = 0) {
  const parsed = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(v, fallback = 0) {
  const parsed = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

const mockSpecDb = {
  getQueryIndexByCategory: () => [],
  getUrlIndexByCategory: () => [],
  getPromptIndexByCategory: () => [],
  getKnobSnapshots: () => [],
};

function createMockCtx(overrides = {}) {
  return {
    jsonRes,
    toInt,
    toFloat,
    safeJoin: (base, sub) => path.join(base, String(sub || '')),
    safeReadJson: async () => null,
    path,
    INDEXLAB_ROOT: '/tmp/indexlab',
    processStatus: () => ({ running: false }),
    getSpecDb: () => mockSpecDb,
    readIndexLabRunMeta: async () => null,
    resolveIndexLabRunDirectory: async () => '',
    readIndexLabRunEvents: async () => [],
    readRunSummaryEvents: async () => [],
    readIndexLabRunNeedSet: async () => null,
    readIndexLabRunSearchProfile: async () => null,
    readIndexLabRunPhase07PrimeSources: async () => null,
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
    evaluateAllSections: () => ({}),
    buildEvidenceReport: () => ({}),
    buildEffectiveSettingsSnapshot: () => ({}),
    buildScreenshotManifestFromEvents: () => null,
    // Phase 4B analytics
    computeCompoundCurve: ({ category }) => ({
      category,
      verdict: 'NOT_PROVEN',
      search_reduction_pct: 0,
      url_reuse_trend: 'flat',
      runs: [],
    }),
    diffRunPlans: ({ run1Summary, run2Summary }) => ({
      run1_id: run1Summary.run_id,
      run2_id: run2Summary.run_id,
      fields: [],
      run1_wins: 0,
      run2_wins: 0,
      ties: 0,
      neither: 0,
    }),
    buildFieldMapFromPacket: () => ({}),
    aggregateCrossRunMetrics: ({ category }) => ({
      category,
      run_count: 0,
      field_fill_rate: 0,
      searches_per_product: 0,
      block_rate_by_host: {},
      sparkline_data: { fill_rate: [], searches: [], block_rate: [] },
    }),
    aggregateHostHealth: () => [],
    ...overrides,
  };
}

function res() {
  return { statusCode: 0, body: null };
}

// ── tests ───────────────────────────────────────────────────
test('analytics API — compound-curve: missing category → 400', async () => {
  const handler = registerIndexlabRoutes(createMockCtx());
  const r = res();
  await handler(
    ['indexlab', 'analytics', 'compound-curve'],
    new URLSearchParams(),
    'GET', null, r,
  );
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.error, 'missing_category');
});

test('analytics API — compound-curve: valid → 200', async () => {
  const handler = registerIndexlabRoutes(createMockCtx());
  const r = res();
  await handler(
    ['indexlab', 'analytics', 'compound-curve'],
    new URLSearchParams('category=mouse'),
    'GET', null, r,
  );
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.category, 'mouse');
  assert.equal(r.body.verdict, 'NOT_PROVEN');
});

test('analytics API — plan-diff: missing run IDs → 400', async () => {
  const handler = registerIndexlabRoutes(createMockCtx());
  const r = res();
  await handler(
    ['indexlab', 'analytics', 'plan-diff'],
    new URLSearchParams(),
    'GET', null, r,
  );
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.error, 'missing_run_ids');
});

test('analytics API — plan-diff: packet not found → 404', async () => {
  const handler = registerIndexlabRoutes(createMockCtx({
    readIndexLabRunItemIndexingPacket: async () => null,
  }));
  const r = res();
  await handler(
    ['indexlab', 'analytics', 'plan-diff'],
    new URLSearchParams('run1=r1&run2=r2'),
    'GET', null, r,
  );
  assert.equal(r.statusCode, 404);
});

test('analytics API — cross-run-metrics: valid → 200', async () => {
  const handler = registerIndexlabRoutes(createMockCtx());
  const r = res();
  await handler(
    ['indexlab', 'analytics', 'cross-run-metrics'],
    new URLSearchParams('category=mouse'),
    'GET', null, r,
  );
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.category, 'mouse');
  assert.equal(r.body.run_count, 0);
});

test('analytics API — host-health: valid → 200', async () => {
  const handler = registerIndexlabRoutes(createMockCtx());
  const r = res();
  await handler(
    ['indexlab', 'analytics', 'host-health'],
    new URLSearchParams('category=mouse'),
    'GET', null, r,
  );
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.category, 'mouse');
  assert.ok(Array.isArray(r.body.hosts));
});
