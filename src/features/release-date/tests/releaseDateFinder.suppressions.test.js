// WHY: RDF variant-scoped suppressions — suppression on v_black doesn't affect
// v_white's prompt (scope boundary).

import { describe, it } from 'node:test';
import { ok } from 'node:assert';
import { buildReleaseDateFinderPrompt } from '../releaseDateLlmAdapter.js';
import { accumulateDiscoveryLog } from '../../../core/finder/discoveryLog.js';

const runs = [
  { ran_at: '2026-04-18T00:00:00Z', response: {
    variant_id: 'v_black', variant_key: 'color:black',
    discovery_log: { urls_checked: ['https://bad.com'], queries_run: [] },
  } },
  { ran_at: '2026-04-18T00:00:00Z', response: {
    variant_id: 'v_white', variant_key: 'color:white',
    discovery_log: { urls_checked: ['https://bad.com'], queries_run: [] },
  } },
];

const product = { brand: 'Corsair', model: 'M75' };

function matcher(variant) {
  return (r) => (variant.variant_id && r.response?.variant_id)
    ? r.response.variant_id === variant.variant_id
    : r.response?.variant_key === variant.key;
}

describe('RDF suppressions — variant-scope boundary', () => {
  it('suppressing URL on v_black omits it from v_black prompt', () => {
    const variant = { variant_id: 'v_black', key: 'color:black', label: 'Black' };
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: matcher(variant),
      includeUrls: true, includeQueries: true,
      suppressions: { urlsChecked: new Set(['https://bad.com']), queriesRun: new Set() },
    });
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: variant.label, previousDiscovery: acc });
    ok(!prompt.includes('https://bad.com'));
  });

  it('suppressing URL on v_black leaves it visible in v_white prompt (scope boundary)', () => {
    const variant = { variant_id: 'v_white', key: 'color:white', label: 'White' };
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: matcher(variant),
      includeUrls: true, includeQueries: true,
      // Simulate: caller only passes v_white-scoped suppressions (empty here —
      // the bad URL was suppressed for v_black only, so nothing applies).
      suppressions: { urlsChecked: new Set(), queriesRun: new Set() },
    });
    const prompt = buildReleaseDateFinderPrompt({ product, variantLabel: variant.label, previousDiscovery: acc });
    ok(prompt.includes('https://bad.com'), 'v_white still sees it — suppression was v_black-scoped');
  });
});
