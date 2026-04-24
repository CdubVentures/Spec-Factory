import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { deriveStaleSelection } from '../staleSelection.ts';
import type { CatalogRow } from '../../../../types/product.ts';

function row(): CatalogRow {
  return {
    productId: 'x',
    id: 1,
    identifier: 'x',
    brand: 'B',
    model: 'M',
    base_model: 'M',
    variant: '',
    status: 'active',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifVariants: [],
    skuVariants: [],
    rdfVariants: [],
  };
}

describe('deriveStaleSelection', () => {
  it('is not stale when no productId and no selection', () => {
    const result = deriveStaleSelection({ singleProductId: '', selectedCatalogProduct: null });
    strictEqual(result.isStale, false);
    strictEqual(result.lastKnownId, '');
  });

  it('is not stale when productId has a matching catalog row', () => {
    const result = deriveStaleSelection({ singleProductId: 'x', selectedCatalogProduct: row() });
    strictEqual(result.isStale, false);
    strictEqual(result.lastKnownId, '');
  });

  it('is stale when productId is set but no catalog row matches', () => {
    const result = deriveStaleSelection({ singleProductId: 'ghost-product', selectedCatalogProduct: null });
    strictEqual(result.isStale, true);
    strictEqual(result.lastKnownId, 'ghost-product');
  });

  it('trims whitespace-only productId to treat as absent', () => {
    const result = deriveStaleSelection({ singleProductId: '   ', selectedCatalogProduct: null });
    strictEqual(result.isStale, false);
  });
});
