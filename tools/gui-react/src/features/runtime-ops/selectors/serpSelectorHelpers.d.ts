import type { SerpSelectorResult, PrefetchLlmCall } from '../types.ts';

export interface SerpSelectorDecisionCounts {
  keep: number;
  dropped_by_llm: number;
  hard_drop: number;
}

export interface SerpSelectorDomainCount {
  domain: string;
  count: number;
}

export interface SerpSelectorDecisionSegment {
  label: string;
  value: number;
  color: string;
}

export interface SerpSelectorDomainBreakdown {
  keep: number;
  dropped_by_llm: number;
  hard_drop: number;
}

export declare function computeSerpSelectorDecisionCounts(
  triage: SerpSelectorResult[],
): SerpSelectorDecisionCounts;

export declare function computeSerpSelectorTopDomains(
  triage: SerpSelectorResult[],
  limit: number,
): SerpSelectorDomainCount[];

export declare function computeSerpSelectorUniqueDomains(
  triage: SerpSelectorResult[],
): number;

export declare function buildSerpSelectorDecisionSegments(
  counts: SerpSelectorDecisionCounts,
): SerpSelectorDecisionSegment[];

export declare function buildSerpSelectorFunnelBullets(
  triage: SerpSelectorResult[],
  calls: PrefetchLlmCall[],
): string[];

export declare function buildSerpSelectorDomainDecisionBreakdown(
  triage: SerpSelectorResult[],
): Map<string, SerpSelectorDomainBreakdown>;
