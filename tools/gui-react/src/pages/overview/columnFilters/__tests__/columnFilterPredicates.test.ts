import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import type { CatalogRow } from '../../../../types/product.ts';
import type {
  PifVariantProgressGen,
  ScalarVariantProgressGen,
  KeyTierProgressGen,
} from '../../../../types/product.generated.ts';
import {
  matchesBrand,
  matchesCef,
  matchesPif,
  matchesScalar,
  matchesKeys,
  matchesScore,
  matchesRange,
  matchesColumnFilters,
  gradeBucketOf,
} from '../columnFilterPredicates.ts';
import { DEFAULT_FILTER_STATE } from '../columnFilterStore.ts';

function pifVariant(o: Partial<PifVariantProgressGen> = {}): PifVariantProgressGen {
  return {
    variant_id: o.variant_id ?? 'v1',
    variant_key: o.variant_key ?? 'v1',
    variant_label: o.variant_label ?? 'Variant 1',
    color_atoms: o.color_atoms ?? [],
    priority_filled: o.priority_filled ?? 0,
    priority_total: o.priority_total ?? 0,
    loop_filled: o.loop_filled ?? 0,
    loop_total: o.loop_total ?? 0,
    hero_filled: o.hero_filled ?? 0,
    hero_target: o.hero_target ?? 0,
    image_count: o.image_count ?? 0,
  };
}

function scalarVariant(o: Partial<ScalarVariantProgressGen> = {}): ScalarVariantProgressGen {
  return {
    variant_id: o.variant_id ?? 'v1',
    variant_key: o.variant_key ?? 'v1',
    variant_label: o.variant_label ?? 'Variant 1',
    color_atoms: o.color_atoms ?? [],
    value: o.value ?? '',
    confidence: o.confidence ?? 0,
  };
}

function tier(o: Partial<KeyTierProgressGen> = {}): KeyTierProgressGen {
  return {
    tier: o.tier ?? 'easy',
    total: o.total ?? 0,
    resolved: o.resolved ?? 0,
    perfect: o.perfect ?? 0,
  };
}

function row(o: Partial<CatalogRow> = {}): CatalogRow {
  return {
    productId: o.productId ?? 'p1',
    id: o.id ?? 0,
    identifier: o.identifier ?? '',
    brand: o.brand ?? 'BrandA',
    model: o.model ?? 'M',
    base_model: o.base_model ?? 'M',
    variant: o.variant ?? '',
    status: o.status ?? '',
    confidence: o.confidence ?? 0,
    coverage: o.coverage ?? 0,
    fieldsFilled: o.fieldsFilled ?? 0,
    fieldsTotal: o.fieldsTotal ?? 0,
    cefRunCount: o.cefRunCount ?? 0,
    pifVariants: o.pifVariants ?? [],
    skuVariants: o.skuVariants ?? [],
    rdfVariants: o.rdfVariants ?? [],
    keyTierProgress: o.keyTierProgress ?? [],
    cefLastRunAt: o.cefLastRunAt ?? '',
    pifLastRunAt: o.pifLastRunAt ?? '',
    rdfLastRunAt: o.rdfLastRunAt ?? '',
    skuLastRunAt: o.skuLastRunAt ?? '',
    kfLastRunAt: o.kfLastRunAt ?? '',
  } as unknown as CatalogRow;
}

describe('matchesBrand', () => {
  it('passes any brand when filter is empty', () => {
    strictEqual(matchesBrand(row({ brand: 'X' }), []), true);
  });
  it('passes only listed brands', () => {
    strictEqual(matchesBrand(row({ brand: 'A' }), ['A', 'B']), true);
    strictEqual(matchesBrand(row({ brand: 'C' }), ['A', 'B']), false);
  });
});

describe('matchesCef', () => {
  it('passes any when bucket is "any"', () => {
    strictEqual(matchesCef(row({ cefRunCount: 0 }), 'any'), true);
    strictEqual(matchesCef(row({ cefRunCount: 2 }), 'any'), true);
  });
  it('matches exact bucket', () => {
    strictEqual(matchesCef(row({ cefRunCount: 0 }), '0'), true);
    strictEqual(matchesCef(row({ cefRunCount: 1 }), '0'), false);
    strictEqual(matchesCef(row({ cefRunCount: 1 }), '1'), true);
    strictEqual(matchesCef(row({ cefRunCount: 2 }), '2'), true);
  });
});

