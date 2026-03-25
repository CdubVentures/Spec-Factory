// WHY: Single source of truth for runtime stage definitions (prefetch + fetch + extraction).
// GUI codegen (tools/gui-react/scripts/generateRuntimeStageKeys.js) reads this
// to generate TypeScript key arrays, types, and metadata — zero manual frontend duplication.
// Adding a new stage = add one entry here + run codegen + create panel component.

export const PREFETCH_STAGE_DEFS = Object.freeze([
  { key: 'needset',           label: 'NeedSet',           tip: 'Shows which product fields still need data and why.\nEvery field gets a score based on how urgently it needs evidence \u2014 the higher the score, the more important it is to find.', tone: 'warning' },
  { key: 'brand_resolver',    label: 'Brand Resolver',    tip: 'Identifies the official website for this brand.\nUsed to build targeted search queries like "site:razer.com" so the system prioritizes manufacturer pages first.', tone: 'warning' },
  { key: 'search_profile',    label: 'Search Profile',    tip: 'The search plan \u2014 all the queries the system will send to search engines.\nBuilt from the product name, missing fields, and the brand\'s official domain.', tone: 'info' },
  { key: 'search_planner',    label: 'Search Planner',    tip: 'An AI that reviews the search plan and suggests additional queries.\nFocuses on hard-to-find fields that the standard templates might miss.', tone: 'warning' },
  { key: 'query_journey',     label: 'Query Journey',     tip: 'Story view for query selection and execution.\nShows what was planned first, what was sent, and why each query was selected.', tone: 'info' },
  { key: 'search_results',    label: 'Search Results',    tip: 'Raw results returned by configured providers for each query.\nSupports Google, Bing, SearXNG, and Dual mode, including provider usage counts.', tone: 'accent' },
  { key: 'serp_selector',     label: 'SERP Selector',     tip: 'LLM-based URL selector that decides which search results are worth fetching.\nClassifies each URL as approved (fetch now), candidate (backup), or reject (skip).', tone: 'warning' },
  { key: 'domain_classifier', label: 'Domain Classifier', tip: 'Checks whether each website is safe and useful to fetch.\nClassifies domains by role (manufacturer, review site, retailer) and routes them to queues.\nUses deterministic heuristics \u2014 no LLM call.', tone: 'info' },
]);

export const FETCH_STAGE_DEFS = Object.freeze([
  { key: 'stealth',       label: 'Stealth',       tip: 'Anti-detection fingerprint injection \u2014 masks webdriver flag, spoofs plugins and languages.', tone: 'info' },
  { key: 'auto_scroll',   label: 'Auto-Scroll',   tip: 'Scroll passes to trigger lazy-loaded content and reveal dynamic elements.', tone: 'info' },
  { key: 'dom_expansion', label: 'DOM Expansion',  tip: 'Click expand/show-more buttons to reveal collapsed sections and tables.', tone: 'info' },
  { key: 'css_override',  label: 'CSS Override',   tip: 'Force display:block on hidden elements for full capture (brute-force fallback).', tone: 'info' },
]);

export const EXTRACTION_STAGE_DEFS = Object.freeze([
  { key: 'screenshot', label: 'Screenshots', tip: 'Full-page and targeted selector screenshots captured from each URL.', tone: 'info' },
]);
