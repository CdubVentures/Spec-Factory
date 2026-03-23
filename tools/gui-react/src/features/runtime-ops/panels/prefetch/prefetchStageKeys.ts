// WHY: Single source of truth for prefetch stage keys and the derived union type.
// All TypeScript consumers (types.ts, registry, selectProps, PrefetchTabRow,
// WorkersTab) import from here. The one .js consumer (prefetchTabBusyHelpers.js)
// maintains its own copy for node --test compatibility.

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
