import test from 'node:test';
import assert from 'node:assert/strict';

import { executeSearchQueries } from '../executeSearchQueries.js';
import {
  makeConfig,
  makeExecutionArgs,
  makeProviderState
} from './helpers/discoverySearchExecutionHarness.js';

test('executeSearchQueries internal-first mode accumulates corpus rows and records internal attempts', async () => {
  const result = await executeSearchQueries(makeExecutionArgs({
    config: makeConfig({ discoveryInternalFirst: true, searchEngines: '' }),
    storage: { readJsonOrNull: async () => null },
    job: { productId: 'mouse-razer-viper', category: 'mouse' },
    queries: ['razer viper spec'],
    executionQueryLimit: 4,
    missingFields: ['sensor'],
    variables: { brand: 'Razer', model: 'Viper', variant: '', category: 'mouse' },
    providerState: makeProviderState({ provider: 'none', internet_ready: false }),
    _searchSourceCorpusFn: async () => [
      { url: 'https://rtings.com/mice/razer-viper', title: 'RTINGS Viper', provider: 'internal' },
    ],
  }));

  assert.equal(result.rawResults.length, 1);
  assert.equal(result.rawResults[0].url, 'https://rtings.com/mice/razer-viper');
  assert.equal(result.searchAttempts[0].provider, 'internal');
  assert.equal(result.searchJournal[0].provider, 'internal');
});

test('executeSearchQueries internal-first mode keeps skip vs external escalation boundaries stable', async () => {
  const cases = [
    {
      label: 'enough internal results for required coverage',
      args: makeExecutionArgs({
        config: makeConfig({ discoveryInternalFirst: true, discoveryInternalMinResults: 1, searchEngines: 'google' }),
        storage: { readJsonOrNull: async () => null },
        queries: ['test query'],
        executionQueryLimit: 1,
        missingFields: ['sensor'],
        requiredOnlySearch: true,
        missingRequiredFields: ['sensor'],
        providerState: makeProviderState({ provider: 'google', internet_ready: true }),
        _searchSourceCorpusFn: async () => [
          { url: 'https://rtings.com/test', title: 'Test', provider: 'internal' },
        ],
      }),
      expected: {
        internalSatisfied: true,
        externalSearchReason: 'internal_satisfied_skip_external',
      },
    },
    {
      label: 'internal results under the required threshold',
      args: makeExecutionArgs({
        config: makeConfig({ discoveryInternalFirst: true, discoveryInternalMinResults: 5, searchEngines: '' }),
        storage: { readJsonOrNull: async () => null },
        queries: ['test'],
        executionQueryLimit: 1,
        missingRequiredFields: ['sensor'],
        providerState: makeProviderState({ provider: 'none', internet_ready: false }),
        _searchSourceCorpusFn: async () => [
          { url: 'https://example.com/one', title: 'One', provider: 'internal' },
        ],
      }),
      expected: {
        internalSatisfied: false,
        externalSearchReason: 'required_fields_missing_internal_under_target',
      },
    }
  ];

  for (const testCase of cases) {
    let providerCalled = false;
    const result = await executeSearchQueries({
      ...testCase.args,
      _runSearchProvidersFn: async () => {
        providerCalled = true;
        return [];
      },
    });

    assert.equal(result.internalSatisfied, testCase.expected.internalSatisfied, `${testCase.label} internalSatisfied mismatch`);
    assert.equal(result.externalSearchReason, testCase.expected.externalSearchReason, `${testCase.label} reason mismatch`);
    if (testCase.expected.internalSatisfied) {
      assert.equal(providerCalled, false, `${testCase.label} should skip internet search`);
    }
  }
});
