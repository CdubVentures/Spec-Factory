import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { deriveFamilyCountByProductId } from '../familyCount.ts';
import type { CatalogRow } from '../../../types/product.ts';

function makeRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: 'p-1',
    id: 1,
    identifier: 'p-1',
    brand: 'Razer',
    brand_identifier: 'razer',
    model: 'Viper',
    base_model: 'Viper',
    variant: 'White',
    status: 'active',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifVariants: [],
    skuVariants: [],
    rdfVariants: [],
    ...overrides,
  };
}

describe('deriveFamilyCountByProductId', () => {
  it('returns empty map for empty input', () => {
    strictEqual(deriveFamilyCountByProductId([]).size, 0);
  });

  it('assigns each productId the size of its (brand, base_model) family', () => {
    const rows = [
      makeRow({ productId: 'p-1', brand: 'Razer', base_model: 'Viper' }),
      makeRow({ productId: 'p-2', brand: 'Razer', base_model: 'Viper' }),
      makeRow({ productId: 'p-3', brand: 'Razer', base_model: 'Viper' }),
      makeRow({ productId: 'p-4', brand: 'Razer', base_model: 'Basilisk' }),
    ];
    const map = deriveFamilyCountByProductId(rows);
    strictEqual(map.get('p-1'), 3);
    strictEqual(map.get('p-2'), 3);
    strictEqual(map.get('p-3'), 3);
    strictEqual(map.get('p-4'), 1);
  });

  it('normalizes brand and base_model when grouping', () => {
    const rows = [
      makeRow({ productId: 'p-1', brand: '  Razer  ', base_model: 'VIPER' }),
      makeRow({ productId: 'p-2', brand: 'razer', base_model: 'viper' }),
    ];
    const map = deriveFamilyCountByProductId(rows);
    strictEqual(map.get('p-1'), 2);
    strictEqual(map.get('p-2'), 2);
  });

  it('omits rows missing brand or base_model', () => {
    const rows = [
      makeRow({ productId: 'p-1', brand: '', base_model: 'Viper' }),
      makeRow({ productId: 'p-2', brand: 'Razer', base_model: '' }),
      makeRow({ productId: 'p-3', brand: 'Razer', base_model: 'Viper' }),
    ];
    const map = deriveFamilyCountByProductId(rows);
    strictEqual(map.has('p-1'), false);
    strictEqual(map.has('p-2'), false);
    strictEqual(map.get('p-3'), 1);
  });
});
