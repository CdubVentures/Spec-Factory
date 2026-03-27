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

  describe('planner_limits', () => {
    it('config values mapped correctly to planner-specific keys', () => {
      const config = {
        discoveryEnabled: true,
        searchProfileQueryCap: 10,
        maxPagesPerDomain: 3,
        llmModelPlan: 'gpt-4o',
        llmProvider: 'openai',
        llmMaxOutputTokensPlan: 4096,
        searchProfileCapMapJson: '{"deterministicAliasCap":6}',
        searchEngines: 'google'
      };
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        config,
        runContext: makeRunContext()
      });

      assert.equal(result.planner_limits.discoveryEnabled, true);
      assert.equal(result.planner_limits.searchProfileQueryCap, 10);
      assert.equal(result.planner_limits.domainClassifierUrlCap, 50);
      assert.equal(result.planner_limits.serpSelectorMaxKeep, 50);
      assert.equal(result.planner_limits.maxPagesPerDomain, 3);
      // WHY: maxRunSeconds retired from planner_limits (runtime-only concern)
      assert.equal(result.planner_limits.maxRunSeconds, undefined);
      assert.equal(result.planner_limits.llmModelPlan, 'gpt-4o');
      assert.equal(result.planner_limits.llmProvider, 'openai');
      assert.equal(result.planner_limits.llmMaxOutputTokensPlan, 4096);
      assert.deepStrictEqual(result.planner_limits.searchProfileCapMap, { deterministicAliasCap: 6 });
      assert.equal(result.planner_limits.searchEngines, 'google');
    });

    it('llmProvider passed through to planner_limits', () => {
      const config = {
        llmModelPlan: 'gemini-2.5-flash-lite',
        llmProvider: 'gemini',
      };
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        config,
        runContext: makeRunContext()
      });

      assert.equal(result.planner_limits.llmModelPlan, 'gemini-2.5-flash-lite');
      assert.equal(result.planner_limits.llmProvider, 'gemini');
    });


    it('invalid searchProfileCapMapJson â†’ null', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        config: { searchProfileCapMapJson: 'not-json' },
        runContext: makeRunContext()
      });
      assert.equal(result.planner_limits.searchProfileCapMap, null);
    });
  });

  // ===== Passthrough =====

  describe('run context', () => {
    it('run block reflects runContext', () => {
      const rc = makeRunContext({ run_id: 'r_42', category: 'keyboard', round: 3 });
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: rc
      });
      assert.equal(result.run.run_id, 'r_42');
      assert.equal(result.run.category, 'keyboard');
      assert.equal(result.run.round, 3);
    });
  });

  // ===== Learning + previousRoundFields passthrough =====

  describe('GAP-5: run block base_model + aliases', () => {
    it('base_model and aliases from runContext appear in run block', () => {
      const rc = makeRunContext({
        base_model: 'Viper V3',
        aliases: ['VV3P', 'Viper V3 Pro']
      });
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: rc
      });
      assert.equal(result.run.base_model, 'Viper V3');
      assert.deepStrictEqual(result.run.aliases, ['VV3P', 'Viper V3 Pro']);
    });

    it('missing base_model/aliases â†’ defaults', () => {
      const result = buildSearchPlanningContext({
        needSetOutput: makeNeedSetOutput(),
        runContext: makeRunContext()
      });
      assert.equal(result.run.base_model, '');
      assert.deepStrictEqual(result.run.aliases, []);
    });
  });

  // ===== PROFILE-GAP-6: SET unions from unresolved fields only =====

});
