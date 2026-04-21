// WHY: Observability contract for the focus_groups artifact. Before this fix,
// focusGroups[] lived only in-memory inside runNeedSet and was never persisted.
// Debugging tier 2 / tier 3 emission (are there worthy groups? which ones
// hit group_search_worthy?) required reading memory post-hoc — impossible.
// This test locks the event contract: runNeedSet MUST emit
// focus_groups_computed with focus_groups[] + seed_status so the bridge can
// upsert it as its own run_artifact.

import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import { runNeedSet } from '../runNeedSet.js';

function makeCtx({ events, focusGroups = [], seedStatus = {} }) {
  const logger = { info: (event, payload) => events.push({ event, payload }), warn: () => {} };
  return {
    config: {},
    job: { productId: 'mouse-test', category: 'mouse' },
    runId: 'test-run-1',
    category: 'mouse',
    categoryConfig: { category: 'mouse', fieldOrder: [], fieldGroups: {}, sourceHosts: [] },
    roundContext: { round: 0 },
    llmContext: null,
    logger,
    queryExecutionHistory: null,
    // DI: fake the needSet computations to return controlled outputs
    computeNeedSetFn: () => ({ fields: [], summary: {}, blockers: {}, planner_seed: {}, total_fields: 0, round: 0 }),
    buildSearchPlanningContextFn: () => ({ focus_groups: focusGroups, seed_status: seedStatus }),
    buildSearchPlanFn: async () => ({ search_plan_handoff: null, panel: null, schema_version: 'test' }),
  };
}

describe('runNeedSet — focus_groups_computed event (B4 observability)', () => {
  it('emits focus_groups_computed event after building planning context', async () => {
    const events = [];
    const focusGroups = [
      { key: 'g1', group_search_worthy: true, productivity_score: 80, unresolved_field_keys: ['a', 'b', 'c'] },
      { key: 'g2', group_search_worthy: false, normalized_key_queue: ['k1', 'k2'] },
    ];
    const seedStatus = { specs_seed: { is_needed: true }, source_seeds: { 'rtings.com': { is_needed: true } } };

    await runNeedSet(makeCtx({ events, focusGroups, seedStatus }));

    const fgc = events.find((e) => e.event === 'focus_groups_computed');
    ok(fgc, 'focus_groups_computed event must be emitted');
  });

  it('event payload contains focus_groups[] and seed_status', async () => {
    const events = [];
    const focusGroups = [
      { key: 'sensor_performance', group_search_worthy: true, productivity_score: 80 },
    ];
    const seedStatus = { specs_seed: { is_needed: true } };

    await runNeedSet(makeCtx({ events, focusGroups, seedStatus }));

    const fgc = events.find((e) => e.event === 'focus_groups_computed');
    ok(fgc, 'event present');
    deepStrictEqual(fgc.payload.focus_groups, focusGroups, 'focus_groups must match planningContext.focus_groups');
    deepStrictEqual(fgc.payload.seed_status, seedStatus, 'seed_status must match planningContext.seed_status');
  });

  it('event payload carries run_id, category, product_id for bridge routing', async () => {
    const events = [];
    await runNeedSet(makeCtx({ events, focusGroups: [], seedStatus: {} }));
    const fgc = events.find((e) => e.event === 'focus_groups_computed');
    strictEqual(fgc.payload.run_id, 'test-run-1');
    strictEqual(fgc.payload.category, 'mouse');
    strictEqual(fgc.payload.product_id, 'mouse-test');
  });

  it('empty focusGroups (round 0 no groups) still emits the event', async () => {
    const events = [];
    await runNeedSet(makeCtx({ events, focusGroups: [], seedStatus: {} }));
    const fgc = events.find((e) => e.event === 'focus_groups_computed');
    ok(fgc, 'event emitted even when focus_groups is empty');
    strictEqual(fgc.payload.focus_groups.length, 0);
  });
});
