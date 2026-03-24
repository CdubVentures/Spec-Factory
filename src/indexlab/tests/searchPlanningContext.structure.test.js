import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchPlanningContext,
  makeField,
  makeNeedSetOutput,
  makeFieldGroupsData,
  makeRunContext,
} from './helpers/searchPlanningContextHarness.js';

// --- Tests ---

describe('buildSearchPlanningContext', () => {

  describe('empty inputs', () => {
    it('empty needSetOutput â†’ valid Schema 3 with empty focus_groups', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext()
      });

      assert.equal(result.schema_version, 'search_planning_context.v2.1');
      assert.deepStrictEqual(result.focus_groups, []);
      assert.ok(result.needset);
      assert.ok(result.planner_limits);
      assert.ok(result.group_catalog);
      assert.equal(result.learning, null);
      assert.equal(result.previous_round_fields, null);
    });

    it('missing fieldGroupsData â†’ fields go to _ungrouped group', () => {
      const ns = makeNeedSetOutput({
        fields: [makeField({ field_key: 'f1', group_key: null, state: 'unknown' })]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      assert.equal(result.focus_groups.length, 1);
      assert.equal(result.focus_groups[0].key, '_ungrouped');
      assert.deepStrictEqual(result.focus_groups[0].field_keys, ['f1']);
    });

    it('missing config â†’ default planner_limits', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext()
      });

      assert.equal(result.planner_limits.discoveryEnabled, true);
      // WHY: Registry defaults are SSOT — no hardcoded fallbacks
      assert.equal(result.planner_limits.searchProfileQueryCap, 10);
      assert.equal(result.planner_limits.domainClassifierUrlCap, 50);
      assert.equal(result.planner_limits.serpSelectorUrlCap, 50);
      assert.equal(result.planner_limits.maxPagesPerDomain, 5);
      // WHY: maxRunSeconds retired from planner_limits (runtime-only concern)
      assert.equal(result.planner_limits.maxRunSeconds, undefined);
      assert.equal(result.planner_limits.llmModelPlan, 'gemini-2.5-flash');
      assert.equal(result.planner_limits.llmProvider, 'gemini');
      assert.equal(result.planner_limits.llmMaxOutputTokensPlan, 2048);
      assert.equal(result.planner_limits.searchProfileCapMap, null);
      assert.equal(result.planner_limits.searchEngines, 'bing,google');
    });
  });

  // ===== Field grouping =====

  describe('field grouping', () => {
    it('fields with same group_key grouped together', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'sensor', group_key: 'sensor_performance', state: 'unknown' }),
          makeField({ field_key: 'dpi', group_key: 'sensor_performance', state: 'unknown' }),
          makeField({ field_key: 'weight', group_key: 'construction', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      const sensorGroup = result.focus_groups.find(g => g.key === 'sensor_performance');
      const constructionGroup = result.focus_groups.find(g => g.key === 'construction');

      assert.ok(sensorGroup);
      assert.ok(constructionGroup);
      assert.deepStrictEqual(sensorGroup.field_keys.sort(), ['dpi', 'sensor']);
      assert.deepStrictEqual(constructionGroup.field_keys, ['weight']);
    });

    it('null/empty group_key â†’ _ungrouped', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: null, state: 'unknown' }),
          makeField({ field_key: 'f2', group_key: '', state: 'unknown' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      assert.equal(result.focus_groups.length, 1);
      assert.equal(result.focus_groups[0].key, '_ungrouped');
      assert.deepStrictEqual(result.focus_groups[0].field_keys.sort(), ['f1', 'f2']);
    });

    it('fields with group_key not in fieldGroupsData still form groups', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'exotic_group', state: 'unknown' })
        ]
      });
      const fgd = makeFieldGroupsData(); // no groups defined
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        fieldGroupsData: fgd,
        runContext: makeRunContext()
      });

      assert.equal(result.focus_groups.length, 1);
      assert.equal(result.focus_groups[0].key, 'exotic_group');
    });
  });

  // ===== State classification =====

  describe('state classification', () => {
    it('all-accepted group â†’ satisfied_field_keys only', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [] }),
          makeField({ field_key: 'f2', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [] })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.ok(grp);
      assert.deepStrictEqual(grp.satisfied_field_keys.sort(), ['f1', 'f2']);
      assert.deepStrictEqual(grp.unresolved_field_keys, []);
      assert.deepStrictEqual(grp.weak_field_keys, []);
      assert.deepStrictEqual(grp.conflict_field_keys, []);
    });

    it('mix of states â†’ correct classification into 4 arrays', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'ok', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [] }),
          makeField({ field_key: 'missing', group_key: 'grp', state: 'unknown' }),
          makeField({ field_key: 'low', group_key: 'grp', state: 'weak' }),
          makeField({ field_key: 'bad', group_key: 'grp', state: 'conflict' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.deepStrictEqual(grp.satisfied_field_keys, ['ok']);
      assert.deepStrictEqual(grp.unresolved_field_keys, ['missing']);
      assert.deepStrictEqual(grp.weak_field_keys, ['low']);
      assert.deepStrictEqual(grp.conflict_field_keys, ['bad']);
    });
  });

  // ===== Priority =====

  describe('priority', () => {
    it('group with identity/critical/required unresolved â†’ core', () => {
      for (const level of ['identity', 'critical', 'required']) {
        const ns = makeNeedSetOutput({
          fields: [
            makeField({ field_key: `f_${level}`, group_key: 'grp', state: 'unknown', required_level: level })
          ]
        });
        const result = buildSearchPlanningContext({
          needSetOutput: ns,
          runContext: makeRunContext()
        });
        const grp = result.focus_groups.find(g => g.key === 'grp');
        assert.equal(grp.priority, 'core', `expected core for required_level=${level}`);
      }
    });

    it('group with only expected unresolved â†’ secondary', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'expected' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.priority, 'secondary');
    });

    it('group with only optional unresolved â†’ optional', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'optional' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.priority, 'optional');
    });
  });

  // ===== Phase =====

  describe('phase', () => {
    it('round 0 (seeds first) â†’ all unresolved groups are next', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'critical' })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round: 0 })
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.phase, 'next');
    });

    it('round 1+ â†’ search-worthy groups become now', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'unknown', required_level: 'critical' }),
          makeField({ field_key: 'f2', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
          makeField({ field_key: 'f3', group_key: 'grp', state: 'unknown', required_level: 'expected' }),
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round: 1 }),
        config: { searchProfileQueryCap: 10 },
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.group_search_worthy, true);
      assert.equal(grp.phase, 'now');
    });

    it('round 1+ with multiple groups â†’ higher productivity group is now, lower is next', () => {
      const ns = makeNeedSetOutput({
        fields: [
          // easy group: 4 fields, all expected+easy+always
          makeField({ field_key: 'e1', group_key: 'easy_grp', state: 'unknown', required_level: 'expected', availability: 'always', difficulty: 'easy', need_score: 30 }),
          makeField({ field_key: 'e2', group_key: 'easy_grp', state: 'unknown', required_level: 'expected', availability: 'always', difficulty: 'easy', need_score: 30 }),
          makeField({ field_key: 'e3', group_key: 'easy_grp', state: 'unknown', required_level: 'expected', availability: 'always', difficulty: 'easy', need_score: 30 }),
          makeField({ field_key: 'e4', group_key: 'easy_grp', state: 'unknown', required_level: 'expected', availability: 'always', difficulty: 'easy', need_score: 30 }),
          // hard group: 1 field, critical but rare+hard
          makeField({ field_key: 'h1', group_key: 'hard_grp', state: 'unknown', required_level: 'critical', availability: 'rare', difficulty: 'hard', need_score: 80 }),
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext({ round: 1 })
      });
      const easyGrp = result.focus_groups.find(g => g.key === 'easy_grp');
      const hardGrp = result.focus_groups.find(g => g.key === 'hard_grp');
      assert.equal(easyGrp.phase, 'now');
      assert.equal(hardGrp.phase, 'next');
    });

    it('all-satisfied group â†’ hold', () => {
      const ns = makeNeedSetOutput({
        fields: [
          makeField({ field_key: 'f1', group_key: 'grp', state: 'accepted', need_score: 0, reasons: [] })
        ]
      });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      const grp = result.focus_groups.find(g => g.key === 'grp');
      assert.equal(grp.phase, 'hold');
    });
  });

  // ===== SET unions =====

});
