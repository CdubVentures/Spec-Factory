import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { deriveFilteredCatalog } from '../filteredCatalog.ts';
import type { CatalogRow } from '../../../../types/product.ts';

function makeRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: 'p1',
    id: 1,
    identifier: 'p1',
    brand: 'Razer',
    model: 'Viper V2 Pro',
    base_model: 'Viper V2 Pro',
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

const SAMPLE_CATALOG: CatalogRow[] = [
  makeRow({ productId: 'rv-w', brand: 'Razer', base_model: 'Viper V2 Pro', variant: 'White' }),
  makeRow({ productId: 'rv-b', brand: 'Razer', base_model: 'Viper V2 Pro', variant: 'Black' }),
  makeRow({ productId: 'rv-m', brand: 'Razer', base_model: 'Viper V2 Pro', variant: 'Mercury' }),
  makeRow({ productId: 'rb-b', brand: 'Razer', base_model: 'Basilisk V3 Pro', variant: '' }),
  makeRow({ productId: 'lg-w', brand: 'Logitech', base_model: 'G Pro X Superlight 2', variant: 'White' }),
  makeRow({ productId: 'lg-b', brand: 'Logitech', base_model: 'G Pro X Superlight 2', variant: 'Black' }),
  makeRow({ productId: 'px-w', brand: 'Pulsar', base_model: 'X2V2', variant: 'White' }),
];

describe('deriveFilteredCatalog — no query', () => {
  it('returns all brands with family counts', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: '',
      singleModel: '',
      searchQuery: '',
    });
    strictEqual(result.brandList.length, 3);
    const razer = result.brandList.find((b) => b.value === 'Razer')!;
    strictEqual(razer.count, 4);
    const logitech = result.brandList.find((b) => b.value === 'Logitech')!;
    strictEqual(logitech.count, 2);
  });

  it('returns empty model list when no brand selected', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: '',
      singleModel: '',
      searchQuery: '',
    });
    deepStrictEqual(result.modelList, []);
    deepStrictEqual(result.variantList, []);
  });

  it('returns models scoped to selected brand', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: 'Razer',
      singleModel: '',
      searchQuery: '',
    });
    strictEqual(result.modelList.length, 2);
    const viper = result.modelList.find((m) => m.value === 'Viper V2 Pro')!;
    strictEqual(viper.count, 3);
    const basilisk = result.modelList.find((m) => m.value === 'Basilisk V3 Pro')!;
    strictEqual(basilisk.count, 1);
  });

  it('returns variants scoped to brand+model', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: 'Razer',
      singleModel: 'Viper V2 Pro',
      searchQuery: '',
    });
    strictEqual(result.variantList.length, 3);
    const labels = result.variantList.map((v) => v.label).sort();
    deepStrictEqual(labels, ['Black', 'Mercury', 'White']);
  });

  it('base-variant product gets (base / no variant) label', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: 'Razer',
      singleModel: 'Basilisk V3 Pro',
      searchQuery: '',
    });
    strictEqual(result.variantList.length, 1);
    strictEqual(result.variantList[0].label, '(base / no variant)');
    strictEqual(result.variantList[0].productId, 'rb-b');
  });

  it('totalMatches equals catalog size when no query', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: '',
      singleModel: '',
      searchQuery: '',
    });
    strictEqual(result.totalMatches, SAMPLE_CATALOG.length);
  });
});

describe('deriveFilteredCatalog — with query', () => {
  it('filters brand list to only matching brands', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: '',
      singleModel: '',
      searchQuery: 'razer',
    });
    strictEqual(result.brandList.length, 1);
    strictEqual(result.brandList[0].value, 'Razer');
  });

  it('brand matches carry highlight ranges', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: '',
      singleModel: '',
      searchQuery: 'pul',
    });
    strictEqual(result.brandList.length, 1);
    strictEqual(result.brandList[0].value, 'Pulsar');
    deepStrictEqual(result.brandList[0].matches[0], [0, 3]);
  });

  it('filters models to those matching query (within brand scope)', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: 'Razer',
      singleModel: '',
      searchQuery: 'viper',
    });
    strictEqual(result.modelList.length, 1);
    strictEqual(result.modelList[0].value, 'Viper V2 Pro');
  });

  it('filters variants to those matching query (within brand+model scope)', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: 'Razer',
      singleModel: 'Viper V2 Pro',
      searchQuery: 'white',
    });
    strictEqual(result.variantList.length, 1);
    strictEqual(result.variantList[0].label, 'White');
    strictEqual(result.variantList[0].productId, 'rv-w');
  });

  it('totalMatches counts catalog rows whose full label matches', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: '',
      singleModel: '',
      searchQuery: 'white',
    });
    // three products have "white" variant
    strictEqual(result.totalMatches, 3);
  });

  it('returns empty brand list when query matches nothing', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: '',
      singleModel: '',
      searchQuery: 'zzz-nope',
    });
    deepStrictEqual(result.brandList, []);
    strictEqual(result.totalMatches, 0);
  });

  it('handles multi-token query', () => {
    const result = deriveFilteredCatalog({
      catalogRows: SAMPLE_CATALOG,
      singleBrand: 'Razer',
      singleModel: 'Viper V2 Pro',
      searchQuery: 'black',
    });
    strictEqual(result.variantList.length, 1);
    strictEqual(result.variantList[0].label, 'Black');
  });

  it('preserves variant productId alignment when variant labels are duplicated across rows', () => {
    // edge case: hypothetical duplicate labels — consumed-flag alignment must keep both
    const catalog = [
      makeRow({ productId: 'r1', brand: 'Razer', base_model: 'X', variant: 'Dup' }),
      makeRow({ productId: 'r2', brand: 'Razer', base_model: 'X', variant: 'Dup' }),
    ];
    const result = deriveFilteredCatalog({
      catalogRows: catalog,
      singleBrand: 'Razer',
      singleModel: 'X',
      searchQuery: '',
    });
    strictEqual(result.variantList.length, 2);
    const ids = result.variantList.map((v) => v.productId).sort();
    deepStrictEqual(ids, ['r1', 'r2']);
  });
});

describe('deriveFilteredCatalog — ordering', () => {
  it('brand list sorted by score desc then text length asc', () => {
    const catalog = [
      makeRow({ productId: 'a', brand: 'Razer' }),
      makeRow({ productId: 'b', brand: 'RazerLong' }),
    ];
    const result = deriveFilteredCatalog({
      catalogRows: catalog,
      singleBrand: '',
      singleModel: '',
      searchQuery: 'razer',
    });
    // exact "razer" match tier — "Razer" (5 chars) outranks "RazerLong" (9 chars) by length tie-break
    strictEqual(result.brandList[0].value, 'Razer');
    ok(result.brandList[0].score >= result.brandList[1].score);
  });
});
