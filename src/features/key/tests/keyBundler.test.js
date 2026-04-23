/**
 * keyBundler.packBundle — exhaustive boundary contract.
 *
 * Pure function: given primary + candidates + settings + resolvedSet +
 * variantCount, pack same-group passengers under the primary's point pool.
 * Contract matches §6.1 of per-key-finder-roadmap.html (locked 2026-04-21).
 *
 * Test budget heuristic: this IS a boundary contract (cross-feature input to
 * the orchestrator, /summary endpoint, and frontend column). Full matrix.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { packBundle } from '../keyBundler.js';

// ─── Fixtures ────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = Object.freeze({
  bundlingEnabled: true,
  groupBundlingOnly: true,
  bundlingPassengerCost: { easy: 1, medium: 2, hard: 4, very_hard: 8 },
  bundlingPassengerVariantCostPerExtra: 0,
  bundlingPoolPerPrimary: { easy: 6, medium: 4, hard: 2, very_hard: 1 },
  passengerDifficultyPolicy: 'less_or_equal',
  budgetVariantPointsPerExtra: 1,
  // Pins legacy axis order so the pre-configurable-sort test expectations
  // in "step 5 (ordering)" stay authoritative. New default-order coverage
  // lives in its own describe block below.
  bundlingSortAxisOrder: 'required_level,availability,difficulty',
});

function rule({
  group = 'g1',
  difficulty = 'easy',
  availability = 'always',
  required_level = 'non_mandatory',
  variant_dependent = false,
} = {}) {
  return { group, difficulty, availability, required_level, variant_dependent };
}

function entry(fieldKey, ruleOverrides = {}) {
  return { fieldKey, fieldRule: rule(ruleOverrides) };
}

// ─── Step 1 — disabled / degenerate ──────────────────────────────────────

describe('packBundle — step 1 (disabled / degenerate)', () => {
  it('returns solo when bundlingEnabled=false', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'medium' }),
      candidates: [entry('a'), entry('b')],
      resolvedFieldKeys: new Set(),
      settings: { ...DEFAULT_SETTINGS, bundlingEnabled: false },
      variantCount: 1,
    });
    assert.deepEqual(result.passengers, []);
    assert.equal(result.totalCost, 0);
  });

  it('returns solo when pool[primary.difficulty] = 0', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [entry('a', { difficulty: 'easy' })],
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPoolPerPrimary: { easy: 6, medium: 4, hard: 2, very_hard: 0 },
      },
      variantCount: 1,
    });
    assert.deepEqual(result.passengers, []);
    assert.equal(result.pool, 0);
  });

  it('returns solo when candidates empty', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'easy' }),
      candidates: [],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers, []);
  });

  it('returns solo when every candidate is already resolved', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'easy' }),
      candidates: [entry('a'), entry('b'), entry('c')],
      resolvedFieldKeys: new Set(['a', 'b', 'c']),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers, []);
  });

  it('handles undefined candidates array (null-safety)', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'easy' }),
      candidates: undefined,
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers, []);
  });

  it('returns solo when primary.fieldRule.difficulty is unknown (no pool entry)', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'impossible' }),
      candidates: [entry('a', { difficulty: 'easy' })],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers, []);
    assert.equal(result.pool, 0);
  });
});

// ─── Step 3 — passengerDifficultyPolicy matrix ───────────────────────────

describe('packBundle — step 3 (passengerDifficultyPolicy)', () => {
  function runPolicy(policy, primaryDifficulty) {
    return packBundle({
      primary: entry('p', { difficulty: primaryDifficulty }),
      candidates: [
        entry('e', { difficulty: 'easy' }),
        entry('m', { difficulty: 'medium' }),
        entry('h', { difficulty: 'hard' }),
        entry('v', { difficulty: 'very_hard' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        passengerDifficultyPolicy: policy,
        // Pool large enough so eligibility is the ONLY filter (isolate step 3)
        bundlingPoolPerPrimary: { easy: 100, medium: 100, hard: 100, very_hard: 100 },
      },
      variantCount: 1,
    }).passengers.map((p) => p.fieldKey).sort();
  }

  it('less_or_equal: medium primary admits easy + medium only', () => {
    assert.deepEqual(runPolicy('less_or_equal', 'medium'), ['e', 'm']);
  });

  it('less_or_equal: easy primary admits only easy', () => {
    assert.deepEqual(runPolicy('less_or_equal', 'easy'), ['e']);
  });

  it('less_or_equal: very_hard primary admits all', () => {
    assert.deepEqual(runPolicy('less_or_equal', 'very_hard'), ['e', 'h', 'm', 'v']);
  });

  it('same_only: medium primary admits only medium', () => {
    assert.deepEqual(runPolicy('same_only', 'medium'), ['m']);
  });

  it('same_only: very_hard primary admits only very_hard', () => {
    assert.deepEqual(runPolicy('same_only', 'very_hard'), ['v']);
  });

  it('any_but_very_hard: medium primary admits easy + medium + hard', () => {
    assert.deepEqual(runPolicy('any_but_very_hard', 'medium'), ['e', 'h', 'm']);
  });

  it('any_but_very_hard: very_hard primary still excludes very_hard peers', () => {
    assert.deepEqual(runPolicy('any_but_very_hard', 'very_hard'), ['e', 'h', 'm']);
  });

  it('any_but_hard_very_hard: any primary admits only easy + medium', () => {
    assert.deepEqual(runPolicy('any_but_hard_very_hard', 'hard'), ['e', 'm']);
  });

  it('unknown policy defaults to less_or_equal', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'medium' }),
      candidates: [
        entry('e', { difficulty: 'easy' }),
        entry('h', { difficulty: 'hard' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        passengerDifficultyPolicy: 'nonsense',
        bundlingPoolPerPrimary: { easy: 100, medium: 100, hard: 100, very_hard: 100 },
      },
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['e']);
  });
});

// ─── Step 3 (safety filters) ─────────────────────────────────────────────

describe('packBundle — step 3 (safety filters)', () => {
  it('filters out variant_dependent=true peers', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('good', { difficulty: 'easy' }),
        entry('bad', { difficulty: 'easy', variant_dependent: true }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['good']);
  });

  it('filters peers with empty required_level', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('good', { difficulty: 'easy', required_level: 'mandatory' }),
        entry('bad', { difficulty: 'easy', required_level: '' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['good']);
  });

  it('filters peers with unknown required_level value', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('good', { difficulty: 'easy', required_level: 'mandatory' }),
        entry('bad', { difficulty: 'easy', required_level: 'whatever' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['good']);
  });

  it('never includes the primary key itself in passengers', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('p', { difficulty: 'hard' }),
        entry('peer', { difficulty: 'easy' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['peer']);
  });
});

// ─── Step 4 — resolved filter ────────────────────────────────────────────

describe('packBundle — step 4 (resolvedFieldKeys)', () => {
  it('drops peers listed in resolvedFieldKeys Set', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('a', { difficulty: 'easy' }),
        entry('b', { difficulty: 'easy' }),
        entry('c', { difficulty: 'easy' }),
      ],
      resolvedFieldKeys: new Set(['b']),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    const names = result.passengers.map((p) => p.fieldKey);
    assert.ok(!names.includes('b'));
  });

  it('treats missing resolvedFieldKeys as empty', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [entry('a', { difficulty: 'easy' })],
      resolvedFieldKeys: undefined,
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['a']);
  });
});

// ─── Step 5 — sort order ─────────────────────────────────────────────────

describe('packBundle — step 5 (ordering)', () => {
  it('sorts by (required_level ASC, availability ASC, difficulty ASC, field_key ASC) — all non_mandatory still orders by availability first', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('rare_easy', { difficulty: 'easy', availability: 'rare' }),
        entry('always_very_hard', { difficulty: 'very_hard', availability: 'always' }),
        entry('always_easy_z', { difficulty: 'easy', availability: 'always' }),
        entry('always_easy_a', { difficulty: 'easy', availability: 'always' }),
        entry('sometimes_medium', { difficulty: 'medium', availability: 'sometimes' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPoolPerPrimary: { easy: 1000, medium: 1000, hard: 1000, very_hard: 1000 },
      },
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), [
      'always_easy_a',       // always + easy + 'a' (tie)
      'always_easy_z',       // always + easy + 'z' (tie)
      'always_very_hard',    // always + very_hard
      'sometimes_medium',    // sometimes + medium
      'rare_easy',           // rare + easy
    ]);
  });

  it('mandatory peer packs BEFORE non_mandatory peer at equal availability + difficulty (required_level is primary sort key)', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('opt', { difficulty: 'easy', availability: 'always', required_level: 'non_mandatory' }),
        entry('req', { difficulty: 'easy', availability: 'always', required_level: 'mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPoolPerPrimary: { easy: 1000, medium: 1000, hard: 1000, very_hard: 1000 },
      },
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['req', 'opt']);
  });

  it('mandatory peer packs before non_mandatory EVEN WHEN mandatory has worse availability + difficulty', () => {
    // non_mandatory is always+easy (best on every secondary axis) but mandatory
    // still wins because required_level is the primary sort key.
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('opt_easy', { difficulty: 'easy', availability: 'always', required_level: 'non_mandatory' }),
        entry('mand_hard', { difficulty: 'hard', availability: 'rare', required_level: 'mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPoolPerPrimary: { easy: 1000, medium: 1000, hard: 1000, very_hard: 1000 },
      },
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['mand_hard', 'opt_easy']);
  });

  it('two mandatory peers still sort by (availability, difficulty, field_key) among themselves', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('m_rare', { difficulty: 'easy', availability: 'rare', required_level: 'mandatory' }),
        entry('m_always_z', { difficulty: 'easy', availability: 'always', required_level: 'mandatory' }),
        entry('m_always_a', { difficulty: 'easy', availability: 'always', required_level: 'mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPoolPerPrimary: { easy: 1000, medium: 1000, hard: 1000, very_hard: 1000 },
      },
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['m_always_a', 'm_always_z', 'm_rare']);
  });

  it('tight pool: mandatory peers consume pool before non_mandatory get a chance', () => {
    // Pool=2 (hard primary). Two mandatory easies (cost 1 each) + one non_mandatory easy (cost 1).
    // Mandatories pack first and consume the full pool; non_mandatory is skipped.
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('opt', { difficulty: 'easy', availability: 'always', required_level: 'non_mandatory' }),
        entry('req1', { difficulty: 'easy', availability: 'always', required_level: 'mandatory' }),
        entry('req2', { difficulty: 'easy', availability: 'always', required_level: 'mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['req1', 'req2']);
    assert.equal(result.totalCost, 2);
  });

  it('determinism: mixed required_level under shuffled input order produces identical output', () => {
    const build = (order) => packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: order.map(([key, req, avail, diff]) =>
        entry(key, { required_level: req, availability: avail, difficulty: diff })
      ),
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPoolPerPrimary: { easy: 1000, medium: 1000, hard: 1000, very_hard: 1000 },
      },
      variantCount: 1,
    }).passengers.map((p) => p.fieldKey);
    const peers = [
      ['a', 'non_mandatory', 'always', 'easy'],
      ['b', 'mandatory', 'rare', 'hard'],
      ['c', 'mandatory', 'always', 'easy'],
      ['d', 'non_mandatory', 'sometimes', 'medium'],
    ];
    const forward = build(peers);
    const reverse = build([...peers].reverse());
    const shuffled = build([peers[2], peers[0], peers[3], peers[1]]);
    assert.deepEqual(forward, reverse);
    assert.deepEqual(forward, shuffled);
  });

  it('field_key tiebreaker is load-bearing (two peers with same availability + difficulty)', () => {
    // Run twice with candidates in different input orders — result must be identical
    const build = (order) => packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: order.map((k) => entry(k, { difficulty: 'easy', availability: 'always' })),
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPoolPerPrimary: { easy: 1000, medium: 1000, hard: 1000, very_hard: 1000 },
      },
      variantCount: 1,
    }).passengers.map((p) => p.fieldKey);
    const forward = build(['a', 'b', 'c']);
    const reverse = build(['c', 'b', 'a']);
    assert.deepEqual(forward, reverse);
    assert.deepEqual(forward, ['a', 'b', 'c']);
  });
});

// ─── Step 5 — sort order under DEFAULT axis order (difficulty → required → availability) ──
// The new configurable sort knob (bundlingSortAxisOrder) defaults to
// "difficulty,required_level,availability" — easy wins first, mandatory
// breaks ties within equal difficulty. Overrides DEFAULT_SETTINGS' legacy
// pinning (which the existing describe block above preserves).

describe('packBundle — step 5 (ordering) under default axis order (difficulty → required → availability)', () => {
  const DEFAULT_ORDER_SETTINGS = {
    ...DEFAULT_SETTINGS,
    bundlingSortAxisOrder: 'difficulty,required_level,availability',
    bundlingPoolPerPrimary: { easy: 1000, medium: 1000, hard: 1000, very_hard: 1000 },
  };

  it('easy non_mandatory packs BEFORE hard mandatory (difficulty is primary axis)', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('mand_hard', { difficulty: 'hard', availability: 'always', required_level: 'mandatory' }),
        entry('opt_easy',  { difficulty: 'easy', availability: 'always', required_level: 'non_mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_ORDER_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['opt_easy', 'mand_hard']);
  });

  it('within same difficulty, mandatory packs before non_mandatory', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('opt', { difficulty: 'easy', availability: 'always', required_level: 'non_mandatory' }),
        entry('req', { difficulty: 'easy', availability: 'always', required_level: 'mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_ORDER_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['req', 'opt']);
  });

  it('within same difficulty + required_level, always packs before rare (availability last)', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('rare_e',   { difficulty: 'easy', availability: 'rare',      required_level: 'mandatory' }),
        entry('always_e', { difficulty: 'easy', availability: 'always',    required_level: 'mandatory' }),
        entry('somet_e',  { difficulty: 'easy', availability: 'sometimes', required_level: 'mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_ORDER_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['always_e', 'somet_e', 'rare_e']);
  });

  it('full 3-axis precedence produces expected total order', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('mand_rare_easy',     { difficulty: 'easy',   availability: 'rare',   required_level: 'mandatory' }),
        entry('mand_always_hard',   { difficulty: 'hard',   availability: 'always', required_level: 'mandatory' }),
        entry('opt_always_easy',    { difficulty: 'easy',   availability: 'always', required_level: 'non_mandatory' }),
        entry('opt_rare_very_hard', { difficulty: 'very_hard', availability: 'rare', required_level: 'non_mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_ORDER_SETTINGS,
      variantCount: 1,
    });
    // Difficulty drives everything:
    //   easy first (mand beats opt, always beats rare within mand)
    //   then hard, then very_hard.
    // Within easy: mand_rare (mand) < opt_always (opt) per required-level tiebreaker.
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), [
      'mand_rare_easy',
      'opt_always_easy',
      'mand_always_hard',
      'opt_rare_very_hard',
    ]);
  });

  it('determinism under shuffled input', () => {
    const peers = [
      ['a', 'non_mandatory', 'always', 'easy'],
      ['b', 'mandatory', 'rare', 'hard'],
      ['c', 'mandatory', 'always', 'easy'],
      ['d', 'non_mandatory', 'sometimes', 'medium'],
    ];
    const build = (order) => packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: order.map(([key, req, avail, diff]) =>
        entry(key, { required_level: req, availability: avail, difficulty: diff })
      ),
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_ORDER_SETTINGS,
      variantCount: 1,
    }).passengers.map((p) => p.fieldKey);
    const forward = build(peers);
    const reverse = build([...peers].reverse());
    const shuffled = build([peers[2], peers[0], peers[3], peers[1]]);
    assert.deepEqual(forward, reverse);
    assert.deepEqual(forward, shuffled);
    // c (easy+mand) → a (easy+opt) → d (medium+opt) → b (hard+mand)
    assert.deepEqual(forward, ['c', 'a', 'd', 'b']);
  });

  it('empty / missing bundlingSortAxisOrder → defaults to difficulty → required → availability', () => {
    const noKnob = { ...DEFAULT_SETTINGS };
    delete noKnob.bundlingSortAxisOrder;
    noKnob.bundlingPoolPerPrimary = { easy: 1000, medium: 1000, hard: 1000, very_hard: 1000 };

    const result = packBundle({
      primary: entry('p', { difficulty: 'very_hard' }),
      candidates: [
        entry('mand_hard', { difficulty: 'hard', availability: 'always', required_level: 'mandatory' }),
        entry('opt_easy',  { difficulty: 'easy', availability: 'always', required_level: 'non_mandatory' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: noKnob,
      variantCount: 1,
    });
    // Default kicks in: easy wins, even though mand_hard is mandatory.
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['opt_easy', 'mand_hard']);
  });
});

// ─── Step 5b — round-robin tiebreaker (currentRides) ────────────────────

describe('packBundle — currentRides tiebreaker', () => {
  function entryWithRides(fieldKey, ruleOverrides, currentRides) {
    return { fieldKey, fieldRule: rule(ruleOverrides), currentRides };
  }

  it('same-tier peers sort by currentRides ASC before field_key', () => {
    // Five hard peers, same axes. Without currentRides the alphabetical first
    // (sensor_latency) wins every time. With currentRides, the peer at 0 rides
    // beats the peer at 4 even if the 0 sorts alphabetically later.
    // Medium primary pool=4 + any_but_very_hard policy → exactly one hard fits per pack.
    const result = packBundle({
      primary: entry('p', { difficulty: 'medium' }),
      candidates: [
        entryWithRides('sensor_latency',            { difficulty: 'hard', availability: 'sometimes' }, 4),
        entryWithRides('sensor_latency_bluetooth',  { difficulty: 'hard', availability: 'sometimes' }, 0),
        entryWithRides('sensor_latency_wired',      { difficulty: 'hard', availability: 'sometimes' }, 0),
        entryWithRides('sensor_latency_wireless',   { difficulty: 'hard', availability: 'sometimes' }, 0),
        entryWithRides('shift_latency',             { difficulty: 'hard', availability: 'sometimes' }, 0),
      ],
      resolvedFieldKeys: new Set(),
      settings: { ...DEFAULT_SETTINGS, passengerDifficultyPolicy: 'any_but_very_hard' },
      variantCount: 1,
    });
    // Under old sort: sensor_latency wins alphabetically regardless of rides.
    // Under round-robin: sensor_latency_bluetooth wins (0 rides, alphabetical first among 0-riders).
    assert.equal(result.passengers[0]?.fieldKey, 'sensor_latency_bluetooth', 'peer with 0 rides beats peer at 4 rides');
  });

  it('stable within equal currentRides — field_key is the final tiebreaker', () => {
    const build = (input) => packBundle({
      primary: entry('p', { difficulty: 'easy' }),
      candidates: input,
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    }).passengers.map((p) => p.fieldKey);
    const all0 = [
      entryWithRides('charlie', { difficulty: 'easy', availability: 'always' }, 0),
      entryWithRides('alpha',   { difficulty: 'easy', availability: 'always' }, 0),
      entryWithRides('bravo',   { difficulty: 'easy', availability: 'always' }, 0),
    ];
    const forward = build(all0);
    const reverse = build([...all0].reverse());
    assert.deepEqual(forward, ['alpha', 'bravo', 'charlie'], 'alphabetical when rides tied');
    assert.deepEqual(forward, reverse, 'stable regardless of input order');
  });

  it('omitted/negative/NaN currentRides treated as 0', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'easy' }), // pool=6, easy cost=1 → all 3 fit
      candidates: [
        { fieldKey: 'x', fieldRule: rule({ difficulty: 'easy', availability: 'always' }) }, // no currentRides
        { fieldKey: 'y', fieldRule: rule({ difficulty: 'easy', availability: 'always' }), currentRides: -5 },
        { fieldKey: 'z', fieldRule: rule({ difficulty: 'easy', availability: 'always' }), currentRides: NaN },
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    // All normalize to 0 → alphabetical wins within the tied-rides bucket.
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['x', 'y', 'z']);
  });

  it('active ride avoidance overrides higher-priority sort axes during the clean pass', () => {
    // The no-overlap-first contract is stronger than the axis ordering:
    // an already-riding mandatory peer must not consume the clean pool ahead
    // of an idle non-mandatory peer.
    const result = packBundle({
      primary: entry('p', { difficulty: 'medium' }),
      candidates: [
        { fieldKey: 'non_mand_0', fieldRule: rule({ difficulty: 'easy', required_level: 'non_mandatory' }), currentRides: 0 },
        { fieldKey: 'mand_5',     fieldRule: rule({ difficulty: 'easy', required_level: 'mandatory' }),     currentRides: 5 },
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.equal(result.passengers[0].fieldKey, 'non_mand_0', 'idle peer wins clean pass despite weaker axes');
    assert.equal(result.passengers[1].fieldKey, 'mand_5', 'already-riding peer is only fallback');
  });

  it('does not pack already-riding peers when idle peers can fill the pool', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }), // pool=2
      candidates: [
        { fieldKey: 'active_mand', fieldRule: rule({ difficulty: 'easy', required_level: 'mandatory' }), currentRides: 1 },
        { fieldKey: 'idle_a', fieldRule: rule({ difficulty: 'easy', required_level: 'non_mandatory' }), currentRides: 0 },
        { fieldKey: 'idle_b', fieldRule: rule({ difficulty: 'easy', required_level: 'non_mandatory' }), currentRides: 0 },
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['idle_a', 'idle_b']);
    assert.equal(result.totalCost, 2);
  });

  it('falls back to already-riding peers when idle peers cannot fill the pool', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }), // pool=2
      candidates: [
        { fieldKey: 'active_mand', fieldRule: rule({ difficulty: 'easy', required_level: 'mandatory' }), currentRides: 1 },
        { fieldKey: 'idle_a', fieldRule: rule({ difficulty: 'easy', required_level: 'non_mandatory' }), currentRides: 0 },
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['idle_a', 'active_mand']);
    assert.equal(result.totalCost, 2);
  });
});

// ─── Step 6 — greedy pack + variant scaling ──────────────────────────────

describe('packBundle — step 6 (greedy pack + variant cost)', () => {
  it('greedy-packs easy peers to fill pool exactly', () => {
    // easy primary → pool=6, easy cost=1, variantCount=1 → 6 easy peers fit
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) =>
      entry(k, { difficulty: 'easy', availability: 'always' })
    );
    const result = packBundle({
      primary: entry('p', { difficulty: 'easy' }),
      candidates,
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.equal(result.passengers.length, 6);
    assert.equal(result.totalCost, 6);
    assert.equal(result.pool, 6);
  });

  it('drops peers that would overshoot pool but keeps smaller ones that still fit', () => {
    // pool=5, first sorted peer costs 8 (always-very_hard), then 1s
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('huge', { difficulty: 'very_hard', availability: 'always' }),
        entry('a', { difficulty: 'easy', availability: 'always' }),
        entry('b', { difficulty: 'easy', availability: 'always' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        passengerDifficultyPolicy: 'any_but_very_hard',
        bundlingPoolPerPrimary: { easy: 5, medium: 5, hard: 5, very_hard: 5 },
      },
      variantCount: 1,
    });
    // huge filtered by policy (any_but_very_hard), a + b fit
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['a', 'b']);
    assert.equal(result.totalCost, 2);
  });

  it('continue-skip: skips overshooting peer but still grabs later fitting one', () => {
    // pool=2, sort puts always-hard (cost=4) first — doesn't fit — but then always-easy fits
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('hard_peer', { difficulty: 'hard', availability: 'always' }),
        entry('easy_peer', { difficulty: 'easy', availability: 'always' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    // hard primary pool=2; hard peer costs 4 (skip), easy peer costs 1 (fit)
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['easy_peer']);
    assert.equal(result.totalCost, 1);
  });

  it('applies fractional passenger surcharge for each extra family variant', () => {
    // easy pool=6, base easy cost=1, family size 4 with +0.25 per extra
    // → cost 1.75 each, so only 3 easy peers fit.
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) =>
      entry(k, { difficulty: 'easy', availability: 'always' })
    );
    const result = packBundle({
      primary: entry('p', { difficulty: 'easy' }),
      candidates,
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPassengerVariantCostPerExtra: 0.25,
      },
      variantCount: 4,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['a', 'b', 'c']);
    assert.equal(result.totalCost, 5.25);
    assert.deepEqual(result.breakdown, [
      { fieldKey: 'a', cost: 1.75 },
      { fieldKey: 'b', cost: 1.75 },
      { fieldKey: 'c', cost: 1.75 },
    ]);
  });

  it('leaves passenger cost raw for one-variant families', () => {
    const candidates = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) =>
      entry(k, { difficulty: 'easy', availability: 'always' })
    );
    const result = packBundle({
      primary: entry('p', { difficulty: 'easy' }),
      candidates,
      resolvedFieldKeys: new Set(),
      settings: {
        ...DEFAULT_SETTINGS,
        bundlingPassengerVariantCostPerExtra: 0.25,
      },
      variantCount: 1,
    });
    assert.equal(result.passengers.length, 6, 'one variant keeps easy passenger cost at 1');
    assert.equal(result.totalCost, 6);
  });

  it('hard primary pool=2 fits 1 medium OR 2 easies (user-facing math)', () => {
    // Hard primary with 1 medium + 2 easy peers → policy less_or_equal admits all 3.
    // Sort: (availability, difficulty) → easies first (cost 1 each), medium after (cost 2).
    // Pool=2: easy+easy = 2 fits exactly; medium (cost 2) still available but overshoots remaining 0.
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('e1', { difficulty: 'easy', availability: 'always' }),
        entry('e2', { difficulty: 'easy', availability: 'always' }),
        entry('m1', { difficulty: 'medium', availability: 'always' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['e1', 'e2']);
    assert.equal(result.totalCost, 2);
  });

  it('hard primary pool=2 fits 1 medium when no easies available', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('m1', { difficulty: 'medium', availability: 'always' }),
        entry('m2', { difficulty: 'medium', availability: 'always' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
    });
    assert.deepEqual(result.passengers.map((p) => p.fieldKey), ['m1']);
    assert.equal(result.totalCost, 2);
  });
});

// ─── Invariants + breakdown shape ────────────────────────────────────────

describe('packBundle — invariants', () => {
  it('totalCost never exceeds pool', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('a', { difficulty: 'easy' }),
        entry('b', { difficulty: 'easy' }),
        entry('c', { difficulty: 'easy' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.ok(result.totalCost <= result.pool);
  });

  it('breakdown reflects each accepted passenger with its effective cost', () => {
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [
        entry('a', { difficulty: 'easy' }),
        entry('b', { difficulty: 'easy' }),
      ],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.deepEqual(result.breakdown, [
      { fieldKey: 'a', cost: 1 },
      { fieldKey: 'b', cost: 1 },
    ]);
  });

  it('preserves fieldRule reference on returned passengers (no cloning surprises)', () => {
    const peerRule = rule({ difficulty: 'easy' });
    const result = packBundle({
      primary: entry('p', { difficulty: 'hard' }),
      candidates: [{ fieldKey: 'peer', fieldRule: peerRule }],
      resolvedFieldKeys: new Set(),
      settings: DEFAULT_SETTINGS,
      variantCount: 1,
    });
    assert.equal(result.passengers[0].fieldRule, peerRule);
  });
});
