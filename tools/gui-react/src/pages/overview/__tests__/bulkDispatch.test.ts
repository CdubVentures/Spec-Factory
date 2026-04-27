import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../../api/client.ts';
import { useOperationsStore, type Operation } from '../../../features/operations/state/operationsStore.ts';
import {
  dispatchKfAll,
  dispatchKfPipelineBucket,
  dispatchKfPickedKeys,
  dispatchPifDependencyRun,
  dispatchPifEval,
  dispatchRdfLoop,
  dispatchRdfRun,
  dispatchCefDeleteAll,
  dispatchPifCarouselClearAll,
  dispatchPifDeleteAll,
  dispatchRdfDeleteAll,
  dispatchSkuDeleteAll,
  dispatchKfDeleteAll,
  type BulkFireFn,
  type BulkFireParams,
} from '../bulkDispatch.ts';
import type { CatalogRow } from '../../../types/product.ts';
import type { PifVariantProgressGen, ScalarVariantProgressGen } from '../../../types/product.generated.ts';

const originalGet = api.get;
const originalPost = api.post;
const originalDel = api.del;

afterEach(() => {
  (api as unknown as { get: typeof originalGet }).get = originalGet;
  (api as unknown as { post: typeof originalPost }).post = originalPost;
  (api as unknown as { del: typeof originalDel }).del = originalDel;
  useOperationsStore.getState().clear();
});

function scalarVariant(key: string): ScalarVariantProgressGen {
  return {
    variant_id: `id-${key}`,
    variant_key: key,
    variant_label: key,
    color_atoms: [],
    value: '',
    confidence: 0,
  };
}

function pifVariant(key: string): PifVariantProgressGen {
  return {
    variant_id: `id-${key}`,
    variant_key: key,
    variant_label: key,
    color_atoms: [],
    priority_filled: 0,
    priority_total: 0,
    loop_filled: 0,
    loop_total: 0,
    hero_filled: 0,
    hero_target: 0,
    image_count: 0,
  };
}

function product(productId: string, variants: readonly ScalarVariantProgressGen[] = []): CatalogRow {
  return {
    productId,
    id: 0,
    identifier: productId,
    brand: 'Brand',
    model: productId,
    base_model: productId,
    variant: '',
    status: '',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifVariants: [],
    skuVariants: [],
    rdfVariants: [...variants],
    keyTierProgress: [],
  };
}

function op(overrides: Partial<Operation>): Operation {
  return {
    id: 'existing',
    type: 'rdf',
    category: 'mouse',
    productId: 'p1',
    productLabel: 'p1',
    stages: [],
    currentStageIndex: 0,
    status: 'running',
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [],
    ...overrides,
  };
}

function fireRecorder(calls: BulkFireParams[], events: string[] = []): BulkFireFn {
  return async (params) => {
    calls.push(params);
    const scope = params.variantKey ?? params.fieldKey ?? 'product';
    const opId = `${params.type}:${params.productId}:${params.subType ?? 'run'}:${scope}`;
    events.push(`fire:${params.productId}:${scope}`);
    return opId;
  };
}

