import type { SerpTriageResult, PrefetchLlmCall } from '../types';

export interface TriageDecisionCounts {
  keep: number;
  maybe: number;
  drop: number;
}

export interface TriageDomainCount {
  domain: string;
  count: number;
}

export interface TriageDecisionSegment {
  label: string;
  value: number;
  color: string;
}

export interface TriageDedupeStats {
  totalCandidates: number;
  uniqueUrls: number;
  deduped: number;
}

export interface TriageDomainBreakdown {
  keep: number;
  maybe: number;
  drop: number;
}

export declare function computeTriageDecisionCounts(
  triage: SerpTriageResult[],
): TriageDecisionCounts;

export declare function computeTriageTopDomains(
  triage: SerpTriageResult[],
  limit: number,
): TriageDomainCount[];

export declare function computeTriageUniqueDomains(
  triage: SerpTriageResult[],
): number;

export declare function buildTriageDecisionSegments(
  counts: TriageDecisionCounts,
): TriageDecisionSegment[];

export declare function buildTriageFunnelBullets(
  triage: SerpTriageResult[],
  calls: PrefetchLlmCall[],
): string[];

export declare function computeTriageDedupeStats(
  triage: SerpTriageResult[],
): TriageDedupeStats;

export declare function buildTriageDomainDecisionBreakdown(
  triage: SerpTriageResult[],
): Map<string, TriageDomainBreakdown>;
