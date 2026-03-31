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

  assert.equal(result.searchResults.length, 1);
  assert.equal(result.searchResults[0].url, 'https://rtings.com/viper');
  assert.equal(result.searchAttempts.length, 1);
  assert.equal(result.searchAttempts[0].provider, 'google');
  assert.equal(result.searchAttempts[0].reason_code, 'internet_search');
});

test('executeSearchQueries accepts zero results when provider returns nothing (cooldown replaces frontier cache)', async () => {
  const logger = makeLogger();
  const frontierDb = {
    getQueryRecord: () => null,
    recordQuery: () => null,
  };

  const result = await executeSearchQueries(makeExecutionArgs({
    config: makeConfig({ searchEngines: 'google' }),
    logger,
    frontierDb,
    queries: ['query with no results'],
    executionQueryLimit: 1,
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    _runSearchProvidersFn: async () => [],
  }));

  assert.equal(result.searchResults.length, 0, 'zero results accepted — no frontier cache fallback');
  assert.equal(result.searchAttempts[0].reason_code, 'internet_search');
});
