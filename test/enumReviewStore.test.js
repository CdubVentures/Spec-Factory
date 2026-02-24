import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEnumReviewCategory,
  getEnumReviewQueryKey,
  invalidateEnumReviewDataQuery,
  invalidateEnumAuthorityQueries,
  setEnumReviewQueryData,
} from '../tools/gui-react/src/pages/component-review/enumReviewStore.js';

function createQueryClientDouble() {
  const calls = [];
  const queryClient = {
    invalidateQueries({ queryKey }) {
      calls.push({ op: 'invalidate', queryKey });
    },
    setQueryData(queryKey, updater) {
      calls.push({ op: 'set', queryKey, updater });
      return 'set-ok';
    },
  };
  return { queryClient, calls };
}

test('normalizeEnumReviewCategory trims and falls back to all', () => {
  assert.equal(normalizeEnumReviewCategory('  mouse  '), 'mouse');
  assert.equal(normalizeEnumReviewCategory(''), 'all');
  assert.equal(normalizeEnumReviewCategory(null), 'all');
  assert.equal(normalizeEnumReviewCategory(undefined), 'all');
});

test('getEnumReviewQueryKey uses normalized category token', () => {
  assert.deepEqual(getEnumReviewQueryKey(' mouse '), ['enumReviewData', 'mouse']);
  assert.deepEqual(getEnumReviewQueryKey(''), ['enumReviewData', 'all']);
});

test('invalidateEnumReviewDataQuery only invalidates enum review query key', () => {
  const { queryClient, calls } = createQueryClientDouble();
  invalidateEnumReviewDataQuery(queryClient, 'mouse');
  assert.deepEqual(calls, [
    { op: 'invalidate', queryKey: ['enumReviewData', 'mouse'] },
  ]);
});

test('invalidateEnumAuthorityQueries invalidates enum review + dependent keys', () => {
  const { queryClient, calls } = createQueryClientDouble();
  invalidateEnumAuthorityQueries(queryClient, 'mouse');
  assert.deepEqual(calls, [
    { op: 'invalidate', queryKey: ['enumReviewData', 'mouse'] },
    { op: 'invalidate', queryKey: ['reviewProductsIndex', 'mouse'] },
    { op: 'invalidate', queryKey: ['studio-known-values', 'mouse'] },
  ]);
});

test('invalidateEnumAuthorityQueries honors dependent toggles', () => {
  const { queryClient, calls } = createQueryClientDouble();
  invalidateEnumAuthorityQueries(queryClient, 'mouse', {
    includeReviewProductsIndex: false,
    includeStudioKnownValues: false,
  });
  assert.deepEqual(calls, [
    { op: 'invalidate', queryKey: ['enumReviewData', 'mouse'] },
  ]);
});

test('setEnumReviewQueryData writes through shared enum query key', () => {
  const { queryClient, calls } = createQueryClientDouble();
  const updater = () => ({ fields: [] });
  const result = setEnumReviewQueryData(queryClient, 'mouse', updater);
  assert.equal(result, 'set-ok');
  assert.deepEqual(calls, [
    { op: 'set', queryKey: ['enumReviewData', 'mouse'], updater },
  ]);
});
