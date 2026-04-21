import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadBuildSearchPlan,
  makeSearchPlanningContext,
  makeConfig,
  makeLlmResponse,
  makeFocusGroup,
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

  describe('bundle LLM fields and query projection', () => {
    it('bundle.query_family_mix from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.query_family_mix, 'spec_sheet+review');
    });

    it('bundle.reason_active from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.reason_active, 'Core fields missing');
    });

    it('group not in LLM response → null LLM fields', async () => {
      const resp = makeLlmResponse({ groups: [{ key: 'sensor_performance', queries: [{ family: 'spec_sheet', q: 'some query' }] }] });
      fetchMock = installFetchMock(resp);
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const connBundle = result.panel.bundles.find(b => b.key === 'connectivity');
      assert.equal(connBundle.query_family_mix, null);
      assert.equal(connBundle.reason_active, null);
    });

    it('panel bundles do not carry queries', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.queries, undefined, 'no queries on panel bundle');
    });
  });

  // ===== Tier-aware profile_influence =====

  describe('profile_influence tier-aware shape', () => {
    it('targeting counts derived from Schema 3 focus_groups', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ key: 'g1', phase: 'now', group_search_worthy: true, normalized_key_queue: ['a', 'b'] }),
          makeFocusGroup({ key: 'g2', phase: 'next', group_search_worthy: false, normalized_key_queue: ['c'] }),
          makeFocusGroup({ key: 'g3', phase: 'hold', group_search_worthy: false, normalized_key_queue: [] }),
        ],
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const pi = result.panel.profile_influence;

      assert.equal(pi.targeted_groups, 1, 'one search-worthy group');
      assert.equal(pi.targeted_single, 1, 'one key from non-worthy group with keys');
      assert.equal(pi.groups_now, 1);
      assert.equal(pi.groups_next, 1);
      assert.equal(pi.groups_hold, 1);
      assert.equal(pi.total_unresolved_keys, 3, 'a+b+c = 3 total keys');
    });

    it('targeted_specification reflects seed_status specs_seed', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        seed_status: { specs_seed: { is_needed: true }, source_seeds: {} },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.equal(result.panel.profile_influence.targeted_specification, 1);
    });

    it('targeted_sources counts needed source seeds', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        seed_status: { specs_seed: { is_needed: false }, source_seeds: { 'razer.com': { is_needed: true }, 'rtings.com': { is_needed: true }, 'amazon.com': { is_needed: false } } },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.equal(result.panel.profile_influence.targeted_sources, 2);
    });

    it('planner_confidence from LLM response', async () => {
      fetchMock = installFetchMock(makeLlmResponse({ planner_confidence: 0.85 }));
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      assert.equal(result.panel.profile_influence.planner_confidence, 0.85);
    });

    it('disabled mode → defaults', async () => {
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig({ geminiApiKey: '' }),
      });
      const pi = result.panel.profile_influence;
      assert.equal(pi.targeted_specification, 0);
      assert.equal(pi.targeted_sources, 0);
      assert.equal(pi.targeted_groups, 0);
      assert.equal(pi.targeted_single, 0);
      assert.equal(pi.planner_confidence, 0);
    });

    it('profile_influence uses tier_allocation counts when present', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ key: 'g1', phase: 'now', group_search_worthy: true, normalized_key_queue: ['a', 'b'] }),
          makeFocusGroup({ key: 'g2', phase: 'now', group_search_worthy: true, normalized_key_queue: ['c'] }),
          makeFocusGroup({ key: 'g3', phase: 'next', group_search_worthy: true, normalized_key_queue: ['d'] }),
          makeFocusGroup({ key: 'gk', phase: 'next', group_search_worthy: false, normalized_key_queue: ['e', 'f', 'g'] }),
        ],
        seed_status: {
          specs_seed: { is_needed: true },
          source_seeds: { 'razer.com': { is_needed: true } },
        },
        tier_allocation: {
          budget: 5,
          tier1_seed_count: 2,
          tier2_group_count: 2,
          tier3_key_count: 1,
          tier1_seeds: [
            { type: 'specs', source_name: null, is_needed: true },
            { type: 'source', source_name: 'razer.com', is_needed: true },
          ],
          tier2_groups: [
            { group_key: 'g1', productivity_score: 80, allocated: true },
            { group_key: 'g2', productivity_score: 60, allocated: true },
            { group_key: 'g3', productivity_score: 40, allocated: false },
          ],
          tier3_keys: [{ group_key: 'gk', key_count: 3, allocated_count: 1 }],
          overflow_group_count: 1,
          overflow_key_count: 2,
        },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const pi = result.panel.profile_influence;
      // Should use allocation-based counts, not aspirational
      assert.equal(pi.targeted_specification, 1, 'specs seed from allocation');
      assert.equal(pi.targeted_sources, 1, 'source seeds from allocation');
      assert.equal(pi.targeted_groups, 2, 'allocated groups, not all 3 worthy');
      assert.equal(pi.targeted_single, 1, 'allocated keys, not all 3');
      assert.equal(pi.budget, 5);
      assert.equal(pi.allocated, 5);
      assert.equal(pi.overflow_groups, 1);
      assert.equal(pi.overflow_keys, 2);
    });

    it('profile_influence falls back to aspirational when tier_allocation absent', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({ key: 'g1', phase: 'now', group_search_worthy: true, normalized_key_queue: ['a'] }),
          makeFocusGroup({ key: 'g2', phase: 'next', group_search_worthy: false, normalized_key_queue: ['b', 'c'] }),
        ],
        seed_status: { specs_seed: { is_needed: true }, source_seeds: { 'x.com': { is_needed: true } } },
        // No tier_allocation
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const pi = result.panel.profile_influence;
      assert.equal(pi.targeted_specification, 1);
      assert.equal(pi.targeted_sources, 1);
      assert.equal(pi.targeted_groups, 1, 'aspirational: 1 worthy group');
      assert.equal(pi.targeted_single, 2, 'aspirational: 2 keys from non-worthy');
      assert.equal(pi.budget, null, 'no budget without tier_allocation');
    });
  });

  // ===== GAP-11: panel deltas =====

  describe('panel deltas', () => {
    it('round 0 (no previous_round_fields) → deltas show all fields as new', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext({ previous_round_fields: null }),
        config: makeConfig(),
      });
      assert.ok(result.panel.deltas.length > 0, 'round 0 should show fields as new');
      assert.equal(result.panel.deltas[0].from, 'none');
    });

    it('changed field detected: prev missing → current satisfied', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        previous_round_fields: [
          { field_key: 'sensor', state: 'missing' },
          { field_key: 'dpi', state: 'missing' },
        ],
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['sensor', 'dpi'],
            satisfied_field_keys: ['sensor'],
            unresolved_field_keys: ['dpi'],
          }),
        ],
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.ok(result.panel.deltas.length >= 1);
      const sensorDelta = result.panel.deltas.find(d => d.field === 'sensor');
      assert.ok(sensorDelta, 'sensor delta present');
      assert.equal(sensorDelta.from, 'missing');
      assert.equal(sensorDelta.to, 'satisfied');
    });

    it('unchanged field not in deltas', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        previous_round_fields: [
          { field_key: 'dpi', state: 'missing' },
        ],
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['dpi'],
            unresolved_field_keys: ['dpi'],
          }),
        ],
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.equal(result.panel.deltas.length, 0);
    });

    it('multiple state transitions', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        previous_round_fields: [
          { field_key: 'sensor', state: 'missing' },
          { field_key: 'dpi', state: 'weak' },
          { field_key: 'weight', state: 'satisfied' },
        ],
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['sensor', 'dpi'],
            satisfied_field_keys: ['sensor', 'dpi'],
            unresolved_field_keys: [],
          }),
          makeFocusGroup({
            key: 'dimensions',
            phase: 'now',
            field_keys: ['weight'],
            conflict_field_keys: ['weight'],
            unresolved_field_keys: [],
          }),
        ],
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      assert.equal(result.panel.deltas.length, 3);
      const byField = Object.fromEntries(result.panel.deltas.map(d => [d.field, d]));
      assert.equal(byField.sensor.from, 'missing');
      assert.equal(byField.sensor.to, 'satisfied');
      assert.equal(byField.dpi.from, 'weak');
      assert.equal(byField.dpi.to, 'satisfied');
      assert.equal(byField.weight.from, 'satisfied');
      assert.equal(byField.weight.to, 'conflict');
    });
  });

  // ===== GAP-10: bundle fields[] =====

  describe('bundle fields[]', () => {
    it('bundle.fields has correct keys from field_keys', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const result = await buildSearchPlan({
        searchPlanningContext: makeSearchPlanningContext(),
        config: makeConfig(),
      });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      const fieldKeys = bundle.fields.map(f => f.key).sort();
      assert.deepStrictEqual(fieldKeys, ['dpi', 'sensor']);
    });

    it('state mapping: satisfied/weak/conflict/missing', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['sensor', 'dpi', 'polling_rate', 'lod'],
            satisfied_field_keys: ['sensor'],
            weak_field_keys: ['polling_rate'],
            conflict_field_keys: ['lod'],
            unresolved_field_keys: ['dpi'],
          }),
        ],
        field_priority_map: { sensor: 'critical', dpi: 'required', polling_rate: 'expected', lod: 'optional' },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      const byKey = Object.fromEntries(bundle.fields.map(f => [f.key, f]));
      assert.equal(byKey.sensor.state, 'satisfied');
      assert.equal(byKey.dpi.state, 'missing');
      assert.equal(byKey.polling_rate.state, 'weak');
      assert.equal(byKey.lod.state, 'conflict');
    });

    it('bucket mapping: mandatory→core, non_mandatory→optional', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['a', 'b'],
            unresolved_field_keys: ['a', 'b'],
          }),
        ],
        field_priority_map: { a: 'mandatory', b: 'non_mandatory' },
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      const byKey = Object.fromEntries(bundle.fields.map(f => [f.key, f]));
      assert.equal(byKey.a.bucket, 'core');
      assert.equal(byKey.b.bucket, 'optional');
    });

    it('unknown field_key defaults to optional bucket', async () => {
      fetchMock = installFetchMock(makeLlmResponse());
      const ctx = makeSearchPlanningContext({
        focus_groups: [
          makeFocusGroup({
            key: 'sensor_performance',
            field_keys: ['mystery'],
            unresolved_field_keys: ['mystery'],
          }),
        ],
        field_priority_map: {},
      });
      const result = await buildSearchPlan({ searchPlanningContext: ctx, config: makeConfig() });
      const bundle = result.panel.bundles.find(b => b.key === 'sensor_performance');
      assert.equal(bundle.fields[0].bucket, 'optional');
    });
  });

});
