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

  describe('passthrough', () => {
    it('identity block unchanged', () => {
      const identity = {
        state: 'locked',
        source_label_state: 'matched',
        manufacturer: 'Razer',
        model: 'Viper V3',
        confidence: 0.99,
        official_domain: 'razer.com',
        support_domain: 'support.razer.com'
      };
      const ns = makeNeedSetOutput({ identity });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      assert.deepStrictEqual(result.identity, identity);
    });

    it('summary/blockers unchanged', () => {
      const summary = {
        total: 50, resolved: 30, core_total: 10, core_unresolved: 5,
        secondary_total: 20, secondary_unresolved: 10,
        optional_total: 20, optional_unresolved: 5,
        conflicts: 2, bundles_planned: 3
      };
      const blockers = { missing: 10, weak: 3, conflict: 2, needs_exact_match: 1, search_exhausted: 0 };
      const ns = makeNeedSetOutput({ summary, blockers });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      assert.deepStrictEqual(result.needset.summary, summary);
      assert.deepStrictEqual(result.needset.blockers, blockers);
    });

    it('schema_version = search_planning_context.v2', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext()
      });
      assert.equal(result.schema_version, 'search_planning_context.v2.1');
    });
  });

  // ===== Sorting =====

  describe('optional passthrough', () => {
    it('learning passed through when provided', () => {
      const learning = { query_index_hits: { q1: 3 }, dead_domains: ['spam.com'] };
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext(),
        learning
      });
      assert.deepStrictEqual(result.learning, learning);
    });

    it('previousRoundFields passed through when provided', () => {
      const previousRoundFields = [{ field_key: 'sensor', state: 'unknown' }];
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext(),
        previousRoundFields
      });
      assert.deepStrictEqual(result.previous_round_fields, previousRoundFields);
    });
  });

  // ===== needset block =====

  describe('needset block', () => {
    it('needset contains existing_queries, missing_critical_fields, unresolved_fields (no fields passthrough)', () => {
      const planner_seed = {
        missing_critical_fields: ['sensor'],
        unresolved_fields: ['sensor', 'weight'],
        existing_queries: ['razer viper specs'],
        current_product_identity: { category: 'mouse', brand: 'Razer', model: 'Viper' }
      };
      const fields = [makeField({ field_key: 'sensor' })];
      const ns = makeNeedSetOutput({ fields, planner_seed });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });

      assert.deepStrictEqual(result.needset.missing_critical_fields, ['sensor']);
      assert.deepStrictEqual(result.needset.unresolved_fields, ['sensor', 'weight']);
      assert.deepStrictEqual(result.needset.existing_queries, ['razer viper specs']);
      // fields NOT passed through â€” data is already in focus_groups
      assert.equal(result.needset.fields, undefined);
    });
  });

  // ===== duplicate_attempts_suppressed sum =====

  describe('needset block slim', () => {
    it('needset.fields is NOT included (remove heavy passthrough)', () => {
      const fields = [makeField({ field_key: 'sensor' })];
      const ns = makeNeedSetOutput({ fields });
      const result = buildSearchPlanningContext({
        needSetOutput: ns,
        runContext: makeRunContext()
      });
      // fields should not be passed through â€” data is in focus_groups
      assert.equal(result.needset.fields, undefined);
    });
  });

  // ===== field_priority_map =====

  describe('GAP-9: previous_round_fields confidence', () => {
    it('previous_round_fields items with confidence pass through', () => {
      const previousRoundFields = [
        { field_key: 'sensor', state: 'weak', confidence: 0.3 },
        { field_key: 'weight', state: 'satisfied', confidence: 0.95 }
      ];
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext(),
        previousRoundFields
      });
      assert.equal(result.previous_round_fields[0].confidence, 0.3);
      assert.equal(result.previous_round_fields[1].confidence, 0.95);
    });
  });

  // ===== PROFILE-GAP-10: key vs group_key rename =====

});
