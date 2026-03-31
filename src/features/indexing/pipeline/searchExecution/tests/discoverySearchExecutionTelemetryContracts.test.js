import test from 'node:test';
import assert from 'node:assert/strict';

import { executeSearchQueries } from '../executeSearchQueries.js';
import {
  makeConfig,
  makeExecutionArgs,
  makeLogger,
  makeProviderState
} from './helpers/discoverySearchExecutionHarness.js';

test('executeSearchQueries emits provider diagnostics even when no queries run', async () => {
  const logger = makeLogger();
  const result = await executeSearchQueries(makeExecutionArgs({
    config: makeConfig(),
    logger,
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
  }));

  const diagnostics = logger.events.find((event) => event.event === 'search_provider_diagnostics');
  assert.ok(diagnostics, 'should log provider diagnostics');
  assert.equal(diagnostics.data.provider, 'google');

  assert.deepEqual(result.searchResults, []);
  assert.deepEqual(result.searchAttempts, []);
  assert.deepEqual(result.searchJournal, []);
  assert.equal(result.internalSatisfied, false);
  assert.equal(result.externalSearchReason, null);
});

test('executeSearchQueries records searchJournal rows for internet queries', async () => {
  const result = await executeSearchQueries(makeExecutionArgs({
    config: makeConfig({ searchEngines: 'google' }),
    queries: ['q1', 'q2'],
    executionQueryLimit: 2,
    providerState: makeProviderState({ provider: 'google', internet_ready: true }),
    _runSearchProvidersFn: async ({ query }) => [
      { url: `https://example.com/${query}`, title: query, provider: 'google' },
    ],
  }));

  assert.equal(result.searchJournal.length, 2);
  assert.ok(result.searchJournal[0].ts, 'journal entries should have timestamps');
  assert.equal(result.searchJournal[0].provider, 'google');
});
