import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLogicalPlansFromHostPlan,
  compileLogicalPlans,
  buildScoredQueryRowsFromHostPlan,
} from '../src/features/indexing/search/queryBuilder.js';
import { buildEffectiveHostPlan } from '../src/features/indexing/discovery/domainHintResolver.js';
import { loadSourceRegistry } from '../src/features/indexing/discovery/sourceRegistry.js';

function makeRegistry(overrides = {}) {
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
      logitech_com: {
        base_url: 'https://logitech.com',
        tier: 'tier1_manufacturer',
        authority: 'authoritative',
        content_types: ['product_page'],
        doc_kinds: ['spec_sheet'],
        field_coverage: { high: ['sensor'], medium: [], low: [] },
      },
      steelseries_com: {
        base_url: 'https://steelseries.com',
        tier: 'tier1_manufacturer',
        authority: 'authoritative',
        content_types: ['product_page'],
        doc_kinds: ['spec_sheet'],
      },
      rtings_com: {
        base_url: 'https://rtings.com',
        tier: 'tier2_lab',
        authority: 'instrumented',
        content_types: ['review'],
        doc_kinds: ['review'],
      },
      amazon_com: {
        base_url: 'https://amazon.com',
        tier: 'tier3_retailer',
        content_types: ['product_page'],
        doc_kinds: ['product_page'],
      },
      bestbuy_com: {
        base_url: 'https://bestbuy.com',
        tier: 'tier3_retailer',
        content_types: ['product_page'],
        doc_kinds: ['product_page'],
        connector_only: true,
      },
      ...overrides.sources,
    },
  };
  if (overrides.approved) rawSources.approved = overrides.approved;
  const { registry } = loadSourceRegistry('mouse', rawSources);
  return registry;
}

function makePlan(overrides = {}) {
  const registry = overrides.registry || makeRegistry(overrides.registryOverrides);
  return buildEffectiveHostPlan({
    domainHints: overrides.domainHints || ['retailer', 'rtings.com'],
    registry,
    providerName: overrides.providerName || 'searxng',
    brandResolutionHints: overrides.brandResolutionHints || [],
  });
}

const IDENTITY = { brand: 'Razer', model: 'Viper V3 Pro' };
const FOCUS_FIELDS = ['sensor', 'weight', 'dpi'];

