import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateVarianceBatch } from '../varianceEvaluator.js';

test('evaluateVarianceBatch reports mixed authoritative results and preserves row ordering', () => {
  const entries = [
    { product_id: 'mouse-a', value: '35000' },
    { product_id: 'mouse-b', value: '26000' },
    { product_id: 'mouse-c', value: '35,000' },
    { product_id: 'mouse-d', value: null },
  ];

  const result = evaluateVarianceBatch('authoritative', '35000', entries);
  assert.equal(result.summary.total, 4);
  assert.equal(result.summary.compliant, 3);
  assert.equal(result.summary.violations, 1);
  assert.equal(result.results.length, 4);
  assert.equal(result.results[0].compliant, true);
  assert.equal(result.results[1].compliant, false);
  assert.equal(result.results[1].product_id, 'mouse-b');
  assert.equal(result.results[2].compliant, true);
  assert.equal(result.results[3].compliant, true);
});

test('evaluateVarianceBatch reports upper-bound violations', () => {
  const entries = [
    { product_id: 'p1', value: '90' },
    { product_id: 'p2', value: '100' },
    { product_id: 'p3', value: '110' },
  ];

  const result = evaluateVarianceBatch('upper_bound', '100', entries);
  assert.equal(result.summary.compliant, 2);
  assert.equal(result.summary.violations, 1);
});

test('evaluateVarianceBatch keeps bypass policies fully compliant', () => {
  const entries = [
    { product_id: 'p1', value: '50' },
    { product_id: 'p2', value: '999' },
    { product_id: 'p3', value: '0' },
  ];

  const overrideAllowed = evaluateVarianceBatch('override_allowed', '100', entries);
  const nullPolicy = evaluateVarianceBatch(null, '100', entries.slice(0, 2));

  assert.equal(overrideAllowed.summary.total, 3);
  assert.equal(overrideAllowed.summary.compliant, 3);
  assert.equal(overrideAllowed.summary.violations, 0);
  for (const result of overrideAllowed.results) {
    assert.equal(result.compliant, true);
  }
  assert.equal(nullPolicy.summary.total, 2);
  assert.equal(nullPolicy.summary.compliant, 2);
  assert.equal(nullPolicy.summary.violations, 0);
});

test('evaluateVarianceBatch returns zero counts for empty input', () => {
  const result = evaluateVarianceBatch('authoritative', '100', []);
  assert.equal(result.summary.total, 0);
  assert.equal(result.summary.compliant, 0);
  assert.equal(result.summary.violations, 0);
  assert.deepEqual(result.results, []);
});
