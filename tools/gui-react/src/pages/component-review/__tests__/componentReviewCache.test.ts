import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildComponentReviewGridLinkedProducts,
  clearLinkedReviewProductFields,
  patchComponentReviewDocumentAction,
  restoreComponentReviewDocument,
  restoreLinkedReviewProductFields,
  resolveComponentReviewGridField,
  updateLinkedReviewProductFields,
} from '../componentReviewCache.ts';
import type { ComponentReviewDocument } from '../../../types/componentReview.ts';
import type { ProductsIndexResponse } from '../../../types/review.ts';

function productsIndex(): ProductsIndexResponse {
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
          sensor: {
            selected: {
              value: 'PixArt 3395',
              confidence: 0.9,
              status: 'ok',
              color: 'green',
            },
            candidate_count: 1,
            candidates: [],
            source: 'pipeline',
          },
          lighting: {
            selected: {
              value: 'RGB',
              confidence: 0.8,
              status: 'ok',
              color: 'green',
            },
            candidate_count: 1,
            candidates: [],
            source: 'pipeline',
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
      {
        product_id: 'p2',
        category: 'mouse',
        identity: {
          id: 2,
          identifier: 'id-2',
          brand: 'Acme',
          model: 'Mouse Two',
          variant: '',
        },
        fields: {
          sensor: {
            selected: {
              value: 'PixArt 3370',
              confidence: 0.7,
              status: 'ok',
              color: 'yellow',
            },
            candidate_count: 1,
            candidates: [],
            source: 'pipeline',
          },
        },
        metrics: {
          confidence: 0.75,
          coverage: 0.4,
          missing: 2,
          has_run: true,
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      },
    ],
    brands: ['Acme'],
    total: 2,
  };
}

