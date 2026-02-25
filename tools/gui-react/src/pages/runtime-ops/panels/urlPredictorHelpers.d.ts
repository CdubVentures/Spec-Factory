import type { UrlPrediction } from '../types';

export interface PredictionDecisionCounts {
  fetch: number;
  later: number;
  skip: number;
}

export interface PredictionDomainCount {
  domain: string;
  count: number;
}

export interface PredictionDecisionSegment {
  label: string;
  value: number;
  color: string;
}

export interface CoverageMatrixRow {
  url: string;
  domain: string;
  cells: Record<string, number>;
}

export interface FieldCoverageMatrix {
  fields: string[];
  rows: CoverageMatrixRow[];
}

export declare function computePredictionDecisionCounts(
  predictions: UrlPrediction[],
): PredictionDecisionCounts;

export declare function computeTopPredictionDomains(
  predictions: UrlPrediction[],
  limit: number,
): PredictionDomainCount[];

export declare function computeUniquePredictionDomains(
  predictions: UrlPrediction[],
): number;

export declare function buildPredictionDecisionSegments(
  counts: PredictionDecisionCounts,
): PredictionDecisionSegment[];

export declare function computeFieldCoverageMatrix(
  predictions: UrlPrediction[],
): FieldCoverageMatrix;

export declare function computeAveragePayoff(
  predictions: UrlPrediction[],
): number;

export declare function computeRiskFlagDistribution(
  predictions: UrlPrediction[],
): Record<string, number>;

export declare function buildPredictorFunnelBullets(
  predictions: UrlPrediction[],
  remainingBudget: number,
): string[];
