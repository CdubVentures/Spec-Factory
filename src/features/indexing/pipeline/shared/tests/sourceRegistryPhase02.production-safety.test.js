import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSourceRegistry,
  loadCategoryRaw,
  buildMouseRegistry,
  registrySparsityReport,
} from './helpers/sourceRegistryPhase02Harness.js';
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

  it('production categories have 0 non-manufacturer synthetic entries', () => {
    for (const cat of ['mouse', 'keyboard', 'monitor']) {
      const reg = loadSourceRegistry(cat, loadCategoryRaw(cat)).registry;
      // WHY: manufacturer hosts in approved.manufacturer are intentionally synthetic
      const nonMfrSynthetics = reg.entries.filter(e => e.synthetic && e.tier !== 'tier1_manufacturer').length;
      assert.equal(nonMfrSynthetics, 0, `${cat} should have 0 non-manufacturer synthetic entries`);
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
