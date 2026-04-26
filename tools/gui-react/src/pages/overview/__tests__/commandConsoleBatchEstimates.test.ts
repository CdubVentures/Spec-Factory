import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { estimatePifEvalOperationCount } from '../commandConsoleBatchEstimates.ts';
import type { CatalogRow } from '../../../types/product.ts';
import type { PifVariantProgressGen } from '../../../types/product.generated.ts';

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

function row(productId: string, variantCount: number): CatalogRow {
  return {
    productId,
    id: 0,
    brand: '',
    model: '',
    base_model: '',
    variant: '',
    identifier: '',
    status: '',
    confidence: 0,
    coverage: 0,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifVariants: Array.from({ length: variantCount }, (_, i) => pifVariant(`variant:${i}`)),
    skuVariants: [],
    rdfVariants: [],
    keyTierProgress: [],
  } as unknown as CatalogRow;
}

describe('command console batch estimates', () => {
  it('counts PIF Eval as one top-level operation per variant', () => {
    strictEqual(estimatePifEvalOperationCount([row('p1', 9)]), 9);
  });

  it('sums PIF Eval operation counts across selected products', () => {
    strictEqual(estimatePifEvalOperationCount([row('p1', 2), row('p2', 3)]), 5);
  });

  it('returns zero when selected products have no PIF variants', () => {
    strictEqual(estimatePifEvalOperationCount([row('p1', 0)]), 0);
  });
});
