// WHY: Validates that tier iteration progresses correctly across 10 runs.
// Seeds should cool down after first run, freeing budget for groups then keys.
// This test caught the bug where deriveSeedStatus() never set cooldown because
// buildQueryExecutionHistory() hardcoded status:'completed' and new_fields_closed:0.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveSeedStatus,
  computeGroupQueryCount,
  isGroupSearchWorthy,
  computeTierAllocation,
  buildSearchPlanningContext,
  makeField,
  makeNeedSetOutput,
  makeRunContext,
  makeFocusGroup,
} from './helpers/searchPlanningContextHarness.js';

const DAY_MS = 86400000;

function futureIso(daysFromNow = 30) {
  return new Date(Date.now() + daysFromNow * DAY_MS).toISOString();
}

function pastIso(daysAgo = 1) {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString();
}

function makeSeedQuery(source_name = null, cooldown_until = '') {
  return {
    tier: 'seed',
    source_name,
    group_key: null,
    normalized_key: null,
    completed_at_ms: Date.now() - 1000,
    attempt_count: 1,
    cooldown_until,
  };
}

function makeGroupQuery(group_key, cooldown_until = '') {
  return {
    tier: 'group_search',
    source_name: '',
    group_key,
    normalized_key: null,
    completed_at_ms: Date.now() - 1000,
    attempt_count: 1,
    cooldown_until,
  };
}

function makeKeyQuery(group_key, normalized_key, cooldown_until = '') {
  return {
    tier: 'key_search',
    source_name: '',
    group_key,
    normalized_key,
    completed_at_ms: Date.now() - 1000,
    attempt_count: 1,
    cooldown_until,
  };
}

// WHY: Shared field set for all 10-run scenarios.
// 3 groups with 3+ unresolved fields each = all groups start as search-worthy.
function makeTestFields() {
  return [
    makeField({ field_key: 'f1', group_key: 'sensor', required_level: 'critical', state: 'unknown' }),
    makeField({ field_key: 'f2', group_key: 'sensor', required_level: 'required', state: 'unknown' }),
    makeField({ field_key: 'f3', group_key: 'sensor', required_level: 'expected', state: 'unknown' }),
    makeField({ field_key: 'f4', group_key: 'connectivity', required_level: 'required', state: 'unknown' }),
    makeField({ field_key: 'f5', group_key: 'connectivity', required_level: 'expected', state: 'unknown' }),
    makeField({ field_key: 'f6', group_key: 'connectivity', required_level: 'expected', state: 'unknown' }),
    makeField({ field_key: 'f7', group_key: 'dimensions', required_level: 'optional', state: 'unknown' }),
    makeField({ field_key: 'f8', group_key: 'dimensions', required_level: 'optional', state: 'unknown' }),
    makeField({ field_key: 'f9', group_key: 'dimensions', required_level: 'optional', state: 'unknown' }),
  ];
}

const IDENTITY = { manufacturer: 'TestBrand', official_domain: 'testbrand.com' };
const SOURCES = [{ host: 'rtings.com' }, { host: 'techpowerup.com' }];

// ── deriveSeedStatus cooldown lifecycle ──

