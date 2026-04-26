import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPublishedReviewFieldFromCaches,
  deleteReviewFieldRowFromCaches,
  removeAllReviewCandidatesFromCaches,
  removeReviewCandidateFromCaches,
  restoreReviewFieldValueCaches,
  restoreReviewFieldRowCaches,
  restoreReviewCandidateCaches,
  updateReviewFieldValueInCaches,
  unpublishReviewFieldRowFromCaches,
} from '../reviewCandidateCache.ts';
import type { CandidateResponse, ProductsIndexResponse, ReviewCandidate } from '../../../../types/review.ts';

function candidate(overrides: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    candidate_id: 'c1',
    value: '58',
    score: 0.95,
    source_id: 'sid-1',
    source: 'Source 1',
    tier: 1,
    method: 'dom',
    evidence: {
      url: 'https://example.test',
      retrieved_at: '2026-01-01T00:00:00.000Z',
      snippet_id: 's1',
      snippet_hash: 'h1',
      quote: '58g',
      quote_span: null,
      snippet_text: '58g',
      source_id: 'sid-1',
    },
    ...overrides,
  };
}

function candidateResponse(candidates: ReviewCandidate[]): CandidateResponse {
  return {
    product_id: 'p1',
    field: 'weight',
    candidates,
    candidate_count: candidates.length,
  };
}

