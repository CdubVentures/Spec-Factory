// WHY: Contract tests for configurable tier ordering across ALL query tiers.
// The tierHierarchyOrder setting (CSV string) controls budget priority for
// all 5 query groups: brand_seeds, spec_seeds, source_seeds, group_searches, key_searches.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTier1Queries, buildSearchProfile, parseTierOrder } from '../queryBuilder.js';

function makeJob(overrides = {}) {
  return {
    productId: 'test-prod',
    brand: 'Razer',
    model: 'Viper V3 Pro',
    category: 'mouse',
    identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' },
    ...overrides,
  };
}

function makeSeedStatus(sourceHosts = []) {
  const source_seeds = {};
  for (const host of sourceHosts) {
    source_seeds[host] = { is_needed: true, last_status: 'never_run' };
  }
  return {
    specs_seed: { is_needed: true },
    brand_seed: { is_needed: true, brand_name: 'Razer' },
    source_seeds,
  };
}

const BRAND_RESOLUTION = {
  officialDomain: 'razer.com',
  aliases: ['razer.com'],
  supportDomain: '',
  confidence: 0.95,
  reasoning: [],
};

const TWO_SOURCES = ['rtings.com', 'techpowerup.com'];

function makeFocusGroups() {
  return [
    {
      key: 'sensor_performance',
      label: 'Sensor Performance',
      group_description_long: 'Sensor specs',
      group_search_worthy: true,
      productivity_score: 80,
      unresolved_field_keys: ['sensor_model', 'dpi'],
      normalized_key_queue: [],
    },
    {
      key: 'connectivity',
      label: 'Connectivity',
      group_description_long: 'Wireless specs',
      group_search_worthy: false,
      productivity_score: 40,
      unresolved_field_keys: ['polling_rate'],
      normalized_key_queue: ['polling_rate'],
    },
  ];
}

describe('parseTierOrder', () => {
  it('parses a valid CSV into an array of tier IDs', () => {
    const result = parseTierOrder('brand_seeds,spec_seeds,source_seeds');
    assert.deepEqual(result, ['brand_seeds', 'spec_seeds', 'source_seeds']);
  });

  it('accepts group_searches and key_searches', () => {
    const result = parseTierOrder('brand_seeds,group_searches,key_searches,spec_seeds,source_seeds');
    assert.deepEqual(result, ['brand_seeds', 'group_searches', 'key_searches', 'spec_seeds', 'source_seeds']);
  });

  it('filters out unknown tier IDs', () => {
    const result = parseTierOrder('brand_seeds,unknown_tier,source_seeds');
    assert.deepEqual(result, ['brand_seeds', 'source_seeds']);
  });

  it('falls back to default order for empty/null input', () => {
    const defaultOrder = ['brand_seeds', 'spec_seeds', 'source_seeds', 'group_searches', 'key_searches'];
    assert.deepEqual(parseTierOrder(''), defaultOrder);
    assert.deepEqual(parseTierOrder(null), defaultOrder);
    assert.deepEqual(parseTierOrder(undefined), defaultOrder);
  });

  it('deduplicates tier IDs', () => {
    const result = parseTierOrder('brand_seeds,brand_seeds,source_seeds');
    assert.deepEqual(result, ['brand_seeds', 'source_seeds']);
  });

  it('handles reversed order', () => {
    const result = parseTierOrder('key_searches,group_searches,source_seeds,spec_seeds,brand_seeds');
    assert.deepEqual(result, ['key_searches', 'group_searches', 'source_seeds', 'spec_seeds', 'brand_seeds']);
  });
});

