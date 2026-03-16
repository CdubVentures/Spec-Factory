import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDataChangeCategory,
  collectDataChangeCategories,
  createDataChangeInvalidationScheduler,
  recordDataChangeInvalidationFlush,
  getDataChangeClientObservabilitySnapshot,
} from '../tools/gui-react/src/features/data-change/index.js';

test('data-change feature public contract exports category scope helpers', () => {
  assert.equal(typeof normalizeDataChangeCategory, 'function');
  assert.equal(typeof collectDataChangeCategories, 'function');
  assert.deepEqual(
    collectDataChangeCategories({ categories: ['Mouse', 'all', 'Keyboard'] }),
    ['mouse', 'keyboard'],
  );
  assert.equal(typeof createDataChangeInvalidationScheduler, 'function');
  assert.equal(typeof recordDataChangeInvalidationFlush, 'function');
  assert.equal(typeof getDataChangeClientObservabilitySnapshot, 'function');
});
