import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../../api/client.ts';
import { useOperationsStore, type Operation } from '../../../features/operations/state/operationsStore.ts';
import {
  dispatchKfAll,
  dispatchRdfLoop,
  dispatchRdfRun,
  type BulkFireFn,
  type BulkFireParams,
} from '../bulkDispatch.ts';
import type { CatalogRow } from '../../../types/product.ts';
import type { ScalarVariantProgressGen } from '../../../types/product.generated.ts';

const originalGet = api.get;

afterEach(() => {
  (api as unknown as { get: typeof originalGet }).get = originalGet;
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
});
