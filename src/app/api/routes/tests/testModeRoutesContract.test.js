import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { registerTestModeRoutes } from '../testModeRoutes.js';

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toUnitRatio(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric >= 0 && numeric <= 1) return numeric;
  if (numeric >= 0 && numeric <= 100) return numeric / 100;
  return null;
}

function makeCtx(overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    toInt,
    toUnitRatio,
    config: {},
    storage: {},
    HELPER_ROOT: path.resolve('category_authority'),
    OUTPUT_ROOT: path.resolve('out'),
    getSpecDb: () => null,
    getSpecDbReady: async () => null,
    fs: {
      rm: async () => {},
      mkdir: async () => {},
      copyFile: async () => {},
      writeFile: async () => {},
    },
    path,
    safeReadJson: async () => null,
    safeStat: async () => null,
    listFiles: async () => [],
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    broadcastWs: () => {},
    buildTrafficLight: () => ({}),
    deriveTrafficLightCounts: () => ({}),
    readLatestArtifacts: async () => ({}),
    analyzeContract: async () => ({ summary: { fieldCount: 0, componentTypes: [], knownValuesCatalogs: [], crossValidationRules: [] } }),
    buildTestProducts: () => [],
    generateTestSourceResults: async () => [],
    buildDeterministicSourceResults: () => [],
    buildSeedComponentDB: () => ({}),
    buildValidationChecks: () => [],
    loadComponentIdentityPools: async () => ({}),
    runTestProduct: async () => ({ ok: true }),
    purgeTestModeCategoryState: () => {},
    resetTestModeSharedReviewState: () => {},
    resetTestModeProductReviewState: () => {},
    addBrand: async () => ({ ok: true }),
    loadBrandRegistry: async () => ({ brands: {} }),
    invalidateFieldRulesCache: () => {},
    sessionCache: {},
    ...overrides,
  };
}

test('test-mode create returns source_category_not_found when the source category has no generated payloads', async () => {
  const handler = registerTestModeRoutes(makeCtx({
    readJsonBody: async () => ({ sourceCategory: 'mouse' }),
    safeStat: async () => null,
  }));

  const result = await handler(['test-mode', 'create'], new URLSearchParams(), 'POST', {}, {});

  assert.deepEqual(result, {
    status: 400,
    body: {
      ok: false,
      error: 'source_category_not_found',
      sourceCategory: 'mouse',
    },
  });
});

test('test-mode status returns the empty contract when no generated test category exists', async () => {
  const handler = registerTestModeRoutes(makeCtx({
    safeStat: async () => null,
  }));

  const result = await handler(
    ['test-mode', 'status'],
    new URLSearchParams('sourceCategory=mouse'),
    'GET',
    {},
    {},
  );

  assert.deepEqual(result, {
    status: 200,
    body: {
      ok: true,
      exists: false,
      testCategory: '',
      testCases: [],
      runResults: [],
    },
  });
});

test('test-mode summary and execution routes reject non-test categories', async () => {
  const cases = [
    {
      label: 'contract-summary',
      parts: ['test-mode', 'contract-summary'],
      params: new URLSearchParams('category=mouse'),
      method: 'GET',
    },
    {
      label: 'generate-products',
      parts: ['test-mode', 'generate-products'],
      params: new URLSearchParams(),
      method: 'POST',
      body: { category: 'mouse' },
    },
    {
      label: 'run',
      parts: ['test-mode', 'run'],
      params: new URLSearchParams(),
      method: 'POST',
      body: { category: 'mouse' },
    },
    {
      label: 'validate',
      parts: ['test-mode', 'validate'],
      params: new URLSearchParams(),
      method: 'POST',
      body: { category: 'mouse' },
    },
  ];

  for (const { label, parts, params, method, body } of cases) {
    const handler = registerTestModeRoutes(makeCtx({
      readJsonBody: async () => body ?? {},
    }));

    const result = await handler(parts, params, method, {}, {});

    assert.deepEqual(
      result,
      {
        status: 400,
        body: {
          ok: false,
          error: 'invalid_test_category',
        },
      },
      `${label} should reject non-test categories`,
    );
  }
});

test('test-mode delete rejects non-test categories', async () => {
  const handler = registerTestModeRoutes(makeCtx());

  const result = await handler(['test-mode', 'mouse'], new URLSearchParams(), 'DELETE', {}, {});

  assert.deepEqual(result, {
    status: 400,
    body: {
      ok: false,
      error: 'can_only_delete_test_categories',
    },
  });
});

test('test-mode delete rejects resolved paths that escape the allowed roots', async () => {
  let rmCalls = 0;
  const handler = registerTestModeRoutes(makeCtx({
    fs: {
      rm: async () => { rmCalls += 1; },
      mkdir: async () => {},
      copyFile: async () => {},
      writeFile: async () => {},
    },
  }));

  const result = await handler(
    ['test-mode', '_test_escape/../../outside'],
    new URLSearchParams(),
    'DELETE',
    {},
    {},
  );

  assert.deepEqual(result, {
    status: 400,
    body: {
      ok: false,
      error: 'invalid_category_path',
    },
  });
  assert.equal(rmCalls, 0, 'delete should stop before removing any directory when the resolved path escapes allowed roots');
});
