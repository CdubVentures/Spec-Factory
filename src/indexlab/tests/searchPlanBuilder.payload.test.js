import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadBuildSearchPlan,
  makeSearchPlanningContext,
  makeConfig,
  makeLlmResponse,
  makeFocusGroup,
  installFetchMock,
  extractLlmPayload,
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

  describe('LLM request projection', () => {
    it('sends identity, round, limits, active focus_groups', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });

      assert.ok(fetchMock.calls.length >= 1);
      const payload = extractLlmPayload(fetchMock.calls);
      assert.ok(payload.identity, 'identity in payload');
      assert.ok(payload.focus_groups, 'focus_groups in payload');
      assert.ok(payload.limits, 'limits in payload');
    });

    it('excludes hold groups from LLM payload', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ key: 'active', phase: 'now' }),
          makeFocusGroup({ key: 'held', phase: 'hold', unresolved_field_keys: [] }),
        ],
      });
      await buildSearchPlan({
        searchPlanningContext: ctx,
        config: makeConfig(),
      });

      const payload = extractLlmPayload(fetchMock.calls);
      const groupKeys = payload.focus_groups.map(g => g.key);
      assert.ok(groupKeys.includes('active'));
      assert.ok(!groupKeys.includes('held'));
    });

    it('excludes dead_domains from domain hints', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ domain_hints_union: ['razer.com', 'spam.com', 'good.com'] }),
        ],
        learning: { dead_domains: ['spam.com'], dead_query_hashes: [] },
      });
      await buildSearchPlan({
        searchPlanningContext: ctx,
        config: makeConfig(),
      });

      const payload = extractLlmPayload(fetchMock.calls);
      const hints = payload.focus_groups[0].domain_hints_union;
      assert.ok(!hints.includes('spam.com'));
      assert.ok(hints.includes('razer.com'));
      assert.ok(hints.includes('good.com'));
    });
  });

  // ===== LLM response parsing =====

  describe('GAP-2: anti-garbage signals in LLM payload', () => {
    it('sends content_types_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ content_types_union: ['spec_sheet', 'review'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.deepStrictEqual(payload.focus_groups[0].content_types_union, ['spec_sheet', 'review']);
    });

    it('sends domains_tried_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ domains_tried_union: ['razer.com', 'rtings.com'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.deepStrictEqual(payload.focus_groups[0].domains_tried_union, ['razer.com', 'rtings.com']);
    });

    it('sends host_classes_tried_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ host_classes_tried_union: ['manufacturer', 'review'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.deepStrictEqual(payload.focus_groups[0].host_classes_tried_union, ['manufacturer', 'review']);
    });

    it('sends evidence_classes_tried_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ evidence_classes_tried_union: ['html', 'pdf'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.deepStrictEqual(payload.focus_groups[0].evidence_classes_tried_union, ['html', 'pdf']);
    });

    it('sends no_value_attempts to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ no_value_attempts: 7 }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.equal(payload.focus_groups[0].no_value_attempts, 7);
    });

    it('sends catalog metadata (source_target, search_intent, host_class) to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({
            source_target: 'spec_sheet',
            content_target: 'technical_specs',
            search_intent: 'exact_match',
            host_class: 'lab_review',
          }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.equal(payload.focus_groups[0].source_target, 'spec_sheet');
      assert.equal(payload.focus_groups[0].search_intent, 'exact_match');
      assert.equal(payload.focus_groups[0].host_class, 'lab_review');
    });

    it('sends urls_examined_count and query_count to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ urls_examined_count: 15, query_count: 8 }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.equal(payload.focus_groups[0].urls_examined_count, 15);
      assert.equal(payload.focus_groups[0].query_count, 8);
    });

    it('sends aliases_union to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ aliases_union: ['GPX2', 'G Pro X2'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.deepStrictEqual(payload.focus_groups[0].aliases_union, ['GPX2', 'G Pro X2']);
    });
  });

  // ===== GAP-12: weak/conflict distinction + missing_critical_fields =====

  describe('GAP-12: weak/conflict and missing_critical_fields in LLM payload', () => {
    it('sends weak_field_keys and conflict_field_keys to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ weak_field_keys: ['polling_rate'], conflict_field_keys: ['weight'] }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.deepStrictEqual(payload.focus_groups[0].weak_field_keys, ['polling_rate']);
      assert.deepStrictEqual(payload.focus_groups[0].conflict_field_keys, ['weight']);
    });

    it('sends missing_critical_fields as top-level in LLM payload', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext();
      ctx.needset.missing_critical_fields = ['sensor', 'dpi', 'weight'];
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.deepStrictEqual(payload.missing_critical_fields, ['sensor', 'dpi', 'weight']);
    });

    it('sends core_unresolved_count per group to LLM', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ core_unresolved_count: 5, secondary_unresolved_count: 3 }),
        ],
      });
      await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });

      const payload = extractLlmPayload(fetchMock.calls);
      assert.equal(payload.focus_groups[0].core_unresolved_count, 5);
      assert.equal(payload.focus_groups[0].secondary_unresolved_count, 3);
    });
  });

  // ===== GAP-8/9: bundle LLM fields + query projection =====

});