function componentReviewDocument(): ComponentReviewDocument {
  return {
    version: 1,
    category: 'mouse',
    updated_at: '2026-01-01T00:00:00.000Z',
    items: [
      {
        review_id: 'review-1',
        component_type: 'sensor',
        field_key: 'sensor',
        raw_query: 'PixArt 3950',
        matched_component: 'PixArt 3395',
        match_type: 'fuzzy_flagged',
        name_score: 0.9,
        property_score: 0.8,
        combined_score: 0.85,
        alternatives: [],
        product_id: 'p1',
        status: 'pending_human',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        review_id: 'review-2',
        component_type: 'sensor',
        field_key: 'sensor',
        raw_query: 'HERO',
        matched_component: null,
        match_type: 'new_component',
        name_score: 0.7,
        property_score: 0.7,
        combined_score: 0.7,
        alternatives: [],
        product_id: 'p2',
        status: 'pending_human',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ],
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

test('updateLinkedReviewProductFields patches linked review grid fields and restores snapshot', () => {
  const harness = createQueryClientHarness([
    [['reviewProductsIndex', 'mouse'], productsIndex()],
  ]);

  const snapshot = updateLinkedReviewProductFields(
    harness.queryClient as never,
    {
      category: 'mouse',
      field: 'sensor',
      value: 'PixArt 3950',
      linkedProducts: [
        { product_id: 'p1', field_key: 'sensor' },
        { product_id: 'p2', field_key: 'sensor' },
      ],
      source: 'component',
      timestamp: '2026-01-02T00:00:00.000Z',
    },
  );

  const patched = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.equal(patched.products[0].fields.sensor.selected.value, 'PixArt 3950');
  assert.equal(patched.products[0].fields.sensor.selected.confidence, 1);
  assert.equal(patched.products[0].fields.sensor.source, 'component');
  assert.equal(patched.products[0].fields.sensor.source_timestamp, '2026-01-02T00:00:00.000Z');
  assert.equal(patched.products[1].fields.sensor.selected.value, 'PixArt 3950');
  assert.equal(patched.products[0].fields.lighting.selected.value, 'RGB');

  restoreLinkedReviewProductFields(harness.queryClient as never, snapshot);

  const restored = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.equal(restored.products[0].fields.sensor.selected.value, 'PixArt 3395');
  assert.equal(restored.products[1].fields.sensor.selected.value, 'PixArt 3370');
});

test('patchComponentReviewDocumentAction updates review item status and restores snapshot', () => {
  const harness = createQueryClientHarness([
    [['componentReview', 'mouse'], componentReviewDocument()],
  ]);

  const snapshot = patchComponentReviewDocumentAction(
    harness.queryClient as never,
    {
      category: 'mouse',
      reviewId: 'review-1',
      action: 'merge_alias',
      mergeTarget: 'PixArt 3395',
    },
  );

  const patched = harness.get(['componentReview', 'mouse']) as ComponentReviewDocument;
  assert.equal(patched.items[0].status, 'accepted_alias');
  assert.equal(patched.items[0].matched_component, 'PixArt 3395');
  assert.equal(patched.items[1].status, 'pending_human');

  restoreComponentReviewDocument(harness.queryClient as never, snapshot);

  const restored = harness.get(['componentReview', 'mouse']) as ComponentReviewDocument;
  assert.equal(restored.items[0].status, 'pending_human');
});

test('patchComponentReviewDocumentAction maps approve and dismiss actions', () => {
  const harness = createQueryClientHarness([
    [['componentReview', 'mouse'], componentReviewDocument()],
  ]);

  patchComponentReviewDocumentAction(
    harness.queryClient as never,
    {
      category: 'mouse',
      reviewId: 'review-1',
      action: 'approve_new',
    },
  );
  patchComponentReviewDocumentAction(
    harness.queryClient as never,
    {
      category: 'mouse',
      reviewId: 'review-2',
      action: 'dismiss',
    },
  );

  const patched = harness.get(['componentReview', 'mouse']) as ComponentReviewDocument;
  assert.equal(patched.items[0].status, 'approved_new');
  assert.equal(patched.items[1].status, 'dismissed');
});

test('clearLinkedReviewProductFields clears linked review grid fields only', () => {
  const harness = createQueryClientHarness([
    [['reviewProductsIndex', 'mouse'], productsIndex()],
  ]);

  clearLinkedReviewProductFields(
    harness.queryClient as never,
    {
      category: 'mouse',
      field: 'lighting',
      linkedProducts: [{ product_id: 'p1', field_key: 'lighting' }],
    },
  );

  const patched = harness.get(['reviewProductsIndex', 'mouse']) as ProductsIndexResponse;
  assert.deepEqual(patched.products[0].fields.lighting.selected, {
    value: null,
    confidence: 0,
    status: 'ok',
    color: 'gray',
  });
  assert.equal(patched.products[0].fields.lighting.candidate_count, 1);
  assert.equal(patched.products[0].fields.sensor.selected.value, 'PixArt 3395');
  assert.equal(patched.products[1].fields.sensor.selected.value, 'PixArt 3370');
});

test('resolveComponentReviewGridField maps component lanes to review grid fields', () => {
  assert.equal(resolveComponentReviewGridField({ componentType: 'sensor', property: '__name' }), 'sensor');
  assert.equal(resolveComponentReviewGridField({ componentType: 'sensor', property: '__maker' }), 'sensor_brand');
  assert.equal(resolveComponentReviewGridField({ componentType: 'sensor', property: 'dpi_max' }), 'dpi_max');
  assert.equal(resolveComponentReviewGridField({ componentType: 'sensor', property: '__aliases' }), null);
});

test('buildComponentReviewGridLinkedProducts preserves linked product ids with server-equivalent field keys', () => {
  const linkedProducts = [
    { product_id: 'p1', field_key: 'shell_material' },
    { product_id: 'p2' },
  ];

  assert.deepEqual(
    buildComponentReviewGridLinkedProducts({
      componentType: 'material',
      property: '__name',
      linkedProducts,
    }),
    [
      { product_id: 'p1', field_key: 'shell_material' },
      { product_id: 'p2', field_key: 'material' },
    ],
  );

  assert.deepEqual(
    buildComponentReviewGridLinkedProducts({
      componentType: 'material',
      property: '__maker',
      linkedProducts,
    }),
    [
      { product_id: 'p1', field_key: 'shell_material_brand' },
      { product_id: 'p2', field_key: 'material_brand' },
    ],
  );

  assert.deepEqual(
    buildComponentReviewGridLinkedProducts({
      componentType: 'sensor',
      property: 'dpi_max',
      linkedProducts,
    }),
    [
      { product_id: 'p1', field_key: 'dpi_max' },
      { product_id: 'p2', field_key: 'dpi_max' },
    ],
  );
});