describe('matchesPif', () => {
  it('passes when min is null', () => {
    strictEqual(matchesPif(row(), { metric: 'priority', min: null }), true);
  });
  it('rejects rows with no variants when threshold set', () => {
    strictEqual(matchesPif(row(), { metric: 'priority', min: 0 }), false);
  });
  it('passes when ANY variant meets priority threshold', () => {
    const r = row({
      pifVariants: [
        pifVariant({ priority_filled: 0, priority_total: 4 }),
        pifVariant({ priority_filled: 4, priority_total: 4 }),
      ],
    });
    strictEqual(matchesPif(r, { metric: 'priority', min: 1 }), true);
  });
  it('rejects when no variant meets priority threshold', () => {
    const r = row({
      pifVariants: [
        pifVariant({ priority_filled: 1, priority_total: 4 }),
        pifVariant({ priority_filled: 2, priority_total: 4 }),
      ],
    });
    strictEqual(matchesPif(r, { metric: 'priority', min: 1 }), false);
  });
  it('handles loop / hero metrics', () => {
    const r = row({
      pifVariants: [pifVariant({ loop_filled: 5, loop_total: 10, hero_filled: 3, hero_target: 3 })],
    });
    strictEqual(matchesPif(r, { metric: 'loop', min: 0.5 }), true);
    strictEqual(matchesPif(r, { metric: 'loop', min: 0.6 }), false);
    strictEqual(matchesPif(r, { metric: 'hero', min: 1 }), true);
  });
  it('image metric uses raw count not percentage', () => {
    const r = row({ pifVariants: [pifVariant({ image_count: 7 })] });
    strictEqual(matchesPif(r, { metric: 'image', min: 5 }), true);
    strictEqual(matchesPif(r, { metric: 'image', min: 8 }), false);
  });
  it('zero denominator yields 0%', () => {
    const r = row({ pifVariants: [pifVariant({ priority_total: 0 })] });
    strictEqual(matchesPif(r, { metric: 'priority', min: 0 }), true);
    strictEqual(matchesPif(r, { metric: 'priority', min: 0.01 }), false);
  });
});

describe('matchesScalar', () => {
  it('passes when no filter set', () => {
    strictEqual(matchesScalar([], { hasValue: 'any', minConfidence: null }), true);
    strictEqual(
      matchesScalar([scalarVariant()], { hasValue: 'any', minConfidence: null }),
      true,
    );
  });
  it('hasValue=yes passes when ANY variant has value', () => {
    const vs = [scalarVariant({ value: '' }), scalarVariant({ value: 'v' })];
    strictEqual(matchesScalar(vs, { hasValue: 'yes', minConfidence: null }), true);
    strictEqual(
      matchesScalar([scalarVariant({ value: '' })], { hasValue: 'yes', minConfidence: null }),
      false,
    );
  });
  it('hasValue=no passes when ANY variant lacks value', () => {
    strictEqual(
      matchesScalar([scalarVariant({ value: 'v' }), scalarVariant({ value: '' })], { hasValue: 'no', minConfidence: null }),
      true,
    );
    strictEqual(
      matchesScalar([scalarVariant({ value: 'v' })], { hasValue: 'no', minConfidence: null }),
      false,
    );
  });
  it('hasValue=no with empty variants passes (interpreted as missing)', () => {
    strictEqual(matchesScalar([], { hasValue: 'no', minConfidence: null }), true);
  });
  it('minConfidence threshold matched on ANY variant', () => {
    const vs = [
      scalarVariant({ value: 'a', confidence: 0.5 }),
      scalarVariant({ value: 'b', confidence: 0.9 }),
    ];
    strictEqual(matchesScalar(vs, { hasValue: 'any', minConfidence: 0.8 }), true);
    strictEqual(matchesScalar(vs, { hasValue: 'any', minConfidence: 1 }), false);
  });
  it('combines hasValue + minConfidence per variant', () => {
    const vs = [
      scalarVariant({ value: '', confidence: 0.95 }),
      scalarVariant({ value: 'b', confidence: 0.5 }),
    ];
    strictEqual(matchesScalar(vs, { hasValue: 'yes', minConfidence: 0.9 }), false);
  });
});

