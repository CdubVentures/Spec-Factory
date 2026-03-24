import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveScreencastCallback,
} from '../runProductContracts.js';

test('resolveScreencastCallback returns undefined when screencast is disabled', () => {
  const cb = () => {};
  assert.equal(resolveScreencastCallback({ runtimeScreencastEnabled: false, onScreencastFrame: cb }), undefined);
});

test('resolveScreencastCallback returns undefined when onScreencastFrame is not a function', () => {
  assert.equal(resolveScreencastCallback({ runtimeScreencastEnabled: true, onScreencastFrame: 'not-a-function' }), undefined);
});

test('resolveScreencastCallback returns callback when enabled and valid', () => {
  const cb = () => {};
  assert.equal(resolveScreencastCallback({ runtimeScreencastEnabled: true, onScreencastFrame: cb }), cb);
});
