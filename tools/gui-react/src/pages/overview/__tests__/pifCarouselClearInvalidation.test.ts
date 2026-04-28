import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { invalidatePifCarouselClearAllQueries } from '../pifCarouselClearInvalidation.ts';

describe('invalidatePifCarouselClearAllQueries', () => {
  it('invalidates catalog plus exact PIF product and summary keys only', () => {
    const calls: Array<{ queryKey: readonly unknown[]; exact?: boolean }> = [];

    invalidatePifCarouselClearAllQueries({
      category: 'mouse',
      products: [{ productId: 'p1' }, { productId: 'p2' }],
      queryClient: {
        invalidateQueries: (options) => {
          calls.push(options);
        },
      },
    });

    assert.deepEqual(calls, [
      { queryKey: ['catalog', 'mouse'] },
      { queryKey: ['product-image-finder', 'mouse', 'p1'], exact: true },
      { queryKey: ['product-image-finder', 'mouse', 'p1', 'summary'], exact: true },
      { queryKey: ['product-image-finder', 'mouse', 'p2'], exact: true },
      { queryKey: ['product-image-finder', 'mouse', 'p2', 'summary'], exact: true },
    ]);
  });
});
