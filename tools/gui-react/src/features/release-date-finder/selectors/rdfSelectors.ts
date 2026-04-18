import type { KpiCard } from '../../../shared/ui/finder/types.ts';
import type { ReleaseDateFinderResult, ReleaseDateFinderCandidate } from '../types.ts';

/**
 * KPI cards for the RDF panel header.
 *
 * Mirrors PIF order semantics: [items_found, variants, runs, published_fraction].
 *   1. Release Dates — count of variants that resolved a date
 *   2. Variants      — total variants (from CEF registry)
 *   3. Runs          — total RDF runs
 *   4. Published     — N/total fraction (variants with a published date / all variants)
 *
 * `totalVariants` is passed from the panel (it owns the CEF variant registry).
 */
export function deriveFinderKpiCards(
  result: ReleaseDateFinderResult | null,
  totalVariants: number,
): KpiCard[] {
  const candidates = result?.candidates ?? [];
  const withDate = candidates.filter((c) => c.value).length;
  const runCount = result?.run_count ?? 0;
  const publishedCount = candidates.filter((c) => {
    const pcs = c.publisher_candidates ?? [];
    return pcs.some((p) => p.status === 'resolved');
  }).length;
  const publishedValue = totalVariants > 0 ? `${publishedCount}/${totalVariants}` : '--';
  const publishedComplete = totalVariants > 0 && publishedCount >= totalVariants;
  return [
    { label: 'Release Dates', value: String(withDate), tone: withDate > 0 ? 'accent' : 'neutral' },
    { label: 'Variants', value: String(totalVariants), tone: totalVariants > 0 ? 'purple' : 'neutral' },
    { label: 'Runs', value: String(runCount), tone: runCount > 0 ? 'success' : 'neutral' },
    {
      label: 'Published',
      value: publishedValue,
      tone: publishedComplete ? 'success' : (publishedCount > 0 ? 'info' : 'neutral'),
    },
  ];
}

export interface VariantRow {
  readonly variant_id: string | null;
  readonly variant_key: string;
  readonly variant_label: string;
  readonly variant_type: 'color' | 'edition';
  readonly candidate: ReleaseDateFinderCandidate | null;
}

/**
 * Merge CEF variants with RDF candidates. Variants without an RDF candidate
 * yet show candidate: null (UI displays "Not yet run" state).
 */
export function deriveVariantRows(
  cefVariants: readonly {
    variant_id: string | null;
    variant_key: string;
    variant_label: string;
    variant_type: 'color' | 'edition';
  }[],
  result: ReleaseDateFinderResult | null,
): VariantRow[] {
  const byKey = new Map<string, ReleaseDateFinderCandidate>();
  for (const c of (result?.candidates || [])) {
    const key = c.variant_id || c.variant_key;
    byKey.set(key, c);
  }
  return cefVariants.map(v => ({
    variant_id: v.variant_id,
    variant_key: v.variant_key,
    variant_label: v.variant_label,
    variant_type: v.variant_type,
    candidate: byKey.get(v.variant_id || v.variant_key) ?? null,
  }));
}

import type { ReleaseDateFinderRun } from '../types.ts';

/** Returns runs sorted newest-first. Raw shape — panel consumes directly. */
export function sortRunsNewestFirst(result: ReleaseDateFinderResult | null): readonly ReleaseDateFinderRun[] {
  if (!result?.runs) return [];
  return [...result.runs].sort((a, b) => b.run_number - a.run_number);
}
