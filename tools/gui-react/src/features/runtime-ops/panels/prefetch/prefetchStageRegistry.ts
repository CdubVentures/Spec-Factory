// WHY: O(1) Feature Scaling — single source of truth for all prefetch stage
// keys, data selectors, metadata, and component references. Adding a new
// prefetch stage = add one key + one selectProps entry + one buildStageEntry
// call here, then create the panel component file.

import { createElement } from 'react';
import { buildStageEntry, type StageEntry } from '../shared/stageGroupContracts.ts';
import type { PreFetchPhasesResponse, PrefetchLiveSettings, PrefetchNeedSetData } from '../../types.ts';
import { PrefetchNeedSetPanel } from './PrefetchNeedSetPanel.tsx';
import { PrefetchSearchProfilePanel } from './PrefetchSearchProfilePanel.tsx';
import { PrefetchBrandResolverPanel } from './PrefetchBrandResolverPanel.tsx';
import { PrefetchSearchPlannerPanel } from './PrefetchSearchPlannerPanel.tsx';
import { PrefetchQueryJourneyPanel } from './PrefetchQueryJourneyPanel.tsx';
import { PrefetchSearchResultsPanel } from './PrefetchSearchResultsPanel.tsx';
import { PrefetchSerpTriagePanel } from './PrefetchSerpTriagePanel.tsx';
import { PrefetchDomainClassifierPanel } from './PrefetchDomainClassifierPanel.tsx';

// ── Keys ────────────────────────────────────────────────────────────
// WHY: Single source of truth for prefetch stage keys and the derived union
// type. The one .js consumer (prefetchTabBusyHelpers.js) maintains its own
// copy for node --test compatibility.

export const PREFETCH_STAGE_KEYS = [
  'needset',
  'brand_resolver',
  'search_profile',
  'search_planner',
  'query_journey',
  'search_results',
  'serp_selector',
  'domain_classifier',
] as const;

export type PrefetchTabKey = typeof PREFETCH_STAGE_KEYS[number];

// ── Data selectors ──────────────────────────────────────────────────
// WHY: Pure data selectors — no React usage. Each function extracts the exact
// props a panel component needs from the PreFetchPhasesResponse.

export interface PrefetchPanelContext {
  data: PreFetchPhasesResponse | undefined;
  persistScope: string;
  liveSettings: PrefetchLiveSettings | undefined;
  runId?: string;
}

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

// ── Contracts ──

export type PrefetchStageEntry = StageEntry<PrefetchTabKey, PrefetchPanelContext>;

// ── Registry (pipeline order: 01-08) ──

export const PREFETCH_STAGE_REGISTRY: readonly PrefetchStageEntry[] = [
  buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    'needset', 'NeedSet',
    'Shows which product fields still need data and why.\nEvery field gets a score based on how urgently it needs evidence \u2014 the higher the score, the more important it is to find.',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    PrefetchNeedSetPanel, PREFETCH_SELECT_PROPS.needset,
  ),
  buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    'brand_resolver', 'Brand Resolver',
    'Identifies the official website for this brand.\nUsed to build targeted search queries like "site:razer.com" so the system prioritizes manufacturer pages first.',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    PrefetchBrandResolverPanel, PREFETCH_SELECT_PROPS.brand_resolver,
  ),
  buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    'search_profile', 'Search Profile',
    'The search plan \u2014 all the queries the system will send to search engines.\nBuilt from the product name, missing fields, and the brand\'s official domain.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    PrefetchSearchProfilePanel, PREFETCH_SELECT_PROPS.search_profile,
  ),
  buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    'search_planner', 'Search Planner',
    'An AI that reviews the search plan and suggests additional queries.\nFocuses on hard-to-find fields that the standard templates might miss.',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    PrefetchSearchPlannerPanel, PREFETCH_SELECT_PROPS.search_planner,
  ),
  buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    'query_journey', 'Query Journey',
    'Story view for query selection and execution.\nShows what was planned first, what was sent, and why each query was selected.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    PrefetchQueryJourneyPanel, PREFETCH_SELECT_PROPS.query_journey,
  ),
  buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    'search_results', 'Search Results',
    'Raw results returned by configured providers for each query.\nSupports Google, Bing, SearXNG, and Dual mode, including provider usage counts.',
    'sf-prefetch-dot-accent', 'sf-prefetch-tab-idle-accent', 'sf-prefetch-tab-outline-accent',
    PrefetchSearchResultsPanel, PREFETCH_SELECT_PROPS.search_results,
  ),
  buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    'serp_selector', 'SERP Selector',
    'LLM-based URL selector that decides which search results are worth fetching.\nClassifies each URL as approved (fetch now), candidate (backup), or reject (skip).',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    PrefetchSerpTriagePanel, PREFETCH_SELECT_PROPS.serp_selector,
  ),
  buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    'domain_classifier', 'Domain Classifier',
    'Checks whether each website is safe and useful to fetch.\nClassifies domains by role (manufacturer, review site, retailer) and routes them to queues.\nUses deterministic heuristics \u2014 no LLM call.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    PrefetchDomainClassifierPanel, PREFETCH_SELECT_PROPS.domain_classifier,
  ),
];
