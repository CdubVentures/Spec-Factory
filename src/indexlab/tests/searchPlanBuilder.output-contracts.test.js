import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadBuildSearchPlan,
  makeSearchPlanningContext,
  makeConfig,
  makeLlmResponse,
  installFetchMock,
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

  describe('LLM response parsing', () => {
    it('valid response → no queries extracted (NeedSet does not author queries)', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.equal(result.planner.mode, 'llm');
      assert.equal(result.search_plan_handoff.queries.length, 0, 'NeedSet LLM does not generate queries');
    });

    it('empty groups array → empty queries', async () => {
      fetchMock = installFetchMock({ groups: [], planner_confidence: 0.5 });
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.equal(result.search_plan_handoff.queries.length, 0);
    });
  });

  // ===== NeedSet no longer generates queries =====

  describe('NeedSet query removal', () => {
    it('LLM response with queries → handoff still empty (queries ignored)', async () => {
      const dupeResponse = makeLlmResponse({
        groups: [{
          key: 'sensor_performance',
          queries: [
            { family: 'spec_sheet', q: 'razer viper specs' },
            { family: 'review', q: 'razer viper review' },
          ]
        }]
      });
      fetchMock = installFetchMock(dupeResponse);
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.equal(result.search_plan_handoff.queries.length, 0, 'queries not extracted from LLM');
    });
  });

  // ===== Schema 4 structure =====

  describe('Schema 4 structure', () => {
    it('schema_version = needset_planner_output.v2', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.schema_version, 'needset_planner_output.v2');
    });

    it('search_plan_handoff.queries is empty array (no query generation)', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.ok(Array.isArray(result.search_plan_handoff.queries));
      assert.equal(result.search_plan_handoff.queries.length, 0);
    });

    it('search_plan_handoff.query_hashes matches generated queries', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      const expectedHashes = result.search_plan_handoff.queries.map(q => q.query_hash);
      assert.deepStrictEqual(result.search_plan_handoff.query_hashes, expectedHashes);
    });

    it('panel.round from ctx.run', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.panel.round, 0);
    });

    it('panel.bundles uses key not group_key', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.ok(Array.isArray(result.panel.bundles));
      const sensorBundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.ok(sensorBundle, 'sensor_performance bundle exists');
      assert.equal(sensorBundle.group_key, undefined, 'group_key should not be emitted');
      assert.equal(sensorBundle.queries, undefined, 'panel bundles do not carry queries');
    });

    it('panel.bundles carry display fields from focus_groups', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.label, 'Sensor & Performance');
      assert.equal(bundle.desc, 'Sensor and performance metrics');
      assert.equal(bundle.source_target, 'spec_sheet');
      assert.equal(bundle.content_target, 'technical_specs');
      assert.equal(bundle.search_intent, 'exact_match');
      assert.equal(bundle.host_class, 'lab_review');
    });

    it('panel.profile_influence has tier-aware shape', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      const pi = result.panel.profile_influence;
      assert.ok(pi);
      assert.equal(typeof pi.targeted_specification, 'number');
      assert.equal(typeof pi.targeted_sources, 'number');
      assert.equal(typeof pi.targeted_groups, 'number');
      assert.equal(typeof pi.targeted_single, 'number');
      assert.equal(typeof pi.groups_now, 'number');
      assert.equal(typeof pi.groups_next, 'number');
      assert.equal(typeof pi.groups_hold, 'number');
      assert.equal(typeof pi.total_unresolved_keys, 'number');
      assert.equal(typeof pi.planner_confidence, 'number');
    });

    it('panel.identity/summary/blockers passthrough', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext();
      const result = await buildSearchPlan({
        searchPlanningContext: ctx,
        config: makeConfig(),
      });

      assert.deepStrictEqual(result.panel.identity, ctx.identity);
      assert.deepStrictEqual(result.panel.summary, ctx.needset.summary);
      assert.deepStrictEqual(result.panel.blockers, ctx.needset.blockers);
    });

    it('learning_writeback has spec key names (all empty without query generation)', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.ok(result.learning_writeback);
      assert.ok(Array.isArray(result.learning_writeback.query_hashes_generated));
      assert.ok(Array.isArray(result.learning_writeback.queries_generated));
      assert.ok(Array.isArray(result.learning_writeback.families_used));
      assert.ok(Array.isArray(result.learning_writeback.domains_targeted));
      assert.ok(Array.isArray(result.learning_writeback.groups_activated));
      assert.equal(typeof result.learning_writeback.duplicates_suppressed, 'number');
    });
  });

  // ===== Error handling =====

  describe('planner metadata', () => {
    it('planner.mode=llm, planner.model matches config', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig({ llmModelPlan: 'gpt-4o', openaiApiKey: 'test-api-key-123' }),
      });

      assert.equal(result.planner.mode, 'llm');
      assert.equal(result.planner.model, 'gpt-4o');
    });

    it('planner.planner_confidence from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse({ planner_confidence: 0.85 }));
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.planner.planner_confidence, 0.85);
    });

    it('planner.planner_confidence === 0 when disabled', async () => {
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig({ geminiApiKey: '' }),
      });
      assert.equal(result.planner.planner_confidence, 0);
    });

    it('planner.duplicates_suppressed is 0 (no query extraction)', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.planner.duplicates_suppressed, 0);
    });

    it('planner.targeted_exceptions from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse({ targeted_exceptions: 2 }));
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.planner.targeted_exceptions, 2);
    });

    it('planner.targeted_exceptions defaults to 0 when LLM omits it', async () => {
      const resp = makeLlmResponse();
      delete resp.targeted_exceptions;
      fetchMock = installFetchMock(resp);
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.planner.targeted_exceptions, 0);
    });
  });

  // ===== GAP-2: Anti-garbage signals sent to LLM =====

});
