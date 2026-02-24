import type { IndexLabSearchProfileQueryRow, IndexLabNeedSetRow } from '../types';

export interface CoverageStats {
  totalNeeds: number;
  coveredNeeds: number;
  gapFields: string[];
  coverageScore: number;
}

export interface QueryDetailPayload {
  query: string;
  targetFields: string[];
  matchedNeeds: IndexLabNeedSetRow[];
  strategy: string;
  status: string;
  constraints: {
    doc_hint: string | null;
    domain_hint: string | null;
    alias: string | null;
  };
  resultCount: number;
  providers: string[];
}

export declare function computeCoverageStats(
  needsetRows: IndexLabNeedSetRow[],
  queryRows: IndexLabSearchProfileQueryRow[],
): CoverageStats;

export declare function deriveQueryStatus(
  queryRow: IndexLabSearchProfileQueryRow,
): 'planned' | 'sent' | 'received';

export declare function deriveStrategy(
  queryRow: IndexLabSearchProfileQueryRow,
): 'deterministic' | 'llm-planned';

export declare function deriveLlmPlannerStatus(
  searchProfile: Record<string, unknown> | null,
): boolean;

export declare function buildQueryDetailPayload(
  queryRow: IndexLabSearchProfileQueryRow,
  needsetRows: IndexLabNeedSetRow[],
): QueryDetailPayload;
