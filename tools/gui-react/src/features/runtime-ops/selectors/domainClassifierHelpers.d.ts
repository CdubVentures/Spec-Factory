import type { DomainHealthRow, PrefetchLlmCall, SerpTriageResult, TriageCandidate } from '../types.ts';

export interface SafetyClassCounts {
  safe: number;
  caution: number;
  blocked: number;
}

export interface RoleCounts {
  manufacturer: number;
  review: number;
  retail: number;
  database: number;
  unknown: number;
}

export interface SafetyClassSegment {
  label: string;
  value: number;
  color: string;
}

export interface CooldownSummary {
  totalInCooldown: number;
  maxRemainingSeconds: number;
}

export declare function computeSafetyClassCounts(
  health: DomainHealthRow[],
): SafetyClassCounts;

export declare function computeRoleCounts(
  health: DomainHealthRow[],
): RoleCounts;

export declare function computeTopProblematicDomains(
  health: DomainHealthRow[],
  limit: number,
): DomainHealthRow[];

export declare function computeUniqueDomains(
  health: DomainHealthRow[],
): number;

export declare function buildSafetyClassSegments(
  counts: SafetyClassCounts,
): SafetyClassSegment[];

export declare function buildDomainFunnelBullets(
  health: DomainHealthRow[],
  calls: PrefetchLlmCall[],
): string[];

export declare function computeCooldownSummary(
  health: DomainHealthRow[],
): CooldownSummary;

export interface FetchSummary {
  totalFetches: number;
  totalBlocks: number;
  totalTimeouts: number;
}

export declare function computeFetchSummary(
  health: DomainHealthRow[],
): FetchSummary;

export declare function groupKeptUrlsByDomain(
  serpTriage: SerpTriageResult[],
): Map<string, TriageCandidate[]>;

export interface UrlSafetyBreakdown {
  safeUrls: number;
  cautionUrls: number;
  blockedUrls: number;
  totalKeptUrls: number;
}

export declare function computeUrlSafetyBreakdown(
  urlsByDomain: Map<string, TriageCandidate[]>,
  health: DomainHealthRow[],
): UrlSafetyBreakdown;
