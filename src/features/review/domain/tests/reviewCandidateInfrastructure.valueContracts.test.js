import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasKnownValue,
  valueToken,
} from '../candidateInfrastructure.js';

test('valueToken normalizes scalars and objects', () => {
  assert.equal(valueToken(null), '');
  assert.equal(valueToken(undefined), '');
  assert.equal(valueToken('Hello'), 'hello');
  assert.equal(valueToken(42), '42');
  assert.equal(valueToken(true), 'true');
  assert.equal(valueToken({ b: 2, a: 1 }), '{a:1,b:2}');
  assert.equal(valueToken([3, 1]), '[3,1]');
});

test('hasKnownValue rejects unknowns', () => {
  const unknowns = [null, undefined, '', 'unk', 'unknown', 'n/a', 'null', 'UNK', 'Unknown', 'N/A'];
  for (const value of unknowns) {
    assert.equal(hasKnownValue(value), false, `hasKnownValue(${JSON.stringify(value)}) should be false`);
  }
  assert.equal(hasKnownValue('real'), true);
  assert.equal(hasKnownValue(0), true);
  assert.equal(hasKnownValue(false), true);
});
