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

test('intel-graph-api returns normalized endpoint details', async () => {
  const commandIntelGraphApi = createIntelGraphApiCommand(createDeps({
    startIntelGraphApi: async ({ host, port }) => ({
      host,
      port,
      graphqlUrl: `http://${host}:${port}/graphql`,
      healthUrl: `http://${host}:${port}/health`,
    }),
  }));

  const result = await commandIntelGraphApi(
    { mode: 'test' },
    { name: 'stub-storage' },
    { category: 'keyboard', host: '127.0.0.1', port: '9090' },
  );

  assert.deepEqual(result, {
    command: 'intel-graph-api',
    category: 'keyboard',
    host: '127.0.0.1',
    port: 9090,
    graphql_url: 'http://127.0.0.1:9090/graphql',
    health_url: 'http://127.0.0.1:9090/health',
  });
});

test('intel-graph-api defaults category, host, and port when args are missing or invalid', async () => {
  const commandIntelGraphApi = createIntelGraphApiCommand(createDeps({
    startIntelGraphApi: async ({ host, port }) => ({
      host,
      port,
      graphqlUrl: 'http://default/graphql',
      healthUrl: 'http://default/health',
    }),
  }));

  const result = await commandIntelGraphApi({}, {}, {
    port: 'not-a-number',
  });

  assert.deepEqual(result, {
    command: 'intel-graph-api',
    category: 'mouse',
    host: '0.0.0.0',
    port: 8787,
    graphql_url: 'http://default/graphql',
    health_url: 'http://default/health',
  });
});
