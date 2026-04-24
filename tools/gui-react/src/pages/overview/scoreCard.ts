import type { CatalogRow } from '../../types/product.ts';

export type LetterGrade =
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D+' | 'D' | 'D-'
  | 'F';

export interface ScoreBreakdown {
  readonly coverage: number;
  readonly confidence: number;
  readonly fields: number;
  readonly cef: number;
  readonly pif: number;
  readonly sku: number;
  readonly rdf: number;
}

export interface ScoreCardResult {
  readonly score: number;
  readonly letter: LetterGrade;
  readonly breakdown: ScoreBreakdown;
}

const CEF_REQUIRED_RUNS = 2;

function clamp01(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function averageBy<T>(items: readonly T[], fn: (t: T) => number): number {
  if (items.length === 0) return 0;
  let sum = 0;
  for (const item of items) sum += clamp01(fn(item));
  return sum / items.length;
}

/**
 * Weighted score (0–100) factoring every discovery axis we track per product:
 *   Coverage 25 · Confidence 20 · Fields 15 · PIF 15 · CEF 10 · SKU 7.5 · RDF 7.5
 *
 * Per-finder ratios fold across every variant, so a single missing SKU value
 * among ten variants drops the SKU contribution by ~10% of its weight.
 */
export function computeScoreCard(row: CatalogRow): ScoreCardResult {
  const coverage = clamp01(row.coverage);
  const confidence = clamp01(row.confidence);
  const fields = row.fieldsTotal > 0 ? clamp01(row.fieldsFilled / row.fieldsTotal) : 0;
  const cef = clamp01(row.cefRunCount / CEF_REQUIRED_RUNS);

  const pif = averageBy(row.pifVariants, (v) => {
    const filled = v.priority_filled + v.hero_filled + v.loop_filled;
    const target = v.priority_total + v.hero_target + v.loop_total;
    return target > 0 ? filled / target : 0;
  });

  const sku = averageBy(row.skuVariants, (v) => (v.value && v.confidence > 0 ? 1 : 0));
  const rdf = averageBy(row.rdfVariants, (v) => (v.value && v.confidence > 0 ? 1 : 0));

  const score =
    coverage * 25 +
    confidence * 20 +
    fields * 15 +
    cef * 10 +
    pif * 15 +
    sku * 7.5 +
    rdf * 7.5;

  return {
    score,
    letter: scoreToLetter(score),
    breakdown: { coverage, confidence, fields, cef, pif, sku, rdf },
  };
}

/**
 * School-style grade bands. 13 letters across 0–100, widest bucket at F
 * so products with genuinely nothing fall all the way to the bottom.
 */
export function scoreToLetter(score: number): LetterGrade {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}