describe('matchesKeys', () => {
  it('passes when no filter set', () => {
    strictEqual(matchesKeys(row(), { tiers: [], minResolvedPct: null }), true);
  });
  it('rejects when tiers empty but threshold set and no variants', () => {
    strictEqual(matchesKeys(row(), { tiers: [], minResolvedPct: 50 }), false);
  });
  it('passes when ANY tier meets threshold (no tier filter)', () => {
    const r = row({
      keyTierProgress: [tier({ tier: 'easy', total: 10, resolved: 2 }), tier({ tier: 'hard', total: 10, resolved: 8 })],
    });
    strictEqual(matchesKeys(r, { tiers: [], minResolvedPct: 70 }), true);
    strictEqual(matchesKeys(r, { tiers: [], minResolvedPct: 90 }), false);
  });
  it('with tier filter restricts to chosen tiers', () => {
    const r = row({
      keyTierProgress: [tier({ tier: 'easy', total: 10, resolved: 9 }), tier({ tier: 'hard', total: 10, resolved: 1 })],
    });
    strictEqual(matchesKeys(r, { tiers: ['hard'], minResolvedPct: 50 }), false);
    strictEqual(matchesKeys(r, { tiers: ['easy'], minResolvedPct: 50 }), true);
    strictEqual(matchesKeys(r, { tiers: ['easy', 'hard'], minResolvedPct: 50 }), true);
  });
  it('tier filter without threshold passes if any chosen tier present', () => {
    const r = row({ keyTierProgress: [tier({ tier: 'easy' })] });
    strictEqual(matchesKeys(r, { tiers: ['easy'], minResolvedPct: null }), true);
    strictEqual(matchesKeys(r, { tiers: ['hard'], minResolvedPct: null }), false);
  });
});

describe('matchesScore + gradeBucketOf', () => {
  it('buckets letter grades to A/B/C/D/F', () => {
    strictEqual(gradeBucketOf('A+'), 'A');
    strictEqual(gradeBucketOf('A-'), 'A');
    strictEqual(gradeBucketOf('B+'), 'B');
    strictEqual(gradeBucketOf('C-'), 'C');
    strictEqual(gradeBucketOf('D+'), 'D');
    strictEqual(gradeBucketOf('F'), 'F');
  });
  it('passes any when grades empty', () => {
    strictEqual(matchesScore(row(), []), true);
  });
  it('matches when grade bucket selected', () => {
    const high = row({
      coverage: 1,
      confidence: 1,
      fieldsFilled: 10,
      fieldsTotal: 10,
      cefRunCount: 2,
      pifVariants: [pifVariant({ priority_filled: 4, priority_total: 4, loop_filled: 4, loop_total: 4, hero_filled: 4, hero_target: 4 })],
      skuVariants: [scalarVariant({ value: 'x', confidence: 1 })],
      rdfVariants: [scalarVariant({ value: 'y', confidence: 1 })],
    });
    strictEqual(matchesScore(high, ['A']), true);
    strictEqual(matchesScore(high, ['F']), false);

    const low = row();
    strictEqual(matchesScore(low, ['F']), true);
    strictEqual(matchesScore(low, ['A']), false);
  });
});

describe('matchesRange', () => {
  it('passes when both bounds null', () => {
    strictEqual(matchesRange(0.5, { min: null, max: null }), true);
  });
  it('respects min bound (inclusive)', () => {
    strictEqual(matchesRange(0.7, { min: 0.7, max: null }), true);
    strictEqual(matchesRange(0.69, { min: 0.7, max: null }), false);
  });
  it('respects max bound (inclusive)', () => {
    strictEqual(matchesRange(0.7, { min: null, max: 0.7 }), true);
    strictEqual(matchesRange(0.71, { min: null, max: 0.7 }), false);
  });
  it('respects both bounds', () => {
    strictEqual(matchesRange(0.5, { min: 0.4, max: 0.6 }), true);
    strictEqual(matchesRange(0.3, { min: 0.4, max: 0.6 }), false);
    strictEqual(matchesRange(0.7, { min: 0.4, max: 0.6 }), false);
  });
});

describe('matchesColumnFilters (composition)', () => {
  it('default state passes everything', () => {
    strictEqual(matchesColumnFilters(row(), DEFAULT_FILTER_STATE), true);
  });
  it('rejects when any single column filter rejects', () => {
    strictEqual(
      matchesColumnFilters(row({ brand: 'X' }), { ...DEFAULT_FILTER_STATE, brand: ['Y'] }),
      false,
    );
    strictEqual(
      matchesColumnFilters(row({ coverage: 0.1 }), { ...DEFAULT_FILTER_STATE, coverage: { min: 0.5, max: null } }),
      false,
    );
  });
  it('passes when all column filters match', () => {
    const r = row({ brand: 'A', coverage: 0.9, confidence: 0.9, cefRunCount: 2 });
    const f = {
      ...DEFAULT_FILTER_STATE,
      brand: ['A'],
      cef: '2' as const,
      coverage: { min: 0.8, max: null },
      confidence: { min: 0.8, max: null },
    };
    strictEqual(matchesColumnFilters(r, f), true);
  });
});
