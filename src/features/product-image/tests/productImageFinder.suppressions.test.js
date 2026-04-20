// WHY: PIF variant+mode-scoped suppressions — view-mode suppression on v_black
// doesn't affect v_black's hero-mode prompt (mode boundary).

import { describe, it } from 'node:test';
import { ok } from 'node:assert';
import { buildProductImageFinderPrompt, buildHeroImageFinderPrompt } from '../productImageLlmAdapter.js';
import { accumulateDiscoveryLog } from '../../../core/finder/discoveryLog.js';

const runs = [
  { ran_at: '2026-04-18T00:00:00Z', response: {
    variant_id: 'v_black', variant_key: 'color:black', mode: 'view',
    discovery_log: { urls_checked: ['https://bad.com'], queries_run: [] },
  } },
  { ran_at: '2026-04-18T00:00:00Z', response: {
    variant_id: 'v_black', variant_key: 'color:black', mode: 'hero',
    discovery_log: { urls_checked: ['https://bad.com'], queries_run: [] },
  } },
];

const product = { brand: 'Corsair', model: 'M75' };
const variant = { variant_id: 'v_black', key: 'color:black' };
const priorityViews = [{ key: 'top', description: 'top' }];

function matcher(v, mode) {
  return (r) => (v.variant_id && r.response?.variant_id)
    ? r.response.variant_id === v.variant_id && r.response?.mode === mode
    : r.response?.variant_key === v.key && r.response?.mode === mode;
}

describe('PIF suppressions — mode-scope boundary', () => {
  it('suppressing URL under view-mode omits it from view prompt', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: matcher(variant, 'view'),
      includeUrls: true, includeQueries: true,
      suppressions: { urlsChecked: new Set(['https://bad.com']), queriesRun: new Set() },
    });
    const prompt = buildProductImageFinderPrompt({
      product, variantLabel: 'Black', priorityViews, previousDiscovery: acc,
    });
    ok(!prompt.includes('https://bad.com'));
  });

  it('same URL NOT suppressed under hero-mode — hero prompt still shows it (mode boundary)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: matcher(variant, 'hero'),
      includeUrls: true, includeQueries: true,
      // Caller passes hero-scoped suppressions (empty — the view-mode suppression doesn't apply).
      suppressions: { urlsChecked: new Set(), queriesRun: new Set() },
    });
    const prompt = buildHeroImageFinderPrompt({ product, variantLabel: 'Black', previousDiscovery: acc });
    ok(prompt.includes('https://bad.com'), 'hero-mode still sees it — suppression was view-mode-scoped');
  });
});
