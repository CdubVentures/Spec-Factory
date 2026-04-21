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

test('typical mandatory + always + easy + 1 variant → floor wins (sum=4 vs floor=3)', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 1,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.breakdown.required, 2);
  assert.equal(r.breakdown.availability, 1);
  assert.equal(r.breakdown.difficulty, 1);
  assert.equal(r.breakdown.variant, 0);
  assert.equal(r.breakdown.sum, 4);
  assert.equal(r.attempts, 4);
});

test('sum below floor → floor wins', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'non_mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 1,
    settings: DEFAULT_SETTINGS,
  });
  assert.equal(r.breakdown.sum, 3);
  assert.equal(r.attempts, 3);
});

test('high-difficulty + rare + mandatory + 4 variants → sum wins', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'rare', difficulty: 'very_hard' },
    variantCount: 4,
    settings: DEFAULT_SETTINGS,
  });
  // required=2 + availability=3 + difficulty=4 + variant=(4-1)*1=3 = 12
  assert.equal(r.breakdown.variant, 3);
  assert.equal(r.breakdown.sum, 12);
  assert.equal(r.attempts, 12);
});

test('unknown axis token → 0 points (graceful)', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'expected', availability: 'sometimes', difficulty: 'extreme' },
    variantCount: 1,
    settings: DEFAULT_SETTINGS,
  });
  // required=0 (unknown), availability=2, difficulty=0 (unknown) → sum=2 → floor wins
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
  assert.equal(r.breakdown.sum, 0);
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

test('breakdown shape is stable (for UI display)', () => {
  const r = calcKeyBudget({
    fieldRule: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    variantCount: 2,
    settings: DEFAULT_SETTINGS,
  });
  assert.deepEqual(Object.keys(r).sort(), ['attempts', 'breakdown']);
  assert.deepEqual(Object.keys(r.breakdown).sort(), ['availability', 'difficulty', 'floor', 'required', 'sum', 'variant']);
});
