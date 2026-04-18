// WHY: CEF integration — product-scoped URL/query history via the universal
// helper. Flags off → no "Previous searches" block. Flags on → all prior-run
// URLs/queries from this product appear (no variant matching — product scope).

import { describe, it } from 'node:test';
import { ok } from 'node:assert';
import { buildColorEditionFinderPrompt } from '../colorEditionLlmAdapter.js';
import { accumulateDiscoveryLog } from '../../../core/finder/discoveryLog.js';

// WHY: CEF persists gate-1 output under response.discovery.discovery_log
// (two-gate: discovery + identity_check). These test fixtures mirror that shape.
// The finder normalizes this to response.discovery_log before calling the
// universal accumulator — tests below assert the flat path still works AND
// a dedicated test asserts the nested two-gate path is lifted correctly.
const runs = [
  {
    ran_at: '2026-01-01T00:00:00Z',
    response: {
      discovery_log: {
        urls_checked: ['https://corsair.com/m75', 'https://amazon.com/dp/B123'],
        queries_run: ['corsair m75 colors'],
      },
    },
  },
  {
    ran_at: '2026-02-01T00:00:00Z',
    response: {
      discovery_log: {
        urls_checked: ['https://bestbuy.com/sku/123'],
        queries_run: ['corsair m75 editions'],
      },
    },
  },
];

// Real CEF response shape: nested under .discovery.
const twoGateRuns = [
  {
    ran_at: '2026-03-01T00:00:00Z',
    response: {
      discovery: {
        discovery_log: {
          urls_checked: ['https://corsair.com/gate1-url'],
          queries_run: ['gate1 query'],
        },
      },
      identity_check: { mappings: {}, remove: [], orphan_remaps: [] },
    },
  },
];

function normalizeCef(raw) {
  return raw.map((r) => ({
    ...r,
    response: { ...(r.response || {}), discovery_log: r.response?.discovery?.discovery_log },
  }));
}

const product = { brand: 'Corsair', model: 'M75', base_model: 'M75' };
const colors = [{ name: 'black', hex: '#000000' }];
const colorNames = ['black'];

describe('CEF discovery history — integration', () => {
  it('flags off → no "Previous searches" block', () => {
    const acc = accumulateDiscoveryLog(runs, { includeUrls: false, includeQueries: false });
    const prompt = buildColorEditionFinderPrompt({
      product, colors, colorNames, previousRuns: runs, previousDiscovery: acc,
    });
    ok(!prompt.includes('Previous searches'), 'no block when both toggles off');
  });

  it('URL on, query off → prompt includes URLs line (product-scoped, no variant filter)', () => {
    const acc = accumulateDiscoveryLog(runs, { includeUrls: true, includeQueries: false });
    const prompt = buildColorEditionFinderPrompt({
      product, colors, colorNames, previousRuns: runs, previousDiscovery: acc,
    });
    ok(prompt.includes('URLs already checked'));
    ok(prompt.includes('https://corsair.com/m75'));
    ok(prompt.includes('https://bestbuy.com/sku/123'));
    ok(!prompt.includes('Queries already run'));
  });

  it('both on → both lines present with scope label "this product"', () => {
    const acc = accumulateDiscoveryLog(runs, { includeUrls: true, includeQueries: true });
    const prompt = buildColorEditionFinderPrompt({
      product, colors, colorNames, previousRuns: runs, previousDiscovery: acc,
    });
    ok(prompt.includes('Previous searches for this product'));
    ok(prompt.includes('URLs already checked'));
    ok(prompt.includes('Queries already run'));
    ok(prompt.includes('corsair m75 colors'));
    ok(prompt.includes('corsair m75 editions'));
  });

  // Regression: CEF runs nest discovery_log under response.discovery.
  // Before normalization was added in colorEditionFinder.js, the accumulator
  // returned empty lists for real CEF runs because it looked at the wrong path.
  it('two-gate CEF runs: normalized shape surfaces the nested discovery_log', () => {
    const acc = accumulateDiscoveryLog(normalizeCef(twoGateRuns), {
      includeUrls: true,
      includeQueries: true,
    });
    ok(acc.urlsChecked.includes('https://corsair.com/gate1-url'));
    ok(acc.queriesRun.includes('gate1 query'));
  });

  it('two-gate CEF runs WITHOUT normalization → empty (proves the bug this fix addresses)', () => {
    const acc = accumulateDiscoveryLog(twoGateRuns, {
      includeUrls: true,
      includeQueries: true,
    });
    ok(acc.urlsChecked.length === 0, 'raw CEF shape is invisible to the flat-path accumulator');
    ok(acc.queriesRun.length === 0);
  });
});
