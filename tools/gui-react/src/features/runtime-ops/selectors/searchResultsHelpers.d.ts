import type { SearchResultDetail, SearchPlanPass, PrefetchLiveSettings } from '../types.ts';

export interface SearchDecisionCounts {
  keep: number;
  maybe: number;
  drop: number;
  other: number;
}

export interface SearchDomainCount {
  domain: string;
  count: number;
}

export interface SearchDecisionSegment {
  label: string;
  value: number;
  color: string;
}

export interface SearchPerQueryStats {
  keepCount: number;
  maybeCount: number;
  dropCount: number;
  topDomain: string;
  avgRelevance: number;
}

export interface SearchDomainDecisionBreakdown {
  keep: number;
  maybe: number;
  drop: number;
}

export declare function isVideoUrl(url: string | undefined): boolean;

export declare function computeDecisionCounts(
  details: SearchResultDetail[],
): SearchDecisionCounts;

export declare function computeTopDomains(
  details: SearchResultDetail[],
  limit: number,
): SearchDomainCount[];

export declare function computeUniqueUrls(
  details: SearchResultDetail[],
): number;

export declare function computeFilteredCount(
  details: SearchResultDetail[],
): number;

export declare function buildFunnelBullets(
  results: Array<{ provider?: string; result_count: number }>,
  details: SearchResultDetail[],
  decisions: SearchDecisionCounts,
): string[];

export declare function buildDecisionSegments(
  decisions: SearchDecisionCounts,
): SearchDecisionSegment[];

export declare function buildQueryTargetMap(
  searchPlans: SearchPlanPass[] | undefined,
): Map<string, string[]>;

export declare function queryPassName(
  query: string,
  searchPlans: SearchPlanPass[] | undefined,
): string | undefined;

export declare function computePerQueryStats(
  details: SearchResultDetail[],
): Map<string, SearchPerQueryStats>;

export declare function computeDomainDecisionBreakdown(
  details: SearchResultDetail[],
): Map<string, SearchDomainDecisionBreakdown>;

export declare function buildEnrichedFunnelBullets(
  results: Array<{ provider?: string; result_count: number }>,
  details: SearchResultDetail[],
  decisions: SearchDecisionCounts,
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
  uberDomainFloor: number;
}

export declare function resolveDomainCapSummary(
  liveSettings: Partial<PrefetchLiveSettings>,
): DomainCapSummary;

export declare function resolveRuntimeDomainCapSummary(
  liveSettings: Partial<PrefetchLiveSettings> | undefined,
): DomainCapSummary;
