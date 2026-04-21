// WHY: Contract test for the two new Discovery History knobs. runSearchPlanner
// must only inject prior-run queries into the LLM payload when
// discoveryQueryHistoryEnabled is on, and only inject prior-run URLs when
// discoveryUrlHistoryEnabled is on. Both knobs default off, matching the
// per-finder pattern in finderModuleRegistry.js.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { runSearchPlanner } from '../runSearchPlanner.js';

const BASE_ROWS = [
  { query: 'brand model specs', hint_source: 'tier1_seed', tier: 'seed', target_fields: [], doc_hint: '', domain_hint: '', group_key: '' },
  { query: 'brand model review', hint_source: 'tier1_seed', tier: 'seed', target_fields: [], doc_hint: '', domain_hint: '', group_key: '' },
];

function makeBaseCtx(overrides = {}) {
  return {
    searchProfileBase: { query_rows: BASE_ROWS, base_templates: [] },
    queryExecutionHistory: null,
    urlExecutionHistory: null,
    config: {},
    identityLock: { brand: 'Brand', base_model: 'Model', model: 'Model', variant: '' },
    missingFields: [],
    logger: { info: () => {}, warn: () => {} },
    ...overrides,
  };
}

function captureEnhanceQueryRowsFn() {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    return { source: 'deterministic_fallback', rows: args.queryRows.map((r) => ({ ...r })) };
  };
  return { fn, calls };
}

describe('runSearchPlanner — Discovery History gating (query side)', () => {
  it('discoveryQueryHistoryEnabled=false → enhanceQueryRows called with queryHistory=[]', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: {
        queries: [
          { query_text: 'old query 1' },
          { query_text: 'old query 2' },
        ],
      },
      config: { discoveryQueryHistoryEnabled: false },
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    deepStrictEqual(calls[0].queryHistory, [], 'queryHistory must be empty when knob off');
  });

  it('discoveryQueryHistoryEnabled=true → enhanceQueryRows called with prior queries', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: {
        queries: [
          { query_text: 'old query 1' },
          { query_text: 'old query 2' },
        ],
      },
      config: { discoveryQueryHistoryEnabled: true },
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    const qh = calls[0].queryHistory;
    ok(Array.isArray(qh), 'queryHistory must be an array');
    ok(qh.includes('old query 1'), 'queryHistory must include prior query 1');
    ok(qh.includes('old query 2'), 'queryHistory must include prior query 2');
  });

  it('discoveryQueryHistoryEnabled=true but no prior queries → queryHistory=[]', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: { queries: [] },
      config: { discoveryQueryHistoryEnabled: true },
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    deepStrictEqual(calls[0].queryHistory, [], 'empty history → empty queryHistory');
  });

  it('discoveryQueryHistoryEnabled undefined (old config) defaults to off → queryHistory=[]', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: { queries: [{ query_text: 'old' }] },
      config: {}, // no knob set
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    deepStrictEqual(calls[0].queryHistory, [], 'missing knob defaults to off (safe default)');
  });
});

describe('runSearchPlanner — Discovery History gating (URL side)', () => {
  it('discoveryUrlHistoryEnabled=false → enhanceQueryRows called with urlHistory=[]', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      urlExecutionHistory: {
        urls: ['https://a.com/x', 'https://b.com/y'],
      },
      config: { discoveryUrlHistoryEnabled: false },
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    deepStrictEqual(calls[0].urlHistory, [], 'urlHistory must be empty when knob off');
  });

  it('discoveryUrlHistoryEnabled=true → enhanceQueryRows called with prior URLs', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      urlExecutionHistory: {
        urls: ['https://a.com/x', 'https://b.com/y'],
      },
      config: { discoveryUrlHistoryEnabled: true },
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    const uh = calls[0].urlHistory;
    ok(Array.isArray(uh));
    ok(uh.includes('https://a.com/x'));
    ok(uh.includes('https://b.com/y'));
  });

  it('discoveryUrlHistoryEnabled=true but no prior URLs → urlHistory=[]', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      urlExecutionHistory: { urls: [] },
      config: { discoveryUrlHistoryEnabled: true },
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    deepStrictEqual(calls[0].urlHistory, []);
  });

  it('discoveryUrlHistoryEnabled undefined defaults to off → urlHistory=[]', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      urlExecutionHistory: { urls: ['https://a.com/x'] },
      config: {},
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    deepStrictEqual(calls[0].urlHistory, []);
  });
});

describe('runSearchPlanner — Discovery History gating (both knobs off = current default behavior)', () => {
  it('both knobs off → payload has neither history populated', async () => {
    const { fn, calls } = captureEnhanceQueryRowsFn();
    await runSearchPlanner(makeBaseCtx({
      queryExecutionHistory: { queries: [{ query_text: 'q' }] },
      urlExecutionHistory: { urls: ['https://a.com/x'] },
      config: { discoveryQueryHistoryEnabled: false, discoveryUrlHistoryEnabled: false },
      _di: { enhanceQueryRowsFn: fn },
    }));
    strictEqual(calls.length, 1);
    deepStrictEqual(calls[0].queryHistory, []);
    deepStrictEqual(calls[0].urlHistory, []);
  });
});
