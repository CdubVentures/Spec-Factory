import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getOverviewColumnFirstSortDesc,
  OVERVIEW_SORTABLE_COLUMN_IDS,
  sortOverviewRows,
  toggleOverviewSortStack,
} from '../overviewSort.ts';
import type { CatalogRow } from '../../../types/product.ts';
import type {
  KeyTierProgressGen,
  PifVariantProgressGen,
  ScalarVariantProgressGen,
} from '../../../types/product.generated.ts';

function pifVariant(overrides: Partial<PifVariantProgressGen> = {}): PifVariantProgressGen {
  return {
    variant_id: 'pif-v1',
    variant_key: 'black',
    variant_label: 'Black',
    color_atoms: ['black'],
    priority_filled: 0,
    priority_total: 0,
    loop_filled: 0,
    loop_total: 0,
    hero_filled: 0,
    hero_target: 0,
    image_count: 0,
    ...overrides,
  };
}

function scalarVariant(overrides: Partial<ScalarVariantProgressGen> = {}): ScalarVariantProgressGen {
  return {
    variant_id: 'scalar-v1',
    variant_key: 'black',
    variant_label: 'Black',
    color_atoms: ['black'],
    value: '',
    confidence: 0,
    ...overrides,
  };
}

function keyTier(overrides: Partial<KeyTierProgressGen> = {}): KeyTierProgressGen {
  return {
    tier: 'easy',
    total: 0,
    resolved: 0,
    perfect: 0,
    ...overrides,
  };
}

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

describe('toggleOverviewSortStack', () => {
  it('cycles a column through first direction, reverse, then off', () => {
    const first = toggleOverviewSortStack([], 'brand');
    assert.deepEqual(first, [{ id: 'brand', desc: false }]);

    const second = toggleOverviewSortStack(first, 'brand');
    assert.deepEqual(second, [{ id: 'brand', desc: true }]);

    const third = toggleOverviewSortStack(second, 'brand');
    assert.deepEqual(third, []);
  });

  it('adds each newly clicked column to the front as the primary sort key', () => {
    const stack = ['brand', 'pifVariants', 'live', 'lastRun'].reduce(
      (current, columnId) => toggleOverviewSortStack(current, columnId),
      [],
    );

    assert.deepEqual(stack, [
      { id: 'lastRun', desc: true },
      { id: 'live', desc: true },
      { id: 'pifVariants', desc: true },
      { id: 'brand', desc: false },
    ]);
  });

  it('promotes an existing secondary column when it is clicked again', () => {
    const stack = [
      { id: 'live', desc: true },
      { id: 'pifVariants', desc: true },
      { id: 'brand', desc: false },
    ];

    assert.deepEqual(toggleOverviewSortStack(stack, 'brand'), [
      { id: 'brand', desc: true },
      { id: 'live', desc: true },
      { id: 'pifVariants', desc: true },
    ]);
  });

  it('ignores columns outside the Overview catalog sort contract', () => {
    const stack = [{ id: 'brand', desc: false }];
    assert.deepEqual(toggleOverviewSortStack(stack, 'select'), stack);
    assert.deepEqual(toggleOverviewSortStack(stack, 'gap'), stack);
  });
});

