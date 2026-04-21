// WHY: Per-tier budget floors. Production MM731 runs showed 10 seeds consumed
// the entire searchProfileQueryCap=10, so buildTier2Queries and buildTier3Queries
// emitted zero rows. The fix: each tier has its own cap (tier1SeedCap /
// tier2GroupCap / tier3KeyCap), and when the overall cap (searchProfileQueryCap)
// is smaller than the sum, truncation preserves at least 1 slot per tier that
// has eligible rows — so tier 2 and 3 always get to fire.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchProfile } from '../queryBuilder.js';

const BRAND_RESOLUTION = {
  officialDomain: 'razer.com',
  supportDomain: '',
  aliases: ['razer.com'],
  confidence: 0.95,
  reasoning: [],
};

function makeJob() {
  return {
    productId: 'mouse-test',
    brand: 'Razer',
    base_model: 'Viper V3 Pro',
    model: 'Viper V3 Pro',
    category: 'mouse',
    identityLock: { brand: 'Razer', base_model: 'Viper V3 Pro', model: 'Viper V3 Pro', variant: '' },
  };
}

function makeSeedStatus(sourceHosts) {
  const source_seeds = {};
  for (const host of sourceHosts) source_seeds[host] = { is_needed: true };
  return {
    specs_seed: { is_needed: true },
    brand_seed: { is_needed: true, brand_name: 'Razer' },
    source_seeds,
  };
}

function makeWorthyGroup(key, extra = {}) {
  return {
    key,
    label: key,
    group_description_long: `${key} fields`,
    group_search_worthy: true,
    productivity_score: 80,
    unresolved_field_keys: ['a', 'b', 'c'],
    normalized_key_queue: [],
    ...extra,
  };
}

function makeKeyGroup(key, keys) {
  return {
    key,
    label: key,
    group_description_long: `${key} fields`,
    group_search_worthy: false,
    productivity_score: 30,
    unresolved_field_keys: keys,
    normalized_key_queue: keys,
  };
}

describe('buildSearchProfile — per-tier budget floors', () => {
  it('tier1SeedCap=3 limits seed rows to 3 even when more are available', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 100,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(['rtings.com', 'techpowerup.com', 'tomshardware.com', 'lttlabs.com', 'igorslab.de']),
      focusGroups: [],
      tier1SeedCap: 3,
      tier2GroupCap: 10,
      tier3KeyCap: 10,
    });
    const seedRows = profile.query_rows.filter((r) => r.tier === 'seed');
    assert.equal(seedRows.length, 3, `tier1SeedCap=3 must emit exactly 3 seed rows, got ${seedRows.length}`);
  });

  it('tier2GroupCap=2 limits group_search rows to 2 when 5 worthy groups are available', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 100,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus([]),
      focusGroups: [
        makeWorthyGroup('g1'),
        makeWorthyGroup('g2'),
        makeWorthyGroup('g3'),
        makeWorthyGroup('g4'),
        makeWorthyGroup('g5'),
      ],
      tier1SeedCap: 0,
      tier2GroupCap: 2,
      tier3KeyCap: 10,
    });
    const groupRows = profile.query_rows.filter((r) => r.tier === 'group_search');
    assert.equal(groupRows.length, 2, `tier2GroupCap=2 must emit exactly 2 group rows, got ${groupRows.length}`);
  });

  it('tier3KeyCap=4 limits key_search rows to 4 when more are available', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 100,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus([]),
      focusGroups: [
        makeKeyGroup('ka', ['k1', 'k2', 'k3']),
        makeKeyGroup('kb', ['k4', 'k5', 'k6']),
      ],
      tier1SeedCap: 0,
      tier2GroupCap: 0,
      tier3KeyCap: 4,
    });
    const keyRows = profile.query_rows.filter((r) => r.tier === 'key_search');
    assert.equal(keyRows.length, 4, `tier3KeyCap=4 must emit exactly 4 key rows, got ${keyRows.length}`);
  });

  it('starvation regression: seeds fill their cap, tier 2 and 3 still emit their own budgets', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 100,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(['rtings.com', 'techpowerup.com', 'tomshardware.com', 'lttlabs.com', 'igorslab.de', 'aphnetworks.com', 'eloshapes.com', 'pcgamer.com']),
      focusGroups: [
        makeWorthyGroup('sensor_performance'),
        makeKeyGroup('connectivity', ['polling_rate', 'wireless_type']),
      ],
      tier1SeedCap: 10,
      tier2GroupCap: 5,
      tier3KeyCap: 5,
    });
    const rows = profile.query_rows;
    const seedRows = rows.filter((r) => r.tier === 'seed');
    const groupRows = rows.filter((r) => r.tier === 'group_search');
    const keyRows = rows.filter((r) => r.tier === 'key_search');
    assert.ok(seedRows.length > 0, 'seeds must emit');
    assert.ok(groupRows.length > 0, 'tier 2 group_search must emit when worthy groups exist');
    assert.ok(keyRows.length > 0, 'tier 3 key_search must emit when non-worthy groups with keys exist');
  });

  it('searchProfileQueryCap=6 with per-tier caps summing to 20 preserves ≥1 slot per tier', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 6,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(['rtings.com', 'techpowerup.com', 'tomshardware.com', 'lttlabs.com', 'igorslab.de']),
      focusGroups: [
        makeWorthyGroup('g1'),
        makeWorthyGroup('g2'),
        makeKeyGroup('keys', ['k1', 'k2', 'k3']),
      ],
      tier1SeedCap: 10,
      tier2GroupCap: 5,
      tier3KeyCap: 5,
    });
    const rows = profile.query_rows;
    const seedRows = rows.filter((r) => r.tier === 'seed');
    const groupRows = rows.filter((r) => r.tier === 'group_search');
    const keyRows = rows.filter((r) => r.tier === 'key_search');
    assert.ok(rows.length <= 6, `total rows ${rows.length} must respect maxQueries=6`);
    assert.ok(seedRows.length >= 1, 'seed tier must retain ≥1 slot');
    assert.ok(groupRows.length >= 1, 'group tier must retain ≥1 slot');
    assert.ok(keyRows.length >= 1, 'key tier must retain ≥1 slot');
  });

  it('all caps=0 emits 0 rows (tier-level disable), no crash', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 100,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(['rtings.com']),
      focusGroups: [makeWorthyGroup('g1'), makeKeyGroup('k', ['k1'])],
      tier1SeedCap: 0,
      tier2GroupCap: 0,
      tier3KeyCap: 0,
    });
    const rows = profile.query_rows;
    assert.equal(rows.length, 0, `all caps=0 must emit 0 rows, got ${rows.length}`);
  });

  it('backward compatible: omitting per-tier caps keeps today behavior (shared maxQueries cap)', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: { category: 'mouse', fieldOrder: [] },
      missingFields: [],
      maxQueries: 3,
      brandResolution: BRAND_RESOLUTION,
      seedStatus: makeSeedStatus(['rtings.com', 'techpowerup.com', 'tomshardware.com']),
      focusGroups: [],
    });
    assert.ok(profile.query_rows.length <= 3, 'maxQueries=3 must still cap when per-tier caps not provided');
  });
});
