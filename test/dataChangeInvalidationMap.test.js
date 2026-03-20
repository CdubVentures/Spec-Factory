import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_DATA_CHANGE_DOMAINS,
  findUnmappedDataChangeDomains,
  resolveDataChangeInvalidationQueryKeys,
  invalidateDataChangeQueries,
} from '../tools/gui-react/src/features/data-change/index.js';

function hasQueryKey(keys, expected) {
  const target = JSON.stringify(expected);
  return keys.some((queryKey) => JSON.stringify(queryKey) === target);
}

test('all known data-change domains are mapped to invalidation templates', () => {
  const unmapped = findUnmappedDataChangeDomains(KNOWN_DATA_CHANGE_DOMAINS);
  assert.deepEqual(unmapped, []);
});

test('review drawer regression: review events invalidate candidates query family', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'review-override',
      domains: ['review', 'product'],
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['product', 'mouse']), true);
});

test('component impact regression: component events invalidate componentImpact', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'component-review',
      domains: ['component', 'review'],
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['componentImpact']), true);
  assert.equal(hasQueryKey(keys, ['componentReviewData', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['studio-component-db', 'mouse']), true);
});

test('event fallback mapping works when domains are omitted', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'component-review',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['componentImpact']), true);
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
});

test('invalidateDataChangeQueries deduplicates repeated domains and categories', () => {
  const invalidated = [];
  const queryKeys = invalidateDataChangeQueries({
    queryClient: {
      invalidateQueries: ({ queryKey }) => {
        invalidated.push(queryKey);
      },
    },
    message: {
      type: 'data-change',
      event: 'component-review',
      domains: ['component', 'review', 'component'],
    },
    categories: ['mouse', 'mouse'],
  });

  assert.deepEqual(invalidated, queryKeys);
  const componentImpactCount = queryKeys.filter((queryKey) => JSON.stringify(queryKey) === JSON.stringify(['componentImpact'])).length;
  assert.equal(componentImpactCount, 1);
});

test('storage settings event invalidates storage settings query key', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'storage-settings-updated',
    },
  });

  assert.equal(hasQueryKey(keys, ['storage-settings']), true);
});

// WHY: When storage destination changes, the run list must refetch from the new source.
test('storage settings event invalidates indexlab runs query key', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'storage-settings-updated',
    },
  });

  assert.equal(hasQueryKey(keys, ['indexlab', 'runs']), true);
});

test('storage relocation started event invalidates storage settings query key', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'indexlab-run-data-relocation-started',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['storage-settings']), true);
});

test('runtime settings event invalidates runtime settings query key', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'runtime-settings-updated',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['runtime-settings']), true);
});

test('user settings event invalidates ui settings query key', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'user-settings-updated',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['ui-settings']), true);
});

test('category created event invalidates category list queries', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'category-created',
    },
  });

  assert.equal(hasQueryKey(keys, ['categories']), true);
  assert.equal(hasQueryKey(keys, ['categories-real']), true);
});

test('test mode created event invalidates contract summary query family', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'test-mode-created',
    },
  });

  assert.equal(hasQueryKey(keys, ['contract-summary']), true);
});

test('source strategy event invalidates category-scoped source strategy query key', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'source-strategy-updated',
      category: 'mouse',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['source-strategy', 'mouse']), true);
});
