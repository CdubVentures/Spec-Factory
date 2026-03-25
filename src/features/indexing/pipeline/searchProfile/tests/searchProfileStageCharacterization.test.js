import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runSearchProfile } from '../runSearchProfile.js';

function createMockLogger() {
  return {
    info() {},
    warn() {},
    debug() {},
  };
}

function makeJob() {
  return {
    productId: 'test-prod',
    brand: 'TestBrand',
    model: 'TestModel',
    category: 'mouse',
    identityLock: { brand: 'TestBrand', model: 'TestModel' },
  };
}

function makeCategoryConfig() {
  return {
    category: 'mouse',
    fieldOrder: ['sensor_model', 'weight', 'dpi', 'polling_rate'],
    fieldRules: {
      sensor_model: { required_level: 'critical' },
      weight: { required_level: 'required' },
      dpi: { required_level: 'expected' },
    },
  };
}

function makeBaseArgs(overrides = {}) {
  return {
    job: makeJob(),
    categoryConfig: makeCategoryConfig(),
    missingFields: ['sensor_model', 'weight', 'dpi'],
    learning: { lexicon: {}, queryTemplates: [], fieldYield: null },
    brandResolution: null,
    config: { searchProfileQueryCap: 1, searchEngines: 'bing,google' },
    variables: { brand: 'TestBrand', model: 'TestModel', variant: '', category: 'mouse' },
    focusGroups: null,
    seedStatus: null,
    logger: createMockLogger(),
    runId: 'test-run',
    ...overrides,
  };
}

describe('Stage 03 Search Profile wrapper contract', { concurrency: false }, () => {
  it('returns only searchProfileBase and respects the configured query cap', () => {
    const result = runSearchProfile(makeBaseArgs());

    assert.deepEqual(Object.keys(result).sort(), ['searchProfileBase']);
    assert.ok(result.searchProfileBase, 'has searchProfileBase');
    assert.ok(Array.isArray(result.searchProfileBase.queries), 'queries array is returned');
    assert.ok(Array.isArray(result.searchProfileBase.query_rows), 'query_rows array is returned');
    assert.ok(Array.isArray(result.searchProfileBase.query_reject_log), 'query_reject_log array is returned');
    assert.ok(result.searchProfileBase.queries.length <= 1, 'queries should respect searchProfileQueryCap');
    assert.ok(result.searchProfileBase.query_rows.length <= 1, 'query_rows should respect searchProfileQueryCap');
  });
});
