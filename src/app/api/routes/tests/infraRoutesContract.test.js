import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  createInfraRoutesHandler,
  createMissingPathFs,
  invokeInfraRoute,
} from './helpers/infraRoutesHarness.js';

test('health endpoint reports gui-server identity and dist root', async () => {
  const handler = createInfraRoutesHandler();
  const result = await invokeInfraRoute(handler, ['health'], 'GET');

  assert.equal(result.status, 200);
  assert.equal(result.body?.ok, true);
  assert.equal(result.body?.service, 'gui-server');
  assert.equal(result.body?.dist_root, path.resolve('gui-dist'));
});

test('categories endpoint hides private folders', async () => {
  const handler = createInfraRoutesHandler({
    listDirs: async () => ['mouse', '_global', '_tmp'],
  });

  const result = await invokeInfraRoute(handler, ['categories'], 'GET');
  assert.deepEqual(result.body, ['mouse']);
});

test('category creation returns the new slug, public category list, and field count', async () => {
  const scaffoldCalls = [];
  const emittedEvents = [];
  const handler = createInfraRoutesHandler({
    readJsonBody: async () => ({ name: 'Gaming Mice' }),
    fs: createMissingPathFs(),
    listDirs: async () => ['gaming-mice', 'mouse', '_global'],
    scaffoldCategoryFn: async ({ category, config }) => {
      scaffoldCalls.push({ category, config });
      return {
        created: true,
        category,
        compileResult: { compiled: true, field_count: 30, warnings: [], errors: [] },
      };
    },
    emitDataChangeFn: (event) => {
      emittedEvents.push(event);
    },
  });

  const result = await invokeInfraRoute(handler, ['categories'], 'POST');
  assert.equal(result.status, 201);
  assert.equal(result.body?.slug, 'gaming-mice');
  assert.equal(result.body?.field_count, 30);
  assert.deepEqual(result.body?.categories, ['gaming-mice', 'mouse']);
  assert.equal(scaffoldCalls.length, 1);
  assert.equal(scaffoldCalls[0].category, 'gaming-mice');
  assert.equal(emittedEvents.length, 1);
  assert.equal(emittedEvents[0].event, 'category-created');
  assert.equal(emittedEvents[0].category, 'all');
  assert.deepEqual(emittedEvents[0].meta, { slug: 'gaming-mice' });
});

test('category creation rejects blank category names', async () => {
  const handler = createInfraRoutesHandler({
    readJsonBody: async () => ({ name: '   ' }),
  });

  const result = await invokeInfraRoute(handler, ['categories'], 'POST');
  assert.deepEqual(result, {
    status: 400,
    body: {
      ok: false,
      error: 'category_name_required',
    },
  });
});

test('category creation reports conflicts when the category already exists', async () => {
  const handler = createInfraRoutesHandler({
    readJsonBody: async () => ({ name: 'Mouse' }),
  });

  const result = await invokeInfraRoute(handler, ['categories'], 'POST');
  assert.deepEqual(result, {
    status: 409,
    body: {
      ok: false,
      error: 'category_already_exists',
      slug: 'mouse',
    },
  });
});

test('category creation surfaces scaffold compile failures as a 500 contract error', async () => {
  const handler = createInfraRoutesHandler({
    readJsonBody: async () => ({ name: 'Broken Category' }),
    fs: createMissingPathFs(),
    scaffoldCategoryFn: async () => ({
      created: true,
      compileResult: { compiled: false, errors: ['missing schema'] },
    }),
  });

  const result = await invokeInfraRoute(handler, ['categories'], 'POST');
  assert.deepEqual(result, {
    status: 500,
    body: {
      ok: false,
      error: 'scaffold_compile_failed',
      details: ['missing schema'],
    },
  });
});

test('searxng start surfaces upstream failures as a 500 error payload', async () => {
  const handler = createInfraRoutesHandler({
    startSearxngStack: async () => ({ ok: false, error: 'searx_boot_failed', status: 'starting' }),
  });

  const result = await invokeInfraRoute(handler, ['searxng', 'start'], 'POST');
  assert.deepEqual(result, {
    status: 500,
    body: {
      error: 'searx_boot_failed',
      status: 'starting',
    },
  });
});

test('graphql proxy relays the upstream status code and JSON body', async () => {
  const handler = createInfraRoutesHandler({
    fetchApi: async () => ({
      status: 202,
      json: async () => ({ ok: true, rows: 3 }),
    }),
    readJsonBody: async () => ({ query: '{ ping }' }),
  });

  const result = await invokeInfraRoute(handler, ['graphql'], 'POST');
  assert.deepEqual(result, {
    status: 202,
    body: { ok: true, rows: 3 },
  });
});
