// WHY: Brand domain queries must come FIRST in Tier 1, matching the priority
// defined in computeTierAllocation (brand → specs → sources). With a default
// searchProfileQueryCap of 10, brand queries were getting budget-capped because
// they were added LAST after specs_seed and source_seeds filled all 10 slots.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTier1Queries, buildSearchProfile } from '../queryBuilder.js';

function makeJob(overrides = {}) {
  return {
    productId: 'test-prod',
    brand: 'Lenovo',
    base_model: 'Legion M600 Wireless',
    model: 'Legion M600 Wireless',
    category: 'mouse',
    identityLock: { brand: 'Lenovo', base_model: 'Legion M600 Wireless', model: 'Legion M600 Wireless', variant: '' },
    ...overrides,
  };
}

function makeSeedStatus(sourceHosts = []) {
  const source_seeds = {};
  for (const host of sourceHosts) {
    source_seeds[host] = { is_needed: true };
  }
  return {
    specs_seed: { is_needed: true },
    brand_seed: { is_needed: true, brand_name: 'Lenovo' },
    source_seeds,
  };
}

const NINE_SOURCE_HOSTS = [
  'rtings.com', 'techpowerup.com', 'tomshardware.com',
  'lttlabs.com', 'igorslab.de', 'techgearlab.com',
  'pcpartpicker.com', 'reddit.com', 'eloshapes.com',
];

const BRAND_RESOLUTION = {
  officialDomain: 'lenovo.com',
  aliases: ['lenovo.com'],
  supportDomain: 'support.lenovo.com',
  confidence: 0.95,
  reasoning: [],
};

describe('buildTier1Queries brand domain priority', () => {
  it('brand domain queries come BEFORE specs_seed and source_seeds', () => {
    const seedStatus = makeSeedStatus(NINE_SOURCE_HOSTS);
    const rows = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION);

    const brandIndex = rows.findIndex(r => r.domain_hint === 'lenovo.com');
    const specsIndex = rows.findIndex(r => r.query.includes('specifications'));
    const firstSourceIndex = rows.findIndex(r => r.domain_hint === 'rtings.com');

    assert.ok(brandIndex >= 0, 'brand domain query must be present');
    assert.ok(brandIndex < specsIndex, `brand (${brandIndex}) must come before specs_seed (${specsIndex})`);
    assert.ok(brandIndex < firstSourceIndex, `brand (${brandIndex}) must come before source_seeds (${firstSourceIndex})`);
  });

  it('support domain query comes right after official domain', () => {
    const seedStatus = makeSeedStatus(NINE_SOURCE_HOSTS);
    const rows = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION);

    const officialIndex = rows.findIndex(r => r.domain_hint === 'lenovo.com');
    const supportIndex = rows.findIndex(r => r.domain_hint === 'support.lenovo.com');

    assert.ok(officialIndex >= 0, 'official domain query must be present');
    assert.ok(supportIndex >= 0, 'support domain query must be present');
    assert.equal(supportIndex, officialIndex + 1, 'support domain must immediately follow official domain');
  });

  it('brand domain query is the very first row when brand resolution succeeds', () => {
    const seedStatus = makeSeedStatus(NINE_SOURCE_HOSTS);
    const rows = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION);

    assert.equal(rows[0].domain_hint, 'lenovo.com', 'first query must be the brand domain');
    assert.ok(rows[0].query.includes('lenovo.com'), 'first query text must include the brand domain');
  });
});

describe('buildSearchProfile brand domain survives budget cap', () => {
  it('brand domain query survives a 10-query cap with 9 source seeds', () => {
    const seedStatus = makeSeedStatus(NINE_SOURCE_HOSTS);
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 10,
      brandResolution: BRAND_RESOLUTION,
      seedStatus,
      focusGroups: [],
    });

    const brandQuery = profile.queries.find(q => q.includes('lenovo.com'));
    assert.ok(brandQuery, `brand domain query must survive the 10-query cap. Got: ${JSON.stringify(profile.queries)}`);
  });

  it('brand domain query is first in the bounded query list', () => {
    const seedStatus = makeSeedStatus(NINE_SOURCE_HOSTS);
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 10,
      brandResolution: BRAND_RESOLUTION,
      seedStatus,
      focusGroups: [],
    });

    assert.ok(profile.queries[0].includes('lenovo.com'),
      `first query must be the brand domain. Got: ${profile.queries[0]}`);
  });

  it('brand domain dedupes against source_seeds that share the same host', () => {
    // Edge case: if lenovo.com is already in source_seeds, don't emit twice
    const sourceHosts = ['lenovo.com', ...NINE_SOURCE_HOSTS.slice(0, 8)];
    const seedStatus = makeSeedStatus(sourceHosts);
    const rows = buildTier1Queries(makeJob(), seedStatus, BRAND_RESOLUTION);

    const lenovoRows = rows.filter(r => r.domain_hint === 'lenovo.com');
    assert.equal(lenovoRows.length, 1, 'lenovo.com must appear exactly once (deduped)');
    // The brand domain version should win (comes first now)
    assert.equal(rows[0].domain_hint, 'lenovo.com');
  });

  it('no brand queries when brandResolution is null', () => {
    const seedStatus = makeSeedStatus(NINE_SOURCE_HOSTS);
    const rows = buildTier1Queries(makeJob(), seedStatus, null);

    const brandRows = rows.filter(r => r.domain_hint === 'lenovo.com');
    assert.equal(brandRows.length, 0, 'no brand queries without resolution');
    assert.ok(rows[0].query.includes('specifications'), 'specs_seed is first when no brand');
  });
});
