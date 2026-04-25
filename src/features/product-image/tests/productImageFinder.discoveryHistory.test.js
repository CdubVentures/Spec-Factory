// WHY: PIF integration — variant + run_scope_key-scoped URL/query history.
// Each run pool (priority-view, view:<focus>, loop-view, loop-hero, hero) is
// isolated so cross-pool URLs/queries don't mis-signal "exhausted" to the LLM.
// Other-variant runs don't leak either. Flags off → no block.

import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import { buildProductImageFinderPrompt, buildHeroImageFinderPrompt } from '../productImageLlmAdapter.js';
import { accumulateDiscoveryLog } from '../../../core/finder/discoveryLog.js';
import { resolveRunScopeKey, scopeLabelFor } from '../runScope.js';

const runs = [
  {
    ran_at: '2026-01-01T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black', mode: 'view',
      run_scope_key: 'priority-view',
      discovery_log: {
        urls_checked: ['https://mfr.com/black-priority'],
        queries_run: ['corsair m75 black priority'],
      },
    },
  },
  {
    ran_at: '2026-01-05T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black', mode: 'view',
      run_scope_key: 'view:top',
      discovery_log: {
        urls_checked: ['https://mfr.com/black-top'],
        queries_run: ['corsair m75 black top'],
      },
    },
  },
  {
    ran_at: '2026-01-06T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black', mode: 'view',
      run_scope_key: 'view:left',
      discovery_log: {
        urls_checked: ['https://mfr.com/black-left'],
        queries_run: ['corsair m75 black left'],
      },
    },
  },
  {
    ran_at: '2026-01-10T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black', mode: 'view',
      run_scope_key: 'loop-view',
      discovery_log: {
        urls_checked: ['https://mfr.com/black-loopview'],
        queries_run: ['corsair m75 black loop view'],
      },
    },
  },
  {
    ran_at: '2026-02-01T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black', mode: 'hero',
      run_scope_key: 'hero',
      discovery_log: {
        urls_checked: ['https://mfr.com/black-hero'],
        queries_run: ['corsair m75 black lifestyle'],
      },
    },
  },
  {
    ran_at: '2026-02-05T00:00:00Z',
    response: {
      variant_id: 'v_black', variant_key: 'color:black', mode: 'hero',
      run_scope_key: 'loop-hero',
      discovery_log: {
        urls_checked: ['https://mfr.com/black-loophero'],
        queries_run: ['corsair m75 black loop hero'],
      },
    },
  },
  {
    ran_at: '2026-02-15T00:00:00Z',
    response: {
      variant_id: 'v_white', variant_key: 'color:white', mode: 'view',
      run_scope_key: 'priority-view',
      discovery_log: {
        urls_checked: ['https://mfr.com/white-priority'],
        queries_run: ['corsair m75 white priority'],
      },
    },
  },
];

function poolMatcher(variant, runScopeKey) {
  return (r) => {
    const rId = r.response?.variant_id;
    const rKey = r.response?.variant_key;
    const vm = (variant.variant_id && rId) ? rId === variant.variant_id : rKey === variant.key;
    return vm && r.response?.run_scope_key === runScopeKey;
  };
}

const product = { brand: 'Corsair', model: 'M75' };
const variant = { variant_id: 'v_black', key: 'color:black' };
const priorityViews = [{ key: 'top', description: 'top view' }];

describe('resolveRunScopeKey', () => {
  it('single + view + null focus → priority-view', () => {
    strictEqual(resolveRunScopeKey({ orchestrator: 'single', mode: 'view', focusView: null }), 'priority-view');
  });
  it('single + view + focus → view:<focus>', () => {
    strictEqual(resolveRunScopeKey({ orchestrator: 'single', mode: 'view', focusView: 'top' }), 'view:top');
    strictEqual(resolveRunScopeKey({ orchestrator: 'single', mode: 'view', focusView: 'left' }), 'view:left');
  });
  it('single + hero → hero', () => {
    strictEqual(resolveRunScopeKey({ orchestrator: 'single', mode: 'hero' }), 'hero');
  });
  it('loop + view → loop-view (focus ignored)', () => {
    strictEqual(resolveRunScopeKey({ orchestrator: 'loop', mode: 'view', focusView: 'top' }), 'loop-view');
    strictEqual(resolveRunScopeKey({ orchestrator: 'loop', mode: 'view' }), 'loop-view');
  });
  it('loop + hero → loop-hero', () => {
    strictEqual(resolveRunScopeKey({ orchestrator: 'loop', mode: 'hero' }), 'loop-hero');
  });
});

describe('scopeLabelFor', () => {
  it('returns pool-specific labels', () => {
    strictEqual(scopeLabelFor('priority-view'), "this variant's priority-view searches");
    strictEqual(scopeLabelFor('loop-view'),     "this variant's loop view searches");
    strictEqual(scopeLabelFor('loop-hero'),     "this variant's loop hero searches");
    strictEqual(scopeLabelFor('hero'),          "this variant's hero searches");
    strictEqual(scopeLabelFor('view:top'),      "this variant's top-view searches");
    strictEqual(scopeLabelFor('view:left'),     "this variant's left-view searches");
  });
});

