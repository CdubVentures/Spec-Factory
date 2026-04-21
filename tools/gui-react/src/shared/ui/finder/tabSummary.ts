/**
 * Finder tab summary — shared types + pure derivations consumed by
 * FinderTabBar in the indexing feature. Each finder exports its own
 * `useXxxTabSummary` hook that returns a FinderTabSummary. Pure derivations
 * live here so they're unit-testable under `node --test` (no React/DOM).
 */

export type FinderTabStatus = 'complete' | 'partial' | 'empty' | 'idle' | 'running';

export interface FinderTabSummary {
  readonly kpi: string;
  readonly status: FinderTabStatus;
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
  };
}
