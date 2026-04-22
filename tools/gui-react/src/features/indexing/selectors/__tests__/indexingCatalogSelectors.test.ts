import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import {
  deriveBrandOptions,
  deriveModelOptions,
  deriveVariantOptions,
  deriveSelectedCatalogProduct,
  deriveCatalogFamilyCountLookup,
  deriveSelectedAmbiguityMeter,
} from '../indexingCatalogSelectors.ts';
import type { CatalogRow } from '../../../../types/product.ts';

function makeCatalogRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: 'mouse-abc123',
    id: 1,
    identifier: 'abc123',
    brand: 'Endgame Gear',
    brand_identifier: 'a8158910',
    model: 'XM1 RGB',
    base_model: 'XM1',
    variant: 'RGB',
    status: 'active',
    hasFinal: false,
    validated: false,
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    lastRun: '',
    inActive: false,
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

  it('returns empty array when brand or model missing', () => {
    const rows = [makeCatalogRow({ productId: 'mouse-001', variant: 'RGB' })];
    strictEqual(deriveVariantOptions(rows, '', 'XM1').length, 0);
    strictEqual(deriveVariantOptions(rows, 'Endgame Gear', '').length, 0);
  });

  it('matches brand and base_model case-insensitively', () => {
    const rows = [makeCatalogRow({ productId: 'm-1', brand: 'Razer', base_model: 'Viper V2 Pro', variant: 'White' })];
    const options = deriveVariantOptions(rows, 'razer', 'viper v2 pro');
    strictEqual(options.length, 1);
    strictEqual(options[0].productId, 'm-1');
  });
});

describe('deriveBrandOptions', () => {
  it('returns empty array when no rows', () => {
    deepStrictEqual(deriveBrandOptions([]), []);
  });

  it('returns unique brands', () => {
    const rows = [
      makeCatalogRow({ productId: 'a', brand: 'Razer' }),
      makeCatalogRow({ productId: 'b', brand: 'Razer' }),
      makeCatalogRow({ productId: 'c', brand: 'Logitech' }),
    ];
    deepStrictEqual(deriveBrandOptions(rows), ['Razer', 'Logitech']);
  });

  it('trims whitespace-padded brand tokens', () => {
    const rows = [
      makeCatalogRow({ productId: 'a', brand: '  Razer  ' }),
    ];
    deepStrictEqual(deriveBrandOptions(rows), ['Razer']);
  });

  it('ignores empty or whitespace-only brand rows', () => {
    const rows = [
      makeCatalogRow({ productId: 'a', brand: '' }),
      makeCatalogRow({ productId: 'b', brand: '   ' }),
      makeCatalogRow({ productId: 'c', brand: 'Pulsar' }),
    ];
    deepStrictEqual(deriveBrandOptions(rows), ['Pulsar']);
  });

  it('preserves first-seen casing for a brand', () => {
    const rows = [
      makeCatalogRow({ productId: 'a', brand: 'Razer' }),
      makeCatalogRow({ productId: 'b', brand: 'RAZER' }),
    ];
    // WHY: deriveBrandOptions uses Set on trimmed strings — exact casing is preserved.
    // Both "Razer" and "RAZER" survive because they differ lexically.
    deepStrictEqual(deriveBrandOptions(rows), ['Razer', 'RAZER']);
  });
});

describe('deriveModelOptions', () => {
  it('returns empty array when no brand selected', () => {
    const rows = [makeCatalogRow({ productId: 'a', brand: 'Razer', base_model: 'Viper' })];
    deepStrictEqual(deriveModelOptions(rows, ''), []);
  });

  it('returns unique base_models for the selected brand', () => {
    const rows = [
      makeCatalogRow({ productId: 'a', brand: 'Razer', base_model: 'Viper' }),
      makeCatalogRow({ productId: 'b', brand: 'Razer', base_model: 'Viper' }),
      makeCatalogRow({ productId: 'c', brand: 'Razer', base_model: 'Basilisk' }),
      makeCatalogRow({ productId: 'd', brand: 'Logitech', base_model: 'G Pro' }),
    ];
    deepStrictEqual(deriveModelOptions(rows, 'Razer'), ['Viper', 'Basilisk']);
  });

  it('matches brand case-insensitively', () => {
    const rows = [
      makeCatalogRow({ productId: 'a', brand: 'Razer', base_model: 'Viper' }),
    ];
    deepStrictEqual(deriveModelOptions(rows, 'razer'), ['Viper']);
  });

  it('ignores rows with empty base_model', () => {
    const rows = [
      makeCatalogRow({ productId: 'a', brand: 'Razer', base_model: '' }),
      makeCatalogRow({ productId: 'b', brand: 'Razer', base_model: 'Viper' }),
    ];
    deepStrictEqual(deriveModelOptions(rows, 'Razer'), ['Viper']);
  });

  it('returns empty when brand has no matching rows', () => {
    const rows = [makeCatalogRow({ productId: 'a', brand: 'Razer', base_model: 'Viper' })];
    deepStrictEqual(deriveModelOptions(rows, 'Pulsar'), []);
  });
});

