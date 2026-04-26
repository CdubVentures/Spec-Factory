import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeScoreCard, getScoreCard } from '../scoreCard.ts';
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
    status: 'active',
    confidence: 0.5,
    coverage: 0.8,
    fieldsFilled: 4,
    fieldsTotal: 10,
    cefRunCount: 1,
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
  };
}

describe('getScoreCard cache', () => {
  it('returns identical results to computeScoreCard for the same row', () => {
    const row = makeRow();
    const direct = computeScoreCard(row);
    const cached = getScoreCard(row);
    assert.deepEqual(cached, direct);
  });

  it('returns the same object reference on repeated calls with the same row', () => {
    const row = makeRow({ productId: 'p2' });
    const first = getScoreCard(row);
    const second = getScoreCard(row);
    assert.equal(first, second);
  });

  it('computes independently for distinct row references with identical data', () => {
    const a = makeRow({ productId: 'p3' });
    const b = makeRow({ productId: 'p3' });
    const ra = getScoreCard(a);
    const rb = getScoreCard(b);
    assert.deepEqual(ra, rb);
    assert.notEqual(ra, rb);
  });
});
