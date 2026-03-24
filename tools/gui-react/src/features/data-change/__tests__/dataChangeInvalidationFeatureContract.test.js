import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_DATA_CHANGE_DOMAINS,
  DATA_CHANGE_EVENT_DOMAIN_FALLBACK,
  resolveDataChangeInvalidationQueryKeys,
  invalidateDataChangeQueries,
  findUnmappedDataChangeDomains,
} from '../index.js';

test('data-change feature contract exposes invalidation resolver primitives', () => {
  assert.equal(Array.isArray(KNOWN_DATA_CHANGE_DOMAINS), true);
  assert.equal(typeof DATA_CHANGE_EVENT_DOMAIN_FALLBACK, 'object');
  assert.equal(typeof resolveDataChangeInvalidationQueryKeys, 'function');
  assert.equal(typeof invalidateDataChangeQueries, 'function');
  assert.equal(typeof findUnmappedDataChangeDomains, 'function');
});

test('data-change feature contract can resolve query keys for review event', () => {
  const queryKeys = resolveDataChangeInvalidationQueryKeys({
    message: { type: 'data-change', event: 'review-override', domains: ['review'] },
    categories: ['mouse'],
  });
  const signatures = queryKeys.map((queryKey) => JSON.stringify(queryKey));
  assert.equal(signatures.includes(JSON.stringify(['reviewProductsIndex', 'mouse'])), true);
});

test('data-change feature contract reports no unmapped known domains', () => {
  assert.deepEqual(findUnmappedDataChangeDomains(KNOWN_DATA_CHANGE_DOMAINS), []);
});
