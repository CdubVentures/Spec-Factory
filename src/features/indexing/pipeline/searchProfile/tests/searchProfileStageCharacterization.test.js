// WHY: Contract tests for the runSearchProfile wrapper. Query construction details
// belong to buildSearchProfile tests; this file only protects the wrapper boundary.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSearchProfile } from '../runSearchProfile.js';

function createMockLogger() {
  const calls = { info: [], warn: [], debug: [] };
  return {
    info: (event, payload) => calls.info.push({ event, payload }),
    warn: (event, payload) => calls.warn.push({ event, payload }),
    debug: (event, payload) => calls.debug.push({ event, payload }),
    calls,
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
    config: { searchProfileQueryCap: 10, searchEngines: 'bing,google' },
    variables: { brand: 'TestBrand', model: 'TestModel', variant: '', category: 'mouse' },
    focusGroups: null,
    seedStatus: null,
    logger: createMockLogger(),
    runId: 'test-run',
    ...overrides,
  };
}

describe('Stage 03 Search Profile wrapper contract', { concurrency: false }, () => {
  it('returns searchProfileBase and emits the planned profile event', () => {
    const logger = createMockLogger();
    const result = runSearchProfile(makeBaseArgs({ logger }));

    assert.ok(result.searchProfileBase, 'has searchProfileBase');
    assert.ok(Array.isArray(result.searchProfileBase.queries), 'queries array is returned');
    assert.ok(Array.isArray(result.searchProfileBase.query_rows), 'query_rows array is returned');

    const emitted = logger.calls.info.find((call) => call.event === 'search_profile_generated');
    assert.ok(emitted, 'search_profile_generated should be emitted');
    assert.equal(emitted.payload.run_id, 'test-run');
    assert.equal(emitted.payload.category, 'mouse');
    assert.equal(emitted.payload.product_id, 'test-prod');
    assert.equal(emitted.payload.source, 'deterministic');
    assert.equal(emitted.payload.query_count, result.searchProfileBase.queries.length);
    assert.equal(emitted.payload.alias_count, result.searchProfileBase.identity_aliases.length);
    assert.equal(emitted.payload.query_rows.length, result.searchProfileBase.query_rows.length);
  });

  it('warns with the fallback reason when focus groups are missing', () => {
    const logger = createMockLogger();

    const result = runSearchProfile(makeBaseArgs({
      focusGroups: null,
      seedStatus: null,
      logger,
    }));

    assert.ok(result.searchProfileBase, 'returns a profile when focus groups are missing');
    assert.deepEqual(logger.calls.warn, [
      {
        event: 'search_profile_tier_fallback',
        payload: { reason: 'focusGroups_null' },
      },
    ]);
  });

  it('does not emit the fallback warning when focus groups are present', () => {
    const logger = createMockLogger();
    const focusGroups = [
      {
        key: 'sensor_performance',
        label: 'Sensor Performance',
        group_description_long: 'Sensor specs and tracking performance',
        group_search_worthy: true,
        productivity_score: 80,
        unresolved_field_keys: ['sensor_model', 'dpi'],
        normalized_key_queue: [],
      },
    ];
    const seedStatus = { specs_seed: { is_needed: true }, source_seeds: {} };

    const result = runSearchProfile(makeBaseArgs({ focusGroups, seedStatus, logger }));

    assert.ok(result.searchProfileBase, 'returns a profile when focus groups are provided');
    assert.deepEqual(logger.calls.warn, []);
  });
});
