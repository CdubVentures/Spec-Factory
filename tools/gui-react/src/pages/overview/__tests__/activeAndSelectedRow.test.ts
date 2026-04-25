import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { deriveActiveAndSelectedGroups } from '../activeAndSelectedRowDerivation.ts';
import type { CatalogRow } from '../../../types/product.ts';

function row(productId: string): CatalogRow {
  return {
    productId,
    id: 0,
    brand: '',
    model: '',
    base_model: '',
    variant: '',
    identifier: '',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifVariants: [],
    skuVariants: [],
    rdfVariants: [],
    keyTierProgress: [],
  } as unknown as CatalogRow;
}

describe('deriveActiveAndSelectedGroups', () => {
  const rows: readonly CatalogRow[] = [row('a'), row('b'), row('c'), row('d')];

  it('returns both groups empty when no actives and no selection', () => {
    const result = deriveActiveAndSelectedGroups(rows, new Set(), undefined);
    deepStrictEqual(result.active.map(r => r.productId), []);
    deepStrictEqual(result.selectedIdle.map(r => r.productId), []);
  });

  it('lists active products even when none are selected', () => {
    const result = deriveActiveAndSelectedGroups(rows, new Set(['a', 'c']), undefined);
    deepStrictEqual(result.active.map(r => r.productId).sort(), ['a', 'c']);
    deepStrictEqual(result.selectedIdle.map(r => r.productId), []);
  });

  it('lists selected-idle products when none are active', () => {
    const result = deriveActiveAndSelectedGroups(rows, new Set(), new Set(['b', 'd']));
    deepStrictEqual(result.active.map(r => r.productId), []);
    deepStrictEqual(result.selectedIdle.map(r => r.productId).sort(), ['b', 'd']);
  });

  it('hides a selected-and-active product from the selected-idle group', () => {
    const result = deriveActiveAndSelectedGroups(rows, new Set(['a', 'b']), new Set(['b', 'c']));
    deepStrictEqual(result.active.map(r => r.productId).sort(), ['a', 'b']);
    deepStrictEqual(result.selectedIdle.map(r => r.productId), ['c']);
  });

  it('migrates a product from active to selected-idle when its op terminates', () => {
    // Before terminal: A active and selected → in Active, hidden from Selected-idle
    const before = deriveActiveAndSelectedGroups(rows, new Set(['a']), new Set(['a', 'b']));
    deepStrictEqual(before.active.map(r => r.productId), ['a']);
    deepStrictEqual(before.selectedIdle.map(r => r.productId), ['b']);

    // After terminal: activeIds drops 'a' → A migrates into Selected-idle (still selected)
    const after = deriveActiveAndSelectedGroups(rows, new Set(), new Set(['a', 'b']));
    deepStrictEqual(after.active.map(r => r.productId), []);
    deepStrictEqual(after.selectedIdle.map(r => r.productId).sort(), ['a', 'b']);
  });

  it('skips ids that no longer have a matching CatalogRow', () => {
    const result = deriveActiveAndSelectedGroups(rows, new Set(['a', 'missing-1']), new Set(['missing-2', 'b']));
    deepStrictEqual(result.active.map(r => r.productId), ['a']);
    deepStrictEqual(result.selectedIdle.map(r => r.productId), ['b']);
  });

  it('treats undefined selectedIds the same as an empty Set', () => {
    const result = deriveActiveAndSelectedGroups(rows, new Set(['a']), undefined);
    strictEqual(result.selectedIdle.length, 0);
    deepStrictEqual(result.active.map(r => r.productId), ['a']);
  });
});
