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

test('entity-scoped review events invalidate the exact candidate field query', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'candidate-deleted',
      domains: ['review', 'product'],
      entities: {
        productIds: ['mouse-razer-viper'],
        fieldKeys: ['weight'],
      },
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['candidates', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse', 'mouse-razer-viper', 'weight']), true);
  assert.equal(hasQueryKey(keys, ['product', 'mouse', 'mouse-razer-viper']), true);
});

test('entity-scoped product events invalidate product-specific published fields and history', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'product-image-finder-run',
      entities: {
        productIds: ['mouse-razer-viper'],
      },
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['publisher', 'published', 'mouse', 'mouse-razer-viper']), true);
  assert.equal(hasQueryKey(keys, ['indexlab', 'product-history', 'mouse', 'mouse-razer-viper']), true);
});

test('entity-scoped review events invalidate every product and field pair', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'review-manual-override',
      entities: {
        productIds: ['p1', 'p2'],
        fieldKeys: ['weight', 'dpi'],
      },
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['candidates', 'mouse', 'p1', 'weight']), true);
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse', 'p1', 'dpi']), true);
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse', 'p2', 'weight']), true);
  assert.equal(hasQueryKey(keys, ['candidates', 'mouse', 'p2', 'dpi']), true);
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
    'product-image-finder-carousel-updated',
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

test('runtime settings event invalidates all finder families and prompt previews', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'runtime-settings-updated',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['key-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['product-image-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['release-date-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['sku-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['prompt-preview']), true);
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
  assert.equal(hasQueryKey(keys, ['data-authority', 'snapshot', 'mouse']), true);
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

test('module settings event invalidates module-settings query family', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'module-settings-updated',
      category: 'mouse',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['module-settings']), true);
});

test('module settings event invalidates finder panels that consume module settings', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'module-settings-updated',
      category: 'mouse',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['module-settings']), true);
  assert.equal(hasQueryKey(keys, ['catalog', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['key-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['product-image-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['release-date-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['sku-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['prompt-preview']), true);
});

test('field key order saves invalidate all order consumers from explicit domains payload', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'field-key-order-saved',
      category: 'mouse',
      domains: ['studio', 'mapping', 'review-layout'],
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['studio', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['key-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['reviewLayout', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['data-authority', 'snapshot', 'mouse']), true);
});

test('publisher reconcile invalidates candidate list, published fields, and preview', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'publisher-reconcile',
      category: 'mouse',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['publisher', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['publisher', 'published', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['publisher', 'reconcile', 'mouse']), true);
});

test('storage events invalidate storage overview, run list, run details, and IndexLab run list', () => {
  const events = [
    'storage-runs-deleted',
    'storage-runs-bulk-deleted',
    'storage-pruned',
    'storage-purged',
    'storage-urls-deleted',
    'storage-history-purged',
  ];

  for (const event of events) {
    const keys = resolveDataChangeInvalidationQueryKeys({
      message: {
        type: 'data-change',
        event,
        category: 'mouse',
      },
      categories: ['mouse'],
    });

    assert.equal(hasQueryKey(keys, ['storage']), true, `${event} should invalidate broad storage subtree`);
    assert.equal(hasQueryKey(keys, ['storage', 'overview']), true, `${event} should invalidate storage overview`);
    assert.equal(hasQueryKey(keys, ['storage', 'runs', 'mouse']), true, `${event} should invalidate category run list`);
    assert.equal(hasQueryKey(keys, ['indexlab', 'runs']), true, `${event} should invalidate IndexLab run list`);
  }
});

test('CEF variant delete-all event invalidates CEF and downstream finder panels', () => {
  const keys = resolveDataChangeInvalidationQueryKeys({
    message: {
      type: 'data-change',
      event: 'color-edition-finder-variants-deleted-all',
      category: 'mouse',
    },
    categories: ['mouse'],
  });

  assert.equal(hasQueryKey(keys, ['color-edition-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['product-image-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['release-date-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['sku-finder', 'mouse']), true);
  assert.equal(hasQueryKey(keys, ['publisher', 'published', 'mouse']), true);
});
