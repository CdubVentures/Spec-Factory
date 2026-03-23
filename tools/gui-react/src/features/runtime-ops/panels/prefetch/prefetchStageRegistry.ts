// WHY: O(1) Feature Scaling — single source of truth for all prefetch stage
// metadata, data selectors, and component references. Adding a new prefetch
// stage = add one entry here + create one panel component file.

import { createElement, type ReactElement } from 'react';
import { type PrefetchTabKey } from './prefetchStageKeys';
import { PREFETCH_SELECT_PROPS, type PrefetchPanelContext } from './prefetchStageSelectProps';
import { PrefetchNeedSetPanel } from './PrefetchNeedSetPanel';
import { PrefetchSearchProfilePanel } from './PrefetchSearchProfilePanel';
import { PrefetchBrandResolverPanel } from './PrefetchBrandResolverPanel';
import { PrefetchSearchPlannerPanel } from './PrefetchSearchPlannerPanel';
import { PrefetchQueryJourneyPanel } from './PrefetchQueryJourneyPanel';
import { PrefetchSearchResultsPanel } from './PrefetchSearchResultsPanel';
import { PrefetchSerpTriagePanel } from './PrefetchSerpTriagePanel';
import { PrefetchDomainClassifierPanel } from './PrefetchDomainClassifierPanel';

// Re-export for consumers
export { PREFETCH_STAGE_KEYS, type PrefetchTabKey } from './prefetchStageKeys';
export { PREFETCH_SELECT_PROPS, type PrefetchPanelContext } from './prefetchStageSelectProps';

// ── Contracts ──

export interface PrefetchStageEntry {
  readonly key: PrefetchTabKey;
  readonly label: string;
  readonly tip: string;
  readonly markerClass: string;
  readonly idleClass: string;
  readonly outlineClass: string;
  readonly render: (ctx: PrefetchPanelContext) => ReactElement | null;
  readonly selectProps: (ctx: PrefetchPanelContext) => Record<string, unknown>;
}

// ── Registry (pipeline order: 01-08) ──

/* eslint-disable @typescript-eslint/no-explicit-any -- Component generics erased at registry boundary via render() */
function entry(
  key: PrefetchTabKey,
  label: string,
  tip: string,
  markerClass: string,
  idleClass: string,
  outlineClass: string,
  Component: React.ComponentType<any>,
): PrefetchStageEntry {
  const selectProps = PREFETCH_SELECT_PROPS[key];
  return {
    key, label, tip, markerClass, idleClass, outlineClass, selectProps,
    render: (ctx) => createElement(Component, selectProps(ctx)),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const PREFETCH_STAGE_REGISTRY: readonly PrefetchStageEntry[] = [
  entry(
    'needset', 'NeedSet',
    'Shows which product fields still need data and why.\nEvery field gets a score based on how urgently it needs evidence \u2014 the higher the score, the more important it is to find.',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    PrefetchNeedSetPanel,
  ),
  entry(
    'brand_resolver', 'Brand Resolver',
    'Identifies the official website for this brand.\nUsed to build targeted search queries like "site:razer.com" so the system prioritizes manufacturer pages first.',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    PrefetchBrandResolverPanel,
  ),
  entry(
    'search_profile', 'Search Profile',
    'The search plan \u2014 all the queries the system will send to search engines.\nBuilt from the product name, missing fields, and the brand\'s official domain.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    PrefetchSearchProfilePanel,
  ),
  entry(
    'search_planner', 'Search Planner',
    'An AI that reviews the search plan and suggests additional queries.\nFocuses on hard-to-find fields that the standard templates might miss.',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    PrefetchSearchPlannerPanel,
  ),
  entry(
    'query_journey', 'Query Journey',
    'Story view for query selection and execution.\nShows what was planned first, what was sent, and why each query was selected.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    PrefetchQueryJourneyPanel,
  ),
  entry(
    'search_results', 'Search Results',
    'Raw results returned by configured providers for each query.\nSupports Google, Bing, SearXNG, and Dual mode, including provider usage counts.',
    'sf-prefetch-dot-accent', 'sf-prefetch-tab-idle-accent', 'sf-prefetch-tab-outline-accent',
    PrefetchSearchResultsPanel,
  ),
  entry(
    'serp_selector', 'SERP Selector',
    'LLM-based URL selector that decides which search results are worth fetching.\nClassifies each URL as approved (fetch now), candidate (backup), or reject (skip).',
    'sf-prefetch-dot-warning', 'sf-prefetch-tab-idle-warning', 'sf-prefetch-tab-outline-warning',
    PrefetchSerpTriagePanel,
  ),
  entry(
    'domain_classifier', 'Domain Classifier',
    'Checks whether each website is safe and useful to fetch.\nClassifies domains by role (manufacturer, review site, retailer) and routes them to queues.\nUses deterministic heuristics \u2014 no LLM call.',
    'sf-prefetch-dot-info', 'sf-prefetch-tab-idle-info', 'sf-prefetch-tab-outline-info',
    PrefetchDomainClassifierPanel,
  ),
];