describe('Overview bulk dispatch contracts', () => {
  it('keeps RDF Run spammable while Loop skips variants already looping', async () => {
    useOperationsStore.getState().upsert(op({
      id: 'rdf-loop-red',
      subType: 'loop',
      variantKey: 'red',
    }));

    const row = product('p1', [scalarVariant('red'), scalarVariant('blue')]);
    const runCalls: BulkFireParams[] = [];
    const loopCalls: BulkFireParams[] = [];

    const runResult = await dispatchRdfRun('mouse', [row], fireRecorder(runCalls), { staggerMs: 0 });
    const loopResult = await dispatchRdfLoop('mouse', [row], fireRecorder(loopCalls), { staggerMs: 0 });

    assert.deepEqual(runCalls.map((call) => call.variantKey), ['red', 'blue']);
    assert.deepEqual(runResult.operationIds, ['rdf:p1:run:red', 'rdf:p1:run:blue']);
    assert.deepEqual(loopCalls.map((call) => call.variantKey), ['blue']);
    assert.deepEqual(loopResult.operationIds, ['rdf:p1:loop:blue']);
  });

  it('dispatchPifEval fires one carousel eval operation per variant with collected images', async () => {
    (api as unknown as { get: typeof originalGet }).get = async (path: string) => {
      if (path === '/product-image-finder/mouse/p1') {
        return {
          images: [
            { variant_key: 'color:red', view: 'top' },
            { variant_key: 'color:red', view: 'front' },
            { variant_key: 'color:red', view: 'hero' },
            { variant_key: 'color:blue', view: 'top' },
          ],
        } as never;
      }
      throw new Error(`unexpected GET ${path}`);
    };

    const row: CatalogRow = {
      ...product('p1'),
      pifVariants: [pifVariant('color:red'), pifVariant('color:blue'), pifVariant('color:empty')],
    };
    const calls: BulkFireParams[] = [];
    const result = await dispatchPifEval('mouse', [row], fireRecorder(calls), { staggerMs: 0 });

    assert.deepEqual(calls.map((call) => call.variantKey), ['color:red', 'color:blue']);
    assert.deepEqual(calls.map((call) => call.url), [
      '/product-image-finder/mouse/p1/evaluate-carousel',
      '/product-image-finder/mouse/p1/evaluate-carousel',
    ]);
    assert.deepEqual(calls.map((call) => call.body), [
      { variant_key: 'color:red', variant_id: 'id-color:red' },
      { variant_key: 'color:blue', variant_id: 'id-color:blue' },
    ]);
    assert.equal(result.scheduled, 2);
  });

  it('dispatchPifDependencyRun runs only missing Product Image Dependent keys as forced-solo KF runs', async () => {
    const row: CatalogRow = {
      ...product('p1'),
      pifDependencyMissingKeys: ['connection', 'layout_standard'],
    };
    const readyRow: CatalogRow = {
      ...product('p2'),
      pifDependencyMissingKeys: [],
    };
    const calls: BulkFireParams[] = [];

    const result = await dispatchPifDependencyRun('mouse', [row, readyRow], fireRecorder(calls), { staggerMs: 0 });

    assert.deepEqual(calls.map((call) => [call.productId, call.fieldKey]), [
      ['p1', 'connection'],
      ['p1', 'layout_standard'],
    ]);
    assert.deepEqual(calls.map((call) => call.body), [
      { field_key: 'connection', mode: 'run', force_solo: true, reason: 'pif_dependency' },
      { field_key: 'layout_standard', mode: 'run', force_solo: true, reason: 'pif_dependency' },
    ]);
    assert.deepEqual(result.operationIds, [
      'kf:p1:run:connection',
      'kf:p1:run:layout_standard',
    ]);
  });

  it('chains KeyFinder Loop per product with filtering, priority sort, and terminal waits', async () => {
    (api as unknown as { get: typeof originalGet }).get = async (path: string) => {
      if (path.endsWith('/bundling-config')) {
        return { sortAxisOrder: 'availability,required_level,difficulty' } as never;
      }
      if (path.endsWith('/summary')) {
        return [
          { field_key: 'reserved_key', difficulty: 'easy', required_level: 'mandatory', availability: 'always' },
          { field_key: 'variant_key', difficulty: 'easy', required_level: 'mandatory', availability: 'always', variant_dependent: true },
          { field_key: 'already_resolved', difficulty: 'easy', required_level: 'mandatory', availability: 'always', last_status: 'resolved' },
          { field_key: 'already_published', difficulty: 'easy', required_level: 'mandatory', availability: 'always', published: true },
          { field_key: 'rare_easy', difficulty: 'easy', required_level: 'non_mandatory', availability: 'rare' },
          { field_key: 'always_hard', difficulty: 'hard', required_level: 'mandatory', availability: 'always' },
        ] as never;
      }
      throw new Error(`unexpected GET ${path}`);
    };

    const calls: BulkFireParams[] = [];
    const events: string[] = [];

    const result = await dispatchKfAll(
      'mouse',
      [product('p1')],
      new Set(['reserved_key']),
      'loop',
      fireRecorder(calls, events),
      {
        staggerMs: 0,
        awaitOperationTerminal: async (operationId) => {
          events.push(`terminal:${operationId}`);
          return 'done';
        },
      },
    );

    assert.deepEqual(calls.map((call) => call.fieldKey), ['always_hard', 'rare_easy']);
    assert.deepEqual(events, [
      'fire:p1:always_hard',
      'terminal:kf:p1:loop:always_hard',
      'fire:p1:rare_easy',
      'terminal:kf:p1:loop:rare_easy',
    ]);
    assert.deepEqual(result.operationIds, ['kf:p1:loop:always_hard', 'kf:p1:loop:rare_easy']);
  });

  it('chains KeyFinder Run dispatch order behind passengersRegistered', async () => {
    (api as unknown as { get: typeof originalGet }).get = async (path: string) => {
      if (path.endsWith('/bundling-config')) return { sortAxisOrder: '' } as never;
      if (path.endsWith('/summary')) {
        return [
          { field_key: 'a', difficulty: 'easy', required_level: 'mandatory', availability: 'always' },
          { field_key: 'b', difficulty: 'medium', required_level: 'mandatory', availability: 'always' },
        ] as never;
      }
      throw new Error(`unexpected GET ${path}`);
    };

    const calls: BulkFireParams[] = [];
    const events: string[] = [];

    await dispatchKfAll(
      'mouse',
      [product('p1')],
      new Set(),
      'run',
      fireRecorder(calls, events),
      {
        staggerMs: 0,
        awaitPassengersRegistered: async (operationId) => {
          events.push(`registered:${operationId}`);
          return 'registered';
        },
      },
    );

    assert.deepEqual(events, [
      'fire:p1:a',
      'registered:kf:p1:run:a',
      'fire:p1:b',
      'registered:kf:p1:run:b',
    ]);
  });

  it('skips KeyFinder Loop for a product that already has an active Loop chain', async () => {
    let getCount = 0;
    (api as unknown as { get: typeof originalGet }).get = async () => {
      getCount += 1;
      return [
        { field_key: 'a', difficulty: 'easy', required_level: 'mandatory', availability: 'always' },
      ] as never;
    };
    useOperationsStore.getState().upsert(op({
      id: 'kf-loop-a',
      type: 'kf',
      subType: 'loop',
      fieldKey: 'a',
    }));

    const calls: BulkFireParams[] = [];
    const result = await dispatchKfAll(
      'mouse',
      [product('p1')],
      new Set(),
      'loop',
      fireRecorder(calls),
      { staggerMs: 0 },
    );

    assert.equal(getCount, 0);
    assert.equal(result.scheduled, 0);
    assert.deepEqual(calls, []);
  });

  it('dispatchKfPickedKeys fires only the picked keys per product, in axis-order', async () => {
    (api as unknown as { get: typeof originalGet }).get = async (path: string) => {
      if (path.endsWith('/bundling-config')) {
        return { sortAxisOrder: 'difficulty,required_level,availability' } as never;
      }
      if (path.endsWith('/summary')) {
        return [
          { field_key: 'release_year', difficulty: 'easy', required_level: 'mandatory', availability: 'always' },
          { field_key: 'weight_g', difficulty: 'medium', required_level: 'mandatory', availability: 'sometimes' },
          { field_key: 'sensor_dpi', difficulty: 'hard', required_level: 'mandatory', availability: 'rare' },
          { field_key: 'reserved_key', difficulty: 'easy', required_level: 'mandatory', availability: 'always' },
          { field_key: 'variant_dep_key', difficulty: 'easy', required_level: 'mandatory', availability: 'always', variant_dependent: true },
        ] as never;
      }
      throw new Error(`unexpected GET ${path}`);
    };

    const calls: BulkFireParams[] = [];
    const events: string[] = [];

    const result = await dispatchKfPickedKeys(
      'mouse',
      [product('p1'), product('p2')],
      new Set(['reserved_key']),
      new Set(['weight_g', 'sensor_dpi', 'reserved_key', 'variant_dep_key']),
      'run',
      fireRecorder(calls, events),
      {
        staggerMs: 0,
        awaitPassengersRegistered: async (operationId) => {
          events.push(`registered:${operationId}`);
          return 'registered';
        },
      },
    );

    // 2 picked × 2 products = 4 ops; reserved + variant_dependent in pickedKeys are filtered out.
    // Per-product chain is serial (weight_g → sensor_dpi by difficulty axis); products run in
    // parallel via Promise.all, so we assert per-product order via filter.
    const p1Calls = calls.filter((c) => c.productId === 'p1').map((c) => c.fieldKey);
    const p2Calls = calls.filter((c) => c.productId === 'p2').map((c) => c.fieldKey);
    assert.deepEqual(p1Calls, ['weight_g', 'sensor_dpi']);
    assert.deepEqual(p2Calls, ['weight_g', 'sensor_dpi']);
    assert.equal(result.operationIds.length, 4);
    assert.equal(result.failures, 0);

    // passengersRegistered is awaited between fires within each product chain.
    const p1Events = events.filter((e) => e.includes(':p1:'));
    assert.deepEqual(p1Events, [
      'fire:p1:weight_g', 'registered:kf:p1:run:weight_g',
      'fire:p1:sensor_dpi', 'registered:kf:p1:run:sensor_dpi',
    ]);
  });

  it('dispatchKfPickedKeys with empty picked set fires nothing', async () => {
    let getCount = 0;
    (api as unknown as { get: typeof originalGet }).get = async () => {
      getCount += 1;
      return [] as never;
    };
    const calls: BulkFireParams[] = [];
    const result = await dispatchKfPickedKeys(
      'mouse',
      [product('p1')],
      new Set(),
      new Set(),
      'run',
      fireRecorder(calls),
      { staggerMs: 0 },
    );
    assert.deepEqual(calls, []);
    assert.equal(result.operationIds.length, 0);
    // Short-circuits before any per-product fetch when picked set is empty.
    assert.equal(getCount, 0);
  });

  it('dispatchKfPickedKeys mode=run does not skip already-resolved keys', async () => {
    (api as unknown as { get: typeof originalGet }).get = async (path: string) => {
      if (path.endsWith('/bundling-config')) return { sortAxisOrder: '' } as never;
      if (path.endsWith('/summary')) {
        return [
          { field_key: 'already_resolved', difficulty: 'easy', required_level: 'mandatory', availability: 'always', last_status: 'resolved' },
          { field_key: 'already_published', difficulty: 'easy', required_level: 'mandatory', availability: 'always', published: true },
        ] as never;
      }
      throw new Error(`unexpected GET ${path}`);
    };
    const calls: BulkFireParams[] = [];
    await dispatchKfPickedKeys(
      'mouse',
      [product('p1')],
      new Set(),
      new Set(['already_resolved', 'already_published']),
      'run',
      fireRecorder(calls),
      {
        staggerMs: 0,
        awaitPassengersRegistered: async () => 'registered',
      },
    );
    // Both fired (Run does not skip resolved/published, that's Loop-only behavior).
    // Default axis order is difficulty,required_level,availability — both equal here, so
    // alphabetical field_key tiebreaker puts already_published before already_resolved.
    assert.deepEqual(calls.map((c) => c.fieldKey), ['already_published', 'already_resolved']);
  });

  it('dispatchKfPipelineBucket runs early keys without prompt dependencies', async () => {
    (api as unknown as { get: typeof originalGet }).get = async (path: string) => {
      if (path.endsWith('/bundling-config')) return { sortAxisOrder: '' } as never;
      if (path.endsWith('/summary')) {
        return [
          { field_key: 'reserved_key', difficulty: 'easy', required_level: 'mandatory', availability: 'always' },
          { field_key: 'static_key', difficulty: 'easy', required_level: 'mandatory', availability: 'always', uses_variant_inventory: false, uses_pif_priority_images: false, product_image_dependent: false },
          { field_key: 'variant_context', difficulty: 'easy', required_level: 'mandatory', availability: 'always', uses_variant_inventory: true, uses_pif_priority_images: false, product_image_dependent: false },
          { field_key: 'pif_visual', difficulty: 'easy', required_level: 'mandatory', availability: 'always', uses_variant_inventory: false, uses_pif_priority_images: true, product_image_dependent: false },
          { field_key: 'connection', difficulty: 'easy', required_level: 'mandatory', availability: 'always', uses_variant_inventory: true, uses_pif_priority_images: false, product_image_dependent: true },
        ] as never;
      }
      throw new Error(`unexpected GET ${path}`);
    };

    const calls: BulkFireParams[] = [];
    await dispatchKfPipelineBucket(
      'mouse',
      [product('p1')],
      new Set(['reserved_key']),
      'early',
      fireRecorder(calls),
      {
        staggerMs: 0,
        awaitOperationTerminal: async () => 'done',
      },
    );

    assert.deepEqual(calls.map((call) => call.fieldKey), ['static_key']);
  });

  it('dispatchKfPipelineBucket runs contextual keys after upstream prompt context is ready', async () => {
    (api as unknown as { get: typeof originalGet }).get = async (path: string) => {
      if (path.endsWith('/bundling-config')) return { sortAxisOrder: '' } as never;
      if (path.endsWith('/summary')) {
        return [
          { field_key: 'static_key', difficulty: 'easy', required_level: 'mandatory', availability: 'always', uses_variant_inventory: false, uses_pif_priority_images: false, product_image_dependent: false },
          { field_key: 'variant_context', difficulty: 'easy', required_level: 'mandatory', availability: 'always', uses_variant_inventory: true, uses_pif_priority_images: false, product_image_dependent: false },
          { field_key: 'pif_visual', difficulty: 'easy', required_level: 'mandatory', availability: 'always', uses_variant_inventory: false, uses_pif_priority_images: true, product_image_dependent: false },
          { field_key: 'connection', difficulty: 'easy', required_level: 'mandatory', availability: 'always', uses_variant_inventory: true, uses_pif_priority_images: false, product_image_dependent: true },
        ] as never;
      }
      throw new Error(`unexpected GET ${path}`);
    };

    const calls: BulkFireParams[] = [];
    await dispatchKfPipelineBucket(
      'mouse',
      [product('p1')],
      new Set(),
      'contextual',
      fireRecorder(calls),
      {
        staggerMs: 0,
        awaitOperationTerminal: async () => 'done',
      },
    );

    assert.deepEqual(calls.map((call) => call.fieldKey), ['pif_visual', 'variant_context']);
  });
});

