// WHY: O(1) Feature Scaling — keys, types, labels, tips, and tones are
// auto-generated from the backend SSOT (src/core/config/runtimeStageDefs.js).
// Adding a new prefetch stage = add one entry in runtimeStageDefs.js + run
// codegen + add component + add selectProps entry here.

import type { ComponentType } from 'react';
import { buildStageEntry, type StageEntry } from '../shared/stageGroupContracts.ts';
import type { PreFetchPhasesResponse, PrefetchLiveSettings, PrefetchNeedSetData } from '../../types.ts';
import { PREFETCH_STAGE_KEYS, PREFETCH_STAGE_META, type PrefetchTabKey } from './prefetchStageKeys.generated.ts';
import { PrefetchNeedSetPanel } from './PrefetchNeedSetPanel.tsx';
import { PrefetchSearchProfilePanel } from './PrefetchSearchProfilePanel.tsx';
import { PrefetchBrandResolverPanel } from './PrefetchBrandResolverPanel.tsx';
import { PrefetchSearchPlannerPanel } from './PrefetchSearchPlannerPanel.tsx';
import { PrefetchQueryJourneyPanel } from './PrefetchQueryJourneyPanel.tsx';
import { PrefetchSearchResultsPanel } from './PrefetchSearchResultsPanel.tsx';
import { PrefetchSerpTriagePanel } from './PrefetchSerpTriagePanel.tsx';
import { PrefetchDomainClassifierPanel } from './PrefetchDomainClassifierPanel.tsx';

export { PREFETCH_STAGE_KEYS, type PrefetchTabKey } from './prefetchStageKeys.generated.ts';

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
    serpTriage: ctx.data?.serp_selector,
    persistScope: ctx.persistScope,
    liveSettings: ctx.liveSettings,
    idxRuntime: ctx.data?.idx_runtime?.domain_classifier,
  }),
};

// ── Component map ───────────────────────────────────────────────────
// WHY: Typed against generated PrefetchTabKey — TypeScript errors if a key is
// missing after a new stage is added to the backend SSOT.

/* eslint-disable @typescript-eslint/no-explicit-any -- Component generics erased at registry boundary */
const PREFETCH_COMPONENTS: Record<PrefetchTabKey, ComponentType<any>> = {
  needset: PrefetchNeedSetPanel,
  brand_resolver: PrefetchBrandResolverPanel,
  search_profile: PrefetchSearchProfilePanel,
  search_planner: PrefetchSearchPlannerPanel,
  query_journey: PrefetchQueryJourneyPanel,
  search_results: PrefetchSearchResultsPanel,
  serp_selector: PrefetchSerpTriagePanel,
  domain_classifier: PrefetchDomainClassifierPanel,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Contracts ──

export type PrefetchStageEntry = StageEntry<PrefetchTabKey, PrefetchPanelContext>;

// ── Registry (pipeline order derived from backend SSOT) ──

export const PREFETCH_STAGE_REGISTRY: readonly PrefetchStageEntry[] = PREFETCH_STAGE_KEYS.map((key) => {
  const { label, tip, tone } = PREFETCH_STAGE_META[key];
  return buildStageEntry<PrefetchTabKey, PrefetchPanelContext>(
    key, label, tip,
    `sf-prefetch-dot-${tone}`, `sf-prefetch-tab-idle-${tone}`, `sf-prefetch-tab-outline-${tone}`,
    PREFETCH_COMPONENTS[key], PREFETCH_SELECT_PROPS[key],
  );
});
