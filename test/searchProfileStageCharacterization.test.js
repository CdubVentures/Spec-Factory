// WHY: Characterization tests for Search Profile (Stage 03) before Phase 4 refactoring.
// Locks down: return shape, deterministic-only queries, focusGroups null fallback,
// dead negative_terms field, and tier data flow.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSearchProfile } from '../src/features/indexing/discovery/stages/searchProfile.js';

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

function makeSearchProfileCaps() {
  return {
    llmAliasValidationCap: 12,
    llmFieldTargetQueriesCap: 3,
    llmDocHintQueriesCap: 3,
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
    searchProfileCaps: makeSearchProfileCaps(),
    variables: { brand: 'TestBrand', model: 'TestModel', variant: '', category: 'mouse' },
    focusGroups: null,
    seedStatus: null,
    logger: createMockLogger(),
    runId: 'test-run',
    ...overrides,
  };
}

describe('Stage 03 Search Profile — Characterization', { concurrency: false }, () => {

  it('#1 returns expected shape { searchProfileBase }', () => {
    const result = runSearchProfile(makeBaseArgs());

    assert.ok(result.searchProfileBase, 'has searchProfileBase');
    assert.ok(Array.isArray(result.searchProfileBase.queries), 'has queries array');
    assert.ok(Array.isArray(result.searchProfileBase.query_rows), 'has query_rows array');
  });

  it('#2 all queries are deterministic — no hint_source contains llm', () => {
    const result = runSearchProfile(makeBaseArgs());

    for (const row of result.searchProfileBase.query_rows) {
      const source = String(row.hint_source || '');
      assert.ok(!source.includes('llm'), `hint_source "${source}" should not contain llm`);
    }
  });

  it('#3 focusGroups null → legacy archetype fallback, no crash', () => {
    const result = runSearchProfile(makeBaseArgs({ focusGroups: null, seedStatus: null }));

    assert.ok(result.searchProfileBase, 'returns valid profile');
    assert.ok(result.searchProfileBase.queries.length >= 0, 'has queries (may be 0 with minimal config)');
  });

  it('#4 negative_terms removed from output (dead code deleted)', () => {
    const result = runSearchProfile(makeBaseArgs());
    assert.equal('negative_terms' in result.searchProfileBase, false, 'negative_terms should not exist');
  });

  it('#5 tier data flows through when focusGroups has worthy groups', () => {
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
      {
        key: 'physical',
        label: 'Physical',
        group_description_long: 'Weight and dimensions',
        group_search_worthy: false,
        productivity_score: 40,
        unresolved_field_keys: ['weight'],
        normalized_key_queue: [
          { normalized_key: 'weight', repeat_count: 0, all_aliases: [], alias_shards: [], domain_hints: [], preferred_content_types: [], domains_tried_for_key: [], content_types_tried_for_key: [] },
        ],
      },
    ];
    const seedStatus = { specs_seed: { is_needed: true }, source_seeds: {} };

    const result = runSearchProfile(makeBaseArgs({ focusGroups, seedStatus }));
    const rows = result.searchProfileBase.query_rows;

    const tier1Rows = rows.filter((r) => r.tier === 'seed');
    const tier2Rows = rows.filter((r) => r.tier === 'group_search');
    const tier3Rows = rows.filter((r) => r.tier === 'key_search');

    assert.ok(tier1Rows.length > 0, 'should have tier1 seed queries');
    assert.ok(tier2Rows.length > 0, 'should have tier2 group queries');
    assert.ok(tier3Rows.length > 0, 'should have tier3 key queries');
  });

  it('#6 does not crash when searchProfileCaps is null', () => {
    assert.doesNotThrow(() => runSearchProfile(makeBaseArgs({ searchProfileCaps: null })));
  });

  it('#7 does not crash when searchProfileCaps is undefined', () => {
    assert.doesNotThrow(() => runSearchProfile(makeBaseArgs({ searchProfileCaps: undefined })));
  });
});