describe('buildTier1Queries tier ordering via options', () => {
  it('default options produce same order as before (brand → spec → source)', () => {
    const seedStatus = makeSeedStatus(TWO_SOURCES);
    const rows = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION);

    const brandIdx = rows.findIndex(r => r.domain_hint === 'razer.com');
    const specIdx = rows.findIndex(r => r.query.includes('specifications'));
    const sourceIdx = rows.findIndex(r => r.domain_hint === 'rtings.com');

    assert.ok(brandIdx >= 0, 'brand query present');
    assert.ok(specIdx >= 0, 'spec query present');
    assert.ok(sourceIdx >= 0, 'source query present');
    assert.ok(brandIdx < specIdx, 'brand before spec');
    assert.ok(specIdx < sourceIdx, 'spec before source');
  });

  it('reversed tier order puts source_seeds first', () => {
    const seedStatus = makeSeedStatus(TWO_SOURCES);
    const tierOrder = ['source_seeds', 'spec_seeds', 'brand_seeds'];
    const rows = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION, { tierOrder });

    const brandIdx = rows.findIndex(r => r.domain_hint === 'razer.com');
    const specIdx = rows.findIndex(r => r.query.includes('specifications'));
    const sourceIdx = rows.findIndex(r => r.domain_hint === 'rtings.com');

    assert.ok(sourceIdx < specIdx, `source (${sourceIdx}) before spec (${specIdx})`);
    assert.ok(specIdx < brandIdx, `spec (${specIdx}) before brand (${brandIdx})`);
  });

  it('omitting a tier from tierOrder skips those queries', () => {
    const seedStatus = makeSeedStatus(TWO_SOURCES);
    const tierOrder = ['brand_seeds', 'source_seeds'];
    const rows = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION, { tierOrder });

    const specRows = rows.filter(r => r.query.includes('specifications'));
    assert.equal(specRows.length, 0, 'no spec seed queries when omitted from tierOrder');
    assert.ok(rows.length > 0, 'still has brand + source queries');
  });

  it('backward compatible: no options param produces default behavior', () => {
    const seedStatus = makeSeedStatus(TWO_SOURCES);
    const withOptions = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION, {});
    const withoutOptions = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION);

    assert.equal(withOptions.length, withoutOptions.length);
    assert.deepEqual(
      withOptions.map(r => r.query),
      withoutOptions.map(r => r.query),
    );
  });
});

describe('buildSearchProfile full hierarchy ordering', () => {
  it('default order: tier1 seeds before groups before keys', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 24,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(TWO_SOURCES),
      focusGroups: makeFocusGroups(),
    });
    const rows = profile.query_rows;
    const seedRows = rows.filter(r => r.tier === 'seed');
    const groupRows = rows.filter(r => r.tier === 'group_search');
    const keyRows = rows.filter(r => r.tier === 'key_search');

    assert.ok(seedRows.length > 0, 'has seed rows');
    assert.ok(groupRows.length > 0, 'has group rows');
    assert.ok(keyRows.length > 0, 'has key rows');

    const lastSeedIdx = Math.max(...seedRows.map(r => rows.indexOf(r)));
    const firstGroupIdx = Math.min(...groupRows.map(r => rows.indexOf(r)));
    const firstKeyIdx = Math.min(...keyRows.map(r => rows.indexOf(r)));

    assert.ok(lastSeedIdx < firstGroupIdx, 'seeds before groups');
    assert.ok(firstGroupIdx < firstKeyIdx, 'groups before keys');
  });

  it('group_searches before seeds when hierarchy places them first', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 24,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(TWO_SOURCES),
      focusGroups: makeFocusGroups(),
      tierHierarchyOrder: 'group_searches,brand_seeds,spec_seeds,source_seeds,key_searches',
    });
    const rows = profile.query_rows;
    const groupRows = rows.filter(r => r.tier === 'group_search');
    const seedRows = rows.filter(r => r.tier === 'seed');

    assert.ok(groupRows.length > 0, 'has group rows');
    assert.ok(seedRows.length > 0, 'has seed rows');

    const lastGroupIdx = Math.max(...groupRows.map(r => rows.indexOf(r)));
    const firstSeedIdx = Math.min(...seedRows.map(r => rows.indexOf(r)));
    assert.ok(lastGroupIdx < firstSeedIdx, `groups (last=${lastGroupIdx}) before seeds (first=${firstSeedIdx})`);
  });

  it('omitting group_searches and key_searches from hierarchy skips them', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 24,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(TWO_SOURCES),
      focusGroups: makeFocusGroups(),
      tierHierarchyOrder: 'brand_seeds,spec_seeds,source_seeds',
    });
    const rows = profile.query_rows;
    const groupRows = rows.filter(r => r.tier === 'group_search');
    const keyRows = rows.filter(r => r.tier === 'key_search');

    assert.equal(groupRows.length, 0, 'no group rows when omitted');
    assert.equal(keyRows.length, 0, 'no key rows when omitted');
  });

  it('budget cap applies across all tiers in hierarchy order', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 5,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(['rtings.com', 'techpowerup.com', 'tomshardware.com', 'lttlabs.com']),
      focusGroups: makeFocusGroups(),
    });

    assert.ok(profile.queries.length <= 5, `queries (${profile.queries.length}) must respect budget cap of 5`);
  });
});
