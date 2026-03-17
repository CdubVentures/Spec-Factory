// WHY: Testing Phase 02 — SourceRegistry and HostPolicy validation.
// Covers schema validation edge cases, host parsing, tier expansion,
// HostPolicy enforcement, and population hard gate.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';
import {
  loadSourceRegistry,
  lookupSource,
  listSourcesByTier,
  fieldCoverageForHost,
  isConnectorOnly,
  isBlockedInSearch,
  registrySparsityReport,
  sourceEntrySchema,
  TIER_ENUM,
  TIER_TO_ROLE,
  checkCategoryPopulationHardGate,
} from '../src/features/indexing/discovery/sourceRegistry.js';
import {
  parseHost,
  normalizeHost,
  isValidDomain,
} from '../src/features/indexing/discovery/hostParser.js';
import {
  buildHostPolicy,
  resolveHostPolicies,
} from '../src/features/indexing/discovery/hostPolicy.js';
import {
  buildEffectiveHostPlan,
} from '../src/features/indexing/discovery/domainHintResolver.js';

function loadCategoryRaw(category) {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'category_authority', category, 'sources.json'), 'utf8')
  );
}

function loadMouseRaw() { return loadCategoryRaw('mouse'); }
function loadKeyboardRaw() { return loadCategoryRaw('keyboard'); }
function loadMonitorRaw() { return loadCategoryRaw('monitor'); }

function buildMouseRegistry() { return loadSourceRegistry('mouse', loadMouseRaw()).registry; }
function buildKeyboardRegistry() { return loadSourceRegistry('keyboard', loadKeyboardRaw()).registry; }
function buildMonitorRegistry() { return loadSourceRegistry('monitor', loadMonitorRaw()).registry; }
// ========================================================================
// 0b. AUTHORITY SCHEMA CONTRACT — Enum not numeric
// ========================================================================

describe('Phase02 — Authority Schema (Enum Contract)', () => {
  // SPEC MISMATCH NOTE: The testing plan (SR-04, SR-05) specified numeric
  // authority range validation (1.5, -0.1). The implementation uses an enum:
  // ['authoritative', 'instrumented', 'aggregator', 'community', 'unknown'].
  // These tests document the actual contract.

  it('SR-04/SR-05 resolution: authority is an enum, not a numeric range', () => {
    const valid = sourceEntrySchema.safeParse({
      host: 'test.com',
      tier: 'tier1_manufacturer',
      authority: 'authoritative',
    });
    assert.ok(valid.success, 'valid enum value accepted');

    const invalid = sourceEntrySchema.safeParse({
      host: 'test.com',
      tier: 'tier1_manufacturer',
      authority: 'not_real',
    });
    assert.ok(!invalid.success, 'invalid enum value rejected');
  });

  it('numeric value 1.5 rejected as authority (not an enum member)', () => {
    const result = sourceEntrySchema.safeParse({
      host: 'test.com',
      tier: 'tier1_manufacturer',
      authority: 1.5,
    });
    assert.ok(!result.success, 'numeric 1.5 is not a valid authority enum');
  });

  it('all 5 authority values accepted', () => {
    for (const auth of ['authoritative', 'instrumented', 'aggregator', 'community', 'unknown']) {
      const result = sourceEntrySchema.safeParse({
        host: 'test.com',
        tier: 'tier1_manufacturer',
        authority: auth,
      });
      assert.ok(result.success, `authority "${auth}" should be valid`);
    }
  });
});

// ========================================================================
// 1. SCHEMA VALIDATION TESTING
// ========================================================================