describe('Tier progression — deriveSeedStatus cooldown lifecycle', () => {
  const cases = [
    {
      name: 'run 1: seeds needed when no history',
      history: { queries: [] },
      expected: { specs_needed: true, sources_needed: true },
    },
    {
      name: 'run 2: seeds NOT needed when on active cooldown',
      history: {
        queries: [
          makeSeedQuery(null, futureIso(30)),
          makeSeedQuery('rtings.com', futureIso(30)),
          makeSeedQuery('techpowerup.com', futureIso(30)),
        ],
      },
      expected: { specs_needed: false, sources_needed: false },
    },
    {
      name: 'run 10: seeds needed again when cooldown expired',
      history: {
        queries: [
          makeSeedQuery(null, pastIso(1)),
          makeSeedQuery('rtings.com', pastIso(1)),
          makeSeedQuery('techpowerup.com', pastIso(1)),
        ],
      },
      expected: { specs_needed: true, sources_needed: true },
    },
    {
      name: 'mixed: some sources cooled, some expired',
      history: {
        queries: [
          makeSeedQuery(null, futureIso(30)),
          makeSeedQuery('rtings.com', futureIso(30)),
          makeSeedQuery('techpowerup.com', pastIso(1)),
        ],
      },
      expected: { specs_needed: false, rtings_needed: false, techpowerup_needed: true },
    },
    {
      name: 'empty cooldown_until treated as never run',
      history: {
        queries: [makeSeedQuery(null, '')],
      },
      expected: { specs_needed: true },
    },
    {
      name: 'invalid cooldown_until treated as never run',
      history: {
        queries: [makeSeedQuery(null, 'not-a-date')],
      },
      expected: { specs_needed: true },
    },
  ];

  for (const { name, history, expected } of cases) {
    it(name, () => {
      const status = deriveSeedStatus(history, IDENTITY, {}, SOURCES);
      if ('specs_needed' in expected) {
        assert.equal(status.specs_seed.is_needed, expected.specs_needed, 'specs_seed.is_needed');
      }
      if ('sources_needed' in expected) {
        for (const src of SOURCES) {
          assert.equal(
            status.source_seeds[src.host]?.is_needed ?? true,
            expected.sources_needed,
            `source ${src.host}.is_needed`,
          );
        }
      }
      if ('rtings_needed' in expected) {
        assert.equal(status.source_seeds['rtings.com'].is_needed, expected.rtings_needed);
      }
      if ('techpowerup_needed' in expected) {
        assert.equal(status.source_seeds['techpowerup.com'].is_needed, expected.techpowerup_needed);
      }
    });
  }
});

// ── 10-run tier allocation progression ──

describe('Tier progression — 10-run budget allocation', () => {
  const BUDGET = 10;
  const fields = makeTestFields();

  // WHY: Each run adds to queryExecutionHistory and asserts tier allocation shifts.
  const runs = [
    {
      run: 1,
      round: 0,
      queries: [],
      assert: (alloc) => {
        assert.ok(alloc.tier1_seed_count > 0, 'run 1: seeds should fire');
      },
    },
    {
      run: 2,
      round: 1,
      queries: [
        makeSeedQuery(null, futureIso(30)),
        makeSeedQuery('rtings.com', futureIso(30)),
        makeSeedQuery('techpowerup.com', futureIso(30)),
      ],
      assert: (alloc) => {
        assert.equal(alloc.tier1_seed_count, 0, 'run 2: seeds on cooldown');
        assert.ok(alloc.tier2_group_count > 0, 'run 2: groups should fire');
      },
    },
    {
      run: 3,
      round: 2,
      queries: [
        makeSeedQuery(null, futureIso(29)),
        makeSeedQuery('rtings.com', futureIso(29)),
        makeSeedQuery('techpowerup.com', futureIso(29)),
        makeGroupQuery('sensor', futureIso(29)),
        makeGroupQuery('connectivity', futureIso(29)),
        makeGroupQuery('dimensions', futureIso(29)),
      ],
      assert: (alloc) => {
        assert.equal(alloc.tier1_seed_count, 0, 'run 3: seeds still cooled');
        assert.ok(alloc.tier2_group_count >= 0, 'run 3: some groups may fire');
      },
    },
    {
      run: 4,
      round: 3,
      queries: [
        makeSeedQuery(null, futureIso(28)),
        makeSeedQuery('rtings.com', futureIso(28)),
        makeSeedQuery('techpowerup.com', futureIso(28)),
        // 3 group searches each = maxRepeats hit
        makeGroupQuery('sensor', futureIso(28)),
        makeGroupQuery('sensor', futureIso(28)),
        makeGroupQuery('sensor', futureIso(28)),
        makeGroupQuery('connectivity', futureIso(28)),
        makeGroupQuery('connectivity', futureIso(28)),
        makeGroupQuery('connectivity', futureIso(28)),
        makeGroupQuery('dimensions', futureIso(28)),
        makeGroupQuery('dimensions', futureIso(28)),
        makeGroupQuery('dimensions', futureIso(28)),
      ],
      assert: (alloc) => {
        assert.equal(alloc.tier1_seed_count, 0, 'run 4: seeds still cooled');
        assert.equal(alloc.tier2_group_count, 0, 'run 4: all groups exhausted');
        assert.ok(alloc.tier3_key_count > 0, 'run 4: keys should fire');
      },
    },
    {
      run: 10,
      round: 9,
      queries: [
        // Seed cooldowns expired (30+ days later)
        makeSeedQuery(null, pastIso(1)),
        makeSeedQuery('rtings.com', pastIso(1)),
        makeSeedQuery('techpowerup.com', pastIso(1)),
        // Group cooldowns also expired
        makeGroupQuery('sensor', pastIso(1)),
        makeGroupQuery('sensor', pastIso(1)),
        makeGroupQuery('sensor', pastIso(1)),
        makeGroupQuery('connectivity', pastIso(1)),
        makeGroupQuery('connectivity', pastIso(1)),
        makeGroupQuery('connectivity', pastIso(1)),
        makeGroupQuery('dimensions', pastIso(1)),
        makeGroupQuery('dimensions', pastIso(1)),
        makeGroupQuery('dimensions', pastIso(1)),
      ],
      assert: (alloc) => {
        assert.ok(alloc.tier1_seed_count > 0, 'run 10: seeds fire again (cooldown expired)');
        assert.ok(alloc.tier2_group_count > 0, 'run 10: groups re-eligible');
      },
    },
  ];

  for (const { run, round, queries, assert: assertFn } of runs) {
    it(`run ${run}: tier allocation shifts correctly`, () => {
      const needSet = makeNeedSetOutput({ fields });
      const ctx = buildSearchPlanningContext({
        needSetOutput: needSet,
        config: { searchProfileQueryCap: BUDGET },
        fieldGroupsData: {},
        categorySourceHosts: SOURCES,
        runContext: makeRunContext({ round }),
        queryExecutionHistory: { queries },
      });
      assertFn(ctx.tier_allocation);
    });
  }
});

