import test from 'node:test';
import assert from 'node:assert/strict';

import { createIntelGraphApiCommand } from '../intelGraphApiCommand.js';

function createDeps(overrides = {}) {
  return {
    startIntelGraphApi: async ({ category, host, port }) => ({
      host,
      port,
      graphqlUrl: `http://${host}:${port}/graphql?category=${category}`,
      healthUrl: `http://${host}:${port}/health`,
    }),
    ...overrides,
  };
}

test('intel-graph-api forwards normalized host/port to starter and returns endpoint payload', async () => {
  const calls = [];
  const commandIntelGraphApi = createIntelGraphApiCommand(createDeps({
    startIntelGraphApi: async (payload) => {
      calls.push(payload);
      return {
        host: payload.host,
        port: payload.port,
        graphqlUrl: `http://${payload.host}:${payload.port}/graphql`,
        healthUrl: `http://${payload.host}:${payload.port}/health`,
      };
    },
  }));

  const config = { mode: 'test' };
  const storage = { name: 'stub-storage' };
  const result = await commandIntelGraphApi(config, storage, {
    category: 'keyboard',
    host: '127.0.0.1',
    port: '9090',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].config, config);
  assert.equal(calls[0].storage, storage);
  assert.equal(calls[0].category, 'keyboard');
  assert.equal(calls[0].host, '127.0.0.1');
  assert.equal(calls[0].port, 9090);

  assert.equal(result.command, 'intel-graph-api');
  assert.equal(result.category, 'keyboard');
  assert.equal(result.host, '127.0.0.1');
  assert.equal(result.port, 9090);
  assert.equal(result.graphql_url, 'http://127.0.0.1:9090/graphql');
  assert.equal(result.health_url, 'http://127.0.0.1:9090/health');
});

test('intel-graph-api defaults category/host/port when args are missing or invalid', async () => {
  const calls = [];
  const commandIntelGraphApi = createIntelGraphApiCommand(createDeps({
    startIntelGraphApi: async (payload) => {
      calls.push(payload);
      return {
        host: payload.host,
        port: payload.port,
        graphqlUrl: 'http://default/graphql',
        healthUrl: 'http://default/health',
      };
    },
  }));

  const result = await commandIntelGraphApi({}, {}, {
    port: 'not-a-number',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, 'mouse');
  assert.equal(calls[0].host, '0.0.0.0');
  assert.equal(calls[0].port, 8787);
  assert.equal(result.command, 'intel-graph-api');
  assert.equal(result.category, 'mouse');
  assert.equal(result.host, '0.0.0.0');
  assert.equal(result.port, 8787);
});
