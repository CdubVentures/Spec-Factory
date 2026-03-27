import type { SerpTriageResult, PrefetchLlmCall } from '../types.ts';

export interface TriageDecisionCounts {
  keep: number;
  dropped_by_llm: number;
  hard_drop: number;
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

export interface TriageDomainBreakdown {
  keep: number;
  dropped_by_llm: number;
  hard_drop: number;
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

export declare function buildTriageDomainDecisionBreakdown(
  triage: SerpTriageResult[],
): Map<string, TriageDomainBreakdown>;
