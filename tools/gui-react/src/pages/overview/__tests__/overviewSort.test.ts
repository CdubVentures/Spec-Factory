import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compareBySort, cycleLiveSort, defaultCompare } from '../overviewSort.ts';
import type { CatalogRow } from '../../../types/product.ts';

function makeRow(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    id: 1,
    productId: 'p1',
    brand: 'A',
    base_model: 'Model A',
    model: 'Model A',
    variant: 'v1',
    identifier: 'id-p1',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifVariants: [],
    skuVariants: [],
    rdfVariants: [],
    keyTierProgress: [],
    cefLastRunAt: '',
    pifLastRunAt: '',
    rdfLastRunAt: '',
    skuLastRunAt: '',
    kfLastRunAt: '',
    ...overrides,
  } as CatalogRow;
}

describe('defaultCompare', () => {
  it('orders by brand, then base_model, then variant', () => {
    const a = makeRow({ brand: 'A', base_model: 'X', variant: '1' });
    const b = makeRow({ brand: 'B', base_model: 'A', variant: '1' });
    assert.ok(defaultCompare(a, b) < 0);
  });

  it('falls through to base_model when brand ties', () => {
    const a = makeRow({ brand: 'A', base_model: 'X', variant: '1' });
    const b = makeRow({ brand: 'A', base_model: 'Y', variant: '1' });
    assert.ok(defaultCompare(a, b) < 0);
  });

  it('falls through to variant when brand and base_model tie', () => {
    const a = makeRow({ brand: 'A', base_model: 'X', variant: 'a' });
    const b = makeRow({ brand: 'A', base_model: 'X', variant: 'b' });
    assert.ok(defaultCompare(a, b) < 0);
  });
});

describe("compareBySort('live')", () => {
  it('rows with more running modules come first', () => {
    const a = makeRow({ productId: 'p1', brand: 'Z' });
    const b = makeRow({ productId: 'p2', brand: 'A' });
    const map = new Map<string, readonly string[]>([
      ['p1', ['cef', 'pif']],
      ['p2', ['cef']],
    ]);
    assert.ok(compareBySort(a, b, 'live', map) < 0); // a has more, sorts first
  });

  it('rows with no running modules are after rows that have any', () => {
    const a = makeRow({ productId: 'p1', brand: 'Z' });
    const b = makeRow({ productId: 'p2', brand: 'A' });
    const map = new Map<string, readonly string[]>([
      ['p1', ['cef']],
    ]);
    assert.ok(compareBySort(a, b, 'live', map) < 0); // a has 1, b has 0 → a first
  });

  it('ties on count fall through to defaultCompare', () => {
    const a = makeRow({ productId: 'p1', brand: 'B' });
    const b = makeRow({ productId: 'p2', brand: 'A' });
    const map = new Map<string, readonly string[]>([
      ['p1', ['cef']],
      ['p2', ['pif']],
    ]);
    // both have 1 running → defaultCompare → b (brand A) before a (brand B)
    assert.ok(compareBySort(a, b, 'live', map) > 0);
  });

  it('empty map → all rows tie on 0, fall through to defaultCompare', () => {
    const a = makeRow({ productId: 'p1', brand: 'B' });
    const b = makeRow({ productId: 'p2', brand: 'A' });
    const map = new Map<string, readonly string[]>();
    assert.ok(compareBySort(a, b, 'live', map) > 0);
  });
});

describe("compareBySort('live-grouped')", () => {
  it('groups rows with the same running-module signature together', () => {
    const a = makeRow({ productId: 'p1', brand: 'A' }); // cef,pif
    const b = makeRow({ productId: 'p2', brand: 'B' }); // cef
    const c = makeRow({ productId: 'p3', brand: 'C' }); // cef,pif
    const d = makeRow({ productId: 'p4', brand: 'D' }); // cef
    const map = new Map<string, readonly string[]>([
      ['p1', ['cef', 'pif']],
      ['p2', ['cef']],
      ['p3', ['cef', 'pif']],
      ['p4', ['cef']],
    ]);
    const sorted = [a, b, c, d].slice().sort((x, y) => compareBySort(x, y, 'live-grouped', map));
    // Two cef,pif rows must be adjacent and two cef rows must be adjacent.
    const sigs = sorted.map((r) => (map.get(r.productId) ?? []).join(','));
    assert.deepEqual(sigs, [sigs[0], sigs[0], sigs[2], sigs[2]]);
  });

  it('puts rows with no running modules after rows with any', () => {
    const a = makeRow({ productId: 'p1', brand: 'B' });
    const b = makeRow({ productId: 'p2', brand: 'A' });
    const map = new Map<string, readonly string[]>([
      ['p1', ['cef']],
    ]);
    assert.ok(compareBySort(a, b, 'live-grouped', map) < 0); // a (cef) before b (none)
  });

  it('within a group, falls through to defaultCompare', () => {
    const a = makeRow({ productId: 'p1', brand: 'B' });
    const b = makeRow({ productId: 'p2', brand: 'A' });
    const map = new Map<string, readonly string[]>([
      ['p1', ['cef']],
      ['p2', ['cef']],
    ]);
    // same signature → defaultCompare (brand A < brand B)
    assert.ok(compareBySort(a, b, 'live-grouped', map) > 0);
  });
});

describe('cycleLiveSort', () => {
  it('default → live', () => {
    assert.equal(cycleLiveSort('default'), 'live');
  });
  it('live → live-grouped', () => {
    assert.equal(cycleLiveSort('live'), 'live-grouped');
  });
  it('live-grouped → default', () => {
    assert.equal(cycleLiveSort('live-grouped'), 'default');
  });
  it('any non-live key → live (entry into the cycle)', () => {
    assert.equal(cycleLiveSort('confidence'), 'live');
    assert.equal(cycleLiveSort('coverage'), 'live');
    assert.equal(cycleLiveSort('fields'), 'live');
  });
});

describe('compareBySort other branches still work', () => {
  it("'fields' sorts by fieldsFilled desc", () => {
    const a = makeRow({ fieldsFilled: 5 });
    const b = makeRow({ fieldsFilled: 10 });
    assert.ok(compareBySort(a, b, 'fields', new Map()) > 0); // b first
  });

  it("'confidence' sorts by confidence desc", () => {
    const a = makeRow({ confidence: 0.4 });
    const b = makeRow({ confidence: 0.9 });
    assert.ok(compareBySort(a, b, 'confidence', new Map()) > 0);
  });

  it("'default' uses defaultCompare", () => {
    const a = makeRow({ brand: 'B' });
    const b = makeRow({ brand: 'A' });
    assert.ok(compareBySort(a, b, 'default', new Map()) > 0);
  });
});