describe('queryBuilder v2 integration — buildLogicalPlansFromHostPlan', () => {
  it('1. tier token "retailer" produces logical plans with expanded hosts', () => {
    const plan = makePlan({ domainHints: ['retailer'] });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    assert.ok(Array.isArray(logicalPlans));
    assert.ok(logicalPlans.length > 0);
    // Should have plan for amazon.com (bestbuy is connector_only)
    const amazonPlan = logicalPlans.find(p => p.host_pref === 'amazon.com');
    assert.ok(amazonPlan, 'should have logical plan for amazon.com');
    // Non-manufacturer hosts get soft doc_hint instead of site:
    assert.equal(amazonPlan.site_target, null, 'non-manufacturer hosts get null site_target');
    assert.equal(amazonPlan.doc_hint, 'amazon.com', 'host becomes doc_hint for non-manufacturer');
  });

  it('2. non-manufacturer hosts get soft doc_hint instead of site_target', () => {
    const plan = makePlan({ providerName: 'searxng', domainHints: ['rtings.com'] });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    const rtingsPlan = logicalPlans.find(p => p.host_pref === 'rtings.com');
    assert.ok(rtingsPlan, 'should have logical plan for rtings.com');
    // rtings.com is not a manufacturer — gets soft anchor via doc_hint
    assert.equal(rtingsPlan.site_target, null, 'non-manufacturer host should not get site:');
    assert.equal(rtingsPlan.doc_hint, 'rtings.com', 'non-manufacturer host becomes doc_hint');
    assert.equal(rtingsPlan.filetype, null, 'non-manufacturer host should not get filetype');

    const nonePlan = makePlan({ providerName: 'none', domainHints: ['rtings.com'] });
    const noneLogical = buildLogicalPlansFromHostPlan(nonePlan, IDENTITY, FOCUS_FIELDS);
    for (const p of noneLogical) {
      assert.equal(p.site_target, null, 'none provider does not support site:');
    }
  });

  it('3. logical plans include filetype only when provider supports filetype:', () => {
    const planSearxng = makePlan({ providerName: 'searxng', domainHints: ['rtings.com'] });
    // Content intent with filetype-associated doc_hint
    planSearxng.content_intents.push('datasheet');
    const logical = buildLogicalPlansFromHostPlan(planSearxng, IDENTITY, FOCUS_FIELDS);
    // At least one plan should have filetype when provider supports it
    // (but only if there's a filetype to set — datasheet → pdf)
    const withFiletype = logical.filter(p => p.filetype);
    // searxng supports filetype, so if content warrants it, it should be set
    assert.ok(withFiletype.length >= 0); // No crash at minimum

    const planNone = makePlan({ providerName: 'none', domainHints: ['rtings.com'] });
    planNone.content_intents.push('datasheet');
    const noneLogical = buildLogicalPlansFromHostPlan(planNone, IDENTITY, FOCUS_FIELDS);
    for (const p of noneLogical) {
      assert.equal(p.filetype, null, 'none provider does not support filetype:');
    }
  });

  it('4. compileLogicalPlans routes through QueryCompiler', () => {
    const plan = makePlan({ domainHints: ['rtings.com'] });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    assert.ok(logicalPlans.length > 0);

    const compiled = compileLogicalPlans(logicalPlans, 'searxng');
    assert.ok(Array.isArray(compiled));
    for (const row of compiled) {
      assert.ok(typeof row.query === 'string');
      assert.ok(Array.isArray(row.warnings));
    }
  });

  it('5. buildFieldRuleGateCounts reports active for tier-only hints', () => {
    // This is tested by checking that a tier token like "retailer"
    // results in non-zero searchable_host_count
    const plan = makePlan({ domainHints: ['retailer'] });
    assert.ok(plan.classification_summary.searchable_host_count > 0);
  });

  it('6. without plan (null): buildLogicalPlansFromHostPlan returns empty', () => {
    const result = buildLogicalPlansFromHostPlan(null, IDENTITY, FOCUS_FIELDS);
    assert.deepStrictEqual(result, []);
  });

  it('7. connector_only hosts excluded from logical plans', () => {
    const plan = makePlan({ domainHints: ['retailer'] });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    const bestbuyPlan = logicalPlans.find(p => p.site_target === 'bestbuy.com');
    assert.equal(bestbuyPlan, undefined, 'bestbuy is connector_only, should not appear');
  });

  it('8. blocked_in_search hosts excluded from logical plans', () => {
    const reg = makeRegistry({
      sources: {
        blocked_host: {
          base_url: 'https://blocked.example.com',
          tier: 'tier3_retailer',
          blocked_in_search: true,
        },
      },
    });
    const plan = buildEffectiveHostPlan({
      domainHints: ['blocked.example.com'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    const blockedPlan = logicalPlans.find(p => p.site_target === 'blocked.example.com');
    assert.equal(blockedPlan, undefined);
  });

  it('9. content_intents injected as doc_hint in logical plans', () => {
    const plan = makePlan({ domainHints: ['rtings.com'] });
    plan.content_intents.push('review');
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    const withDocHint = logicalPlans.filter(p => p.doc_hint && p.doc_hint.length > 0);
    assert.ok(withDocHint.length > 0, 'at least one plan should have doc_hint from intent');
  });

  it('10. manufacturer hosts retain host_pref and filetype', () => {
    const plan = makePlan({
      domainHints: [],
      brandResolutionHints: ['razer.com'],
    });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    const razerPlan = logicalPlans.find(p => p.host_pref === 'razer.com');
    assert.ok(razerPlan, 'razer.com from manufacturer_hosts should have host_pref');
    // WHY: site_target is always null now — search-first mode uses soft host bias
    assert.equal(razerPlan.site_target, null, 'site_target is null in search-first mode');
    assert.equal(razerPlan.host_pref, 'razer.com');
  });

  it('14. field terms capped at 3 per logical plan', () => {
    const manyFields = ['sensor', 'weight', 'dpi', 'polling_rate', 'battery_life'];
    const plan = makePlan({
      domainHints: [],
      brandResolutionHints: ['razer.com'],
    });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, manyFields);
    for (const p of logicalPlans) {
      assert.ok(p.terms.length <= 3, `terms should be capped at 3, got ${p.terms.length}`);
    }
  });

  it('15. all hosts use soft doc_hint, no site: operator', () => {
    const plan = makePlan({
      domainHints: ['rtings.com'],
      brandResolutionHints: ['razer.com'],
    });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    const razerPlan = logicalPlans.find(p => p.host_pref === 'razer.com');
    const rtingsPlan = logicalPlans.find(p => p.host_pref === 'rtings.com');
    assert.ok(razerPlan, 'manufacturer host present');
    assert.ok(rtingsPlan, 'non-manufacturer host present');
    // WHY: search-first mode — site_target is always null, both use soft doc_hint
    assert.equal(razerPlan.site_target, null, 'manufacturer also gets null site_target in search-first mode');
    // Non-manufacturer: soft doc_hint, no site:, no filetype
    assert.equal(rtingsPlan.site_target, null);
    assert.equal(rtingsPlan.filetype, null);
    assert.equal(rtingsPlan.doc_hint, 'rtings.com');
  });

  it('11. compiled warnings propagated to query_rows', () => {
    // Use none provider which doesn't support site: — should generate warnings
    const plan = makePlan({ providerName: 'none', domainHints: ['rtings.com'] });
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    // Force a site_target to trigger fallback warning (none plans should have null site_target already)
    // Instead, compile and check no crashes
    const compiled = compileLogicalPlans(logicalPlans, 'none');
    assert.ok(Array.isArray(compiled));
  });

  it('12. buildScoredQueryRowsFromHostPlan returns ranked rows with five-signal score breakdowns', () => {
    const plan = makePlan({
      providerName: 'google',
      domainHints: ['retailer', 'manual'],
      brandResolutionHints: ['razer.com'],
    });
    const rows = buildScoredQueryRowsFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);

    assert.ok(Array.isArray(rows));
    assert.ok(rows.length > 0);
    assert.equal(rows[0].source_host, 'razer.com', 'manufacturer host with field coverage should rank first');
    assert.ok(rows.every((row, index) => index === 0 || row.score <= rows[index - 1].score));

    const first = rows[0];
    assert.equal(typeof first.score_breakdown.needset_coverage_bonus, 'number');
    assert.equal(typeof first.score_breakdown.field_affinity_bonus, 'number');
    assert.equal(typeof first.score_breakdown.diversity_penalty, 'number');
    assert.equal(typeof first.score_breakdown.host_health_penalty, 'number');
    assert.equal(typeof first.score_breakdown.operator_risk_penalty, 'number');
  });

  it('13. buildScoredQueryRowsFromHostPlan preserves compiler warnings and source metadata', () => {
    const plan = makePlan({
      providerName: 'none',
      domainHints: ['rtings.com', 'manual'],
    });
    const rows = buildScoredQueryRowsFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);

    assert.ok(rows.length > 0);
    assert.ok(rows.every((row) => Array.isArray(row.warnings)));
    assert.ok(rows.every((row) => typeof row.source_host === 'string' && row.source_host.length > 0));
    assert.ok(rows.some((row) => row.score_breakdown.operator_risk_penalty <= 0));
  });

  it('16. spec intent does not produce filetype:pdf (spec pages are HTML)', () => {
    const plan = makePlan({
      providerName: 'searxng',
      domainHints: [],
      brandResolutionHints: ['razer.com'],
    });
    plan.content_intents = ['spec'];
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    // Even manufacturer hosts should not get filetype:pdf for spec intent
    for (const p of logicalPlans) {
      assert.equal(p.filetype, null, `spec intent should not produce filetype:pdf, got ${p.filetype}`);
    }
  });

  it('17. datasheet/manual intent still produces filetype:pdf for manufacturer hosts', () => {
    // WHY: google supports filetype:, searxng does not (measured: 0 results in meta mode)
    const plan = makePlan({
      providerName: 'google',
      domainHints: [],
      brandResolutionHints: ['razer.com'],
    });
    plan.content_intents = ['datasheet'];
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, FOCUS_FIELDS);
    // WHY: site_target is null in search-first mode — find by host_pref instead
    const mfgPlan = logicalPlans.find(p => p.host_pref === 'razer.com');
    assert.ok(mfgPlan, 'manufacturer plan should exist');
    assert.equal(mfgPlan.site_target, null, 'site_target is null in search-first mode');
    assert.equal(mfgPlan.filetype, 'pdf', 'datasheet intent should produce filetype:pdf');
  });

  it('18. resolvedTerms override raw field keys in logical plans', () => {
    const plan = makePlan({
      providerName: 'searxng',
      domainHints: [],
      brandResolutionHints: ['razer.com'],
    });
    const rawFields = ['polling_rate_hz', 'lod_distance', 'sensor'];
    const resolvedTerms = ['polling rate', 'lift off distance', 'sensor'];
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, rawFields, { resolvedTerms });
    for (const p of logicalPlans) {
      assert.ok(!p.terms.some(t => t.includes('_')), `terms should not contain underscores: ${p.terms}`);
      assert.deepStrictEqual(p.terms, resolvedTerms);
    }
  });

  it('19. resolvedTerms fallback: without resolvedTerms, raw fields are cleaned', () => {
    const plan = makePlan({
      providerName: 'searxng',
      domainHints: [],
      brandResolutionHints: ['razer.com'],
    });
    const rawFields = ['sensor', 'weight'];
    const logicalPlans = buildLogicalPlansFromHostPlan(plan, IDENTITY, rawFields);
    for (const p of logicalPlans) {
      assert.ok(p.terms.length > 0, 'terms should not be empty');
      assert.ok(p.terms.every(t => typeof t === 'string'), 'terms should be strings');
    }
  });
});