// ── Seed-group cooldown symmetry ──

describe('Tier progression — seed and group cooldown symmetry', () => {
  it('active cooldown: both seeds and groups are blocked', () => {
    const future = futureIso(30);
    const seedStatus = deriveSeedStatus(
      { queries: [makeSeedQuery(null, future)] },
      IDENTITY, {}, SOURCES,
    );
    const groupCount = computeGroupQueryCount('sensor', {
      queries: [makeGroupQuery('sensor', future)],
    });
    assert.equal(seedStatus.specs_seed.is_needed, false, 'seed blocked by cooldown');
    assert.equal(groupCount, 1, 'group counted (active cooldown)');
  });

  it('expired cooldown: both seeds and groups are unblocked', () => {
    const past = pastIso(1);
    const seedStatus = deriveSeedStatus(
      { queries: [makeSeedQuery(null, past)] },
      IDENTITY, {}, SOURCES,
    );
    const groupCount = computeGroupQueryCount('sensor', {
      queries: [makeGroupQuery('sensor', past)],
    });
    assert.equal(seedStatus.specs_seed.is_needed, true, 'seed unblocked (expired)');
    assert.equal(groupCount, 0, 'group not counted (expired)');
  });

  it('no history: both seeds and groups report zero/needed', () => {
    const seedStatus = deriveSeedStatus(null, IDENTITY, {}, SOURCES);
    const groupCount = computeGroupQueryCount('sensor', null);
    assert.equal(seedStatus.specs_seed.is_needed, true, 'seed needed (no history)');
    assert.equal(groupCount, 0, 'group count 0 (no history)');
  });
});

// ── Full buildSearchPlanningContext integration ──

describe('Tier progression — pass_seed signals across rounds', () => {
  const fields = makeTestFields();

  it('round 0: passA_specs_seed = true, groups deferred', () => {
    const ctx = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 0 }),
      queryExecutionHistory: { queries: [] },
      config: { searchProfileQueryCap: 10 },
      categorySourceHosts: SOURCES,
    });
    assert.equal(ctx.pass_seed.passA_specs_seed, true);
    assert.deepStrictEqual(ctx.pass_seed.passA_target_groups, []);
  });

  it('round 1 + seed cooled: passA_specs_seed = false, groups promoted', () => {
    const ctx = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      queryExecutionHistory: {
        queries: [makeSeedQuery(null, futureIso(30))],
      },
      config: { searchProfileQueryCap: 10 },
      categorySourceHosts: SOURCES,
    });
    assert.equal(ctx.pass_seed.passA_specs_seed, false);
    assert.ok(ctx.pass_seed.passA_target_groups.length > 0, 'groups promoted to now');
  });

  it('round 2 + seed expired: passA_specs_seed = true', () => {
    const ctx = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 2 }),
      queryExecutionHistory: {
        queries: [makeSeedQuery(null, pastIso(1))],
      },
      config: { searchProfileQueryCap: 10 },
      categorySourceHosts: SOURCES,
    });
    assert.equal(ctx.pass_seed.passA_specs_seed, true);
  });
});
