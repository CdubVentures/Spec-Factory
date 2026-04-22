import test from 'node:test';
import assert from 'node:assert/strict';
import { calcKeyBudget } from '../keyBudgetCalc.js';

const DEFAULT_SETTINGS = {
  budgetRequiredPoints: { mandatory: 2, non_mandatory: 1 },
  budgetAvailabilityPoints: { always: 1, sometimes: 2, rare: 3 },
  budgetDifficultyPoints: { easy: 1, medium: 2, hard: 3, very_hard: 4 },
  budgetVariantPointsPerExtra: 1,
  budgetFloor: 3,
};

test('typical mandatory + always + easy + 1 variant → floor wins (rawBudget=4 vs floor=3)', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 1,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.breakdown.required, 2);
  assert.equal(r.breakdown.availability, 1);
  assert.equal(r.breakdown.difficulty, 1);
  assert.equal(r.breakdown.variant, 0);
  assert.equal(r.breakdown.rawBudget, 4);
  assert.equal(r.rawBudget, 4);
  assert.equal(r.attempts, 4);
});

test('rawBudget below floor → floor wins', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 1,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.breakdown.rawBudget, 3);
  assert.equal(r.rawBudget, 3);
  assert.equal(r.attempts, 3);
});

test('high-difficulty + rare + mandatory + 4 variants + perExtra=1 → rawBudget=12 integer', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'rare', difficulty: 'very_hard' },
    variantCount: 4,
    settings: DEFAULT_SETTINGS,
  });
  // required=2 + availability=3 + difficulty=4 + variant=(4-1)*1=3 = 12
  assert.equal(r.breakdown.variant, 3);
  assert.equal(r.breakdown.rawBudget, 12);
  assert.equal(r.rawBudget, 12);
  assert.equal(r.attempts, 12);
});

test('unknown axis token → 0 points (graceful)', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'expected', availability: 'sometimes', difficulty: 'extreme' },
    variantCount: 1,
    settings: DEFAULT_SETTINGS,
  });
  // required=0 (unknown), availability=2, difficulty=0 (unknown) → rawBudget=2 → floor wins
  assert.equal(r.breakdown.required, 0);
  assert.equal(r.breakdown.availability, 2);
  assert.equal(r.breakdown.difficulty, 0);
  assert.equal(r.attempts, 3);
});

test('variantCount < 1 → 0 variant extras, never negative', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 0,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.breakdown.variant, 0);
});

test('missing fieldRule axes → all axis points = 0, floor wins', () => {
  const r = calcKeyBudget({ fieldRule: {}, variantCount: 1, settings: DEFAULT_SETTINGS });
  assert.equal(r.breakdown.rawBudget, 0);
  assert.equal(r.rawBudget, 0);
  assert.equal(r.attempts, 3);
});

test('missing settings → defaults to 1 floor, all axes 0', () => {
  const r = calcKeyBudget({ fieldRule: { required_level: 'mandatory' }, variantCount: 1, settings: {} });
  assert.equal(r.breakdown.floor, 1);
  assert.equal(r.attempts, 1);
});

test('floor of 0 or negative → clamped to 1', () => {
  const r = calcKeyBudget({
    fieldRule: {},
    variantCount: 1,
    settings: { ...DEFAULT_SETTINGS, budgetFloor: 0 },
  });
  assert.equal(r.breakdown.floor, 1);
  assert.equal(r.attempts, 1);
});

test('breakdown shape is stable (rawBudget replaces sum for UI display)', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 2,
    settings: DEFAULT_SETTINGS,
  });
  assert.deepEqual(Object.keys(r).sort(), ['attempts', 'breakdown', 'rawBudget']);
  assert.deepEqual(Object.keys(r.breakdown).sort(), ['availability', 'difficulty', 'floor', 'rawBudget', 'required', 'variant']);
});

// ─── Fractional perExtra (new 2026-04-22) ────────────────────────────────

test('perExtra=0.25 + 5 variants → rawBudget integer, attempts = ceil(raw) = raw', () => {
  // mandatory+always+easy = 2+1+1 = 4; variant = (5-1)*0.25 = 1.0 → rawBudget = 5.0
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 5,
    settings: { ...DEFAULT_SETTINGS, budgetVariantPointsPerExtra: 0.25 },
  });
  assert.equal(r.breakdown.variant, 1);
  assert.equal(r.rawBudget, 5);
  assert.equal(r.attempts, 5);
});

