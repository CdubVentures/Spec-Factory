import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateVariance } from '../varianceEvaluator.js';

test('missing policies and override_allowed remain compliant', () => {
  const cases = [
    { policy: null, dbValue: '100', productValue: '200' },
    { policy: undefined, dbValue: '100', productValue: '200' },
    { policy: '', dbValue: '50', productValue: '999' },
    { policy: 'override_allowed', dbValue: '100', productValue: '999' },
  ];

  for (const { policy, dbValue, productValue } of cases) {
    const result = evaluateVariance(policy, dbValue, productValue);
    assert.equal(result.compliant, true);
  }
});

test('missing or unknown values skip enforcement', () => {
  const cases = [
    { policy: 'authoritative', dbValue: null, productValue: '100' },
    { policy: 'authoritative', dbValue: '100', productValue: null },
    { policy: 'authoritative', dbValue: 'unk', productValue: '100' },
    { policy: 'upper_bound', dbValue: '100', productValue: 'n/a' },
    { policy: 'authoritative', dbValue: 'foo', productValue: '' },
    { policy: 'range', dbValue: '100', productValue: 'unknown' },
  ];

  for (const { policy, dbValue, productValue } of cases) {
    const result = evaluateVariance(policy, dbValue, productValue);
    assert.equal(result.compliant, true);
    assert.equal(result.reason, 'skipped_missing_value');
  }
});

test('unknown policy strings remain compliant with unknown_policy reason', () => {
  const result = evaluateVariance('some_future_policy', '100', '200');
  assert.equal(result.compliant, true);
  assert.equal(result.reason, 'unknown_policy');
});
