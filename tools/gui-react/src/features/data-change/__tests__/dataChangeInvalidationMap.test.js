import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_DATA_CHANGE_DOMAINS,
  findUnmappedDataChangeDomains,
  resolveDataChangeInvalidationQueryKeys,
  invalidateDataChangeQueries,
} from '../index.js';

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

test('CEF run completion invalidates review grid so new candidates appear live', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: { type: 'data-change', event: 'color-edition-finder-run' },
    categories: ['mouse'],
  });
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['product', 'mouse']), true);
});

test('CEF single-run delete invalidates review grid so stripped candidates disappear live', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: { type: 'data-change', event: 'color-edition-finder-run-deleted' },
    categories: ['mouse'],
  });
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['product', 'mouse']), true);
});

test('CEF delete-all-runs invalidates review grid', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: { type: 'data-change', event: 'color-edition-finder-deleted' },
    categories: ['mouse'],
  });
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['product', 'mouse']), true);
});

test('PIF lifecycle events invalidate overview catalog so rings refresh live', () => {
  const events = [
    'product-image-finder-run',
    'product-image-finder-loop',
    'product-image-finder-run-deleted',
    'product-image-finder-deleted',
    'product-image-finder-image-processed',
    'product-image-finder-image-deleted',
    'product-image-finder-batch-processed',
    'product-image-finder-evaluate',
  ];

  for (const event of events) {
    const keys = resolveDataChangeInvalidationQueryKeys({
      message: { type: 'data-change', event },
      categories: ['mouse'],
    });

    assert.equal(
      hasQueryKey(keys, ['catalog', 'mouse']),
      true,
      `${event} should invalidate the Overview catalog query`,
    );
    assert.equal(
      hasQueryKey(keys, ['product-image-finder', 'mouse']),
      true,
      `${event} should still invalidate the PIF detail query`,
    );
  }
});

test('finder discovery-history scrub events invalidate the owning finder query', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: { type: 'data-change', event: 'release-date-finder-discovery-history-scrubbed' },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['release-date-finder', 'mouse']), true);
});

test('Key Finder field delete events invalidate the owning finder and review surfaces', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: { type: 'data-change', event: 'key-finder-field-deleted' },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['key-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['reviewProductsIndex', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['publisher', 'published', 'mouse']), true);
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

test('process-completed event invalidates indexlab product-history and run-list queries', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'process-completed',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['indexlab', 'runs']), true);
  assert.equal(hasQueryKey(keys, ['indexlab', 'product-history', 'mouse']), true);
});

test('spec-seeds event invalidates category-scoped spec-seeds query key (not broad fallback)', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'spec-seeds-updated',
      category: 'mouse',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['spec-seeds', 'mouse']), true);
  // WHY: Prove the broad fallback path is NOT triggered.
  assert.equal(hasQueryKey(keys, ['brands']), false);
});
