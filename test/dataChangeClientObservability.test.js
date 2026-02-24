import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDataChangeClientObservabilitySnapshot,
  recordDataChangeInvalidationFlush,
  resetDataChangeClientObservability,
} from '../tools/gui-react/src/components/layout/dataChangeClientObservability.js';

test('client observability records invalidation flush counters', () => {
  resetDataChangeClientObservability();

  recordDataChangeInvalidationFlush({
    queryKeys: [['catalog', 'mouse'], ['product', 'mouse'], ['catalog', 'mouse']],
    categories: ['mouse', 'mouse'],
  });

  const snapshot = getDataChangeClientObservabilitySnapshot();
  assert.equal(snapshot.invalidation.flush_total, 1);
  assert.equal(snapshot.invalidation.query_keys_total, 3);
  assert.equal(snapshot.invalidation.categories_total, 1);
});

test('client observability resets to baseline', () => {
  resetDataChangeClientObservability();
  recordDataChangeInvalidationFlush({
    queryKeys: [['queue', 'mouse']],
    categories: ['mouse'],
  });
  resetDataChangeClientObservability();
  const snapshot = getDataChangeClientObservabilitySnapshot();
  assert.equal(snapshot.invalidation.flush_total, 0);
  assert.equal(snapshot.invalidation.query_keys_total, 0);
  assert.equal(snapshot.invalidation.categories_total, 0);
});
