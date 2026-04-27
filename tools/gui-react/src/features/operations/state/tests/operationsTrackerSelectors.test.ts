import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Operation } from '../operationsStore.ts';
import {
  EMPTY_OPERATIONS_MAP,
  resolveOperationIndexLabLinkIdentity,
  selectActiveOperationCount,
  selectOperationById,
  selectVisibleOperationsMap,
} from '../operationsTrackerSelectors.ts';
import type { CatalogRow } from '../../../../types/product.ts';

function makeOperation(overrides: Partial<Operation>): Operation {
  return {
    id: 'op-1',
    type: 'key-finder',
    category: 'mouse',
    productId: 'p1',
    productLabel: 'Mouse One',
    stages: ['Run'],
    currentStageIndex: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [],
    ...overrides,
  };
}

function makeCatalogRow(overrides: Partial<CatalogRow>): CatalogRow {
  return {
    productId: 'p1-black',
    id: 1,
    identifier: 'corsair-m65-black',
    brand: 'Corsair',
    model: 'M65 RGB Ultra Black',
    base_model: 'M65 RGB Ultra',
    variant: 'Black',
    status: 'active',
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
  };
}

describe('operations tracker selectors', () => {
  it('counts only queued and running operations as active', () => {
    const operations = new Map([
      ['queued', makeOperation({ id: 'queued', status: 'queued' })],
      ['running', makeOperation({ id: 'running', status: 'running' })],
      ['done', makeOperation({ id: 'done', status: 'done' })],
      ['error', makeOperation({ id: 'error', status: 'error' })],
      ['cancelled', makeOperation({ id: 'cancelled', status: 'cancelled' })],
    ]);

    assert.equal(selectActiveOperationCount(operations), 2);
  });

  it('returns a stable empty map while the tracker list is collapsed', () => {
    const operations = new Map([
      ['op-1', makeOperation({ id: 'op-1' })],
    ]);

    assert.equal(selectVisibleOperationsMap(operations, false), EMPTY_OPERATIONS_MAP);
    assert.equal(selectVisibleOperationsMap(new Map(operations), false), EMPTY_OPERATIONS_MAP);
  });

  it('returns the live operations map while the tracker list is expanded', () => {
    const operations = new Map([
      ['op-1', makeOperation({ id: 'op-1' })],
    ]);

    assert.equal(selectVisibleOperationsMap(operations, true), operations);
  });

  it('looks up detail operations independently of list visibility', () => {
    const selected = makeOperation({ id: 'selected' });
    const operations = new Map([['selected', selected]]);

    assert.equal(selectOperationById(operations, 'selected'), selected);
    assert.equal(selectOperationById(operations, 'missing'), null);
    assert.equal(selectOperationById(operations, null), null);
  });

  it('resolves active-operation Indexing links from the catalog variant row', () => {
    const op = makeOperation({
      productId: 'p1-white',
      productLabel: 'Corsair M65 RGB Ultra',
      type: 'kf',
    });
    const catalogRows = [
      makeCatalogRow({ productId: 'p1-black', brand: 'Corsair', base_model: 'M65 RGB Ultra', variant: 'Black' }),
      makeCatalogRow({ productId: 'p1-white', brand: 'Corsair', base_model: 'M65 RGB Ultra', variant: 'White' }),
    ];

    assert.deepEqual(resolveOperationIndexLabLinkIdentity(op, catalogRows), {
      productId: 'p1-white',
      brand: 'Corsair',
      baseModel: 'M65 RGB Ultra',
    });
  });

  it('prefers operation-carried Indexing link identity over catalog rows', () => {
    const op = makeOperation({
      productId: 'p1-white',
      productLabel: 'Corsair M65 RGB Ultra',
      type: 'kf',
      indexLabLinkIdentity: {
        productId: 'p1-white',
        brand: 'Corsair',
        baseModel: 'M65 RGB Ultra',
      },
    });
    const catalogRows = [
      makeCatalogRow({ productId: 'p1-white', brand: 'Wrong Brand', base_model: 'Wrong Model' }),
    ];

    assert.deepEqual(resolveOperationIndexLabLinkIdentity(op, catalogRows), {
      productId: 'p1-white',
      brand: 'Corsair',
      baseModel: 'M65 RGB Ultra',
    });
  });

  it('falls back to operation identity while the catalog row is still loading', () => {
    const op = makeOperation({
      productId: 'p1-white',
      productLabel: 'Corsair M65 RGB Ultra',
      type: 'kf',
    });

    assert.deepEqual(resolveOperationIndexLabLinkIdentity(op), {
      productId: 'p1-white',
      brand: '',
      baseModel: '',
    });
  });
});
