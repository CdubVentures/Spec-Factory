/**
 * Shared selectors for scalar finder panels (variantFieldProducer family).
 *
 * Consumed by GenericScalarFinderPanel; concrete TS types bind via generic
 * parameters at the call site so each finder gets its own candidate/run shape.
 *
 * Ported from src/features/release-date-finder/selectors/rdfSelectors.ts with
 * the previously-hardcoded "Release Dates" KPI label parameterized as
 * `valueLabelPlural` so SKU/MSRP/UPC/discontinued can reuse the same engine.
 */

import type { KpiCard } from './types.ts';
import type { FinderVariantRowData } from './variantRowHelpers.ts';

interface PublisherCandidateLike {
  readonly status: string;
}

interface ScalarCandidateLike {
  readonly variant_id?: string | null;
  readonly variant_key?: string;
  readonly value?: string | null;
  readonly publisher_candidates?: readonly PublisherCandidateLike[];
}

interface ScalarFinderResultLike<TCandidate extends ScalarCandidateLike = ScalarCandidateLike> {
  readonly candidates?: readonly TCandidate[];
  readonly run_count?: number;
}

/**
 * KPI cards for any scalar finder panel.
 *
 * Card order (locked — matches RDF semantics, mirrors PIF):
 *   1. {valueLabelPlural} — count of variants whose candidate has a truthy value
 *   2. Variants            — total CEF variants (from variant registry)
 *   3. Runs                — total finder runs
 *   4. Published           — N/total fraction (variants whose candidate has at
 *                            least one publisher_candidate with status === 'resolved')
 */
export function deriveFinderKpiCards<T extends ScalarFinderResultLike>({
  result,
  totalVariants,
  valueLabelPlural,
}: {
  readonly result: T | null;
  readonly totalVariants: number;
  readonly valueLabelPlural: string;
}): KpiCard[] {
  const candidates = result?.candidates ?? [];
  const withValue = candidates.filter((c) => Boolean(c.value)).length;
  const runCount = result?.run_count ?? 0;
  const publishedCount = candidates.filter((c) => {
    const pcs = c.publisher_candidates ?? [];
    return pcs.some((p) => p.status === 'resolved');
  }).length;
  const publishedValue = totalVariants > 0 ? `${publishedCount}/${totalVariants}` : '--';
  const publishedComplete = totalVariants > 0 && publishedCount >= totalVariants;
  return [
    { label: valueLabelPlural, value: String(withValue), tone: withValue > 0 ? 'accent' : 'neutral' },
    { label: 'Variants', value: String(totalVariants), tone: totalVariants > 0 ? 'purple' : 'neutral' },
    { label: 'Runs', value: String(runCount), tone: runCount > 0 ? 'success' : 'neutral' },
    {
      label: 'Published',
      value: publishedValue,
      tone: publishedComplete ? 'success' : (publishedCount > 0 ? 'info' : 'neutral'),
    },
  ];
}

/**
 * Merge the CEF variant registry with finder candidates.
 *
 * Match precedence: variant_id wins, falls back to variant_key.
 * Result preserves CEF ordering (registry is the SSOT for variant order).
 * Variants with no candidate get `candidate: null` so the panel renders a
 * "not yet run" state.
 */
export function deriveVariantRows<TCandidate extends ScalarCandidateLike>(
  cefVariants: readonly FinderVariantRowData[],
  result: { readonly candidates?: readonly TCandidate[] } | null,
): Array<FinderVariantRowData & { candidate: TCandidate | null }> {
  const byKey = new Map<string, TCandidate>();
  for (const c of (result?.candidates ?? [])) {
    const key = c.variant_id || c.variant_key || '';
    if (!key) continue;
    byKey.set(key, c);
  }
  return cefVariants.map((v) => ({
    variant_id: v.variant_id,
    variant_key: v.variant_key,
    variant_label: v.variant_label,
    variant_type: v.variant_type,
    candidate: byKey.get(v.variant_id || v.variant_key) ?? null,
  }));
}

/** Returns runs sorted by run_number descending. Does not mutate input. */
export function sortRunsNewestFirst<TRun extends { readonly run_number: number }>(
  result: { readonly runs?: readonly TRun[] } | null,
): readonly TRun[] {
  if (!result?.runs) return [];
  return [...result.runs].sort((a, b) => b.run_number - a.run_number);
}
