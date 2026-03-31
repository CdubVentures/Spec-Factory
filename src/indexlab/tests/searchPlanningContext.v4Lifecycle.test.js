import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchPlanningContext,
  makeField,
  makeNeedSetOutput,
  makeRunContext,
} from './helpers/searchPlanningContextHarness.js';

describe('V4 - focus_groups carry V4 fields', () => {
  it('every focus_group has V4 coverage and description fields', () => {
    const fields = [
      makeField({ field_key: 'sensor', group_key: 'sp', required_level: 'critical', state: 'unknown' }),
      makeField({ field_key: 'dpi', group_key: 'sp', required_level: 'required', state: 'accepted', value: '26000' }),
      makeField({ field_key: 'hz', group_key: 'sp', required_level: 'expected', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext(),
    });
    const group = result.focus_groups.find((entry) => entry.key === 'sp');
    assert.ok(group);
    assert.equal(group.total_field_count, 3);
    assert.equal(group.resolved_field_count, 1);
    assert.ok(group.coverage_ratio > 0.3 && group.coverage_ratio < 0.4);
    assert.equal(typeof group.group_description_short, 'string');
    assert.equal(typeof group.group_description_long, 'string');
    assert.equal(typeof group.group_search_worthy, 'boolean');
    assert.equal(typeof group.group_fingerprint_coarse, 'string');
    assert.equal(typeof group.group_fingerprint_fine, 'string');
    assert.ok(Array.isArray(group.normalized_key_queue));
    assert.ok(Array.isArray(group.group_search_terms));
    assert.ok(Array.isArray(group.content_type_candidates));
    assert.ok(Array.isArray(group.domains_tried_for_group));
    assert.equal(typeof group.group_query_count, 'number');
    assert.equal(typeof group.group_key_retry_count, 'number');
  });

  it('group_search_worthy = true for group with many unresolved fields', () => {
    const fields = Array.from({ length: 6 }, (_, index) =>
      makeField({ field_key: `f${index}`, group_key: 'g', required_level: 'expected', state: 'unknown' })
    );
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext(),
    });
    const group = result.focus_groups[0];
    assert.equal(group.group_search_worthy, true);
    assert.equal(group.skip_reason, null);
  });

  it('group_search_worthy = false when only 1 unresolved field', () => {
    const fields = [
      makeField({ field_key: 'f1', group_key: 'g', required_level: 'expected', state: 'accepted', value: 'ok' }),
      makeField({ field_key: 'f2', group_key: 'g', required_level: 'expected', state: 'accepted', value: 'ok' }),
      makeField({ field_key: 'f3', group_key: 'g', required_level: 'expected', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext(),
    });
    const group = result.focus_groups[0];
    assert.equal(group.group_search_worthy, false);
    assert.equal(group.skip_reason, 'too_few_missing_keys');
  });

  it('group_fingerprint_coarse is just group_key', () => {
    const fields = [makeField({ field_key: 'f1', group_key: 'sp', state: 'unknown' })];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext(),
    });
    assert.equal(result.focus_groups[0].group_fingerprint_coarse, 'sp');
  });
});

describe('V4 - Schema 3 top-level seed_status and pass_seed', () => {
  it('seed_status present on output', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext(),
    });
    assert.ok(result.seed_status);
    assert.ok(result.seed_status.specs_seed);
    assert.ok(result.seed_status.query_completion_summary);
  });

  it('pass_seed.passA_specs_seed = true on round 0', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext({ round: 0 }),
    });
    assert.equal(result.pass_seed.passA_specs_seed, true);
  });

  it('pass_seed.passA_specs_seed = true on round 1+ without execution history', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext({ round: 2 }),
    });
    assert.equal(result.pass_seed.passA_specs_seed, true);
  });

  it('pass_seed.passA_specs_seed = false on round 1+ with completed execution history', () => {
    const now = Date.now();
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext({ round: 2 }),
      queryExecutionHistory: {
        queries: [{
          tier: 'seed',
          source_name: null,
          completed_at_ms: now - 1000,
          attempt_count: 1,
          cooldown_until: new Date(now + 30 * 86400000).toISOString(),
        }],
      },
    });
    assert.equal(result.pass_seed.passA_specs_seed, false);
  });

  it('pass_seed.passA_target_groups = phase:now groups on round 1+', () => {
    const fields = [
      makeField({ field_key: 'f1', group_key: 'active', required_level: 'critical', state: 'unknown' }),
      makeField({ field_key: 'f2', group_key: 'active', required_level: 'expected', state: 'unknown' }),
      makeField({ field_key: 'f3', group_key: 'active', required_level: 'expected', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    });
    assert.ok(result.pass_seed.passA_target_groups.includes('active'));
  });

  it('pass_seed.passA_target_groups = empty on round 0', () => {
    const fields = [
      makeField({ field_key: 'f1', group_key: 'active', required_level: 'critical', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 0 }),
    });
    assert.deepStrictEqual(result.pass_seed.passA_target_groups, []);
  });

  it('schema_version is search_planning_context.v2.1', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext(),
    });
    assert.equal(result.schema_version, 'search_planning_context.v2.1');
  });

  it('tier_allocation present on output', () => {
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput(),
      runContext: makeRunContext(),
      config: { searchProfileQueryCap: 10 },
    });
    assert.ok(result.tier_allocation);
    assert.equal(result.tier_allocation.budget, 10);
    assert.equal(typeof result.tier_allocation.tier1_seed_count, 'number');
    assert.equal(typeof result.tier_allocation.tier2_group_count, 'number');
    assert.equal(typeof result.tier_allocation.tier3_key_count, 'number');
  });

  it('pass_seed.passB_group_queue lists search-worthy groups', () => {
    const fields = Array.from({ length: 4 }, (_, index) =>
      makeField({ field_key: `f${index}`, group_key: 'worthy', required_level: 'expected', state: 'unknown' })
    );
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    });
    assert.ok(Array.isArray(result.pass_seed.passB_group_queue));
    assert.ok(result.pass_seed.passB_group_queue.includes('worthy'));
  });

  it('pass_seed.passB_key_queue lists keys from non-worthy groups', () => {
    const fields = [
      makeField({ field_key: 'solo_key', group_key: 'small', required_level: 'expected', state: 'unknown' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    });
    assert.ok(Array.isArray(result.pass_seed.passB_key_queue));
    const group = result.focus_groups.find((entry) => entry.key === 'small');
    if (group && group.group_search_worthy === false && group.normalized_key_queue.length > 0) {
      assert.ok(result.pass_seed.passB_key_queue.length > 0);
    }
  });
});

