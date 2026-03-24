import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadBuildSearchPlan,
  makeSearchPlanningContext,
  makeConfig,
  makeLlmResponse,
  installFetchMock,
  installFetchThrow,
} from './helpers/searchPlanBuilderHarness.js';

describe('buildSearchPlan', () => {
  let buildSearchPlan;
  let fetchMock;

  beforeEach(async () => {
    buildSearchPlan = await loadBuildSearchPlan();
  });

  afterEach(() => {
    if (fetchMock) {
      fetchMock.restore();
      fetchMock = null;
    }
  });

  describe('disabled', () => {
    it('no API key → mode=disabled, empty queries', async () => {
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig({ geminiApiKey: '' }),
      });

      assert.equal(result.planner.mode, 'disabled');
      assert.equal(result.search_plan_handoff.queries.length, 0);
      assert.equal(result.planner.planner_complete, true);
    });

  });

  // ===== LLM request projection =====

  describe('error handling', () => {
    it('LLM throws → mode=error, empty queries, planner_complete=false', async () => {
      fetchMock = installFetchThrow(new Error('LLM network error'));
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.equal(result.planner.mode, 'error');
      assert.equal(result.search_plan_handoff.queries.length, 0);
      assert.equal(result.planner.planner_complete, false);
      assert.ok(result.planner.error);
    });
  });

  // ===== Determinism =====

  describe('determinism', () => {
    it('same mock response → identical output', async () => {
      const response = makeLlmResponse();
      const ctx = makeSearchPlanningContext();
      const config = makeConfig();

      fetchMock = installFetchMock(response);
      const r1 = await buildSearchPlan({ searchPlanningContext: ctx, config });
      fetchMock.restore();

      fetchMock = installFetchMock(response);
      const r2 = await buildSearchPlan({ searchPlanningContext: ctx, config });
      fetchMock.restore();
      fetchMock = null;

      assert.deepStrictEqual(r1.search_plan_handoff, r2.search_plan_handoff);
      assert.deepStrictEqual(r1.panel, r2.panel);
      assert.deepStrictEqual(r1.learning_writeback, r2.learning_writeback);
    });
  });

  // ===== Planner metadata =====

});
