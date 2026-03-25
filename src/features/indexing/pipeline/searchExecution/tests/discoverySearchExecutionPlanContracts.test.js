import test from 'node:test';
import assert from 'node:assert/strict';

import { executeSearchQueries } from '../executeSearchQueries.js';
import {
  makeConfig,
  makeExecutionArgs,
  makeLogger,
  makeProviderState
} from './helpers/discoverySearchExecutionHarness.js';

test('executeSearchQueries plan-only mode produces planned URLs from source hosts', async () => {
  const logger = makeLogger();
  const result = await executeSearchQueries(makeExecutionArgs({
    config: makeConfig({ searchEngines: '' }),
    logger,
    job: { productId: 'mouse-razer-viper-v3-pro', category: 'mouse' },
    queries: ['razer viper v3 pro spec'],
    executionQueryLimit: 4,
    missingFields: ['sensor', 'weight'],
    variables: { brand: 'Razer', model: 'Viper V3', variant: 'Pro', category: 'mouse' },
    providerState: makeProviderState({ provider: 'none', internet_ready: false }),
  }));

  assert.ok(result.rawResults.length > 0, 'should produce plan-only results');
  assert.equal(result.searchAttempts.length, 1);
  assert.equal(result.searchAttempts[0].provider, 'plan');
  assert.equal(result.searchAttempts[0].reason_code, 'plan_only_no_provider');

  const started = logger.events.filter((event) => event.event === 'discovery_query_started');
  const completed = logger.events.filter((event) => event.event === 'discovery_query_completed');
  assert.ok(started.length > 0, 'should emit discovery_query_started');
  assert.ok(completed.length > 0, 'should emit discovery_query_completed');
});
