import type {
  PrefetchSearchProfileQueryRow,
  SearchPlanPass,
  PrefetchSearchResult,
  SearchResultDetail,
} from '../types.ts';

export interface QueryJourneyRow {
  query: string;
  planned: boolean;
  selected_by: string;
  selected_by_label: string;
  planner_passes: string[];
  target_fields: string[];
  hint_sources: string[];
  domain_hints: string[];
  doc_hints: string[];
  source_hosts: string[];
  reasons: string[];
  attempts: number;
  sent_count: number;
  result_count: number;
  providers: string[];
  sent_ts: string | null;
  execution_order: number | null;
  status: 'planned' | 'sent' | 'results_received' | 'observed';
  tier: string;
  group_key: string;
  normalized_key: string;
  repeat_count: number;
}

export declare function queryJourneyStatusLabel(status: string): string;
export declare function queryJourneyStatusBadgeClass(status: string): string;

export declare function buildQueryJourneyRows(args?: {
  queryRows?: PrefetchSearchProfileQueryRow[] | undefined;
  searchPlans?: SearchPlanPass[] | undefined;
  searchResults?: PrefetchSearchResult[] | undefined;
  searchResultDetails?: SearchResultDetail[] | undefined;
}): QueryJourneyRow[];