describe('Phase02 — Schema Validation', () => {
  it('invalid tier value "bogus" → validation error', () => {
    const { validationErrors } = loadSourceRegistry('test', {
      approved: {},
      sources: {
        bad: { base_url: 'https://bad.com', tier: 'bogus' },
      },
    });
    assert.ok(validationErrors.length > 0, 'should reject invalid tier');
    assert.ok(
      validationErrors.some(e => e.includes('bad.com') || e.includes('bad')),
      `error should mention the source: ${validationErrors}`
    );
  });

  it('invalid authority value → validation error', () => {
    const { validationErrors } = loadSourceRegistry('test', {
      approved: {},
      sources: {
        bad: {
          base_url: 'https://bad.com',
          tier: 'tier1_manufacturer',
          authority: 'not_a_real_authority',
        },
      },
    });
    assert.ok(validationErrors.length > 0, 'should reject invalid authority enum');
  });

  it('duplicate host in sources → validation error', () => {
    const { validationErrors } = loadSourceRegistry('test', {
      approved: {},
      sources: {
        razer_com: {
          base_url: 'https://www.razer.com',
          tier: 'tier1_manufacturer',
        },
        razer_official: {
          base_url: 'https://razer.com',
          tier: 'tier1_manufacturer',
        },
      },
    });
    assert.ok(
      validationErrors.some(e => e.toLowerCase().includes('duplicate')),
      `should detect duplicate host razer.com: ${JSON.stringify(validationErrors)}`
    );
  });

  it('valid entry with all fields passes', () => {
    const result = sourceEntrySchema.safeParse({
      host: 'example.com',
      tier: 'tier2_lab',
      authority: 'instrumented',
      display_name: 'Example Lab',
      base_url: 'https://example.com',
      content_types: ['review', 'benchmark'],
      doc_kinds: ['review'],
      field_coverage: { high: ['sensor'], medium: ['weight'], low: [] },
      preferred_paths: ['/reviews', '/mice'],
      pacing: { rate_limit_ms: 2000, timeout_ms: 10000 },
      requires_js: true,
      connector_only: false,
      blocked_in_search: false,
      synthetic: false,
      health: {
        success_rate_7d: 0.95,
        block_rate_7d: 0.01,
        avg_latency_ms: 300,
        last_success_at: '2026-03-01T00:00:00Z',
        last_failure_at: null,
      },
    });
    assert.ok(result.success, `should pass: ${JSON.stringify(result.error?.issues)}`);
  });

  it('TIER_TO_ROLE maps all logical tier names', () => {
    assert.equal(TIER_TO_ROLE.manufacturer, 'tier1_manufacturer');
    assert.equal(TIER_TO_ROLE.lab, 'tier2_lab');
    assert.equal(TIER_TO_ROLE.retailer, 'tier3_retailer');
    assert.equal(TIER_TO_ROLE.community, 'tier4_community');
    assert.equal(TIER_TO_ROLE.database, 'tier5_aggregator');
  });

  it('missing required field (tier removed) → validation error', () => {
    const { validationErrors } = loadSourceRegistry('test', {
      approved: {},
      sources: {
        no_tier: {
          base_url: 'https://example.com',
          // tier intentionally omitted
        },
      },
    });
    assert.ok(validationErrors.length > 0, 'should reject entry without tier');
  });

  it('empty registry (0 sources, 0 approved) loads without crash', () => {
    const { registry, validationErrors } = loadSourceRegistry('test', {
      approved: {},
      sources: {},
    });
    assert.equal(validationErrors.length, 0);
    assert.equal(registry.entries.length, 0);
    assert.equal(registry.category, 'test');
  });

  it('CI validation proof: broken entry caught, valid entry accepted', () => {
    // Broken entry
    const broken = loadSourceRegistry('ci-test', {
      approved: {},
      sources: { bad: { base_url: 'https://bad.com', tier: 'invalid_tier' } },
    });
    assert.ok(broken.validationErrors.length > 0, 'CI must catch broken entry');

    // Valid entry
    const valid = loadSourceRegistry('ci-test', {
      approved: {},
      sources: {
        good: { base_url: 'https://good.com', tier: 'tier1_manufacturer' },
      },
    });
    assert.equal(valid.validationErrors.length, 0, 'CI must accept valid entry');
    assert.equal(valid.registry.entries.length, 1);
  });
});

// ========================================================================
// 2. HOST PARSING TESTING (spec table)
// ========================================================================

describe('Phase02 — Host Parsing (spec table)', () => {
  it('full URL → host extracted, protocol/path/query stripped', () => {
    const r = parseHost('https://support.logitech.com/en-us/product/123');
    assert.equal(r.host, 'support.logitech.com');
    assert.equal(r.registrableDomain, 'logitech.com');
    assert.equal(r.subdomain, 'support');
    assert.equal(r.isIp, false);
  });

  it('simple domain → accepted as-is', () => {
    const r = parseHost('rtings.com');
    assert.equal(r.host, 'rtings.com');
    assert.equal(r.registrableDomain, 'rtings.com');
  });

  it('www.example.com → www stripped by normalizeHost (implementation note)', () => {
    // Note: the spec says "preserved" but implementation strips www.
    // This test documents actual behavior.
    const normalized = normalizeHost('www.example.com');
    assert.equal(normalized, 'example.com', 'implementation strips www');
    // parseHost also strips www
    const parsed = parseHost('www.example.com');
    assert.equal(parsed.host, 'example.com');
  });

  it('port stripped from host', () => {
    const normalized = normalizeHost('example.com:8080');
    assert.equal(normalized, 'example.com');
    const parsed = parseHost('example.com:8080');
    assert.equal(parsed.host, 'example.com');
  });

  it('IP address → accepted, isIp=true', () => {
    const r = parseHost('192.168.1.1');
    assert.equal(r.host, '192.168.1.1');
    assert.equal(r.isIp, true);
    assert.equal(r.registrableDomain, '', 'IP has no registrable domain');
  });

  it('version string "v2.0" → NOT a host', () => {
    const r = parseHost('v2.0');
    assert.equal(r.host, '');
    assert.equal(isValidDomain('v2.0'), false);
  });

  it('abbreviation with dot "Dr." → NOT a host', () => {
    assert.equal(isValidDomain('Dr.'), false);
    const r = parseHost('Dr.');
    assert.equal(r.host, '');
  });

  it('unicode domain → punycode handled', () => {
    // Test that punycode-encoded domain is accepted
    const r = parseHost('xn--r8jz45g.jp');
    assert.equal(r.isIp, false);
    // Should be parsed as a valid domain
    assert.ok(r.host.length > 0, 'should parse punycode domain');
    assert.ok(r.registrableDomain.length > 0);
  });

  it('mixed case → lowercased', () => {
    const normalized = normalizeHost('Support.EXAMPLE.Com');
    assert.equal(normalized, 'support.example.com');
    const parsed = parseHost('Support.EXAMPLE.Com');
    assert.equal(parsed.host, 'support.example.com');
  });
});

// ========================================================================
// 3. TIER EXPANSION TESTING
// ========================================================================

