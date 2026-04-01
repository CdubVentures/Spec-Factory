import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchProfile,
  determineQueryModes,
  buildTier1Queries,
  buildTier2Queries,
  buildTier3Queries,
  makeJob,
  makeCategoryConfig,
  makeSeedStatus,
  makeFocusGroup,
} from './helpers/searchProfileHarness.js';

describe('Phase 02 - determineQueryModes', () => {
  it('returns runTier1Seeds=true when specs_seed.is_needed', () => {
    const modes = determineQueryModes(
      makeSeedStatus({ specs_seed: { is_needed: true } }),
      [],
    );
    assert.equal(modes.runTier1Seeds, true);
    assert.equal(modes.runTier2Groups, false);
    assert.equal(modes.runTier3Keys, false);
  });

  it('returns runTier1Seeds=true when any source seed is_needed', () => {
    const modes = determineQueryModes(
      makeSeedStatus({
        source_seeds: {
          'razer.com': { is_needed: true },
          'rtings.com': { is_needed: false },
        },
      }),
      [],
    );
    assert.equal(modes.runTier1Seeds, true);
  });

  it('returns runTier1Seeds=false when no seeds needed', () => {
    const modes = determineQueryModes(
      makeSeedStatus({ specs_seed: { is_needed: false } }),
      [],
    );
    assert.equal(modes.runTier1Seeds, false);
  });

  it('returns runTier2Groups=true when any group has group_search_worthy=true', () => {
    const modes = determineQueryModes(
      makeSeedStatus(),
      [makeFocusGroup({ group_search_worthy: true })],
    );
    assert.equal(modes.runTier2Groups, true);
  });

  it('returns runTier2Groups=false when no group has group_search_worthy=true', () => {
    const modes = determineQueryModes(
      makeSeedStatus(),
      [makeFocusGroup({ group_search_worthy: false, normalized_key_queue: ['a'] })],
    );
    assert.equal(modes.runTier2Groups, false);
  });

  it('returns runTier3Keys=true when any group has group_search_worthy=false with unresolved keys', () => {
    const modes = determineQueryModes(
      makeSeedStatus(),
      [makeFocusGroup({ group_search_worthy: false, normalized_key_queue: ['length', 'width'] })],
    );
    assert.equal(modes.runTier3Keys, true);
  });

  it('returns runTier3Keys=false when groups have empty key queues', () => {
    const modes = determineQueryModes(
      makeSeedStatus(),
      [makeFocusGroup({ group_search_worthy: false, normalized_key_queue: [] })],
    );
    assert.equal(modes.runTier3Keys, false);
  });

  it('all three tiers can be true simultaneously', () => {
    const modes = determineQueryModes(
      makeSeedStatus({ specs_seed: { is_needed: true } }),
      [
        makeFocusGroup({ key: 'g1', group_search_worthy: true }),
        makeFocusGroup({ key: 'g2', group_search_worthy: false, normalized_key_queue: ['a'] }),
      ],
    );
    assert.equal(modes.runTier1Seeds, true);
    assert.equal(modes.runTier2Groups, true);
    assert.equal(modes.runTier3Keys, true);
  });

  it('handles null seedStatus gracefully', () => {
    const modes = determineQueryModes(null, []);
    assert.equal(modes.runTier1Seeds, false);
    assert.equal(modes.runTier2Groups, false);
    assert.equal(modes.runTier3Keys, false);
  });

  it('handles undefined focusGroups gracefully', () => {
    const modes = determineQueryModes(makeSeedStatus(), undefined);
    assert.equal(modes.runTier1Seeds, false);
    assert.equal(modes.runTier2Groups, false);
    assert.equal(modes.runTier3Keys, false);
  });
});

