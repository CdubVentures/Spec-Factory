import test from 'node:test';
import assert from 'node:assert/strict';
import { registerSourceStrategyRoutes } from '../src/api/routes/sourceStrategyRoutes.js';

function createDbMock() {
  return {
    listSourceStrategies: () => [],
    insertSourceStrategy: () => ({ id: 11 }),
    updateSourceStrategy: (id, patch) => ({ id, ...patch }),
    deleteSourceStrategy: () => ({ changes: 1 }),
  };
}

function makeCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    getSpecDb: () => createDbMock(),
    resolveCategoryAlias: (value) => String(value || '').trim().toLowerCase(),
    broadcastWs: () => {},
  };
  return { ...ctx, ...overrides };
}

test('source strategy POST emits typed data-change contract', async () => {
  const emitted = [];
  const handler = registerSourceStrategyRoutes(makeCtx({
    readJsonBody: async () => ({ host: 'example.com', enabled: 1 }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(
    ['source-strategy'],
    new URLSearchParams('category=mouse'),
    'POST',
    {},
    {},
  );

  assert.equal(result.status, 201);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'source-strategy-created');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.domains, ['source-strategy']);
});

test('source strategy PUT emits typed data-change contract', async () => {
  const emitted = [];
  const handler = registerSourceStrategyRoutes(makeCtx({
    readJsonBody: async () => ({ enabled: 0 }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(
    ['source-strategy', '7'],
    new URLSearchParams('category=keyboard'),
    'PUT',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'source-strategy-updated');
  assert.equal(emitted[0].payload.category, 'keyboard');
  assert.deepEqual(emitted[0].payload.domains, ['source-strategy']);
});

test('source strategy DELETE emits typed data-change contract', async () => {
  const emitted = [];
  const handler = registerSourceStrategyRoutes(makeCtx({
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(
    ['source-strategy', '3'],
    new URLSearchParams('category=mouse'),
    'DELETE',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'source-strategy-deleted');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.domains, ['source-strategy']);
});
