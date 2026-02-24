export const DEFAULT_PREFETCH_TAB_KEYS = [
  'needset',
  'search_profile',
  'brand_resolver',
  'search_planner',
  'query_journey',
  'search_results',
  'url_predictor',
  'serp_triage',
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
    || hasRows(needset.needs)
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
  return hasSearchProfileData(prefetchData) || hasSearchPlannerData(prefetchData) || hasSearchResultsData(prefetchData);
}

function hasUrlPredictorData(prefetchData) {
  return hasRows(prefetchData?.llm_calls?.url_predictor) || hasRows(prefetchData?.url_predictions?.predictions);
}

function hasSerpTriageData(prefetchData) {
  return hasRows(prefetchData?.llm_calls?.serp_triage) || hasRows(prefetchData?.serp_triage);
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
  url_predictor: hasUrlPredictorData,
  serp_triage: hasSerpTriageData,
  domain_classifier: hasDomainClassifierData,
};

export function hasPrefetchTabData(tab, prefetchData) {
  const check = PREFETCH_TAB_DATA_CHECKS[String(tab || '').trim()];
  if (typeof check !== 'function') return false;
  return Boolean(check(prefetchData));
}

export function buildBusyPrefetchTabs({
  isRunning,
  activeTab,
  prefetchData,
  tabKeys = DEFAULT_PREFETCH_TAB_KEYS,
} = {}) {
  if (!isRunning) return new Set();
  const tabs = Array.isArray(tabKeys) ? tabKeys : DEFAULT_PREFETCH_TAB_KEYS;
  return tabs.reduce((busy, tab) => {
    const selected = activeTab === tab;
    const hasData = hasPrefetchTabData(tab, prefetchData);
    if (selected || !hasData) busy.add(tab);
    return busy;
  }, new Set());
}
