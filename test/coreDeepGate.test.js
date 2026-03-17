import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFieldCoreDeep,
  applyTierAcceptancePolicy,
  clusterDeepNumericClaims,
} from '../src/features/indexing/discovery/coreDeepGate.js';

function makeFieldRules(overrides = {}) {
  return {
    core_fields: ['sensor', 'weight', 'dpi', 'polling_rate', 'button_count'],
    fields: {
      sensor: { evidence_tier_minimum: 1 },
      weight: { evidence_tier_minimum: 2 },
      dpi: { evidence_tier_minimum: 2 },
      click_latency: { evidence_tier_minimum: 3 },
      rgb_zones: { evidence_tier_minimum: 4 },
      ...overrides.fields,
    },
    ...overrides,
  };
}

describe('coreDeepGate — classifyFieldCoreDeep', () => {
  it('1. core field classified as core_fact', () => {
    const result = classifyFieldCoreDeep('sensor', makeFieldRules());
    assert.equal(result, 'core_fact');
  });

  it('2. non-core field classified as deep_claim', () => {
    const result = classifyFieldCoreDeep('click_latency', makeFieldRules());
    assert.equal(result, 'deep_claim');
  });
});

describe('coreDeepGate — applyTierAcceptancePolicy', () => {
  it('3. tier 1 source accepted for core fact', () => {
    const result = applyTierAcceptancePolicy(
      { tier: 1, value: '3950', corroboration_count: 0 },
      'core_fact'
    );
    assert.equal(result.accepted, true);
  });

  it('4. tier 2 source accepted for core fact', () => {
    const result = applyTierAcceptancePolicy(
      { tier: 2, value: '3950', corroboration_count: 0 },
      'core_fact'
    );
    assert.equal(result.accepted, true);
  });

  it('5. tier 3 source rejected for core fact (no corroboration)', () => {
    const result = applyTierAcceptancePolicy(
      { tier: 3, value: '3950', corroboration_count: 0 },
      'core_fact'
    );
    assert.equal(result.accepted, false);
    assert.ok(result.reason.includes('corroboration'));
  });

  it('6. tier 3 source accepted for core fact with corroboration >= 2', () => {
    const result = applyTierAcceptancePolicy(
      { tier: 3, value: '3950', corroboration_count: 2 },
      'core_fact'
    );
    assert.equal(result.accepted, true);
  });

  it('7. community (tier 4) NEVER overwrites existing core fact', () => {
    const result = applyTierAcceptancePolicy(
      { tier: 4, value: '3950', corroboration_count: 5, existing_core_value: '3395' },
      'core_fact'
    );
    assert.equal(result.accepted, false);
    assert.ok(result.reason.includes('community'));
  });

  it('9. deep claims keep all tiers', () => {
    for (const tier of [1, 2, 3, 4, 5]) {
      const result = applyTierAcceptancePolicy(
        { tier, value: '42', corroboration_count: 0 },
        'deep_claim'
      );
      assert.equal(result.accepted, true, `tier ${tier} should be accepted for deep_claim`);
    }
  });
});

describe('coreDeepGate — clusterDeepNumericClaims', () => {
  it('8. deep numeric claims clustered with median/range/outliers', () => {
    const claims = [
      { value: 60, tier: 2 },
      { value: 62, tier: 3 },
      { value: 61, tier: 1 },
      { value: 200, tier: 4 }, // outlier
    ];
    const result = clusterDeepNumericClaims(claims);
    assert.ok(typeof result.median === 'number');
    assert.ok(result.median >= 60 && result.median <= 62);
    assert.ok(Array.isArray(result.range));
    assert.equal(result.range.length, 2);
    assert.ok(Array.isArray(result.outliers));
    assert.ok(result.outliers.length >= 1);
    assert.ok(typeof result.corroboration_count === 'number');
  });
});

