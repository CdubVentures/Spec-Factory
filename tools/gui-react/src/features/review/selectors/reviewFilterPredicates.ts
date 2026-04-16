import type { ProductReviewPayload } from '../../../types/review.ts';
import type { ConfidenceFilter, CoverageFilter, RunStatusFilter } from '../state/reviewFilterRegistry.ts';

export function matchesConfidenceFilter(p: ProductReviewPayload, filter: ConfidenceFilter): boolean {
  if (filter === 'all') return true;
  const c = p.metrics.confidence;
  if (filter === 'high') return c >= 0.8;
  if (filter === 'medium') return c >= 0.5 && c < 0.8;
  return c < 0.5;
}

export function matchesCoverageFilter(p: ProductReviewPayload, filter: CoverageFilter): boolean {
  if (filter === 'all') return true;
  const cov = p.metrics.coverage;
  if (filter === 'complete') return cov >= 1.0;
  if (filter === 'partial') return cov >= 0.5 && cov < 1.0;
  return cov < 0.5;
}

export function matchesRunStatusFilter(p: ProductReviewPayload, filter: RunStatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'ran') return p.metrics.has_run === true;
  return p.metrics.has_run === false;
}
