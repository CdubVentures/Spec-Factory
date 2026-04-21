// WHY: When discoveryQueryHistoryEnabled is on, runSearchPlanner must
// (1) call enforceNovelty on the enhanced rows (2) emit a novelty_rate
// telemetry signal in the search_plan_generated event, so we can observe
// run-over-run whether the LLM actually produced novelty or rubber-stamped
// the history. When the knob is off, novelty_rate = 1 (trivially all novel
// because no history was injected).

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { runSearchPlanner } from '../runSearchPlanner.js';

function makeLogger() {
  const events = [];
  return {
    info: (type, payload) => events.push({ type, payload }),
    warn: (type, payload) => events.push({ type, payload }),
    events,
  };
}

const BASE_ROWS = [
  { query: 'brand model specs', hint_source: 'tier1_seed', tier: 'seed', target_fields: [], doc_hint: '', domain_hint: '', group_key: '' },
  { query: 'brand model review', hint_source: 'tier1_seed', tier: 'seed', target_fields: [], doc_hint: '', domain_hint: '', group_key: '' },
  { query: 'brand model weight', hint_source: 'tier1_seed', tier: 'seed', target_fields: [], doc_hint: '', domain_hint: '', group_key: '' },
];

function makeBaseCtx(overrides = {}) {
  return {
    searchProfileBase: { query_rows: BASE_ROWS, base_templates: [] },
    queryExecutionHistory: null,
    urlExecutionHistory: null,
    config: {},
    identityLock: { brand: 'Brand', base_model: 'Model', model: 'Model', variant: '' },
    missingFields: [],
    logger: makeLogger(),
    ...overrides,
  };
}

// enhance stub that returns exactly what it gets (no LLM call)
function stubEnhance(rowsOverride = null) {
  return async (args) => ({
    source: 'llm',
    rows: (rowsOverride || args.queryRows).map((r) => ({ ...r })),
  });
}

describe('runSearchPlanner — novelty_rate telemetry signal', () => {
  it('knob off → novelty_rate = 1 (no history injected, so by definition nothing stale)', async () => {
    const logger = makeLogger();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: { queries: [{ query_text: 'brand model specs' }] },
      config: { discoveryQueryHistoryEnabled: false },
      logger,
      _di: { enhanceQueryRowsFn: stubEnhance() },
    }));
    const evt = logger.events.find((e) => e.type === 'search_plan_generated');
    ok(evt, 'search_plan_generated must be emitted');
    strictEqual(evt.payload.novelty_rate, 1);
  });

  it('knob on, all 3 queries in history → novelty_rate = 0, rotations_applied = 3', async () => {
    const logger = makeLogger();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: {
        queries: [
          { query_text: 'brand model specs' },
          { query_text: 'brand model review' },
          { query_text: 'brand model weight' },
        ],
      },
      config: { discoveryQueryHistoryEnabled: true },
      logger,
      _di: { enhanceQueryRowsFn: stubEnhance() },
    }));
    const evt = logger.events.find((e) => e.type === 'search_plan_generated');
    ok(evt);
    strictEqual(evt.payload.novelty_rate, 0);
    strictEqual(evt.payload.rotations_applied, 3);
  });

  it('knob on, 1 of 3 stale → novelty_rate = 2/3, rotations_applied = 1', async () => {
    const logger = makeLogger();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: {
        queries: [{ query_text: 'brand model specs' }], // only 1 stale
      },
      config: { discoveryQueryHistoryEnabled: true },
      logger,
      _di: { enhanceQueryRowsFn: stubEnhance() },
    }));
    const evt = logger.events.find((e) => e.type === 'search_plan_generated');
    ok(evt);
    strictEqual(Math.round(evt.payload.novelty_rate * 100) / 100, 0.67);
    strictEqual(evt.payload.rotations_applied, 1);
  });

  it('rotated queries appear in enhancedRows output (result flows downstream)', async () => {
    const logger = makeLogger();
    const result = await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: {
        queries: [{ query_text: 'brand model specs' }],
      },
      config: { discoveryQueryHistoryEnabled: true },
      logger,
      _di: { enhanceQueryRowsFn: stubEnhance() },
    }));
    // The first row ('brand model specs') should be rotated.
    const first = result.enhancedRows[0];
    ok(first.query !== 'brand model specs', 'rotated query must differ from original');
    ok(first.query.startsWith('brand model specs'), 'rotation preserves prefix');
  });

  it('llm_query_planning side effect: event payload has novelty_rate as observable signal', async () => {
    // WHY: novelty_rate replaces the old always-false llm_query_planning flag as
    // the "is the LLM actually doing its job" indicator. A value < 1 means the
    // LLM+prompt produced at least one rotated query.
    const logger = makeLogger();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: { queries: [{ query_text: 'brand model specs' }] },
      config: { discoveryQueryHistoryEnabled: true },
      logger,
      _di: { enhanceQueryRowsFn: stubEnhance() },
    }));
    const evt = logger.events.find((e) => e.type === 'search_plan_generated');
    ok('novelty_rate' in evt.payload, 'novelty_rate must be present');
    ok('rotations_applied' in evt.payload, 'rotations_applied must be present');
  });
});
