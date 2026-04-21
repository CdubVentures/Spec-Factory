// WHY: Characterization + contract test for the cooldown read-gate in
// runQueryJourney. Bug B10: `query_cooldowns` rows got written with a 30-day
// `cooldown_until`, but runQueryJourney silently skipped the read-side filter
// — so the same 10 queries ran every run, attempt_count climbing to 10×. This
// test locks the contract: when queryCooldownDays > 0 and a query's
// cooldown_until is still in the future, it MUST be filtered out of the emitted
// queries list AND pruned from selectedQueryRowMap so downstream stays
// consistent. Starvation protection: if the filter would empty the queue,
// fall back to emitting all queries (logging the starved event) so we don't
// break the run.
//
// Input shape notes:
// - queryExecutionHistory.queries[] comes from crawlLedgerStore.buildQueryExecutionHistory()
//   and already has { query_text, cooldown_until, tier, hint_source, ... }
// - config.queryCooldownDays is the sole on/off switch (0 = disabled).

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { runQueryJourney } from '../runQueryJourney.js';

function makeRow(query, overrides = {}) {
  return {
    query,
    hint_source: 'tier1_seed',
    target_fields: [],
    doc_hint: '',
    domain_hint: '',
    tier: 'seed',
    group_key: '',
    normalized_key: '',
    source_host: '',
    ...overrides,
  };
}

function makeCooldown(queryText, cooldownUntilIso) {
  return {
    query_text: queryText,
    tier: 'seed',
    group_key: null,
    normalized_key: null,
    hint_source: 'tier1_seed_llm',
    source_name: '',
    completed_at_ms: Date.now() - 60_000,
    attempt_count: 1,
    cooldown_until: cooldownUntilIso,
  };
}

function makeCtx({ enhancedRows, queryExecutionHistory = null, config = {} } = {}) {
  return {
    searchProfileBase: {
      query_rows: enhancedRows,
      base_templates: [],
      variant_guard_terms: [],
      query_reject_log: [],
    },
    enhancedRows,
    variables: { brand_tokens: ['Brand'], model_tokens: ['Model'] },
    config: { searchProfileQueryCap: 20, searchEngines: 'google', ...config },
    missingFields: [],
    planningHints: {},
    categoryConfig: { category: 'mouse' },
    job: { productId: 'mouse-test' },
    runId: 'test-run',
    logger: { info: () => {} },
    storage: null,
    brandResolution: null,
    queryExecutionHistory,
  };
}

function futureIso(days = 7) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
function pastIso(days = 1) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

