import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEffectiveHostPlan,
  buildHostPlanShadowDiff,
} from '../src/features/indexing/discovery/domainHintResolver.js';
import { loadSourceRegistry } from '../src/features/indexing/discovery/sourceRegistry.js';

// -- helpers --

function makeRegistry(overrides = {}) {
  const rawSources = {
    approved: {
      manufacturer: ['razer.com', 'logitech.com', 'steelseries.com'],
      retailer: ['amazon.com', 'bestbuy.com'],
      lab: ['rtings.com'],
      community: ['reddit.com'],
    },
    sources: {
      razer_com: {
        base_url: 'https://www.razer.com',
        tier: 'tier1_manufacturer',
        authority: 'authoritative',
        content_types: ['product_page'],
        doc_kinds: ['spec_sheet'],
        field_coverage: { high: ['sensor', 'weight'], medium: ['dpi'], low: [] },
        connector_only: false,
        blocked_in_search: false,
      },
      logitech_com: {
        base_url: 'https://www.logitech.com',
        tier: 'tier1_manufacturer',
        authority: 'authoritative',
        content_types: ['product_page'],
        doc_kinds: ['spec_sheet'],
        field_coverage: { high: ['sensor', 'weight'], medium: [], low: [] },
        connector_only: false,
        blocked_in_search: false,
      },
      steelseries_com: {
        base_url: 'https://www.steelseries.com',
        tier: 'tier1_manufacturer',
        authority: 'authoritative',
        content_types: ['product_page'],
        doc_kinds: ['spec_sheet'],
        connector_only: false,
        blocked_in_search: false,
      },
      rtings_com: {
        base_url: 'https://www.rtings.com',
        tier: 'tier2_lab',
        authority: 'instrumented',
        content_types: ['review', 'benchmark'],
        doc_kinds: ['review'],
        field_coverage: { high: ['click_latency'], medium: ['sensor'], low: [] },
        connector_only: false,
        blocked_in_search: false,
      },
      amazon_com: {
        base_url: 'https://www.amazon.com',
        tier: 'tier3_retailer',
        authority: 'aggregator',
        content_types: ['product_page'],
        doc_kinds: ['product_page'],
        connector_only: false,
        blocked_in_search: false,
      },
      bestbuy_com: {
        base_url: 'https://www.bestbuy.com',
        tier: 'tier3_retailer',
        authority: 'aggregator',
        content_types: ['product_page'],
        doc_kinds: ['product_page'],
        connector_only: false,
        blocked_in_search: false,
      },
      reddit_com: {
        base_url: 'https://www.reddit.com',
        tier: 'tier4_community',
        authority: 'community',
        content_types: ['discussion'],
        doc_kinds: ['forum'],
        connector_only: false,
        blocked_in_search: false,
      },
      ...overrides.sources,
    },
  };
  if (overrides.approved) rawSources.approved = overrides.approved;
  const { registry } = loadSourceRegistry('mouse', rawSources);
  return registry;
}

function makeOpts(overrides = {}) {
  const registry = overrides.registry || makeRegistry(overrides.registryOverrides);
  return {
    domainHints: overrides.domainHints || [],
    registry,
    providerName: overrides.providerName || 'searxng',
    brandResolutionHints: overrides.brandResolutionHints || [],
    ...overrides,
  };
}

// == Tests ==

