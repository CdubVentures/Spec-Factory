import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSourceRegistry,
  sourceEntrySchema,
  TIER_TO_ROLE,
} from './helpers/sourceRegistryPhase02Harness.js';
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
      crawl_config: { rate_limit_ms: 2000, timeout_ms: 10000 },
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
// 4. SOURCE ENTRY SHAPE VALIDATION
// ========================================================================

describe('Phase02 — Source Entry Shape', () => {
  it('preferred_paths not lost when present on source entry', () => {
    // Verify the entry preserves preferred_paths through loadSourceRegistry round-trip.
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
