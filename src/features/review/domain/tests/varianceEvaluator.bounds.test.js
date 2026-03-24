import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateVariance } from '../varianceEvaluator.js';

test('upper_bound policy enforces upper numeric limits', () => {
  const atBound = evaluateVariance('upper_bound', '100', '100');
  const belowBound = evaluateVariance('upper_bound', '100', '50');
  const commaFormatted = evaluateVariance('upper_bound', '26,000', '25000');
  const aboveBound = evaluateVariance('upper_bound', '100', '101');

  assert.equal(atBound.compliant, true);
  assert.equal(belowBound.compliant, true);
  assert.equal(commaFormatted.compliant, true);
  assert.equal(aboveBound.compliant, false);
  assert.equal(aboveBound.reason, 'exceeds_upper_bound');
  assert.equal(aboveBound.details.bound, 100);
  assert.equal(aboveBound.details.actual, 101);
});

test('lower_bound policy enforces lower numeric limits', () => {
  const atBound = evaluateVariance('lower_bound', '50', '50');
  const aboveBound = evaluateVariance('lower_bound', '50', '100');
  const belowBound = evaluateVariance('lower_bound', '50', '49');

  assert.equal(atBound.compliant, true);
  assert.equal(aboveBound.compliant, true);
  assert.equal(belowBound.compliant, false);
  assert.equal(belowBound.reason, 'below_lower_bound');
  assert.equal(belowBound.details.bound, 50);
  assert.equal(belowBound.details.actual, 49);
});

test('range policy enforces default and custom tolerances', () => {
  const withinDefault = evaluateVariance('range', '100', '105');
  const exactBoundary = evaluateVariance('range', '100', '110');
  const aboveDefault = evaluateVariance('range', '100', '111');
  const belowDefault = evaluateVariance('range', '100', '89');
  const customAllowed = evaluateVariance('range', '100', '119', { tolerance: 0.20 });
  const customBlocked = evaluateVariance('range', '100', '121', { tolerance: 0.20 });
  const zeroMatch = evaluateVariance('range', '0', '0');
  const zeroMiss = evaluateVariance('range', '0', '1');

  assert.equal(withinDefault.compliant, true);
  assert.equal(exactBoundary.compliant, true);
  assert.equal(aboveDefault.compliant, false);
  assert.equal(aboveDefault.reason, 'outside_range');
  assert.equal(aboveDefault.details.expected, 100);
  assert.equal(aboveDefault.details.actual, 111);
  assert.equal(aboveDefault.details.tolerance, 0.10);
  assert.equal(belowDefault.compliant, false);
  assert.equal(belowDefault.reason, 'outside_range');
  assert.equal(customAllowed.compliant, true);
  assert.equal(customBlocked.compliant, false);
  assert.equal(zeroMatch.compliant, true);
  assert.equal(zeroMiss.compliant, false);
});

test('numeric policies skip non-numeric comparisons', () => {
  const cases = [
    ['upper_bound', 'fast', 'faster'],
    ['lower_bound', 'low', 'lower'],
    ['range', 'abc', 'def'],
  ];

  for (const [policy, dbValue, productValue] of cases) {
    const result = evaluateVariance(policy, dbValue, productValue);
    assert.equal(result.compliant, true);
    assert.equal(result.reason, 'skipped_non_numeric');
  }
});
