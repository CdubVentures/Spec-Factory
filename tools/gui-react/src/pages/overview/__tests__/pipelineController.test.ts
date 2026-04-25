import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useOperationsStore, type Operation } from '../../../features/operations/state/operationsStore.ts';
import { dispatchPipelineStage, PIPELINE_STAGES } from '../usePipelineController.ts';
import type { BulkFireFn, BulkFireParams } from '../bulkDispatch.ts';
import type { CatalogRow } from '../../../types/product.ts';
import type { PifVariantProgressGen } from '../../../types/product.generated.ts';

afterEach(() => {
  useOperationsStore.getState().clear();
});

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
  };
}

function product(productId: string): CatalogRow {
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
    pifVariants: [pifVariant('red'), pifVariant('blue')],
    skuVariants: [],
    rdfVariants: [],
    keyTierProgress: [],
  };
}

function op(overrides: Partial<Operation>): Operation {
  return {
    id: 'existing',
    type: 'pif',
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

function fireRecorder(calls: BulkFireParams[]): BulkFireFn {
  return async (params) => {
    calls.push(params);
    return `${params.type}:${params.productId}:${params.subType ?? 'run'}:${params.variantKey ?? params.fieldKey ?? 'product'}`;
  };
}

describe('Overview pipeline stage dispatch', () => {
  it('returns only operation ids accepted by the current stage', async () => {
    useOperationsStore.getState().upsert(op({
      id: 'old-pif-eval',
      subType: 'evaluate',
      variantKey: 'red',
    }));

    const calls: BulkFireParams[] = [];
    const result = await dispatchPipelineStage({
      stage: PIPELINE_STAGES.find((stage) => stage.kind === 'pif-loop')!,
      category: 'mouse',
      products: [product('p1')],
      fire: fireRecorder(calls),
      reservedKeys: new Set(),
      options: { staggerMs: 0 },
    });

    assert.deepEqual(calls.map((call) => `${call.subType}:${call.variantKey}`), ['loop:red', 'loop:blue']);
    assert.deepEqual(result.operationIds, ['pif:p1:loop:red', 'pif:p1:loop:blue']);
    assert.equal(result.operationIds.includes('old-pif-eval'), false);
  });
});