function productsIndex(candidates: ReviewCandidate[]): ProductsIndexResponse {
  return {
    products: [
      {
        product_id: 'p1',
        category: 'mouse',
        identity: {
          id: 1,
          identifier: 'id-1',
          brand: 'Acme',
          model: 'Mouse One',
          variant: '',
        },
        fields: {
          weight: {
            selected: {
              value: '58',
              confidence: 0.95,
              status: 'ok',
              color: 'green',
            },
            candidate_count: candidates.length,
            candidates,
            selected_candidate_id: 'c1',
          },
          dpi: {
            selected: {
              value: '26000',
              confidence: 0.9,
              status: 'ok',
              color: 'green',
            },
            candidate_count: 1,
            candidates: [candidate({ candidate_id: 'dpi-1', source_id: 'dpi-source' })],
          },
        },
        metrics: {
          confidence: 0.95,
          coverage: 0.5,
          missing: 1,
          has_run: true,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      },
    ],
    brands: ['Acme'],
    total: 1,
  };
}

function rowActionProductsIndex(candidates: ReviewCandidate[]): ProductsIndexResponse {
  const base = productsIndex(candidates);
  return {
    ...base,
    products: [
      base.products[0],
      {
        ...base.products[0],
        product_id: 'p2',
        identity: {
          id: 2,
          identifier: 'id-2',
          brand: 'Bravo',
          model: 'Mouse Two',
          variant: '',
        },
        fields: {
          weight: {
            ...base.products[0].fields.weight,
            selected: {
              value: '60',
              confidence: 0.91,
              status: 'ok',
              color: 'green',
            },
            source: 'keyFinder',
            method: 'dom',
            tier: 1,
            evidence_url: 'https://example.test/two',
            evidence_quote: '60g',
            accepted_candidate_id: 'p2-weight-1',
            selected_candidate_id: 'p2-weight-1',
          },
        },
        metrics: {
          confidence: 0.91,
          coverage: 0.5,
          missing: 1,
          has_run: true,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      },
    ],
    brands: ['Acme', 'Bravo'],
    total: 2,
  };
}

function createQueryClientHarness(entries: Array<[readonly unknown[], unknown]>) {
  const data = new Map(entries.map(([key, value]) => [JSON.stringify(key), value]));
  const calls: Array<readonly [string, unknown]> = [];
  return {
    queryClient: {
      getQueryData(queryKey: readonly unknown[]) {
        calls.push(['getQueryData', queryKey]);
        return data.get(JSON.stringify(queryKey));
      },
      setQueryData(queryKey: readonly unknown[], valueOrUpdater: unknown) {
        calls.push(['setQueryData', queryKey]);
        const key = JSON.stringify(queryKey);
        const current = data.get(key);
        const next = typeof valueOrUpdater === 'function'
          ? (valueOrUpdater as (value: unknown) => unknown)(current)
          : valueOrUpdater;
        data.set(key, next);
      },
      removeQueries(args: { queryKey: readonly unknown[] }) {
        calls.push(['removeQueries', args.queryKey]);
        data.delete(JSON.stringify(args.queryKey));
      },
    },
    get(queryKey: readonly unknown[]) {
      return data.get(JSON.stringify(queryKey));
    },
    calls,
  };
}

test('removeReviewCandidateFromCaches removes only candidates with the matching source id', () => {
  const candidates = [
    candidate({ candidate_id: 'c1', source_id: 'sid-1' }),
    candidate({ candidate_id: 'c2', source_id: 'sid-2' }),
    candidate({ candidate_id: 'c3', source_id: 'sid-1' }),
  ];
  const harness = createQueryClientHarness([
    [['candidates', 'mouse', 'p1', 'weight'], candidateResponse(candidates)],
    [['reviewProductsIndex', 'mouse'], productsIndex(candidates)],
  ]);

  const snapshot = removeReviewCandidateFromCaches(
    harness.queryClient as never,
    {
      category: 'mouse',
      productId: 'p1',
      field: 'weight',
      sourceId: 'sid-1',
    },
  );

  const candidateData = harness.get(['candidates', 'mouse', 'p1', 'weight']) as CandidateResponse;
  assert.deepEqual(candidateData.candidates.map((row) => row.candidate_id), ['c2']);
  assert.equal(candidateData.candidate_count, 1);

  const indexData = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.deepEqual(indexData.products[0].fields.weight.candidates.map((row) => row.candidate_id), ['c2']);
  assert.equal(indexData.products[0].fields.weight.candidate_count, 1);
  assert.equal(indexData.products[0].fields.dpi.candidate_count, 1);

  restoreReviewCandidateCaches(harness.queryClient as never, 'mouse', 'p1', 'weight', snapshot);

  const restoredCandidateData = harness.get(['candidates', 'mouse', 'p1', 'weight']) as CandidateResponse;
  assert.deepEqual(restoredCandidateData.candidates.map((row) => row.candidate_id), ['c1', 'c2', 'c3']);
  assert.equal(
    (harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse)
      .products[0]
      .fields.weight.candidate_count,
    3,
  );
});

test('removeAllReviewCandidatesFromCaches clears the active field candidates only', () => {
  const candidates = [
    candidate({ candidate_id: 'c1', source_id: 'sid-1' }),
    candidate({ candidate_id: 'c2', source_id: 'sid-2' }),
  ];
  const harness = createQueryClientHarness([
    [['candidates', 'mouse', 'p1', 'weight'], candidateResponse(candidates)],
    [['reviewProductsIndex', 'mouse'], productsIndex(candidates)],
  ]);

  removeAllReviewCandidatesFromCaches(
    harness.queryClient as never,
    {
      category: 'mouse',
      productId: 'p1',
      field: 'weight',
    },
  );

  const candidateData = harness.get(['candidates', 'mouse', 'p1', 'weight']) as CandidateResponse;
  assert.deepEqual(candidateData.candidates, []);
  assert.equal(candidateData.candidate_count, 0);

  const indexData = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.deepEqual(indexData.products[0].fields.weight.candidates, []);
  assert.equal(indexData.products[0].fields.weight.candidate_count, 0);
  assert.equal(indexData.products[0].fields.dpi.candidate_count, 1);
});

test('removeReviewCandidateFromCaches decrements candidate count when grid candidates are not loaded', () => {
  const indexData = productsIndex([]);
  indexData.products[0].fields.weight = {
    ...indexData.products[0].fields.weight,
    candidate_count: 3,
    candidates: [],
  };
  const harness = createQueryClientHarness([
    [['reviewProductsIndex', 'mouse'], indexData],
  ]);

  removeReviewCandidateFromCaches(
    harness.queryClient as never,
    {
      category: 'mouse',
      productId: 'p1',
      field: 'weight',
      sourceId: 'sid-1',
    },
  );

  const patched = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.equal(patched.products[0].fields.weight.candidate_count, 2);
});

test('unpublishReviewFieldRowFromCaches clears selected state for the field across products', () => {
  const candidates = [
    candidate({ candidate_id: 'c1', source_id: 'sid-1' }),
    candidate({ candidate_id: 'c2', source_id: 'sid-2' }),
  ];
  const indexData = rowActionProductsIndex(candidates);
  const harness = createQueryClientHarness([
    [['reviewProductsIndex', 'mouse'], indexData],
    [['candidates', 'mouse', 'p1', 'weight'], candidateResponse(candidates)],
    [['candidates', 'mouse', 'p2', 'weight'], {
      product_id: 'p2',
      field: 'weight',
      candidates: [candidate({ candidate_id: 'p2-weight-1', source_id: 'p2-source' })],
      candidate_count: 1,
    } satisfies CandidateResponse],
    [['candidates', 'mouse', 'p1', 'dpi'], candidateResponse([
      candidate({ candidate_id: 'dpi-1', source_id: 'dpi-source' }),
    ])],
  ]);

  unpublishReviewFieldRowFromCaches(
    harness.queryClient as never,
    { category: 'mouse', field: 'weight' },
  );

  const patched = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  const weightFields = patched.products.map((product) => product.fields.weight);
  assert.deepEqual(
    weightFields.map((field) => field.selected),
    [
      { value: null, confidence: 0, status: 'ok', color: 'gray' },
      { value: null, confidence: 0, status: 'ok', color: 'gray' },
    ],
  );
  assert.deepEqual(weightFields.map((field) => field.candidate_count), [2, 2]);
  assert.equal(weightFields[0].source, undefined);
  assert.equal(weightFields[1].accepted_candidate_id, undefined);

  const p1Candidates = harness.get(['candidates', 'mouse', 'p1', 'weight']) as CandidateResponse;
  assert.equal(p1Candidates.candidate_count, 2);
  assert.deepEqual(patched.products[0].fields.dpi.selected.value, '26000');
  assert.deepEqual(
    (harness.get(['candidates', 'mouse', 'p1', 'dpi']) as CandidateResponse).candidates.map((row) => row.candidate_id),
    ['dpi-1'],
  );
});

test('deleteReviewFieldRowFromCaches removes field entries and clears loaded candidate caches', () => {
  const candidates = [
    candidate({ candidate_id: 'c1', source_id: 'sid-1' }),
    candidate({ candidate_id: 'c2', source_id: 'sid-2' }),
  ];
  const harness = createQueryClientHarness([
    [['reviewProductsIndex', 'mouse'], rowActionProductsIndex(candidates)],
    [['candidates', 'mouse', 'p1', 'weight'], candidateResponse(candidates)],
    [['candidates', 'mouse', 'p2', 'weight'], {
      product_id: 'p2',
      field: 'weight',
      candidates: [candidate({ candidate_id: 'p2-weight-1', source_id: 'p2-source' })],
      candidate_count: 1,
    } satisfies CandidateResponse],
    [['candidates', 'mouse', 'p1', 'dpi'], candidateResponse([
      candidate({ candidate_id: 'dpi-1', source_id: 'dpi-source' }),
    ])],
  ]);

  deleteReviewFieldRowFromCaches(
    harness.queryClient as never,
    { category: 'mouse', field: 'weight' },
  );

  const patched = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.equal(patched.products[0].fields.weight, undefined);
  assert.equal(patched.products[1].fields.weight, undefined);
  assert.equal(patched.products[0].fields.dpi.candidate_count, 1);

  assert.deepEqual(
    harness.get(['candidates', 'mouse', 'p1', 'weight']),
    {
      product_id: 'p1',
      field: 'weight',
      candidates: [],
      candidate_count: 0,
    },
  );
  assert.deepEqual(
    harness.get(['candidates', 'mouse', 'p2', 'weight']),
    {
      product_id: 'p2',
      field: 'weight',
      candidates: [],
      candidate_count: 0,
    },
  );
  assert.deepEqual(
    (harness.get(['candidates', 'mouse', 'p1', 'dpi']) as CandidateResponse).candidates.map((row) => row.candidate_id),
    ['dpi-1'],
  );
});

test('restoreReviewFieldRowCaches restores products index and exact candidate caches', () => {
  const candidates = [
    candidate({ candidate_id: 'c1', source_id: 'sid-1' }),
    candidate({ candidate_id: 'c2', source_id: 'sid-2' }),
  ];
  const harness = createQueryClientHarness([
    [['reviewProductsIndex', 'mouse'], rowActionProductsIndex(candidates)],
    [['candidates', 'mouse', 'p1', 'weight'], candidateResponse(candidates)],
    [['candidates', 'mouse', 'p2', 'weight'], {
      product_id: 'p2',
      field: 'weight',
      candidates: [candidate({ candidate_id: 'p2-weight-1', source_id: 'p2-source' })],
      candidate_count: 1,
    } satisfies CandidateResponse],
  ]);

  const snapshot = deleteReviewFieldRowFromCaches(
    harness.queryClient as never,
    { category: 'mouse', field: 'weight' },
  );

  restoreReviewFieldRowCaches(harness.queryClient as never, snapshot);

  const restored = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.equal(restored.products[0].fields.weight.selected.value, '58');
  assert.equal(restored.products[1].fields.weight.selected.value, '60');
  assert.deepEqual(
    (harness.get(['candidates', 'mouse', 'p1', 'weight']) as CandidateResponse).candidates.map((row) => row.candidate_id),
    ['c1', 'c2'],
  );
  assert.deepEqual(
    (harness.get(['candidates', 'mouse', 'p2', 'weight']) as CandidateResponse).candidates.map((row) => row.candidate_id),
    ['p2-weight-1'],
  );
});

test('updateReviewFieldValueInCaches patches one scalar field and restores it on rollback', () => {
  const candidates = [
    candidate({ candidate_id: 'c1', source_id: 'sid-1' }),
    candidate({ candidate_id: 'c2', source_id: 'sid-2' }),
  ];
  const harness = createQueryClientHarness([
    [['reviewProductsIndex', 'mouse'], rowActionProductsIndex(candidates)],
  ]);

  const snapshot = updateReviewFieldValueInCaches(
    harness.queryClient as never,
    {
      category: 'mouse',
      productId: 'p1',
      field: 'weight',
      value: '61',
      timestamp: '2026-01-02T00:00:00.000Z',
      sourceMeta: {
        source: 'user',
        method: 'manual_override',
        acceptedCandidateId: null,
      },
    },
  );

  const patched = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.deepEqual(patched.products[0].fields.weight.selected, {
    value: '61',
    confidence: 1,
    status: 'ok',
    color: 'green',
  });
  assert.equal(patched.products[0].fields.weight.overridden, true);
  assert.equal(patched.products[0].fields.weight.source, 'user');
  assert.equal(patched.products[0].fields.weight.method, 'manual_override');
  assert.equal(patched.products[0].fields.weight.accepted_candidate_id, null);
  assert.equal(patched.products[0].fields.weight.source_timestamp, '2026-01-02T00:00:00.000Z');
  assert.equal(patched.products[1].fields.weight.selected.value, '60');

  restoreReviewFieldValueCaches(harness.queryClient as never, snapshot);

  const restored = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.equal(restored.products[0].fields.weight.selected.value, '58');
  assert.equal(restored.products[0].fields.weight.overridden, undefined);
});

test('clearPublishedReviewFieldFromCaches clears one scalar field and preserves candidates', () => {
  const candidates = [
    candidate({ candidate_id: 'c1', source_id: 'sid-1' }),
    candidate({ candidate_id: 'c2', source_id: 'sid-2' }),
  ];
  const harness = createQueryClientHarness([
    [['reviewProductsIndex', 'mouse'], rowActionProductsIndex(candidates)],
  ]);

  clearPublishedReviewFieldFromCaches(
    harness.queryClient as never,
    { category: 'mouse', productId: 'p1', field: 'weight' },
  );

  const patched = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.deepEqual(patched.products[0].fields.weight.selected, {
    value: null,
    confidence: 0,
    status: 'ok',
    color: 'gray',
  });
  assert.equal(patched.products[0].fields.weight.candidate_count, 2);
  assert.deepEqual(patched.products[0].fields.weight.candidates.map((row) => row.candidate_id), ['c1', 'c2']);
  assert.equal(patched.products[0].fields.weight.source, undefined);
  assert.equal(patched.products[0].fields.weight.evidence_url, undefined);
  assert.equal(patched.products[1].fields.weight.selected.value, '60');
});