describe('V4 - budget-aware phase assignment', () => {
  it('round 0: all pending groups are next regardless of budget', () => {
    const fields = Array.from({ length: 4 }, (_, index) =>
      makeField({ field_key: `f${index}`, group_key: 'g', required_level: 'expected', state: 'unknown' })
    );
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 0 }),
      config: { searchProfileQueryCap: 10 },
    });
    const group = result.focus_groups.find((entry) => entry.key === 'g');
    assert.equal(group.phase, 'next');
  });

  it('round 1+: now count limited by budget minus seeds', () => {
    const fields = [];
    for (let groupIndex = 0; groupIndex < 3; groupIndex += 1) {
      for (let fieldIndex = 0; fieldIndex < 4; fieldIndex += 1) {
        fields.push(makeField({
          field_key: `g${groupIndex}_f${fieldIndex}`,
          group_key: `grp${groupIndex}`,
          required_level: 'expected',
          state: 'unknown',
          need_score: (3 - groupIndex) * 10,
        }));
      }
    }
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 3 },
    });
    const nowGroups = result.focus_groups.filter((entry) => entry.phase === 'now');
    const nextGroups = result.focus_groups.filter((entry) => entry.phase === 'next');
    assert.ok(nowGroups.length <= 3, `Expected at most 3 now groups, got ${nowGroups.length}`);
    assert.ok(nowGroups.length + nextGroups.length === 3);
  });

  it('hold groups are never promoted to now regardless of budget', () => {
    const fields = [
      makeField({ field_key: 'f1', group_key: 'resolved', required_level: 'expected', state: 'accepted', value: 'ok' }),
    ];
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 100 },
    });
    const group = result.focus_groups.find((entry) => entry.key === 'resolved');
    assert.equal(group.phase, 'hold');
  });
});

describe('phase assignment immutability', () => {
  it('no focus_group has phase=pending in the output', () => {
    const needSetOutput = makeNeedSetOutput({
      fields: [
        makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'critical' }),
        makeField({ field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
        makeField({ field_key: 'f3', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
      ],
    });
    for (const round of [0, 1, 2]) {
      const result = buildSearchPlanningContext({
        needSetOutput,
        runContext: makeRunContext({ round }),
      });
      for (const group of result.focus_groups) {
        assert.notEqual(group.phase, 'pending', `group ${group.key} at round ${round} must not have phase=pending`);
      }
    }
  });

  it('budget overflow: excess worthy groups get next not now', () => {
    const fields = [];
    for (let groupIndex = 0; groupIndex < 3; groupIndex += 1) {
      for (let fieldIndex = 0; fieldIndex < 4; fieldIndex += 1) {
        fields.push(makeField({
          field_key: `g${groupIndex}_f${fieldIndex}`,
          group_key: `grp${groupIndex}`,
          required_level: 'expected',
          state: 'unknown',
          need_score: (3 - groupIndex) * 10,
        }));
      }
    }
    const result = buildSearchPlanningContext({
      needSetOutput: makeNeedSetOutput({ fields }),
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 3 },
    });
    const nowCount = result.focus_groups.filter((entry) => entry.phase === 'now').length;
    const nextCount = result.focus_groups.filter((entry) => entry.phase === 'next').length;
    assert.ok(nowCount >= 1);
    assert.equal(nowCount + nextCount, 3);
  });

  it('focus_groups from two calls are independent objects', () => {
    const needSetOutput = makeNeedSetOutput({
      fields: [
        makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'critical' }),
        makeField({ field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
        makeField({ field_key: 'f3', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
      ],
    });
    const args = {
      needSetOutput,
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    };
    const first = buildSearchPlanningContext(args);
    const second = buildSearchPlanningContext(args);

    first.focus_groups[0].phase = 'CORRUPTED';
    assert.notEqual(second.focus_groups[0].phase, 'CORRUPTED');
  });

  it('needSetOutput is not mutated by buildSearchPlanningContext', () => {
    const needSetOutput = makeNeedSetOutput({
      fields: [
        makeField({ field_key: 'f1', group_key: 'grp_a', state: 'unknown', required_level: 'critical' }),
        makeField({ field_key: 'f2', group_key: 'grp_a', state: 'unknown', required_level: 'expected' }),
        makeField({ field_key: 'f3', group_key: 'grp_a', state: 'unknown', required_level: 'expected' }),
        makeField({ field_key: 'f4', group_key: 'grp_b', state: 'unknown', required_level: 'optional' }),
      ],
    });
    const snapshot = structuredClone(needSetOutput);

    buildSearchPlanningContext({
      needSetOutput,
      runContext: makeRunContext({ round: 1 }),
      config: { searchProfileQueryCap: 10 },
    });

    assert.deepStrictEqual(needSetOutput, snapshot);
  });
});
