import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { derivePickerKpis } from '../pickerKpiDerivation.ts';
import type { CatalogRow } from '../../../../types/product.ts';

function makeRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: 'razer-viper-v2-pro-white',
    id: 1,
    identifier: 'rvv2pw',
    brand: 'Razer',
    model: 'Viper V2 Pro',
    base_model: 'Viper V2 Pro',
    variant: 'White',
    status: 'active',
    confidence: 0.87,
    coverage: 0.73,
    fieldsFilled: 38,
    fieldsTotal: 52,
    cefRunCount: 0,
    pifVariants: [],
    skuVariants: [],
    rdfVariants: [],
    ...overrides,
  };
}

describe('derivePickerKpis', () => {
  it('returns empty array when row is null', () => {
    deepStrictEqual(derivePickerKpis(null), []);
  });

  it('returns three tiles in fixed order', () => {
    const tiles = derivePickerKpis(makeRow());
    strictEqual(tiles.length, 3);
    deepStrictEqual(tiles.map((t) => t.key), ['confidence', 'coverage', 'fields']);
  });

  it('confidence tile reflects passing value', () => {
    const tiles = derivePickerKpis(makeRow({ confidence: 0.87 }));
    const tile = tiles.find((t) => t.key === 'confidence')!;
    strictEqual(tile.value, '0.87');
    strictEqual(tile.barTone, 'good');
    strictEqual(tile.barPct, 87);
  });

  it('confidence tile flags warn tier at 0.60-0.79', () => {
    const tiles = derivePickerKpis(makeRow({ confidence: 0.65 }));
    strictEqual(tiles.find((t) => t.key === 'confidence')!.barTone, 'warn');
  });

  it('confidence tile flags weak tier below 0.60', () => {
    const tiles = derivePickerKpis(makeRow({ confidence: 0.3 }));
    strictEqual(tiles.find((t) => t.key === 'confidence')!.barTone, 'weak');
  });

  it('coverage tile renders percentage with unit', () => {
    const tiles = derivePickerKpis(makeRow({ coverage: 0.73 }));
    const tile = tiles.find((t) => t.key === 'coverage')!;
    strictEqual(tile.value, '73');
    strictEqual(tile.unit, '%');
    strictEqual(tile.barPct, 73);
  });

  it('fields tile exposes filled / total and empty count', () => {
    const tiles = derivePickerKpis(makeRow({ fieldsFilled: 38, fieldsTotal: 52 }));
    const tile = tiles.find((t) => t.key === 'fields')!;
    strictEqual(tile.value, '38');
    strictEqual(tile.unit, '/ 52');
    strictEqual(tile.sub, '14 empty');
  });

  it('fields tile copes with zero total', () => {
    const tiles = derivePickerKpis(makeRow({ fieldsFilled: 0, fieldsTotal: 0 }));
    const tile = tiles.find((t) => t.key === 'fields')!;
    strictEqual(tile.unit, undefined);
    strictEqual(tile.barPct, 0);
    strictEqual(tile.barTone, 'neutral');
  });

  it('clamps bar percentages to [0, 100]', () => {
    const tiles = derivePickerKpis(makeRow({ confidence: 1.5, coverage: -0.2 }));
    strictEqual(tiles.find((t) => t.key === 'confidence')!.barPct, 100);
    strictEqual(tiles.find((t) => t.key === 'coverage')!.barPct, 0);
  });
});
