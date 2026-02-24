import type {
  PrefetchSearchProfileQueryRow,
  SearchPlanPass,
  PrefetchSearchResult,
  SearchResultDetail,
} from '../types';

export interface QueryJourneyRow {
  query: string;
  planned: boolean;
  selected_by: 'planner' | 'deterministic';
  selected_by_label: string;
  selected_by_tooltip: string;
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
  order_metric: number;
  order_metric_label: string;
  order_justification: string;
  status: 'planned' | 'sent' | 'results_received' | 'observed';
}

export declare function queryJourneyStatusLabel(status: string): string;
export declare function queryJourneyStatusBadgeClass(status: string): string;

export declare function buildQueryJourneyRows(args?: {
  queryRows?: PrefetchSearchProfileQueryRow[] | undefined;
  searchPlans?: SearchPlanPass[] | undefined;
  searchResults?: PrefetchSearchResult[] | undefined;
  searchResultDetails?: SearchResultDetail[] | undefined;
}): QueryJourneyRow[];
