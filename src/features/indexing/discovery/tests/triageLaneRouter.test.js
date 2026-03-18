/**
 * Tests for triageLaneRouter — Stage 06 SERP Triage lane assignment + quota.
 *
 * Lanes are source/doc-driven. Identity affects score, not lane membership.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assignLanes, computeLaneQuotas, selectByLaneQuota } from '../triageLaneRouter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLabeled(overrides = {}) {
  return {
    url: overrides.url || 'https://example.com/page',
    host: overrides.host || 'example.com',
    identity_prelim: overrides.identity_prelim || 'exact',
    host_trust_class: overrides.host_trust_class || 'unknown',
    doc_kind_guess: overrides.doc_kind_guess || 'other',
    extraction_surface_prior: overrides.extraction_surface_prior || 'article_text',
    soft_reason_codes: overrides.soft_reason_codes || [],
    score: overrides.score || 0,
    approved_domain: overrides.approved_domain || false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// assignLanes
// ---------------------------------------------------------------------------

describe('triageLaneRouter — assignLanes', () => {
  it('official host → lane 1', () => {
    const candidates = [makeLabeled({ host_trust_class: 'official' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 1);
  });

  it('support host → lane 1', () => {
    const candidates = [makeLabeled({ host_trust_class: 'support' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 1);
  });

  it('manual_pdf doc → lane 2 (wins over lane 1)', () => {
    const candidates = [makeLabeled({
      host_trust_class: 'official',
      doc_kind_guess: 'manual_pdf',
    })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 2);
    assert.ok(result[0].secondary_lanes.includes(1), 'lane 1 in secondary');
  });

  it('spec_sheet doc → lane 2', () => {
    const candidates = [makeLabeled({ doc_kind_guess: 'spec_sheet' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 2);
  });

  it('manual_pdf on community host stays in lane 7 (community gate on lane 2)', () => {
    const candidates = [makeLabeled({
      host_trust_class: 'community',
      doc_kind_guess: 'manual_pdf',
    })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 7);
  });

  it('trusted_review → lane 3', () => {
    const candidates = [makeLabeled({ host_trust_class: 'trusted_review' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 3);
  });

  it('trusted_specdb → lane 4', () => {
    const candidates = [makeLabeled({ host_trust_class: 'trusted_specdb' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 4);
  });

  it('retailer → lane 5', () => {
    const candidates = [makeLabeled({ host_trust_class: 'retailer' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 5);
  });

  it('unknown host → lane 6', () => {
    const candidates = [makeLabeled({ host_trust_class: 'unknown' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 6);
  });

  it('community host → lane 7', () => {
    const candidates = [makeLabeled({ host_trust_class: 'community' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 7);
  });

  it('forum doc_kind → lane 7', () => {
    const candidates = [makeLabeled({ doc_kind_guess: 'forum' })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 7);
  });

  it('off_target identity stays in natural lane (not buried in lane 7)', () => {
    const candidates = [makeLabeled({
      host_trust_class: 'official',
      identity_prelim: 'off_target',
    })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 1, 'stays in official lane despite off_target');
  });

  it('variant identity stays in natural lane', () => {
    const candidates = [makeLabeled({
      host_trust_class: 'trusted_review',
      identity_prelim: 'variant',
    })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 3);
  });

  it('multi_model identity stays in natural lane', () => {
    const candidates = [makeLabeled({
      host_trust_class: 'retailer',
      identity_prelim: 'multi_model',
    })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].primary_lane, 5);
  });

  it('triage_disposition and approval_bucket are set', () => {
    const candidates = [makeLabeled({
      host_trust_class: 'official',
      identity_prelim: 'exact',
      approved_domain: true,
    })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.ok('triage_disposition' in result[0]);
    assert.ok('approval_bucket' in result[0]);
    assert.equal(result[0].approval_bucket, 'approved');
  });

  it('non-approved domain gets candidate bucket', () => {
    const candidates = [makeLabeled({ approved_domain: false })];
    const result = assignLanes({ labeledCandidates: candidates });
    assert.equal(result[0].approval_bucket, 'candidate');
  });

  it('empty input returns empty array', () => {
    const result = assignLanes({ labeledCandidates: [] });
    assert.equal(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// computeLaneQuotas
// ---------------------------------------------------------------------------

describe('triageLaneRouter — computeLaneQuotas', () => {
  it('base quotas use weighted priors, not equal split', () => {
    const { quotas } = computeLaneQuotas({
      missingFields: [],
      focusGroups: [],
      totalBudget: 20,
      fieldYieldMap: {},
    });

    assert.equal(quotas.length, 7);
    const lane1 = quotas.find((q) => q.lane === 1);
    const lane7 = quotas.find((q) => q.lane === 7);
    assert.ok(lane1.quota > lane7.quota, 'lane 1 has higher quota than lane 7');
  });

  it('core unresolved fields boost lanes 1+2', () => {
    const focusGroups = [
      { key: 'connectivity', host_class: 'manufacturer', core_unresolved_count: 5, phase: 'now' },
    ];
    const { quotas: boosted } = computeLaneQuotas({
      missingFields: ['weight', 'sensor', 'dpi', 'polling_rate', 'lift_off_distance'],
      focusGroups,
      totalBudget: 20,
      fieldYieldMap: {},
    });
    const { quotas: base } = computeLaneQuotas({
      missingFields: [],
      focusGroups: [],
      totalBudget: 20,
      fieldYieldMap: {},
    });

    const boostedLane1 = boosted.find((q) => q.lane === 1).quota;
    const baseLane1 = base.find((q) => q.lane === 1).quota;
    assert.ok(boostedLane1 > baseLane1, 'lane 1 boosted when manufacturer fields unresolved');
  });

  it('community lane 7 hard cap at 5% of budget', () => {
    const { quotas } = computeLaneQuotas({
      missingFields: [],
      focusGroups: [],
      totalBudget: 20,
      fieldYieldMap: {},
    });

    const lane7 = quotas.find((q) => q.lane === 7);
    assert.ok(lane7.quota <= Math.max(1, Math.floor(20 * 0.05)), 'community cap respected');
  });

  it('total quotas do not exceed totalBudget', () => {
    const { quotas } = computeLaneQuotas({
      missingFields: ['weight', 'sensor', 'dpi', 'polling_rate', 'lift_off_distance'],
      focusGroups: [
        { key: 'sensor_performance', host_class: 'lab_review', core_unresolved_count: 5, phase: 'now' },
        { key: 'connectivity', host_class: 'manufacturer', core_unresolved_count: 3, phase: 'now' },
        { key: 'dimensions', host_class: 'manufacturer', core_unresolved_count: 4, phase: 'now' },
      ],
      totalBudget: 20,
      fieldYieldMap: {},
    });

    const total = quotas.reduce((sum, q) => sum + q.quota, 0);
    assert.ok(total <= 20, `total ${total} should not exceed budget 20`);
  });

  it('minimum 1 slot per high-value lane (1-4)', () => {
    const { quotas } = computeLaneQuotas({
      missingFields: [],
      focusGroups: [],
      totalBudget: 5,
      fieldYieldMap: {},
    });

    for (const lane of [1, 2, 3, 4]) {
      const q = quotas.find((q) => q.lane === lane);
      assert.ok(q.quota >= 1, `lane ${lane} has at least 1 slot`);
    }
  });
});

// ---------------------------------------------------------------------------
// selectByLaneQuota
// ---------------------------------------------------------------------------

describe('triageLaneRouter — selectByLaneQuota', () => {
  it('selects top-scored candidates per lane up to quota', () => {
    const candidates = [
      makeLabeled({ url: 'https://a.com', primary_lane: 1, score: 100 }),
      makeLabeled({ url: 'https://b.com', primary_lane: 1, score: 50 }),
      makeLabeled({ url: 'https://c.com', primary_lane: 3, score: 80 }),
    ];
    // WHY: set quotas to 0 for empty lanes to prevent redistribution
    const quotas = [
      { lane: 1, quota: 1 },
      { lane: 2, quota: 0 },
      { lane: 3, quota: 1 },
      { lane: 4, quota: 0 },
      { lane: 5, quota: 0 },
      { lane: 6, quota: 0 },
      { lane: 7, quota: 0 },
    ];

    const { selected, notSelected, laneStats } = selectByLaneQuota({
      lanedCandidates: candidates,
      laneQuotas: quotas,
    });

    assert.equal(selected.length, 2, 'two selected (one per lane with candidates)');
    assert.equal(notSelected.length, 1, 'one not selected');
    assert.ok(selected.some((s) => s.url === 'https://a.com'), 'highest score in lane 1 selected');
    assert.ok(selected.some((s) => s.url === 'https://c.com'), 'lane 3 candidate selected');
    assert.ok(notSelected.some((s) => s.url === 'https://b.com'), 'lower score in lane 1 not selected');
    assert.ok(Array.isArray(laneStats), 'laneStats is array');
  });

  it('under-subscribed lanes redistribute to lower-numbered lanes', () => {
    const candidates = [
      makeLabeled({ url: 'https://a.com', primary_lane: 1, score: 100 }),
      makeLabeled({ url: 'https://b.com', primary_lane: 1, score: 90 }),
      makeLabeled({ url: 'https://c.com', primary_lane: 1, score: 80 }),
    ];
    const quotas = [
      { lane: 1, quota: 1 },
      { lane: 2, quota: 2 },
      { lane: 3, quota: 2 },
      { lane: 4, quota: 0 },
      { lane: 5, quota: 0 },
      { lane: 6, quota: 0 },
      { lane: 7, quota: 0 },
    ];

    const { selected } = selectByLaneQuota({
      lanedCandidates: candidates,
      laneQuotas: quotas,
    });

    // Lane 2 and 3 have no candidates, their quotas should redistribute to lane 1
    assert.ok(selected.length >= 2, 'redistribution fills more than base quota');
  });

  it('empty candidates returns empty results', () => {
    const { selected, notSelected } = selectByLaneQuota({
      lanedCandidates: [],
      laneQuotas: [{ lane: 1, quota: 5 }],
    });

    assert.equal(selected.length, 0);
    assert.equal(notSelected.length, 0);
  });

  it('laneStats reports per-lane selected/available counts', () => {
    const candidates = [
      makeLabeled({ url: 'https://a.com', primary_lane: 1, score: 100 }),
      makeLabeled({ url: 'https://b.com', primary_lane: 3, score: 80 }),
    ];
    const quotas = [
      { lane: 1, quota: 1 }, { lane: 2, quota: 1 }, { lane: 3, quota: 1 },
      { lane: 4, quota: 1 }, { lane: 5, quota: 1 }, { lane: 6, quota: 1 },
      { lane: 7, quota: 1 },
    ];

    const { laneStats } = selectByLaneQuota({
      lanedCandidates: candidates,
      laneQuotas: quotas,
    });

    const lane1Stats = laneStats.find((s) => s.lane === 1);
    assert.equal(lane1Stats.selected, 1);
    assert.equal(lane1Stats.available, 1);
  });
});
