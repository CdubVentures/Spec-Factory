import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSourceStrategyRoutes } from '../src/api/routes/sourceStrategyRoutes.js';

function createDbMock(rows = []) {
  return {
    listSourceStrategies: () => rows,
    insertSourceStrategy: () => ({ id: 1 }),
    updateSourceStrategy: () => ({ id: 1, enabled: 1 }),
    deleteSourceStrategy: () => ({ changes: 1 }),
  };
}

function makeCtx(overrides = {}) {
  return {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    getSpecDb: () => createDbMock(),
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    broadcastWs: () => {},
    ...overrides,
  };
}

test('source strategy routes require category query param', async () => {
  const requestedCategories = [];
  const handler = registerSourceStrategyRoutes(makeCtx({
    readJsonBody: async () => ({ host: 'example.com' }),
    getSpecDb: (category) => {
      requestedCategories.push(category);
      return createDbMock();
    },
  }));

  const getResult = await handler(['source-strategy'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(getResult.status, 400);
  assert.equal(getResult.body.error, 'category_required');

  const postResult = await handler(['source-strategy'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(postResult.status, 400);
  assert.equal(postResult.body.error, 'category_required');

  const putResult = await handler(['source-strategy', '7'], new URLSearchParams(), 'PUT', {}, {});
  assert.equal(putResult.status, 400);
  assert.equal(putResult.body.error, 'category_required');

  const deleteResult = await handler(['source-strategy', '7'], new URLSearchParams(), 'DELETE', {}, {});
  assert.equal(deleteResult.status, 400);
  assert.equal(deleteResult.body.error, 'category_required');

  assert.deepEqual(requestedCategories, []);
});

test('source strategy routes resolve and use explicit category', async () => {
  const requestedCategories = [];
  const rows = [{ id: 9, host: 'rtings.com', enabled: 1 }];
  const handler = registerSourceStrategyRoutes(makeCtx({
    getSpecDb: (category) => {
      requestedCategories.push(category);
      return createDbMock(rows);
    },
  }));

  const result = await handler(
    ['source-strategy'],
    new URLSearchParams('category=Keyboard'),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, rows);
  assert.deepEqual(requestedCategories, ['keyboard']);
});
