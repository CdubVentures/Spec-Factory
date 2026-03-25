import test from 'node:test';
import assert from 'node:assert/strict';

import { executeSearchQueries } from '../executeSearchQueries.js';
import {
  makeConfig,
  makeExecutionArgs,
  makeLogger,
  makeProviderState
} from './helpers/discoverySearchExecutionHarness.js';

test('executeSearchQueries internet search uses the active provider and accumulates results', async () => {
  const result = await executeSearchQueries(makeExecutionArgs({
    config: makeConfig({ searchEngines: 'google' }),
    job: { productId: 'mouse-razer-viper', category: 'mouse' },
    queries: ['razer viper spec'],
    executionQueryLimit: 1,
    missingFields: ['sensor'],
    variables: { brand: 'Razer', model: 'Viper', variant: '', category: 'mouse' },
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    _runSearchProvidersFn: async () => [
      { url: 'https://rtings.com/viper', title: 'RTINGS review', snippet: 'Razer Viper', provider: 'google' },
    ],
  }));

  assert.equal(result.rawResults.length, 1);
  assert.equal(result.rawResults[0].url, 'https://rtings.com/viper');
  assert.equal(result.searchAttempts.length, 1);
  assert.equal(result.searchAttempts[0].provider, 'google');
  assert.equal(result.searchAttempts[0].reason_code, 'internet_search');
});

test('executeSearchQueries reuses frontier cache when the provider returns zero results', async () => {
  const logger = makeLogger();
  const cachedResults = [
    { url: 'https://example.com/cached', title: 'Cached', provider: 'google' },
  ];
  const frontierDb = {
    getQueryRecord: () => ({ provider: 'google', results: cachedResults }),
    recordQuery: () => null,
  };

  const result = await executeSearchQueries(makeExecutionArgs({
    config: makeConfig({ searchEngines: 'google' }),
    logger,
    frontierDb,
    queries: ['cached query'],
    executionQueryLimit: 1,
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    _runSearchProvidersFn: async () => [],
  }));

  assert.equal(result.rawResults.length, 1);
  assert.equal(result.rawResults[0].url, 'https://example.com/cached');
  assert.equal(result.searchAttempts[0].reason_code, 'internet_search_zero_frontier_reuse');
  assert.equal(
    logger.events.some((event) => event.event === 'discovery_query_frontier_reuse'),
    true
  );
});
