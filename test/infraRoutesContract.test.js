import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { registerInfraRoutes } from '../src/app/api/routes/infraRoutes.js';

function makeCtx(overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    listDirs: async () => [],
    canonicalSlugify: (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-'),
    HELPER_ROOT: path.resolve('category_authority'),
    DIST_ROOT: path.resolve('gui-dist'),
    OUTPUT_ROOT: path.resolve('out'),
    INDEXLAB_ROOT: path.resolve('indexlab'),
    fs: {
      access: async () => {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      },
      mkdir: async () => {},
    },
    path,
    runDataStorageState: {
      enabled: false,
      destinationType: 'local',
      localDirectory: '',
    },
    getSearxngStatus: async () => ({ ok: true }),
    startSearxngStack: async () => ({ ok: true }),
    startProcess: () => ({ running: true }),
    stopProcess: async () => ({ running: false }),
    processStatus: () => ({ running: false }),
    isProcessRunning: () => false,
    waitForProcessExit: async () => true,
    broadcastWs: () => {},
    ...overrides,
  };
}

test('infra health route returns gui-server metadata', async () => {
  const handler = registerInfraRoutes(makeCtx());
  const result = await handler(['health'], new URLSearchParams(), 'GET', {}, {});

  assert.equal(result.status, 200);
  assert.equal(result.body?.ok, true);
  assert.equal(result.body?.service, 'gui-server');
  assert.equal(result.body?.dist_root, path.resolve('gui-dist'));
});

test('infra categories GET filters private categories and honors includeTest flag', async () => {
  const handler = registerInfraRoutes(makeCtx({
    listDirs: async () => ['mouse', '_global', '_tmp', '_test_keyboard'],
  }));

  const normal = await handler(['categories'], new URLSearchParams(), 'GET', {}, {});
  const includeTest = await handler(
    ['categories'],
    new URLSearchParams('includeTest=true'),
    'GET',
    {},
    {},
  );

  assert.deepEqual(normal.body, ['mouse']);
  assert.deepEqual(includeTest.body, ['mouse', '_test_keyboard']);
});

test('infra categories POST scaffolds category and returns field_count', async () => {
  const scaffoldCalls = [];
  const handler = registerInfraRoutes(makeCtx({
    readJsonBody: async () => ({ name: 'Gaming Mice' }),
    fs: {
      access: async () => {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      },
      mkdir: async () => {},
    },
    listDirs: async () => ['gaming-mice', 'mouse', '_global'],
    scaffoldCategoryFn: async ({ category, config }) => {
      scaffoldCalls.push({ category, config });
      return {
        created: true,
        category,
        compileResult: { compiled: true, field_count: 30, warnings: [], errors: [] },
      };
    },
  }));

  const result = await handler(['categories'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 201);
  assert.equal(result.body?.slug, 'gaming-mice');
  assert.equal(result.body?.field_count, 30);
  assert.deepEqual(result.body?.categories, ['gaming-mice', 'mouse']);
  assert.equal(scaffoldCalls.length, 1);
  assert.equal(scaffoldCalls[0].category, 'gaming-mice');
});

test('infra searxng surfaces start failures without mutating the success contract', async () => {
  const handler = registerInfraRoutes(makeCtx({
    startSearxngStack: async () => ({ ok: false, error: 'searx_boot_failed', status: 'starting' }),
  }));

  const result = await handler(['searxng', 'start'], new URLSearchParams(), 'POST', {}, {});
  assert.deepEqual(result, {
    status: 500,
    body: {
      error: 'searx_boot_failed',
      status: 'starting',
    },
  });
});

test('infra graphql proxy preserves upstream status and payload', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    status: 202,
    json: async () => ({ ok: true, rows: 3 }),
  });

  try {
    const handler = registerInfraRoutes(makeCtx({
      readJsonBody: async () => ({ query: '{ ping }' }),
    }));
    const result = await handler(['graphql'], new URLSearchParams(), 'POST', {}, {});
    assert.deepEqual(result, {
      status: 202,
      body: { ok: true, rows: 3 },
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});