describe('runQueryJourney — cooldown gate (B10 fix)', () => {
  it('queryCooldownDays=0 → filter is off, all queries pass through', async () => {
    const rows = [
      makeRow('Brand Model specs'),
      makeRow('Brand Model review'),
      makeRow('Brand Model weight'),
    ];
    const history = {
      queries: [
        makeCooldown('Brand Model specs', futureIso(30)),
        makeCooldown('Brand Model review', futureIso(30)),
      ],
    };
    const result = await runQueryJourney(makeCtx({
      enhancedRows: rows,
      queryExecutionHistory: history,
      config: { queryCooldownDays: 0 },
    }));
    strictEqual(result.queries.length, 3, 'gate off must keep all 3');
    ok(result.queries.includes('Brand Model specs'));
    ok(result.queries.includes('Brand Model review'));
    ok(result.queries.includes('Brand Model weight'));
  });

  it('queryCooldownDays=30, 2 of 3 queries cooled → emits only the 1 fresh one', async () => {
    const rows = [
      makeRow('Brand Model specs'),     // cooled
      makeRow('Brand Model review'),    // cooled
      makeRow('Brand Model weight'),    // fresh
    ];
    const history = {
      queries: [
        makeCooldown('Brand Model specs', futureIso(15)),
        makeCooldown('Brand Model review', futureIso(20)),
      ],
    };
    const result = await runQueryJourney(makeCtx({
      enhancedRows: rows,
      queryExecutionHistory: history,
      config: { queryCooldownDays: 30 },
    }));
    strictEqual(result.queries.length, 1, 'only 1 fresh query should emit');
    strictEqual(result.queries[0], 'Brand Model weight');
  });

  it('queryCooldownDays=30, all queries cooled → starvation protection keeps all + flags event', async () => {
    const rows = [
      makeRow('Brand Model specs'),
      makeRow('Brand Model review'),
    ];
    const history = {
      queries: [
        makeCooldown('Brand Model specs', futureIso(30)),
        makeCooldown('Brand Model review', futureIso(30)),
      ],
    };
    const events = [];
    const ctx = makeCtx({
      enhancedRows: rows,
      queryExecutionHistory: history,
      config: { queryCooldownDays: 30 },
    });
    ctx.logger = { info: (event, payload) => events.push({ event, payload }) };
    const result = await runQueryJourney(ctx);
    strictEqual(result.queries.length, 2, 'starvation fallback must keep all queries');
    // WHY: cooldown_gate_starved carried as a flag on query_journey_completed,
    // not a separate event (the bridge whitelist would drop a standalone event).
    const qjc = events.find((e) => e.event === 'query_journey_completed');
    ok(qjc, 'query_journey_completed must be emitted');
    strictEqual(qjc.payload.cooldown_gate_starved, true, 'starvation flag must be set');
  });

  it('queryCooldownDays=30, cooldown_until in the past → query is NOT filtered (expiry works)', async () => {
    const rows = [makeRow('Brand Model specs')];
    const history = {
      queries: [makeCooldown('Brand Model specs', pastIso(1))],
    };
    const result = await runQueryJourney(makeCtx({
      enhancedRows: rows,
      queryExecutionHistory: history,
      config: { queryCooldownDays: 30 },
    }));
    strictEqual(result.queries.length, 1, 'expired cooldown must not filter');
    strictEqual(result.queries[0], 'Brand Model specs');
  });

  it('cooldown normalization is case-insensitive', async () => {
    // WHY: Two queries so starvation protection doesn't fire when the cased one is filtered.
    const rows = [
      makeRow('Brand Model Specs'),   // should match cooldown 'brand model specs' (case-insensitive)
      makeRow('Brand Model keeper'),  // fresh — ensures queue isn't empty after filter
    ];
    const history = {
      queries: [makeCooldown('brand model specs', futureIso(10))],
    };
    const result = await runQueryJourney(makeCtx({
      enhancedRows: rows,
      queryExecutionHistory: history,
      config: { queryCooldownDays: 30 },
    }));
    strictEqual(result.queries.length, 1, 'case-insensitive match must filter the cased query');
    strictEqual(result.queries[0], 'Brand Model keeper');
  });

  it('selectedQueryRowMap stays in sync with filtered queries', async () => {
    const rows = [
      makeRow('Brand Model specs'),   // cooled
      makeRow('Brand Model weight'),  // fresh
    ];
    const history = {
      queries: [makeCooldown('Brand Model specs', futureIso(10))],
    };
    const result = await runQueryJourney(makeCtx({
      enhancedRows: rows,
      queryExecutionHistory: history,
      config: { queryCooldownDays: 30 },
    }));
    strictEqual(result.selectedQueryRowMap.size, 1, 'map must only contain fresh query');
    ok(result.selectedQueryRowMap.has('brand model weight'), 'fresh query must be in map');
    ok(!result.selectedQueryRowMap.has('brand model specs'), 'cooled query must NOT be in map');
  });

  it('queryRejectLogCombined records cooldown_active reason for each filtered query', async () => {
    const rows = [
      makeRow('Brand Model specs'),
      makeRow('Brand Model review'),
      makeRow('Brand Model weight'),
    ];
    const history = {
      queries: [
        makeCooldown('Brand Model specs', futureIso(10)),
        makeCooldown('Brand Model review', futureIso(20)),
      ],
    };
    const result = await runQueryJourney(makeCtx({
      enhancedRows: rows,
      queryExecutionHistory: history,
      config: { queryCooldownDays: 30 },
    }));
    const cooldownRejects = result.queryRejectLogCombined.filter((r) => r.reason === 'cooldown_active');
    strictEqual(cooldownRejects.length, 2);
    const queries = cooldownRejects.map((r) => r.query).sort();
    deepStrictEqual(queries, ['Brand Model review', 'Brand Model specs']);
    for (const r of cooldownRejects) {
      strictEqual(r.stage, 'pre_execution_cooldown');
    }
  });

  it('queryExecutionHistory missing entirely → no filter applied', async () => {
    const rows = [makeRow('Brand Model specs'), makeRow('Brand Model review')];
    const result = await runQueryJourney(makeCtx({
      enhancedRows: rows,
      queryExecutionHistory: null,
      config: { queryCooldownDays: 30 },
    }));
    strictEqual(result.queries.length, 2, 'null history means no filter applied');
  });
});
