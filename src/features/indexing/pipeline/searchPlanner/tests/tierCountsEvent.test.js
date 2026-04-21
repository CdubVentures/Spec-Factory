// WHY: Contract test for tier_counts telemetry in search_plan_generated.
// Without per-tier visibility, the only way to tell whether tier 2 / tier 3
// emitted any rows was to parse queries_generated[] and match against tier
// rules. tier_counts gives a single O(1) lookup per run so observability
// surfaces (GUI, bridge, analytics) don't have to re-derive it.

import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import { runSearchPlanner } from '../runSearchPlanner.js';

function makeCtx({ queryRows, enhanceResult, events }) {
  const logger = { info: (event, payload) => events.push({ event, payload }), warn: () => {} };
  return {
    searchProfileBase: { query_rows: queryRows, base_templates: [] },
    queryExecutionHistory: null,
    urlExecutionHistory: null,
    config: {},
    logger,
    identityLock: { brand: 'Razer', base_model: 'Viper', model: 'Viper', variant: '' },
    missingFields: [],
    llmContext: null,
    _di: { enhanceQueryRowsFn: async () => enhanceResult },
  };
}

describe('runSearchPlanner — tier_counts in search_plan_generated', () => {
  it('emits tier_counts with counts per tier when all three tiers present', async () => {
    const events = [];
    const queryRows = [
      { query: 'q1', tier: 'seed', hint_source: 'tier1_seed' },
      { query: 'q2', tier: 'seed', hint_source: 'tier1_seed' },
      { query: 'q3', tier: 'group_search', hint_source: 'tier2_group', group_key: 'sensor' },
      { query: 'q4', tier: 'key_search', hint_source: 'tier3_key', normalized_key: 'dpi' },
      { query: 'q5', tier: 'key_search', hint_source: 'tier3_key', normalized_key: 'polling_rate' },
    ];
    await runSearchPlanner(makeCtx({
      queryRows,
      enhanceResult: { source: 'deterministic_fallback', rows: queryRows },
      events,
    }));
    const spg = events.find((e) => e.event === 'search_plan_generated');
    ok(spg, 'search_plan_generated emitted');
    deepStrictEqual(spg.payload.tier_counts, { seed: 2, group_search: 1, key_search: 2 });
  });

  it('tier_counts reports zero-count tiers explicitly (so the GUI shows 0)', async () => {
    const events = [];
    const queryRows = [{ query: 'q1', tier: 'seed', hint_source: 'tier1_seed' }];
    await runSearchPlanner(makeCtx({
      queryRows,
      enhanceResult: { source: 'deterministic_fallback', rows: queryRows },
      events,
    }));
    const spg = events.find((e) => e.event === 'search_plan_generated');
    deepStrictEqual(spg.payload.tier_counts, { seed: 1, group_search: 0, key_search: 0 });
  });

  it('empty rows yields zero counts for all three tiers (no crash)', async () => {
    const events = [];
    await runSearchPlanner(makeCtx({
      queryRows: [],
      enhanceResult: { source: 'deterministic_fallback', rows: [] },
      events,
    }));
    const spg = events.find((e) => e.event === 'search_plan_generated');
    deepStrictEqual(spg.payload.tier_counts, { seed: 0, group_search: 0, key_search: 0 });
  });

  it('unknown tier values (e.g. "" or null) are bucketed separately, not silently dropped', async () => {
    const events = [];
    const queryRows = [
      { query: 'q1', tier: 'seed', hint_source: 'tier1_seed' },
      { query: 'q2', tier: '', hint_source: '' },
      { query: 'q3', tier: null, hint_source: '' },
    ];
    await runSearchPlanner(makeCtx({
      queryRows,
      enhanceResult: { source: 'deterministic_fallback', rows: queryRows },
      events,
    }));
    const spg = events.find((e) => e.event === 'search_plan_generated');
    strictEqual(spg.payload.tier_counts.seed, 1);
    // Unknown/empty tier shouldn't inflate seed/group/key counts.
    strictEqual(spg.payload.tier_counts.group_search, 0);
    strictEqual(spg.payload.tier_counts.key_search, 0);
  });
});
