import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateVariance } from '../varianceEvaluator.js';

test('authoritative policy accepts exact and normalized numeric matches', () => {
  const cases = [
    ['PixArt', 'pixart'],
    ['26,000', '26000'],
    ['35000', '35000'],
    ['26000dpi', '26000'],
  ];

  for (const [dbValue, productValue] of cases) {
    const result = evaluateVariance('authoritative', dbValue, productValue);
    assert.equal(result.compliant, true);
  }
});

test('authoritative policy reports string mismatches with details', () => {
  const result = evaluateVariance('authoritative', 'PAW3950', 'PMW3360');
  assert.equal(result.compliant, false);
  assert.equal(result.reason, 'authoritative_mismatch');
  assert.equal(result.details.expected, 'PAW3950');
  assert.equal(result.details.actual, 'PMW3360');
});

test('authoritative policy reports numeric mismatches with normalized details', () => {
  const result = evaluateVariance('authoritative', '26000', '35000');
  assert.equal(result.compliant, false);
  assert.equal(result.reason, 'authoritative_mismatch');
  assert.equal(result.details.expected_numeric, 26000);
  assert.equal(result.details.actual_numeric, 35000);
});