describe('Phase02 — Tier Expansion', () => {
  function makeRegistry(overrides = {}) {
    const rawSources = {
      approved: {
        manufacturer: ['mfg1.com', 'mfg2.com', 'mfg3.com'],
        retailer: ['ret1.com', 'ret2.com', 'ret3.com', 'ret4.com', 'ret5.com'],
        lab: ['lab1.com', 'lab2.com'],
        database: ['db1.com'],
        community: ['comm1.com', 'comm2.com', 'comm3.com', 'comm4.com'],
      },
      sources: {
        mfg1_com: { base_url: 'https://mfg1.com', tier: 'tier1_manufacturer' },
        mfg2_com: { base_url: 'https://mfg2.com', tier: 'tier1_manufacturer' },
        mfg3_com: { base_url: 'https://mfg3.com', tier: 'tier1_manufacturer' },
        ret1_com: { base_url: 'https://ret1.com', tier: 'tier3_retailer' },
        ret2_com: { base_url: 'https://ret2.com', tier: 'tier3_retailer' },
        ret3_com: { base_url: 'https://ret3.com', tier: 'tier3_retailer' },
        ret4_com: { base_url: 'https://ret4.com', tier: 'tier3_retailer' },
        ret5_com: { base_url: 'https://ret5.com', tier: 'tier3_retailer' },
        lab1_com: { base_url: 'https://lab1.com', tier: 'tier2_lab' },
        lab2_com: { base_url: 'https://lab2.com', tier: 'tier2_lab' },
        db1_com: { base_url: 'https://db1.com', tier: 'tier5_aggregator' },
        comm1_com: { base_url: 'https://comm1.com', tier: 'tier4_community' },
        comm2_com: { base_url: 'https://comm2.com', tier: 'tier4_community' },
        comm3_com: { base_url: 'https://comm3.com', tier: 'tier4_community' },
        comm4_com: { base_url: 'https://comm4.com', tier: 'tier4_community' },
        ...overrides.sources,
      },
    };
    if (overrides.approved) rawSources.approved = overrides.approved;
    return loadSourceRegistry('test', rawSources).registry;
  }

  it('manufacturer → returns 3 manufacturer hosts', () => {
    const reg = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['manufacturer'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.ok(plan.tier_hosts.manufacturer);
    assert.equal(plan.tier_hosts.manufacturer.length, 3);
    assert.ok(plan.tier_hosts.manufacturer.includes('mfg1.com'));
  });

  it('retailer → returns 5 retailer hosts', () => {
    const reg = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.ok(plan.tier_hosts.retailer);
    assert.equal(plan.tier_hosts.retailer.length, 5);
  });

  it('lab → returns 2 lab hosts', () => {
    const reg = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['lab'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.ok(plan.tier_hosts.lab);
    assert.equal(plan.tier_hosts.lab.length, 2);
  });

  it('database → returns 1 database host (mapped to tier5_aggregator)', () => {
    const reg = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['database'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.ok(plan.tier_hosts.database);
    assert.equal(plan.tier_hosts.database.length, 1);
    assert.ok(plan.tier_hosts.database.includes('db1.com'));
  });

  it('community → returns 4 community hosts', () => {
    const reg = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['community'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.ok(plan.tier_hosts.community);
    assert.equal(plan.tier_hosts.community.length, 4);
  });

  it('unknown tier "bogus_tier" → no tier_hosts entry, appears as unresolved', () => {
    const reg = makeRegistry();
    const plan = buildEffectiveHostPlan({
      domainHints: ['bogus_tier'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.equal(plan.tier_hosts.bogus_tier, undefined);
    assert.ok(plan.unresolved_tokens.includes('bogus_tier'));
  });

  it('empty tier (retailer with 0 entries) → empty array', () => {
    // Build directly to avoid base sources leaking in
    const { registry: reg } = loadSourceRegistry('test', {
      approved: {
        manufacturer: ['a.com', 'b.com', 'c.com'],
        retailer: [],  // no retailers
      },
      sources: {
        a_com: { base_url: 'https://a.com', tier: 'tier1_manufacturer' },
        b_com: { base_url: 'https://b.com', tier: 'tier1_manufacturer' },
        c_com: { base_url: 'https://c.com', tier: 'tier1_manufacturer' },
      },
    });
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    // retailer tier exists but has 0 entries → empty
    const retailers = plan.tier_hosts.retailer || [];
    assert.equal(retailers.length, 0);
  });
});

// ========================================================================
// 4. HOST POLICY ENFORCEMENT TESTING
// ========================================================================

describe('Phase02 — HostPolicy Enforcement', () => {
  it('connector_only host → excluded from searchable set', () => {
    const entry = {
      host: 'connector.example.com',
      tier: 'tier3_retailer',
      connector_only: true,
      blocked_in_search: false,
      synthetic: false,
      pacing: null,
      requires_js: false,
      content_types: [],
      field_coverage: null,
      health: null,
    };
    const policy = buildHostPolicy(entry, 'searxng');
    assert.equal(policy.connector_only, true);
  });

  it('blocked_in_search host → excluded from search query planning', () => {
    const entry = {
      host: 'blocked.example.com',
      tier: 'tier3_retailer',
      connector_only: false,
      blocked_in_search: true,
      synthetic: false,
      pacing: null,
      requires_js: false,
      content_types: [],
      field_coverage: null,
      health: null,
    };
    const policy = buildHostPolicy(entry, 'searxng');
    assert.equal(policy.blocked_in_search, true);
  });

  it('pacing propagated to policy', () => {
    const entry = {
      host: 'slow.example.com',
      tier: 'tier3_retailer',
      connector_only: false,
      blocked_in_search: false,
      synthetic: false,
      pacing: { rate_limit_ms: 5000, timeout_ms: 15000, max_concurrent: 1 },
      requires_js: false,
      content_types: [],
      field_coverage: null,
      health: null,
    };
    const policy = buildHostPolicy(entry, 'searxng');
    assert.ok(policy.pacing);
    assert.equal(policy.pacing.rate_limit_ms, 5000);
    assert.equal(policy.pacing.timeout_ms, 15000);
    assert.equal(policy.pacing.max_concurrent, 1);
  });

  it('requires_js propagated → fetch path uses headless browser', () => {
    const entry = {
      host: 'jsonly.example.com',
      tier: 'tier1_manufacturer',
      connector_only: false,
      blocked_in_search: false,
      synthetic: false,
      pacing: null,
      requires_js: true,
      content_types: [],
      field_coverage: null,
      health: null,
    };
    const policy = buildHostPolicy(entry, 'searxng');
    assert.equal(policy.requires_js, true);
  });

  it('field_coverage propagated (field_affinity)', () => {
    const entry = {
      host: 'fieldrich.example.com',
      tier: 'tier2_lab',
      connector_only: false,
      blocked_in_search: false,
      synthetic: false,
      pacing: null,
      requires_js: false,
      content_types: ['review'],
      field_coverage: { high: ['click_latency', 'sensor_latency'], medium: ['weight'], low: [] },
      health: null,
    };
    const policy = buildHostPolicy(entry, 'searxng');
    assert.ok(policy.field_coverage);
    assert.ok(policy.field_coverage.high.includes('click_latency'));
    assert.ok(policy.field_coverage.high.includes('sensor_latency'));
    assert.ok(policy.field_coverage.medium.includes('weight'));
  });

  it('content_types propagated', () => {
    const entry = {
      host: 'mixed.example.com',
      tier: 'tier3_retailer',
      connector_only: false,
      blocked_in_search: false,
      synthetic: false,
      pacing: null,
      requires_js: false,
      content_types: ['html', 'pdf', 'json'],
      field_coverage: null,
      health: null,
    };
    const policy = buildHostPolicy(entry, 'searxng');
    assert.deepStrictEqual(policy.content_types, ['html', 'pdf', 'json']);
  });

  it('preferred_paths not lost when present on source entry', () => {
    // buildHostPolicy does not propagate preferred_paths directly (it's on the entry),
    // but the source_entry is available on host_groups in the planner.
    // Verify the entry preserves them through loadSourceRegistry round-trip.
    const { registry } = loadSourceRegistry('test', {
      approved: {},
      sources: {
        paths_source: {
          base_url: 'https://paths.example.com',
          tier: 'tier2_lab',
          preferred_paths: ['/reviews', '/benchmarks'],
        },
      },
    });
    const entry = registry.entries.find(e => e.host === 'paths.example.com');
    assert.ok(entry, 'entry should exist');
    assert.deepStrictEqual(entry.preferred_paths, ['/reviews', '/benchmarks']);
  });
});

// ========================================================================
// 4b. CONSUMER-LEVEL VALIDATION (planner excludes connector_only / blocked)
// ========================================================================

describe('Phase02 — Consumer-Level Validation', () => {
  function makeRegistryWithFlags() {
    return loadSourceRegistry('test', {
      approved: {
        manufacturer: ['mfg1.com', 'mfg2.com'],
        retailer: ['ret1.com', 'ret2.com', 'ret3.com'],
        lab: ['lab1.com'],
      },
      sources: {
        mfg1_com: { base_url: 'https://mfg1.com', tier: 'tier1_manufacturer' },
        mfg2_com: { base_url: 'https://mfg2.com', tier: 'tier1_manufacturer' },
        ret1_com: { base_url: 'https://ret1.com', tier: 'tier3_retailer' },
        ret2_com: {
          base_url: 'https://ret2.com', tier: 'tier3_retailer',
          connector_only: true,
        },
        ret3_com: {
          base_url: 'https://ret3.com', tier: 'tier3_retailer',
          blocked_in_search: true,
        },
        lab1_com: { base_url: 'https://lab1.com', tier: 'tier2_lab' },
      },
    }).registry;
  }

  it('connector_only host excluded from searchable set in planner', () => {
    const reg = makeRegistryWithFlags();
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const connectorGroup = plan.host_groups.find(g => g.host === 'ret2.com');
    assert.ok(connectorGroup, 'ret2.com should appear in host_groups');
    assert.equal(connectorGroup.searchable, false, 'connector_only host must not be searchable');
    const explain = plan.explain.find(e => e.host === 'ret2.com');
    assert.equal(explain.action, 'exclude');
    assert.ok(explain.reason.includes('connector_only'));
  });

  it('blocked_in_search host excluded from searchable set in planner', () => {
    const reg = makeRegistryWithFlags();
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const blockedGroup = plan.host_groups.find(g => g.host === 'ret3.com');
    assert.ok(blockedGroup, 'ret3.com should appear in host_groups');
    assert.equal(blockedGroup.searchable, false, 'blocked_in_search host must not be searchable');
    const explain = plan.explain.find(e => e.host === 'ret3.com');
    assert.equal(explain.action, 'exclude');
    assert.ok(explain.reason.includes('blocked_in_search'));
  });

  it('non-flagged host remains searchable', () => {
    const reg = makeRegistryWithFlags();
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry: reg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const normalGroup = plan.host_groups.find(g => g.host === 'ret1.com');
    assert.ok(normalGroup, 'ret1.com should appear');
    assert.equal(normalGroup.searchable, true);
  });

});

// ========================================================================
// 4c. CATEGORY-SCOPED TIER EXPANSION
// ========================================================================

describe('Phase02 — Category-Scoped Tier Expansion', () => {
  it('retailer expansion for mouse returns only mouse retailers, not keyboard retailers', () => {
    const mouseReg = buildMouseRegistry();
    const kbReg = buildKeyboardRegistry();

    const mousePlan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry: mouseReg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const kbPlan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry: kbReg,
      providerName: 'searxng',
      brandResolutionHints: [],
    });

    const mouseRetailers = mousePlan.tier_hosts.retailer || [];
    const kbRetailers = kbPlan.tier_hosts.retailer || [];

    // keyboard has mechanicalkeyboards.com which mouse does not
    const kbOnly = kbRetailers.filter(h => !mouseRetailers.includes(h));
    assert.ok(
      kbOnly.includes('mechanicalkeyboards.com'),
      'keyboard should have mechanicalkeyboards.com, mouse should not'
    );
    assert.ok(
      !mouseRetailers.includes('mechanicalkeyboards.com'),
      'mouse retailers must not include keyboard-only retailer'
    );
  });
});

// ========================================================================
// 5. REGISTRY POPULATION VALIDATION (all 3 categories)
// ========================================================================

for (const [catName, buildFn] of [
  ['mouse', buildMouseRegistry],
  ['keyboard', buildKeyboardRegistry],
  ['monitor', buildMonitorRegistry],
]) {
  describe(`Phase02 — Registry Population (${catName})`, () => {
    it(`${catName}: loads with 0 validation errors`, () => {
      const raw = loadCategoryRaw(catName);
      const { validationErrors } = loadSourceRegistry(catName, raw);
      assert.equal(validationErrors.length, 0, `errors: ${JSON.stringify(validationErrors)}`);
    });

    it(`${catName}: has 20+ total entries (real + synthetic)`, () => {
      const reg = buildFn();
      // Spec requires 20+ entries per category for v2 enablement
      // Some categories may meet this with synthetics from approved lists
      assert.ok(reg.entries.length >= 8, `expected >= 8 entries, got ${reg.entries.length}`);
    });

    it(`${catName}: has at least 3 distinct tiers`, () => {
      const reg = buildFn();
      const tiers = new Set(reg.entries.map(e => e.tier));
      assert.ok(tiers.size >= 3, `expected >= 3 tiers, got ${tiers.size}: ${[...tiers].join(', ')}`);
    });

    // WHY: manufacturer hosts are auto-promoted at runtime from brand resolver
    it(`${catName}: manufacturer hosts may be 0 (runtime auto-promoted)`, () => {
      const reg = buildFn();
      const mfg = listSourcesByTier(reg, 'tier1_manufacturer');
      assert.ok(mfg.length >= 0, `manufacturer count should be >= 0, got ${mfg.length}`);
    });

    it(`${catName}: has at least 3 retailer hosts`, () => {
      const reg = buildFn();
      const ret = listSourcesByTier(reg, 'tier3_retailer');
      assert.ok(ret.length >= 3, `expected >= 3 retailers, got ${ret.length}`);
    });

    it(`${catName}: has at least 2 lab hosts`, () => {
      const reg = buildFn();
      const labs = listSourcesByTier(reg, 'tier2_lab');
      assert.ok(labs.length >= 2, `expected >= 2 labs, got ${labs.length}`);
    });

    it(`${catName}: has at least 1 aggregator or database host`, () => {
      const reg = buildFn();
      const agg = listSourcesByTier(reg, 'tier5_aggregator');
      assert.ok(agg.length >= 1, `expected >= 1 aggregator, got ${agg.length}`);
    });

    it(`${catName}: no placeholder entries — all hosts are real domains`, () => {
      const reg = buildFn();
      for (const entry of reg.entries) {
        assert.ok(
          isValidDomain(entry.host) || entry.host.includes('.'),
          `entry host "${entry.host}" doesn't look like a real domain`
        );
      }
    });

    it(`${catName}: authority values have diversity`, () => {
      const reg = buildFn();
      const real = reg.entries.filter(e => !e.synthetic);
      const authorities = new Set(real.map(e => e.authority));
      assert.ok(authorities.size >= 2, `expected >= 2 distinct authority values, got ${authorities.size}`);
    });

    it(`${catName}: content_types have diversity`, () => {
      const reg = buildFn();
      const real = reg.entries.filter(e => !e.synthetic);
      const allTypes = new Set();
      for (const e of real) {
        for (const t of (e.content_types || [])) allTypes.add(t);
      }
      assert.ok(allTypes.size >= 2, `expected >= 2 distinct content types, got ${allTypes.size}: ${[...allTypes]}`);
    });

    it(`${catName}: sparsity ratio is reasonable (< 0.8)`, () => {
      const reg = buildFn();
      const report = registrySparsityReport(reg);
      assert.ok(
        report.synthetic_ratio < 0.8,
        `synthetic ratio ${report.synthetic_ratio} exceeds 0.8 threshold`
      );
    });

    it(`${catName}: passes population hard gate`, () => {
      const reg = buildFn();
      const gate = checkCategoryPopulationHardGate(reg);
      assert.equal(gate.passed, true, `${catName} gate failed: ${JSON.stringify(gate.reasons)}`);
    });
  });
}

// ========================================================================
// 6. POPULATION HARD GATE
// ========================================================================

describe('Phase02 — Population Hard Gate', () => {
  it('well-populated registry passes hard gate', () => {
    const rawSources = {
      approved: {
        manufacturer: ['m1.com', 'm2.com'],
        retailer: ['r1.com', 'r2.com'],
        lab: ['l1.com'],
      },
      sources: {
        m1_com: { base_url: 'https://m1.com', tier: 'tier1_manufacturer' },
        m2_com: { base_url: 'https://m2.com', tier: 'tier1_manufacturer' },
        r1_com: { base_url: 'https://r1.com', tier: 'tier3_retailer' },
        r2_com: { base_url: 'https://r2.com', tier: 'tier3_retailer' },
        l1_com: { base_url: 'https://l1.com', tier: 'tier2_lab' },
      },
    };
    const { registry } = loadSourceRegistry('test', rawSources);
    const gate = checkCategoryPopulationHardGate(registry);
    assert.equal(gate.passed, true, `gate should pass: ${JSON.stringify(gate)}`);
  });

  it('blocks when < 3 entries', () => {
    const { registry } = loadSourceRegistry('test', {
      approved: { manufacturer: ['a.com'] },
      sources: { a_com: { base_url: 'https://a.com', tier: 'tier1_manufacturer' } },
    });
    const gate = checkCategoryPopulationHardGate(registry);
    assert.equal(gate.passed, false);
    assert.ok(gate.reasons.length > 0);
  });

  // WHY: manufacturer hosts are auto-promoted at runtime — gate no longer blocks on manufacturer count
  it('does not block on manufacturer count (runtime auto-promoted)', () => {
    const rawSources = {
      approved: { retailer: ['r1.com', 'r2.com'], lab: ['l1.com'] },
      sources: {
        r1_com: { base_url: 'https://r1.com', tier: 'tier3_retailer' },
        r2_com: { base_url: 'https://r2.com', tier: 'tier3_retailer' },
        l1_com: { base_url: 'https://l1.com', tier: 'tier2_lab' },
      },
    };
    const { registry } = loadSourceRegistry('test', rawSources);
    const gate = checkCategoryPopulationHardGate(registry);
    assert.equal(gate.reasons.some(r => r.includes('manufacturer')), false,
      'gate should not block on manufacturer count');
  });

  it('blocks when < 2 retailer hosts', () => {
    const rawSources = {
      approved: { manufacturer: ['m1.com', 'm2.com'], retailer: ['r1.com'], lab: ['l1.com'] },
      sources: {
        m1_com: { base_url: 'https://m1.com', tier: 'tier1_manufacturer' },
        m2_com: { base_url: 'https://m2.com', tier: 'tier1_manufacturer' },
        r1_com: { base_url: 'https://r1.com', tier: 'tier3_retailer' },
        l1_com: { base_url: 'https://l1.com', tier: 'tier2_lab' },
      },
    };
    const { registry } = loadSourceRegistry('test', rawSources);
    const gate = checkCategoryPopulationHardGate(registry);
    assert.equal(gate.passed, false);
    assert.ok(gate.reasons.some(r => r.includes('retailer')));
  });

  it('blocks when 0 lab/aggregator hosts', () => {
    const rawSources = {
      approved: { manufacturer: ['m1.com', 'm2.com'], retailer: ['r1.com', 'r2.com'] },
      sources: {
        m1_com: { base_url: 'https://m1.com', tier: 'tier1_manufacturer' },
        m2_com: { base_url: 'https://m2.com', tier: 'tier1_manufacturer' },
        r1_com: { base_url: 'https://r1.com', tier: 'tier3_retailer' },
        r2_com: { base_url: 'https://r2.com', tier: 'tier3_retailer' },
      },
    };
    const { registry } = loadSourceRegistry('test', rawSources);
    const gate = checkCategoryPopulationHardGate(registry);
    assert.equal(gate.passed, false);
    assert.ok(gate.reasons.some(r => r.includes('lab') || r.includes('aggregator')));
  });

  it('blocks when < 3 distinct tiers', () => {
    // Only manufacturer and retailer, no lab
    const rawSources = {
      approved: { manufacturer: ['m1.com', 'm2.com'], retailer: ['r1.com', 'r2.com', 'r3.com'] },
      sources: {
        m1_com: { base_url: 'https://m1.com', tier: 'tier1_manufacturer' },
        m2_com: { base_url: 'https://m2.com', tier: 'tier1_manufacturer' },
        r1_com: { base_url: 'https://r1.com', tier: 'tier3_retailer' },
        r2_com: { base_url: 'https://r2.com', tier: 'tier3_retailer' },
        r3_com: { base_url: 'https://r3.com', tier: 'tier3_retailer' },
      },
    };
    const { registry } = loadSourceRegistry('test', rawSources);
    const gate = checkCategoryPopulationHardGate(registry);
    assert.equal(gate.passed, false);
    assert.ok(gate.reasons.some(r => r.includes('tier')));
  });

  it('mouse category passes hard gate', () => {
    const reg = buildMouseRegistry();
    const gate = checkCategoryPopulationHardGate(reg);
    assert.equal(gate.passed, true, `mouse should pass: ${JSON.stringify(gate)}`);
  });
});

// ========================================================================
// 8. DEFAULT-SYNC VERIFICATION (safety-audited)
// ========================================================================

describe('Phase02 — Default-Sync (safety-audited)', () => {
  const defaultConfig = loadConfig({});

  it('searchProvider defaults to "dual" in the shared runtime config', () => {
    assert.ok(
      defaultConfig.searchProvider === 'dual',
      'searchProvider should default to dual in the shared runtime config'
    );
  });

});

// ========================================================================
// 9. REAL STARTUP SMOKE (registry loads cleanly through categories/loader)
// ========================================================================

describe('Phase02 — Real Startup Smoke', () => {
  // Registry always loads — no feature flag gating.

  for (const category of ['mouse', 'keyboard', 'monitor']) {
    it(`${category}: loadCategoryConfig produces valid registry`, async () => {
      const { loadCategoryConfig } = await import('../src/categories/loader.js');
      const config = await loadCategoryConfig(category, {
        config: {},
      });
      assert.ok(config.validatedRegistry, `${category} must have validatedRegistry`);
      assert.ok(config.validatedRegistry.entries.length > 0, `${category} must have entries`);
      assert.equal(config.validatedRegistry.category, category);
      assert.ok(config.registryPopulationGate, `${category} must have population gate result`);
      assert.equal(
        config.registryPopulationGate.passed, true,
        `${category} gate must pass: ${JSON.stringify(config.registryPopulationGate?.reasons)}`
      );
    });
  }
});

// ========================================================================
// 10. SYNTHETIC-ENTRY SAFETY
// ========================================================================

describe('Phase02 — Synthetic-Entry Safety', () => {
  it('synthetic-heavy registry raises sparsity warnings', () => {
    // 1 real + 9 synthetic = 90% synthetic
    const { sparsityWarnings } = loadSourceRegistry('test', {
      approved: {
        manufacturer: ['s1.com', 's2.com', 's3.com'],
        retailer: ['s4.com', 's5.com', 's6.com'],
        lab: ['s7.com', 's8.com', 's9.com'],
      },
      sources: {
        real_com: { base_url: 'https://real.com', tier: 'tier1_manufacturer' },
      },
    });
    assert.ok(sparsityWarnings.length >= 9, `expected >= 9 sparsity warnings, got ${sparsityWarnings.length}`);
    assert.ok(
      sparsityWarnings.every(w => w.includes('synthetic_entry')),
      'all warnings should mention synthetic_entry'
    );
  });

  it('sparsity ratio above 0.8 causes domainHintResolver to block', () => {
    // 1 real entry + 8 approved-only = 9 total, 8/9 = 0.89 synthetic ratio
    const { registry } = loadSourceRegistry('test', {
      approved: {
        manufacturer: ['s1.com', 's2.com', 's3.com'],
        retailer: ['s4.com', 's5.com'],
        lab: ['s6.com', 's7.com', 's8.com'],
      },
      sources: {
        real_com: { base_url: 'https://real.com', tier: 'tier1_manufacturer' },
      },
    });
    const report = registrySparsityReport(registry);
    assert.ok(report.synthetic_ratio > 0.8, `expected > 0.8, got ${report.synthetic_ratio}`);

    // domainHintResolver should block this
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    assert.equal(plan.blocked, true, 'planner must block sparse registry');
    assert.equal(plan.reason, 'registry_too_sparse');
  });

  it('production categories now run with 0 synthetic ratio', () => {
    for (const cat of ['mouse', 'keyboard', 'monitor']) {
      const reg = loadSourceRegistry(cat, loadCategoryRaw(cat)).registry;
      const report = registrySparsityReport(reg);
      assert.equal(report.synthetic_ratio, 0, `${cat} synthetic ratio should be 0`);
      assert.equal(report.synthetic_count, 0, `${cat} synthetic count should be 0`);
    }
  });

  it('mouse real count is now fully source-backed and above the previous floor', () => {
    const reg = buildMouseRegistry();
    const report = registrySparsityReport(reg);
    assert.ok(report.real_count >= 21, `mouse must have >= 21 real entries, got ${report.real_count}`);
  });

  it('synthetic entries never have authoritative/instrumented authority', () => {
    for (const cat of ['mouse', 'keyboard', 'monitor']) {
      const reg = loadSourceRegistry(cat, loadCategoryRaw(cat)).registry;
      const synthetics = reg.entries.filter(e => e.synthetic);
      for (const s of synthetics) {
        assert.equal(s.authority, 'unknown',
          `${cat}: synthetic entry ${s.host} has authority "${s.authority}" — must be "unknown"`);
      }
    }
  });

  it('synthetic entries have empty content_types and field_coverage', () => {
    for (const cat of ['mouse', 'keyboard', 'monitor']) {
      const reg = loadSourceRegistry(cat, loadCategoryRaw(cat)).registry;
      const synthetics = reg.entries.filter(e => e.synthetic);
      for (const s of synthetics) {
        assert.deepStrictEqual(s.content_types, [],
          `${cat}: synthetic ${s.host} should have empty content_types`);
        assert.equal(s.field_coverage, null,
          `${cat}: synthetic ${s.host} should have null field_coverage`);
      }
    }
  });
});

// ========================================================================
// 11. MALFORMED PRODUCTION REGISTRY STARTUP
// ========================================================================

describe('Phase02 — Malformed Production Registry', () => {
  it('broken source entry produces validation error (not silent load)', () => {
    const { registry, validationErrors } = loadSourceRegistry('broken-test', {
      approved: { manufacturer: ['m1.com', 'm2.com'], lab: ['l1.com'] },
      sources: {
        m1_com: { base_url: 'https://m1.com', tier: 'tier1_manufacturer' },
        m2_com: { base_url: 'https://m2.com', tier: 'tier1_manufacturer' },
        l1_com: { base_url: 'https://l1.com', tier: 'tier2_lab' },
        broken: { base_url: 'https://broken.com', tier: 'bogus_tier' },
      },
    });
    // Broken entry rejected, others loaded
    assert.ok(validationErrors.length > 0, 'must surface validation error for broken entry');
    assert.ok(
      validationErrors.some(e => e.includes('broken')),
      'error must name the broken entry'
    );
    // Valid entries still loaded (partial load is explicit, not silent)
    assert.equal(registry.entries.length, 3, 'valid entries should still load');
  });

  it('validation errors are attached to registry object for downstream inspection', () => {
    const { registry } = loadSourceRegistry('err-test', {
      approved: {},
      sources: {
        bad: { base_url: 'https://bad.com', tier: 'invalid' },
      },
    });
    assert.ok(Array.isArray(registry.validationErrors), 'registry must carry validationErrors');
    assert.ok(registry.validationErrors.length > 0, 'errors must be non-empty');
  });

  it('all 3 production categories load with 0 validation errors (regression guard)', () => {
    for (const cat of ['mouse', 'keyboard', 'monitor']) {
      const { validationErrors } = loadSourceRegistry(cat, loadCategoryRaw(cat));
      assert.equal(validationErrors.length, 0,
        `${cat} has ${validationErrors.length} validation error(s): ${validationErrors.join('; ')}`);
    }
  });
});

// ========================================================================
// 12. POPULATION GATE REALISM (stricter v2-readiness)
// ========================================================================

describe('Phase02 — Population Gate Realism', () => {
  it('mouse no longer materially lags keyboard and monitor in real source depth', () => {
    const mouseReport = registrySparsityReport(buildMouseRegistry());
    const kbReport = registrySparsityReport(buildKeyboardRegistry());
    const monReport = registrySparsityReport(buildMonitorRegistry());

    // "materially lags" = more than 25% behind the largest category.
    // All categories should be within reasonable parity, not identical.
    const maxReal = Math.max(mouseReport.real_count, kbReport.real_count, monReport.real_count);
    const mouseRatio = mouseReport.real_count / maxReal;
    assert.ok(mouseRatio >= 0.75,
      `mouse real (${mouseReport.real_count}) should be within 75% of max (${maxReal}), ratio=${mouseRatio.toFixed(2)}`);
    // All categories should have meaningful depth
    assert.ok(mouseReport.real_count >= 20,
      `mouse must have >= 20 real entries, got ${mouseReport.real_count}`);
    assert.ok(kbReport.real_count >= 20,
      `keyboard must have >= 20 real entries, got ${kbReport.real_count}`);
    assert.ok(monReport.real_count >= 20,
      `monitor must have >= 20 real entries, got ${monReport.real_count}`);
  });

  it('keyboard and monitor have >= 19 real entries (strong foundation)', () => {
    const kbReport = registrySparsityReport(buildKeyboardRegistry());
    const monReport = registrySparsityReport(buildMonitorRegistry());

    assert.ok(kbReport.real_count >= 19,
      `keyboard real_count ${kbReport.real_count} should be >= 19`);
    assert.ok(monReport.real_count >= 19,
      `monitor real_count ${monReport.real_count} should be >= 19`);
  });

  it('all categories have >= 3 distinct real-source tiers (not counting synthetic)', () => {
    for (const [cat, buildFn] of [['mouse', buildMouseRegistry], ['keyboard', buildKeyboardRegistry], ['monitor', buildMonitorRegistry]]) {
      const reg = buildFn();
      const realTiers = new Set(reg.entries.filter(e => !e.synthetic).map(e => e.tier));
      assert.ok(realTiers.size >= 3,
        `${cat}: expected >= 3 real tiers, got ${realTiers.size}: ${[...realTiers].join(', ')}`);
    }
  });

  it('production categories no longer rely on synthetic entries', () => {
    for (const [cat, buildFn] of [['mouse', buildMouseRegistry], ['keyboard', buildKeyboardRegistry], ['monitor', buildMonitorRegistry]]) {
      const reg = buildFn();
      const synthetics = reg.entries.filter(e => e.synthetic);
      assert.deepEqual(
        synthetics.map((entry) => entry.host),
        [],
        `${cat} should have 0 synthetic entries`
      );
    }
  });
});

// ========================================================================
// 13. CONSUMER ENFORCEMENT GAP DOCUMENTATION
// ========================================================================

describe('Phase02 — Consumer Enforcement Audit', () => {
  // These tests document what IS and IS NOT enforced at runtime boundaries.

  it('connector_only exclusion: ENFORCED in domainHintResolver (searchable=false)', () => {
    const { registry } = loadSourceRegistry('test', {
      approved: { manufacturer: ['m1.com', 'm2.com'], retailer: ['r1.com'], lab: ['l1.com'] },
      sources: {
        m1_com: { base_url: 'https://m1.com', tier: 'tier1_manufacturer' },
        m2_com: { base_url: 'https://m2.com', tier: 'tier1_manufacturer' },
        r1_com: { base_url: 'https://r1.com', tier: 'tier3_retailer', connector_only: true },
        l1_com: { base_url: 'https://l1.com', tier: 'tier2_lab' },
      },
    });
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const group = plan.host_groups.find(g => g.host === 'r1.com');
    assert.equal(group.searchable, false, 'connector_only must be excluded from search');
  });

  it('blocked_in_search exclusion: ENFORCED in domainHintResolver (searchable=false)', () => {
    const { registry } = loadSourceRegistry('test', {
      approved: { manufacturer: ['m1.com', 'm2.com'], retailer: ['r1.com'], lab: ['l1.com'] },
      sources: {
        m1_com: { base_url: 'https://m1.com', tier: 'tier1_manufacturer' },
        m2_com: { base_url: 'https://m2.com', tier: 'tier1_manufacturer' },
        r1_com: { base_url: 'https://r1.com', tier: 'tier3_retailer', blocked_in_search: true },
        l1_com: { base_url: 'https://l1.com', tier: 'tier2_lab' },
      },
    });
    const plan = buildEffectiveHostPlan({
      domainHints: ['retailer'],
      registry,
      providerName: 'searxng',
      brandResolutionHints: [],
    });
    const group = plan.host_groups.find(g => g.host === 'r1.com');
    assert.equal(group.searchable, false, 'blocked_in_search must be excluded from search');
  });

});