test('perExtra=0.25 + 3 variants → rawBudget fractional, attempts = ceil', () => {
  // mandatory+rare+very_hard = 2+3+4 = 9; variant = (3-1)*0.25 = 0.5 → rawBudget = 9.5
  // attempts = ceil(9.5) = 10
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'rare', difficulty: 'very_hard' },
    variantCount: 3,
    settings: { ...DEFAULT_SETTINGS, budgetVariantPointsPerExtra: 0.25 },
  });
  assert.equal(r.breakdown.variant, 0.5);
  assert.equal(r.rawBudget, 9.5);
  assert.equal(r.attempts, 10);
});

test('perExtra=0.3 + 4 variants → rawBudget fractional with precision tolerance, attempts rounds up', () => {
  // mandatory+always+easy = 2+1+1 = 4; variant = (4-1)*0.3 = 0.9 → rawBudget ≈ 4.9
  // attempts = ceil(4.9) = 5
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 4,
    settings: { ...DEFAULT_SETTINGS, budgetVariantPointsPerExtra: 0.3 },
  });
  assert.ok(Math.abs(r.rawBudget - 4.9) < 0.0001, `rawBudget should be ~4.9, got ${r.rawBudget}`);
  assert.equal(r.attempts, 5);
});

test('perExtra=0.25 + low-budget key → fractional rawBudget still respects floor', () => {
  // non_mandatory+always+easy = 1+1+1 = 3; variant = (2-1)*0.25 = 0.25 → rawBudget = 3.25
  // ceil(3.25) = 4, which is above floor of 3 → attempts = 4
  const r = calcKeyBudget({
    fieldRule: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 2,
    settings: { ...DEFAULT_SETTINGS, budgetVariantPointsPerExtra: 0.25 },
  });
  assert.equal(r.rawBudget, 3.25);
  assert.equal(r.attempts, 4);
});

test('perExtra=0.1 + 2 variants below floor → floor wins over ceil', () => {
  // non_mandatory+always+easy = 3; variant = 0.1 → rawBudget = 3.1 → ceil = 4 > floor 3 → attempts = 4
  // But if floor were 5, attempts would be 5.
  const r = calcKeyBudget({
    fieldRule: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 2,
    settings: { ...DEFAULT_SETTINGS, budgetVariantPointsPerExtra: 0.1, budgetFloor: 5 },
  });
  assert.equal(r.breakdown.floor, 5);
  assert.ok(Math.abs(r.rawBudget - 3.1) < 0.0001, `rawBudget should be ~3.1, got ${r.rawBudget}`);
  assert.equal(r.attempts, 5, 'floor of 5 beats ceil(3.1)=4');
});

test('integer axes still floor even with fractional perExtra (axis tables poisoned with decimals)', () => {
  // If someone puts 2.9 in budgetDifficultyPoints.hard, axisPoints should floor it to 2.
  // perExtra is the ONLY fractional input.
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'hard' },
    variantCount: 1,
    settings: {
      ...DEFAULT_SETTINGS,
      budgetDifficultyPoints: { easy: 1, medium: 2, hard: 2.9, very_hard: 4 },
      budgetVariantPointsPerExtra: 0.25,
    },
  });
  assert.equal(r.breakdown.difficulty, 2, 'difficulty table poisoned with 2.9 still floors to 2');
});

test('perExtra as string "0.25" in settings → parsed as float (NumberStepper emits strings)', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 5,
    settings: { ...DEFAULT_SETTINGS, budgetVariantPointsPerExtra: '0.25' },
  });
  assert.equal(r.breakdown.variant, 1);
  assert.equal(r.rawBudget, 5);
});

test('perExtra as empty string → defaults to 0 (no variant penalty), not NaN', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 5,
    settings: { ...DEFAULT_SETTINGS, budgetVariantPointsPerExtra: '' },
  });
  assert.equal(r.breakdown.variant, 0);
  assert.ok(Number.isFinite(r.rawBudget));
});

test('perExtra as negative number → treated as 0 (no variant reward)', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 5,
    settings: { ...DEFAULT_SETTINGS, budgetVariantPointsPerExtra: -0.5 },
  });
  assert.equal(r.breakdown.variant, 0);
});