describe('Phase 02 - buildTier1Queries', () => {
  it('emits specs seed query when specs_seed.is_needed', () => {
    const rows = buildTier1Queries(
      makeJob(),
      makeSeedStatus({ specs_seed: { is_needed: true } }),
      null,
    );
    assert.ok(rows.length >= 1);
    const specsRow = rows.find((row) => row.query.includes('specifications'));
    assert.ok(specsRow);
    assert.equal(specsRow.hint_source, 'tier1_seed');
    assert.equal(specsRow.tier, 'seed');
  });

  it('emits source seed queries for each needed source', () => {
    const rows = buildTier1Queries(
      makeJob(),
      makeSeedStatus({
        source_seeds: {
          'razer.com': { is_needed: true },
          'rtings.com': { is_needed: true },
          'amazon.com': { is_needed: false },
        },
      }),
      null,
    );
    const sourceRows = rows.filter((row) => !row.query.includes('specifications'));
    assert.ok(sourceRows.length >= 2);
    assert.ok(rows.some((row) => row.query.includes('razer.com')));
    assert.ok(rows.some((row) => row.query.includes('rtings.com')));
    assert.ok(!rows.some((row) => row.query.includes('amazon.com')));
  });

  it('returns empty array when no seeds needed', () => {
    const rows = buildTier1Queries(
      makeJob(),
      makeSeedStatus({ specs_seed: { is_needed: false } }),
      null,
    );
    assert.equal(rows.length, 0);
  });

  it('includes brand model variant in query string', () => {
    const rows = buildTier1Queries(
      makeJob({ identityLock: { brand: 'Logitech', model: 'G Pro X', variant: 'Superlight 2' } }),
      makeSeedStatus({ specs_seed: { is_needed: true } }),
      null,
    );
    const specsRow = rows.find((row) => row.query.includes('specifications'));
    assert.ok(specsRow.query.includes('Logitech'));
    assert.ok(specsRow.query.includes('G Pro X'));
    assert.ok(specsRow.query.includes('Superlight 2'));
  });

  it('all rows tagged with tier1_seed and seed tier', () => {
    const rows = buildTier1Queries(
      makeJob(),
      makeSeedStatus({
        specs_seed: { is_needed: true },
        source_seeds: { 'razer.com': { is_needed: true } },
      }),
      null,
    );
    assert.ok(rows.length >= 2);
    assert.ok(rows.every((row) => row.hint_source === 'tier1_seed'));
    assert.ok(rows.every((row) => row.tier === 'seed'));
  });
});

describe('Phase 02 - buildTier2Queries', () => {
  it('emits one query per group_search_worthy group', () => {
    const groups = [
      makeFocusGroup({ key: 'dimensions', group_search_worthy: true }),
      makeFocusGroup({ key: 'performance', label: 'Performance', group_search_worthy: true, group_description_long: 'performance metrics response' }),
      makeFocusGroup({ key: 'connectivity', group_search_worthy: false }),
    ];
    const rows = buildTier2Queries(makeJob(), groups);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => row.hint_source === 'tier2_group'));
    assert.ok(rows.every((row) => row.tier === 'group_search'));
  });

  it('includes group_key in each row', () => {
    const rows = buildTier2Queries(makeJob(), [
      makeFocusGroup({ key: 'dimensions', group_search_worthy: true }),
    ]);
    assert.equal(rows[0].group_key, 'dimensions');
  });

  it('sorts output by productivity_score descending', () => {
    const groups = [
      makeFocusGroup({ key: 'low', productivity_score: 10, group_search_worthy: true }),
      makeFocusGroup({ key: 'high', productivity_score: 90, group_search_worthy: true }),
      makeFocusGroup({ key: 'mid', productivity_score: 50, group_search_worthy: true }),
    ];
    const rows = buildTier2Queries(makeJob(), groups);
    assert.equal(rows[0].group_key, 'high');
    assert.equal(rows[1].group_key, 'mid');
    assert.equal(rows[2].group_key, 'low');
  });

  it('returns empty array when no groups are search-worthy', () => {
    const rows = buildTier2Queries(makeJob(), [
      makeFocusGroup({ group_search_worthy: false }),
    ]);
    assert.equal(rows.length, 0);
  });

  it('query includes brand model label and group_description_long', () => {
    const groups = [
      makeFocusGroup({
        key: 'dimensions',
        label: 'Dimensions',
        group_search_worthy: true,
        group_description_long: 'physical dimensions length width height',
      }),
    ];
    const rows = buildTier2Queries(
      makeJob({ identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' } }),
      groups,
    );
    assert.ok(rows[0].query.includes('Razer'));
    assert.ok(rows[0].query.includes('Viper V3 Pro'));
    assert.ok(rows[0].query.includes('Dimensions'));
    assert.ok(rows[0].query.includes('physical dimensions'));
  });
});

