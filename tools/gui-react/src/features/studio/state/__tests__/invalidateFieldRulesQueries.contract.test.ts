import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { invalidateFieldRulesQueries } from '../invalidateFieldRulesQueries.ts';

function createQueryClientDouble() {
  const invalidated: unknown[][] = [];
  return {
    invalidated,
    queryClient: {
      invalidateQueries({ queryKey }: { queryKey: unknown[] }) {
        invalidated.push(queryKey);
      },
    },
  };
}

function hasKey(queryKeys: readonly unknown[][], expected: readonly unknown[]) {
  const target = JSON.stringify(expected);
  return queryKeys.some((queryKey) => JSON.stringify(queryKey) === target);
}

describe('invalidateFieldRulesQueries', () => {
  it('routes catalog writes through exact registry events instead of fallback fanout', () => {
    const { queryClient, invalidated } = createQueryClientDouble();

    invalidateFieldRulesQueries(queryClient, 'mouse', {
      event: 'catalog-product-delete',
    });

    assert.equal(hasKey(invalidated, ['catalog', 'mouse']), true);
    assert.equal(hasKey(invalidated, ['catalog-products', 'mouse']), true);
    assert.equal(hasKey(invalidated, ['reviewProductsIndex', 'mouse']), true);
    assert.equal(hasKey(invalidated, ['product', 'mouse']), true);

    assert.equal(hasKey(invalidated, ['storage']), false);
    assert.equal(hasKey(invalidated, ['storage', 'overview']), false);
    assert.equal(hasKey(invalidated, ['source-strategy', 'mouse']), false);
    assert.equal(hasKey(invalidated, ['module-settings']), false);
  });
});
