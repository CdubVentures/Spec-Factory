// WHY: Pure data selectors — no React imports. Testable with node --test.
// Each function extracts the exact props a panel component needs from the
// PreFetchPhasesResponse. These match the old renderPrefetchPanel switch
// statement verbatim (WorkersTab.tsx lines 266-308).

import type { PrefetchTabKey } from './prefetchStageKeys';
import type { PreFetchPhasesResponse, PrefetchLiveSettings, PrefetchNeedSetData } from '../../types';

export interface PrefetchPanelContext {
  data: PreFetchPhasesResponse | undefined;
  persistScope: string;
  liveSettings: PrefetchLiveSettings | undefined;
  runId?: string;
}

// Shared empty defaults (must match WorkersTab.tsx lines 267-268)
const EMPTY_NEEDSET: PrefetchNeedSetData = { total_fields: 0 };
const EMPTY_SEARCH_PROFILE = {
  query_count: 0,
  provider: '',
  llm_query_planning: false,
  identity_aliases: [] as string[],
  variant_guard_terms: [] as string[],
  query_rows: [] as unknown[],
  query_guard: {} as Record<string, unknown>,
};

export const PREFETCH_SELECT_PROPS: Record<PrefetchTabKey, (ctx: PrefetchPanelContext) => Record<string, unknown>> = {
  needset: (ctx) => ({
    data: ctx.data?.needset ?? EMPTY_NEEDSET,
    persistScope: ctx.persistScope,
    idxRuntime: ctx.data?.idx_runtime?.needset,
    needsetPlannerCalls: ctx.data?.llm_calls?.needset_planner,
  }),
  brand_resolver: (ctx) => ({
    calls: ctx.data?.llm_calls?.brand_resolver ?? [],
    brandResolution: ctx.data?.brand_resolution,
    persistScope: ctx.persistScope,
    liveSettings: ctx.liveSettings,
    idxRuntime: ctx.data?.idx_runtime?.brand_resolver,
  }),
  search_profile: (ctx) => ({
    data: ctx.data?.search_profile ?? EMPTY_SEARCH_PROFILE,
    persistScope: ctx.persistScope,
    liveSettings: ctx.liveSettings,
    idxRuntime: ctx.data?.idx_runtime?.search_profile,
  }),
  search_planner: (ctx) => ({
    calls: ctx.data?.llm_calls?.search_planner ?? [],
    searchPlans: ctx.data?.search_plans,
    searchResults: ctx.data?.search_results,
    liveSettings: ctx.liveSettings,
    idxRuntime: ctx.data?.idx_runtime?.search_planner,
    persistScope: ctx.persistScope,
  }),
  query_journey: (ctx) => ({
    searchProfile: ctx.data?.search_profile ?? EMPTY_SEARCH_PROFILE,
    searchPlans: ctx.data?.search_plans,
    searchResults: ctx.data?.search_results,
    searchResultDetails: ctx.data?.search_result_details,
    persistScope: ctx.persistScope,
    idxRuntime: ctx.data?.idx_runtime?.query_journey,
  }),
  search_results: (ctx) => ({
    results: ctx.data?.search_results ?? [],
    searchResultDetails: ctx.data?.search_result_details,
    searchPlans: ctx.data?.search_plans,
    crossQueryUrlCounts: ctx.data?.cross_query_url_counts,
    persistScope: ctx.persistScope,
    liveSettings: ctx.liveSettings,
    idxRuntime: ctx.data?.idx_runtime?.search_results,
    runId: ctx.runId,
  }),
  serp_selector: (ctx) => ({
    calls: ctx.data?.llm_calls?.serp_selector ?? [],
    serpTriage: ctx.data?.serp_selector,
    persistScope: ctx.persistScope,
    liveSettings: ctx.liveSettings,
    idxRuntime: ctx.data?.idx_runtime?.serp_selector,
  }),
  domain_classifier: (ctx) => ({
    calls: ctx.data?.llm_calls?.domain_classifier ?? [],
    domainHealth: ctx.data?.domain_health,
    persistScope: ctx.persistScope,
    liveSettings: ctx.liveSettings,
    idxRuntime: ctx.data?.idx_runtime?.domain_classifier,
  }),
};
