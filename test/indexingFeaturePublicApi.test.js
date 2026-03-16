import test from 'node:test';
import assert from 'node:assert/strict';

import { runEnumConsistencyReview } from '../src/features/indexing/index.js';

test('indexing feature public API exposes enum consistency review runtime', () => {
  assert.equal(typeof runEnumConsistencyReview, 'function');
});
