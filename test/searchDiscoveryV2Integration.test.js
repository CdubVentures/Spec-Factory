import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEffectiveHostPlan, buildHostPlanShadowDiff } from '../src/features/indexing/discovery/domainHintResolver.js';
import { loadSourceRegistry } from '../src/features/indexing/discovery/sourceRegistry.js';
import { buildLogicalPlansFromHostPlan, compileLogicalPlans } from '../src/features/indexing/search/queryBuilder.js';
import { classifyFieldCoreDeep, applyTierAcceptancePolicy } from '../src/features/indexing/discovery/coreDeepGate.js';

// WHY: Integration tests proving the v2 modules compose correctly when
// flags are enabled. These test the wiring paths, not the orchestration
// function itself (which requires too many external deps for unit testing).

function makeRegistry() {
  const rawSources = {
    approved: {
      manufacturer: ['razer.com', 'logitech.com', 'steelseries.com'],
      retailer: ['amazon.com', 'bestbuy.com'],
      lab: ['rtings.com'],
    },
    sources: {
      razer_com: {
        base_url: 'https://razer.com',
        tier: 'tier1_manufacturer',
        authority: 'authoritative',
        content_types: ['product_page'],
        doc_kinds: ['spec_sheet'],
        field_coverage: { high: ['sensor', 'weight'], medium: ['dpi'], low: [] },
      },
      logitech_com: { base_url: 'https://logitech.com', tier: 'tier1_manufacturer' },
      steelseries_com: { base_url: 'https://steelseries.com', tier: 'tier1_manufacturer' },
      rtings_com: {
        base_url: 'https://rtings.com',
        tier: 'tier2_lab',
        content_types: ['review'],
        doc_kinds: ['review'],
      },
      amazon_com: { base_url: 'https://amazon.com', tier: 'tier3_retailer' },
      bestbuy_com: { base_url: 'https://bestbuy.com', tier: 'tier3_retailer' },
    },
  };
  const { registry } = loadSourceRegistry('mouse', rawSources);
  return registry;
}

describe('searchDiscovery v2 integration wiring', () => {
  it('1. registry loaded when ENABLE_SOURCE_REGISTRY on', () => {
    // Simulates the wiring: loadSourceRegistry returns valid registry
    const registry = makeRegistry();
    assert.ok(registry);
    assert.ok(registry.entries.length >= 6);
    assert.equal(registry.category, 'mouse');
  });

  it('2. plan attached to artifact when ENABLE_DOMAIN_HINT_RESOLVER_V2 on', () => {
    const registry = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer', 'rtings.com'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: ['razer.com'],
    });
    // Plan should be attachable to search_profile artifact
    assert.ok(plan);
    assert.ok(!plan.blocked);
    assert.ok(plan.host_groups.length > 0);
    assert.ok(plan.classification_summary);
    // This object would go into search_profile.effective_host_plan
    const artifact = { effective_host_plan: plan };
    assert.ok(artifact.effective_host_plan.provider_caps);
  });

  it('4. category population gate blocks underpopulated registries', () => {
    const { registry } = loadSourceRegistry('mouse', {
      approved: { manufacturer: ['a.com'] },
      sources: { a_com: { base_url: 'https://a.com', tier: 'tier1_manufacturer' } },
    });
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.equal(plan.blocked, true);
  });

  it('5. shadow diff logged', () => {
    const registry = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer', 'rtings.com'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const oldHosts = ['rtings.com', 'amazon.com'];
    const diff = buildHostPlanShadowDiff(oldHosts, plan);
    assert.ok(diff);
    assert.ok('drift' in diff);
    assert.ok('matched' in diff);
  });

  it('6. QueryIndex records written when registry enabled', async () => {
    // Verify the module can be imported and called without error
    const { recordQueryResult, lookupQueryHistory } = await import('../src/features/indexing/discovery/queryIndex.js');
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qidx-'));
    const logPath = path.join(tmpDir, 'test.ndjson');
    recordQueryResult({
      query: 'test query',
      provider: 'searxng',
      result_count: 5,
      run_id: 'r1',
      category: 'mouse',
      product_id: 'p1',
      field_yield: [],
    }, logPath);
    const history = lookupQueryHistory('test query', 'searxng', logPath);
    assert.equal(history.times_used, 1);
  });

  it('7. logical plans compiled when ENABLE_QUERY_COMPILER on', () => {
    const registry = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer', 'rtings.com'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const logicalPlans = buildLogicalPlansFromHostPlan(
      plan,
      { brand: 'Razer', model: 'Viper V3 Pro' },
      ['sensor', 'weight']
    );
    assert.ok(logicalPlans.length > 0);
    const compiled = compileLogicalPlans(logicalPlans, 'searxng');
    assert.ok(compiled.length > 0);
    for (const row of compiled) {
      assert.ok(typeof row.query === 'string');
    }
  });

  it('8. core/deep active when ENABLE_CORE_DEEP_GATES on', () => {
    const fieldRules = {
      core_fields: ['sensor', 'weight'],
      fields: { sensor: { evidence_tier_minimum: 1 }, click_latency: { evidence_tier_minimum: 3 } },
    };
    assert.equal(classifyFieldCoreDeep('sensor', fieldRules), 'core_fact');
    assert.equal(classifyFieldCoreDeep('click_latency', fieldRules), 'deep_claim');

    const accepted = applyTierAcceptancePolicy({ tier: 1, value: '3950' }, 'core_fact');
    assert.equal(accepted.accepted, true);
    const rejected = applyTierAcceptancePolicy({ tier: 4, value: '3950', existing_core_value: '3395' }, 'core_fact');
    assert.equal(rejected.accepted, false);
  });
});