// ── Bulk Delete-All across selected products ─────────────────────────────
//
// Each helper fans out DELETE /:finder-prefix/:cat/:pid to every selected
// product. Server-side cascade (the `onAfterDeleteAll` hook shipped earlier)
// handles the full wipe per finder — these helpers just orchestrate the
// fan-out: stagger, error tolerance, return shape.

function delRecorder(calls: string[], failures: ReadonlySet<string> = new Set()): typeof api.del {
  return (async (path: string) => {
    calls.push(path);
    if (failures.has(path)) throw new Error(`mock failure: ${path}`);
    return { ok: true } as never;
  }) as typeof api.del;
}

function postRecorder(calls: string[], failures: ReadonlySet<string> = new Set()): typeof api.post {
  return (async (path: string) => {
    calls.push(path);
    if (failures.has(path)) throw new Error(`mock failure: ${path}`);
    return { ok: true } as never;
  }) as typeof api.post;
}

describe('Overview bulk Delete-All dispatchers', () => {
  it('dispatchCefDeleteAll fires DELETE /color-edition-finder/:cat/:pid per selected product', async () => {
    const calls: string[] = [];
    (api as unknown as { del: typeof api.del }).del = delRecorder(calls);
    const products = [product('p1'), product('p2'), product('p3')];

    const result = await dispatchCefDeleteAll('mouse', products, { staggerMs: 0 });

    assert.deepEqual(calls, [
      '/color-edition-finder/mouse/p1',
      '/color-edition-finder/mouse/p2',
      '/color-edition-finder/mouse/p3',
    ]);
    assert.equal(result.scheduled, 3);
    assert.equal(result.failures, 0);
  });

  it('dispatchPifDeleteAll fires DELETE /product-image-finder/:cat/:pid per selected product', async () => {
    const calls: string[] = [];
    (api as unknown as { del: typeof api.del }).del = delRecorder(calls);
    const result = await dispatchPifDeleteAll('mouse', [product('p1'), product('p2')], { staggerMs: 0 });
    assert.deepEqual(calls, [
      '/product-image-finder/mouse/p1',
      '/product-image-finder/mouse/p2',
    ]);
    assert.equal(result.scheduled, 2);
  });

  it('dispatchPifCarouselClearAll clears PIF carousel winners per selected product without deleting PIF data', async () => {
    const calls: string[] = [];
    (api as unknown as { post: typeof api.post }).post = postRecorder(
      calls,
      new Set(['/product-image-finder/mouse/p2/carousel-winners/clear-all']),
    );

    const result = await dispatchPifCarouselClearAll(
      'mouse',
      [product('p1'), product('p2'), product('p3')],
      { staggerMs: 0 },
    );

    assert.deepEqual(calls, [
      '/product-image-finder/mouse/p1/carousel-winners/clear-all',
      '/product-image-finder/mouse/p2/carousel-winners/clear-all',
      '/product-image-finder/mouse/p3/carousel-winners/clear-all',
    ]);
    assert.equal(result.scheduled, 3);
    assert.equal(result.failures, 1);
    assert.deepEqual(result.operationIds, []);
  });

  it('dispatchRdfDeleteAll fires DELETE /release-date-finder/:cat/:pid per selected product', async () => {
    const calls: string[] = [];
    (api as unknown as { del: typeof api.del }).del = delRecorder(calls);
    const result = await dispatchRdfDeleteAll('mouse', [product('p1')], { staggerMs: 0 });
    assert.deepEqual(calls, ['/release-date-finder/mouse/p1']);
    assert.equal(result.scheduled, 1);
  });

  it('dispatchSkuDeleteAll fires DELETE /sku-finder/:cat/:pid per selected product', async () => {
    const calls: string[] = [];
    (api as unknown as { del: typeof api.del }).del = delRecorder(calls);
    const result = await dispatchSkuDeleteAll('mouse', [product('p1'), product('p2')], { staggerMs: 0 });
    assert.deepEqual(calls, ['/sku-finder/mouse/p1', '/sku-finder/mouse/p2']);
    assert.equal(result.scheduled, 2);
  });

  it('dispatchKfDeleteAll fires DELETE /key-finder/:cat/:pid per selected product', async () => {
    const calls: string[] = [];
    (api as unknown as { del: typeof api.del }).del = delRecorder(calls);
    const result = await dispatchKfDeleteAll('mouse', [product('p1')], { staggerMs: 0 });
    assert.deepEqual(calls, ['/key-finder/mouse/p1']);
    assert.equal(result.scheduled, 1);
  });

  it('returns failures count without aborting the rest of the fan-out', async () => {
    const calls: string[] = [];
    (api as unknown as { del: typeof api.del }).del = delRecorder(
      calls,
      new Set(['/color-edition-finder/mouse/p2']),
    );
    const result = await dispatchCefDeleteAll(
      'mouse',
      [product('p1'), product('p2'), product('p3')],
      { staggerMs: 0 },
    );
    // p1 + p3 succeed, p2 fails — fan-out completes.
    assert.equal(result.scheduled, 3);
    assert.equal(result.failures, 1);
    assert.equal(calls.length, 3, 'every product should be attempted even if one fails');
  });

  it('encodes special characters in category and productId path segments', async () => {
    const calls: string[] = [];
    (api as unknown as { del: typeof api.del }).del = delRecorder(calls);
    await dispatchCefDeleteAll('cat with space', [product('p/1')], { staggerMs: 0 });
    assert.deepEqual(calls, ['/color-edition-finder/cat%20with%20space/p%2F1']);
  });

  it('returns scheduled=0 when no products are selected', async () => {
    const calls: string[] = [];
    (api as unknown as { del: typeof api.del }).del = delRecorder(calls);
    const result = await dispatchCefDeleteAll('mouse', [], { staggerMs: 0 });
    assert.deepEqual(calls, []);
    assert.equal(result.scheduled, 0);
    assert.equal(result.failures, 0);
  });
});
