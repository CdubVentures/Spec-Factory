// WHY: Order matches the strict 8-stage sequential pipeline.
// Canonical keys live in prefetchStageKeys.ts (TypeScript SSOT).
// This .js copy exists for node --test compatibility.
export const DEFAULT_PREFETCH_TAB_KEYS = [
  'needset',
  'brand_resolver',
  'search_profile',
  'search_planner',
  'query_journey',
  'search_results',
  'serp_selector',
  'domain_classifier',
];

function hasRows(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasText(value) {
  return String(value || '').trim().length > 0;
}

function hasNeedsetData(prefetchData) {
  const needset = prefetchData?.needset;
  if (!needset || typeof needset !== 'object') return false;
  return (
    Number(needset.needset_size || 0) > 0
    || Number(needset.total_fields || 0) > 0
    || hasRows(needset.fields)
    || hasRows(needset.snapshots)
  );
}

function hasSearchProfileData(prefetchData) {
  const profile = prefetchData?.search_profile;
  if (!profile || typeof profile !== 'object') return false;
  return Number(profile.query_count || 0) > 0 || hasRows(profile.query_rows);
}

function hasBrandResolverData(prefetchData) {
  const calls = prefetchData?.llm_calls?.brand_resolver;
  if (hasRows(calls)) return true;
  const resolution = prefetchData?.brand_resolution;
  if (!resolution || typeof resolution !== 'object') return false;
  return (
    hasText(resolution.status)
    || hasText(resolution.brand)
    || hasText(resolution.official_domain)
    || hasRows(resolution.aliases)
    || hasRows(resolution.candidates)
  );
}

function hasSearchPlannerData(prefetchData) {
  return hasRows(prefetchData?.llm_calls?.search_planner) || hasRows(prefetchData?.search_plans);
}

function hasSearchResultsData(prefetchData) {
  return hasRows(prefetchData?.search_results) || hasRows(prefetchData?.search_result_details);
}

function hasQueryJourneyData(prefetchData) {
  // WHY: Query journey has its own data — the final selected query count
  // after merge/rank/guard. Don't delegate to other tabs; that caused
  // the bouncy ball to skip ahead to search_results prematurely.
  const journey = prefetchData?.query_journey;
  if (journey && typeof journey === 'object') {
    return Number(journey.selected_query_count || 0) > 0 || hasRows(journey.selected_queries);
  }
  // Fallback: if search_profile carries selected_queries, the journey is done
  const profile = prefetchData?.search_profile;
  if (profile && typeof profile === 'object') {
    return Number(profile.selected_query_count || 0) > 0;
  }
  return false;
}

function hasSerpSelectorData(prefetchData) {
  return hasRows(prefetchData?.llm_calls?.serp_selector) || hasRows(prefetchData?.serp_selector);
}

function hasDomainClassifierData(prefetchData) {
  return hasRows(prefetchData?.llm_calls?.domain_classifier) || hasRows(prefetchData?.domain_health);
}

const PREFETCH_TAB_DATA_CHECKS = {
  needset: hasNeedsetData,
  search_profile: hasSearchProfileData,
  brand_resolver: hasBrandResolverData,
  search_planner: hasSearchPlannerData,
  query_journey: hasQueryJourneyData,
  search_results: hasSearchResultsData,
  serp_selector: hasSerpSelectorData,
  domain_classifier: hasDomainClassifierData,
};

export function hasPrefetchTabData(tab, prefetchData) {
  const check = PREFETCH_TAB_DATA_CHECKS[String(tab || '').trim()];
  if (typeof check !== 'function') return false;
  return Boolean(check(prefetchData));
}

// WHY: Maps LLM worker call_type to the prefetch tab it belongs to.
// Bouncy ball only appears when an actual LLM call or search query is
// in-flight — not when a stage starts. Keeps it simple: no ball until
// a worker is visible.
const CALL_TYPE_TO_TAB = {
  brand_resolver: 'brand_resolver',
  needset_planner: 'needset',
  search_planner: 'search_planner',
  serp_selector: 'serp_selector',
  domain_classifier: 'domain_classifier',
};

// WHY: Maps phase_cursor values to the prefetch tab that stage belongs to.
// Used as a fallback for fast stages where the LLM call finishes before
// the GUI poll catches it running (e.g. needset completes in <2s).
const PHASE_CURSOR_TO_TAB = {
  phase_01_needset: 'needset',
  phase_02_brand_resolver: 'brand_resolver',
  phase_03_search_profile: 'search_profile',
  phase_04_search_planner: 'search_planner',
  phase_05_query_journey: 'query_journey',
};

export function buildBusyPrefetchTabs({
  isRunning,
  workers = [],
  prefetchData,
  phaseCursor,
  tabKeys = DEFAULT_PREFETCH_TAB_KEYS,
} = {}) {
  if (!isRunning) return new Set();
  const tabs = Array.isArray(tabKeys) ? tabKeys : DEFAULT_PREFETCH_TAB_KEYS;
  const busy = new Set();

  // WHY: query_journey must have data before search_results can be busy.
  // Without this gate, search workers firing early cause the bouncy ball
  // to jump from brand_resolver straight to search_results.
  const journeyComplete = prefetchData ? hasQueryJourneyData(prefetchData) : false;

  let hasQueuedSearch = false;

  for (const w of workers) {
    if (w.state !== 'running' && w.state !== 'queued') continue;
    if (w.pool === 'llm' && w.call_type) {
      const tab = CALL_TYPE_TO_TAB[w.call_type];
      if (tab && tabs.includes(tab)) busy.add(tab);
    }
    if (w.pool === 'search') {
      if (w.state === 'queued') hasQueuedSearch = true;
      // WHY: Bounce when a search worker is running OR queued (work still pending).
      // Between sequential queries (a finishes, b hasn't started), queued workers
      // keep the ball active so it doesn't flicker off between each query.
      if (tabs.includes('search_results') && journeyComplete) {
        busy.add('search_results');
      }
    }
  }

  // WHY: query_journey tab bounces while search workers are still queued —
  // results are still coming in, the journey isn't complete yet.
  if (hasQueuedSearch && tabs.includes('query_journey')) {
    busy.add('query_journey');
  }

  // WHY: Fast stages (needset, brand resolver) complete before the GUI poll
  // catches a running worker. The phase_cursor tells us what's actively running
  // — use it as a fallback so the ball always bounces for the current stage.
  if (busy.size === 0) {
    const cursorTab = PHASE_CURSOR_TO_TAB[String(phaseCursor || '').trim()];
    if (cursorTab && tabs.includes(cursorTab)) {
      busy.add(cursorTab);
    }
  }

  return busy;
}
