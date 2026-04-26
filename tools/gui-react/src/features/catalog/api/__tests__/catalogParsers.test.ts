import { describe, it } from 'node:test';
import { deepStrictEqual, throws } from 'node:assert';
import { parseCatalogRow, parseCatalogRows, parseCatalogProducts } from '../catalogParsers.ts';

describe('parseCatalogRows', () => {
  it('returns valid array input unchanged', () => {
    const input = [{ productId: 'a', brand: 'B' }];
    deepStrictEqual(parseCatalogRows(input), input);
  });

  it('returns empty array for empty array input', () => {
    deepStrictEqual(parseCatalogRows([]), []);
  });

  it('throws TypeError for null', () => {
    throws(() => parseCatalogRows(null), TypeError);
  });

  it('throws TypeError for undefined', () => {
    throws(() => parseCatalogRows(undefined), TypeError);
  });

  it('throws TypeError for object (non-array)', () => {
    throws(() => parseCatalogRows({ ok: true }), TypeError);
  });

  it('throws TypeError for string', () => {
    throws(() => parseCatalogRows('not an array'), TypeError);
  });

  it('throws TypeError for number', () => {
    throws(() => parseCatalogRows(42), TypeError);
  });
});

describe('parseCatalogRow', () => {
  it('returns valid object input unchanged', () => {
    const input = { productId: 'a', brand: 'B' };
    deepStrictEqual(parseCatalogRow(input), input);
  });

  it('throws TypeError for array input', () => {
    throws(() => parseCatalogRow([]), TypeError);
  });

  it('throws TypeError for null', () => {
    throws(() => parseCatalogRow(null), TypeError);
  });
});

describe('parseCatalogProducts', () => {
  it('returns valid array input unchanged', () => {
    const input = [{ productId: 'a' }];
    deepStrictEqual(parseCatalogProducts(input), input);
  });

  it('returns empty array for empty array input', () => {
    deepStrictEqual(parseCatalogProducts([]), []);
  });

  it('throws TypeError for null', () => {
    throws(() => parseCatalogProducts(null), TypeError);
  });

  it('throws TypeError for undefined', () => {
    throws(() => parseCatalogProducts(undefined), TypeError);
  });

  it('throws TypeError for object (non-array)', () => {
    throws(() => parseCatalogProducts({ error: 'not_found' }), TypeError);
  });
});
