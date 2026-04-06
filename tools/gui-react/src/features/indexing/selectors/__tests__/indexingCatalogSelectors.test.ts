import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { deriveVariantOptions } from '../indexingCatalogSelectors.ts';
import type { CatalogRow } from '../../../../types/product.ts';

function makeCatalogRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: 'mouse-abc123',
    brand: 'Endgame Gear',
    model: 'XM1 RGB',
    base_model: 'XM1',
    variant: 'RGB',
    category: 'mouse',
    status: 'active',
    identifier: 'abc123',
    brand_identifier: 'a8158910',
    added_at: '',
    added_by: '',
    ...overrides,
  };
}

describe('deriveVariantOptions', () => {
  it('returns variant label when variant is present', () => {
    const rows = [
      makeCatalogRow({ productId: 'mouse-001', model: 'XM1 RGB', variant: 'RGB' }),
      makeCatalogRow({ productId: 'mouse-002', model: 'XM1r', variant: 'r' }),
    ];
    const options = deriveVariantOptions(rows, 'Endgame Gear', 'XM1');
    strictEqual(options.length, 2);
    strictEqual(options[0].label, 'RGB');
    strictEqual(options[1].label, 'r');
  });

  it('shows (base / no variant) when variant is empty', () => {
    const rows = [
      makeCatalogRow({ productId: 'mouse-001', model: 'Cestus 310', base_model: 'Cestus', variant: '', brand: 'Acer' }),
    ];
    const options = deriveVariantOptions(rows, 'Acer', 'Cestus');
    strictEqual(options.length, 1);
    strictEqual(options[0].label, '(base / no variant)');
    strictEqual(options[0].productId, 'mouse-001');
  });

  it('returns single option for no-variant product (auto-select candidate)', () => {
    const rows = [
      makeCatalogRow({ productId: 'mouse-solo', model: 'G502 X Plus', base_model: 'G502', variant: '', brand: 'Logitech G' }),
    ];
    const options = deriveVariantOptions(rows, 'Logitech G', 'G502');
    // WHY: When exactly 1 option exists, the hook should auto-select it.
    strictEqual(options.length, 1);
    strictEqual(options[0].productId, 'mouse-solo');
  });
});
