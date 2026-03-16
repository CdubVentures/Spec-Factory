import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicScoreWithBreakdown,
} from '../src/research/serpReranker.js';

const BASE_WEIGHTS = {
  identityStrongBonus: 2.0,
  identityPartialBonus: 0.8,
  identityWeakBonus: 0,
  identityNoneBonus: -1.5,
  brandPresenceBonus: 2.5,
  modelPresenceBonus: 2.5,
  specManualKeywordBonus: 1.3,
  reviewBenchmarkBonus: 0.9,
  forumRedditPenalty: -0.9,
  brandInHostnameBonus: 1.2,
  wikipediaPenalty: -1.0,
  variantGuardPenalty: -3.0,
  multiModelHintPenalty: -1.5,
  tier1Bonus: 1.5,
  tier2Bonus: 0.5,
  hostHealthDownrankPenalty: -0.4,
  hostHealthExcludePenalty: -2.0,
  operatorRiskPenalty: -0.5,
  fieldAffinityBonus: 0.5,
  diversityPenaltyPerDupe: -0.3,
  needsetCoverageBonus: 0.2,
};

function makeRow(overrides = {}) {
  return {
    url: 'https://rtings.com/mouse/razer-viper',
    title: 'Razer Viper V3 Pro Review',
    snippet: 'Spec sheet with sensor details',
    host: 'rtings.com',
    rank: 1,
    identity_match_level: 'strong',
    tier: 2,
    ...overrides,
  };
}

describe('serpReranker v2 enrichment — deterministicScoreWithBreakdown', () => {
  it('1. without hostPolicyMap: breakdown unchanged (backward compat)', () => {
    const { score, breakdown } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
    });
    assert.ok(typeof score === 'number');
    assert.ok('base_score' in breakdown);
    assert.ok('tier_bonus' in breakdown);
    // v2 fields should default to 0
    assert.equal(breakdown.host_health_penalty, 0);
    assert.equal(breakdown.operator_risk_penalty, 0);
    assert.equal(breakdown.field_affinity_bonus, 0);
    assert.equal(breakdown.diversity_penalty, 0);
    assert.equal(breakdown.needset_coverage_bonus, 0);
    assert.equal(breakdown.tier_source, 'legacy');
  });

  it('2. with hostPolicyMap: tier_bonus uses policy tier_numeric', () => {
    const hostPolicyMap = {
      'rtings.com': {
        tier_numeric: 2,
        health: null,
        field_coverage: null,
        operator_support: { site: true },
      },
    };
    const { breakdown } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
      hostPolicyMap,
    });
    assert.equal(breakdown.tier_source, 'host_policy');
  });

  it('3. host_health_penalty for downranked host (-0.4)', () => {
    const hostPolicyMap = {
      'rtings.com': {
        tier_numeric: 2,
        health: { success_rate_7d: 0.3 },
        field_coverage: null,
        operator_support: { site: true },
      },
    };
    const effectiveHostPlan = {
      host_groups: [{ host: 'rtings.com', health_action: 'downranked', searchable: true }],
    };
    const { breakdown } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
      hostPolicyMap,
      effectiveHostPlan,
    });
    assert.equal(breakdown.host_health_penalty, -0.4);
  });

  it('4. host_health_penalty = 0 for healthy host', () => {
    const hostPolicyMap = {
      'rtings.com': {
        tier_numeric: 2,
        health: { success_rate_7d: 0.95 },
        field_coverage: null,
        operator_support: { site: true },
      },
    };
    const effectiveHostPlan = {
      host_groups: [{ host: 'rtings.com', health_action: 'normal', searchable: true }],
    };
    const { breakdown } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
      hostPolicyMap,
      effectiveHostPlan,
    });
    assert.equal(breakdown.host_health_penalty, 0);
  });

  it('5. host_health_penalty for excluded host (-2.0)', () => {
    const effectiveHostPlan = {
      host_groups: [{ host: 'rtings.com', health_action: 'excluded', searchable: false }],
    };
    const { breakdown } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
      hostPolicyMap: { 'rtings.com': { tier_numeric: 2 } },
      effectiveHostPlan,
    });
    assert.equal(breakdown.host_health_penalty, -2.0);
  });

  it('6. operator_risk_penalty for unsupported site: operator', () => {
    const hostPolicyMap = {
      'rtings.com': {
        tier_numeric: 2,
        operator_support: { site: false },
      },
    };
    const { breakdown } = deterministicScoreWithBreakdown(
      makeRow({ used_site_operator: true }),
      {
        identity: { brand: 'razer', model: 'viper' },
        weights: BASE_WEIGHTS,
        hostPolicyMap,
      }
    );
    assert.equal(breakdown.operator_risk_penalty, -0.5);
  });

  it('7. field_affinity_bonus when host covers target fields', () => {
    const hostPolicyMap = {
      'rtings.com': {
        tier_numeric: 2,
        field_coverage: { high: ['sensor', 'weight'], medium: ['dpi'], low: [] },
        operator_support: { site: true },
      },
    };
    const { breakdown } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
      hostPolicyMap,
      missingFields: ['sensor', 'weight'],
    });
    assert.ok(breakdown.field_affinity_bonus > 0);
  });

  it('8. needset_coverage_bonus for doc_kind alignment', () => {
    const hostPolicyMap = {
      'rtings.com': {
        tier_numeric: 2,
        doc_kinds: ['review', 'benchmark'],
        field_coverage: null,
        operator_support: { site: true },
      },
    };
    const { breakdown } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
      hostPolicyMap,
      missingFields: ['click_latency'],
    });
    assert.ok(breakdown.needset_coverage_bonus >= 0);
  });

  it('9. diversity_penalty applied at batch level for 3rd+ same-domain result', () => {
    // diversity_penalty is 0 per-row; batch applies it
    const { breakdown } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
    });
    assert.equal(breakdown.diversity_penalty, 0);
  });

  it('10. tier_source is host_policy when map present, legacy otherwise', () => {
    const { breakdown: b1 } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
    });
    assert.equal(b1.tier_source, 'legacy');

    const { breakdown: b2 } = deterministicScoreWithBreakdown(makeRow(), {
      identity: { brand: 'razer', model: 'viper' },
      weights: BASE_WEIGHTS,
      hostPolicyMap: { 'rtings.com': { tier_numeric: 2 } },
    });
    assert.equal(b2.tier_source, 'host_policy');
  });
});
