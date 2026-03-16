import type { PrefetchSearchResult, SearchResultDetail, SearchPlanPass, PrefetchLiveSettings } from '../types';

export interface DecisionCounts {
  keep: number;
  maybe: number;
  drop: number;
  other: number;
}

export interface DomainCount {
  domain: string;
  count: number;
}

export interface DecisionSegment {
  label: string;
  value: number;
  color: string;
}

export declare function computeDecisionCounts(
  details: SearchResultDetail[],
): DecisionCounts;

export declare function computeTopDomains(
  details: SearchResultDetail[],
  limit: number,
): DomainCount[];

export declare function computeUniqueUrls(
  details: SearchResultDetail[],
): number;

export declare function computeFilteredCount(
  details: SearchResultDetail[],
): number;

export declare function buildFunnelBullets(
  results: PrefetchSearchResult[],
  details: SearchResultDetail[],
  decisions: DecisionCounts,
): string[];

export declare function buildDecisionSegments(
  decisions: DecisionCounts,
): DecisionSegment[];

export declare function buildQueryTargetMap(
  searchPlans: SearchPlanPass[] | undefined,
): Map<string, string[]>;

export declare function queryPassName(
  query: string,
  searchPlans: SearchPlanPass[] | undefined,
): string | undefined;

export interface PerQueryStats {
  keepCount: number;
  maybeCount: number;
  dropCount: number;
  topDomain: string;
  avgRelevance: number;
}

export declare function computePerQueryStats(
  details: SearchResultDetail[],
): Map<string, PerQueryStats>;

export interface DomainDecisionBreakdown {
  keep: number;
  maybe: number;
  drop: number;
}

export declare function computeDomainDecisionBreakdown(
  details: SearchResultDetail[],
): Map<string, DomainDecisionBreakdown>;

export declare function buildEnrichedFunnelBullets(
  results: PrefetchSearchResult[],
  details: SearchResultDetail[],
  decisions: DecisionCounts,
  searchPlans: SearchPlanPass[] | undefined,
): string[];

export declare function parseDomainFromUrl(
  url: string | undefined,
): string;

export declare function enrichResultDomains(
  details: SearchResultDetail[],
): SearchResultDetail[];

export declare function extractSiteScope(
  query: string | undefined,
): string | null;

export declare function providerDisplayLabel(
  provider: string | undefined,
): string;

export interface DomainCapSummary {
  value: string;
  tooltip: string;
  profile: string;
  queryCap: number;
  discoveredCap: number;
  triageCap: number;
  uberDomainFloor: number;
}

export declare function resolveDomainCapSummary(
  liveSettings: Partial<PrefetchLiveSettings>,
): DomainCapSummary;

export declare function resolveRuntimeDomainCapSummary(
  liveSettings: Partial<PrefetchLiveSettings> | undefined,
): DomainCapSummary;