describe('buildEffectiveHostPlan', () => {
  it('1. empty hints + empty registry → empty plan, zero counts', () => {
    const emptyReg = makeRegistry({
      approved: { manufacturer: ['a.com', 'b.com', 'c.com'] },
      sources: {
        a_com: { base_url: 'https://a.com', tier: 'tier1_manufacturer' },
        b_com: { base_url: 'https://b.com', tier: 'tier1_manufacturer' },
        c_com: { base_url: 'https://c.com', tier: 'tier1_manufacturer' },
      },
    });
    const plan = buildEffectiveHostPlan({
      domainHints: [],
      registry: emptyReg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.ok(plan);
    assert.deepStrictEqual(plan.manufacturer_hosts, []);
    assert.deepStrictEqual(plan.tier_hosts, {});
    assert.deepStrictEqual(plan.explicit_hosts, []);
    assert.deepStrictEqual(plan.content_intents, []);
    assert.deepStrictEqual(plan.unresolved_tokens, []);
    assert.equal(plan.classification_summary.host_count, 0);
    assert.equal(plan.classification_summary.tier_count, 0);
    assert.equal(plan.classification_summary.intent_count, 0);
    assert.equal(plan.classification_summary.unresolved_count, 0);
  });

  it('2. dot-containing hint → explicit_hosts populated', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['rtings.com'],
    }));
    assert.ok(plan.explicit_hosts.includes('rtings.com'));
    assert.ok(plan.classification_summary.host_count >= 1);
  });

  it('2b. dual provider is accepted by EffectiveHostPlan and preserves operator support', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['rtings.com'],
      providerName: 'dual',
    }));
    const policy = plan.policy_map['rtings.com'];
    assert.ok(policy, 'dual provider should build host policies without throwing');
    assert.equal(policy.operator_support.site, true);
    assert.equal(policy.operator_support.filetype, true);
  });

  it('3. tier token "retailer" → tier_hosts.retailer expanded from registry', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['retailer'],
    }));
    assert.ok(plan.tier_hosts.retailer);
    assert.ok(plan.tier_hosts.retailer.length >= 2);
    assert.ok(plan.tier_hosts.retailer.includes('amazon.com'));
    assert.ok(plan.tier_hosts.retailer.includes('bestbuy.com'));
    assert.ok(plan.classification_summary.tier_count >= 1);
  });

  it('4. intent token "manual" → content_intents populated', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['manual'],
    }));
    assert.ok(plan.content_intents.includes('manual'));
    assert.equal(plan.classification_summary.intent_count, 1);
  });

  it('5. unknown token → unresolved_tokens (never silent)', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['xyzfoo'],
    }));
    assert.ok(plan.unresolved_tokens.includes('xyzfoo'));
    assert.equal(plan.classification_summary.unresolved_count, 1);
  });

  it('6. connector_only host → searchable: false', () => {
    const reg = makeRegistry({
      sources: {
        connector_host: {
          base_url: 'https://connector.example.com',
          tier: 'tier3_retailer',
          connector_only: true,
          blocked_in_search: false,
        },
      },
    });
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['connector.example.com'],
      registry: reg,
    }));
    const group = plan.host_groups.find(g => g.host === 'connector.example.com');
    assert.ok(group);
    assert.equal(group.searchable, false);
  });

  it('7. blocked_in_search host → searchable: false', () => {
    const reg = makeRegistry({
      sources: {
        blocked_host: {
          base_url: 'https://blocked.example.com',
          tier: 'tier3_retailer',
          connector_only: false,
          blocked_in_search: true,
        },
      },
    });
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['blocked.example.com'],
      registry: reg,
    }));
    const group = plan.host_groups.find(g => g.host === 'blocked.example.com');
    assert.ok(group);
    assert.equal(group.searchable, false);
  });

  it('8. explain trace for every included host', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['rtings.com', 'retailer'],
    }));
    // Every host_group entry should have a corresponding explain entry
    for (const group of plan.host_groups) {
      const explainEntry = plan.explain.find(e => e.host === group.host);
      assert.ok(explainEntry, `missing explain for host ${group.host}`);
      assert.ok(explainEntry.action);
      assert.ok(explainEntry.reason);
    }
  });

  it('9. brandResolutionHints merged into manufacturer_hosts', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: [],
      brandResolutionHints: ['razer.com'],
    }));
    assert.ok(plan.manufacturer_hosts.includes('razer.com'));
  });

  it('10. duplicate hosts deduplicated', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['rtings.com', 'rtings.com'],
    }));
    const rtingsGroups = plan.host_groups.filter(g => g.host === 'rtings.com');
    assert.equal(rtingsGroups.length, 1);
  });

  it('11. host_health attached; health_action ladder applied', () => {
    const reg = makeRegistry({
      sources: {
        healthy_com: {
          base_url: 'https://healthy.com',
          tier: 'tier3_retailer',
          health: { success_rate_7d: 0.95, block_rate_7d: 0.0 },
        },
        healthy2_com: {
          base_url: 'https://healthy2.com',
          tier: 'tier3_retailer',
          health: { success_rate_7d: 0.9, block_rate_7d: 0.0 },
        },
        healthy3_com: {
          base_url: 'https://healthy3.com',
          tier: 'tier3_retailer',
          health: { success_rate_7d: 0.85, block_rate_7d: 0.0 },
        },
        downranked_com: {
          base_url: 'https://downranked.com',
          tier: 'tier3_retailer',
          health: { success_rate_7d: 0.3, block_rate_7d: 0.1 },
        },
        excluded_com: {
          base_url: 'https://excluded.com',
          tier: 'tier3_retailer',
          health: { success_rate_7d: 0.05, block_rate_7d: 0.5 },
        },
      },
    });
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['healthy.com', 'healthy2.com', 'healthy3.com', 'downranked.com', 'excluded.com'],
      registry: reg,
    }));
    const healthy = plan.host_groups.find(g => g.host === 'healthy.com');
    const downranked = plan.host_groups.find(g => g.host === 'downranked.com');
    const excluded = plan.host_groups.find(g => g.host === 'excluded.com');
    assert.equal(healthy.health_action, 'normal');
    assert.equal(downranked.health_action, 'downranked');
    assert.equal(excluded.health_action, 'excluded');
    // host_health populated
    assert.ok(plan.host_health['healthy.com']);
    assert.ok(plan.host_health['downranked.com']);
    assert.ok(plan.host_health['excluded.com']);
  });

  it('12. policy_map populated via buildHostPolicy', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['rtings.com'],
    }));
    assert.ok(plan.policy_map['rtings.com']);
    assert.equal(plan.policy_map['rtings.com'].host, 'rtings.com');
    assert.ok('tier_numeric' in plan.policy_map['rtings.com']);
    assert.ok('operator_support' in plan.policy_map['rtings.com']);
  });

  it('13. provider_caps included from getProviderCapabilities', () => {
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['rtings.com'],
      providerName: 'searxng',
    }));
    assert.ok(plan.provider_caps);
    assert.equal(plan.provider_caps.name, 'searxng');
    assert.equal(plan.provider_caps.supports_site, true);
  });

  it('14. relaxation: when searchable drops below 3, downranked hosts promoted', () => {
    // Only 2 truly searchable hosts; 1 downranked. Relaxation should promote downranked.
    const reg = makeRegistry({
      approved: { manufacturer: ['a.com', 'b.com', 'c.com'] },
      sources: {
        a_com: {
          base_url: 'https://a.com',
          tier: 'tier1_manufacturer',
          health: { success_rate_7d: 0.9, block_rate_7d: 0.0 },
        },
        b_com: {
          base_url: 'https://b.com',
          tier: 'tier1_manufacturer',
          health: { success_rate_7d: 0.9, block_rate_7d: 0.0 },
        },
        c_com: {
          base_url: 'https://c.com',
          tier: 'tier1_manufacturer',
          health: { success_rate_7d: 0.3, block_rate_7d: 0.1 },
        },
      },
    });
    const plan = buildEffectiveHostPlan(makeOpts({
      domainHints: ['a.com', 'b.com', 'c.com'],
      registry: reg,
    }));
    const cGroup = plan.host_groups.find(g => g.host === 'c.com');
    // Without relaxation c.com would be downranked; with <3 threshold it should be normal
    assert.equal(cGroup.health_action, 'normal',
      'downranked host should be relaxed to normal when searchable count < 3');
    assert.equal(plan.classification_summary.searchable_host_count, 3);
  });
});

describe('buildEffectiveHostPlan — category population gate', () => {
  it('rejects underpopulated registry (< 3 entries)', () => {
    const { registry } = loadSourceRegistry('mouse', {
      approved: { manufacturer: ['a.com'] },
      sources: {
        a_com: { base_url: 'https://a.com', tier: 'tier1_manufacturer' },
      },
    });
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.equal(plan.blocked, true);
    assert.equal(plan.reason, 'registry_underpopulated');
  });

  it('rejects overly sparse registry (synthetic_ratio > 0.8)', () => {
    // 1 real, 8 synthetic → ratio 0.89
    const rawSources = {
      approved: {
        manufacturer: ['a.com', 'b.com', 'c.com', 'd.com'],
        retailer: ['e.com', 'f.com', 'g.com', 'h.com'],
      },
      sources: {
        a_com: { base_url: 'https://a.com', tier: 'tier1_manufacturer' },
      },
    };
    const { registry } = loadSourceRegistry('mouse', rawSources);
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.equal(plan.blocked, true);
    assert.equal(plan.reason, 'registry_too_sparse');
  });
});