describe('sortOverviewRows', () => {
  it('uses the most recently clicked column as primary and older clicks as tiebreakers', () => {
    const rows = [
      makeRow({ productId: 'low-a', brand: 'A', pifVariants: [pifVariant({ variant_id: 'low-1' })] }),
      makeRow({
        productId: 'high-b',
        brand: 'B',
        pifVariants: [
          pifVariant({ variant_id: 'high-b-1' }),
          pifVariant({ variant_id: 'high-b-2' }),
        ],
      }),
      makeRow({
        productId: 'high-a',
        brand: 'A',
        pifVariants: [
          pifVariant({ variant_id: 'high-a-1' }),
          pifVariant({ variant_id: 'high-a-2' }),
        ],
      }),
    ];

    const stack = ['brand', 'pifVariants'].reduce(
      (current, columnId) => toggleOverviewSortStack(current, columnId),
      [],
    );

    assert.deepEqual(
      sortOverviewRows(rows, stack, new Map()).map((row) => row.productId),
      ['high-a', 'high-b', 'low-a'],
    );
  });

  it('sorts PIF, RDF, and SKU by variant count rather than completion or confidence', () => {
    const oneComplete = makeRow({
      productId: 'one-complete',
      pifVariants: [pifVariant({ priority_filled: 10, priority_total: 10 })],
      rdfVariants: [scalarVariant({ value: '2026-01-01', confidence: 1 })],
      skuVariants: [scalarVariant({ value: 'SKU-1', confidence: 1 })],
    });
    const twoEmpty = makeRow({
      productId: 'two-empty',
      pifVariants: [pifVariant({ variant_id: 'p1' }), pifVariant({ variant_id: 'p2' })],
      rdfVariants: [scalarVariant({ variant_id: 'r1' }), scalarVariant({ variant_id: 'r2' })],
      skuVariants: [scalarVariant({ variant_id: 's1' }), scalarVariant({ variant_id: 's2' })],
    });

    for (const columnId of ['pifVariants', 'rdfVariants', 'skuVariants']) {
      assert.deepEqual(
        sortOverviewRows([oneComplete, twoEmpty], [{ id: columnId, desc: true }], new Map()).map((row) => row.productId),
        ['two-empty', 'one-complete'],
      );
    }
  });

  it('sorts Keys by the sum of resolved keys', () => {
    const lowRatioMoreResolved = makeRow({
      productId: 'more-resolved',
      keyTierProgress: [keyTier({ total: 100, resolved: 20 })],
    });
    const highRatioFewerResolved = makeRow({
      productId: 'fewer-resolved',
      keyTierProgress: [keyTier({ total: 2, resolved: 2 })],
    });

    assert.deepEqual(
      sortOverviewRows(
        [highRatioFewerResolved, lowRatioMoreResolved],
        [{ id: 'key', desc: true }],
        new Map(),
      ).map((row) => row.productId),
      ['more-resolved', 'fewer-resolved'],
    );
  });

  it('sorts Last Run by newest worker timestamp', () => {
    const oldRun = makeRow({
      productId: 'old',
      cefLastRunAt: '2026-04-20T10:00:00Z',
    });
    const newerRun = makeRow({
      productId: 'newer',
      pifLastRunAt: '2026-04-25T10:00:00Z',
    });
    const newestRunAcrossWorkers = makeRow({
      productId: 'newest',
      rdfLastRunAt: '2026-04-21T10:00:00Z',
      skuLastRunAt: '2026-04-26T10:00:00Z',
    });

    assert.deepEqual(
      sortOverviewRows(
        [oldRun, newestRunAcrossWorkers, newerRun],
        [{ id: 'lastRun', desc: true }],
        new Map(),
      ).map((row) => row.productId),
      ['newest', 'newer', 'old'],
    );
  });

  it('preserves incoming order when the sort stack is empty', () => {
    const rows = [
      makeRow({ productId: 'third', brand: 'C' }),
      makeRow({ productId: 'first', brand: 'A' }),
      makeRow({ productId: 'second', brand: 'B' }),
    ];

    assert.deepEqual(
      sortOverviewRows(rows, [], new Map()).map((row) => row.productId),
      ['third', 'first', 'second'],
    );
  });

  it('sorts the Live column by running feature count first, then feature signature', () => {
    const rows = [
      makeRow({ productId: 'idle' }),
      makeRow({ productId: 'pif-only' }),
      makeRow({ productId: 'cef-pif' }),
      makeRow({ productId: 'cef-only' }),
    ];
    const running = new Map<string, readonly string[]>([
      ['pif-only', ['pif']],
      ['cef-pif', ['cef', 'pif']],
      ['cef-only', ['cef']],
    ]);

    assert.deepEqual(
      sortOverviewRows(rows, [{ id: 'live', desc: true }], running).map((row) => row.productId),
      ['cef-pif', 'pif-only', 'cef-only', 'idle'],
    );
  });

  const requestedColumns = [
    'brand',
    'base_model',
    'cefRunCount',
    'pifVariants',
    'rdfVariants',
    'skuVariants',
    'key',
    'scoreCard',
    'coverage',
    'confidence',
    'fieldsFilled',
    'live',
    'lastRun',
  ] as const;

  it('declares every requested Overview catalog column sortable', () => {
    for (const columnId of requestedColumns) {
      assert.ok(OVERVIEW_SORTABLE_COLUMN_IDS.includes(columnId), `${columnId} should be sortable`);
    }
  });

  const low = makeRow({
    productId: 'low',
    brand: 'Alpha',
    base_model: 'Alpha Model',
    variant: 'Alpha Variant',
    cefRunCount: 0,
    pifVariants: [pifVariant({ variant_id: 'low-p1' })],
    rdfVariants: [scalarVariant({ variant_id: 'low-r1' })],
    skuVariants: [scalarVariant({ variant_id: 'low-s1' })],
    keyTierProgress: [keyTier({ total: 10, resolved: 1, perfect: 0 })],
    coverage: 0.1,
    confidence: 0.2,
    fieldsFilled: 1,
    fieldsTotal: 10,
    cefLastRunAt: '2026-04-20T10:00:00Z',
  });
  const high = makeRow({
    productId: 'high',
    brand: 'Zulu',
    base_model: 'Zulu Model',
    variant: 'Zulu Variant',
    cefRunCount: 2,
    pifVariants: [pifVariant({ variant_id: 'high-p1' }), pifVariant({ variant_id: 'high-p2' })],
    rdfVariants: [scalarVariant({ variant_id: 'high-r1' }), scalarVariant({ variant_id: 'high-r2' })],
    skuVariants: [scalarVariant({ variant_id: 'high-s1' }), scalarVariant({ variant_id: 'high-s2' })],
    keyTierProgress: [keyTier({ total: 10, resolved: 8, perfect: 5 })],
    coverage: 0.9,
    confidence: 0.8,
    fieldsFilled: 8,
    fieldsTotal: 10,
    kfLastRunAt: '2026-04-26T10:00:00Z',
  });

  for (const columnId of OVERVIEW_SORTABLE_COLUMN_IDS) {
    it(`applies first-click direction for ${columnId}`, () => {
      const running = new Map<string, readonly string[]>([
        ['low', []],
        ['high', ['cef', 'pif']],
      ]);
      const firstDesc = getOverviewColumnFirstSortDesc(columnId);
      const expectedFirst = firstDesc || columnId === 'live' ? 'high' : 'low';

      assert.deepEqual(
        sortOverviewRows([low, high], [{ id: columnId, desc: firstDesc }], running).map((row) => row.productId),
        [expectedFirst, expectedFirst === 'high' ? 'low' : 'high'],
      );
    });
  }
});
