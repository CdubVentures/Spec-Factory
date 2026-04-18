// WHY: PIF integration — variant + mode-scoped URL/query history via the
// universal helper. View-mode runs don't leak into hero-mode runs and vice
// versa; other-variant runs don't leak either. Flags off → no block.

import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import { buildProductImageFinderPrompt, buildHeroImageFinderPrompt } from '../productImageLlmAdapter.js';
import { accumulateDiscoveryLog } from '../../../core/finder/discoveryLog.js';

const runs = [
  {
    ran_at: '2026-01-01T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black', mode: 'view',
      discovery_log: {
        urls_checked: ['https://mfr.com/black-view'],
        queries_run: ['corsair m75 black views'],
      },
    },
  },
  {
    ran_at: '2026-02-01T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black', mode: 'hero',
      discovery_log: {
        urls_checked: ['https://mfr.com/black-hero'],
        queries_run: ['corsair m75 black lifestyle'],
      },
    },
  },
  {
    ran_at: '2026-02-15T00:00:00Z',
    response: {
      variant_id: 'v_white', variant_key: 'color:white', mode: 'view',
      discovery_log: {
        urls_checked: ['https://mfr.com/white-view'],
        queries_run: ['corsair m75 white views'],
      },
    },
  },
];

function variantMatcher(variant, targetMode) {
  return (r) => {
    const rId = r.response?.variant_id;
    const rKey = r.response?.variant_key;
    const vm = (variant.variant_id && rId) ? rId === variant.variant_id : rKey === variant.key;
    return vm && r.response?.mode === targetMode;
  };
}

const product = { brand: 'Corsair', model: 'M75' };
const variant = { variant_id: 'v_black', key: 'color:black' };
const viewConfig = [{ key: 'top', description: 'top view', priority: true }];

describe('PIF discovery history — integration', () => {
  it('flags off → no "Previous searches" block in either prompt', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: variantMatcher(variant, 'view'),
      includeUrls: false,
      includeQueries: false,
    });
    const viewPrompt = buildProductImageFinderPrompt({
      product, variantLabel: 'Black', viewConfig, previousDiscovery: acc,
    });
    const heroPrompt = buildHeroImageFinderPrompt({
      product, variantLabel: 'Black', previousDiscovery: acc,
    });
    ok(!viewPrompt.includes('Previous searches'));
    ok(!heroPrompt.includes('Previous searches'));
  });

  it('view-mode prompt with URL on → includes view-mode URLs only (hero URLs excluded)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: variantMatcher(variant, 'view'),
      includeUrls: true,
      includeQueries: false,
    });
    const prompt = buildProductImageFinderPrompt({
      product, variantLabel: 'Black', viewConfig, previousDiscovery: acc,
    });
    ok(prompt.includes('https://mfr.com/black-view'));
    ok(!prompt.includes('https://mfr.com/black-hero'), 'hero URLs must not leak into view prompt');
    ok(!prompt.includes('https://mfr.com/white-view'), 'other variant URLs must not leak');
  });

  it('hero-mode prompt with URL on → includes hero-mode URLs only (view URLs excluded)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: variantMatcher(variant, 'hero'),
      includeUrls: true,
      includeQueries: false,
    });
    const prompt = buildHeroImageFinderPrompt({
      product, variantLabel: 'Black', previousDiscovery: acc,
    });
    ok(prompt.includes('https://mfr.com/black-hero'));
    ok(!prompt.includes('https://mfr.com/black-view'), 'view URLs must not leak into hero prompt');
  });

  it('view-mode scope label reads "this variant\'s view searches"', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: variantMatcher(variant, 'view'),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildProductImageFinderPrompt({
      product, variantLabel: 'Black', viewConfig, previousDiscovery: acc,
    });
    ok(prompt.includes("this variant's view searches"));
  });

  it('hero-mode scope label reads "this variant\'s hero searches"', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: variantMatcher(variant, 'hero'),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildHeroImageFinderPrompt({
      product, variantLabel: 'Black', previousDiscovery: acc,
    });
    ok(prompt.includes("this variant's hero searches"));
  });

  it('both flags on → both URL + query lines present, scoped correctly', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: variantMatcher(variant, 'view'),
      includeUrls: true,
      includeQueries: true,
    });
    strictEqual(acc.urlsChecked.length, 1);
    strictEqual(acc.queriesRun.length, 1);
    strictEqual(acc.urlsChecked[0], 'https://mfr.com/black-view');
    strictEqual(acc.queriesRun[0], 'corsair m75 black views');
  });
});
