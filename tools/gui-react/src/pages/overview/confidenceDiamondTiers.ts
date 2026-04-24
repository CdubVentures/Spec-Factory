/**
 * Confidence → tier mapping for the SKU / RDF Overview diamond cells.
 * Pure helper in a `.ts` file so it can be unit-tested without JSX runtime.
 *
 * Thresholds match keyFinder's ConfidenceRing:
 *   >=85 good  · >=60 warn  · >0 danger  · <=0 empty (dashed outline)
 */

export type ConfidenceTier = 'good' | 'warn' | 'danger' | 'empty';

export function confidenceTier(confidence: number): ConfidenceTier {
  if (!Number.isFinite(confidence) || confidence <= 0) return 'empty';
  if (confidence >= 85) return 'good';
  if (confidence >= 60) return 'warn';
  return 'danger';
}