describe('deriveSelectedCatalogProduct', () => {
  it('returns matching row by productId', () => {
    const target = makeCatalogRow({ productId: 'target-1' });
    const rows = [makeCatalogRow({ productId: 'other' }), target];
    strictEqual(deriveSelectedCatalogProduct(rows, 'target-1'), target);
  });

  it('returns null when productId does not match any row', () => {
    const rows = [makeCatalogRow({ productId: 'a' })];
    strictEqual(deriveSelectedCatalogProduct(rows, 'b'), null);
  });

  it('returns null when productId is empty', () => {
    const rows = [makeCatalogRow({ productId: 'a' })];
    strictEqual(deriveSelectedCatalogProduct(rows, ''), null);
  });

  it('returns null when catalog is empty', () => {
    strictEqual(deriveSelectedCatalogProduct([], 'anything'), null);
  });
});

describe('deriveCatalogFamilyCountLookup', () => {
  it('returns empty map for no rows', () => {
    const map = deriveCatalogFamilyCountLookup([]);
    strictEqual(map.size, 0);
  });

  it('counts sibling variants per brand+base_model', () => {
    const rows = [
      makeCatalogRow({ productId: '1', brand: 'Razer', base_model: 'Viper', variant: 'White' }),
      makeCatalogRow({ productId: '2', brand: 'Razer', base_model: 'Viper', variant: 'Black' }),
      makeCatalogRow({ productId: '3', brand: 'Razer', base_model: 'Viper', variant: 'Mercury' }),
      makeCatalogRow({ productId: '4', brand: 'Razer', base_model: 'Basilisk', variant: '' }),
    ];
    const map = deriveCatalogFamilyCountLookup(rows);
    strictEqual(map.get('razer||viper'), 3);
    strictEqual(map.get('razer||basilisk'), 1);
  });

  it('uses normalized (lowercased, trimmed) keys', () => {
    const rows = [
      makeCatalogRow({ productId: '1', brand: '  Razer  ', base_model: 'VIPER' }),
      makeCatalogRow({ productId: '2', brand: 'razer', base_model: 'viper' }),
    ];
    const map = deriveCatalogFamilyCountLookup(rows);
    strictEqual(map.get('razer||viper'), 2);
  });

  it('skips rows with empty brand or base_model', () => {
    const rows = [
      makeCatalogRow({ productId: '1', brand: '', base_model: 'Viper' }),
      makeCatalogRow({ productId: '2', brand: 'Razer', base_model: '' }),
      makeCatalogRow({ productId: '3', brand: 'Razer', base_model: 'Viper' }),
    ];
    const map = deriveCatalogFamilyCountLookup(rows);
    strictEqual(map.size, 1);
    strictEqual(map.get('razer||viper'), 1);
  });
});