describe('Phase 02 - buildTier3Queries', () => {
  it('emits queries for groups with group_search_worthy=false and unresolved keys', () => {
    const groups = [
      makeFocusGroup({
        key: 'dimensions',
        group_search_worthy: false,
        normalized_key_queue: ['length', 'width', 'height'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.hint_source === 'tier3_key'));
    assert.ok(rows.every((row) => row.tier === 'key_search'));
  });

  it('skips groups where group_search_worthy=true', () => {
    const groups = [
      makeFocusGroup({
        key: 'dimensions',
        group_search_worthy: true,
        normalized_key_queue: ['length', 'width'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 0);
  });

  it('includes normalized_key and group_key in each row', () => {
    const groups = [
      makeFocusGroup({
        key: 'sensor_perf',
        group_search_worthy: false,
        normalized_key_queue: ['sensor'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.ok(rows.length >= 1);
    assert.equal(rows[0].group_key, 'sensor_perf');
    assert.equal(rows[0].normalized_key, 'sensor');
  });

  it('preserves normalized_key_queue order', () => {
    const groups = [
      makeFocusGroup({
        key: 'dims',
        group_search_worthy: false,
        normalized_key_queue: ['alpha', 'beta', 'gamma'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.deepEqual(rows.map((row) => row.normalized_key), ['alpha', 'beta', 'gamma']);
  });

  it('query includes brand model variant and normalized_key', () => {
    const groups = [
      makeFocusGroup({
        key: 'sensor_perf',
        group_search_worthy: false,
        normalized_key_queue: ['sensor'],
      }),
    ];
    const rows = buildTier3Queries(
      makeJob({ identityLock: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' } }),
      groups,
      makeCategoryConfig(),
      null,
    );
    assert.ok(rows[0].query.includes('Razer'));
    assert.ok(rows[0].query.includes('Viper V3 Pro'));
    assert.ok(rows[0].query.includes('sensor'));
  });

  it('returns empty array when no unresolved keys', () => {
    const rows = buildTier3Queries(makeJob(), [
      makeFocusGroup({
        group_search_worthy: false,
        normalized_key_queue: [],
      }),
    ], makeCategoryConfig(), null);
    assert.equal(rows.length, 0);
  });

  it('target_fields includes the normalized_key', () => {
    const groups = [
      makeFocusGroup({
        key: 'sensor_perf',
        group_search_worthy: false,
        normalized_key_queue: ['weight', 'sensor'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.deepEqual(rows[0].target_fields, ['weight']);
    assert.deepEqual(rows[1].target_fields, ['sensor']);
  });
});

describe('Phase 02 - buildTier3Queries progressive enrichment', () => {
  it('repeat_count 0: bare query with just product + key', () => {
    const groups = [
      makeFocusGroup({
        key: 'connectivity',
        group_search_worthy: false,
        normalized_key_queue: [
          { normalized_key: 'battery hours', repeat_count: 0, all_aliases: ['battery life'], domain_hints: ['rtings.com'], preferred_content_types: ['review'], domains_tried_for_key: [] },
        ],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].query.includes('battery hours'));
    assert.ok(!rows[0].query.includes('battery life'));
    assert.ok(!rows[0].query.includes('rtings.com'));
  });

  it('repeat_count 1: adds aliases to query', () => {
    const groups = [
      makeFocusGroup({
        key: 'connectivity',
        group_search_worthy: false,
        normalized_key_queue: [
          { normalized_key: 'battery hours', repeat_count: 1, all_aliases: ['battery life', 'battery runtime'], domain_hints: ['rtings.com'], preferred_content_types: ['review'], domains_tried_for_key: [] },
        ],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].query.includes('battery life') || rows[0].query.includes('battery runtime'));
  });

  it('repeat_count 2: adds domain hints to query', () => {
    const groups = [
      makeFocusGroup({
        key: 'connectivity',
        group_search_worthy: false,
        normalized_key_queue: [
          { normalized_key: 'battery hours', repeat_count: 2, all_aliases: ['battery life'], domain_hints: ['rtings.com', 'mousespecs.org'], preferred_content_types: ['review'], domains_tried_for_key: ['rtings.com'] },
        ],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].query.includes('mousespecs.org') || rows[0].query.includes('rtings.com'));
  });

  it('repeat_count 3+: adds content type hints', () => {
    const groups = [
      makeFocusGroup({
        key: 'connectivity',
        group_search_worthy: false,
        normalized_key_queue: [
          { normalized_key: 'battery hours', repeat_count: 3, all_aliases: ['battery life'], domain_hints: ['rtings.com'], preferred_content_types: ['review', 'spec sheet'], domains_tried_for_key: ['rtings.com'] },
        ],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].query.includes('review') || rows[0].query.includes('spec sheet'));
  });

  it('backward compat: plain string keys still work', () => {
    const groups = [
      makeFocusGroup({
        key: 'g1',
        group_search_worthy: false,
        normalized_key_queue: ['weight', 'sensor'],
      }),
    ];
    const rows = buildTier3Queries(makeJob(), groups, makeCategoryConfig(), null);
    assert.equal(rows.length, 2);
    assert.ok(rows[0].query.includes('weight'));
    assert.ok(rows[1].query.includes('sensor'));
  });
});

describe('Phase 02 - Tier-Aware buildSearchProfile Integration', () => {
  it('tier1-only: emits seed queries when seedStatus has specs_seed.is_needed', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
      seedStatus: makeSeedStatus({ specs_seed: { is_needed: true } }),
      focusGroups: [],
    });

    assert.ok(profile.queries.length > 0);
    assert.ok(profile.query_rows.filter((row) => row.tier === 'seed').length > 0);
  });

  it('tier2-only: emits group queries when groups are search-worthy', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
      seedStatus: makeSeedStatus(),
      focusGroups: [
        makeFocusGroup({ key: 'dims', group_search_worthy: true, productivity_score: 80 }),
      ],
    });

    assert.ok(profile.queries.length > 0);
    assert.ok(profile.query_rows.filter((row) => row.tier === 'group_search').length > 0);
  });

  it('mixed tier2+tier3: emits both group and key queries simultaneously', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'dpi'],
      maxQueries: 48,
      seedStatus: makeSeedStatus(),
      focusGroups: [
        makeFocusGroup({ key: 'sensor_perf', group_search_worthy: true, productivity_score: 90 }),
        makeFocusGroup({ key: 'connectivity', group_search_worthy: false, normalized_key_queue: ['bluetooth', 'dongle'] }),
      ],
    });

    assert.ok(profile.query_rows.filter((row) => row.tier === 'group_search').length > 0);
    assert.ok(profile.query_rows.filter((row) => row.tier === 'key_search').length > 0);
  });

  it('preserves output shape when seedStatus provided', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      maxQueries: 24,
      seedStatus: makeSeedStatus({ specs_seed: { is_needed: true } }),
      focusGroups: [],
    });

    assert.ok(profile.category);
    assert.ok(profile.identity);
    assert.ok(Array.isArray(profile.variant_guard_terms));
    assert.ok(Array.isArray(profile.identity_aliases));
    assert.ok(Array.isArray(profile.alias_reject_log));
    assert.ok(Array.isArray(profile.query_reject_log));
    assert.ok(Array.isArray(profile.focus_fields));
    assert.ok(Array.isArray(profile.base_templates));
    assert.ok(Array.isArray(profile.query_rows));
    assert.ok(Array.isArray(profile.queries));
    assert.ok(Array.isArray(profile.targeted_queries));
    assert.ok(typeof profile.field_target_queries === 'object');
    assert.ok(Array.isArray(profile.doc_hint_queries));
    assert.ok(typeof profile.hint_source_counts === 'object');
  });

  it('backward compat: no seedStatus synthesizes default so Tier 1 always fires', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor'],
      maxQueries: 24,
    });

    assert.ok(profile.queries.length > 0);
    assert.ok(profile.query_rows.filter((row) => row.tier === 'seed').length > 0);
    assert.ok(profile.query_rows.every((row) => row.tier));
  });
});
