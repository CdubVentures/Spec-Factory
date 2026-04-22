/**
 * keyPassengerBuilder — threshold exclusion contract.
 *
 * Packer-level tests live in keyBundler.test.js. This file covers the
 * passenger-builder's own logic: which peers get added to the resolvedFieldKeys
 * set BEFORE packBundle sees them. Specifically the new "good enough" exclusion
 * per §6.2 of per-key-finder-roadmap.html: peers with top-candidate confidence
 * ≥ passengerExcludeAtConfidence AND evidence_count ≥ passengerExcludeMinEvidence
 * are dropped, so the Loop stops spending passenger points on peers that already
 * have a decent unpublished candidate.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildPassengers } from '../keyPassengerBuilder.js';
import {
  register as registryRegister,
  _resetForTest as registryReset,
} from '../../../core/operations/keyFinderRegistry.js';

const SETTINGS_BASE = Object.freeze({
  bundlingEnabled: true,
  groupBundlingOnly: true,
  bundlingPassengerCost: { easy: 1, medium: 2, hard: 4, very_hard: 8 },
  bundlingPoolPerPrimary: { easy: 100, medium: 100, hard: 100, very_hard: 100 },
  passengerDifficultyPolicy: 'less_or_equal',
  // Caps default to "effectively uncapped for these tests" — specific cap tests
  // override these explicitly.
  bundlingOverlapCapEasy: 100,
  bundlingOverlapCapMedium: 100,
  bundlingOverlapCapHard: 100,
  bundlingOverlapCapVeryHard: 0,
});

function rule(overrides = {}) {
  return {
    difficulty: 'easy',
    required_level: 'non_mandatory',
    availability: 'always',
    group: 'g1',
    variant_dependent: false,
    ...overrides,
  };
}

function makeSpecDb({
  resolvedFieldKeys = new Set(),
  topCandidatesByFieldKey = {},
} = {}) {
  const topCalls = [];
  return {
    getResolvedFieldCandidate: (_pid, fk) => (resolvedFieldKeys.has(fk) ? { value: 'X', confidence: 95 } : null),
    getTopFieldCandidate: (_pid, fk) => {
      topCalls.push(fk);
      return topCandidatesByFieldKey[fk] || null;
    },
    _topCalls: topCalls,
  };
}

describe('buildPassengers — threshold exclusion', () => {
  const ENGINE_RULES = {
    polling_rate: rule({ difficulty: 'medium', required_level: 'mandatory' }),
    dpi: rule({ difficulty: 'easy' }),
    buttons: rule({ difficulty: 'easy' }),
    tracking: rule({ difficulty: 'medium' }),
  };
  const primary = { fieldKey: 'polling_rate', fieldRule: ENGINE_RULES.polling_rate };

  it('both knobs at 0 (default) → no getTopFieldCandidate calls made, all peers eligible', () => {
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 0, passengerExcludeMinEvidence: 0 },
    });
    assert.equal(specDb._topCalls.length, 0, 'threshold query should not fire when knobs are disabled');
    assert.ok(passengers.length >= 3, 'dpi+buttons+tracking all eligible by default');
  });

  it('only passengerExcludeAtConfidence > 0 → still disabled (both knobs must be > 0)', () => {
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 80, passengerExcludeMinEvidence: 0 },
    });
    assert.equal(specDb._topCalls.length, 0);
    assert.ok(passengers.length >= 3);
  });

  it('only passengerExcludeMinEvidence > 0 → still disabled', () => {
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 0, passengerExcludeMinEvidence: 2 },
    });
    assert.equal(specDb._topCalls.length, 0);
    assert.ok(passengers.length >= 3);
  });

  it('both knobs > 0: peer meeting BOTH thresholds is excluded', () => {
    const specDb = makeSpecDb({
      topCandidatesByFieldKey: {
        dpi: { confidence: 90, evidence_count: 3 },
        buttons: { confidence: 50, evidence_count: 0 },
        tracking: { confidence: 50, evidence_count: 0 },
      },
    });
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 85, passengerExcludeMinEvidence: 2 },
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(!keys.includes('dpi'), 'dpi meets both thresholds → excluded');
    assert.ok(keys.includes('buttons'), 'buttons below confidence → kept');
    assert.ok(keys.includes('tracking'), 'tracking below confidence → kept');
  });

  it('peer meeting confidence but not evidence_count → kept', () => {
    const specDb = makeSpecDb({
      topCandidatesByFieldKey: {
        dpi: { confidence: 95, evidence_count: 1 }, // evidence below 2
      },
    });
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 85, passengerExcludeMinEvidence: 2 },
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(keys.includes('dpi'), 'dpi has confidence but insufficient evidence → retries as passenger');
  });

  it('peer meeting evidence but not confidence → kept', () => {
    const specDb = makeSpecDb({
      topCandidatesByFieldKey: {
        dpi: { confidence: 75, evidence_count: 5 }, // conf below 85
      },
    });
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 85, passengerExcludeMinEvidence: 2 },
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(keys.includes('dpi'));
  });

  it('peer with no candidate at all (getTopFieldCandidate returns null) → kept', () => {
    const specDb = makeSpecDb({
      topCandidatesByFieldKey: {}, // all peers return null
    });
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 85, passengerExcludeMinEvidence: 2 },
    });
    assert.ok(passengers.length >= 3, 'null top-candidate means nothing to exclude');
  });

  it('published-resolved peers still dropped regardless of threshold knobs (union behavior)', () => {
    // dpi is published-resolved AND happens to have low confidence/evidence —
    // it should still be dropped by the existing published-resolved filter.
    const specDb = makeSpecDb({
      resolvedFieldKeys: new Set(['dpi']),
      topCandidatesByFieldKey: {
        dpi: { confidence: 10, evidence_count: 0 }, // below thresholds but already published
      },
    });
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 85, passengerExcludeMinEvidence: 2 },
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(!keys.includes('dpi'), 'published-resolved peer dropped via existing filter');
  });

  it('gracefully handles specDb without getTopFieldCandidate method (legacy hook)', () => {
    // Older specDb stubs may not expose getTopFieldCandidate yet. The builder
    // should skip threshold exclusion silently rather than throwing.
    const specDb = {
      getResolvedFieldCandidate: () => null,
      // no getTopFieldCandidate
    };
    const passengers = buildPassengers({
      primary,
      engineRules: ENGINE_RULES,
      specDb,
      productId: 'p1',
      settings: { ...SETTINGS_BASE, passengerExcludeAtConfidence: 85, passengerExcludeMinEvidence: 2 },
    });
    assert.ok(passengers.length >= 3);
  });
});

// ─── §6.2 Hard-block on busy primaries (new 2026-04-22) ─────────────────

describe('buildPassengers — hard-block on primaries in flight', () => {
  const ENGINE_RULES = {
    polling_rate: rule({ difficulty: 'medium', required_level: 'mandatory' }),
    dpi: rule({ difficulty: 'easy' }),
    buttons: rule({ difficulty: 'easy' }),
    tracking: rule({ difficulty: 'medium' }),
  };
  const primary = { fieldKey: 'polling_rate', fieldRule: ENGINE_RULES.polling_rate };

  beforeEach(() => registryReset());

  it('peer currently running as primary elsewhere is excluded from passenger pool', () => {
    registryRegister('p1', 'dpi', 'primary');
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary, engineRules: ENGINE_RULES, specDb, productId: 'p1',
      settings: SETTINGS_BASE,
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(!keys.includes('dpi'), 'dpi hard-blocked: running as primary');
    assert.ok(keys.includes('buttons'));
    assert.ok(keys.includes('tracking'));
  });

  it('peer registered only as passenger elsewhere is NOT hard-blocked (that is cap territory)', () => {
    registryRegister('p1', 'dpi', 'passenger');
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary, engineRules: ENGINE_RULES, specDb, productId: 'p1',
      settings: SETTINGS_BASE,
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(keys.includes('dpi'), 'dpi is only a passenger, hard-block does not apply');
  });

  it('cross-product isolation: primary on product 2 does not block passenger on product 1', () => {
    registryRegister('p2', 'dpi', 'primary');
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary, engineRules: ENGINE_RULES, specDb, productId: 'p1',
      settings: SETTINGS_BASE,
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(keys.includes('dpi'), 'primary on different product does not affect us');
  });
});

// ─── §6.3 Per-tier concurrent-ride caps (new 2026-04-22) ────────────────

describe('buildPassengers — concurrent-ride caps', () => {
  const ENGINE_RULES = {
    polling_rate: rule({ difficulty: 'very_hard', required_level: 'mandatory' }),
    dpi: rule({ difficulty: 'easy' }),
    buttons: rule({ difficulty: 'easy' }),
    tracking: rule({ difficulty: 'medium' }),
    battery: rule({ difficulty: 'hard' }),
    sensor_model: rule({ difficulty: 'very_hard' }),
  };
  const primary = { fieldKey: 'polling_rate', fieldRule: ENGINE_RULES.polling_rate };

  beforeEach(() => registryReset());

  it('peer at easy cap (2× concurrent) is skipped; harder peers pick up the slot', () => {
    // dpi is already a passenger in 2 other calls — at cap.
    registryRegister('p1', 'dpi', 'passenger');
    registryRegister('p1', 'dpi', 'passenger');
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary, engineRules: ENGINE_RULES, specDb, productId: 'p1',
      settings: { ...SETTINGS_BASE, bundlingOverlapCapEasy: 2 },
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(!keys.includes('dpi'), 'dpi at cap 2 is skipped');
    assert.ok(keys.includes('buttons'), 'buttons still under cap is eligible');
  });

  it('peer just below cap stays eligible', () => {
    registryRegister('p1', 'dpi', 'passenger'); // 1 current ride, cap 2
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary, engineRules: ENGINE_RULES, specDb, productId: 'p1',
      settings: { ...SETTINGS_BASE, bundlingOverlapCapEasy: 2 },
    });
    assert.ok(passengers.map((p) => p.fieldKey).includes('dpi'));
  });

  it('very_hard cap=0 means UNCAPPED (unlike easy/medium/hard)', () => {
    // very_hard peer with 10 concurrent rides + cap=0 → still eligible.
    for (let i = 0; i < 10; i += 1) registryRegister('p1', 'sensor_model', 'passenger');
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary, engineRules: ENGINE_RULES, specDb, productId: 'p1',
      settings: { ...SETTINGS_BASE, bundlingOverlapCapVeryHard: 0 },
    });
    assert.ok(passengers.map((p) => p.fieldKey).includes('sensor_model'));
  });

  it('easy cap=0 means NEVER pack this tier (all easies skipped)', () => {
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary, engineRules: ENGINE_RULES, specDb, productId: 'p1',
      settings: { ...SETTINGS_BASE, bundlingOverlapCapEasy: 0 },
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(!keys.includes('dpi'), 'easy cap=0 blocks dpi');
    assert.ok(!keys.includes('buttons'), 'easy cap=0 blocks buttons');
    assert.ok(keys.includes('tracking'), 'medium still allowed');
  });

  it('reverse-fallback: all easies at cap → medium + hard peers fill the pool (natural from sort + skip)', () => {
    // Both easy peers at cap=2
    registryRegister('p1', 'dpi', 'passenger');
    registryRegister('p1', 'dpi', 'passenger');
    registryRegister('p1', 'buttons', 'passenger');
    registryRegister('p1', 'buttons', 'passenger');
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary, engineRules: ENGINE_RULES, specDb, productId: 'p1',
      settings: { ...SETTINGS_BASE, bundlingOverlapCapEasy: 2 },
    });
    const keys = passengers.map((p) => p.fieldKey);
    assert.ok(!keys.includes('dpi'));
    assert.ok(!keys.includes('buttons'));
    // tracking (medium) + battery (hard) naturally surface via sort
    assert.ok(keys.includes('tracking'), 'medium peer fills in');
    assert.ok(keys.includes('battery'), 'hard peer fills in');
  });

  it('round-robin within a tier — peer with fewer rides packs before peer at higher rides', () => {
    // Setup: very_hard primary (pool=1, cost 8 → can't fit; test with easy primary pool=6).
    // Three easy peers same axes. dpi has 1 ride already; buttons has 0.
    // Under old sort: dpi sorts first alphabetically. Under round-robin:
    // buttons (0 rides, alphabetical first among 0-riders) packs first.
    registryRegister('p1', 'dpi', 'passenger'); // dpi now at 1 ride
    const easyOnly = {
      polling_rate: rule({ difficulty: 'easy', availability: 'always' }),
      dpi: rule({ difficulty: 'easy', availability: 'always' }),
      buttons: rule({ difficulty: 'easy', availability: 'always' }),
    };
    const easyPrimary = { fieldKey: 'polling_rate', fieldRule: easyOnly.polling_rate };
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary: easyPrimary, engineRules: easyOnly, specDb, productId: 'p1',
      settings: { ...SETTINGS_BASE, bundlingOverlapCapEasy: 10 }, // keep cap high so no exclusion
    });
    const keys = passengers.map((p) => p.fieldKey);
    // Both packed (pool=6 has room), but buttons sorts BEFORE dpi now.
    assert.deepEqual(keys, ['buttons', 'dpi'], 'peer at 0 rides packs before peer at 1 ride');
  });

  it('round-robin spans groups when groupBundlingOnly=false — currentRides is global, not per-group', () => {
    // Peer A lives in group_x with 2 existing rides. Peers B + C live in group_y
    // with 0 rides. Primary is in group_y. groupBundlingOnly=false → all three
    // are candidates. Round-robin must prefer the under-ridden peers regardless
    // of group membership.
    registryRegister('p1', 'peer_a', 'passenger');
    registryRegister('p1', 'peer_a', 'passenger'); // peer_a at asPassenger=2
    // peer_b, peer_c at 0
    const crossGroupRules = {
      primary_y: rule({ difficulty: 'medium', group: 'group_y', required_level: 'mandatory' }),
      peer_a:    rule({ difficulty: 'easy', availability: 'always', group: 'group_x' }),
      peer_b:    rule({ difficulty: 'easy', availability: 'always', group: 'group_y' }),
      peer_c:    rule({ difficulty: 'easy', availability: 'always', group: 'group_y' }),
    };
    const specDb = makeSpecDb();
    const passengers = buildPassengers({
      primary: { fieldKey: 'primary_y', fieldRule: crossGroupRules.primary_y },
      engineRules: crossGroupRules, specDb, productId: 'p1',
      settings: {
        ...SETTINGS_BASE,
        groupBundlingOnly: false, // cross-group enabled
        passengerDifficultyPolicy: 'less_or_equal',
        bundlingOverlapCapEasy: 10, // keep cap permissive — testing sort, not exclusion
      },
    });
    const keys = passengers.map((p) => p.fieldKey);
    // Pool for medium primary = 4, easy cost = 1 → all three fit. Order matters:
    // peer_b + peer_c (both at 0 rides) ahead of peer_a (at 2 rides).
    assert.deepEqual(keys, ['peer_b', 'peer_c', 'peer_a'],
      'peers from different groups round-robin together: low-rides first regardless of group');
  });

  it('round-robin distributes across 5 same-tier hard peers over successive primary fires', () => {
    // Simulates the user's scenario: 5 hard peers, repeated primary fires each
    // pick ONE hard passenger (pool=2, cost 4 for hard — only room for one).
    // After 5 fires with round-robin, every hard peer should have asPassenger=1.
    // Under the old alphabetical-only sort, the first peer gets all 5 rides.
    const hardsOnly = {
      sensor:                    rule({ difficulty: 'medium', required_level: 'mandatory' }),
      sensor_latency:            rule({ difficulty: 'hard', availability: 'sometimes' }),
      sensor_latency_bluetooth:  rule({ difficulty: 'hard', availability: 'sometimes' }),
      sensor_latency_wired:      rule({ difficulty: 'hard', availability: 'sometimes' }),
      sensor_latency_wireless:   rule({ difficulty: 'hard', availability: 'sometimes' }),
      shift_latency:             rule({ difficulty: 'hard', availability: 'sometimes' }),
    };
    const specDb = makeSpecDb();
    const medPrimary = { fieldKey: 'sensor', fieldRule: hardsOnly.sensor };
    const picked = [];
    for (let i = 0; i < 5; i += 1) {
      const passengers = buildPassengers({
        primary: medPrimary, engineRules: hardsOnly, specDb, productId: 'p1',
        // any_but_very_hard lets a medium primary pack hard peers; less_or_equal
        // would exclude them (hard > medium). Pool=4, hard cost=4 → one per fire.
        settings: { ...SETTINGS_BASE, bundlingOverlapCapHard: 6, passengerDifficultyPolicy: 'any_but_very_hard' },
      });
      const firstHard = passengers.find((p) => p.fieldRule.difficulty === 'hard');
      assert.ok(firstHard, `iteration ${i + 1}: at least one hard peer packed`);
      picked.push(firstHard.fieldKey);
      registryRegister('p1', firstHard.fieldKey, 'passenger');
    }
    // Expected picks in order: alphabetical at equal rides each round.
    // Round 1: all at 0 → sensor_latency (alpha first)
    // Round 2: sensor_latency at 1, others at 0 → sensor_latency_bluetooth
    // Round 3: two at 1, three at 0 → sensor_latency_wired
    // Round 4: three at 1, two at 0 → sensor_latency_wireless
    // Round 5: four at 1, one at 0 → shift_latency
    assert.deepEqual(picked, [
      'sensor_latency',
      'sensor_latency_bluetooth',
      'sensor_latency_wired',
      'sensor_latency_wireless',
      'shift_latency',
    ], 'rides distribute across all 5 hard peers in one full cycle');
  });
});
