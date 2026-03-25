// AUTO-GENERATED from src/core/config/runtimeStageDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateRuntimeStageKeys.js

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

export type PrefetchTabKey = (typeof PREFETCH_STAGE_KEYS)[number];

export interface StageMeta {
  readonly label: string;
  readonly tip: string;
  readonly tone: 'info' | 'warning' | 'accent';
}

export const PREFETCH_STAGE_META: Record<PrefetchTabKey, StageMeta> = {
  'needset': { label: 'NeedSet', tip: 'Shows which product fields still need data and why.\nEvery field gets a score based on how urgently it needs evidence — the higher the score, the more important it is to find.', tone: 'warning' },
  'brand_resolver': { label: 'Brand Resolver', tip: 'Identifies the official website for this brand.\nUsed to build targeted search queries like "site:razer.com" so the system prioritizes manufacturer pages first.', tone: 'warning' },
  'search_profile': { label: 'Search Profile', tip: 'The search plan — all the queries the system will send to search engines.\nBuilt from the product name, missing fields, and the brand\'s official domain.', tone: 'info' },
  'search_planner': { label: 'Search Planner', tip: 'An AI that reviews the search plan and suggests additional queries.\nFocuses on hard-to-find fields that the standard templates might miss.', tone: 'warning' },
  'query_journey': { label: 'Query Journey', tip: 'Story view for query selection and execution.\nShows what was planned first, what was sent, and why each query was selected.', tone: 'info' },
  'search_results': { label: 'Search Results', tip: 'Raw results returned by configured providers for each query.\nSupports Google, Bing, SearXNG, and Dual mode, including provider usage counts.', tone: 'accent' },
  'serp_selector': { label: 'SERP Selector', tip: 'LLM-based URL selector that decides which search results are worth fetching.\nClassifies each URL as approved (fetch now), candidate (backup), or reject (skip).', tone: 'warning' },
  'domain_classifier': { label: 'Domain Classifier', tip: 'Checks whether each website is safe and useful to fetch.\nClassifies domains by role (manufacturer, review site, retailer) and routes them to queues.\nUses deterministic heuristics — no LLM call.', tone: 'info' },
};