describe('PIF discovery history — pool isolation', () => {
  it('flags off → no "Previous searches" block in either prompt', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'priority-view'),
      includeUrls: false,
      includeQueries: false,
    });
    const viewPrompt = buildProductImageFinderPrompt({
      product, variantLabel: 'Black', priorityViews, previousDiscovery: acc,
    });
    const heroPrompt = buildHeroImageFinderPrompt({
      product, variantLabel: 'Black', previousDiscovery: acc,
    });
    ok(!viewPrompt.includes('Previous searches'));
    ok(!heroPrompt.includes('Previous searches'));
  });

  it('priority-view matcher → only priority-view URLs (no view:top, no loop-view, no hero, no other-variant)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'priority-view'),
      includeUrls: true,
      includeQueries: false,
    });
    strictEqual(acc.urlsChecked.length, 1);
    strictEqual(acc.urlsChecked[0], 'https://mfr.com/black-priority');
    ok(!acc.urlsChecked.includes('https://mfr.com/black-top'));
    ok(!acc.urlsChecked.includes('https://mfr.com/black-loopview'));
    ok(!acc.urlsChecked.includes('https://mfr.com/black-hero'));
    ok(!acc.urlsChecked.includes('https://mfr.com/white-priority'));
  });

  it('view:top matcher → only view:top URLs (no view:left, no priority-view)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'view:top'),
      includeUrls: true,
      includeQueries: false,
    });
    strictEqual(acc.urlsChecked.length, 1);
    strictEqual(acc.urlsChecked[0], 'https://mfr.com/black-top');
    ok(!acc.urlsChecked.includes('https://mfr.com/black-left'));
    ok(!acc.urlsChecked.includes('https://mfr.com/black-priority'));
  });

  it('loop-view matcher → only loop-view URLs (excludes priority-view + view:* + loop-hero)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'loop-view'),
      includeUrls: true,
      includeQueries: false,
    });
    strictEqual(acc.urlsChecked.length, 1);
    strictEqual(acc.urlsChecked[0], 'https://mfr.com/black-loopview');
    ok(!acc.urlsChecked.includes('https://mfr.com/black-priority'));
    ok(!acc.urlsChecked.includes('https://mfr.com/black-top'));
    ok(!acc.urlsChecked.includes('https://mfr.com/black-loophero'));
  });

  it('loop-hero matcher → only loop-hero URLs (excludes standalone hero)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'loop-hero'),
      includeUrls: true,
      includeQueries: false,
    });
    strictEqual(acc.urlsChecked.length, 1);
    strictEqual(acc.urlsChecked[0], 'https://mfr.com/black-loophero');
    ok(!acc.urlsChecked.includes('https://mfr.com/black-hero'));
  });

  it('hero matcher → only standalone hero URLs (excludes loop-hero)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'hero'),
      includeUrls: true,
      includeQueries: false,
    });
    strictEqual(acc.urlsChecked.length, 1);
    strictEqual(acc.urlsChecked[0], 'https://mfr.com/black-hero');
    ok(!acc.urlsChecked.includes('https://mfr.com/black-loophero'));
  });

  it('runs missing run_scope_key are skipped (no backfill)', () => {
    const legacyRuns = [
      {
        ran_at: '2025-12-01T00:00:00Z',
        response: {
          variant_id: 'v_black', variant_key: 'color:black', mode: 'view',
          // no run_scope_key
          discovery_log: { urls_checked: ['https://legacy/url'], queries_run: [] },
        },
      },
    ];
    const acc = accumulateDiscoveryLog(legacyRuns, {
      runMatcher: poolMatcher(variant, 'priority-view'),
      includeUrls: true,
      includeQueries: true,
    });
    strictEqual(acc.urlsChecked.length, 0);
  });

  it('priority-view scope label flows to view prompt', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'priority-view'),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildProductImageFinderPrompt({
      product, variantLabel: 'Black', priorityViews, previousDiscovery: acc,
      scopeLabel: scopeLabelFor('priority-view'),
    });
    ok(prompt.includes("this variant's priority-view searches"));
  });

  it('view:top scope label flows to view prompt', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'view:top'),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildProductImageFinderPrompt({
      product, variantLabel: 'Black', priorityViews, previousDiscovery: acc,
      scopeLabel: scopeLabelFor('view:top'),
    });
    ok(prompt.includes("this variant's top-view searches"));
  });

  it('loop-view scope label flows to view prompt', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'loop-view'),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildProductImageFinderPrompt({
      product, variantLabel: 'Black', priorityViews, previousDiscovery: acc,
      scopeLabel: scopeLabelFor('loop-view'),
    });
    ok(prompt.includes("this variant's loop view searches"));
  });

  it('loop-hero scope label flows to hero prompt', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'loop-hero'),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildHeroImageFinderPrompt({
      product, variantLabel: 'Black', previousDiscovery: acc,
      scopeLabel: scopeLabelFor('loop-hero'),
    });
    ok(prompt.includes("this variant's loop hero searches"));
  });

  it('hero scope label flows to hero prompt (default)', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'hero'),
      includeUrls: true,
      includeQueries: true,
    });
    const prompt = buildHeroImageFinderPrompt({
      product, variantLabel: 'Black', previousDiscovery: acc,
    });
    ok(prompt.includes("this variant's hero searches"));
  });

  it('both flags on, priority-view pool → URL + query both present', () => {
    const acc = accumulateDiscoveryLog(runs, {
      runMatcher: poolMatcher(variant, 'priority-view'),
      includeUrls: true,
      includeQueries: true,
    });
    strictEqual(acc.urlsChecked.length, 1);
    strictEqual(acc.queriesRun.length, 1);
    strictEqual(acc.urlsChecked[0], 'https://mfr.com/black-priority');
    strictEqual(acc.queriesRun[0], 'corsair m75 black priority');
  });
});
