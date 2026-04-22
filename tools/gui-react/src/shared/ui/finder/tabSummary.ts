/**
 * Finder tab summary — shared types + pure derivations consumed by
 * IndexingTabBar in the indexing feature. Each finder exports its own
 * `useXxxTabSummary` hook that returns a FinderTabSummary. Pure derivations
 * live here so they're unit-testable under `node --test` (no React/DOM).
 */

export type FinderTabStatus = 'complete' | 'partial' | 'empty' | 'idle' | 'running';

export interface FinderTabSummary {
  readonly kpi: string;
  readonly status: FinderTabStatus;
  /** Raw count (resolved / published / succeeded). Drives the progress ring numerator. */
  readonly numerator?: number;
  /** Denominator the numerator is "of" (total variants, url target, field total). */
  readonly denominator?: number;
  /** Rounded integer 0–100 — same ratio as numerator/denominator, pre-computed so
   *  IndexingTabBar doesn't recompute and risk drift with the kpi string. */
  readonly percent?: number;
}

interface PublisherCandidateLike {
  readonly status: string;
}

interface ScalarCandidateLike {
  readonly publisher_candidates?: readonly PublisherCandidateLike[];
}

/**
 * Tab summary for any scalar finder (variantFieldProducer family — RDF, SKU,
 * MSRP, UPC, discontinued). Reuses the same "published" semantics as the
 * panel's 4th KPI tile: a candidate is published iff any of its
 * publisher_candidates has status === 'resolved'.
 */
export function deriveScalarPublishedSummary({
  candidates,
  totalVariants,
}: {
  readonly candidates: readonly ScalarCandidateLike[];
  readonly totalVariants: number;
}): FinderTabSummary {
  if (totalVariants === 0) {
    return { kpi: 'no variants', status: 'idle' };
  }
  const publishedCount = candidates.filter((c) => {
    const pcs = c.publisher_candidates ?? [];
    return pcs.some((p) => p.status === 'resolved');
  }).length;
  const status: FinderTabStatus =
    publishedCount === 0 ? 'empty' :
    publishedCount >= totalVariants ? 'complete' :
    'partial';
  return {
    kpi: `${publishedCount} / ${totalVariants} published`,
    status,
    numerator: publishedCount,
    denominator: totalVariants,
    percent: Math.round((publishedCount / totalVariants) * 100),
  };
}
