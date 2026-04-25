import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import {
  selectActiveProductsForType,
  formatActiveWarnMessage,
} from '../commandConsoleActiveCheck.ts';
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

describe('selectActiveProductsForType', () => {
  it('returns empty when activeMap is empty', () => {
    const products = [row('a'), row('b')];
    const result = selectActiveProductsForType('cef', products, new Map());
    deepStrictEqual(result.map(r => r.productId), []);
  });

  it('returns empty when no selected product matches the type', () => {
    const products = [row('a'), row('b')];
    const map = new Map<string, ReadonlySet<string>>([
      ['a', new Set(['pif'])],
      ['c', new Set(['cef'])],
    ]);
    const result = selectActiveProductsForType('cef', products, map);
    deepStrictEqual(result.map(r => r.productId), []);
  });

  it('returns the subset of selected products that have the type running', () => {
    const products = [row('a'), row('b'), row('c')];
    const map = new Map<string, ReadonlySet<string>>([
      ['a', new Set(['cef', 'pif'])],
      ['c', new Set(['cef'])],
    ]);
    const result = selectActiveProductsForType('cef', products, map);
    deepStrictEqual(result.map(r => r.productId).sort(), ['a', 'c']);
  });

  it('preserves the input ordering of products', () => {
    const products = [row('z'), row('a'), row('m')];
    const map = new Map<string, ReadonlySet<string>>([
      ['z', new Set(['kf'])],
      ['a', new Set(['kf'])],
      ['m', new Set(['kf'])],
    ]);
    const result = selectActiveProductsForType('kf', products, map);
    deepStrictEqual(result.map(r => r.productId), ['z', 'a', 'm']);
  });

  it('checks the SKU type via its internal "skf" identifier', () => {
    const products = [row('a')];
    const map = new Map<string, ReadonlySet<string>>([['a', new Set(['skf'])]]);
    const result = selectActiveProductsForType('skf', products, map);
    deepStrictEqual(result.map(r => r.productId), ['a']);
  });

  it('returns empty when given an empty product list', () => {
    const map = new Map<string, ReadonlySet<string>>([['a', new Set(['cef'])]]);
    const result = selectActiveProductsForType('cef', [], map);
    deepStrictEqual(result, []);
  });
});

describe('formatActiveWarnMessage', () => {
  it('formats the dialog copy with active count and total selected', () => {
    const message = formatActiveWarnMessage('CEF', 2, 5);
    strictEqual(
      message,
      '2 of 5 selected products already have a CEF op queued or running.\nContinue with dispatch?',
    );
  });

  it('uses the human-friendly label, not the internal type code', () => {
    const message = formatActiveWarnMessage('SKU', 1, 1);
    strictEqual(
      message,
      '1 of 1 selected products already have a SKU op queued or running.\nContinue with dispatch?',
    );
  });
});
