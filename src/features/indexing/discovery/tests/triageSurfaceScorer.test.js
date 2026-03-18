/**
 * Tests for triageSurfaceScorer — Stage 06 SERP Triage surface-aware scoring.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidates } from '../triageSurfaceScorer.js';

function makeCategoryConfig() {
  return {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 },
      { host: 'rtings.com', tierName: 'lab', role: 'review', tier: 2 },
    ],
    denylist: [],
    fieldOrder: ['weight', 'sensor', 'dpi'],
  };
}

function makeCandidate(overrides = {}) {
  return {
    url: 'https://example.com/page',
    host: 'example.com',
    title: 'Test Page',
    snippet: 'Test snippet',
    primary_lane: 6,
    identity_prelim: 'exact',
    host_trust_class: 'unknown',
    doc_kind_guess: 'other',
    extraction_surface_prior: 'article_text',
    soft_reason_codes: [],
    ...overrides,
  };
}

describe('triageSurfaceScorer — score composition', () => {
  it('returns score and score_breakdown on every candidate', () => {
    const candidates = [makeCandidate()];
    const scored = scoreCandidates({
      lanedCandidates: candidates,
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      fieldYieldMap: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      effectiveHostPlan: null,
      focusGroups: [],
    });

    assert.equal(typeof scored[0].score, 'number');
    assert.ok(typeof scored[0].score_breakdown === 'object');
    assert.ok('base_relevance' in scored[0].score_breakdown);
    assert.ok('lane_score' in scored[0].score_breakdown);
    assert.ok('surface_prior_score' in scored[0].score_breakdown);
    assert.ok('historical_yield_score' in scored[0].score_breakdown);
    assert.ok('unresolved_field_group_score' in scored[0].score_breakdown);
    assert.ok('identity_prelim_score' in scored[0].score_breakdown);
    assert.ok('soft_penalty_sum' in scored[0].score_breakdown);
  });

  it('score_breakdown components sum to total score', () => {
    const candidates = [makeCandidate({ primary_lane: 1 })];
    const scored = scoreCandidates({
      lanedCandidates: candidates,
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      fieldYieldMap: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      effectiveHostPlan: null,
      focusGroups: [],
    });

    const bd = scored[0].score_breakdown;
    const sum = bd.base_relevance + bd.lane_score + bd.surface_prior_score
      + bd.historical_yield_score + bd.unresolved_field_group_score
      + bd.identity_prelim_score + bd.soft_penalty_sum;
    assert.equal(scored[0].score, sum, 'breakdown sums to total');
  });
});

describe('triageSurfaceScorer — lane_score', () => {
  it('lane 1 gets highest lane_score (+20)', () => {
    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({ primary_lane: 1 })],
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });
    assert.equal(scored[0].score_breakdown.lane_score, 20);
  });

  it('lane 7 gets zero lane_score', () => {
    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({ primary_lane: 7 })],
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });
    assert.equal(scored[0].score_breakdown.lane_score, 0);
  });
});

describe('triageSurfaceScorer — surface_prior_score', () => {
  it('network_json gets highest surface score (+15)', () => {
    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({ extraction_surface_prior: 'network_json' })],
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });
    assert.equal(scored[0].score_breakdown.surface_prior_score, 15);
  });

  it('weak_surface gets zero', () => {
    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({ extraction_surface_prior: 'weak_surface' })],
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });
    assert.equal(scored[0].score_breakdown.surface_prior_score, 0);
  });
});

describe('triageSurfaceScorer — identity_prelim_score', () => {
  it('exact gets +10', () => {
    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({ identity_prelim: 'exact' })],
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });
    assert.equal(scored[0].score_breakdown.identity_prelim_score, 10);
  });

  it('off_target gets -25', () => {
    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({ identity_prelim: 'off_target' })],
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });
    assert.equal(scored[0].score_breakdown.identity_prelim_score, -25);
  });

  it('official manufacturer page outscores generic forum page', () => {
    const scored = scoreCandidates({
      lanedCandidates: [
        makeCandidate({
          url: 'https://razer.com/mice/viper',
          host: 'razer.com',
          primary_lane: 1,
          identity_prelim: 'exact',
          extraction_surface_prior: 'json_ld',
        }),
        makeCandidate({
          url: 'https://reddit.com/r/test',
          host: 'reddit.com',
          primary_lane: 7,
          identity_prelim: 'uncertain',
          extraction_surface_prior: 'weak_surface',
        }),
      ],
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      fieldYieldMap: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      focusGroups: [],
    });

    assert.ok(scored[0].score > scored[1].score, 'official > forum');
  });
});

describe('triageSurfaceScorer — historical_yield_score', () => {
  it('yield score capped at 25', () => {
    const yieldMap = {
      by_domain: {
        'example.com': {
          attempts: 10,
          updated_at: new Date().toISOString(),
          fields: {},
        },
      },
    };
    // Fill many fields with high yield
    for (let i = 0; i < 20; i++) {
      yieldMap.by_domain['example.com'].fields[`field_${i}`] = { seen: 10, accepted: 10, yield: 1.0 };
    }

    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({ host: 'example.com' })],
      categoryConfig: makeCategoryConfig(),
      missingFields: Array.from({ length: 20 }, (_, i) => `field_${i}`),
      fieldYieldMap: yieldMap,
      identityLock: {},
      focusGroups: [],
    });

    assert.ok(scored[0].score_breakdown.historical_yield_score <= 25, 'capped at 25');
  });

  it('yield score zero when domain attempts < 3', () => {
    const yieldMap = {
      by_domain: {
        'example.com': {
          attempts: 2,
          updated_at: new Date().toISOString(),
          fields: { weight: { seen: 2, accepted: 2, yield: 1.0 } },
        },
      },
    };

    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({ host: 'example.com' })],
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      fieldYieldMap: yieldMap,
      identityLock: {},
      focusGroups: [],
    });

    assert.equal(scored[0].score_breakdown.historical_yield_score, 0, 'zero when under min support');
  });

  it('novelty bonus for unseen domains (not community)', () => {
    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({
        host: 'new-domain.com',
        host_trust_class: 'unknown',
      })],
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });

    assert.equal(scored[0].score_breakdown.historical_yield_score, 5, 'novelty bonus = 5');
  });

  it('no novelty bonus for community domains', () => {
    const scored = scoreCandidates({
      lanedCandidates: [makeCandidate({
        host: 'forum.example.com',
        host_trust_class: 'community',
      })],
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight'],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });

    assert.equal(scored[0].score_breakdown.historical_yield_score, 0, 'no novelty for community');
  });
});

describe('triageSurfaceScorer — edge cases', () => {
  it('empty candidates returns empty', () => {
    const scored = scoreCandidates({
      lanedCandidates: [],
      categoryConfig: makeCategoryConfig(),
      missingFields: [],
      fieldYieldMap: {},
      identityLock: {},
      focusGroups: [],
    });
    assert.equal(scored.length, 0);
  });

  it('PDF manual beats generic article when core fields open', () => {
    const scored = scoreCandidates({
      lanedCandidates: [
        makeCandidate({
          url: 'https://manualslib.com/manual/razer-viper.pdf',
          host: 'manualslib.com',
          primary_lane: 2,
          identity_prelim: 'family',
          extraction_surface_prior: 'pdf_table',
          doc_kind_guess: 'manual_pdf',
        }),
        makeCandidate({
          url: 'https://blog.example.com/razer-review',
          host: 'blog.example.com',
          primary_lane: 6,
          identity_prelim: 'exact',
          extraction_surface_prior: 'article_text',
          doc_kind_guess: 'article',
        }),
      ],
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'dpi'],
      fieldYieldMap: {},
      identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
      focusGroups: [],
    });

    assert.ok(scored[0].score > scored[1].score,
      `PDF manual (${scored[0].score}) should outscore generic article (${scored[1].score})`);
  });
});