describe('deriveSelectedAmbiguityMeter', () => {
  function withCounts(entries: Array<[string, number]>): Map<string, number> {
    return new Map(entries);
  }

  it('returns unknown when brand/model both empty and no product selected', () => {
    const result = deriveSelectedAmbiguityMeter({
      catalogFamilyCountLookup: new Map(),
      selectedCatalogProduct: null,
      singleBrand: '',
      singleModel: '',
    });
    strictEqual(result.level, 'unknown');
    strictEqual(result.label, 'unknown');
    strictEqual(result.count, 0);
    strictEqual(result.widthPct, 0);
  });

  it('returns easy tier at family count 1', () => {
    const result = deriveSelectedAmbiguityMeter({
      catalogFamilyCountLookup: withCounts([['razer||viper', 1]]),
      selectedCatalogProduct: null,
      singleBrand: 'Razer',
      singleModel: 'Viper',
    });
    strictEqual(result.level, 'easy');
    strictEqual(result.count, 1);
    strictEqual(result.badgeCls, 'sf-chip-success');
  });

  it('returns medium tier for family counts 2 and 3', () => {
    const lookup = withCounts([['a||b', 2], ['c||d', 3]]);
    const two = deriveSelectedAmbiguityMeter({ catalogFamilyCountLookup: lookup, selectedCatalogProduct: null, singleBrand: 'a', singleModel: 'b' });
    const three = deriveSelectedAmbiguityMeter({ catalogFamilyCountLookup: lookup, selectedCatalogProduct: null, singleBrand: 'c', singleModel: 'd' });
    strictEqual(two.level, 'medium');
    strictEqual(three.level, 'medium');
    strictEqual(two.badgeCls, 'sf-chip-warning');
  });

  it('returns hard tier for family counts 4 and 5', () => {
    const lookup = withCounts([['a||b', 4], ['c||d', 5]]);
    const four = deriveSelectedAmbiguityMeter({ catalogFamilyCountLookup: lookup, selectedCatalogProduct: null, singleBrand: 'a', singleModel: 'b' });
    const five = deriveSelectedAmbiguityMeter({ catalogFamilyCountLookup: lookup, selectedCatalogProduct: null, singleBrand: 'c', singleModel: 'd' });
    strictEqual(four.level, 'hard');
    strictEqual(five.level, 'hard');
    strictEqual(four.badgeCls, 'sf-chip-danger');
  });

  it('returns very_hard tier for family counts 6, 7, 8', () => {
    const lookup = withCounts([['a||b', 6], ['c||d', 8]]);
    const six = deriveSelectedAmbiguityMeter({ catalogFamilyCountLookup: lookup, selectedCatalogProduct: null, singleBrand: 'a', singleModel: 'b' });
    const eight = deriveSelectedAmbiguityMeter({ catalogFamilyCountLookup: lookup, selectedCatalogProduct: null, singleBrand: 'c', singleModel: 'd' });
    strictEqual(six.level, 'very_hard');
    strictEqual(eight.level, 'very_hard');
    strictEqual(six.label, 'very hard');
  });

  it('returns extra_hard tier for family counts 9+', () => {
    const lookup = withCounts([['a||b', 9], ['c||d', 25]]);
    const nine = deriveSelectedAmbiguityMeter({ catalogFamilyCountLookup: lookup, selectedCatalogProduct: null, singleBrand: 'a', singleModel: 'b' });
    const many = deriveSelectedAmbiguityMeter({ catalogFamilyCountLookup: lookup, selectedCatalogProduct: null, singleBrand: 'c', singleModel: 'd' });
    strictEqual(nine.level, 'extra_hard');
    strictEqual(many.level, 'extra_hard');
    strictEqual(nine.label, 'extra hard');
  });

  it('prefers selectedCatalogProduct brand/model over singleBrand/singleModel', () => {
    const lookup = withCounts([['razer||viper', 3]]);
    const result = deriveSelectedAmbiguityMeter({
      catalogFamilyCountLookup: lookup,
      selectedCatalogProduct: makeCatalogRow({ productId: 'x', brand: 'Razer', base_model: 'Viper' }),
      singleBrand: 'Fallback',
      singleModel: 'Fallback',
    });
    strictEqual(result.level, 'medium');
    strictEqual(result.count, 3);
  });

  it('falls back to singleBrand/singleModel when selectedCatalogProduct is null', () => {
    const lookup = withCounts([['pulsar||x2', 2]]);
    const result = deriveSelectedAmbiguityMeter({
      catalogFamilyCountLookup: lookup,
      selectedCatalogProduct: null,
      singleBrand: 'Pulsar',
      singleModel: 'X2',
    });
    strictEqual(result.level, 'medium');
    strictEqual(result.count, 2);
  });

  it('defaults missing lookup key to count=1 (treated as easy)', () => {
    // WHY: characterizes current behavior — when the lookup has no entry for the
    // active brand+model, the selector treats the family as count 1 (easy).
    const result = deriveSelectedAmbiguityMeter({
      catalogFamilyCountLookup: new Map(),
      selectedCatalogProduct: null,
      singleBrand: 'Unseen',
      singleModel: 'Product',
    });
    strictEqual(result.level, 'easy');
    strictEqual(result.count, 1);
  });
});
