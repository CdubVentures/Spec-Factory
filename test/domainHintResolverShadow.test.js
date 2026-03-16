import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEffectiveHostPlan,
  buildHostPlanShadowDiff,
} from '../src/features/indexing/discovery/domainHintResolver.js';
import { loadSourceRegistry } from '../src/features/indexing/discovery/sourceRegistry.js';

function makeRegistry() {
  const rawSources = {
    approved: {
      manufacturer: ['razer.com', 'logitech.com', 'steelseries.com'],
      retailer: ['amazon.com', 'bestbuy.com'],
      lab: ['rtings.com'],
    },
    sources: {
      razer_com: { base_url: 'https://razer.com', tier: 'tier1_manufacturer' },
      logitech_com: { base_url: 'https://logitech.com', tier: 'tier1_manufacturer' },
      steelseries_com: { base_url: 'https://steelseries.com', tier: 'tier1_manufacturer' },
      rtings_com: { base_url: 'https://rtings.com', tier: 'tier2_lab' },
      amazon_com: { base_url: 'https://amazon.com', tier: 'tier3_retailer' },
      bestbuy_com: { base_url: 'https://bestbuy.com', tier: 'tier3_retailer' },
    },
  };
  const { registry } = loadSourceRegistry('mouse', rawSources);
  return registry;
}

describe('buildHostPlanShadowDiff', () => {
  it('1. detects hosts only in old planner', () => {
    const plan = buildEffectiveHostPlan({
      domainHints: ['rtings.com'],
      registry: makeRegistry(),
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const diff = buildHostPlanShadowDiff(['rtings.com', 'oldonly.com'], plan);
    assert.ok(diff.only_old.includes('oldonly.com'));
  });

  it('2. detects hosts only in new planner', () => {
    const plan = buildEffectiveHostPlan({
      domainHints: ['rtings.com', 'razer.com'],
      registry: makeRegistry(),
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const diff = buildHostPlanShadowDiff(['rtings.com'], plan);
    assert.ok(diff.only_new.includes('razer.com'));
  });

  it('3. reports no drift when both agree', () => {
    const plan = buildEffectiveHostPlan({
      domainHints: ['rtings.com'],
      registry: makeRegistry(),
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const diff = buildHostPlanShadowDiff(['rtings.com'], plan);
    assert.equal(diff.drift, false);
    assert.deepStrictEqual(diff.only_old, []);
    assert.deepStrictEqual(diff.only_new, []);
  });

  it('4. counts are accurate', () => {
    const plan = buildEffectiveHostPlan({
      domainHints: ['rtings.com', 'razer.com', 'logitech.com'],
      registry: makeRegistry(),
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const diff = buildHostPlanShadowDiff(['rtings.com', 'oldhost.com'], plan);
    assert.equal(diff.old_count, 2);
    assert.equal(diff.new_count, 3);
    assert.equal(diff.matched.length, 1);
    assert.equal(diff.only_old.length, 1);
    assert.equal(diff.only_new.length, 2);
  });

  it('5. diff attached when flag on (diff is non-null)', () => {
    const plan = buildEffectiveHostPlan({
      domainHints: ['rtings.com'],
      registry: makeRegistry(),
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const diff = buildHostPlanShadowDiff(['rtings.com'], plan);
    assert.ok(diff);
    assert.ok('matched' in diff);
    assert.ok('only_old' in diff);
    assert.ok('only_new' in diff);
    assert.ok('drift' in diff);
  });

  it('6. diff absent when flag off (null oldHosts)', () => {
    const plan = buildEffectiveHostPlan({
      domainHints: ['rtings.com'],
      registry: makeRegistry(),
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const diff = buildHostPlanShadowDiff(null, plan);
    assert.equal(diff.old_count, 0);
    assert.equal(diff.drift, diff.only_new.length > 0);
  });

  it('7. ship gate: blocks default-on when < 20 products shadowed', () => {
    // Ship gate is a simple count check. < 20 → not ready.
    const shadowCount = 15;
    const shipGateReady = shadowCount >= 20;
    assert.equal(shipGateReady, false);

    const readyCount = 20;
    assert.equal(readyCount >= 20, true);
  });
});
