import type { CatalogRow } from '../../../types/product.ts';
import type {
  PifVariantProgressGen,
  ScalarVariantProgressGen,
  KeyTierProgressGen,
} from '../../../types/product.generated.ts';
import { scoreToLetter, getScoreCard } from '../scoreCard.ts';
import type {
  ColumnFilterState,
  PifFilter,
  ScalarFilter,
  KeysFilter,
  NumericRange,
  CefBucket,
  GradeBucket,
} from './columnFilterStore.ts';

export function matchesBrand(row: CatalogRow, brands: readonly string[]): boolean {
  if (brands.length === 0) return true;
  return brands.includes(row.brand);
}

export function matchesCef(row: CatalogRow, bucket: CefBucket): boolean {
  if (bucket === 'any') return true;
  return row.cefRunCount === Number(bucket);
}

function pifVariantPercent(v: PifVariantProgressGen, metric: PifFilter['metric']): number {
  switch (metric) {
    case 'priority':
      return v.priority_total > 0 ? v.priority_filled / v.priority_total : 0;
    case 'loop':
      return v.loop_total > 0 ? v.loop_filled / v.loop_total : 0;
    case 'hero':
      return v.hero_target > 0 ? v.hero_filled / v.hero_target : 0;
    case 'image':
      return v.image_count;
  }
}

export function matchesPif(row: CatalogRow, filter: PifFilter): boolean {
  if (filter.min === null) return true;
  if (row.pifVariants.length === 0) return false;
  return row.pifVariants.some((v) => pifVariantPercent(v, filter.metric) >= filter.min!);
}

function variantSatisfies(v: ScalarVariantProgressGen, filter: ScalarFilter): boolean {
  if (filter.hasValue === 'yes' && !v.value) return false;
  if (filter.hasValue === 'no' && v.value) return false;
  if (filter.minConfidence !== null && v.confidence < filter.minConfidence) return false;
  return true;
}

export function matchesScalar(
  variants: readonly ScalarVariantProgressGen[],
  filter: ScalarFilter,
): boolean {
  if (filter.hasValue === 'any' && filter.minConfidence === null) return true;
  if (variants.length === 0) {
    return filter.hasValue === 'no' && filter.minConfidence === null;
  }
  return variants.some((v) => variantSatisfies(v, filter));
}

function tierResolvedPct(t: KeyTierProgressGen): number {
  return t.total > 0 ? (t.resolved / t.total) * 100 : 0;
}

export function matchesKeys(row: CatalogRow, filter: KeysFilter): boolean {
  if (filter.tiers.length === 0 && filter.minResolvedPct === null) return true;
  const tiers = row.keyTierProgress;
  if (tiers.length === 0) return false;
  if (filter.tiers.length === 0) {
    if (filter.minResolvedPct === null) return true;
    return tiers.some((t) => tierResolvedPct(t) >= filter.minResolvedPct!);
  }
  const matching = tiers.filter((t) => filter.tiers.includes(t.tier));
  if (matching.length === 0) return false;
  if (filter.minResolvedPct === null) return true;
  return matching.some((t) => tierResolvedPct(t) >= filter.minResolvedPct!);
}

export function gradeBucketOf(letter: string): GradeBucket {
  const head = letter.charAt(0);
  if (head === 'A' || head === 'B' || head === 'C' || head === 'D') return head;
  return 'F';
}

export function matchesScore(row: CatalogRow, grades: readonly GradeBucket[]): boolean {
  if (grades.length === 0) return true;
  const letter = getScoreCard(row).letter;
  return grades.includes(gradeBucketOf(letter));
}

export function matchesRange(value: number, range: NumericRange): boolean {
  if (range.min !== null && value < range.min) return false;
  if (range.max !== null && value > range.max) return false;
  return true;
}

function fieldsRatio(row: CatalogRow): number {
  return row.fieldsTotal > 0 ? row.fieldsFilled / row.fieldsTotal : 0;
}

// WHY: Predicates ordered by cost-when-active, lightest first, so JS &&
// short-circuits the cheap rejections before paying for variant scans.
// matchesScore is cheap because Phase 1 cached computeScoreCard via WeakMap.
export function matchesColumnFilters(row: CatalogRow, filters: ColumnFilterState): boolean {
  return (
    matchesBrand(row, filters.brand) &&
    matchesCef(row, filters.cef) &&
    matchesRange(row.coverage, filters.coverage) &&
    matchesRange(row.confidence, filters.confidence) &&
    matchesRange(row.fieldsFilled, filters.fields) &&
    matchesScore(row, filters.score) &&
    matchesScalar(row.rdfVariants, filters.rdf) &&
    matchesScalar(row.skuVariants, filters.sku) &&
    matchesPif(row, filters.pif) &&
    matchesKeys(row, filters.keys)
  );
}

export { scoreToLetter, fieldsRatio };
